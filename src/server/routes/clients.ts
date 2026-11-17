/** Registro de clientes OAuth por parte de desarrolladores autenticados. */

import { Hono } from 'hono';
import { randomToken, sha256Base64Url } from '../crypto';
import {
  deleteClient,
  findUserById,
  insertClient,
  listClientsByOwner,
  nowSeconds,
  parseRedirectUris,
  type ClientRow,
} from '../db';
import { readSession } from '../session';
import { NO_STORE, rejectCrossOrigin } from '../http';
import { SUPPORTED_SCOPES } from './oauth';
import type { AppEnv } from '../types';

const clients = new Hono<AppEnv>();

const DEFAULT_SCOPES = ['openid', 'profile', 'email'];

function validateRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.hash) return false;
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function serialiseClient(client: ClientRow) {
  return {
    clientId: client.client_id,
    name: client.name,
    redirectUris: parseRedirectUris(client),
    scopes: client.scopes.split(/\s+/).filter(Boolean),
    isPublic: client.client_secret_hash === null,
    isFirstParty: client.is_first_party === 1,
    createdAt: client.created_at,
  };
}

clients.get('/clients', async (c) => {
  const session = await readSession(c.env, c.req.raw);
  if (!session) return c.json({ error: 'unauthenticated' }, 401, NO_STORE);

  const user = await findUserById(c.env.DB, session.sub);
  if (!user) return c.json({ error: 'unauthenticated' }, 401, NO_STORE);

  const rows = await listClientsByOwner(c.env.DB, session.sub);
  return c.json({ clients: rows.map(serialiseClient) }, 200, NO_STORE);
});

clients.post('/clients', async (c) => {
  const crossOrigin = rejectCrossOrigin(c);
  if (crossOrigin) return crossOrigin;

  const session = await readSession(c.env, c.req.raw);
  if (!session) return c.json({ error: 'unauthenticated' }, 401, NO_STORE);

  const user = await findUserById(c.env.DB, session.sub);
  if (!user) return c.json({ error: 'unauthenticated' }, 401, NO_STORE);

  interface ClientBody {
    name?: unknown;
    redirectUris?: unknown;
    scopes?: unknown;
  }

  const body = await c
    .req
    .json<ClientBody>()
    .catch(() => ({}) as ClientBody);

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 2 || name.length > 100) {
    return c.json({ error: 'invalid_name' }, 400, NO_STORE);
  }

  if (!Array.isArray(body.redirectUris) || body.redirectUris.length === 0 || body.redirectUris.length > 10) {
    return c.json({ error: 'invalid_redirect_uris' }, 400, NO_STORE);
  }
  const redirectUris = body.redirectUris.filter(
    (uri: unknown): uri is string => typeof uri === 'string' && validateRedirectUri(uri),
  );
  if (redirectUris.length !== body.redirectUris.length) {
    return c.json({ error: 'invalid_redirect_uris' }, 400, NO_STORE);
  }

  const requestedScopes = Array.isArray(body.scopes)
    ? body.scopes.filter(
        (scope: unknown): scope is string =>
          typeof scope === 'string' && (SUPPORTED_SCOPES as readonly string[]).includes(scope),
      )
    : DEFAULT_SCOPES;
  if (requestedScopes.length === 0) {
    return c.json({ error: 'invalid_scopes' }, 400, NO_STORE);
  }

  // Los clientes creados por API son siempre de terceros: is_first_party se
  // reserva a los clientes oficiales, que se aprovisionan fuera de banda.
  const clientId = `ic_${randomToken(18)}`;
  const clientSecret = randomToken(32);

  await insertClient(c.env.DB, {
    clientId,
    clientSecretHash: await sha256Base64Url(clientSecret),
    ownerUserId: session.sub,
    name,
    redirectUris,
    scopes: [...new Set(requestedScopes)].join(' '),
    createdAt: nowSeconds(),
  });

  return c.json(
    {
      client: {
        clientId,
        clientSecret,
        name,
        redirectUris,
        scopes: [...new Set(requestedScopes)],
        createdAt: nowSeconds(),
      },
      warning: 'El client_secret no se volverá a mostrar.',
    },
    201,
    NO_STORE,
  );
});

clients.delete('/clients/:clientId', async (c) => {
  const crossOrigin = rejectCrossOrigin(c);
  if (crossOrigin) return crossOrigin;

  const session = await readSession(c.env, c.req.raw);
  if (!session) return c.json({ error: 'unauthenticated' }, 401, NO_STORE);

  const user = await findUserById(c.env.DB, session.sub);
  if (!user) return c.json({ error: 'unauthenticated' }, 401, NO_STORE);

  const removed = await deleteClient(c.env.DB, c.req.param('clientId'), session.sub);
  if (!removed) return c.json({ error: 'not_found' }, 404, NO_STORE);

  return c.json({ ok: true }, 200, NO_STORE);
});

export default clients;
