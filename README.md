# Inled Iccount

Proveedor de identidad (OAuth 2.0 + OpenID Connect) del ecosistema de Inled Group y de
desarrolladores externos. Zero-knowledge por diseño: el servidor nunca ve la contraseña ni el
perfil en claro.

- **Runtime:** Cloudflare Workers (TypeScript)
- **Router:** Hono (entrada del Worker) + Astro 7 para las páginas
- **Datos:** Cloudflare D1 (usuarios, clientes OAuth y códigos temporales)
- **Cripto:** Web Crypto API + `jose` (ES256)
- **Sin KV:** la sesión SSO es una cookie JWT firmada y los códigos viven en D1

---

## Puesta en marcha local

Requisitos: Node 22+ y una cuenta de Cloudflare solo para desplegar (en local no hace falta).

```bash
npm install
npm run gen:keys     # crea .dev.vars con PEPPER_KEY, SERVER_ENC_KEY, SIGNING_JWK
npm run db:init      # aplica schema.sql en la D1 local (.wrangler/state)
npm run db:seed      # clientes OAuth de demostración (solo desarrollo)
npm run dev
```

Abre <http://localhost:4321>. El servidor de desarrollo ejecuta el Worker real (workerd) con D1
local, así que las rutas de Hono y las páginas de Astro comparten entorno, base de datos y sesión.

> Si `npm run dev` dice que ya hay otro servidor: `npx astro dev stop`.

### Comandos útiles

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Worker + Astro en local (puerto 4321) |
| `npm run check` | Typecheck de todo el proyecto (`astro check`) |
| `npm run build` | `astro check` + build del Worker |
| `npm run test:e2e` | Smoke test del flujo completo (requiere `npm run dev` en marcha) |
| `npm run db:init` / `db:init:remote` | Aplicar el esquema en D1 local / remota |
| `npm run gen:keys -- --force` | Rotar los secretos locales |

---

## Probarlo en local

### 1. Flujo completo automatizado

Con `npm run dev` funcionando, en otra terminal:

```bash
npm run test:e2e
```

El script (`scripts/e2e-check.mjs`) usa el **mismo** `src/lib/crypto-client.js` que el navegador y
comprueba, contra el servidor real:

- registro zero-knowledge y login derivando claves en cliente;
- `/api/auth/me`, sesión y logout;
- autorización OAuth con PKCE, pantalla de consentimiento y canje del código;
- que el código es de un solo uso y que un `code_verifier` incorrecto falla;
- `id_token` verificado con el JWKS (ES256), `nonce` y `at_hash`;
- `/oauth/userinfo` con Bearer token y rechazo de tokens manipulados;
- cliente de primera parte (sin consentimiento) y cliente confidencial (HTTP Basic);
- `redirect_uri` no registrada y PKCE obligatorio.

### 2. A mano en el navegador

1. **Registro:** <http://localhost:4321/register>. Al terminar se muestra la **Recovery Key**;
   descárgala. Puedes activar la copia recuperable del perfil para que el servidor pueda devolver
   claims `email`/`name` en `/userinfo`.
2. **Sesión:** <http://localhost:4321/developers> crea un cliente OAuth. Verás el `client_secret`
   una sola vez.
3. **OAuth:** monta la URL de autorización y ábrela:

   ```
   http://localhost:4321/oauth/authorize?response_type=code
     &client_id=ic_demo_spa
     &redirect_uri=http%3A%2F%2Flocalhost%3A4321%2Fdemo-callback
     &scope=openid%20profile%20email
     &state=abc
     &code_challenge=<S256 del verifier>
     &code_challenge_method=S256
   ```

   `ic_demo_spa` (terceros) muestra la pantalla de consentimiento; `ic_inled_notes` (primera parte,
   secreto `dev-secret-change-me`) la omite. El callback de demo no existe como página, así que el
   navegador acabará en un 404 con `?code=...` en la URL: es lo esperado, el código ya está emitido.

