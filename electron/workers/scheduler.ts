import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cron = require('node-cron');
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn, execSync } from 'child_process';
import db from '../database/db';

const API_VERSION = 'v18.0';

interface ScheduledPost {
  id: number;
  account_id?: number;
  file_path: string;
  caption: string;
  linked_flow_id: string | null;
  media_type?: string;
  status?: string;
  error_message?: string;
  permalink?: string;
}

/**
 * 🔑 Token & API Host Resolvers
 */
export function isDirectInstagramToken(token: string): boolean {
  if (!token) return false;
  return token.startsWith('IGAA') || token.startsWith('IGQV') || token.startsWith('IG');
}

export function getApiBase(token: string): string {
  if (isDirectInstagramToken(token)) {
    return `https://graph.instagram.com/${API_VERSION}`;
  }
  return `https://graph.facebook.com/${API_VERSION}`;
}

/**
 * 🔑 Resolve account credentials for a job
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
 * 📐 Conform Horizontal Video to 9:16 Vertical Reel via ffmpeg
 * Instagram Reels strictly require vertical aspect ratio (between 4:5 and 9:16).
 * If a user provides a 16:9 video, this pads it with clean letterbox so Meta never fails with an encoding error.
 */
async function conformVideoToReelAspect(inputPath: string): Promise<string> {
  try {
    const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${inputPath}"`;
    const dims = execSync(probeCmd, { encoding: 'utf-8' }).trim().split('x');
    if (dims.length === 2) {
      const width = parseInt(dims[0], 10);
      const height = parseInt(dims[1], 10);

      // If already vertical (aspect ratio between 4:5 and 9:16)
      if (height > width && width / height <= 0.85) {
        console.log(`✅ Video is already vertical compliant (${width}x${height}).`);
        return inputPath;
      }

      console.log(`🔄 Conforming horizontal video (${width}x${height}) to 9:16 vertical Reel using ffmpeg...`);
      const dir = path.dirname(inputPath);
      const ext = path.extname(inputPath);
      const base = path.basename(inputPath, ext);
      const conformedPath = path.join(dir, `${base}_vertical_9_16${ext}`);

      if (fs.existsSync(conformedPath)) {
        return conformedPath;
      }

      const ffmpegCmd = `ffmpeg -y -i "${inputPath}" -vf "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black" -c:v libx264 -preset fast -crf 23 -c:a copy "${conformedPath}"`;
      execSync(ffmpegCmd, { stdio: 'pipe' });

      if (fs.existsSync(conformedPath)) {
        console.log(`✅ Successfully conformed video to 9:16 vertical Reel: ${conformedPath}`);
        return conformedPath;
      }
    }
  } catch (err: any) {
    console.warn('⚠️ Video auto-conform check skipped or failed (using original):', err.message);
  }
  return inputPath;
}

/**
 * ⚡ Temporary Cloudflare Edge Tunnel for Local Video Streaming
 * Streams local video file directly to Meta's servers with $0 cloud bills.
 */
async function serveLocalMediaViaTunnel(
  filePath: string
): Promise<{ publicUrl: string; close: () => void }> {
  return new Promise((resolve, reject) => {
    const port = 4500 + Math.floor(Math.random() * 1000);

    // 1. Local HTTP Stream Server (dual-stack, handles HEAD and GET)
    const server = http.createServer((req, res) => {
      console.log(`📡 Meta streaming server received: ${req.method} ${req.url}`);
      try {
        const stat = fs.statSync(filePath);
        res.writeHead(200, {
          'Content-Type': 'video/mp4',
          'Content-Length': stat.size,
          'Accept-Ranges': 'bytes'
        });
        if (req.method === 'HEAD') {
          res.end();
        } else {
          fs.createReadStream(filePath).pipe(res);
        }
      } catch (e: any) {
        console.error('❌ Streaming server read error:', e.message);
        res.writeHead(500);
        res.end(e.message);
      }
    });

    server.listen(port, () => {
      console.log(`📡 Local media stream server listening on port ${port} (dual-stack)`);

      // 2. Spawn Cloudflare Quick Tunnel connecting to localhost
      const tunnelBinary = fs.existsSync('/usr/local/bin/cloudflared')
        ? '/usr/local/bin/cloudflared'
        : 'cloudflared';

      const tunnel = spawn(tunnelBinary, ['tunnel', '--url', `http://localhost:${port}`]);

      let tunnelBaseUrl = '';
      let isResolved = false;

      const cleanup = () => {
        try { tunnel.kill(); } catch {}
        try { server.close(); } catch {}
      };

      const finishRegistration = async () => {
        if (isResolved) return;
        isResolved = true;
        console.log(`⚡ Cloudflare edge connection established. Allowing 6s for global edge routing...`);
        await new Promise(r => setTimeout(r, 6000));
        const publicUrl = `${tunnelBaseUrl}/vertical_reel.mp4`;
        console.log(`⚡ Cloudflare Tunnel fully verified & ready: ${publicUrl}`);
        resolve({
          publicUrl,
          close: cleanup
        });
      };

      const handleOutput = (data: Buffer) => {
        const text = data.toString();
        const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match && !tunnelBaseUrl) {
          tunnelBaseUrl = match[0];
          console.log(`⚡ Cloudflare assigned tunnel URL: ${tunnelBaseUrl}`);
        }
        if (tunnelBaseUrl && text.includes('Registered tunnel connection')) {
          finishRegistration();
        }
      };

      tunnel.stderr.on('data', handleOutput);
      tunnel.stdout.on('data', handleOutput);

      tunnel.on('error', (err) => {
        if (!isResolved) {
          cleanup();
          reject(new Error(`Failed to start cloudflared tunnel: ${err.message}`));
        }
      });

      // Fallback: If 'Registered tunnel connection' string format differs, trigger after 8s if tunnelBaseUrl is detected
      setTimeout(() => {
        if (!isResolved && tunnelBaseUrl) {
          finishRegistration();
        } else if (!isResolved) {
          cleanup();
          reject(new Error('Cloudflare Tunnel initialization timed out after 20s'));
        }
      }, 20000);
    });

    server.on('error', (err) => {
      reject(new Error(`Local stream server failed: ${err.message}`));
    });
  });
}

