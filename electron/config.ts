import dotenv from 'dotenv';
dotenv.config();

export const META_CONFIG = {
    appId: (process.env.META_APP_ID || '').trim(),
    instagramAppId: (process.env.INSTAGRAM_APP_ID || '').trim(),
    redirectUri: (process.env.META_REDIRECT_URI || 'http://localhost:3000/callback').trim().replace(/\/+$/, '')
};
