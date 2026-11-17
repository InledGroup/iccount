/**
 * Textos de la interfaz en español e inglés.
 *
 * El idioma se decide por `Accept-Language` en el servidor y por
 * `<html lang>` en el navegador. No hay selector manual: sigue al navegador.
 */

export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

const es = {
  'meta.description': 'Tu cuenta para todo Inled',
  'nav.login': 'Iniciar sesión',
  'nav.account': 'Mi cuenta',
  'nav.developers': 'Developer options',
  'home.title1': 'Tu cuenta',
  'home.title2': 'para todo Inled.',
  'home.subtitle': 'Un solo acceso. Todas las aplicaciones de Inled.',
  'home.create': 'Crear cuenta',
  'home.signin': 'Iniciar sesión',
  'footer.by': 'Un producto de Inled Group',
  'footer.tagline': 'OAuth 2.0 · OpenID Connect',

  'login.title': 'Iniciar sesión',
  'login.email': 'Email',
  'login.password': 'Contraseña',
  'login.submit': 'Entrar',
  'login.status': 'Entrando…',
  'login.noAccount': '¿No tienes cuenta?',
  'login.create': 'Crear una',
  'login.errorMissing': 'Escribe tu email y tu contraseña.',
  'login.errorInvalid': 'Email o contraseña incorrectos.',
  'login.errorGeneric': 'No se pudo iniciar sesión.',

  'register.title': 'Crear cuenta',
  'register.name': 'Nombre',
  'register.email': 'Email',
  'register.password': 'Contraseña',
  'register.passwordHint': 'Al menos 10 caracteres.',
  'register.confirm': 'Repetir contraseña',
  'register.share': 'Compartir mi nombre y email con las apps de Inled.',
  'register.submit': 'Crear cuenta',
  'register.status': 'Creando tu cuenta…',
  'register.hasAccount': '¿Ya tienes cuenta?',
  'register.signin': 'Iniciar sesión',
  'register.errorEmail': 'Escribe un email válido.',
  'register.errorPassword': 'La contraseña debe tener al menos 10 caracteres.',
  'register.errorMismatch': 'Las contraseñas no coinciden.',
  'register.errorTaken': 'Ese email ya está registrado.',
  'register.errorGeneric': 'No se pudo crear la cuenta.',

  'recovery.title': 'Guarda tu clave de recuperación',
  'recovery.body':
    'Es tu única forma de volver a entrar si olvidas la contraseña. No se vuelve a mostrar.',
  'recovery.download': 'Descargar',
  'recovery.done': 'Ya la he guardado',
  'recovery.fileHeader': 'Inled Iccount — clave de recuperación',
  'recovery.fileNote': 'Guárdala en un lugar seguro y sin conexión.',

  'account.title': 'Mi cuenta',
  'account.welcomeTitle': 'Ya estás dentro.',
  'account.welcomeBody':
    'Enhorabuena, tu cuenta de Iccount está lista. Ya puedes usar todos los servicios de Inled.',
  'account.welcomeHint': 'No tienes que hacer nada más.',
  'account.developers': 'Developer options',
  'account.logout': 'Cerrar sesión',
  'account.deleteTitle': 'Eliminar cuenta',
  'account.deleteBody': 'Se borrarán tu cuenta y tus datos. No se puede deshacer.',
  'account.deletePassword': 'Confirma tu contraseña',
  'account.deleteConfirm': 'Entiendo que se eliminará mi cuenta de forma permanente.',
  'account.deleteSubmit': 'Eliminar mi cuenta',
  'account.deleteWrong': 'La contraseña no es correcta.',
  'account.deleteSession': 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
  'account.deleteFailed': 'No se pudo eliminar la cuenta.',
  'account.deleteConfirmCheck': 'Marca la casilla para confirmar.',

  'consent.title': 'Autorizar acceso',
  'consent.wants': 'quiere acceder a tu cuenta de Iccount',
  'consent.allowTitle': 'Permitirá',
  'consent.allow': 'Permitir acceso',
  'consent.deny': 'Cancelar',
  'consent.redirect': 'Serás redirigido a',
  'consent.signedInAs': 'Conectado como',
  'scope.openid': 'Confirmar tu identidad',
  'scope.profile': 'Ver tu nombre y tu foto',
  'scope.email': 'Ver tu email',

  'dev.title': 'Developer options',
  'dev.subtitle': 'Registra tu aplicación y usa la documentación para integrar Iccount.',
  'dev.newClient': 'Nueva aplicación',
  'dev.appName': 'Nombre',
  'dev.redirectUris': 'URIs de redirección',
  'dev.redirectHint': 'Una por línea. HTTPS; en local se admite http://localhost.',
  'dev.scopes': 'Permisos',
  'dev.create': 'Registrar aplicación',
  'dev.created': 'Aplicación creada. Copia el secreto: no se volverá a mostrar.',
  'dev.seeList': 'Ver en la lista',
  'dev.clients': 'Tus aplicaciones',
  'dev.empty': 'Todavía no has registrado ninguna aplicación.',
  'dev.name': 'Nombre',
  'dev.clientId': 'Client ID',
  'dev.type': 'Tipo',
  'dev.redirect': 'Redirecciones',
  'dev.public': 'Pública (PKCE)',
  'dev.confidential': 'Confidencial',
  'dev.delete': 'Eliminar',
  'dev.deleteConfirm':
    '¿Eliminar esta aplicación? Las apps que la usen dejarán de poder entrar.',
  'dev.errorName': 'El nombre debe tener al menos 2 caracteres.',
  'dev.errorUris': 'Añade al menos una URI de redirección válida.',
  'dev.errorGeneric': 'No se pudo registrar la aplicación.',
  'dev.docs': 'Documentación',
  'dev.docsIntro': 'Descarga el kit de integración o pásaselo directamente a tu IA.',
  'dev.downloadBrief': 'Descargar guía para IA',
  'dev.copy': 'Copiar',
  'dev.copied': 'Copiado',
  'dev.embedTitle': 'Botón de acceso',
  'dev.embedHint': 'Pega esto en tu web. El script se carga desde Iccount: no hay nada que descargar.',
  'dev.quickstart': 'API del botón',
  'dev.aiNote':
    'La guía está en inglés y contiene todo lo necesario para que otra IA implemente el flujo sin preguntar.',

  'notfound.title': 'Página no encontrada',
  'notfound.back': 'Volver al inicio',

  'app.themeSkip': 'Ir al contenido',
} as const;

