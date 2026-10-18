// L'appli Orasso (lot 36) : page vers laquelle pointent la fin de l'inscription express et l'e-mail « Installe l'appli ».
// `APP_ANDROID_URL` (lien Google Play, ou lien de test) affiche le bouton de téléchargement ; vide, la page dit que
// l'appli arrive bientôt (pas encore publiée sur les stores).
import { Button, Plate } from "@orasso/design-system/web";
import { appInstallLabels as L } from "@orasso/shared";

import type { Route } from "./+types/appli";

export function meta() {
  return [{ title: `${L.pageTitle} · Orasso` }];
}

export function loader(_: Route.LoaderArgs) {
  const android = process.env.APP_ANDROID_URL?.trim() || null;
  return { android: android && /^https:\/\//.test(android) ? android : null };
}

export default function Appli({ loaderData }: Route.ComponentProps) {
  return (
    <div className="s-narrow s-stack" data-testid="app-page">
      <h1 className="s-title">{L.pageTitle}</h1>
      <p className="s-lead">{L.pageLead}</p>
      <Plate as="section" className="s-stack" aria-label={L.pageTitle}>
        {loaderData.android ? (
          <Button variant="primary" icon="export" href={loaderData.android} fullWidth>
            {L.android}
          </Button>
        ) : (
          <p className="o-t-body" data-testid="app-soon">
            {L.soon}
          </p>
        )}
        <Button variant="secondary" icon="home" href="/app" fullWidth>
          {L.openSite}
        </Button>
      </Plate>
    </div>
  );
}
