import { deriveKeys } from '../lib/crypto-client.js';
import { localeFromDocument, t } from '../i18n';

const locale = localeFromDocument();
const RECOVERY_STORAGE_KEY = 'iccount:recoveryKey';

const logout = document.getElementById('logout') as HTMLButtonElement;
const form = document.getElementById('delete-form') as HTMLFormElement;
const passwordInput = document.getElementById('delete-password') as HTMLInputElement;
const confirmBox = document.getElementById('delete-confirm') as HTMLInputElement;
const errorBox = document.getElementById('delete-error') as HTMLElement;
const submit = document.getElementById('delete-submit') as HTMLButtonElement;

const recoveryCard = document.getElementById('recovery-card') as HTMLElement | null;
const recoveryKeyEl = document.getElementById('recovery-key') as HTMLElement | null;
const downloadRecovery = document.getElementById('download-recovery') as HTMLButtonElement | null;
const dismissRecovery = document.getElementById('dismiss-recovery') as HTMLButtonElement | null;

function showError(message: string): void {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

// La clave de recuperación se generó en el registro y viaja aquí una sola vez.
const storedRecoveryKey = sessionStorage.getItem(RECOVERY_STORAGE_KEY);

if (recoveryCard && recoveryKeyEl && storedRecoveryKey) {
  recoveryKeyEl.textContent = storedRecoveryKey;
  recoveryCard.hidden = false;
}

function clearRecoveryKey(): void {
  sessionStorage.removeItem(RECOVERY_STORAGE_KEY);
  if (recoveryCard) recoveryCard.hidden = true;
}

downloadRecovery?.addEventListener('click', () => {
  if (!storedRecoveryKey) return;

  const contents = [
    t(locale, 'recovery.fileHeader'),
    '',
    storedRecoveryKey,
    '',
    t(locale, 'recovery.fileNote'),
  ].join('\n');
  const blob = new Blob([contents], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'iccount-recovery-key.txt';
  link.click();
  URL.revokeObjectURL(url);
});

dismissRecovery?.addEventListener('click', clearRecoveryKey);

logout.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;

  const password = passwordInput.value;
  if (!password) {
    showError(t(locale, 'account.deletePassword'));
    return;
  }
  if (!confirmBox.checked) {
    showError(t(locale, 'account.deleteConfirmCheck'));
    return;
  }

  submit.disabled = true;

  try {
    const me = await fetch('/api/auth/me');
    if (!me.ok) throw new Error(t(locale, 'account.deleteSession'));

    const { user } = (await me.json()) as {
      user: { kdfSalt: string; kdfIterations: number };
    };

    const { authKey } = await deriveKeys({
      password,
      salt: user.kdfSalt,
      iterations: user.kdfIterations,
    });

    const response = await fetch('/api/auth/account', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ authKey }),
    });

    if (response.status === 401) throw new Error(t(locale, 'account.deleteWrong'));
    if (!response.ok) throw new Error(t(locale, 'account.deleteFailed'));

    sessionStorage.removeItem(RECOVERY_STORAGE_KEY);
    window.location.href = '/';
  } catch (error) {
    showError(error instanceof Error ? error.message : t(locale, 'account.deleteFailed'));
    submit.disabled = false;
  }
});
