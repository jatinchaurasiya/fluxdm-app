import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cron = require('node-cron');
import axios from 'axios';
import db from '../database/db';

const API_VERSION = 'v18.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

// Interfaces
interface ScheduledPost {
    id: number;
    file_path: string; // Must be a Public URL for Video Publishing (Meta Limitation)
    caption: string;
    linked_flow_id: string | null;
}

// ------------------------------------------------------------------
// 🛠️ META API HELPERS
// ------------------------------------------------------------------

async function createContainer(userId: string, videoUrl: string, caption: string, token: string) {
    try {
        // Step 1: Create Container (REELS)
        // Meta requires 'video_url' to be public. Localhost paths won't work without tunneling.
        const res = await axios.post(`${BASE_URL}/${userId}/media?media_type=REELS&video_url=${encodeURIComponent(videoUrl)}&caption=${encodeURIComponent(caption)}&access_token=${token}`);
        return res.data.id; // Container ID
    } catch (e: any) {
        console.error('❌ Failed to create container:', e.response?.data?.error?.message || e.message);
        return null;
    }
}

async function getContainerStatus(containerId: string, token: string): Promise<string> {
    try {
        const res = await axios.get(`${BASE_URL}/${containerId}?fields=status_code&access_token=${token}`);
        return res.data.status_code; // FINISHED, IN_PROGRESS, ERROR
    } catch (e) {
        return 'ERROR';
    }
}

async function publishContainer(userId: string, containerId: string, token: string) {
    try {
        const res = await axios.post(`${BASE_URL}/${userId}/media_publish?creation_id=${containerId}&access_token=${token}`);
        return res.data.id; // Final Media ID
    } catch (e: any) {
        console.error('❌ Failed to publish container:', e.response?.data?.error?.message);
        return null;
    }
}

// ------------------------------------------------------------------
// 🔄 JOB PROCESSOR
// ------------------------------------------------------------------

async function processJob(job: ScheduledPost, config: any) {
    const { meta_access_token, instagram_business_id } = config;


    // 1. Create
    const containerId = await createContainer(instagram_business_id, job.file_path, job.caption, meta_access_token);
    if (!containerId) {
        db.prepare("UPDATE scheduled_posts SET status = 'FAILED' WHERE id = ?").run(job.id);
        return;
    }

    // 2. Poll Status (Wait for processing)
    // Simple verification loop
    let attempts = 0;
    while (attempts < 10) {
        await new Promise(r => setTimeout(r, 5000)); // Wait 5s
        const status = await getContainerStatus(containerId, meta_access_token);


        if (status === 'FINISHED') break;
        if (status === 'ERROR' || status === 'EXPIRED') {
            db.prepare("UPDATE scheduled_posts SET status = 'FAILED' WHERE id = ?").run(job.id);
            return;
        }
        attempts++;
    }

    // 3. Publish
    const mediaId = await publishContainer(instagram_business_id, containerId, meta_access_token);

    if (mediaId) {


        // Update Job Status
        db.prepare("UPDATE scheduled_posts SET status = 'PUBLISHED' WHERE id = ?").run(job.id);

        // 4. Link Automation Flow (CRUCIAL)
        if (job.linked_flow_id) {

            db.prepare(`
                UPDATE automation_flows 
                SET attached_media_id = ? 
                WHERE id = ?
            `).run(mediaId, job.linked_flow_id);
        }

    } else {
        db.prepare("UPDATE scheduled_posts SET status = 'FAILED' WHERE id = ?").run(job.id);
    }
}

// ------------------------------------------------------------------
// 🚀 MAIN WORKER
// ------------------------------------------------------------------

export async function startScheduler() {


    // Run every minute
    cron.schedule('* * * * *', async () => {
        // Note: SQLite dates are strings. Ensure format matches.
        // Assuming 'YYYY-MM-DD HH:MM:SS' or ISO.

        const pendingJobs = db.prepare(`
            SELECT * FROM scheduled_posts 
            WHERE status = 'PENDING' AND publish_at <= datetime('now')
        `).all() as ScheduledPost[];

        if (pendingJobs.length === 0) return;

        const config = db.prepare('SELECT * FROM user_config LIMIT 1').get() as any;
        if (!config?.meta_access_token) return;



        for (const job of pendingJobs) {
            // Mark as processing to avoid double pick-up if it takes > 1 min?
            // SQLite transaction or status update helps.
            // For now, relies on simple poll. If job takes > 1min, we might pick it up again.
            // FIX: Set status to 'PROCESSING' immediately.
            db.prepare("UPDATE scheduled_posts SET status = 'PROCESSING' WHERE id = ?").run(job.id);

            await processJob(job, config);
        }
    });
}
