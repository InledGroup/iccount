/**
 * Sesión SSO: un JWT ES256 en una cookie HttpOnly, Secure y SameSite=Lax.
 * No se usan sesiones en KV ni en D1: la cookie firmada es toda la sesión.
 */

import { SESSION_AUDIENCE, signJwt, verifyJwt } from './jwt';
import { randomToken } from './crypto';
import type { SessionClaims } from './types';

export const SESSION_COOKIE = 'iccount_session';

const DEFAULT_SESSION_TTL = 12 * 60 * 60;

export function sessionTtlSeconds(env: Env): number {
  const value = Number.parseInt(env.SESSION_TTL ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_SESSION_TTL;
}

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

export function buildSessionCookie(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}

export function buildClearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function createSession(
  env: Env,
  userId: string,
): Promise<{ cookie: string; claims: SessionClaims }> {
  const ttl = sessionTtlSeconds(env);
  const issuedAt = Math.floor(Date.now() / 1000);

  const token = await signJwt(env, {
    audience: SESSION_AUDIENCE,
    subject: userId,
    expiresInSeconds: ttl,
    claims: { auth_time: issuedAt, jti: randomToken(16), amr: ['pwd'] },
  });

  return {
    cookie: buildSessionCookie(token, ttl),
    claims: { sub: userId, authTime: issuedAt, expiresAt: issuedAt + ttl },
  };
}

export async function readSession(env: Env, request: Request): Promise<SessionClaims | null> {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const payload = await verifyJwt(env, token, SESSION_AUDIENCE);
  if (!payload || typeof payload.sub !== 'string') return null;

  return {
    sub: payload.sub,
    authTime: typeof payload.auth_time === 'number' ? payload.auth_time : (payload.iat ?? 0),
    expiresAt: payload.exp ?? 0,
  };
}
