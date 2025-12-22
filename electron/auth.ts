import { startOAuthServer } from './auth/server';

/**
 * Main entry point for Facebook/Instagram OAuth authentication
 * 
 * This function starts the OAuth loopback server and returns a promise
 * that resolves with the access token when authentication is complete.
 */
export function startFacebookAuth(): Promise<string> {
    return startOAuthServer();
}
