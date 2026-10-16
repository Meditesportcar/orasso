// Erreurs vers GlitchTip (compatible Sentry) — lot 15, ARCHITECTURE-SUITE § 1.7. Sans `SENTRY_DSN`, rien n'est
// initialisé. Identifiant d'utilisateur seulement ; jamais de plaque, de téléphone, d'e-mail ni de corps de requête
// (`scrubErrorEvent` de @orasso/shared, commun au site et à l'appli).
import { scrubBreadcrumb, scrubErrorEvent } from "@orasso/shared";
import * as Sentry from "@sentry/node";

import { env } from "../env";

export function initSentry(): boolean {
  if (!env.SENTRY_DSN) return false;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: env.SENTRY_RELEASE,
    // Pas de traces de performance (elles portent des URL et des requêtes) : erreurs seulement.
    tracesSampleRate: 0,
    beforeSend: (event) => scrubErrorEvent(event),
    beforeSendTransaction: (event) => scrubErrorEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
  return true;
}

/** Erreur inattendue d'une requête (les erreurs métier `AppError` ne sont pas envoyées). */
export function captureError(error: unknown, userId?: string | null) {
  if (!env.SENTRY_DSN) return;
  Sentry.withScope((scope) => {
    if (userId) scope.setUser({ id: userId });
    Sentry.captureException(error);
  });
}
