import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cron = require('node-cron');
import axios from 'axios';
import db from '../database/db';

const API_VERSION = 'v18.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

let lastPolledTime = Math.floor(Date.now() / 1000);

// ------------------------------------------------------------------
// 🤖 JOB A: COMMENT MONITORING LOOP
// ------------------------------------------------------------------
async function runCommentLoop(config: any) {
    const token = config.access_token || config.meta_access_token;
    const pageId = config.page_id || config.instagram_business_id;

    if (!token || !pageId) return;

    try {
        // 1. Fetch Comments
        const res = await axios.get(
            `${BASE_URL}/${pageId}/media?fields=id,comments.limit(5){id,text,timestamp,media{id}}&limit=10&access_token=${token}`
        );

        const mediaItems = res.data.data || [];
        const flows = db.prepare('SELECT * FROM automation_flows WHERE is_active = 1').all() as any[];

        for (const media of mediaItems) {
            if (!media.comments) continue;

            for (const comment of media.comments.data) {
                const commentTime = new Date(comment.timestamp).getTime() / 1000;
                if (commentTime <= lastPolledTime) continue;

                // 2. Matching Logic
                const matchedFlow = flows.find(flow => {
                    const isMediaMatch = flow.attached_media_id === media.id;
                    const isKeywordMatch = flow.trigger_keyword && comment.text.toLowerCase().includes(flow.trigger_keyword.toLowerCase());

                    if (flow.attached_media_id) {
                        return isMediaMatch && isKeywordMatch;
                    }
                    return isKeywordMatch;
                });

                if (matchedFlow) {
                    // 3. Queue Action
                    const flowConfig = JSON.parse(matchedFlow.nodes_json || '{}');

                    // Determine Payload based on Flow Type
                    let messagePayload = {};

                    if (flowConfig.hook_text) {
                        // SMART FOLLOW FLOW - Hook Message
                        // Inform user to reply with keyword
                        const replyPrompt = flowConfig.verification_keyword
                            ? `\n\n(Reply "${flowConfig.verification_keyword}" when done!)`
                            : "";

                        messagePayload = {
                            text: flowConfig.hook_text + replyPrompt
                        };
                    } else {
                        // LEGACY / SIMPLE FLOW
                        messagePayload = {
                            text: flowConfig.dm_text || "Thanks for commenting!"
                        };
                    }

                    // Insert into Message Queue
                    db.prepare(`
                        INSERT INTO message_queue (recipient_id, status, payload_json, message_type, comment_id, source)
                        VALUES (?, 'PENDING', ?, 'TEXT', ?, 'COMMENT')
                    `).run(
                        comment.id, // Recipient ID (Comment ID for private_replies)
                        JSON.stringify(messagePayload),
                        comment.id
                    );
                }
            }
        }
    } catch (e: any) {
        // console.error('Comment Polling Error:', e.message);
    }
}

