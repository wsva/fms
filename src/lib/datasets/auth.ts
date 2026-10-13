/**
 * Caller identity for dataset hub routes.
 *
 * Two producers hit these endpoints: the desktop app (OAuth2 Bearer token) and
 * the website UI (session cookie / API key). `checkAuthorization` already
 * accepts a Bearer token or the `access_token` cookie, so it covers the app and
 * OAuth-logged-in browsers; `resolveEmail` covers better-auth sessions and
 * `x-api-key`. The identity is the same string in both worlds — in this schema
 * an oauth2 `user_id` IS the email.
 */
import type { NextRequest } from 'next/server';
import { checkAuthorization } from '@/lib/oauth2';
import { resolveAuth, resolveEmail } from '@/lib/api-auth';

export type DatasetWriter = { email: string; readOnly: boolean };

/**
 * Identity for the two write endpoints (upload, card push). OAuth2 tokens and
 * browser sessions are full-access by definition; an `x-api-key` carries the
 * scope the owner granted it, and a read-only key must not write content.
 */
export async function resolveDatasetWriter(request: NextRequest): Promise<DatasetWriter | null> {
    const oauth = await checkAuthorization(request);
    if (oauth.authorized) {
        const id = oauth.email ?? oauth.token?.userId;
        if (id) return { email: id, readOnly: false };
    }
    const ctx = await resolveAuth(request);
    if (!ctx) return null;
    return { email: ctx.email, readOnly: ctx.scope !== 'write' };
}

export async function resolveDatasetUser(request: NextRequest): Promise<string | null> {
    const oauth = await checkAuthorization(request);
    if (oauth.authorized) {
        const id = oauth.email ?? oauth.token?.userId;
        if (id) return id;
    }
    return await resolveEmail(request);
}
