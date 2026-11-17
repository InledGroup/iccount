#!/usr/bin/env node
/**
 * Genera los secretos del Worker para desarrollo local y escribe `.dev.vars`.
 *
 *   node scripts/gen-keys.mjs [--force]
 *
 * En producción cada valor se instala como secreto:
 *   npx wrangler secret put PEPPER_KEY
 *   npx wrangler secret put SERVER_ENC_KEY
 *   npx wrangler secret put SIGNING_JWK
 */

import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';

const target = '.dev.vars';
const force = process.argv.includes('--force');

if (existsSync(target) && !force) {
  console.error(`${target} ya existe. Usa --force para sobrescribirlo (rotará las claves).`);
  process.exit(1);
}

const seed = randomBytes(32).toString('base64url');
const serverKey = randomBytes(32).toString('base64url');

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = privateKey.export({ format: 'jwk' });
const signingJwk = JSON.stringify({
  kty: jwk.kty,
  crv: jwk.crv,
  x: jwk.x,
  y: jwk.y,
  d: jwk.d,
  alg: 'ES256',
});

const contents = [
  '# Generado por scripts/gen-keys.mjs — no lo subas al repositorio.',
  `PEPPER_KEY=${seed}`,
  `SERVER_ENC_KEY=${serverKey}`,
  `SIGNING_JWK=${signingJwk}`,
  'ISSUER=http://localhost:4321',
  '',
].join('\n');

writeFileSync(target, contents, { mode: 0o600 });
console.log(`Escrito ${target} con PEPPER_KEY, SERVER_ENC_KEY, SIGNING_JWK e ISSUER local.`);
console.log('Para producción: npx wrangler secret put PEPPER_KEY (y SERVER_ENC_KEY, SIGNING_JWK).');
