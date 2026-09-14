import electron from 'electron';
const { ipcMain, shell, dialog, app, BrowserWindow } = electron;
import fs from 'node:fs';
import path from 'path';
import axios from 'axios';
import db from './database/db';
import { processJobById, isDirectInstagramToken, getApiBase } from './workers/scheduler';
import { randomUUID } from 'crypto';
import { startOAuthServer } from './auth/server';
import { 
    getDeviceHardwareId, 
    verifyLicenseSignature, 
    getActiveDeviceSeats, 
    deauthorizeSeat, 
    generatePairingCode, 
    redeemPairingCode 
} from './licensing/auth';
import { 
    createCheckoutSession, 
    verifyAndActivateSession, 
    requestPurchaseRestoreOtp, 
    verifyPurchaseRestoreOtp 
} from './licensing/dodo';

// ------------------------------------------------------------------------
// 🔐 AUTH & API HANDLERS
// ------------------------------------------------------------------------
export function registerIpcHandlers() {

    // ... (existing handlers)

    ipcMain.handle('start-oauth-flow', async (_event, optionsOrAppId?: any) => {
        try {
            console.log("🚀 Starting OAuth Flow...", optionsOrAppId);

            let mode: 'instagram' | 'facebook' = 'instagram';
            let explicitAppId: string | undefined;

            if (typeof optionsOrAppId === 'object' && optionsOrAppId !== null) {
                mode = optionsOrAppId.mode || 'instagram';
                explicitAppId = optionsOrAppId.appId;
            } else if (typeof optionsOrAppId === 'string' && optionsOrAppId) {
                if (optionsOrAppId === 'instagram' || optionsOrAppId === 'facebook') {
                    mode = optionsOrAppId;
                } else {
                    explicitAppId = optionsOrAppId;
                }
            }

            // Check for Custom Meta Keys
            const user = db.prepare('SELECT settings FROM user_config LIMIT 1').get() as any;
            const settings = user && user.settings ? JSON.parse(user.settings) : {};
            const metaConfig = settings.meta_config || {};

            const customAppId = explicitAppId || metaConfig.appId;
            const customAppSecret = metaConfig.appSecret;
            const customInstagramAppId = metaConfig.instagramAppId;
            const customInstagramAppSecret = metaConfig.instagramAppSecret;

            const token = await startOAuthServer({
                customAppId,
                customAppSecret,
                customInstagramAppId,
                customInstagramAppSecret,
                mode
            });

            // 🪟 Bring App to Foreground
            const wins = BrowserWindow.getAllWindows();
            if (wins.length > 0) {
                const win = wins[0];
                if (win.isMinimized()) win.restore();
                win.show();
                win.focus();
            }

            return { success: true, token };
        } catch (error: any) {
            console.error("❌ OAuth Error:", error);
            return { success: false, error: error.message };
        }
    });

    // Manual Token Input Handler (Login / Add Account)
    ipcMain.handle('save-manual-token', async (_event, token: string) => {
        try {
            // Fetch Account Details to get Page ID & IG ID
            const response = await axios.get(`https://graph.facebook.com/v18.0/me/accounts?fields=id,name,picture,instagram_business_account&access_token=${token}`);

            const connectedPage = response.data.data.find((p: any) => p.instagram_business_account);

            if (!connectedPage) {
                console.error("❌ No IG Business Account found on this token.");
                return { success: false, error: 'No Instagram Business Account linked to this token.' };
            }

            const pageId = connectedPage.id;
            const igId = connectedPage.instagram_business_account.id;
            const userName = connectedPage.name;
            const pic = connectedPage.picture?.data?.url || '';

            // Upsert into accounts table
            db.prepare(`
                INSERT INTO accounts (meta_user_id, instagram_business_id, page_id, access_token, username, profile_picture_url, is_active)
                VALUES (NULL, @instagram_business_id, @page_id, @access_token, @username, @profile_picture_url, 1)
                ON CONFLICT(instagram_business_id) DO UPDATE SET
                    page_id=excluded.page_id,
                    access_token=excluded.access_token,
                    username=excluded.username,
                    profile_picture_url=excluded.profile_picture_url,
                    is_active=1
            `).run({
                instagram_business_id: igId,
                page_id: pageId,
                access_token: token,
                username: userName,
                profile_picture_url: pic
            });

            // Get the ID of the account we just inserted/updated
            const account = db.prepare('SELECT id FROM accounts WHERE instagram_business_id = ?').get(igId) as any;

            // Set as Active Account in user_config
            const config = db.prepare('SELECT id FROM user_config LIMIT 1').get() as any;
            if (config) {
                db.prepare('UPDATE user_config SET active_account_id = ? WHERE id = ?').run(account.id, config.id);
            } else {
                db.prepare('INSERT INTO user_config (active_account_id) VALUES (?)').run(account.id);
            }

            return { success: true };

        } catch (error: any) {
            console.error('❌ Token Save Error:', error?.response?.data || error.message);
            return { success: false, error: error?.response?.data?.error?.message || error.message };
        }
    });

    // ------------------------------------------------------------------------
    // 🔀 ACCOUNT SWITCHER & MANAGEMENT
    // ------------------------------------------------------------------------

    ipcMain.handle('get-accounts', async () => {
        try {
            const accounts = db.prepare('SELECT * FROM accounts ORDER BY created_at DESC').all();
            const config = db.prepare('SELECT active_account_id FROM user_config LIMIT 1').get() as any;
            return { success: true, data: accounts, activeId: config?.active_account_id };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('switch-active-account', async (_event, accountId) => {
        try {
            db.prepare('UPDATE user_config SET active_account_id = ? WHERE id = (SELECT id FROM user_config LIMIT 1)').run(accountId);
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('delete-account', async (_event, accountId) => {
        try {
            const config = db.prepare('SELECT active_account_id FROM user_config LIMIT 1').get() as any;

            // Delete the account
            db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);

            // If we deleted the active account, switch to another one or null
            if (config?.active_account_id === accountId) {
                const otherAccount = db.prepare('SELECT id FROM accounts ORDER BY created_at DESC LIMIT 1').get() as any;
                const newActiveId = otherAccount ? otherAccount.id : null;
                db.prepare('UPDATE user_config SET active_account_id = ? WHERE id = (SELECT id FROM user_config LIMIT 1)').run(newActiveId);
            }

            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    // ------------------------------------------------------------------------
    // 🧠 AUTOMATION FLOWS (Visual Builder)
    // ------------------------------------------------------------------------

    // SAVE Flow
    ipcMain.handle('save-flow', async (_event, data) => {
        try {

            const flowId = data.id || randomUUID();
            const flowName = data.name || 'Untitled Automation';
            let nodesJson = '[]';
            let edgesJson = '[]';
            let triggerKeyword = data.trigger_keyword || null;
            let triggerType = data.trigger_type || 'POST_COMMENT';

            if (data.nodes) {
                // Visual Builder Mode
                nodesJson = JSON.stringify(data.nodes);
                edgesJson = JSON.stringify(data.edges || []);
                if (!triggerKeyword) {
                    const triggerNode = data.nodes.find((n: any) => n.data && (n.data.triggerKeyword || n.data.mediaId));
                    triggerKeyword = triggerNode?.data?.triggerKeyword || null;
                }
                triggerType = 'VISUAL_FLOW'; // Or derive from nodes
            } else {
                // Wizard Mode
                // Data comes in as { name, triggerKeyword, messageText, settings, ... }
                const wizardConfig = {
                    reply_text: data.reply_text,  // Public comment reply
                    dm_text: data.dm_text, // Legacy fallback

                    // Smart Follow Sequence Fields (Fully Customizable)
                    hook_text: data.hook_text,
                    hook_button_text: data.hook_button_text || 'Send me the link',
                    is_follow_gated: Boolean(data.is_follow_gated),
                    gate_text: data.gate_text,
                    visit_profile_button_text: data.visit_profile_button_text || 'Visit Profile',
                    profile_url: data.profile_url || '',
                    verify_button_text: data.verify_button_text || "I'm following ✅",
                    reward_text: data.reward_text || 'Thanks for your comment!!',
                    reward_button_text: data.reward_button_text || data.reward_buttons?.[0]?.title || 'Here is Your Link!',
                    reward_link: data.reward_link || data.reward_buttons?.[0]?.url || '',
                    secondary_button_text: data.secondary_button_text || data.reward_buttons?.[1]?.title || '',
                    secondary_link: data.secondary_link || data.reward_buttons?.[1]?.url || '',
                    reward_buttons: Array.isArray(data.reward_buttons) && data.reward_buttons.length > 0
                        ? data.reward_buttons.slice(0, 5)
                        : [
                            {
                                id: '1',
                                title: data.reward_button_text || 'Here is Your Link!',
                                url: data.reward_link || 'https://fluxdm.space'
                            },
                            ...(data.secondary_button_text && data.secondary_link ? [{
                                id: '2',
                                title: data.secondary_button_text,
                                url: data.secondary_link
                            }] : [])
                        ],

                    settings: data.settings
                };
                nodesJson = JSON.stringify(wizardConfig);
                edgesJson = '[]';

                // Ensure trigger keyword is set if passed at top level
                if (data.triggerKeyword) triggerKeyword = data.triggerKeyword;
            }

            const attachedMediaId = data.attached_media_id || null;

            // Upsert into DB
            const stmt = db.prepare(`
                INSERT INTO automation_flows (id, name, nodes_json, edges_json, trigger_keyword, trigger_type, attached_media_id, is_active)
                VALUES (@id, @name, @nodes_json, @edges_json, @trigger_keyword, @trigger_type, @attached_media_id, 1)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    nodes_json=excluded.nodes_json,
                    edges_json=excluded.edges_json,
                    trigger_keyword=excluded.trigger_keyword,
                    trigger_type=excluded.trigger_type,
                    attached_media_id=excluded.attached_media_id,
                    created_at=CURRENT_TIMESTAMP
            `);

            stmt.run({
                id: flowId,
                name: flowName,
                nodes_json: nodesJson,
                edges_json: edgesJson,
                trigger_keyword: triggerKeyword,
                trigger_type: triggerType,
                attached_media_id: attachedMediaId
            });

            return { success: true, id: flowId };

        } catch (error: any) {
            console.error('❌ Failed to save flow:', error);
            return { success: false, error: error.message };
        }
    });

    // GET Flows (for Visual Builder - full data)
    ipcMain.handle('get-flows', async () => {
        try {
            const flows = db.prepare('SELECT * FROM automation_flows ORDER BY created_at DESC').all() as any[];

            // Parse JSONs back to objects
            const parsedFlows = flows.map(f => {
                let nodes = [];
                let edges = [];
                try {
                    nodes = JSON.parse(f.nodes_json);
                    edges = JSON.parse(f.edges_json);
                } catch (e) {
                    // Fallback for non-visual flows (Wizard configs stored in nodes_json)
                    nodes = f.nodes_json;
                }
                return {
                    ...f,
                    nodes,
                    edges
                };
            });

            return { success: true, data: parsedFlows };
        } catch (error: any) {
            console.error('❌ Failed to fetch flows:', error);
            return { success: false, error: error.message };
        }
    });

    // ------------------------------------------------------------------------
    // 📊 DASHBOARD STATS
    // ------------------------------------------------------------------------
    // ------------------------------------------------------------------------
    // 📊 DASHBOARD STATS (Real Logic)
    // ------------------------------------------------------------------------
    ipcMain.handle('get-dashboard-stats', async (_event, { range } = { range: '7d' }) => {
        try {
            const getCount = (query: string) => (db.prepare(query).get() as { count: number })?.count || 0;

            // 1. Summary Cards
            const summary = {
                dms_sent: getCount(`SELECT COUNT(*) as count FROM message_queue WHERE status = 'SENT'`),
                leads: getCount(`SELECT COUNT(*) as count FROM leads`),
                queue: getCount(`SELECT COUNT(*) as count FROM message_queue WHERE status = 'PENDING'`),
                conversion: 0,
                active_flows: getCount(`SELECT COUNT(*) as count FROM automation_flows WHERE is_active = 1`),
                recentLogs: db.prepare("SELECT * FROM logs ORDER BY created_at DESC LIMIT 50").all()
            };

            if (summary.dms_sent > 0) {
                summary.conversion = parseFloat(((summary.leads / summary.dms_sent) * 100).toFixed(1));
            }

            // 2. Graph Data Logic
            let dateModifier = '-7 days';

            switch (range) {
                case '30d': dateModifier = '-30 days'; break;
                case '90d': dateModifier = '-90 days'; break;
                case '12m': dateModifier = '-12 months'; break;
                case '7d': default: dateModifier = '-7 days'; break;
            }

            // Query: DMs sent per day within range
            // Uses execute_at (actual sent time)
            const graphData = db.prepare(`
                SELECT 
                    strftime('%Y-%m-%d', execute_at) as date,
                    COUNT(*) as count
                FROM message_queue
                WHERE status = 'SENT' 
                AND execute_at >= datetime('now', '${dateModifier}')
                GROUP BY date
                ORDER BY date ASC
            `).all();

            return { success: true, data: { ...summary, graphData } };
        } catch (error: any) {
            console.error('❌ Stats Error:', error);
            return { success: false, error: error.message };
        }
    });

    // ------------------------------------------------------------------------
    // 🧠 AUTOMATIONS LIST (Real Logic)
    // ------------------------------------------------------------------------
    ipcMain.handle('get-automations', async (_event, { limit } = {}) => {
        try {
            let query = 'SELECT * FROM automation_flows ORDER BY created_at DESC';
            if (limit) {
                query += ` LIMIT ${limit}`;
            }
            const flows = db.prepare(query).all();
            return { success: true, data: flows };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('delete-flow', async (_event, id) => {
        try {
            db.prepare('DELETE FROM automation_flows WHERE id = ?').run(id);
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('toggle-flow', async (_event, id) => {
        try {
            // Toggle boolean-like integer (0 or 1)
            db.prepare('UPDATE automation_flows SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?').run(id);
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    // ------------------------------------------------------------------------
    // 👤 USER PROFILE (Real Logic)
    // ------------------------------------------------------------------------
    // ------------------------------------------------------------------------
    // 👤 USER PROFILE (Real Logic - Multi Account aware)
    // ------------------------------------------------------------------------
    ipcMain.handle('get-user-profile', async () => {
        try {
            // Get Active Account
            const config = db.prepare('SELECT active_account_id FROM user_config LIMIT 1').get() as any;
            if (!config?.active_account_id) return { success: true, data: null };

            const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(config.active_account_id) as any;

            if (!account) return { success: true, data: null };

            // Return cached info from DB
            return {
                success: true,
                data: { name: account.username, avatar: account.profile_picture_url }
            };

        } catch (error: any) {
            console.error('Profile Fetch Error:', error);
            return { success: false, error: error.message };
        }
    });

    // ------------------------------------------------------------------------
    // 📸 INSTAGRAM MEDIA (Real Logic - Multi Account aware)
    // ------------------------------------------------------------------------
    ipcMain.handle('get-ig-media', async (_event, options: { forceRefresh?: boolean; targetMediaId?: string } = {}) => {
        try {
            // 1. Resolve Active Account
            const config = db.prepare('SELECT active_account_id FROM user_config LIMIT 1').get() as any;
            let account: any = null;
            if (config?.active_account_id) {
                account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(config.active_account_id);
            }
            if (!account) {
                account = db.prepare('SELECT * FROM accounts WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
            }
            if (!account) {
                account = db.prepare('SELECT * FROM accounts ORDER BY id DESC LIMIT 1').get();
            }

            if (!account || !account.access_token) {
                return { 
                    success: false, 
                    error: 'No connected Instagram account found. Please connect your account in Connect Social.' 
                };
            }

            const accountId = account.id;
            const token = account.access_token;
            const isDirectIg = isDirectInstagramToken(token);
            const apiBase = getApiBase(token);
            const targetId = isDirectIg ? 'me' : (account.instagram_business_id || account.page_id || 'me');

            // 2. Check local SQLite cache first unless forceRefresh is true
            const cachedMedia = db.prepare(`
                SELECT * FROM instagram_media 
                WHERE account_id = ? 
                ORDER BY timestamp DESC 
                LIMIT 50
            `).all(accountId) as any[];

            if (cachedMedia && cachedMedia.length > 0 && !options.forceRefresh) {
                if (options.targetMediaId && !cachedMedia.some((m: any) => m.id === options.targetMediaId)) {
                    const specific = db.prepare('SELECT * FROM instagram_media WHERE id = ?').get(options.targetMediaId);
                    if (specific) cachedMedia.unshift(specific);
                }
                return { success: true, data: cachedMedia, fromCache: true };
            }

            // 3. Fetch fresh media from Meta Graph API
            console.log(`📸 Fetching live Instagram media for @${account.username} from ${apiBase}/${targetId}/media...`);
            const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';
            const response = await axios.get(`${apiBase}/${targetId}/media`, {
                params: {
                    fields,
                    limit: 50,
                    access_token: token
                },
                timeout: 15000
            });

            const items = response.data?.data || [];
            console.log(`✅ Retrieved ${items.length} live media items from Instagram for @${account.username}`);

            // 4. Upsert into instagram_media cache table
            const upsertStmt = db.prepare(`
                INSERT INTO instagram_media (
                    id, account_id, caption, media_type, media_url, thumbnail_url, permalink, timestamp, like_count, comments_count, updated_at
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
                ) ON CONFLICT(id) DO UPDATE SET
                    caption = excluded.caption,
                    media_type = excluded.media_type,
                    media_url = excluded.media_url,
                    thumbnail_url = excluded.thumbnail_url,
                    permalink = excluded.permalink,
                    timestamp = excluded.timestamp,
                    like_count = excluded.like_count,
                    comments_count = excluded.comments_count,
                    updated_at = CURRENT_TIMESTAMP
            `);

            const insertMany = db.transaction((mediaList: any[]) => {
                for (const item of mediaList) {
                    upsertStmt.run(
                        String(item.id),
                        accountId,
                        item.caption || '',
                        item.media_type || 'IMAGE',
                        item.media_url || '',
                        item.thumbnail_url || item.media_url || '',
                        item.permalink || '',
                        item.timestamp || new Date().toISOString(),
                        item.like_count || 0,
                        item.comments_count || 0
                    );
                }
            });

            insertMany(items);

            // 5. Query and return fresh sorted media
            const freshMedia = db.prepare(`
                SELECT * FROM instagram_media 
                WHERE account_id = ? 
                ORDER BY timestamp DESC 
                LIMIT 50
            `).all(accountId) as any[];

            if (options.targetMediaId && !freshMedia.some((m: any) => m.id === options.targetMediaId)) {
                const specific = db.prepare('SELECT * FROM instagram_media WHERE id = ?').get(options.targetMediaId);
                if (specific) freshMedia.unshift(specific);
            }

            return { success: true, data: freshMedia, fromCache: false };

        } catch (error: any) {
            const errorMsg = error?.response?.data?.error?.message || error.message;
            console.error('❌ IG Media Fetch Error:', errorMsg);

            // If we have cached items from previous fetches, return them with a warning
            const fallbackCached = db.prepare(`
                SELECT * FROM instagram_media 
                ORDER BY timestamp DESC 
                LIMIT 50
            `).all();

            if (fallbackCached && fallbackCached.length > 0) {
                console.warn(`⚠️ Serving ${fallbackCached.length} cached posts due to API error.`);
                return { success: true, data: fallbackCached, fromCache: true, warning: errorMsg };
            }

            return { 
                success: false, 
                error: `Failed to fetch Instagram posts: ${errorMsg}. Please ensure your token is valid or re-connect your account.` 
            };
        }
    });

    // ------------------------------------------------------------------------
    // ⚙️ SETTINGS Handlers
    // ------------------------------------------------------------------------
    // ------------------------------------------------------------------------
    // 👥 LEADS Handlers
    // ------------------------------------------------------------------------
    ipcMain.handle('get-leads', async () => {
        try {
            const leads = db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();
            return { success: true, data: leads };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    // ------------------------------------------------------------------------
    // ⚙️ SETTINGS & SYSTEM
    // ------------------------------------------------------------------------
    ipcMain.handle('get-settings', async () => {
        try {
            const user = db.prepare('SELECT settings FROM user_config LIMIT 1').get() as any;
            return {
                success: true,
                data: user && user.settings ? JSON.parse(user.settings) : {}
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('save-setting', async (_event, { key, value }) => {
        try {
            const user = db.prepare('SELECT id, settings FROM user_config LIMIT 1').get() as any;
            let currentSettings = user && user.settings ? JSON.parse(user.settings) : {};

            // Update
            currentSettings[key] = value;

            if (user) {
                db.prepare('UPDATE user_config SET settings = ? WHERE id = ?').run(JSON.stringify(currentSettings), user.id);
            } else {
                // If no user row exists yet (rare but possible before auth), create one
                db.prepare('INSERT INTO user_config (settings) VALUES (?)').run(JSON.stringify(currentSettings));
            }
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('set-launch-at-login', async (_event, openAtLogin) => {
        app.setLoginItemSettings({
            openAtLogin: openAtLogin,
            path: app.getPath('exe') // Optional but good for reliability
        });
        return { success: true };
    });



    ipcMain.handle('factory-reset', async () => {
        try {
            const { factoryReset } = await import('./database/manager');
            factoryReset();
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('hard-reset-data', async () => {
        try {
            const { forceWipeDatabase } = await import('./database/reset');
            forceWipeDatabase();
            return { success: true };
        } catch (error: any) {
            console.error("❌ Hard Reset Error:", error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('export-leads-csv', async () => {
        try {
            const leads = db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all() as any[];

            if (leads.length === 0) return { success: false, error: "No leads to export." };

            const headers = Object.keys(leads[0]).join(',');
            const rows = leads.map(l => Object.values(l).join(',')).join('\n');
            const csvContent = `${headers}\n${rows}`;

            const { canceled, filePath } = await dialog.showSaveDialog({
                title: 'Save Leads CSV',
                defaultPath: 'leads_export.csv',
                filters: [{ name: 'CSV Files', extensions: ['csv'] }]
            });

            if (canceled || !filePath) return { success: false, error: 'Cancelled' };

            fs.writeFileSync(filePath, csvContent);
            return { success: true, filePath };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });



    ipcMain.handle('open-external-url', async (_event, url) => {
        try {
            if (!url || typeof url !== 'string') {
                return { success: false, error: 'Invalid URL provided' };
            }
            const parsed = new URL(url);
            if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
                return { success: false, error: `Disallowed protocol: ${parsed.protocol}` };
            }
            await shell.openExternal(url);
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('verify-connection', async () => {
        try {
            const config = db.prepare('SELECT active_account_id FROM user_config LIMIT 1').get() as any;
            if (!config?.active_account_id) return { success: false, error: 'No Active Account.' };

            const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(config.active_account_id) as any;

            if (!account || !account.access_token) {
                return { success: false, error: 'Access Token not found.' };
            }

            const response = await axios.get(`https://graph.facebook.com/v18.0/me/accounts?fields=id,name,picture,instagram_business_account&access_token=${account.access_token}`);

            const pages = response.data.data;
            const connectedPage = pages.find((p: any) => p.instagram_business_account);

            if (!connectedPage) {
                return { success: false, error: 'No Instagram Business Account linked.' };
            }

            const pageId = connectedPage.id;
            const igId = connectedPage.instagram_business_account.id;
            const userName = connectedPage.name;
            const pic = connectedPage.picture?.data?.url;

            // Update Account Info
            db.prepare(`
                UPDATE accounts 
                SET page_id = ?, instagram_business_id = ?, username = ?, profile_picture_url = ?
                WHERE id = ?
            `).run(pageId, igId, userName, pic, account.id);

            return { success: true, data: { pageId, igId, userName, pic } };

        } catch (error: any) {
            console.error('Verify Failed:', error?.response?.data || error.message);
            return { success: false, error: error?.response?.data?.error?.message || 'Verification Failed' };
        }
    });

    // ------------------------------------------------------------------------
    // 📅 SCHEDULER Handlers
    // ------------------------------------------------------------------------
    ipcMain.handle('select-media-file', async (_event, { mediaType }: { mediaType: string }) => {
        try {
            let filters: { name: string; extensions: string[] }[] = [];
            const type = (mediaType || 'REEL').toUpperCase();

            if (type === 'REEL') {
                filters = [
                    { name: 'Video Files (*.mp4, *.mov, *.m4v)', extensions: ['mp4', 'mov', 'm4v', 'webm'] },
                    { name: 'All Files', extensions: ['*'] }
                ];
            } else if (type === 'IMAGE') {
                filters = [
                    { name: 'Image Files (*.jpg, *.png, *.webp)', extensions: ['jpg', 'jpeg', 'png', 'webp'] },
                    { name: 'All Files', extensions: ['*'] }
                ];
            } else if (type === 'CAROUSEL') {
                filters = [
                    { name: 'Photos & Videos', extensions: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov'] },
                    { name: 'All Files', extensions: ['*'] }
                ];
            } else {
                filters = [
                    { name: 'Story Media', extensions: ['mp4', 'mov', 'jpg', 'jpeg', 'png', 'webp'] },
                    { name: 'All Files', extensions: ['*'] }
                ];
            }

            const result = await dialog.showOpenDialog({
                title: `Select ${type} Media`,
                properties: ['openFile', ...(type === 'CAROUSEL' ? ['multiSelections' as const] : [])],
                filters
            });

            if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
                return { canceled: true, filePaths: [] };
            }

            return { canceled: false, filePaths: result.filePaths };
        } catch (err: any) {
            console.error('❌ Select Media Error:', err);
            return { canceled: true, error: err.message, filePaths: [] };
        }
    });

    ipcMain.handle('read-media-preview', async (_event, { filePath }: { filePath: string }) => {
        try {
            if (!filePath || !fs.existsSync(filePath)) {
                return { success: false, error: 'File does not exist' };
            }
            const buffer = fs.readFileSync(filePath);
            const ext = path.extname(filePath).toLowerCase();
            let mimeType = 'video/mp4';
            if (ext === '.mov') mimeType = 'video/quicktime';
            else if (ext === '.webm') mimeType = 'video/webm';
            else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
            else if (ext === '.png') mimeType = 'image/png';
            else if (ext === '.webp') mimeType = 'image/webp';

            return { success: true, buffer, mimeType };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('schedule-post', async (_event, { files, caption, date, automationId, mediaType, accountId }) => {
        try {
            // Resolve Account ID
            let resolvedAccountId = accountId;
            if (!resolvedAccountId) {
                const config = db.prepare('SELECT active_account_id FROM user_config LIMIT 1').get() as any;
                resolvedAccountId = config?.active_account_id;
            }
            if (!resolvedAccountId) {
                const activeAcc = db.prepare('SELECT id FROM accounts WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get() as any;
                resolvedAccountId = activeAcc?.id || null;
            }

            // Normalize publish_at to ISO UTC format for reliable SQLite comparisons
            let publishUtc = date;
            try {
                const parsed = new Date(date);
                if (!isNaN(parsed.getTime())) {
                    publishUtc = parsed.toISOString();
                }
            } catch {
                publishUtc = date;
            }

            // Ensure media directory exists in AppData
            const storageDir = path.join(app.getPath('userData'), 'scheduled_media');
            if (!fs.existsSync(storageDir)) {
                fs.mkdirSync(storageDir, { recursive: true });
            }

            // Copy and permanently preserve local media files
            const rawFiles = Array.isArray(files) ? files : (files ? [files] : []);
            const preservedPaths: string[] = [];

            for (const item of rawFiles) {
                if (typeof item === 'string' && fs.existsSync(item)) {
                    const ext = path.extname(item) || '.mp4';
                    const base = path.basename(item, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
                    const safeName = `${Date.now()}_${base}${ext}`;
                    const targetFile = path.join(storageDir, safeName);
                    fs.copyFileSync(item, targetFile);
                    preservedPaths.push(targetFile);
                    console.log(`📦 Preserved media file to app storage: ${targetFile}`);
                } else if (typeof item === 'string') {
                    preservedPaths.push(item);
                }
            }

            const filePathsJson = JSON.stringify(preservedPaths.length > 0 ? preservedPaths : rawFiles);
            const normalizedType = (mediaType || 'REEL').toUpperCase();

            const insertResult = db.prepare(`
                INSERT INTO scheduled_posts (account_id, file_path, caption, publish_at, linked_flow_id, status, media_type)
                VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
            `).run(resolvedAccountId, filePathsJson, caption || '', publishUtc, automationId || null, normalizedType);

            return { success: true, id: insertResult.lastInsertRowid };
        } catch (error: any) {
            console.error('❌ Schedule Error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('publish-scheduled-post-now', async (_event, { id }: { id: number }) => {
        try {
            console.log(`⚡ Immediate publish requested for post #${id}`);
            const result = await processJobById(Number(id));
            return result;
        } catch (error: any) {
            console.error('❌ Immediate Publish Error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-scheduled-posts', async (_event, { startDate, endDate } = {}) => {
        try {
            let posts;
            const querySelect = `
                SELECT sp.*, sp.linked_flow_id as automation_id, a.username as account_username 
                FROM scheduled_posts sp 
                LEFT JOIN accounts a ON sp.account_id = a.id
            `;
            if (startDate && endDate) {
                posts = db.prepare(`
                    ${querySelect} 
                    WHERE sp.publish_at BETWEEN ? AND ?
                    ORDER BY sp.publish_at ASC
                `).all(startDate, endDate);
            } else {
                posts = db.prepare(`
                    ${querySelect} ORDER BY sp.publish_at DESC
                `).all();
            }
            return { success: true, data: posts };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('update-scheduled-post', async (_event, { id, caption, date, automationId }) => {
        try {
            let publishUtc = date;
            try {
                const parsed = new Date(date);
                if (!isNaN(parsed.getTime())) publishUtc = parsed.toISOString();
            } catch {
                publishUtc = date;
            }

            db.prepare(`
                UPDATE scheduled_posts 
                SET caption = ?, publish_at = ?, linked_flow_id = ?
                WHERE id = ?
            `).run(caption, publishUtc, automationId || null, id);
            return { success: true };
        } catch (error: any) {
            console.error('❌ Update Post Error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('delete-scheduled-post', async (_event, { id }) => {
        try {
            db.prepare('DELETE FROM scheduled_posts WHERE id = ?').run(id);
            return { success: true };
        } catch (error: any) {
            console.error('❌ Delete Post Error:', error);
            return { success: false, error: error.message };
        }
    });

    // ------------------------------------------------------------------------
    // 💳 LICENSING, ANTI-EXPLOITATION & PAIRING HANDLERS
    // ------------------------------------------------------------------------
    ipcMain.handle('licensing:get-status', async () => {
        try {
            const config = db.prepare('SELECT is_licensed, license_session_id, license_signature, license_email, licensed_at, device_hardware_id FROM user_config LIMIT 1').get() as any;
            const currentHardwareId = getDeviceHardwareId();
            const seats = getActiveDeviceSeats();

            if (!config || !config.is_licensed) {
                return {
                    isLicensed: false,
                    hardwareId: currentHardwareId,
                    seats
                };
            }

            // Verify tamper-proof HMAC signature
            const isSignatureValid = verifyLicenseSignature(
                config.license_session_id || '',
                config.device_hardware_id || currentHardwareId,
                config.license_email || '',
                config.license_signature || ''
            );

            if (!isSignatureValid) {
                console.warn('⚠️ Tamper detected: License signature mismatch. Reverting to trial.');
                db.prepare('UPDATE user_config SET is_licensed = 0 WHERE id = (SELECT id FROM user_config LIMIT 1)').run();
                return {
                    isLicensed: false,
                    error: 'Tamper detected: License state invalidated.',
                    hardwareId: currentHardwareId,
                    seats
                };
            }

            return {
                isLicensed: true,
                email: config.license_email,
                licensedAt: config.licensed_at,
                sessionId: config.license_session_id,
                hardwareId: currentHardwareId,
                seats
            };
        } catch (error: any) {
            console.error('Error getting licensing status:', error);
            return { isLicensed: false, error: error.message };
        }
    });

    ipcMain.handle('licensing:create-checkout', async (_event, { email } = {}) => {
        return await createCheckoutSession(email);
    });

    ipcMain.handle('licensing:verify-session', async (_event, { sessionId }) => {
        return await verifyAndActivateSession(sessionId);
    });

    ipcMain.handle('licensing:request-email-otp', async (_event, { email }) => {
        return await requestPurchaseRestoreOtp(email);
    });

    ipcMain.handle('licensing:verify-email-otp', async (_event, { email, code }) => {
        return await verifyPurchaseRestoreOtp(email, code);
    });

    ipcMain.handle('licensing:get-device-seats', async () => {
        return { success: true, seats: getActiveDeviceSeats() };
    });

    ipcMain.handle('licensing:deauthorize-seat', async (_event, { seatId }) => {
        return deauthorizeSeat(seatId);
    });

    ipcMain.handle('licensing:generate-pairing-code', async () => {
        return { success: true, ...generatePairingCode() };
    });

    ipcMain.handle('licensing:redeem-pairing-code', async (_event, { pin, deviceType, deviceName }) => {
        return redeemPairingCode(pin, deviceType, deviceName);
    });
}
