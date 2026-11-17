/**
 * OAuth 2.0 (authorization code + PKCE) y OpenID Connect.
 *
 * Decisiones:
 *  - PKCE S256 es obligatorio para todos los clientes (RFC 9700).
 *  - Los códigos son opacos, se guardan hasheados y se consumen de forma
 *    atómica con DELETE ... RETURNING (un único uso garantizado).
 *  - El consentimiento viaja en un JWT firmado (`request`), así no hace falta
 *    almacenar estado de la petición ni usar KV.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  openFromServer,
  randomToken,
  sha256Base64Url,
  timingSafeEqual,
} from '../crypto';
import {
  consumeCode,
  findClient,
  findUserById,
  insertCode,
  nowSeconds,
  parseRedirectUris,
  purgeExpiredCodes,
  type ClientRow,
  type UserRow,
} from '../db';
import {
  OAUTH_REQUEST_AUDIENCE,
  accessTokenHash,
  signJwt,
  verifyJwt,
  verifyJwtAnyAudience,
} from '../jwt';
import { buildClearedSessionCookie, readSession } from '../session';
import { NO_STORE, rejectCrossOrigin } from '../http';
import type { AppEnv } from '../types';
import type { Context } from 'hono';

export const SUPPORTED_SCOPES = ['openid', 'profile', 'email'] as const;

const CODE_TTL_SECONDS = 60;
const CONSENT_TTL_SECONDS = 10 * 60;
const DEFAULT_ACCESS_TOKEN_TTL = 3600;
const PKCE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

const oauth = new Hono<AppEnv>();

// El intercambio de código puede ocurrir en el navegador de una SPA pública:
// no se envían cookies, así que `*` no expone credenciales de sesión.
oauth.use('/token', cors({ origin: '*', allowMethods: ['POST'], allowHeaders: ['content-type', 'authorization'], maxAge: 600 }));
oauth.use('/userinfo', cors({ origin: '*', allowMethods: ['GET'], allowHeaders: ['authorization'], maxAge: 600 }));

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function htmlError(status: 400 | 401, message: string): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Error OAuth</title>` +
      `<body style="font:16px/1.5 system-ui;margin:4rem auto;max-width:32rem">` +
      `<h1>Solicitud no válida</h1><p>${message}</p></body>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', ...NO_STORE } },
  );
}

function redirectTo(uri: string, params: Record<string, string | null | undefined>): Response {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, value);
  }
  return new Response(null, {
    status: 302,
    headers: { location: url.toString(), ...NO_STORE },
  });
}

function resolveScopes(requested: string | null, client: ClientRow): string | null {
  const allowed = new Set(client.scopes.split(/\s+/).filter(Boolean));
  const list = (requested ?? 'openid profile').split(/\s+/).filter(Boolean);
  if (list.length === 0) return null;
  for (const scope of list) if (!allowed.has(scope)) return null;
  return [...new Set(list)].join(' ');
}

function oauthError(
  c: Context<AppEnv>,
  status: 400 | 401,
  error: string,
  description?: string,
): Response {
  const headers: Record<string, string> = { ...NO_STORE };
  if (status === 401) headers['www-authenticate'] = 'Basic realm="iccount"';
  return c.json({ error, ...(description ? { error_description: description } : {}) }, status, headers);
}

interface ClientCredentials {
  clientId: string;
  clientSecret: string | null;
}

function parseClientCredentials(
  authorization: string | undefined,
  form: Record<string, string | File>,
): ClientCredentials | null {
  if (authorization?.toLowerCase().startsWith('basic ')) {
    try {
      const decoded = new TextDecoder().decode(base64UrlDecodeOrBase64(authorization.slice(6).trim()));
      const separator = decoded.indexOf(':');
      if (separator === -1) return null;
      return {
        clientId: decodeURIComponent(decoded.slice(0, separator)),
        clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
      };
    } catch {
      return null;
    }
  }

  const clientId = typeof form.client_id === 'string' ? form.client_id : '';
  const clientSecret = typeof form.client_secret === 'string' ? form.client_secret : null;
  if (!clientId) return null;
  return { clientId, clientSecret };
}

/** HTTP Basic usa base64 estándar, no base64url. */
function base64UrlDecodeOrBase64(value: string): Uint8Array {
  const normalised = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalised + '='.repeat((4 - (normalised.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function claimsForUser(env: Env, user: UserRow, scopes: string, nonce: string | null) {
  const claims: Record<string, unknown> = { sub: user.id };
  if (nonce) claims.nonce = nonce;

  if (!user.email_recoverable || !user.recoverable_profile) return claims;

  const raw = await openFromServer(env, user.recoverable_profile);
  if (!raw) return claims;

  let profile: { email?: string | null; name?: string | null; picture?: string | null };
  try {
    profile = JSON.parse(raw);
  } catch {
    return claims;
  }

  if (scopes.split(' ').includes('email') && profile.email) claims.email = profile.email;
  if (scopes.split(' ').includes('profile')) {
    if (profile.name) claims.name = profile.name;
    if (profile.picture) claims.picture = profile.picture;
  }
  return claims;
}

function accessTokenTtl(env: Env): number {
  const parsed = Number.parseInt(env.ACCESS_TOKEN_TTL ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ACCESS_TOKEN_TTL;
}

// ---------------------------------------------------------------------------
// GET /oauth/authorize
// ---------------------------------------------------------------------------

oauth.get('/authorize', async (c) => {
  const params = c.req.query();
  const client = params.client_id ? await findClient(c.env.DB, params.client_id) : null;

  if (!client) return htmlError(400, 'El cliente OAuth no existe.');

  const redirectUri = params.redirect_uri ?? '';
  if (!parseRedirectUris(client).includes(redirectUri)) {
    return htmlError(400, 'La redirect_uri no está registrada para este cliente.');
  }

  const state = params.state ?? null;

  if (params.response_type !== 'code') {
    return redirectTo(redirectUri, {
      error: 'unsupported_response_type',
      error_description: 'Solo se admite response_type=code',
      state,
    });
  }

  const scope = resolveScopes(params.scope ?? null, client);
  if (!scope) {
    return redirectTo(redirectUri, {
      error: 'invalid_scope',
      error_description: 'El scope solicitado no está permitido para este cliente',
      state,
    });
  }

  const codeChallenge = params.code_challenge ?? '';
  const challengeMethod = params.code_challenge_method ?? (codeChallenge ? 'plain' : '');
  if (!PKCE_PATTERN.test(codeChallenge) || challengeMethod !== 'S256') {
    return redirectTo(redirectUri, {
      error: 'invalid_request',
      error_description: 'PKCE obligatorio con code_challenge_method=S256',
      state,
    });
  }

  const session = await readSession(c.env, c.req.raw);
  const requestUrl = new URL(c.req.url);

  if (session && !(await findUserById(c.env.DB, session.sub))) {
    c.header('set-cookie', buildClearedSessionCookie());
    return c.redirect('/', 302);
  }

  if (!session) {
    const returnTo = `${requestUrl.pathname}${requestUrl.search}`;
    return c.redirect(`/login?next=${encodeURIComponent(returnTo)}`, 302);
  }

  if (client.is_first_party === 1) {
    return issueAuthorizationCode(c, client, session.sub, session.authTime, {
      redirectUri,
      scope,
      state,
      nonce: params.nonce ?? null,
      codeChallenge,
    });
  }

  const requestToken = await signJwt(c.env, {
    audience: OAUTH_REQUEST_AUDIENCE,
    subject: session.sub,
    expiresInSeconds: CONSENT_TTL_SECONDS,
    claims: {
      client_id: client.client_id,
      redirect_uri: redirectUri,
      scope,
      state,
      nonce: params.nonce ?? null,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      auth_time: session.authTime,
    },
  });

  return c.redirect(`/consent?request=${encodeURIComponent(requestToken)}`, 302);
});

// ---------------------------------------------------------------------------
// POST /oauth/authorize/decision (formulario de consentimiento)
// ---------------------------------------------------------------------------

oauth.post('/authorize/decision', async (c) => {
  const crossOrigin = rejectCrossOrigin(c);
  if (crossOrigin) return crossOrigin;

  const body = await c.req.parseBody();
  const requestToken = typeof body.request === 'string' ? body.request : '';
  const decision = typeof body.decision === 'string' ? body.decision : '';

  const payload = requestToken
    ? await verifyJwt(c.env, requestToken, OAUTH_REQUEST_AUDIENCE)
    : null;
  if (!payload || typeof payload.sub !== 'string') {
    return htmlError(400, 'La solicitud de consentimiento ha caducado. Reinicia el acceso.');
  }

  const session = await readSession(c.env, c.req.raw);
  if (!session || session.sub !== payload.sub) {
    return c.redirect(`/login?next=${encodeURIComponent('/')}`, 302);
  }

  const client = await findClient(c.env.DB, String(payload.client_id));
  if (!client) return htmlError(400, 'El cliente OAuth ya no existe.');

  const redirectUri = String(payload.redirect_uri);
  const state = typeof payload.state === 'string' ? payload.state : null;

  if (decision !== 'approve') {
    return redirectTo(redirectUri, {
      error: 'access_denied',
      error_description: 'El usuario ha denegado el acceso',
      state,
    });
  }

  return issueAuthorizationCode(c, client, session.sub, session.authTime, {
    redirectUri,
    scope: String(payload.scope),
    state,
    nonce: typeof payload.nonce === 'string' ? payload.nonce : null,
    codeChallenge: String(payload.code_challenge),
  });
});

async function issueAuthorizationCode(
  c: Context<AppEnv>,
  client: ClientRow,
  userId: string,
  authTime: number,
  request: {
    redirectUri: string;
    scope: string;
    state: string | null;
    nonce: string | null;
    codeChallenge: string;
  },
): Promise<Response> {
  await purgeExpiredCodes(c.env.DB);

  const code = randomToken(32);
  await insertCode(c.env.DB, {
    code_hash: await sha256Base64Url(code),
    user_id: userId,
    client_id: client.client_id,
    redirect_uri: request.redirectUri,
    code_challenge: request.codeChallenge,
    code_challenge_method: 'S256',
    scopes: request.scope,
    nonce: request.nonce,
    auth_time: authTime,
    expires_at: nowSeconds() + CODE_TTL_SECONDS,
  });

  return redirectTo(request.redirectUri, { code, state: request.state });
}

// ---------------------------------------------------------------------------
// POST /oauth/token
// ---------------------------------------------------------------------------

oauth.post('/token', async (c) => {
  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    return oauthError(c, 400, 'invalid_request', 'Se esperaba application/x-www-form-urlencoded');
  }

  const form = await c.req.parseBody();

  const credentials = parseClientCredentials(c.req.header('authorization'), form);
  const client = credentials ? await findClient(c.env.DB, credentials.clientId) : null;
  if (!client || !credentials) return oauthError(c, 401, 'invalid_client');

  if (client.client_secret_hash) {
    if (!credentials.clientSecret) return oauthError(c, 401, 'invalid_client');
    const presented = await sha256Base64Url(credentials.clientSecret);
    if (!timingSafeEqual(presented, client.client_secret_hash)) {
      return oauthError(c, 401, 'invalid_client');
    }
  }

  if (form.grant_type !== 'authorization_code') {
    return oauthError(c, 400, 'unsupported_grant_type');
  }

  const code = typeof form.code === 'string' ? form.code : '';
  const redirectUri = typeof form.redirect_uri === 'string' ? form.redirect_uri : '';
  const codeVerifier = typeof form.code_verifier === 'string' ? form.code_verifier : '';

  if (!code || !redirectUri) return oauthError(c, 400, 'invalid_request', 'Faltan code o redirect_uri');
  if (!PKCE_PATTERN.test(codeVerifier)) {
    return oauthError(c, 400, 'invalid_request', 'code_verifier inválido');
  }

  const stored = await consumeCode(c.env.DB, await sha256Base64Url(code));
  const now = nowSeconds();

  if (
    !stored ||
    stored.client_id !== client.client_id ||
    stored.redirect_uri !== redirectUri ||
    stored.expires_at < now ||
    stored.code_challenge_method !== 'S256'
  ) {
    return oauthError(c, 400, 'invalid_grant');
  }

  const derivedChallenge = await sha256Base64Url(codeVerifier);
  if (!timingSafeEqual(derivedChallenge, stored.code_challenge)) {
    return oauthError(c, 400, 'invalid_grant');
  }

  const user = await findUserById(c.env.DB, stored.user_id);
  if (!user) return oauthError(c, 400, 'invalid_grant');

  const ttl = accessTokenTtl(c.env);
  const accessToken = await signJwt(c.env, {
    audience: client.client_id,
    subject: user.id,
    expiresInSeconds: ttl,
    claims: { scope: stored.scopes, client_id: client.client_id, auth_time: stored.auth_time },
  });

  const response: Record<string, unknown> = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ttl,
    scope: stored.scopes,
  };

  if (stored.scopes.split(' ').includes('openid')) {
    response.id_token = await signJwt(c.env, {
      audience: client.client_id,
      subject: user.id,
      expiresInSeconds: ttl,
      claims: {
        ...(await claimsForUser(c.env, user, stored.scopes, stored.nonce)),
        auth_time: stored.auth_time,
        at_hash: await accessTokenHash(accessToken),
        azp: client.client_id,
      },
    });
  }

  return c.json(response, 200, NO_STORE);
});

// ---------------------------------------------------------------------------
// GET /oauth/userinfo
// ---------------------------------------------------------------------------

oauth.get('/userinfo', async (c) => {
  const authorization = c.req.header('authorization') ?? '';
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return c.json({ error: 'invalid_token' }, 401, {
      ...NO_STORE,
      'www-authenticate': 'Bearer realm="iccount"',
    });
  }

  const payload = await verifyJwtAnyAudience(c.env, authorization.slice(7).trim());
  if (!payload || typeof payload.sub !== 'string' || typeof payload.aud !== 'string') {
    return c.json({ error: 'invalid_token' }, 401, {
      ...NO_STORE,
      'www-authenticate': 'Bearer error="invalid_token"',
    });
  }

  // El token debe haber sido emitido para un cliente registrado.
  const client = await findClient(c.env.DB, payload.aud);
  const user = await findUserById(c.env.DB, payload.sub);
  if (!client || !user) {
    return c.json({ error: 'invalid_token' }, 401, {
      ...NO_STORE,
      'www-authenticate': 'Bearer error="invalid_token"',
    });
  }

  const scope = typeof payload.scope === 'string' ? payload.scope : '';
  const claims = await claimsForUser(c.env, user, scope, null);

  return c.json(claims, 200, NO_STORE);
});

export default oauth;
