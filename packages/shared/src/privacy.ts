// Nettoyage des rapports d'erreur envoyés à GlitchTip / Sentry (lot 15, ARCHITECTURE-SUITE § 1.7) : jamais de plaque,
// de téléphone, d'e-mail, de mot de passe, de jeton (ni dans les clés, ni dans les valeurs : adresses, liens d'invitation,
// de réinitialisation ou d'inscription express), d'adresse IP ni de corps de requête ; utilisateur réduit à son
// identifiant. Partagé par l'API, le site et l'appli (`beforeSend`, `beforeSendTransaction`, `beforeBreadcrumb`).

const SENSITIVE_KEYS =
  /^(plate|plate_?normalized|phone|e-?mail|email|password|token|totp_?code|body|cookie|set-cookie|authorization|sec-websocket-protocol|x-forwarded-for|x-real-ip|ip_address|lat|lng)$/i;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Retire jetons et adresses e-mail d'un texte (URL, message d'erreur). */
export function scrubText(text: string): string {
  return (
    text
      // Paramètres porteurs de secrets.
      .replace(/([?&#](?:token|code|email|plate|password|callbackURL|lat|lng)=)[^&#\s"']*/gi, "$1[retiré]")
      // Chemins qui contiennent un jeton : inscription express, lien d'ami, invitation, réinitialisation (Better Auth).
      .replace(
        /(\/(?:express|ami|invitation|reset-password|reinitialisation|verification-email)\/)[^/?#\s"']+/gi,
        "$1[retiré]",
      )
      // Messages de PostgreSQL : « Key (email)=(x@y.z) already exists ».
      .replace(/(Key \([^)]*\)=\()[^)]*(\))/g, "$1[retiré]$2")
      .replace(EMAIL, "[e-mail retiré]")
  );
}

export function scrubPrivate<T>(value: T, depth = 0): T {
  if (typeof value === "string") return scrubText(value) as T;
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrubPrivate(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.test(k) ? "[retiré]" : scrubPrivate(v, depth + 1);
  }
  return out as T;
}

type LooseEvent = {
  message?: string;
  request?: {
    url?: string;
    data?: unknown;
    cookies?: unknown;
    headers?: Record<string, string>;
    query_string?: unknown;
  };
  user?: { id?: string | number } & Record<string, unknown>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  transaction?: string;
  breadcrumbs?: { message?: string; data?: Record<string, unknown> }[];
  exception?: { values?: { value?: string }[] };
  spans?: { description?: string; data?: Record<string, unknown> }[];
};

/** `beforeSend` / `beforeSendTransaction` communs : retire les données personnelles (modifié sur place et renvoyé). */
export function scrubErrorEvent<E>(event: E): E {
  const e = event as LooseEvent;
  if (e.message) e.message = scrubText(e.message);
  if (e.transaction) e.transaction = scrubText(e.transaction);
  if (e.request) {
    delete e.request.data;
    delete e.request.cookies;
    if (typeof e.request.url === "string") e.request.url = scrubText(e.request.url);
    if (e.request.headers) e.request.headers = scrubPrivate(e.request.headers);
    if (typeof e.request.query_string === "string")
      e.request.query_string = scrubText(`?${e.request.query_string}`).slice(1);
  }
  if (e.user) e.user = e.user.id !== undefined ? { id: e.user.id } : {};
  if (e.extra) e.extra = scrubPrivate(e.extra);
  if (e.contexts) e.contexts = scrubPrivate(e.contexts);
  if (e.tags) e.tags = scrubPrivate(e.tags);
  if (e.breadcrumbs) e.breadcrumbs = e.breadcrumbs.map(scrubBreadcrumb);
  if (e.exception?.values) {
    for (const v of e.exception.values) if (v.value) v.value = scrubText(v.value);
  }
  if (e.spans) {
    e.spans = e.spans.map((s) => ({
      ...s,
      ...(s.description ? { description: scrubText(s.description) } : {}),
      ...(s.data ? { data: scrubPrivate(s.data) } : {}),
    }));
  }
  return event;
}

/** Fil d'Ariane : URL, `from` / `to` de navigation, message. */
export function scrubBreadcrumb<B extends { message?: string; data?: Record<string, unknown> }>(b: B): B {
  return {
    ...b,
    ...(b.message ? { message: scrubText(b.message) } : {}),
    ...(b.data ? { data: scrubPrivate(b.data) } : {}),
  };
}
