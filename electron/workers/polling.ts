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
          const isKeywordMatch = flow.trigger_keyword && commentText.includes(flow.trigger_keyword.toLowerCase());
          return isMediaMatch && isKeywordMatch;
        });

        if (matchedFlow) {
          const flowConfig = JSON.parse(matchedFlow.nodes_json || '{}');

          let replyMessage = '';
          if (flowConfig.hook_text) {
            const prompt = flowConfig.verification_keyword ? `\n\n(Reply "${flowConfig.verification_keyword}" when done!)` : '';
            replyMessage = `${flowConfig.hook_text}${prompt}`;
          } else if (flowConfig.message) {
            replyMessage = flowConfig.message;
          } else {
            replyMessage = `Hey @${commenterUsername}! Here is the link you requested: ${flowConfig.link || 'https://fluxdm.app'}`;
          }

          // Anti-ban pacing jitter
          let delay = replyDelaySec;
          if (isSafeMode) {
            // Add 3 to 9 seconds of randomized human jitter
            delay += Math.floor(Math.random() * 7) + 3;
          }

          // Queue the Private DM Reply
          db.prepare(`
            INSERT INTO message_queue (
              account_id, recipient_id, status, payload_json, message_type, comment_id, source, execute_at
            ) VALUES (
              ?, ?, 'PENDING', ?, 'PRIVATE_REPLY', ?, 'COMMENT', datetime('now', '+' || ? || ' seconds')
            )
          `).run(
            account.id,
            commenterId || comment.id,
            JSON.stringify({ text: replyMessage, username: commenterUsername }),
            comment.id,
            delay
          );

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
          `).run(account.id, `Triggered automation "${matchedFlow.name}" for @${commenterUsername}`);
        }
      }
    }
  } catch (e: any) {
    // Suppress polling noise, log critical failures
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

  if (!token || !pageId) return;

  try {
    const res = await axios.get(
      `${BASE_URL}/${pageId}/conversations?platform=instagram&fields=messages.limit(5){message,from,created_time}&limit=10&access_token=${token}`
    );

    const conversations = res.data.data || [];
    const flows = db.prepare('SELECT * FROM automation_flows WHERE is_active = 1').all() as any[];

    for (const conv of conversations) {
      if (!conv.messages || !conv.messages.data) continue;

      for (const msg of conv.messages.data) {
        const msgTime = new Date(msg.created_time).getTime() / 1000;
        if (msgTime <= lastPolledTime) continue;

        const messageText = (msg.message || '').trim().toLowerCase();
        if (!messageText) continue;

        const matchedFlow = flows.find(flow => {
          const cfg = JSON.parse(flow.nodes_json || '{}');
          return cfg.verification_keyword && messageText === cfg.verification_keyword.toLowerCase();
        });

        if (matchedFlow) {
          const userId = msg.from?.id;
          if (!userId) continue;

          const flowConfig = JSON.parse(matchedFlow.nodes_json || '{}');
          let replyText = flowConfig.reward_text || 'Thank you for connecting!';
          if (flowConfig.reward_link) {
            replyText += `\n\n${flowConfig.reward_link}`;
          }

          db.prepare(`
            INSERT INTO message_queue (account_id, recipient_id, status, payload_json, message_type, source, execute_at)
            VALUES (?, ?, 'PENDING', ?, 'TEXT', 'INBOX_REPLY', CURRENT_TIMESTAMP)
          `).run(
            account.id,
            userId,
            JSON.stringify({ text: replyText })
          );
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
      let url = '';
      let body: any = {};

      if (task.message_type === 'PRIVATE_REPLY' && task.comment_id) {
        // Meta Graph API Private Reply to Comment
        url = `${BASE_URL}/${task.comment_id}/private_replies`;
        body = { message: payload.text, access_token: token };
      } else {
        // Instagram Direct Message
        const senderTarget = igBusinessId || 'me';
        url = `${BASE_URL}/${senderTarget}/messages`;
        body = {
          recipient: { id: task.recipient_id },
          message: { text: payload.text },
          access_token: token
        };
      }

      await axios.post(url, body);

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