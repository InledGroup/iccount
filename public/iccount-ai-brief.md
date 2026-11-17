# Integrating Inled Iccount — implementation brief for an AI agent

> **How to use this file:** paste it into your coding assistant and ask it to implement
> "Sign in with Iccount" in your project. Everything below is the complete contract: no other
> documentation is needed.

Inled Iccount is an OAuth 2.0 + OpenID Connect identity provider for the Inled Group ecosystem.
It issues authorization codes, access tokens (JWT, ES256) and ID tokens (JWT, ES256).

| Item | Value |
| --- | --- |
| Issuer | `https://iccount.inled.es` |
| Discovery | `https://iccount.inled.es/.well-known/openid-configuration` |
| Authorization endpoint | `https://iccount.inled.es/oauth/authorize` |
| Token endpoint | `https://iccount.inled.es/oauth/token` |
| UserInfo endpoint | `https://iccount.inled.es/oauth/userinfo` |
| JWKS | `https://iccount.inled.es/jwks.json` |
| Grant type | `authorization_code` only |
| PKCE | **Required** for every client, `code_challenge_method=S256` |
| Signing algorithm | `ES256` (EC P-256) |
| Scopes | `openid`, `profile`, `email` |

Rules you must not break:

1. Never put a `client_secret` in browser code. Browser apps are public clients: PKCE only.
2. Always send `state` and verify it on the callback.
3. `redirect_uri` must match a registered URI **exactly** (character for character).
4. Use PKCE `S256`; `plain` is rejected.
5. Codes are single use and expire in 60 seconds.

---

## Option A — drop-in button (recommended for websites and SPAs)

No dependencies, no build step. The script renders the button, handles PKCE, the redirect, the
token exchange and exposes the user.

### 1. Script tag

Put this in the page that has the button **and** in the callback page:

```html
<script
  src="https://iccount.inled.es/iccount.js"
  data-client-id="ic_XXXXXXXXXXXX"
  data-redirect-uri="https://your-app.example/auth/callback"
  data-scope="openid profile email"
  data-after-signin="/account"
></script>
```

- `data-client-id` — from **Iccount → Developer options**.
- `data-redirect-uri` — must be registered for that client. `http://localhost:PORT/...` is allowed
  for local development; anything else must be HTTPS.
- `data-after-signin` *(optional)* — where the browser goes after a successful callback.
  If omitted, the script stays on the callback page and fires the event.
- `data-lang="es|en"` *(optional)* — button language. Defaults to `navigator.language`.
- `data-issuer` *(optional)* — only needed if you self-host this script.

### 2. Button

```html
<div data-iccount-login></div>
```

That's it: the script renders a "Continue with Iccount" button inside the div. Style it from your
own CSS with `::part(button)`:

```css
[data-iccount-login]::part(button) {
  width: 100%;
  max-width: 320px;
}
```

### 3. Read the user

The callback page is `data-redirect-uri`. On success the script fires `signedin` with the user:

```html
<script>
  Iccount.on('signedin', ({ user }) => {
    // user = { sub, email?, name?, picture? }
    document.querySelector('#who').textContent = user.name || user.sub;
    // Redirect yourself if you did not use data-after-signin:
    // location.replace('/account');
  });

  Iccount.on('error', ({ description }) => console.error(description));

  // Already signed in earlier in this tab:
  const current = Iccount.user();
  const token = Iccount.getAccessToken(); // Bearer token for your API calls
</script>
```

API summary:

| Method | Description |
| --- | --- |
| `Iccount.user()` / `Iccount.getUser()` | Cached profile or `null`. |
| `Iccount.fetchUser()` | `GET /oauth/userinfo` with the stored token; returns the live profile. |
| `Iccount.getAccessToken()` | Access token string (or `null` if missing/expired). |
| `Iccount.isSignedIn()` | `true` while the token has not expired. |
| `Iccount.signIn(options?)` | Starts the redirect flow. Options: `clientId`, `redirectUri`, `scope`. |
| `Iccount.signOut()` | Clears the local session (the token is stateless and expires on its own). |
| `Iccount.on(event, handler)` | `ready`, `signedin`, `signedout`, `error`. Returns an unsubscribe function. |
| `Iccount.init({ clientId, redirectUri, scope, afterSignIn, lang })` | Manual initialisation when attributes are not available. |

The script keeps everything in `sessionStorage` under `iccount:<clientId>:*`. Access tokens are
short lived (1 hour by default). For long-lived sessions in production, exchange the code on your
own backend (Option B) and keep the token in an `HttpOnly` cookie.

### 4. Local test

Add `http://localhost:4321/auth/callback` (your real port and path) as a redirect URI in
**Developer options**, then open your site, click the button, create an account, and approve the
consent screen.

---

## Option B — manual flow (any language, backend included)

### Step 1 — Authorization request

Redirect the browser to:

