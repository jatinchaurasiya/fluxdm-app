import electron from 'electron';
const { ipcMain, shell, dialog, app, BrowserWindow } = electron;
import fs from 'node:fs';
import axios from 'axios';
import db from './database/db';
import { randomUUID } from 'crypto';
import { startOAuthServer } from './auth/server';

// ------------------------------------------------------------------------
// 🔐 AUTH & API HANDLERS
// ------------------------------------------------------------------------
export function registerIpcHandlers() {

    // ... (existing handlers)

    ipcMain.handle('start-oauth-flow', async (_event, _appId: string) => {
        try {
            console.log("🚀 Starting OAuth Flow...");
            const token = await startOAuthServer();

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
                    reply_text: data.reply_text,  // Mapped from frontend (Public Reply)
                    dm_text: data.dm_text, // Legacy simple DM

                    // Smart Follow Gate Fields
                    hook_text: data.hook_text,
                    verification_keyword: data.verification_keyword,
                    is_follow_gated: data.is_follow_gated,
                    gate_text: data.gate_text,
                    reward_text: data.reward_text,
                    reward_link: data.reward_link,

                    settings: data.settings
                };
                nodesJson = JSON.stringify(wizardConfig);
                edgesJson = '[]';

                // Ensure trigger keyword is set if passed at top level
                if (data.triggerKeyword) triggerKeyword = data.triggerKeyword;
            }

            // Upsert into DB
            const stmt = db.prepare(`
                INSERT INTO automation_flows (id, name, nodes_json, edges_json, trigger_keyword, trigger_type, is_active)
                VALUES (@id, @name, @nodes_json, @edges_json, @trigger_keyword, @trigger_type, 1)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    nodes_json=excluded.nodes_json,
                    edges_json=excluded.edges_json,
                    trigger_keyword=excluded.trigger_keyword,
                    trigger_type=excluded.trigger_type,
                    created_at=CURRENT_TIMESTAMP
            `);

            stmt.run({
                id: flowId,
                name: flowName,
                nodes_json: nodesJson,
                edges_json: edgesJson,
                trigger_keyword: triggerKeyword,
                trigger_type: triggerType
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
    ipcMain.handle('get-ig-media', async () => {
        const MOCK_MEDIA = [
            { id: 'mock_1', caption: 'FluxDM Demo Post 1', media_type: 'IMAGE', thumbnail_url: '', media_url: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113', permalink: '#' },
            { id: 'mock_2', caption: 'FluxDM Demo Post 2', media_type: 'VIDEO', thumbnail_url: 'https://images.unsplash.com/photo-1611162616475-46b635cb6868', media_url: '', permalink: '#' },
            { id: 'mock_3', caption: 'Start Your Automation 🚀', media_type: 'CAROUSEL_ALBUM', thumbnail_url: '', media_url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3', permalink: '#' },
        ];

        try {
            const config = db.prepare('SELECT active_account_id FROM user_config LIMIT 1').get() as any;
            if (!config?.active_account_id) return { success: false, error: 'No Active Account Selected.' };

            const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(config.active_account_id) as any;

            if (!account || !account.access_token || !account.instagram_business_id) {
                console.warn("⚠️ Account record incomplete. Using Mock Data.");
                return { success: true, data: MOCK_MEDIA };
            }

            const { access_token, instagram_business_id } = account;

            // Check if this is a fallback fake ID
            if (String(instagram_business_id).startsWith('fallback_')) {
                console.warn("⚠️ Using Fallback Account. Returning Mock Media.");
                return { success: true, data: MOCK_MEDIA };
            }

            const API_VERSION = 'v18.0';

            const response = await axios.get(
                `https://graph.facebook.com/${API_VERSION}/${instagram_business_id}/media?fields=id,caption,media_type,thumbnail_url,permalink,media_url&limit=24&access_token=${access_token}`
            );

            return { success: true, data: response.data.data };
        } catch (error: any) {
            console.error('❌ IG Media Fetch Error (Using Mock Fallback):', error?.response?.data || error.message);
            // Fallback to mock data if API fails (e.g. invalid tokens, permissions, or cross-connect issues)
            return { success: true, data: MOCK_MEDIA };
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
        await shell.openExternal(url);
        return { success: true };
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
    // ------------------------------------------------------------------------
    // 📅 SCHEDULER Handlers
    // ------------------------------------------------------------------------
    ipcMain.handle('schedule-post', async (_event, { files, caption, date, automationId, mediaType }) => {
        try {
            const filePathsJson = JSON.stringify(files || []);
            db.prepare(`
                INSERT INTO scheduled_posts (file_path, caption, publish_at, linked_flow_id, status, media_type)
                VALUES (?, ?, ?, ?, 'PENDING', ?)
            `).run(filePathsJson, caption, date, automationId || null, mediaType || 'REEL');

            return { success: true };
        } catch (error: any) {
            console.error('❌ Schedule Error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-scheduled-posts', async (_event, { startDate, endDate } = {}) => {
        try {
            let posts;
            const querySelect = `SELECT *, linked_flow_id as automation_id FROM scheduled_posts`;
            if (startDate && endDate) {
                posts = db.prepare(`
                    ${querySelect} 
                    WHERE publish_at BETWEEN ? AND ?
                    ORDER BY publish_at ASC
                `).all(startDate, endDate);
            } else {
                posts = db.prepare(`
                    ${querySelect} ORDER BY publish_at ASC
                `).all();
            }
            return { success: true, data: posts };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('update-scheduled-post', async (_event, { id, caption, date, automationId }) => {
        try {
            db.prepare(`
                UPDATE scheduled_posts 
                SET caption = ?, publish_at = ?, linked_flow_id = ?
                WHERE id = ?
            `).run(caption, date, automationId || null, id);
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


}
