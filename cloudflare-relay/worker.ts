/**
 * ⚡ FluxDM 24/7 "Night-Watchman" Cloudflare Edge Worker
 * 
 * Runs on Cloudflare's 100% Free Tier (100,000 requests/day).
 * Acts as the zero-cost fallback when both the creator's laptop and mobile are asleep.
 */

export interface Env {
  FLUXDM_KV: KVNamespace; // Cloudflare KV for flow rules and offline leads
  META_VERIFY_TOKEN?: string;
  RELAY_SECRET?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. Meta Webhook Verification (GET /webhook)
    if (request.method === 'GET' && url.pathname === '/webhook') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      const expectedToken = env.META_VERIFY_TOKEN || 'fluxdm_webhook_verify_token_secure';

      if (mode === 'subscribe' && token === expectedToken) {
        console.log('✅ Meta Webhook challenge verified successfully');
        return new Response(challenge, { status: 200 });
      }
      return new Response('Forbidden', { status: 403 });
    }

    // 2. Meta Webhook Ingestion (POST /webhook)
    if (request.method === 'POST' && url.pathname === '/webhook') {
      try {
        const body: any = await request.json();

        // Immediate acknowledgment to Meta within 3 seconds
        if (body.object !== 'instagram') {
          return new Response('Not an Instagram event', { status: 200 });
        }

        const entries = body.entry || [];
        for (const entry of entries) {
          const igUserId = entry.id;

          // Check if user's local device (Laptop or Mobile) has an active heartbeat
          const heartbeat = await env.FLUXDM_KV?.get(`heartbeat:${igUserId}`);
          const isDeviceActive = heartbeat && (Date.now() - parseInt(heartbeat, 10)) < 90_000;

          if (isDeviceActive) {
            // Local device is awake and processing directly! Night-watchman yields.
            console.log(`🟢 Local device is active for ${igUserId}. Yielding webhook execution.`);
            continue;
          }

          // Fallback Night-Watchman execution
          console.log(`🌙 Night-Watchman activated for dormant account ${igUserId}`);
          const cachedFlowsRaw = await env.FLUXDM_KV?.get(`flows:${igUserId}`);
          const token = await env.FLUXDM_KV?.get(`token:${igUserId}`);

          if (!cachedFlowsRaw || !token) continue;
          const flows = JSON.parse(cachedFlowsRaw);

          // Process comments in changes
          for (const change of entry.changes || []) {
            if (change.field === 'comments') {
              const comment = change.value;
              const commentText = (comment.text || '').toLowerCase();
              const commenterId = comment.from?.id;
              const commenterUsername = comment.from?.username;

              // Match active keyword flow
              const matched = flows.find((f: any) => 
                f.is_active && 
                f.trigger_keyword && 
                commentText.includes(f.trigger_keyword.toLowerCase())
              );

              if (matched && commenterId) {
                const replyText = matched.reply_text || `Hey @${commenterUsername}! Here is your link: ${matched.link || 'https://fluxdm.app'}`;

                // Fire outbound private DM reply via Meta Graph API
                await fetch(`https://graph.facebook.com/v18.0/${comment.id}/private_replies`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    message: replyText,
                    access_token: token
                  })
                });

                // Record lead into KV queue for desktop/mobile sync on wake
                const leadData = {
                  username: commenterUsername,
                  commentText: comment.text,
                  flowName: matched.name,
                  timestamp: new Date().toISOString()
                };
                await env.FLUXDM_KV?.put(`lead:${igUserId}:${Date.now()}`, JSON.stringify(leadData), { expirationTtl: 86400 });
              }
            }
          }
        }

        return new Response('EVENT_RECEIVED', { status: 200 });
      } catch (err: any) {
        console.error('Webhook error:', err);
        return new Response('OK', { status: 200 }); // Always 200 OK to avoid Meta retrying spam
      }
    }

    // 3. Heartbeat & Rules Sync API (POST /api/sync)
    if (request.method === 'POST' && url.pathname === '/api/sync') {
      try {
        const payload: any = await request.json();
        const { igUserId, token, flows } = payload;

        if (!igUserId) {
          return new Response(JSON.stringify({ error: 'Missing igUserId' }), { status: 400 });
        }

        // Update heartbeat timestamp
        await env.FLUXDM_KV?.put(`heartbeat:${igUserId}`, Date.now().toString(), { expirationTtl: 300 });

        if (token) {
          await env.FLUXDM_KV?.put(`token:${igUserId}`, token, { expirationTtl: 60 * 86400 });
        }

        if (flows) {
          await env.FLUXDM_KV?.put(`flows:${igUserId}`, JSON.stringify(flows), { expirationTtl: 60 * 86400 });
        }

        // Return any leads captured during offline sleep
        const leadKeys = await env.FLUXDM_KV?.list({ prefix: `lead:${igUserId}:` });
        const offlineLeads: any[] = [];

        if (leadKeys && leadKeys.keys.length > 0) {
          for (const key of leadKeys.keys) {
            const data = await env.FLUXDM_KV?.get(key.name);
            if (data) {
              offlineLeads.push(JSON.parse(data));
              await env.FLUXDM_KV?.delete(key.name); // Flush after collecting
            }
          }
        }

        return new Response(JSON.stringify({ success: true, offlineLeads }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
      }
    }

    // Default Health Check
    return new Response(JSON.stringify({ service: 'FluxDM Night-Watchman Relay', status: 'operational' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
