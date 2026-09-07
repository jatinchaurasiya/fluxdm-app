import dotenv from 'dotenv';
dotenv.config();

export const APP_SECRET = process.env.META_APP_SECRET || '';
export const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || '';
