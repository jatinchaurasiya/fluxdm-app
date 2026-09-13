import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cron = require('node-cron');
import axios from 'axios';
import db from '../database/db';

const API_VERSION = 'v18.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

let lastPolledTime = Math.floor(Date.now() / 1000);

/**
 * 🔑 Resolve the active Instagram Account (tokens, ids, username)
 */
function getActiveAccount(config: any) {
  let account: any = null;
  if (config.active_account_id) {
    account = db.prepare('SELECT * FROM accounts WHERE id = ? AND is_active = 1').get(config.active_account_id);
  }
  if (!account) {
    account = db.prepare('SELECT * FROM accounts WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
  }
  return account;
}

/**
 * 🔍 Check if an Instagram user follows the business account
 * Uses Meta Graph API: GET /{IGSID}?fields=name,username,is_user_follow_business
 */
async function checkUserFollowStatus(userId: string, token: string): Promise<boolean | null> {
  try {
    const res = await axios.get(`${BASE_URL}/${userId}`, {
      params: {
        fields: 'name,username,is_user_follow_business',
        access_token: token
      },
      timeout: 8000
    });
    if (typeof res.data?.is_user_follow_business === 'boolean') {
      return res.data.is_user_follow_business;
    }
    return null;
  } catch (err: any) {
    console.warn(`Could not check follower status for ${userId}:`, err.response?.data?.error?.message || err.message);
    return null;
  }
}

// ------------------------------------------------------------------
// 🤖 JOB A: COMMENT MONITORING LOOP
// ------------------------------------------------------------------
async function runCommentLoop(config: any, account: any) {
  const token = account?.access_token || config.access_token || config.meta_access_token;
  const igBusinessId = account?.instagram_business_id || config.instagram_business_id;
  const pageId = account?.page_id || config.page_id;

  if (!token || (!igBusinessId && !pageId)) return;
  if (igBusinessId && typeof igBusinessId === 'string' && igBusinessId.startsWith('fallback_')) {
    return;
  }

  const targetId = igBusinessId || pageId;

  try {
    // 1. Fetch Recent Media with Comments
    const res = await axios.get(
      `${BASE_URL}/${targetId}/media?fields=id,caption,comments.limit(15){id,text,timestamp,from{id,username},media{id}}&limit=10&access_token=${token}`
    );

    const mediaItems = res.data.data || [];
    const flows = db.prepare('SELECT * FROM automation_flows WHERE is_active = 1').all() as any[];

    // Parse safety settings
    const settings = config.settings ? JSON.parse(config.settings) : {};
    const blacklist = (settings.blacklist || '')
      .split(',')
      .map((s: string) => s.trim().toLowerCase())
      .filter(Boolean);
    const replyDelaySec = parseInt(settings.replyDelay, 10) || 0;
    const isSafeMode = Boolean(settings.safeMode);

    for (const media of mediaItems) {
      if (!media.comments || !media.comments.data) continue;

      for (const comment of media.comments.data) {
        const commentTime = new Date(comment.timestamp).getTime() / 1000;
        if (commentTime <= lastPolledTime) continue;

        const commenterUsername = comment.from?.username || '';
        const commenterId = comment.from?.id || '';
        const commentText = (comment.text || '').toLowerCase();

        // Anti-ban Blacklist Filter
        if (commenterUsername && blacklist.includes(commenterUsername.toLowerCase())) {
          continue;
        }
        if (blacklist.some((blockedWord: string) => commentText.includes(blockedWord))) {
          continue;
        }

        // 2. Flow Keyword Matching Logic
        const matchedFlow = flows.find(flow => {
          const isMediaMatch = !flow.attached_media_id || flow.attached_media_id === media.id;
          const isKeywordMatch = !flow.trigger_keyword || commentText.includes(flow.trigger_keyword.toLowerCase());
          return isMediaMatch && isKeywordMatch;
        });

        if (matchedFlow) {
          const flowConfig = JSON.parse(matchedFlow.nodes_json || '{}');
          const hookText = flowConfig.hook_text || flowConfig.message || `Hey @${commenterUsername}! Thanks so much for your interest 😊 Click below and I'll send you the link in just a sec ✨`;
          const hookBtnTitle = (flowConfig.hook_button_text || 'Send me the link').substring(0, 20);

          // Anti-ban pacing jitter
          let delay = replyDelaySec;
          if (isSafeMode) {
            delay += Math.floor(Math.random() * 7) + 3;
          }

          // Queue the Private DM Reply with Hook button
          const payload = {
            text: hookText,
            username: commenterUsername,
            buttons: [
              {
                type: 'postback',
                title: hookBtnTitle,
                payload: 'SEND_ME_LINK'
              }
            ],
            quick_replies: [
              {
                content_type: 'text',
                title: hookBtnTitle,
                payload: 'SEND_ME_LINK'
              }
            ]
          };

          db.prepare(`
            INSERT INTO message_queue (
              account_id, recipient_id, status, payload_json, message_type, comment_id, source, execute_at
            ) VALUES (
              ?, ?, 'PENDING', ?, 'PRIVATE_REPLY', ?, 'COMMENT', datetime('now', '+' || ? || ' seconds')
            )
          `).run(
            account.id,
            commenterId || comment.id,
            JSON.stringify(payload),
            comment.id,
            delay
          );

          // Update conversation_state for commenter
          if (commenterId) {
            db.prepare(`
              INSERT INTO conversation_state (user_id, account_id, state, current_flow_id, step, context_json, last_updated)
              VALUES (?, ?, 'ACTIVE', ?, 'AWAITING_HOOK_CLICK', ?, CURRENT_TIMESTAMP)
              ON CONFLICT(user_id) DO UPDATE SET
                state = 'ACTIVE',
                current_flow_id = excluded.current_flow_id,
                step = 'AWAITING_HOOK_CLICK',
                context_json = excluded.context_json,
                last_updated = CURRENT_TIMESTAMP
            `).run(
              commenterId,
              account.id,
              matchedFlow.id,
              JSON.stringify({ flowId: matchedFlow.id, username: commenterUsername, commentId: comment.id })
            );
          }

          // Capture Lead
          if (commenterUsername) {
            db.prepare(`
              INSERT INTO leads (account_id, username, source, created_at)
              VALUES (?, ?, 'Instagram Comment', CURRENT_TIMESTAMP)
            `).run(account.id, commenterUsername);
          }

          // Log event
          db.prepare(`
            INSERT INTO logs (account_id, level, message, created_at)
            VALUES (?, 'INFO', ?, CURRENT_TIMESTAMP)
          `).run(account.id, `Triggered Smart Sequence "${matchedFlow.name}" for @${commenterUsername}`);
        }
      }
    }
  } catch (e: any) {
    if (e.response?.status === 400 || e.response?.status === 401) {
      console.warn('⚠️ Instagram Polling Auth Warning:', e.response?.data?.error?.message || e.message);
    }
  }
}

// ------------------------------------------------------------------
// 📨 JOB B: INBOX MONITORING LOOP (Verification Keyword & Follow Gate)
// ------------------------------------------------------------------
async function runInboxLoop(config: any, account: any) {
  const token = account?.access_token || config.access_token || config.meta_access_token;
  const pageId = account?.page_id || config.page_id;
  const igBusinessId = account?.instagram_business_id || config.instagram_business_id;

  if (!token || (!pageId && !igBusinessId)) return;
  const targetId = pageId || igBusinessId;

  try {
    const res = await axios.get(
      `${BASE_URL}/${targetId}/conversations?platform=instagram&fields=messages.limit(5){message,from,created_time}&limit=10&access_token=${token}`
    );

    const conversations = res.data.data || [];
    const flows = db.prepare('SELECT * FROM automation_flows WHERE is_active = 1').all() as any[];

    for (const conv of conversations) {
      if (!conv.messages || !conv.messages.data) continue;

      for (const msg of conv.messages.data) {
        const msgTime = new Date(msg.created_time).getTime() / 1000;
        if (msgTime <= lastPolledTime) continue;

        const userId = msg.from?.id;
        if (!userId || userId === String(account.instagram_business_id) || userId === String(account.page_id)) {
          // Ignore outbound messages sent by bot/account itself
          continue;
        }

        const messageText = (msg.message || '').trim().toLowerCase();
        if (!messageText) continue;

        // Check active conversation state for this user
        const convState = db.prepare('SELECT * FROM conversation_state WHERE user_id = ?').get(userId) as any;

        // Find relevant flow (from conversation state or trigger keyword)
        let flow: any = null;
        if (convState?.current_flow_id) {
          flow = flows.find(f => String(f.id) === String(convState.current_flow_id));
        }
        if (!flow) {
          flow = flows.find(f => {
            const cfg = JSON.parse(f.nodes_json || '{}');
            const hookBtn = (cfg.hook_button_text || 'send me the link').toLowerCase();
            const verifyBtn = (cfg.verify_button_text || "i'm following").toLowerCase();
            return messageText.includes(hookBtn) || messageText.includes(verifyBtn) || (f.trigger_keyword && messageText.includes(f.trigger_keyword.toLowerCase()));
          });
        }

        if (!flow) continue;

        const flowConfig = JSON.parse(flow.nodes_json || '{}');
        const hookBtnText = (flowConfig.hook_button_text || 'send me the link').toLowerCase();
        const verifyBtnText = (flowConfig.verify_button_text || "i'm following").toLowerCase();
        const isFollowGated = Boolean(flowConfig.is_follow_gated);

        const profileUrl = flowConfig.profile_url || (account.username ? `https://instagram.com/${account.username}` : 'https://instagram.com');
        const visitProfileTitle = (flowConfig.visit_profile_button_text || 'Visit Profile').substring(0, 20);
        const verifyTitle = (flowConfig.verify_button_text || "I'm following ✅").substring(0, 20);

        const rewardText = flowConfig.reward_text || 'Thanks for your comment!!';
        const rewardButtonTitle = (flowConfig.reward_button_text || 'Here is Your Link!').substring(0, 20);
        const rewardLink = flowConfig.reward_link || 'https://fluxdm.space';

        // Check whether user clicked Hook button or was waiting for hook click
        const isHookTrigger = messageText.includes(hookBtnText) || messageText.includes('send me the link') || messageText.includes('link') || convState?.step === 'AWAITING_HOOK_CLICK';
        const isVerifyTrigger = messageText.includes(verifyBtnText) || messageText.includes('following') || convState?.step === 'AWAITING_FOLLOW_VERIFY';

        if (isHookTrigger || isVerifyTrigger) {
          let userIsFollowing = false;

          if (isFollowGated) {
            const check = await checkUserFollowStatus(userId, token);
            if (check !== null) {
              userIsFollowing = check;
            } else {
              // If API check is restricted in dev mode, if user clicked verify button, treat as followed
              userIsFollowing = isVerifyTrigger;
            }
          } else {
            userIsFollowing = true;
          }

          if (isFollowGated && !userIsFollowing) {
            // Send Gatekeeper Message (Oh no! It seems you're not following me...)
            const gateText = flowConfig.gate_text || "Oh no! It seems you're not following me 👀 It would really mean a lot if you visit my profile and hit the follow button 🤗.\nOnce you have done that, click on the 'I'm following' button below and you will get the link ✨.";

            const gateButtons: any[] = [
              {
                type: 'web_url',
                url: profileUrl,
                title: visitProfileTitle
              },
              {
                type: 'postback',
                title: verifyTitle,
                payload: 'VERIFY_FOLLOW'
              }
            ];

            const gateQuickReplies: any[] = [
              {
                content_type: 'text',
                title: verifyTitle,
                payload: 'VERIFY_FOLLOW'
              }
            ];

            // Queue Gatekeeper DM
            db.prepare(`
              INSERT INTO message_queue (account_id, recipient_id, status, payload_json, message_type, source, execute_at)
              VALUES (?, ?, 'PENDING', ?, 'BUTTON_TEMPLATE', 'GATEKEEPER', CURRENT_TIMESTAMP)
            `).run(
              account.id,
              userId,
              JSON.stringify({
                text: gateText,
                buttons: gateButtons,
                quick_replies: gateQuickReplies,
                profileUrl
              })
            );

            // Update conversation state
            db.prepare(`
              INSERT INTO conversation_state (user_id, account_id, state, current_flow_id, step, context_json, last_updated)
              VALUES (?, ?, 'ACTIVE', ?, 'AWAITING_FOLLOW_VERIFY', ?, CURRENT_TIMESTAMP)
              ON CONFLICT(user_id) DO UPDATE SET
                state = 'ACTIVE',
                current_flow_id = excluded.current_flow_id,
                step = 'AWAITING_FOLLOW_VERIFY',
                context_json = excluded.context_json,
                last_updated = CURRENT_TIMESTAMP
            `).run(
              userId,
              account.id,
              flow.id,
              JSON.stringify({ flowId: flow.id })
            );

            db.prepare(`
              INSERT INTO logs (account_id, level, message, created_at)
              VALUES (?, 'INFO', ?, CURRENT_TIMESTAMP)
            `).run(account.id, `Sent Follow Gatekeeper to user ${userId} for flow "${flow.name}"`);

          } else {
            // User IS following (or follow gate is disabled) -> Send Success Payload!
            let allRewardButtons: any[] = [];
            if (Array.isArray(flowConfig.reward_buttons) && flowConfig.reward_buttons.length > 0) {
              allRewardButtons = flowConfig.reward_buttons.slice(0, 5).map((btn: any) => ({
                type: 'web_url',
                url: btn.url || 'https://fluxdm.space',
                title: (btn.title || 'Here is Your Link!').substring(0, 20)
              }));
            } else {
              allRewardButtons.push({
                type: 'web_url',
                url: rewardLink,
                title: rewardButtonTitle
              });
              if (flowConfig.secondary_button_text && flowConfig.secondary_link) {
                allRewardButtons.push({
                  type: 'web_url',
                  url: flowConfig.secondary_link,
                  title: flowConfig.secondary_button_text.substring(0, 20)
                });
              }
            }

            // Meta Button Template allows up to 3 buttons per single message bubble.
            // If user has 1-3 buttons, send as 1 template. If 4-5 buttons, send first 3 in Msg 1, and remaining in Msg 2.
            if (allRewardButtons.length <= 3) {
              db.prepare(`
                INSERT INTO message_queue (account_id, recipient_id, status, payload_json, message_type, source, execute_at)
                VALUES (?, ?, 'PENDING', ?, 'BUTTON_TEMPLATE', 'PAYLOAD', CURRENT_TIMESTAMP)
              `).run(
                account.id,
                userId,
                JSON.stringify({
                  text: rewardText,
                  buttons: allRewardButtons,
                  rewardLink: allRewardButtons[0]?.url
                })
              );
            } else {
              // Message 1 (First 3 buttons)
              db.prepare(`
                INSERT INTO message_queue (account_id, recipient_id, status, payload_json, message_type, source, execute_at)
                VALUES (?, ?, 'PENDING', ?, 'BUTTON_TEMPLATE', 'PAYLOAD', CURRENT_TIMESTAMP)
              `).run(
                account.id,
                userId,
                JSON.stringify({
                  text: rewardText,
                  buttons: allRewardButtons.slice(0, 3),
                  rewardLink: allRewardButtons[0]?.url
                })
              );

              // Message 2 (Remaining 1-2 buttons, sent 1s later)
              db.prepare(`
                INSERT INTO message_queue (account_id, recipient_id, status, payload_json, message_type, source, execute_at)
                VALUES (?, ?, 'PENDING', ?, 'BUTTON_TEMPLATE', 'PAYLOAD_MORE', datetime('now', '+1 second'))
              `).run(
                account.id,
                userId,
                JSON.stringify({
                  text: "Here are additional links for you 👇",
                  buttons: allRewardButtons.slice(3, 5),
                  rewardLink: allRewardButtons[3]?.url
                })
              );
            }

            // Update conversation state to COMPLETED
            db.prepare(`
              INSERT INTO conversation_state (user_id, account_id, state, current_flow_id, step, context_json, last_updated)
              VALUES (?, ?, 'COMPLETED', ?, 'COMPLETED', ?, CURRENT_TIMESTAMP)
              ON CONFLICT(user_id) DO UPDATE SET
                state = 'COMPLETED',
                step = 'COMPLETED',
                last_updated = CURRENT_TIMESTAMP
            `).run(userId, account.id, flow.id, JSON.stringify({ flowId: flow.id }));

            db.prepare(`
              INSERT INTO logs (account_id, level, message, created_at)
              VALUES (?, 'INFO', ?, CURRENT_TIMESTAMP)
            `).run(account.id, `Delivered reward payload to verified follower ${userId} for flow "${flow.name}"`);
          }
        }
      }
    }
  } catch (e: any) {
    // Ignore routine conversation poll errors
  }
}

// ------------------------------------------------------------------
// 🚀 JOB C: MESSAGE PROCESSOR & ANTI-BAN DISPATCHER
// ------------------------------------------------------------------
async function runMessageProcessor(config: any, account: any) {
  const token = account?.access_token || config.access_token || config.meta_access_token;
  const igBusinessId = account?.instagram_business_id || config.instagram_business_id;

  if (!token) return;

  // Fetch pending messages ready for execution
  const pendingTasks = db.prepare(`
    SELECT * FROM message_queue 
    WHERE status = 'PENDING' AND execute_at <= datetime('now')
    ORDER BY id ASC LIMIT 5
  `).all() as any[];

  for (const task of pendingTasks) {
    try {
      const payload = JSON.parse(task.payload_json || '{}');
      const senderTarget = igBusinessId || 'me';

      if (task.message_type === 'PRIVATE_REPLY' && task.comment_id) {
        // Meta Graph API Private Reply to Comment
        const url = `${BASE_URL}/${task.comment_id}/private_replies`;
        const body = { message: payload.text, access_token: token };

        try {
          await axios.post(url, body);
        } catch (privateErr: any) {
          // Fallback: direct send
          const altUrl = `${BASE_URL}/${senderTarget}/messages`;
          const altBody = {
            recipient: { comment_id: task.comment_id },
            message: { text: payload.text },
            access_token: token
          };
          await axios.post(altUrl, altBody);
        }
      } else {
        // Instagram Direct Message
        const url = `${BASE_URL}/${senderTarget}/messages`;
        let body: any = {};

        // If buttons are present, use Meta Button Template
        if (payload.buttons && Array.isArray(payload.buttons) && payload.buttons.length > 0) {
          body = {
            recipient: { id: task.recipient_id },
            message: {
              attachment: {
                type: 'template',
                payload: {
                  template_type: 'button',
                  text: payload.text,
                  buttons: payload.buttons
                }
              }
            },
            access_token: token
          };
        } else if (payload.quick_replies && Array.isArray(payload.quick_replies) && payload.quick_replies.length > 0) {
          body = {
            recipient: { id: task.recipient_id },
            message: {
              text: payload.text,
              quick_replies: payload.quick_replies
            },
            access_token: token
          };
        } else {
          body = {
            recipient: { id: task.recipient_id },
            message: { text: payload.text },
            access_token: token
          };
        }

        try {
          await axios.post(url, body);
        } catch (templateErr: any) {
          console.warn('⚠️ Template delivery failed, falling back to direct text with links:', templateErr.response?.data?.error?.message || templateErr.message);

          let fallbackText = payload.text;
          if (payload.profileUrl) fallbackText += `\n\n👉 Profile: ${payload.profileUrl}`;
          if (payload.rewardLink) fallbackText += `\n\n👉 Link: ${payload.rewardLink}`;

          await axios.post(url, {
            recipient: { id: task.recipient_id },
            message: { text: fallbackText },
            access_token: token
          });
        }
      }

      db.prepare("UPDATE message_queue SET status = 'SENT', execute_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.id);

      // Humanized anti-ban pause between successive DMs (1.5 seconds)
      await new Promise(r => setTimeout(r, 1500));
    } catch (error: any) {
      console.error(`❌ Message Queue #${task.id} Failed:`, error.response?.data?.error?.message || error.message);
      const newTryCount = (task.try_count || 0) + 1;
      const newStatus = newTryCount >= 3 ? 'FAILED' : 'PENDING';
      const retryDelay = newTryCount * 60; // Exponential retry delay (60s, 120s)

      db.prepare(`
        UPDATE message_queue 
        SET status = ?, try_count = ?, execute_at = datetime('now', '+' || ? || ' seconds')
        WHERE id = ?
      `).run(newStatus, newTryCount, retryDelay, task.id);
    }
  }
}

// ------------------------------------------------------------------
// 🏁 MAIN ENGINE EXPORT
// ------------------------------------------------------------------
export function startPollingEngine() {
  console.log('⚡ FluxDM Polling Engine Initialized (10s intervals)');

  cron.schedule('*/10 * * * * *', async () => {
    const cycleStart = Math.floor(Date.now() / 1000);

    const config = db.prepare('SELECT * FROM user_config LIMIT 1').get() as any;
    if (config) {
      // Update local heartbeat
      db.prepare(`UPDATE user_config SET last_heartbeat = CURRENT_TIMESTAMP WHERE id = ?`).run(config.id);

      const account = getActiveAccount(config);
      if (account && account.access_token) {
        await runCommentLoop(config, account);
        await runInboxLoop(config, account);
        await runMessageProcessor(config, account);
      }
    }

    lastPolledTime = cycleStart;
  });
}