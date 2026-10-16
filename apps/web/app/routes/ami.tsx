import { Button } from "@orasso/design-system/web";
import { socialLabels } from "@orasso/shared";
import { data, Form, useNavigation } from "react-router";

import { api, getMe } from "../lib/api.server";
import { setInviteCookie } from "../lib/invite.server";
import type { Route } from "./+types/ami";

// Lien d'ami (lot 15, ARCHITECTURE-SUITE § 1.3). Sans compte : cookie `orasso-invite` (24 h) puis inscription, le
// parrain gagne ses points quand l'adresse est confirmée. Connecté (lot 17) : demande d'ami vers le propriétaire du lien.
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
  const res = await api<{ status: "pending" | "accepted"; pseudo: string }>(request, "/friends/requests/by-invite", {
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
          {own ? (
            <p className="s-lead">C'est ton propre lien d'ami : partage-le pour inviter tes amis sur Orasso.</p>
          ) : actionData?.sent ? (
            <p className="s-notice s-notice--ok" role="status" data-testid="ami-sent">
              {actionData.sent.status === "accepted"
                ? `Vous êtes amis avec ${actionData.sent.pseudo}.`
                : socialLabels.requestSentTo(actionData.sent.pseudo)}
            </p>
          ) : (
            <Form method="post" className="s-stack">
              <p className="s-lead">Envoie une demande d'ami à {pseudo}.</p>
              {actionData?.error && (
                <p className="s-error" role="alert">
                  {actionData.error}
                </p>
              )}
              <Button type="submit" variant="primary" icon="add" loading={busy}>
                {socialLabels.addFriend}
              </Button>
            </Form>
          )}
          <Button variant="secondary" href={own ? "/app/amis" : `/u/${encodeURIComponent(pseudo)}`} icon="profile">
            {own ? socialLabels.myFriends : `Voir le profil de ${pseudo}`}
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