// ------------------------------------------------------------------
// 📨 JOB B: INBOX MONITORING LOOP (Verification Keyword)
// ------------------------------------------------------------------
async function runInboxLoop(config: any) {
    const token = config.access_token || config.meta_access_token;
    const pageId = config.page_id || config.instagram_business_id;

    if (!token || !pageId) return;

    try {
        // Fetch conversations to get messages
        // We need to find recent messages from users
        const res = await axios.get(
            `${BASE_URL}/${pageId}/conversations?platform=instagram&fields=messages.limit(5){message,from,created_time}&limit=10&access_token=${token}`
        );

        const conversations = res.data.data || [];
        const flows = db.prepare('SELECT * FROM automation_flows WHERE is_active = 1').all() as any[];

        for (const conv of conversations) {
            if (!conv.messages) continue;

            for (const msg of conv.messages.data) {
                const msgTime = new Date(msg.created_time).getTime() / 1000;
                // Only process new messages
                if (msgTime <= lastPolledTime) continue;

                // Check if message is from user (not page)
                // 'from' field usually contains id, name, email. 
                // We should strictly filter out our own messages if possible, but incoming usually implies from user in 'conversations' endpoint? 
                // Actually conversations includes both sent and received. 
                // We need to check if sender ID != pageId. (Actually pageId might be different from IG user ID).
                // Let's assume for now we perform the check.

                const messageText = msg.message;
                if (!messageText) continue;

                // Match verification keyword
                const matchedFlow = flows.find(flow => {
                    const cfg = JSON.parse(flow.nodes_json || '{}');
                    return cfg.verification_keyword && messageText.trim().toLowerCase() === cfg.verification_keyword.toLowerCase();
                });

                if (matchedFlow) {
                    const userId = msg.from.id; // User PSID/IGSID

                    // CHECK FOLLOW STATUS
                    try {
                        const followCheckRes = await axios.get(
                            `${BASE_URL}/${userId}?fields=follows_count,is_user_follow_business&access_token=${token}`
                        );

                        const isFollowing = followCheckRes.data.is_user_follow_business;
                        const flowConfig = JSON.parse(matchedFlow.nodes_json || '{}');
                        let replyText = "";

                        if (isFollowing) {
                            // SUCCESS: Send Reward

                            replyText = flowConfig.reward_text;
                            if (flowConfig.reward_link) {
                                replyText += `\n\n${flowConfig.reward_link}`;
                            }

                            // Log Success (Optional: Add to leads table or similar if exists)
                            // db.prepare("INSERT INTO leads ...").run(...) 
                        } else {
                            // FAIL: Send Gate Text

                            replyText = flowConfig.gate_text || "Please follow us first!";
                        }

                        // Queue Reply
                        db.prepare(`
                            INSERT INTO message_queue (recipient_id, status, payload_json, message_type, comment_id, source)
                            VALUES (?, 'PENDING', ?, 'TEXT', NULL, 'DM')
                        `).run(
                            userId,
                            JSON.stringify({ text: replyText })
                        );

                    } catch (err: any) {
                        console.error("Follow Check Error:", err.response?.data || err.message);
                    }
                }
            }
        }

    } catch (e: any) {
        // console.error('Inbox Polling Error:', e.message);
    }
}

// ------------------------------------------------------------------
// 🚀 JOB C: MESSAGE PROCESSOR (SEND DMS)
// ------------------------------------------------------------------
async function runMessageProcessor(config: any) {
    const queue = db.prepare(`SELECT * FROM message_queue WHERE status = 'PENDING' LIMIT 5`).all() as any[];
    if (queue.length === 0) return;

    const token = config.access_token || config.meta_access_token;

    for (const task of queue) {
        try {

            const payload = JSON.parse(task.payload_json);

            let url = '';
            let body = {};

            if (task.source === 'COMMENT') {
                // Private Reply to Comment
                url = `${BASE_URL}/${task.recipient_id}/private_replies`;
                body = { message: payload.text, access_token: token };
            } else {
                // Direct Message
                url = `${BASE_URL}/me/messages`;
                body = {
                    recipient: { id: task.recipient_id },
                    message: { text: payload.text },
                    access_token: token
                };
            }

            // Real API Call
            await axios.post(url, body);

            // Update Status
            db.prepare("UPDATE message_queue SET status = 'SENT', execute_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.id);

        } catch (error: any) {
            console.error(`❌ Message #${task.id} Failed:`, error.message);
            db.prepare("UPDATE message_queue SET status = 'FAILED', payload_json = ? WHERE id = ?")
                .run(JSON.stringify({ error: error.message }), task.id);
        }
    }
}


// ------------------------------------------------------------------
//  MAIN EXPORT
// ------------------------------------------------------------------
export function startPollingEngine() {


    // Job A & B: Automation loops (10s)
    cron.schedule('*/10 * * * * *', async () => {
        const cycleStart = Math.floor(Date.now() / 1000);

        // Get Config
        const config = db.prepare('SELECT * FROM user_config LIMIT 1').get() as any;
        if (config) {
            await runCommentLoop(config);
            await runInboxLoop(config);
            await runMessageProcessor(config);
        }

        lastPolledTime = cycleStart;
    });

    // Scheduler is now handled by @/workers/scheduler.ts
    // cron.schedule('* * * * *', async () => {
    //    await runSchedulerLoop();
    // });
}