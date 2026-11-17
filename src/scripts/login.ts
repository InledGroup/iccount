import { deriveKeys, isCryptoAvailable } from '../lib/crypto-client.js';
import { localeFromDocument, t } from '../i18n';

const locale = localeFromDocument();

const form = document.getElementById('login-form') as HTMLFormElement;
const errorBox = document.getElementById('form-error') as HTMLElement;
const status = document.getElementById('status') as HTMLElement;
const submit = document.getElementById('submit') as HTMLButtonElement;

function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/account';
  return value;
}

function showError(message: string): void {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

if (!isCryptoAvailable()) {
  showError(t(locale, 'login.errorGeneric'));
  submit.disabled = true;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;

  const data = new FormData(form);
  const email = String(data.get('email') ?? '').trim();
  const password = String(data.get('password') ?? '');

  if (!email || !password) {
    showError(t(locale, 'login.errorMissing'));
    return;
  }

  submit.disabled = true;
  status.hidden = false;

  try {
    const paramsResponse = await fetch('/api/auth/salt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!paramsResponse.ok) throw new Error(t(locale, 'login.errorGeneric'));

    const { kdfSalt, kdfIterations } = (await paramsResponse.json()) as {
      kdfSalt: string;
      kdfIterations: number;
    };

    const { authKey } = await deriveKeys({ password, salt: kdfSalt, iterations: kdfIterations });

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, authKey }),
    });

    if (!response.ok) throw new Error(t(locale, 'login.errorInvalid'));

    window.location.href = safeNext(String(data.get('next') ?? '/account'));
  } catch (error) {
    showError(error instanceof Error ? error.message : t(locale, 'login.errorGeneric'));
    status.hidden = true;
    submit.disabled = false;
  }
});