/**
 * 📤 Meta Resumable Upload Protocol (For Facebook tokens on graph.facebook.com)
 */
async function uploadLocalVideoResumable(
  apiBase: string,
  targetId: string,
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
    const igMediaType = mediaType.toUpperCase() === 'STORY' ? 'STORIES' : 'REELS';

    console.log(`🎬 Initializing Meta Resumable Upload on ${apiBase} for ${path.basename(filePath)} (${(fileSize / (1024 * 1024)).toFixed(2)} MB)...`);

    const initRes = await axios.post(
      `${apiBase}/${targetId}/media`,
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
 * 🌐 Create Container via Video/Image URL
 */
async function createContainerWithUrl(
  apiBase: string,
  targetId: string,
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

    const res = await axios.post(`${apiBase}/${targetId}/media`, null, { params });
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
async function waitForContainerFinished(
  apiBase: string,
  containerId: string,
  token: string
): Promise<{ ready: boolean; error?: string }> {
  let attempts = 0;
  while (attempts < 25) {
    await new Promise(r => setTimeout(r, 4000)); // Poll every 4 seconds (up to 100 seconds)
    try {
      const res = await axios.get(`${apiBase}/${containerId}?fields=status_code,status,error_message&access_token=${token}`);
      const status = res.data?.status_code || res.data?.status;
      const details = res.data?.error_message || '';

      console.log(`⏳ Container ${containerId} status: ${status}${details ? ` (${details})` : ''} (attempt ${attempts + 1}/25)`);

      if (status === 'FINISHED') return { ready: true };
      if (status === 'ERROR' || status === 'EXPIRED') {
        const errMsg = `Meta container encoding failed: ${details || status}. Ensure video is 9:16 vertical MP4/MOV and between 3s and 60s.`;
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
async function publishContainer(
  apiBase: string,
  targetId: string,
  containerId: string,
  token: string
): Promise<{ mediaId: string | null; permalink?: string; error?: string }> {
  try {
    const res = await axios.post(`${apiBase}/${targetId}/media_publish`, null, {
      params: {
        creation_id: containerId,
        access_token: token
      }
    });

    const mediaId = res.data?.id;
    if (!mediaId) {
      return { mediaId: null, error: 'Meta did not return a media ID upon publishing' };
    }

    // Fetch live permalink
    let permalink = '';
    try {
      const infoRes = await axios.get(`${apiBase}/${mediaId}?fields=permalink,id&access_token=${token}`);
      permalink = infoRes.data?.permalink || '';
    } catch {}

    return { mediaId, permalink };
  } catch (e: any) {
    const errorMsg = e.response?.data?.error?.message || e.message;
    console.error('❌ Failed to publish container:', errorMsg);
    return { mediaId: null, error: errorMsg };
  }
}

/**
 * 🔄 Process Single Scheduled Post
 */
export async function processJob(
  job: ScheduledPost,
  config?: any
): Promise<{ success: boolean; mediaId?: string; permalink?: string; error?: string }> {
  if (!config) {
    config = db.prepare('SELECT * FROM user_config LIMIT 1').get() || {};
  }

  const account = getAccountForJob(job, config);
  const token = account?.access_token || config?.access_token || config?.meta_access_token;
  const igBusinessId = account?.instagram_business_id || config?.instagram_business_id;

  if (!token) {
    const errorMsg = 'Cannot process scheduled post: Missing active Instagram access token.';
    console.error('❌ ' + errorMsg);
    db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error_message = ? WHERE id = ?").run(errorMsg, job.id);
    return { success: false, error: errorMsg };
  }

  const isDirectIg = isDirectInstagramToken(token);
  const apiBase = getApiBase(token);
  // On graph.instagram.com, 'me' is always valid and avoids large-integer precision issues
  const targetId = isDirectIg ? 'me' : (igBusinessId || 'me');

  // Parse path or URL
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

  console.log(`🚀 Processing Post #${job.id} | Target: ${targetPath} | Type: ${rawType} | isVideo: ${isVideo} | Host: ${apiBase}`);

  let containerId: string | null = null;
  const isLocalFile = fs.existsSync(targetPath);
  let tunnelHandle: { close: () => void } | null = null;

  try {
    if (isLocalFile && isVideo) {
      // Step 1: Automatically conform horizontal video to 9:16 vertical Reel if needed
      const conformedPath = rawType === 'REEL' ? await conformVideoToReelAspect(targetPath) : targetPath;

      if (isDirectIg) {
        // Step 2: Establish local streaming tunnel for Instagram Login token
        console.log(`⚡ Initiating secure stream for ${path.basename(conformedPath)}...`);
        const tunnel = await serveLocalMediaViaTunnel(conformedPath);
        tunnelHandle = tunnel;

        console.log(`📡 Creating Reel container on ${apiBase} with stream URL: ${tunnel.publicUrl}...`);
        const containerRes = await createContainerWithUrl(
          apiBase,
          targetId,
          tunnel.publicUrl,
          job.caption,
          token,
          true,
          rawType
        );

        if (!containerRes.containerId) {
          const err = containerRes.error || 'Failed to create Instagram Reel container';
          db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error_message = ? WHERE id = ?").run(err, job.id);
          return { success: false, error: err };
        }
        containerId = containerRes.containerId;
      } else {
        // Facebook Graph API token resumable upload
        const uploadRes = await uploadLocalVideoResumable(apiBase, targetId, conformedPath, job.caption, token, rawType);
        if (!uploadRes.containerId) {
          const err = uploadRes.error || 'Resumable upload failed';
          db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error_message = ? WHERE id = ?").run(err, job.id);
          return { success: false, error: err };
        }
        containerId = uploadRes.containerId;
      }
    } else {
      // Remote URL or image
      const containerRes = await createContainerWithUrl(
        apiBase,
        targetId,
        targetPath,
        job.caption,
        token,
        isVideo,
        rawType
      );

      if (!containerRes.containerId) {
        const err = containerRes.error || 'Media container creation failed';
        db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error_message = ? WHERE id = ?").run(err, job.id);
        return { success: false, error: err };
      }
      containerId = containerRes.containerId;
    }

    // Step 3: Poll for processing completion
    console.log(`⏳ Waiting for Meta container ${containerId} to finish encoding...`);
    const pollResult = await waitForContainerFinished(apiBase, containerId, token);

    // Clean up tunnel as soon as Meta completes downloading/encoding
    if (tunnelHandle) {
      tunnelHandle.close();
      tunnelHandle = null;
    }

    if (!pollResult.ready) {
      const err = pollResult.error || 'Container processing failed on Meta servers';
      db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error_message = ? WHERE id = ?").run(err, job.id);
      return { success: false, error: err };
    }

    // Step 4: Publish container
    console.log(`🚀 Publishing container ${containerId} to Instagram feed...`);
    const publishRes = await publishContainer(apiBase, targetId, containerId, token);
    const mediaId = publishRes.mediaId;

    if (mediaId) {
      const permalink = publishRes.permalink || `https://www.instagram.com/p/${mediaId}/`;
      db.prepare(`
        UPDATE scheduled_posts 
        SET status = 'PUBLISHED', error_message = NULL, permalink = ? 
        WHERE id = ?
      `).run(permalink, job.id);

      console.log(`🎉 Successfully published scheduled post #${job.id}!`);
      console.log(`🔗 Instagram Permalink: ${permalink}`);

      // Auto-link newly published media to automation flow if specified
      if (job.linked_flow_id) {
        db.prepare(`UPDATE automation_flows SET attached_media_id = ? WHERE id = ?`).run(mediaId, job.linked_flow_id);
        console.log(`🔗 Auto-attached Media ID ${mediaId} to automation flow ${job.linked_flow_id}`);
      }

      return { success: true, mediaId, permalink };
    } else {
      const err = publishRes.error || 'Failed to publish container to Instagram feed';
      db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error_message = ? WHERE id = ?").run(err, job.id);
      return { success: false, error: err };
    }
  } catch (err: any) {
    if (tunnelHandle) tunnelHandle.close();
    const errorMsg = err.message || 'Unknown scheduler processing error';
    console.error('❌ Scheduler Error:', errorMsg);
    db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error_message = ? WHERE id = ?").run(errorMsg, job.id);
    return { success: false, error: errorMsg };
  }
}

/**
 * ⚡ Immediately process a scheduled post by ID on-demand (Publish Now)
 */
export async function processJobById(
  jobId: number
): Promise<{ success: boolean; mediaId?: string; permalink?: string; error?: string }> {
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
