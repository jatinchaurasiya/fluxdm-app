import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cron = require('node-cron');
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import db from '../database/db';

const API_VERSION = 'v18.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

interface ScheduledPost {
  id: number;
  account_id?: number;
  file_path: string;
  caption: string;
  linked_flow_id: string | null;
  media_type?: string;
}

/**
 * 🔑 Helper to resolve account credentials for post
 */
function getAccountForJob(job: ScheduledPost, config: any) {
  let account: any = null;
  if (job.account_id) {
    account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(job.account_id);
  }
  if (!account && config.active_account_id) {
    account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(config.active_account_id);
  }
  if (!account) {
    account = db.prepare('SELECT * FROM accounts WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
  }
  return account;
}

/**
 * 📤 Meta Resumable Upload Protocol for Local Video Files
 * Streams video chunks directly from local disk to Meta's servers with $0 cloud bills.
 */
async function uploadLocalVideoResumable(igUserId: string, filePath: string, caption: string, token: string): Promise<string | null> {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Local file not found at path: ${filePath}`);
    }

    const fileStats = fs.statSync(filePath);
    const fileSize = fileStats.size;

    console.log(`🎬 Initializing Meta Resumable Upload for ${path.basename(filePath)} (${(fileSize / (1024 * 1024)).toFixed(2)} MB)...`);

    // STEP 1: Initialize Resumable Upload Session
    const initRes = await axios.post(
      `${BASE_URL}/${igUserId}/media`,
      null,
      {
        params: {
          media_type: 'REELS',
          upload_type: 'resumable',
          caption: caption || '',
          access_token: token
        }
      }
    );

    const containerId = initRes.data.id;
    const uploadUri = initRes.data.uri;

    if (!uploadUri) {
      throw new Error('Meta did not return an upload URI for resumable transfer');
    }

    console.log(`📡 Upload URI received. Streaming file directly to Meta...`);

    // STEP 2: Stream File Bytes to Meta
    const fileStream = fs.createReadStream(filePath);

    await axios.post(uploadUri, fileStream, {
      headers: {
        Authorization: `OAuth ${token}`,
        offset: '0',
        file_size: fileSize.toString(),
        'Content-Type': 'application/octet-stream'
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    console.log('✅ File bytes successfully uploaded to Meta servers!');
    return containerId;
  } catch (error: any) {
    console.error('❌ Resumable Upload Error:', error.response?.data || error.message);
    return null;
  }
}

/**
 * 🌐 Create Container via Web URL (Fall-back when post is hosted remotely)
 */
async function createContainerWithUrl(igUserId: string, mediaUrl: string, caption: string, token: string, isVideo: boolean = true) {
  try {
    const params: any = {
      caption: caption || '',
      access_token: token
    };

    if (isVideo) {
      params.media_type = 'REELS';
      params.video_url = mediaUrl;
    } else {
      params.image_url = mediaUrl;
    }

    const res = await axios.post(`${BASE_URL}/${igUserId}/media`, null, { params });
    return res.data.id;
  } catch (e: any) {
    console.error('❌ Failed to create media container:', e.response?.data?.error?.message || e.message);
    return null;
  }
}

/**
 * ⏳ Poll Container Status until Meta encoding completes
 */
async function waitForContainerFinished(containerId: string, token: string): Promise<boolean> {
  let attempts = 0;
  while (attempts < 15) {
    await new Promise(r => setTimeout(r, 6000)); // Poll every 6 seconds
    try {
      const res = await axios.get(`${BASE_URL}/${containerId}?fields=status_code&access_token=${token}`);
      const status = res.data.status_code;

      if (status === 'FINISHED') return true;
      if (status === 'ERROR' || status === 'EXPIRED') {
        console.error(`❌ Meta container encoding failed with status: ${status}`);
        return false;
      }
    } catch {
      // transient network error, retry
    }
    attempts++;
  }
  return false;
}

/**
 * 🚀 Publish Media Container to Instagram
 */
async function publishContainer(igUserId: string, containerId: string, token: string): Promise<string | null> {
  try {
    const res = await axios.post(`${BASE_URL}/${igUserId}/media_publish`, null, {
      params: {
        creation_id: containerId,
        access_token: token
      }
    });
    return res.data.id;
  } catch (e: any) {
    console.error('❌ Failed to publish container:', e.response?.data?.error?.message || e.message);
    return null;
  }
}

/**
 * 🔄 Process Single Scheduled Post
 */
async function processJob(job: ScheduledPost, config: any) {
  const account = getAccountForJob(job, config);
  const token = account?.access_token || config.access_token || config.meta_access_token;
  const igUserId = account?.instagram_business_id || config.instagram_business_id;

  if (!token || !igUserId) {
    console.error('❌ Cannot process scheduled post: Missing access token or Instagram business ID');
    db.prepare("UPDATE scheduled_posts SET status = 'FAILED' WHERE id = ?").run(job.id);
    return;
  }

  // Parse path or url
  let targetPath = job.file_path;
  try {
    const parsed = JSON.parse(job.file_path);
    if (Array.isArray(parsed) && parsed.length > 0) targetPath = parsed[0];
    else if (typeof parsed === 'string') targetPath = parsed;
  } catch {
    targetPath = job.file_path;
  }

  let containerId: string | null = null;
  const isLocalFile = fs.existsSync(targetPath);
  const isVideo = targetPath.endsWith('.mp4') || targetPath.endsWith('.mov') || job.media_type === 'VIDEO' || job.media_type === 'REELS';

  if (isLocalFile && isVideo) {
    containerId = await uploadLocalVideoResumable(igUserId, targetPath, job.caption, token);
  } else {
    containerId = await createContainerWithUrl(igUserId, targetPath, job.caption, token, isVideo);
  }

  if (!containerId) {
    db.prepare("UPDATE scheduled_posts SET status = 'FAILED' WHERE id = ?").run(job.id);
    return;
  }

  // Poll for processing completion
  const isReady = await waitForContainerFinished(containerId, token);
  if (!isReady) {
    db.prepare("UPDATE scheduled_posts SET status = 'FAILED' WHERE id = ?").run(job.id);
    return;
  }

  // Publish
  const mediaId = await publishContainer(igUserId, containerId, token);

  if (mediaId) {
    db.prepare("UPDATE scheduled_posts SET status = 'PUBLISHED' WHERE id = ?").run(job.id);
    console.log(`🎉 Successfully published scheduled post (Media ID: ${mediaId})!`);

    // Auto-link newly published media to automation flow if specified
    if (job.linked_flow_id) {
      db.prepare(`UPDATE automation_flows SET attached_media_id = ? WHERE id = ?`).run(mediaId, job.linked_flow_id);
      console.log(`🔗 Auto-attached Media ID ${mediaId} to flow ${job.linked_flow_id}`);
    }
  } else {
    db.prepare("UPDATE scheduled_posts SET status = 'FAILED' WHERE id = ?").run(job.id);
  }
}

// ------------------------------------------------------------------
// 🏁 SCHEDULER ENGINE
// ------------------------------------------------------------------
export async function startScheduler() {
  console.log('📅 FluxDM Scheduler Initialized (1-minute intervals)');

  cron.schedule('* * * * *', async () => {
    try {
      const pendingJobs = db.prepare(`
        SELECT * FROM scheduled_posts 
        WHERE status = 'PENDING' AND publish_at <= datetime('now')
      `).all() as ScheduledPost[];

      if (pendingJobs.length === 0) return;

      const config = db.prepare('SELECT * FROM user_config LIMIT 1').get() as any;
      if (!config) return;

      for (const job of pendingJobs) {
        db.prepare("UPDATE scheduled_posts SET status = 'PROCESSING' WHERE id = ?").run(job.id);
        await processJob(job, config);
      }
    } catch (err) {
      console.error('Scheduler loop error:', err);
    }
  });
}
