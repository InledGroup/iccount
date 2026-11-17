import { localeFromDocument, t } from '../i18n';

const locale = localeFromDocument();

const form = document.getElementById('client-form') as HTMLFormElement;
const errorBox = document.getElementById('client-error') as HTMLElement;
const submit = document.getElementById('client-submit') as HTMLButtonElement;
const secretPanel = document.getElementById('client-secret') as HTMLElement;
const secretValue = document.getElementById('client-secret-value') as HTMLElement;

interface CreatedClient {
  client?: { clientId: string; clientSecret: string };
  error?: string;
}

function showError(message: string): void {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;

  const data = new FormData(form);
  const name = String(data.get('name') ?? '').trim();
  const redirectUris = String(data.get('redirectUris') ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const scopes = data.getAll('scopes').map(String);

  if (name.length < 2) {
    showError(t(locale, 'dev.errorName'));
    return;
  }
  if (redirectUris.length === 0) {
    showError(t(locale, 'dev.errorUris'));
    return;
  }

  submit.disabled = true;

  try {
    const response = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, redirectUris, scopes }),
    });
    const body = (await response.json().catch(() => ({}))) as CreatedClient;

    if (!response.ok || !body.client) {
      throw new Error(
        body.error === 'invalid_redirect_uris'
          ? t(locale, 'dev.errorUris')
          : t(locale, 'dev.errorGeneric'),
      );
    }

    form.hidden = true;
    secretPanel.hidden = false;
    secretValue.textContent = [
      `client_id: ${body.client.clientId}`,
      `client_secret: ${body.client.clientSecret}`,
    ].join('\n');
  } catch (error) {
    showError(error instanceof Error ? error.message : t(locale, 'dev.errorGeneric'));
    submit.disabled = false;
  }
});

document.getElementById('client-reload')?.addEventListener('click', () => window.location.reload());

document.querySelectorAll('[data-copy-target]').forEach((button) => {
  button.addEventListener('click', async () => {
    const target = document.getElementById(button.getAttribute('data-copy-target') ?? '');
    if (!target) return;

    try {
      await navigator.clipboard.writeText(target.textContent ?? '');
      const original = button.textContent;
      button.textContent = t(locale, 'dev.copied');
      setTimeout(() => {
        button.textContent = original;
      }, 1600);
    } catch (_) {
      /* clipboard bloqueado: el usuario puede copiar a mano */
    }
  });
});

document.querySelectorAll('button[data-client-id]').forEach((button) => {
  button.addEventListener('click', async () => {
    const clientId = button.getAttribute('data-client-id') ?? '';
    const message = button.getAttribute('data-delete-confirm') ?? '';
    if (!confirm(message)) return;

    const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}`, {
      method: 'DELETE',
    });
    if (response.ok) window.location.reload();
  });
});
