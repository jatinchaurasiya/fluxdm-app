import express from 'express';
import axios from 'axios';
import electron from 'electron';
const { shell } = electron;
import db from '../database/db';
import { META_CONFIG } from '../config';
import { APP_SECRET } from '../secret';
import { Server } from 'http';

let server: Server | null = null;

/**
 * 🔐 OAuth Loopback Server
 * 
 * This server handles the OAuth callback from Meta/Facebook.
 * It runs locally on port 3000 and catches the authorization code,
 * then exchanges it for a long-lived access token.
 * 
 * Flow:
 * 1. User clicks "Log in with Facebook" button
 * 2. This function starts an Express server on localhost:3000
 * 3. Opens browser to Meta's OAuth dialog
 * 4. User approves the app
 * 5. Meta redirects to http://localhost:3000/callback?code=XYZ
 * 6. Server catches the code and exchanges it for tokens
 * 7. Saves token + account details to database
 * 8. Shows success page to user
 * 9. Resolves promise so the desktop app can update UI
 */
export function startOAuthServer(customAppId?: string, customAppSecret?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        // Close any existing server instance
        if (server) {
            server.close();
            server = null;
        }

        const app = express();
        const PORT = 3000;
        const REDIRECT_URI = `http://localhost:${PORT}/callback`;

        // Define the OAuth scopes we need
        const SCOPES = [
            'instagram_basic',
            'instagram_manage_comments',
            'instagram_manage_messages',
            'pages_show_list',
            'instagram_content_publish'
        ].join(',');


        // 📍 Route: GET /callback
        // This is where Meta redirects after user authorization
        app.get('/callback', async (req, res) => {
            const code = req.query.code as string;

            if (!code) {
                console.error('❌ No authorization code received');
                res.status(400).send(`
                    <html>
                        <body style="background: #fee; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column;">
                            <h1 style="color: #c00;">❌ Authorization Failed</h1>
                            <p>No code received from Meta. Please try again.</p>
                        </body>
                    </html>
                `);
                reject(new Error('No authorization code received'));
                return;
            }

            try {
                console.log('📥 Received authorization code, exchanging for token...');

                // STEP 1: Exchange authorization code for short-lived token
                const appIdToUse = customAppId || META_CONFIG.appId;
                const appSecretToUse = customAppSecret || APP_SECRET;

                console.log(`🔑 Using App ID: ${appIdToUse} (Custom: ${!!customAppId})`);

                const shortTokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
                    params: {
                        client_id: appIdToUse,
                        client_secret: appSecretToUse,
                        redirect_uri: REDIRECT_URI,
                        code: code
                    }
                });

                const shortLivedToken = shortTokenResponse.data.access_token;

                if (!shortLivedToken) {
                    throw new Error('Failed to retrieve short-lived token');
                }

                console.log('✅ Short-lived token obtained, exchanging for long-lived token...');

                // STEP 2: Exchange short-lived token for long-lived token (60 days)
                const longTokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
                    params: {
                        grant_type: 'fb_exchange_token',
                        client_id: appIdToUse,
                        client_secret: appSecretToUse,
                        fb_exchange_token: shortLivedToken
                    }
                });

                const longLivedToken = longTokenResponse.data.access_token;

                if (!longLivedToken) {
                    throw new Error('Failed to retrieve long-lived token');
                }

                console.log('✅ Long-lived token obtained! Fetching account details...');

                // STEP 3: Fetch account details (Page ID, IG Business Account ID, etc.)
                const accountResponse = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
                    params: {
                        fields: 'id,name,picture,instagram_business_account',
                        access_token: longLivedToken
                    }
                });

                const pages = accountResponse.data.data;
                let connectedPage = pages.find((p: any) => p.instagram_business_account);
                let usingFallback = false;

                if (!connectedPage) {
                    console.warn("⚠️ No fully connected IG Business Account found. Falling back to first available Page.");
                    if (pages && pages.length > 0) {
                        connectedPage = pages[0];
                        usingFallback = true;
                    } else {
                        throw new Error('No Instagram Business Account linked to your Facebook Pages, and no Pages found to fallback to.');
                    }
                }

                const pageId = connectedPage.id;
                // If fallback, use Page ID as fake IG ID or the real one if available
                const igBusinessId = connectedPage.instagram_business_account?.id || `fallback_${pageId}`;
                const userName = connectedPage.name;
                const profilePicture = connectedPage.picture?.data?.url || '';

                console.log(`✅ Connected to: ${userName} (Page ID: ${pageId}, IG ID: ${igBusinessId}) ${usingFallback ? '[FALLBACK MODE]' : ''}`);

                // STEP 4: Save everything to database (Accounts Table)
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
                    access_token: longLivedToken,
                    username: userName,
                    profile_picture_url: profilePicture
                });

                // Get Account ID
                const account = db.prepare('SELECT id FROM accounts WHERE instagram_business_id = ?').get(igBusinessId) as any;

                // Set Active Account
                const existingConfig = db.prepare('SELECT id FROM user_config LIMIT 1').get() as any;

                if (existingConfig) {
                    db.prepare('UPDATE user_config SET active_account_id = ? WHERE id = ?').run(account.id, existingConfig.id);
                } else {
                    db.prepare('INSERT INTO user_config (active_account_id) VALUES (?)').run(account.id);
                }

                console.log('✅ Token and account details saved to database!');

                // STEP 5: Show success page to user
                res.send(`
                    <html>
                        <head>
                            <title>FluxDM - Connected!</title>
                            <style>
                                body {
                                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    height: 100vh;
                                    margin: 0;
                                    color: white;
                                }
                                .container {
                                    text-align: center;
                                    background: rgba(255, 255, 255, 0.1);
                                    backdrop-filter: blur(10px);
                                    padding: 3rem;
                                    border-radius: 20px;
                                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                                }
                                h1 {
                                    font-size: 2.5rem;
                                    margin: 0 0 1rem 0;
                                }
                                p {
                                    font-size: 1.2rem;
                                    opacity: 0.9;
                                }
                                .checkmark {
                                    font-size: 4rem;
                                    animation: bounce 0.6s ease;
                                }
                                @keyframes bounce {
                                    0%, 100% { transform: scale(1); }
                                    50% { transform: scale(1.2); }
                                }
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <div class="checkmark">✅</div>
                                <h1>Connected Successfully!</h1>
                                <p>FluxDM has been authorized as <strong>${userName}</strong></p>
                                <p style="font-size: 1rem; margin-top: 2rem;">Redirecting you back to the app...</p>
                                <p style="font-size: 0.8rem; color: #eee; margin-top: 0.5rem;">If nothing happens, you can close this tab.</p>
                            </div>
                            <script>
                                // Try to redirect to app protocol
                                setTimeout(() => {
                                    window.location.href = 'fluxdm://auth/callback';
                                }, 1000);

                                // Auto-close after 5 seconds
                                setTimeout(() => {
                                    window.close();
                                }, 5000);
                            </script>
                        </body>
                    </html>
                `);

                // STEP 6: Resolve the promise with the token
                // This allows the IPC handler to know the auth succeeded
                resolve(longLivedToken);

            } catch (error: any) {
                console.error('❌ OAuth Error:', error?.response?.data || error.message);

                res.status(500).send(`
                    <html>
                        <body style="background: #fee; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column;">
                            <h1 style="color: #c00;">❌ Authentication Failed</h1>
                            <p>Error: ${error?.response?.data?.error?.message || error.message}</p>
                            <p style="font-size: 0.9rem; color: #666;">Check the app console for more details.</p>
                        </body>
                    </html>
                `);

                reject(error);
            } finally {
                // Close the server after handling the callback
                if (server) {
                    setTimeout(() => {
                        server?.close();
                        server = null;
                        console.log('🔒 Auth server closed');
                    }, 1000); // Small delay to ensure response is sent
                }
            }
        });

        // Start the server
        server = app.listen(PORT, async () => {
            console.log(`🔐 OAuth server started on http://localhost:${PORT}`);

            // Build the OAuth URL
            const appIdToUse = customAppId || META_CONFIG.appId;
            const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appIdToUse}&redirect_uri=${REDIRECT_URI}&scope=${SCOPES}`;

            console.log(`🌐 Opening browser for OAuth: ${authUrl}`);

            // Open the browser to the OAuth dialog
            try {
                await shell.openExternal(authUrl);
            } catch (err) {
                console.error('❌ Failed to open browser:', err);
                reject(err);
            }
        });

        // Handle server errors
        server.on('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                console.error('❌ Port 3000 is already in use. Please close other instances.');
                reject(new Error('Port 3000 is already in use'));
            } else {
                console.error('❌ Server error:', err);
                reject(err);
            }
        });
    });
}
