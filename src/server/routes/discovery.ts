import type { Hono } from 'hono';
import { issuerFor, publicJwks } from '../jwt';
import type { AppEnv } from '../types';
import { SUPPORTED_SCOPES } from './oauth';

const CACHE_ONE_HOUR = { 'cache-control': 'public, max-age=3600' } as const;

export function mountDiscovery(app: Hono<AppEnv>): void {
  app.get('/.well-known/openid-configuration', async (c) => {
    const issuer = issuerFor(c.env);

    return c.json(
      {
        issuer,
        authorization_endpoint: `${issuer}/oauth/authorize`,
        token_endpoint: `${issuer}/oauth/token`,
        userinfo_endpoint: `${issuer}/oauth/userinfo`,
        jwks_uri: `${issuer}/jwks.json`,
        scopes_supported: [...SUPPORTED_SCOPES],
        response_types_supported: ['code'],
        response_modes_supported: ['query'],
        grant_types_supported: ['authorization_code'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: [
          'client_secret_basic',
          'client_secret_post',
          'none',
        ],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['ES256'],
        claims_supported: [
          'iss',
          'sub',
          'aud',
          'exp',
          'iat',
          'auth_time',
          'nonce',
          'at_hash',
          'azp',
          'name',
          'picture',
          'email',
        ],
      },
      200,
      CACHE_ONE_HOUR,
    );
  });

  app.get('/jwks.json', async (c) => c.json(await publicJwks(c.env), 200, CACHE_ONE_HOUR));
}