```
https://iccount.inled.es/oauth/authorize
  ?response_type=code
  &client_id=ic_XXXXXXXXXXXX
  &redirect_uri=https%3A%2F%2Fyour-app.example%2Fauth%2Fcallback
  &scope=openid%20profile%20email
  &state=<random, stored in the user's session>
  &nonce=<random, only if you need an ID token>   (optional)
  &code_challenge=<BASE64URL(SHA256(verifier))>
  &code_challenge_method=S256
```

- Generate `code_verifier` as 43–128 characters from `[A-Za-z0-9-._~]` (32 random bytes,
  base64url-encoded, is perfect).
- `code_challenge` = base64url of the SHA-256 digest of the verifier (no padding).

If the user is not signed in, Iccount redirects to its login/registration page and comes back.
If the client is third-party, a consent screen is shown. First-party Inled clients skip it.

### Step 2 — Callback

The browser lands on your `redirect_uri` with:

```
?code=<authorization code>&state=<the state you sent>
```

Verify `state`, then exchange the code **server-side**:

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=<code>
&redirect_uri=<same exact URI>
&code_verifier=<verifier>
&client_id=<client_id>
&client_secret=<secret>     ← confidential clients only, never in a browser
```

Confidential clients may authenticate with HTTP Basic instead:

```
Authorization: Basic base64(client_id:client_secret)
```

Response:

```json
{
  "access_token": "<JWT ES256>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "openid profile email",
  "id_token": "<JWT ES256>"
}
```

`id_token` is present only when `openid` was requested. Errors are plain OAuth 2.0:

```json
{ "error": "invalid_grant", "error_description": "..." }
```

### Step 3 — Identify the user

Call UserInfo with the access token:

```http
GET /oauth/userinfo
Authorization: Bearer <access_token>
```

```json
{
  "sub": "1f0c...uuid",
  "name": "Ada Lovelace",
  "picture": "https://...",
  "email": "ada@example.com"
}
```

`sub` is the only guaranteed claim and never changes: **use it as your primary key**, not email.

If you need to verify the ID token yourself (server-side, recommended for confidential clients):

```js
import { importJWK, jwtVerify } from 'jose';

const jwks = await (await fetch('https://iccount.inled.es/jwks.json')).json();
const key = await importJWK(jwks.keys[0], 'ES256');

const { payload } = await jwtVerify(idToken, key, {
  issuer: 'https://iccount.inled.es',
  audience: '<your client_id>',
});
// payload.sub, payload.email?, payload.name?, payload.nonce, payload.auth_time
```

---

## Scopes and claims

| Scope | Claims returned |
| --- | --- |
| `openid` | `sub`, `auth_time`, `nonce`, `at_hash` (in the ID token) |
| `profile` | `name`, `picture` |
| `email` | `email` |

**Important:** email, name and picture are only returned when the user opted in to sharing them
during registration ("Share my name and email with Inled apps", enabled by default). If the user
opted out, UserInfo returns only `sub`. Never implement logic that requires `email` to exist —
fall back to `sub`. There is no email verification yet, so `email_verified` is not sent.

---

## Errors

| Where | Error | Meaning |
| --- | --- | --- |
| `/oauth/authorize` | `invalid_request` | Missing PKCE / bad parameters |
| `/oauth/authorize` | `invalid_scope` | Scope not allowed for this client |
| `/oauth/authorize` | `access_denied` | User pressed Cancel |
| `/oauth/token` | `invalid_client` | Unknown client or wrong secret (HTTP 401) |
| `/oauth/token` | `invalid_grant` | Code expired, reused, wrong `redirect_uri`, or wrong `code_verifier` |
| `/oauth/token` | `unsupported_grant_type` | Only `authorization_code` is supported |
| `/oauth/userinfo` | `invalid_token` | Missing, expired or tampered Bearer token (HTTP 401) |

Handle `error` on the callback for every case and show a retry button.

---

## Checklist for the implementation

- [ ] Register the app in **Iccount → Developer options** and copy the `client_id`.
- [ ] Add the exact redirect URI (`https://` or `http://localhost`).
- [ ] Add the button (Option A) or the PKCE redirect (Option B).
- [ ] Create the callback route/page and verify `state`.
- [ ] Persist the session server-side if you have a backend; never trust the browser alone.
- [ ] Store the user keyed by `sub`.
- [ ] Add a sign-out that clears your session and calls `Iccount.signOut()` in the browser.
- [ ] Test: happy path, cancel consent, expired code, wrong secret (expect the errors above).

---

## Local development

- Issuer in local: `http://localhost:4321` (`npm run dev` in the Iccount repository).
- Demo third-party client: `ic_demo_spa`, redirect `http://localhost:4321/demo-callback`
  (shows the consent screen).
- Demo first-party client: `ic_inled_notes`, secret `dev-secret-change-me`.
- Local accounts live in `.wrangler/state` (D1); reset with `npm run db:init`.
