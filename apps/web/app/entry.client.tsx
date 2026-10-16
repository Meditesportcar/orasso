// Entrée du navigateur : celle de React Router par défaut, plus GlitchTip / Sentry si `VITE_SENTRY_DSN` est renseigné
// à la construction (lot 15). Sans DSN, rien n'est chargé ni envoyé.
import { scrubBreadcrumb, scrubErrorEvent } from "@orasso/shared";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (dsn) {
  // Chargé à part : sans DSN, le SDK n'alourdit pas la page.
  void import("@sentry/react-router").then((Sentry) =>
    Sentry.init({
      dsn,
      environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? import.meta.env.MODE,
      // Pas de traces de performance (elles portent des URL et des requêtes) : erreurs seulement.
      tracesSampleRate: 0,
      beforeSend: (event) => scrubErrorEvent(event),
      beforeSendTransaction: (event) => scrubErrorEvent(event),
      beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
    }),
  );
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});
