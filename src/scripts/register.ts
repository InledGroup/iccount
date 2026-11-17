import { createRegistrationMaterial, isCryptoAvailable } from '../lib/crypto-client.js';
import { localeFromDocument, t } from '../i18n';

const locale = localeFromDocument();

const form = document.getElementById('register-form') as HTMLFormElement;
const errorBox = document.getElementById('form-error') as HTMLElement;
const status = document.getElementById('status') as HTMLElement;
const submit = document.getElementById('submit') as HTMLButtonElement;

const params = new URLSearchParams(window.location.search);

function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/account?welcome=1';
  return value;
}

const next = safeNext(params.get('next'));

function showError(message: string): void {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

if (!isCryptoAvailable()) {
  showError(t(locale, 'register.errorGeneric'));
  submit.disabled = true;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;

  const data = new FormData(form);
  const email = String(data.get('email') ?? '').trim();
  const name = String(data.get('name') ?? '').trim();
  const password = String(data.get('password') ?? '');
  const confirmation = String(data.get('password-confirm') ?? '');
  const emailRecoverable = data.get('recoverable') === 'on';

  if (!email.includes('@')) {
    showError(t(locale, 'register.errorEmail'));
    return;
  }
  if (password.length < 10) {
    showError(t(locale, 'register.errorPassword'));
    return;
  }
  if (password !== confirmation) {
    showError(t(locale, 'register.errorMismatch'));
    return;
  }

  submit.disabled = true;
  status.hidden = false;

  try {
    const { payload, recoveryKeyText } = await createRegistrationMaterial({
      email,
      password,
      name,
      emailRecoverable,
    });

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(
        body.error === 'email_unavailable'
          ? t(locale, 'register.errorTaken')
          : t(locale, 'register.errorGeneric'),
      );
    }

    // La clave de recuperación se muestra una sola vez, en "Mi cuenta".
    sessionStorage.setItem('iccount:recoveryKey', recoveryKeyText);
    window.location.href = next;
  } catch (error) {
    showError(error instanceof Error ? error.message : t(locale, 'register.errorGeneric'));
    status.hidden = true;
    submit.disabled = false;
  }
});
