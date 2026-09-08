import express from 'express';
import axios from 'axios';
import electron from 'electron';
const { shell } = electron;
import db from '../database/db';
import { META_CONFIG } from '../config';
import { APP_SECRET } from '../secret';
import { Server } from 'http';

let server: Server | null = null;

export interface OAuthOptions {
    customAppId?: string;
    customAppSecret?: string;
    customInstagramAppId?: string;
    customInstagramAppSecret?: string;
    mode?: 'instagram' | 'facebook';
}

/**
 * 🔐 OAuth Loopback Server
 * 
 * Supports:
 * 1. Direct Instagram Login for Business (No Facebook Page Required!)
 *    Requires Instagram App ID from Meta Dashboard > Instagram > API setup
 * 2. Facebook Pages Login (for users with linked Facebook Pages)
 *    Uses Meta (Facebook) App ID
 */
export function startOAuthServer(
    customAppIdOrOptions?: string | OAuthOptions, 
    customAppSecret?: string,
    explicitMode?: 'instagram' | 'facebook'
): Promise<string> {
    return new Promise((resolve, reject) => {
        // Close any existing server instance
        if (server) {
            server.close();
            server = null;
        }

        let customAppId: string | undefined;
        let secretToUse: string | undefined = customAppSecret;
        let customInstagramAppId: string | undefined;
        let customInstagramAppSecret: string | undefined;
        let mode: 'instagram' | 'facebook' = explicitMode || 'instagram';

        if (typeof customAppIdOrOptions === 'object' && customAppIdOrOptions !== null) {
            customAppId = customAppIdOrOptions.customAppId;
            secretToUse = customAppIdOrOptions.customAppSecret || customAppSecret;
            customInstagramAppId = customAppIdOrOptions.customInstagramAppId;
            customInstagramAppSecret = customAppIdOrOptions.customInstagramAppSecret;
            mode = customAppIdOrOptions.mode || 'instagram';
        } else if (typeof customAppIdOrOptions === 'string') {
            customAppId = customAppIdOrOptions;
        }

        const app = express();
        const PORT = 3000;
        const REDIRECT_URI = META_CONFIG.redirectUri || `http://localhost:${PORT}/callback`;

        // If mode is instagram, prioritize Instagram App ID
        const resolvedIgAppId = customInstagramAppId || META_CONFIG.instagramAppId;
        const resolvedIgSecret = customInstagramAppSecret || (process.env.INSTAGRAM_APP_SECRET || secretToUse || APP_SECRET);

        let appIdToUse = customAppId || META_CONFIG.appId;
        let appSecretToUse = secretToUse || APP_SECRET;

        if (mode === 'instagram') {
            if (resolvedIgAppId) {
                appIdToUse = resolvedIgAppId;
                appSecretToUse = resolvedIgSecret;
            } else {
                // If user didn't enter an Instagram App ID, notify clearly
                console.warn('⚠️ No separate Instagram App ID found. Using Meta App ID, which may trigger "Invalid platform app" if Instagram business product is not configured.');
            }
        }

        // Scopes for Instagram Login for Business
        const IG_SCOPES = [
            'instagram_business_basic',
            'instagram_business_manage_messages',
            'instagram_business_manage_comments',
            'instagram_business_content_publish'
        ].join(',');

        // Scopes for Facebook Pages Login
        const FB_SCOPES = [
            'instagram_basic',
            'instagram_manage_comments',
            'instagram_manage_messages',
            'pages_show_list',
            'instagram_content_publish'
        ].join(',');

        // 📍 Route: GET /callback
        app.get('/callback', async (req, res) => {
            const code = req.query.code as string;

            if (!code) {
                console.error('❌ No authorization code received');
                res.status(400).send(`
                    <html>
                        <body style="background: #09090b; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column;">
                            <h1 style="color: #ef4444;">❌ Authorization Failed</h1>
                            <p>No code received from Instagram/Meta. Please try again.</p>
                        </body>
                    </html>
                `);
                reject(new Error('No authorization code received'));
                return;
            }

            try {
                console.log(`📥 Received authorization code for mode: ${mode}. Exchanging for tokens...`);

                let finalToken = '';
                let igBusinessId = '';
                let pageId = '';
                let userName = 'Instagram Creator';
                let profilePicture = '';

                let igSuccess = false;
                if (mode === 'instagram') {
                    // Strip any hash fragments (e.g. #_ or #) per Meta specification
                    const cleanCode = (code || '').split('#')[0].replace(/_$/, '').trim();
                    const cleanRedirectUri = REDIRECT_URI.replace(/\/$/, '');
                    console.log(`📍 Processing authorization code (length: ${cleanCode.length}, redirect_uri: ${cleanRedirectUri})`);

                    // Send multipart/form-data POST to https://api.instagram.com/oauth/access_token
                    // as explicitly required by Meta's Instagram Business Login specification (curl -F)
                    const formData = new FormData();
                    formData.append('client_id', appIdToUse);
                    formData.append('client_secret', appSecretToUse);
                    formData.append('grant_type', 'authorization_code');
                    formData.append('redirect_uri', cleanRedirectUri);
                    formData.append('code', cleanCode);

                    console.log(`🔄 Exchanging authorization code for Instagram access token (client_id: ${appIdToUse}, redirect_uri: ${cleanRedirectUri})...`);

                    let exchangeData: any = null;
                    try {
                        const res = await axios.post('https://api.instagram.com/oauth/access_token', formData, {
                            timeout: 15000
                        });
                        exchangeData = res.data;
                    } catch (tokenErr: any) {
                        const errData = tokenErr.response?.data;
                        console.error('❌ Instagram Token Exchange Failed:');
                        console.error('Status:', tokenErr.response?.status);
                        console.error('Error Details:', JSON.stringify(errData || tokenErr.message));
                        const userErrMsg = errData?.error_message || errData?.error?.message || tokenErr.message;
                        throw new Error(`Instagram Token Exchange failed: ${userErrMsg}`);
                    }

                    if (exchangeData && (exchangeData.access_token || exchangeData.data?.[0]?.access_token)) {
                        const shortLivedToken = exchangeData.access_token || exchangeData.data?.[0]?.access_token;
                        const igUserId = exchangeData.user_id || exchangeData.id || exchangeData.data?.[0]?.user_id;

                        console.log(`✅ Direct Instagram short-lived token obtained for user: ${igUserId}. Exchanging for 60-day token...`);

                        // Exchange for 60-day long-lived token
                        try {
                            const longTokenRes = await axios.get('https://graph.instagram.com/access_token', {
                                params: {
                                    grant_type: 'ig_exchange_token',
                                    client_secret: appSecretToUse,
                                    access_token: shortLivedToken
                                },
                                timeout: 10000
                            });
                            finalToken = longTokenRes.data.access_token || shortLivedToken;
                        } catch (longErr: any) {
                            console.warn('Long-lived token exchange via graph.instagram.com failed, keeping short-lived token:', longErr.message);
                            finalToken = shortLivedToken;
                        }

                        igBusinessId = String(igUserId);
                        pageId = String(igUserId);

                        // Fetch Instagram profile info
                        try {
                            const profileRes = await axios.get('https://graph.instagram.com/v22.0/me', {
                                params: {
                                    fields: 'id,username,name,account_type,profile_picture_url',
                                    access_token: finalToken
                                },
                                timeout: 8000
                            });
                            userName = profileRes.data.username || profileRes.data.name || `ig_${igUserId}`;
                            profilePicture = profileRes.data.profile_picture_url || '';
                        } catch (e: any) {
                            console.warn('Could not fetch Instagram profile picture/name from graph.instagram.com:', e.message);
                            userName = `ig_${igUserId}`;
                        }

                        igSuccess = true;
                    } else {
                        throw new Error('No access_token returned by Instagram in exchange response.');
                    }
                }

                // Fallback to Facebook Graph API OAuth flow if not resolved via Direct Instagram
                if (!igSuccess) {
                    console.log('🔄 Running Facebook Graph API OAuth exchange...');
                    const shortTokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
                        params: {
                            client_id: appIdToUse,
                            client_secret: appSecretToUse,
                            redirect_uri: REDIRECT_URI,
                            code: code
                        },
                        timeout: 10000
                    });

                    const shortLivedToken = shortTokenResponse.data.access_token;
                    if (!shortLivedToken) throw new Error('Failed to retrieve short-lived token from Facebook');

                    const longTokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
                        params: {
                            grant_type: 'fb_exchange_token',
                            client_id: appIdToUse,
                            client_secret: appSecretToUse,
                            fb_exchange_token: shortLivedToken
                        },
                        timeout: 10000
                    });

                    finalToken = longTokenResponse.data.access_token;
                    if (!finalToken) throw new Error('Failed to retrieve long-lived token from Facebook');

                    // Fetch Facebook Pages & Linked Instagram Account
                    const accountResponse = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
                        params: {
                            fields: 'id,name,picture,instagram_business_account',
                            access_token: finalToken
                        },
                        timeout: 10000
                    });

                    const pages = accountResponse.data.data || [];
                    const connectedPage = pages.find((p: any) => p.instagram_business_account);

                    if (connectedPage) {
                        pageId = connectedPage.id;
                        igBusinessId = connectedPage.instagram_business_account.id;
                        userName = connectedPage.name;
                        profilePicture = connectedPage.picture?.data?.url || '';
                    } else if (pages.length > 0) {
                        // Page without linked IG
                        pageId = pages[0].id;
                        igBusinessId = pages[0].id;
                        userName = pages[0].name;
                        profilePicture = pages[0].picture?.data?.url || '';
                    } else {
                        throw new Error('No Facebook Page or Instagram Business Account found.');
                    }
                }

                // Clean up any old invalid fallback accounts
                db.prepare("DELETE FROM accounts WHERE instagram_business_id LIKE 'fallback_%'").run();

                // Save to database
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
                    instagram_business_id: igBusinessId,
                    page_id: pageId,
                    access_token: finalToken,
                    username: userName,
                    profile_picture_url: profilePicture
                });

                // Set as Active Account
                const account = db.prepare('SELECT id FROM accounts WHERE instagram_business_id = ?').get(igBusinessId) as any;
                if (account) {
                    const existingConfig = db.prepare('SELECT id FROM user_config LIMIT 1').get() as any;
                    if (existingConfig) {
                        db.prepare('UPDATE user_config SET active_account_id = ? WHERE id = ?').run(account.id, existingConfig.id);
                    } else {
                        db.prepare('INSERT INTO user_config (active_account_id) VALUES (?)').run(account.id);
                    }
                }

                console.log(`✅ Instagram Account successfully connected: @${userName} (ID: ${igBusinessId})`);

                // Send success response page
                res.send(`
                    <!DOCTYPE html>
                    <html>
                        <head>
                            <title>FluxDM - Connected!</title>
                            <meta name="viewport" content="width=device-width, initial-scale=1">
                            <style>
                                body {
                                    background: #09090b;
                                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    height: 100vh;
                                    margin: 0;
                                    color: white;
                                }
                                .card {
                                    text-align: center;
                                    background: rgba(24, 24, 27, 0.9);
                                    border: 1px solid rgba(255, 255, 255, 0.1);
                                    padding: 3rem 2.5rem;
                                    border-radius: 24px;
                                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
                                    max-width: 440px;
                                    width: 90%;
                                }
                                .badge {
                                    display: inline-flex;
                                    align-items: center;
                                    justify-content: center;
                                    width: 72px;
                                    height: 72px;
                                    border-radius: 50%;
                                    background: linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888);
                                    margin-bottom: 1.5rem;
                                    box-shadow: 0 10px 25px rgba(225, 48, 108, 0.4);
                                    font-size: 2rem;
                                }
                                h1 {
                                    font-size: 1.75rem;
                                    font-weight: 700;
                                    margin: 0 0 0.5rem 0;
                                }
                                p {
                                    color: #a1a1aa;
                                    font-size: 0.95rem;
                                    margin: 0.25rem 0;
                                }
                                .username {
                                    color: #f43f5e;
                                    font-weight: 600;
                                }
                                .auto-close {
                                    font-size: 0.8rem;
                                    color: #71717a;
                                    margin-top: 1.5rem;
                                }
                            </style>
                        </head>
                        <body>
                            <div class="card">
                                <div class="badge">📸</div>
                                <h1>Connected Successfully!</h1>
                                <p>Authorized as <span class="username">@${userName}</span></p>
                                <p>You can now return to FluxDM.</p>
                                <p class="auto-close">This window will close automatically...</p>
                            </div>
                            <script>
                                setTimeout(() => { window.location.href = 'fluxdm://auth/callback'; }, 800);
                                setTimeout(() => { window.close(); }, 3500);
                            </script>
                        </body>
                    </html>
                `);

                resolve(finalToken);
            } catch (error: any) {
                console.error('❌ OAuth Error:', error?.response?.data || error.message);

                res.status(500).send(`
                    <!DOCTYPE html>
                    <html>
                        <head>
                            <title>FluxDM - Connection Failed</title>
                            <style>
                                body {
                                    background: #09090b;
                                    color: white;
                                    font-family: sans-serif;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    height: 100vh;
                                    margin: 0;
                                }
                                .box {
                                    background: #18181b;
                                    border: 1px solid #ef4444;
                                    padding: 2.5rem;
                                    border-radius: 16px;
                                    text-align: center;
                                    max-width: 460px;
                                }
                                h1 { color: #ef4444; margin-top: 0; }
                                p { color: #a1a1aa; font-size: 0.9rem; }
                            </style>
                        </head>
                        <body>
                            <div class="box">
                                <h1>Connection Failed</h1>
                                <p>${error?.response?.data?.error?.message || error.message}</p>
                                <p style="margin-top: 1.5rem; font-size: 0.8rem; color: #71717a;">You can close this tab and try again in the app.</p>
                            </div>
                        </body>
                    </html>
                `);

                reject(error);
            } finally {
                if (server) {
                    setTimeout(() => {
                        server?.close();
                        server = null;
                        console.log('🔒 Auth server closed');
                    }, 1000);
                }
            }
        });

        // Start local listener
        server = app.listen(PORT, async () => {
            console.log(`🔐 OAuth loopback server active on http://localhost:${PORT}`);

            let authUrl = '';
            if (mode === 'instagram') {
                // Official Instagram Business Login Embed URL format
                authUrl = `https://www.instagram.com/oauth/authorize?force_reauth=true&client_id=${appIdToUse}&redirect_uri=${REDIRECT_URI.replace(/\/$/, '')}&response_type=code&scope=${IG_SCOPES}`;
            } else {
                // Facebook Graph OAuth
                authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appIdToUse}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${FB_SCOPES}`;
            }

            console.log(`🌐 Initiating ${mode.toUpperCase()} OAuth in browser: ${authUrl}`);

            try {
                await shell.openExternal(authUrl);
            } catch (err) {
                console.error('❌ Failed to launch browser for OAuth:', err);
                reject(err);
            }
        });

        server.on('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                console.error('❌ Port 3000 is occupied. Please close competing instances.');
                reject(new Error('Port 3000 is occupied. Please try again.'));
            } else {
                console.error('❌ Server error:', err);
                reject(err);
            }
        });
    });
}
