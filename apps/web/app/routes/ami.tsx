import { Button } from "@orasso/design-system/web";
import { type FollowState, networkLabels as N } from "@orasso/shared";
import { data, Form, useNavigation } from "react-router";

import { api, getMe } from "../lib/api.server";
import { setInviteCookie } from "../lib/invite.server";
import type { Route } from "./+types/ami";

// Lien de profil (lot 15, ARCHITECTURE-SUITE § 1.3). Sans compte : cookie `orasso-invite` (24 h) puis inscription, le
// parrain gagne ses points quand l'adresse est confirmée. Connecté (lot 17, R6b) : suivre le propriétaire du lien (une
// demande si son compte est privé). L'adresse `/ami/:jeton` est gardée pour les liens déjà partagés.
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
  if (!res.ok) return data({ pseudo: null, connected: false, own: false }, { status: 404 });
  const me = await getMe(request);
  if (me) return data({ pseudo: res.data.pseudo, connected: true, own: me.profile.inviteToken === token });
  return data(
    { pseudo: res.data.pseudo, connected: false, own: false },
    { headers: { "set-cookie": setInviteCookie(request, token) } },
  );
}

export async function action({ request, params }: Route.ActionArgs) {
  const res = await api<{ mine: FollowState; pseudo: string }>(request, "/follows/by-invite", {
    method: "POST",
    json: { token: params.jeton },
  });
  if (!res.ok) return data({ sent: null, error: res.error.message }, { status: res.status });
  return data({ sent: res.data, error: null });
}

export default function Ami({ loaderData, actionData }: Route.ComponentProps) {
  const { pseudo, connected, own } = loaderData;
  const busy = useNavigation().state !== "idle";
  if (!pseudo) {
    return (
      <div className="s-narrow s-stack">
        <h1 className="s-title">Lien inconnu</h1>
        <p className="s-notice">Ce lien n'existe pas ou plus.</p>
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
          {own ? (
            <p className="s-lead" data-testid="ami-own">
              {N.ownInviteLink}
            </p>
          ) : actionData?.sent ? (
            <p className="s-notice s-notice--ok" role="status" data-testid="ami-sent">
              {actionData.sent.mine === "accepted"
                ? N.followedNow(actionData.sent.pseudo)
                : N.requestedNow(actionData.sent.pseudo)}
            </p>
          ) : (
            <Form method="post" className="s-stack">
              {actionData?.error && (
                <p className="s-error" role="alert">
                  {actionData.error}
                </p>
              )}
              <Button type="submit" variant="primary" icon="add" loading={busy} data-testid="follow-button">
                {N.followPseudo(pseudo)}
              </Button>
            </Form>
          )}
          <Button variant="secondary" href={own ? "/app/reseau" : `/u/${encodeURIComponent(pseudo)}`} icon="profile">
            {own ? N.title : `Voir le profil de ${pseudo}`}
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
