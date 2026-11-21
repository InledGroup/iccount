/**
 * Smoke test end-to-end contra el servidor de desarrollo.
 * Ejecutar con `npx astro dev` en marcha:  node scripts/e2e-check.mjs
 */

import assert from 'node:assert/strict';
import { importJWK, jwtVerify } from 'jose';

const clientCrypto = await import(new URL('../src/lib/crypto-client.js', import.meta.url));

const base = 'http://localhost:4321';
const redirectUri = 'http://localhost:4321/demo-callback';

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

const step = (name) => console.log(`✓ ${name}`);

async function pkce() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(digest)) };
}

// 1. Registro con la misma criptografía que usa el navegador -----------------
const email = `ada.${Date.now()}@example.com`;
const password = 'correct horse battery staple 42';

const { payload, recoveryKeyText } = await clientCrypto.createRegistrationMaterial({
  email,
  password,
  name: 'Ada Lovelace',
  picture: 'https://example.com/ada.png',
  emailRecoverable: true,
});

assert.match(recoveryKeyText, /^([0-9A-F]{8}-){7}[0-9A-F]{8}$/);

const register = await fetch(`${base}/api/auth/register`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
});
assert.equal(register.status, 201, await register.text());
const cookie = register.headers.getSetCookie()[0].split(';')[0];
step('registro zero-knowledge');

// 2. El salt público coincide y la derivación es determinista ---------------
const saltResponse = await fetch(`${base}/api/auth/salt`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email }),
});
const kdf = await saltResponse.json();
assert.equal(kdf.kdfSalt, payload.kdfSalt);
assert.equal(kdf.kdfIterations, 600000);

const loginKeys = await clientCrypto.deriveKeys({
  password,
  salt: kdf.kdfSalt,
  iterations: kdf.kdfIterations,
});
assert.equal(loginKeys.authKey, payload.authKey);

const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, authKey: loginKeys.authKey }),
});
assert.equal(login.status, 200, await login.text());
const loginCookie = login.headers.getSetCookie()[0].split(';')[0];
step('salt + login derivado en cliente');

const badLogin = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, authKey: b64url(crypto.getRandomValues(new Uint8Array(32))) }),
});
assert.equal(badLogin.status, 401);
step('login con authKey incorrecta rechazado');

// 3. /api/auth/me devuelve material cifrado y el email (opt-in) -------------
const me = await fetch(`${base}/api/auth/me`, { headers: { cookie } });
assert.equal(me.status, 200);
const meBody = await me.json();
assert.equal(meBody.user.email, email);
assert.ok(meBody.user.encryptedProfile);

const anonymous = await fetch(`${base}/api/auth/me`);
assert.equal(anonymous.status, 401);
step('/api/auth/me');

// 4. ID token verificable contra el JWKS -----------------------------------
const jwks = await (await fetch(`${base}/jwks.json`)).json();
assert.equal(jwks.keys.length, 1);
assert.equal(jwks.keys[0].alg, 'ES256');

// 5. Flujo OAuth completo con consentimiento (cliente de terceros) ----------
async function authorize(clientId, state) {
  const { verifier, challenge } = await pkce();
  const url = new URL(`${base}/oauth/authorize`);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'openid profile email',
    state,
    nonce: 'nonce-123',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();

  const response = await fetch(url, { redirect: 'manual', headers: { cookie } });
  return { response, verifier, url };
}

const first = await authorize('ic_demo_spa', 'state-abc');
assert.equal(first.response.status, 302);
const consentLocation = first.response.headers.get('location');
assert.ok(consentLocation?.startsWith('/consent?request='), consentLocation);

const consentPage = await fetch(new URL(consentLocation, base), { headers: { cookie } });
const consentHtml = await consentPage.text();
assert.equal(consentPage.status, 200);
assert.ok(consentHtml.includes('Inled Demo (SPA)'));
assert.ok(consentHtml.includes('Ada Lovelace'));
step('consentimiento renderizado con el cliente y el perfil');

const requestToken = new URL(consentLocation, base).searchParams.get('request');
const decision = await fetch(`${base}/oauth/authorize/decision`, {
  method: 'POST',
  redirect: 'manual',
  headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ request: requestToken, decision: 'approve' }),
});
assert.equal(decision.status, 302);
const callback = new URL(decision.headers.get('location'));
assert.equal(callback.origin + callback.pathname, redirectUri);
assert.equal(callback.searchParams.get('state'), 'state-abc');
const code = callback.searchParams.get('code');
assert.ok(code);
step('código de autorización emitido tras aprobar');

const tokenResponse = await fetch(`${base}/oauth/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: 'ic_demo_spa',
    code,
    redirect_uri: redirectUri,
    code_verifier: first.verifier,
  }),
});
const tokenText = await tokenResponse.text();
assert.equal(tokenResponse.status, 200, tokenText);
const tokens = JSON.parse(tokenText);
assert.ok(tokens.access_token);
assert.ok(tokens.id_token);
step('canje de código con PKCE');

const reused = await fetch(`${base}/oauth/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: 'ic_demo_spa',
    code,
    redirect_uri: redirectUri,
    code_verifier: first.verifier,
  }),
});
assert.equal(reused.status, 400);
assert.equal((await reused.json()).error, 'invalid_grant');
step('código de un solo uso');

// 6. id_token firmado y userinfo ------------------------------------------
const publicKey = await importJWK(jwks.keys[0], 'ES256');
const { payload: idToken } = await jwtVerify(tokens.id_token, publicKey, {
  issuer: base,
  audience: 'ic_demo_spa',
});
assert.equal(idToken.nonce, 'nonce-123');
assert.equal(idToken.email, email);
assert.equal(idToken.name, 'Ada Lovelace');
assert.ok(idToken.at_hash);
step('id_token verificado con ES256 + JWKS');

