/**
 * Iccount — botón "Continuar con Iccount" + flujo OAuth 2.0 (PKCE) listo para usar.
 *
 * Uso mínimo:
 *   <script src="https://iccount.inled.es/iccount.js"
 *           data-client-id="ic_..."
 *           data-redirect-uri="https://miapp.example/callback"></script>
 *   <div data-iccount-login></div>
 *
 * El script:
 *   - pinta el botón dentro de cada `[data-iccount-login]`
 *   - genera PKCE, redirige a /oauth/authorize y canjea el código al volver
 *   - expone `Iccount.user()`, `Iccount.getAccessToken()`, `Iccount.on(...)`
 *
 * Sin dependencias. Todo el estado del flujo vive en sessionStorage.
 */
(function () {
  'use strict';

  var STRINGS = {
    es: {
      continue: 'Continuar con Iccount',
      connecting: 'Conectando…',
      error: 'No se pudo iniciar sesión con Iccount.',
      missingClient: 'Iccount: falta data-client-id.',
    },
    en: {
      continue: 'Continue with Iccount',
      connecting: 'Connecting…',
      error: "Couldn't sign in with Iccount.",
      missingClient: 'Iccount: data-client-id is missing.',
    },
  };

  var currentScript = document.currentScript;
  var scriptOrigin = currentScript ? new URL(currentScript.src, location.href).origin : '';
  var dataset = (currentScript && currentScript.dataset) || {};

  var config = {
    issuer: dataset.issuer || scriptOrigin || 'https://iccount.inled.es',
    clientId: dataset.clientId || '',
    redirectUri: dataset.redirectUri || location.origin + location.pathname,
    scope: dataset.scope || 'openid profile email',
    afterSignIn: dataset.afterSignin || '',
    lang: dataset.lang || '',
  };

  function locale() {
    if (config.lang === 'es' || config.lang === 'en') return config.lang;
    var nav = (navigator.language || 'en').toLowerCase();
    return nav.indexOf('es') === 0 ? 'es' : 'en';
  }

  function text(key) {
    return STRINGS[locale()][key] || STRINGS.en[key];
  }

  function storageKey(name) {
    return 'iccount:' + (config.clientId || 'default') + ':' + name;
  }

  var LISTENERS = {};

  function on(event, handler) {
    if (typeof handler !== 'function') return function () {};
    (LISTENERS[event] = LISTENERS[event] || []).push(handler);
    return function off() {
      LISTENERS[event] = (LISTENERS[event] || []).filter(function (fn) {
        return fn !== handler;
      });
    };
  }

  function emit(event, detail) {
    (LISTENERS[event] || []).forEach(function (handler) {
      try {
        handler(detail);
      } catch (error) {
        console.error('[Iccount]', error);
      }
    });
    try {
      document.dispatchEvent(
        new CustomEvent('iccount:' + event, { detail: detail, bubbles: true }),
      );
    } catch (_) {
      /* CustomEvent no disponible: se ignora */
    }
  }

  // --- PKCE -----------------------------------------------------------------

  function base64Url(bytes) {
    var binary = '';
    var view = new Uint8Array(bytes);
    for (var i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function randomToken(byteLength) {
    var bytes = new Uint8Array(byteLength || 32);
    crypto.getRandomValues(bytes);
    return base64Url(bytes);
  }

  function sha256(value) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  }

  function challengeFor(verifier) {
    return sha256(verifier).then(function (digest) {
      return base64Url(digest);
    });
  }

  // --- Sesión local ---------------------------------------------------------

  function readSession() {
    try {
      var raw = sessionStorage.getItem(storageKey('session'));
      if (!raw) return null;
      var session = JSON.parse(raw);
      if (!session || !session.tokens || !session.tokens.access_token) return null;
      return session;
    } catch (_) {
      return null;
    }
  }

  function writeSession(session) {
    sessionStorage.setItem(storageKey('session'), JSON.stringify(session));
  }

  function isSignedIn() {
    var session = readSession();
    return Boolean(session && (!session.expiresAt || session.expiresAt > Date.now()));
  }

  function user() {
    var session = readSession();
    return session ? session.user || null : null;
  }

  function getAccessToken() {
    var session = readSession();
    if (!session || !session.expiresAt || session.expiresAt <= Date.now()) return null;
    return session.tokens.access_token || null;
  }

  function signOut() {
    sessionStorage.removeItem(storageKey('session'));
    emit('signedout', {});
  }

  // --- OAuth ----------------------------------------------------------------

  function authorizeUrl(overrides) {
    var clientId = (overrides && overrides.clientId) || config.clientId;
    if (!clientId) throw new Error(text('missingClient'));

    var verifier = randomToken(48);
    var state = randomToken(16);
    var redirectUri = (overrides && overrides.redirectUri) || config.redirectUri;
    var scope = (overrides && overrides.scope) || config.scope;

    sessionStorage.setItem(
      storageKey('pkce'),
      JSON.stringify({ verifier: verifier, state: state, redirectUri: redirectUri }),
    );

    return challengeFor(verifier).then(function (challenge) {
      var url = new URL('/oauth/authorize', config.issuer);
      url.search = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: scope,
        state: state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }).toString();
      return url.toString();
    });
  }

  function signIn(overrides) {
    return authorizeUrl(overrides).then(function (url) {
      location.assign(url);
      return url;
    });
  }

  function exchangeCode(code, pkce) {
    var body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code: code,
      redirect_uri: pkce.redirectUri,
      code_verifier: pkce.verifier,
    });

    return fetch(config.issuer + '/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }).then(function (response) {
      if (!response.ok) {
        return response.json().then(
          function (payload) {
            throw new Error(payload.error_description || payload.error || text('error'));
          },
          function () {
            throw new Error(text('error'));
          },
        );
      }
      return response.json();
    });
  }

  function fetchUser(accessToken) {
    var token = accessToken || getAccessToken();
    if (!token) return Promise.resolve(null);

    return fetch(config.issuer + '/oauth/userinfo', {
      headers: { authorization: 'Bearer ' + token },
    })
      .then(function (response) {
        if (!response.ok) return null;
        return response.json();
      })
      .catch(function () {
        return null;
      });
  }

  function cleanUrl() {
    try {
      var url = new URL(location.href);
      ['code', 'state', 'error', 'error_description'].forEach(function (param) {
        url.searchParams.delete(param);
      });
      history.replaceState({}, document.title, url.toString());
    } catch (_) {
      /* sin historial: se deja la URL como está */
    }
  }

  function handleCallback() {
    var params = new URLSearchParams(location.search);
    var code = params.get('code');
    var error = params.get('error');

    if (error) {
      cleanUrl();
      var message = params.get('error_description') || error;
      emit('error', { error: error, description: message });
      return Promise.reject(new Error(message));
    }

    if (!code) return Promise.resolve(user());

    var raw = sessionStorage.getItem(storageKey('pkce'));
    if (!raw) {
      return Promise.reject(new Error('Iccount: no authorization request in progress.'));
    }

    var pkce = JSON.parse(raw);
    if (params.get('state') !== pkce.state) {
      return Promise.reject(new Error('Iccount: invalid state.'));
    }

    return exchangeCode(code, pkce)
      .then(function (tokens) {
        return fetchUser(tokens.access_token).then(function (profile) {
          var session = {
            tokens: tokens,
            user: profile,
            expiresAt: Date.now() + (Number(tokens.expires_in) || 3600) * 1000,
          };
          writeSession(session);
          sessionStorage.removeItem(storageKey('pkce'));
          cleanUrl();
          emit('signedin', { user: profile, tokens: tokens });
          if (config.afterSignIn) location.assign(config.afterSignIn);
          return profile;
        });
      })
      .catch(function (problem) {
        emit('error', { error: 'callback_failed', description: problem.message });
        throw problem;
      });
  }

  // --- Botón ----------------------------------------------------------------

  var BUTTON_STYLE = [
    ':host{display:inline-block;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",system-ui,sans-serif}',
    'button{display:inline-flex;align-items:center;justify-content:center;gap:9px;height:44px;padding:0 20px;',
    'border:0;border-radius:980px;background:#1d1d1f;color:#fff;font:inherit;font-size:15px;font-weight:500;',
    'letter-spacing:-.01em;cursor:pointer;transition:background .16s ease,transform .16s ease;width:100%}',
    'button:hover{background:#000}',
    'button:active{transform:scale(.98)}',
    'button[disabled]{opacity:.6;cursor:default}',
    'img{width:18px;height:18px;display:block}',
    'button:focus-visible{outline:2px solid #0071e3;outline-offset:2px}',
  ].join('');

  function renderButton(container) {
    if (container.getAttribute('data-iccount-rendered') === 'true') return;
    container.setAttribute('data-iccount-rendered', 'true');

    var root = container.attachShadow ? container.attachShadow({ mode: 'open' }) : container;
    if (root === container) container.innerHTML = '';

    var style = document.createElement('style');
    style.textContent = BUTTON_STYLE;

    var button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('part', 'button');

    var logo = document.createElement('img');
    logo.src = config.issuer + '/inled-ring.png';
    logo.alt = '';
    logo.setAttribute('aria-hidden', 'true');

    var label = document.createElement('span');
    label.textContent = text('continue');

    button.appendChild(logo);
    button.appendChild(label);

    button.addEventListener('click', function () {
      button.disabled = true;
      label.textContent = text('connecting');
      signIn().catch(function (problem) {
        console.error('[Iccount]', problem);
        emit('error', { error: 'authorize_failed', description: problem.message });
        button.disabled = false;
        label.textContent = text('continue');
      });
    });

    if (root !== container) root.appendChild(style);
    root.appendChild(button);
  }

  function renderAll() {
    var containers = document.querySelectorAll('[data-iccount-login]');
    for (var i = 0; i < containers.length; i += 1) renderButton(containers[i]);
  }

  // --- API pública ----------------------------------------------------------

  function init(options) {
    if (options) {
      if (options.issuer) config.issuer = String(options.issuer).replace(/\/+$/, '');
      if (options.clientId) config.clientId = String(options.clientId);
      if (options.redirectUri) config.redirectUri = String(options.redirectUri);
      if (options.scope) config.scope = String(options.scope);
      if (options.afterSignIn) config.afterSignIn = String(options.afterSignIn);
      if (options.lang) config.lang = String(options.lang);
    }
    renderAll();
    emit('ready', { config: config, signedIn: isSignedIn(), user: user() });
    return api;
  }

  var api = {
    init: init,
    signIn: signIn,
    authorizeUrl: authorizeUrl,
    handleCallback: handleCallback,
    user: user,
    getUser: user,
    fetchUser: fetchUser,
    getAccessToken: getAccessToken,
    isSignedIn: isSignedIn,
    signOut: signOut,
    on: on,
    config: config,
  };

  window.Iccount = api;

  function boot() {
    // Si volvemos del IdP, se procesa el código antes de pintar nada más.
    var params = new URLSearchParams(location.search);
    if (params.has('code') || params.has('error')) {
      handleCallback().catch(function (problem) {
        console.error('[Iccount]', problem);
      });
    }
    renderAll();
    emit('ready', { config: config, signedIn: isSignedIn(), user: user() });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
