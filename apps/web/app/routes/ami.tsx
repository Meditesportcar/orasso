import { Button } from "@orasso/design-system/web";
import { data } from "react-router";

import { api, getMe } from "../lib/api.server";
import { setInviteCookie } from "../lib/invite.server";
import type { Route } from "./+types/ami";

// Lien d'ami (lot 15, ARCHITECTURE-SUITE § 1.3). Sans compte : cookie `orasso-invite` (24 h) puis inscription, le
// parrain gagne ses points quand l'adresse est confirmée. Connecté : la demande d'ami arrive avec le lot 17.
export function meta({ loaderData }: Route.MetaArgs) {
  const who = loaderData?.pseudo ? `${loaderData.pseudo} t'invite sur Orasso` : "Invitation · Orasso";
  return [{ title: who }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const token = params.jeton;
  const res = await api<{ pseudo: string; avatarUrl: string | null }>(
    request,
    `/referral/${encodeURIComponent(token)}`,
  );
  if (!res.ok) return data({ pseudo: null, connected: false }, { status: 404 });
  const me = await getMe(request);
  if (me) return data({ pseudo: res.data.pseudo, connected: true });
  return data(
    { pseudo: res.data.pseudo, connected: false },
    { headers: { "set-cookie": setInviteCookie(request, token) } },
  );
}

export default function Ami({ loaderData }: Route.ComponentProps) {
  const { pseudo, connected } = loaderData;
  if (!pseudo) {
    return (
      <div className="s-narrow s-stack">
        <h1 className="s-title">Lien inconnu</h1>
        <p className="s-notice">Ce lien d'ami n'existe pas ou plus.</p>
        <Button href="/" icon="home">
          Découvrir Orasso
        </Button>
      </div>
    );
  }
  return (
    <div className="s-narrow s-stack" data-testid="ami">
      <h1 className="s-title">{pseudo} t'invite sur Orasso</h1>
      {connected ? (
        <>
          <p className="s-lead">Tu as déjà un compte. Les demandes d'ami arrivent bientôt sur Orasso.</p>
          <Button href="/app" icon="home">
            Mon compte
          </Button>
        </>
      ) : (
        <>
          <p className="s-lead">
            Rassemblements, expositions, cars & coffee : crée ton compte en une minute, confirme ton adresse e-mail et{" "}
            {pseudo} gagne des points de parrainage.
          </p>
          <Button href="/inscription?retour=/app" icon="add">
            Créer mon compte
          </Button>
          <p className="s-muted">
            Déjà un compte ? <a href="/connexion?retour=/app">Se connecter</a>
          </p>
        </>
      )}
    </div>
  );
}
