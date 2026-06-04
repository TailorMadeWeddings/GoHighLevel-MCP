/**
 * OAuth 2.1 Resource Server Middleware
 * Validates Stytch-issued bearer tokens on MCP transport routes.
 * When no token is present, returns 401 with WWW-Authenticate header
 * pointing to the protected resource metadata — this triggers Claude's
 * OAuth discovery + dynamic client registration flow.
 */

import { Request, Response, NextFunction } from 'express';
import * as stytch from 'stytch';

let stytchClient: stytch.Client | null = null;

/**
 * Lazily initialize the Stytch client.
 * Returns null if Stytch env vars are not configured (OAuth disabled).
 */
function getStytchClient(): stytch.Client | null {
  if (stytchClient) return stytchClient;

  const projectId = process.env.STYTCH_PROJECT_ID;
  const secret = process.env.STYTCH_SECRET;

  if (!projectId || !secret) {
    return null;
  }

  stytchClient = new stytch.Client({
    project_id: projectId,
    secret: secret,
  });

  return stytchClient;
}

/**
 * Build the WWW-Authenticate header value.
 * This header tells Claude where to find the protected resource metadata,
 * which in turn points to Stytch as the authorization server.
 */
function buildWwwAuthHeader(req: Request): string {
  const host = req.get('host');
  const proto = req.get('x-forwarded-proto') || req.protocol;
  return (
    `Bearer error="Unauthorized", ` +
    `error_description="Unauthorized", ` +
    `resource_metadata="${proto}://${host}/.well-known/oauth-protected-resource"`
  );
}

/**
 * Express middleware that enforces bearer token authentication.
 * - If Stytch is not configured (no env vars), requests pass through (open mode).
 * - If Stytch is configured, a valid bearer token is required.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = getStytchClient();

  // If Stytch is not configured, skip auth (open mode for local dev)
  if (!client) {
    return next();
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    res.setHeader('WWW-Authenticate', buildWwwAuthHeader(req));
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const tokenData = await client.idp.introspectTokenLocal(token);
    (req as any).user = tokenData;
    return next();
  } catch (err) {
    console.error('[Auth] Token validation failed:', err);
    res.setHeader('WWW-Authenticate', buildWwwAuthHeader(req));
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
}

/**
 * Check if OAuth is enabled (Stytch env vars are set).
 */
export function isOAuthEnabled(): boolean {
  return !!(process.env.STYTCH_PROJECT_ID && process.env.STYTCH_SECRET);
}