Los clientes de `seeds.sql` solo existen en local.

---

## Superficie HTTP

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/.well-known/openid-configuration` | Descubrimiento OIDC |
| GET | `/jwks.json` | Clave pública ES256 |
| GET | `/oauth/authorize` | Authorization Code + PKCE S256 |
| POST | `/oauth/authorize/decision` | Consentimiento (formulario) |
| POST | `/oauth/token` | Canje del código (`authorization_code`) |
| GET | `/oauth/userinfo` | Claims del usuario (Bearer) |
| POST | `/api/auth/salt` | Parámetros KDF del email (con señuelo determinista) |
| POST | `/api/auth/register` | Alta zero-knowledge |
| POST | `/api/auth/login` | Verificación de `authKey` + cookie de sesión |
| POST | `/api/auth/logout` | Borra la cookie |
| GET | `/api/auth/session` | `sub` de la sesión actual |
| GET | `/api/auth/me` | Material cifrado del propio usuario |
| DELETE | `/api/auth/account` | Eliminar la cuenta (exige la contraseña) |
| GET/POST | `/api/clients` | Listar / registrar clientes OAuth |
| DELETE | `/api/clients/:id` | Eliminar un cliente propio |

PKCE (`S256`) es obligatorio para **todos** los clientes, también confidenciales (RFC 9700).

### Botón de acceso para otras webs

`public/iccount.js` es el equivalente a "Sign in with Google": se carga desde Iccount y pinta el
botón, hace PKCE, canjea el código y expone el usuario. No se descarga: se referencia por URL.

```html
<script src="https://iccount.inled.es/iccount.js"
        data-client-id="ic_..."
        data-redirect-uri="https://miapp.example/callback"></script>

<div data-iccount-login></div>

<script>
  Iccount.on('signedin', ({ user }) => console.log(user.sub, user.email));
</script>
```

La documentación para integradores (y para pasarle a una IA) está en
`public/iccount-ai-brief.md`, enlazada desde **Developer options**.

### Idioma y sesión

- La interfaz está en español e inglés según `Accept-Language` (inglés por defecto).
- Con sesión iniciada, `/`, `/login` y `/register` redirigen a `/account`.
- Tras registrarse, `/account?welcome=1` muestra la bienvenida y la clave de recuperación (una sola
  vez, vía `sessionStorage`), con botón de descarga.

---

## Cómo funciona el zero-knowledge

### Derivación en el navegador (`src/lib/crypto-client.js`)

1. `masterBits = PBKDF2-SHA256(password, kdfSalt, 600.000 iteraciones)` → 256 bits.
2. `authKey = HKDF-SHA256(masterBits, salt="iccount-hkdf-v1", info="iccount/auth/v1")` → se envía.
3. `encryptionKey = HKDF-SHA256(..., info="iccount/enc/v1")` → **nunca sale del navegador**.
4. Se genera una `userKey` AES-256-GCM aleatoria:
   - cifra `encrypted_email` y `encrypted_profile` (nombre, avatar, email);
   - se envuelve con `encryptionKey` → `encrypted_user_key`;
   - se envuelve con la Recovery Key → `recovery_wrapped_user_key`.

### Servidor

- `email_blind_index = HMAC-SHA256(email normalizado, subclave HKDF de PEPPER_KEY)`.
  Búsqueda O(1) sin guardar el email.
- `auth_hash = HMAC-SHA256(authKey, otra subclave de PEPPER_KEY)`. Comparación en tiempo constante.
- `/api/auth/salt` devuelve parámetros **falsos pero deterministas** para emails inexistentes, para
  no convertirse en un oráculo de cuentas.
- Si el usuario acepta `email_recoverable`, se guarda además `recoverable_profile` cifrado con
  AES-256-GCM y `SERVER_ENC_KEY`: es lo único que permite devolver claims `email`/`name`/`picture`
  en OIDC y mostrar el perfil en la pantalla de consentimiento.
- Los códigos de autorización se guardan como `SHA-256` y se consumen con
  `DELETE ... RETURNING`, garantizando un único uso. Los caducados se purgan en cada emisión/canje.

### Sesión SSO

Cookie `iccount_session`: JWT ES256 con `aud="iccount:session"`, `HttpOnly; Secure; SameSite=Lax`,
12 h por defecto (`SESSION_TTL`). El `aud` separa sesión, petición de consentimiento, access token e
`id_token`, de modo que ningún token sirve en otro contexto.

---

## Despliegue

```bash
npx wrangler d1 create iccount          # copia el database_id a wrangler.jsonc
npm run db:init:remote