const userinfo = await fetch(`${base}/oauth/userinfo`, {
  headers: { authorization: `Bearer ${tokens.access_token}` },
});
assert.equal(userinfo.status, 200);
const claims = await userinfo.json();
assert.equal(claims.email, email);
assert.equal(claims.name, 'Ada Lovelace');
assert.equal(claims.picture, 'https://example.com/ada.png');
step('userinfo con Bearer token');

const tampered = await fetch(`${base}/oauth/userinfo`, {
  headers: { authorization: `Bearer ${tokens.access_token.slice(0, -4)}AAAA` },
});
assert.equal(tampered.status, 401);
step('access token manipulado rechazado');

// 7. Code verifier incorrecto --------------------------------------------
const second = await authorize('ic_demo_spa', 'state-def');
const secondToken = new URL(second.response.headers.get('location'), base).searchParams.get('request');
const secondDecision = await fetch(`${base}/oauth/authorize/decision`, {
  method: 'POST',
  redirect: 'manual',
  headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ request: secondToken, decision: 'approve' }),
});
const secondCode = new URL(secondDecision.headers.get('location')).searchParams.get('code');
const badVerifier = await fetch(`${base}/oauth/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: 'ic_demo_spa',
    code: secondCode,
    redirect_uri: redirectUri,
    code_verifier: 'x'.repeat(43),
  }),
});
assert.equal(badVerifier.status, 400);
assert.equal((await badVerifier.json()).error, 'invalid_grant');
step('PKCE con verifier incorrecto rechazado');

// 8. Cliente de primera parte: sin pantalla de consentimiento --------------
const firstParty = await authorize('ic_inled_notes', 'state-ghi');
assert.equal(firstParty.response.status, 302);
const firstPartyCallback = new URL(firstParty.response.headers.get('location'));
assert.equal(firstPartyCallback.searchParams.get('state'), 'state-ghi');
const firstPartyCode = firstPartyCallback.searchParams.get('code');
assert.ok(firstPartyCode);
step('cliente de primera parte omite el consentimiento');

// The demo client secret lives only in the local, untracked seeds.sql.
const demoSecret = process.env.IC_DEMO_CLIENT_SECRET;
if (demoSecret) {
  const basic = Buffer.from(`ic_inled_notes:${demoSecret}`).toString('base64');
  const confidential = await fetch(`${base}/oauth/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: firstPartyCode,
      redirect_uri: redirectUri,
      code_verifier: firstParty.verifier,
    }),
  });
  const confidentialText = await confidential.text();
  assert.equal(confidential.status, 200, confidentialText);
  step('canje con client_secret (HTTP Basic)');
} else {
  step('canje con client_secret omitido (define IC_DEMO_CLIENT_SECRET)');
}

const wrongSecret = await fetch(`${base}/oauth/token`, {
  method: 'POST',
  headers: {
    'content-type': 'application/x-www-form-urlencoded',
    authorization: `Basic ${Buffer.from('ic_inled_notes:wrong').toString('base64')}`,
  },
  body: new URLSearchParams({ grant_type: 'authorization_code', code: 'nope', redirect_uri: redirectUri }),
});
assert.equal(wrongSecret.status, 401);
step('client_secret incorrecto rechazado');

// 9. Validaciones del endpoint de autorización ----------------------------
const badRedirect = await fetch(
  `${base}/oauth/authorize?response_type=code&client_id=ic_demo_spa&redirect_uri=https%3A%2F%2Fevil.example%2Fcb&code_challenge=${'a'.repeat(43)}&code_challenge_method=S256`,
  { redirect: 'manual', headers: { cookie } },
);
assert.equal(badRedirect.status, 400);
step('redirect_uri no registrada rechazada');

const withoutPkce = await fetch(
  `${base}/oauth/authorize?response_type=code&client_id=ic_demo_spa&redirect_uri=${encodeURIComponent(redirectUri)}`,
  { redirect: 'manual', headers: { cookie } },
);
assert.equal(withoutPkce.status, 302);
assert.ok(withoutPkce.headers.get('location')?.includes('error=invalid_request'));
step('PKCE obligatorio');

// 10. Sesión con cookie ---------------------------------------------------
const session = await fetch(`${base}/api/auth/session`, { headers: { cookie: loginCookie } });
assert.equal(session.status, 200);
const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { cookie } });
assert.equal(logout.status, 200);
step('sesión y logout');

// 11. Eliminar cuenta ------------------------------------------------------
const wrongPassword = await fetch(`${base}/api/auth/account`, {
  method: 'DELETE',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({ authKey: b64url(crypto.getRandomValues(new Uint8Array(32))) }),
});
assert.equal(wrongPassword.status, 401);
step('eliminar cuenta exige la contraseña correcta');

const deleted = await fetch(`${base}/api/auth/account`, {
  method: 'DELETE',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({ authKey: loginKeys.authKey }),
});
assert.equal(deleted.status, 200, await deleted.text());

const afterDelete = await fetch(`${base}/api/auth/me`, { headers: { cookie } });
assert.equal(afterDelete.status, 401);

const loginAfterDelete = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, authKey: loginKeys.authKey }),
});
assert.equal(loginAfterDelete.status, 401);
step('cuenta eliminada: sesión y credenciales invalidadas');

console.log('\nTodo correcto.');
