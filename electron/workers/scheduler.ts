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
  status?: string;
  error_message?: string;
}

/**
 * 🔑 Helper to resolve account credentials for post
 */
function getAccountForJob(job: ScheduledPost, config: any) {
  let account: any = null;
  if (job.account_id) {
    account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(job.account_id);
  }
  if (!account && config?.active_account_id) {
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
async function uploadLocalVideoResumable(
  igUserId: string,
  filePath: string,
  caption: string,
  token: string,
  mediaType: string = 'REELS'
): Promise<{ containerId: string | null; error?: string }> {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Local file not found at path: ${filePath}`);
    }

    const fileStats = fs.statSync(filePath);
    const fileSize = fileStats.size;

    console.log(`🎬 Initializing Meta Resumable Upload for ${path.basename(filePath)} (${(fileSize / (1024 * 1024)).toFixed(2)} MB)...`);

    const igMediaType = mediaType.toUpperCase() === 'STORY' ? 'STORIES' : 'REELS';

    // STEP 1: Initialize Resumable Upload Session
    const initRes = await axios.post(
      `${BASE_URL}/${igUserId}/media`,
      null,
      {
        params: {
          media_type: igMediaType,
          upload_type: 'resumable',
          caption: caption || '',
          access_token: token
        }
      }
    );

    const containerId = initRes.data?.id;
    const uploadUri = initRes.data?.uri;

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
    return { containerId };
  } catch (error: any) {
    const errorDetails = error.response?.data?.error?.message || error.response?.data || error.message;
    console.error('❌ Resumable Upload Error:', errorDetails);
    return { containerId: null, error: typeof errorDetails === 'string' ? errorDetails : JSON.stringify(errorDetails) };
  }
}

/**
 * 🌐 Create Container via Web URL (Fall-back when post is hosted remotely)
 */
async function createContainerWithUrl(
  igUserId: string,
  mediaUrl: string,
  caption: string,
  token: string,
  isVideo: boolean = true,
  mediaType: string = 'REELS'
): Promise<{ containerId: string | null; error?: string }> {
  try {
    const params: any = {
      caption: caption || '',
      access_token: token
    };

    const igMediaType = mediaType.toUpperCase() === 'STORY' ? 'STORIES' : 'REELS';

    if (isVideo) {
      params.media_type = igMediaType;
      params.video_url = mediaUrl;
    } else {
      if (mediaType.toUpperCase() === 'STORY') {
        params.media_type = 'STORIES';
      }
      params.image_url = mediaUrl;
    }

    const res = await axios.post(`${BASE_URL}/${igUserId}/media`, null, { params });
    return { containerId: res.data?.id };
  } catch (e: any) {
    const errorMsg = e.response?.data?.error?.message || e.message;
    console.error('❌ Failed to create media container:', errorMsg);
    return { containerId: null, error: errorMsg };
  }
}

/**
 * ⏳ Poll Container Status until Meta encoding completes
 */
async function waitForContainerFinished(containerId: string, token: string): Promise<{ ready: boolean; error?: string }> {
  let attempts = 0;
  while (attempts < 20) {
    await new Promise(r => setTimeout(r, 5000)); // Poll every 5 seconds (up to 100 seconds)
    try {
      const res = await axios.get(`${BASE_URL}/${containerId}?fields=status_code,status&access_token=${token}`);
      const status = res.data?.status_code || res.data?.status;

      console.log(`⏳ Container ${containerId} status: ${status} (attempt ${attempts + 1}/20)`);

      if (status === 'FINISHED') return { ready: true };
      if (status === 'ERROR' || status === 'EXPIRED') {
        const errMsg = `Meta container encoding failed with status: ${status}`;
        console.error(`❌ ${errMsg}`);
        return { ready: false, error: errMsg };
      }
    } catch (e: any) {
      console.warn('⚠️ Transient status check error:', e.message);
    }
    attempts++;
  }
  return { ready: false, error: 'Container encoding timed out on Meta servers (exceeded 100s)' };
}

/**
 * 🚀 Publish Media Container to Instagram
 */
async function publishContainer(igUserId: string, containerId: string, token: string): Promise<{ mediaId: string | null; error?: string }> {
  try {
    const res = await axios.post(`${BASE_URL}/${igUserId}/media_publish`, null, {
      params: {
        creation_id: containerId,
        access_token: token
      }
    });
    return { mediaId: res.data?.id };
  } catch (e: any) {
    const errorMsg = e.response?.data?.error?.message || e.message;
    console.error('❌ Failed to publish container:', errorMsg);
    return { mediaId: null, error: errorMsg };
  }
}

/**
 * 🔄 Process Single Scheduled Post
 */
export async function processJob(job: ScheduledPost, config?: any): Promise<{ success: boolean; mediaId?: string; error?: string }> {
  if (!config) {
    config = db.prepare('SELECT * FROM user_config LIMIT 1').get() || {};
  }

  const account = getAccountForJob(job, config);
  const token = account?.access_token || config?.access_token || config?.meta_access_token;
  const igUserId = account?.instagram_business_id || config?.instagram_business_id;

  if (!token || !igUserId) {
    const errorMsg = 'Cannot process scheduled post: Missing active Instagram account or access token.';
    console.error('❌ ' + errorMsg);
    db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error_message = ? WHERE id = ?").run(errorMsg, job.id);
    return { success: false, error: errorMsg };
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

  const rawType = (job.media_type || 'REEL').toUpperCase();
  const lowerPath = (targetPath || '').toLowerCase();
  const isVideo = lowerPath.endsWith('.mp4') || lowerPath.endsWith('.mov') || lowerPath.endsWith('.m4v') || lowerPath.endsWith('.webm') ||
    ['VIDEO', 'REEL', 'REELS', 'STORY'].includes(rawType);

  console.log(`🚀 Processing Post #${job.id} | Target: ${targetPath} | Type: ${rawType} | isVideo: ${isVideo}`);

  let containerId: string | null = null;
  const isLocalFile = fs.existsSync(targetPath);

  if (isLocalFile && isVideo) {
    const uploadRes = await uploadLocalVideoResumable(igUserId, targetPath, job.caption, token, rawType);
    if (!uploadRes.containerId) {
      const err = uploadRes.error || 'Resumable upload failed';
      db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error_message = ? WHERE id = ?").run(err, job.id);
      return { success: false, error: err };
    }
    containerId = uploadRes.containerId;
  } else {
    // If not local file or is image
    const containerRes = await createContainerWithUrl(igUserId, targetPath, job.caption, token, isVideo, rawType);
    if (!containerRes.containerId) {
      const err = containerRes.error || 'Media container creation failed';
      db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error_message = ? WHERE id = ?").run(err, job.id);
      return { success: false, error: err };
    }
    containerId = containerRes.containerId;
  }

  // Poll for processing completion
  const pollResult = await waitForContainerFinished(containerId, token);
  if (!pollResult.ready) {
    const err = pollResult.error || 'Container processing failed';
    db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error_message = ? WHERE id = ?").run(err, job.id);
    return { success: false, error: err };
  }

  // Publish
  const publishRes = await publishContainer(igUserId, containerId, token);
  const mediaId = publishRes.mediaId;

  if (mediaId) {
    db.prepare("UPDATE scheduled_posts SET status = 'PUBLISHED', error_message = NULL WHERE id = ?").run(job.id);
    console.log(`🎉 Successfully published scheduled post #${job.id} (Instagram Media ID: ${mediaId})!`);

    // Auto-link newly published media to automation flow if specified
    if (job.linked_flow_id) {
      db.prepare(`UPDATE automation_flows SET attached_media_id = ? WHERE id = ?`).run(mediaId, job.linked_flow_id);
      console.log(`🔗 Auto-attached Media ID ${mediaId} to automation flow ${job.linked_flow_id}`);
    }

    return { success: true, mediaId };
  } else {
    const err = publishRes.error || 'Failed to publish container to Instagram feed';
    db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error_message = ? WHERE id = ?").run(err, job.id);
    return { success: false, error: err };
  }
}

/**
 * ⚡ Immediately process a scheduled post by ID on-demand (Publish Now)
 */
export async function processJobById(jobId: number): Promise<{ success: boolean; mediaId?: string; error?: string }> {
  try {
    const job = db.prepare('SELECT * FROM scheduled_posts WHERE id = ?').get(jobId) as ScheduledPost;
    if (!job) {
      return { success: false, error: `Post #${jobId} not found.` };
    }

    db.prepare("UPDATE scheduled_posts SET status = 'PROCESSING', error_message = NULL WHERE id = ?").run(jobId);
    return await processJob(job);
  } catch (e: any) {
    console.error('❌ processJobById error:', e);
    db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error_message = ? WHERE id = ?").run(e.message, jobId);
    return { success: false, error: e.message };
  }
}

// ------------------------------------------------------------------
// 🏁 SCHEDULER ENGINE
// ------------------------------------------------------------------
export async function startScheduler() {
  console.log('📅 FluxDM Scheduler Engine Initialized (1-minute poll cycle)');

  cron.schedule('* * * * *', async () => {
    try {
      // Query pending posts whose publish_at (in ISO UTC or standard SQLite) is <= current UTC time
      const pendingJobs = db.prepare(`
        SELECT * FROM scheduled_posts 
        WHERE status = 'PENDING' AND datetime(publish_at) <= datetime('now')
      `).all() as ScheduledPost[];

      if (!pendingJobs || pendingJobs.length === 0) return;

      console.log(`⏰ Scheduler triggered: ${pendingJobs.length} post(s) ready to publish.`);

      const config = db.prepare('SELECT * FROM user_config LIMIT 1').get() as any;

      for (const job of pendingJobs) {
        db.prepare("UPDATE scheduled_posts SET status = 'PROCESSING' WHERE id = ?").run(job.id);
        await processJob(job, config);
      }
    } catch (err) {
      console.error('❌ Scheduler cycle error:', err);
    }
  });
}