npx wrangler secret put PEPPER_KEY      # 32 bytes base64url
npx wrangler secret put SERVER_ENC_KEY  # 32 bytes base64url
npx wrangler secret put SIGNING_JWK     # JWK privada ES256 (JSON, una línea)

npm run deploy
```

`wrangler.jsonc` ya declara el dominio propio `iccount.inled.es` (`routes` + `workers_dev: false`)
y las variables `ISSUER`, `ACCESS_TOKEN_TTL` y `SESSION_TTL`, así que `npm run deploy` publica
directamente en https://iccount.inled.es. Los secretos viven solo en Cloudflare; nunca en el repo.

---

## Decisiones y límites conocidos

- **La sesión es stateless.** Cerrar sesión borra la cookie, pero un JWT ya emitido sigue siendo
  válido hasta caducar. Para revocación inmediata haría falta una tabla de sesiones (o `jti` en D1).
- **`/userinfo` sin `email`.** Si el usuario no opta por la copia recuperable, el servidor no puede
  leer su email: el `sub` es el único identificador estable entre apps.
- **No hay verificación de email** (no se envían correos), así que no se emite `email_verified`.
- **Recovery Key:** se genera, se descarga y se guarda envuelta, pero el flujo de recuperación
  (reset de contraseña usando solo la Recovery Key) aún no está implementado.
- **Sin rate limiting.** En Workers sin KV/DO un contador fiable necesita D1 o Durable Objects;
  pendiente de decidir antes de exponerlo a internet.
- **Rotación de claves:** cambiar `SIGNING_JWK` invalida sesiones y access tokens vivos; no hay
  JWKS con varias claves todavía.
- **CSP** se aplica solo fuera de `localhost` (el cliente de Vite inyecta scripts en desarrollo).
- **Solo modo claro:** Apple HIG sin variante oscura, por decisión de producto.
- El botón embebible guarda el token en `sessionStorage`; para sesiones largas, canjea el código en
  tu backend y guarda el token en una cookie `HttpOnly`.
- Los secretos locales de `.dev.vars` y `.wrangler/` están fuera de git.

---

## Estructura

```
schema.sql               Esquema D1 (usuarios, clientes, códigos)
seeds.sql                Clientes OAuth de demo
wrangler.jsonc           Bindings: D1 + vars (sin KV)
src/app.ts               Entrada del Worker: Hono + Astro (`pages()`)
src/server/
  crypto.ts              HMAC, HKDF, blind index, AES-GCM de servidor
  jwt.ts                 Firma/verificación ES256, JWKS, at_hash
  session.ts             Cookie de sesión JWT
  db.ts                  Consultas D1 tipadas
  routes/                auth, oauth, clients, discovery
src/lib/crypto-client.js Criptografía del navegador (PBKDF2, HKDF, AES-GCM)
src/i18n.ts              Textos es/en y selección por Accept-Language
src/pages/               Landing, registro, login, cuenta, consentimiento, developer options
src/scripts/             Lógica de cliente de cada página
public/iccount.js        Botón embebible "Continuar con Iccount" (PKCE incluido)
public/iccount-ai-brief.md  Guía de integración para IAs
scripts/gen-keys.mjs     Generación de secretos locales
scripts/e2e-check.mjs    Smoke test del flujo completo
```