const en: Record<keyof typeof es, string> = {
  'meta.description': 'Your account for all of Inled',
  'nav.login': 'Sign in',
  'nav.account': 'My account',
  'nav.developers': 'Developer options',
  'home.title1': 'Your account',
  'home.title2': 'for all of Inled.',
  'home.subtitle': 'One sign-in. Every Inled app.',
  'home.create': 'Create account',
  'home.signin': 'Sign in',
  'footer.by': 'An Inled Group product',
  'footer.tagline': 'OAuth 2.0 · OpenID Connect',

  'login.title': 'Sign in',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.status': 'Signing in…',
  'login.noAccount': 'No account yet?',
  'login.create': 'Create one',
  'login.errorMissing': 'Enter your email and password.',
  'login.errorInvalid': 'Wrong email or password.',
  'login.errorGeneric': "Couldn't sign you in.",

  'register.title': 'Create account',
  'register.name': 'Name',
  'register.email': 'Email',
  'register.password': 'Password',
  'register.passwordHint': 'At least 10 characters.',
  'register.confirm': 'Repeat password',
  'register.share': 'Share my name and email with Inled apps.',
  'register.submit': 'Create account',
  'register.status': 'Creating your account…',
  'register.hasAccount': 'Already have an account?',
  'register.signin': 'Sign in',
  'register.errorEmail': 'Enter a valid email.',
  'register.errorPassword': 'Your password needs at least 10 characters.',
  'register.errorMismatch': "The passwords don't match.",
  'register.errorTaken': 'That email is already registered.',
  'register.errorGeneric': "Couldn't create your account.",

  'recovery.title': 'Save your recovery key',
  'recovery.body':
    "It's the only way back in if you forget your password. It won't be shown again.",
  'recovery.download': 'Download',
  'recovery.done': 'I saved it',
  'recovery.fileHeader': 'Inled Iccount — recovery key',
  'recovery.fileNote': 'Keep it somewhere safe and offline.',

  'account.title': 'My account',
  'account.welcomeTitle': "You're in.",
  'account.welcomeBody':
    'Your Iccount account is ready. You can now use every Inled service.',
  'account.welcomeHint': "There's nothing else to do.",
  'account.developers': 'Developer options',
  'account.logout': 'Sign out',
  'account.deleteTitle': 'Delete account',
  'account.deleteBody': 'Your account and all your data will be removed. This cannot be undone.',
  'account.deletePassword': 'Confirm your password',
  'account.deleteConfirm': 'I understand my account will be permanently deleted.',
  'account.deleteSubmit': 'Delete my account',
  'account.deleteWrong': 'That password is not correct.',
  'account.deleteSession': 'Your session expired. Please sign in again.',
  'account.deleteFailed': "Couldn't delete the account.",
  'account.deleteConfirmCheck': 'Tick the box to confirm.',

  'consent.title': 'Authorize access',
  'consent.wants': 'wants to access your Iccount account',
  'consent.allowTitle': 'This will allow it to',
  'consent.allow': 'Allow access',
  'consent.deny': 'Cancel',
  'consent.redirect': "You'll be sent back to",
  'consent.signedInAs': 'Signed in as',
  'scope.openid': 'Confirm your identity',
  'scope.profile': 'See your name and picture',
  'scope.email': 'See your email address',

  'dev.title': 'Developer options',
  'dev.subtitle': 'Register your app and use the docs to integrate Iccount.',
  'dev.newClient': 'New application',
  'dev.appName': 'Name',
  'dev.redirectUris': 'Redirect URIs',
  'dev.redirectHint': 'One per line. HTTPS; http://localhost is allowed for local development.',
  'dev.scopes': 'Permissions',
  'dev.create': 'Register application',
  'dev.created': "Application created. Copy the secret: it won't be shown again.",
  'dev.seeList': 'View in list',
  'dev.clients': 'Your applications',
  'dev.empty': "You haven't registered any applications yet.",
  'dev.name': 'Name',
  'dev.clientId': 'Client ID',
  'dev.type': 'Type',
  'dev.redirect': 'Redirects',
  'dev.public': 'Public (PKCE)',
  'dev.confidential': 'Confidential',
  'dev.delete': 'Delete',
  'dev.deleteConfirm': 'Delete this application? Apps using it will no longer be able to sign in.',
  'dev.errorName': 'The name needs at least 2 characters.',
  'dev.errorUris': 'Add at least one valid redirect URI.',
  'dev.errorGeneric': "Couldn't register the application.",
  'dev.docs': 'Documentation',
  'dev.docsIntro': 'Download the integration kit or hand it straight to your AI.',
  'dev.downloadBrief': 'Download AI brief',
  'dev.copy': 'Copy',
  'dev.copied': 'Copied',
  'dev.embedTitle': 'Sign-in button',
  'dev.embedHint': 'Paste this into your site. The script loads from Iccount — nothing to download.',
  'dev.quickstart': 'Button API',
  'dev.aiNote':
    'The brief is written in English and contains everything an AI needs to implement the flow without asking questions.',

  'notfound.title': 'Page not found',
  'notfound.back': 'Back to start',

  'app.themeSkip': 'Skip to content',
};

export type MessageKey = keyof typeof es;

const dictionaries: Record<Locale, Record<MessageKey, string>> = { es, en };

export function isLocale(value: unknown): value is Locale {
  return value === 'es' || value === 'en';
}

/** Elige el idioma a partir de `Accept-Language`. Inglés por defecto. */
export function localeFromRequest(request: Request): Locale {
  const header = request.headers.get('accept-language') ?? '';
  const candidates = header
    .split(',')
    .map((part) => part.trim().split(';')[0]?.toLowerCase() ?? '')
    .filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === 'es' || candidate.startsWith('es-')) return 'es';
    if (candidate === 'en' || candidate.startsWith('en-')) return 'en';
  }

  return 'en';
}

/** Elige el idioma en el navegador a partir de `<html lang>`. */
export function localeFromDocument(): Locale {
  if (typeof document === 'undefined') return 'en';
  return isLocale(document.documentElement.lang) ? document.documentElement.lang : 'en';
}

export function t(locale: Locale, key: MessageKey): string {
  return dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
}
