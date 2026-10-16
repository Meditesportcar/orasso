// Importé en tout premier par `index.ts` : GlitchTip / Sentry initialisé avant le reste de l'API (lot 15), et seulement
// si SENTRY_DSN est renseigné.
import { initSentry } from "./lib/sentry";

initSentry();
