/**
 * OAuth 2.1 Resource Server Middleware
 * Validates Stytch Connected Apps bearer tokens using direct JWT verification
 * via jose against the project's JWKS endpoint.
 *
 * When no token is present, returns 401 with WWW-Authenticate header
 * pointing to the protected resource metadata — this triggers Claude's
 * OAuth discovery + dynamic client registration flow.
 */

import { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/**
 * Lazily build a cached JWKS fetcher for the Stytch project's vanity domain.
 * Returns null if STYTCH_PROJECT_DOMAIN is not configured (OAuth disabled).
 */
function getJWKS(): ReturnType<typeof createRemoteJWKSet> | null {
  if (jwks) return jwks;

  const domain = process.env.STYTCH_PROJECT_DOMAIN;
  if (!domain) return null;

  // Stytch publishes JWKS at the standard OIDC path
  const jwksUrl = new URL('/.well-known/jwks.json', domain);
  jwks = createRemoteJWKSet(jwksUrl);
  return jwks;
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
 * - If Stytch is not configured (no STYTCH_PROJECT_DOMAIN), requests pass through (open mode).
 * - If Stytch is configured, a valid bearer token is required.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const keySet = getJWKS();

  // If Stytch is not configured, skip auth (open mode for local dev)
  if (!keySet) {
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
    // Validate signature, expiry, and issuer directly against the vanity domain
    const issuer = process.env.STYTCH_PROJECT_DOMAIN!;
    const { payload } = await jwtVerify(token, keySet, {
      issuer,
    });

    // Verify audience includes our resource identifier.
    // Without this, a token minted for another resource in the same Stytch project could be replayed.
    const resourceId = process.env.MCP_RESOURCE_IDENTIFIER;
    if (resourceId) {
      const aud: string[] = Array.isArray(payload.aud) ? payload.aud : (payload.aud ? [payload.aud] : []);
      if (!aud.includes(resourceId)) {
        console.error('[Auth] audience mismatch, aud =', aud, ', expected =', resourceId);
        res.setHeader('WWW-Authenticate', buildWwwAuthHeader(req));
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }

    (req as any).user = payload;
    return next();
  } catch (err) {
    console.error('[Auth] Token validation failed:', err);
    res.setHeader('WWW-Authenticate', buildWwwAuthHeader(req));
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
}

/**
 * Check if OAuth is enabled (Stytch project domain is set).
 */
export function isOAuthEnabled(): boolean {
  return !!process.env.STYTCH_PROJECT_DOMAIN;
}
