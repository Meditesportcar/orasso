import { Button, Chip, TextField } from "@orasso/design-system/web";
import { type FriendItem, type FriendRequestView, gradeLabels, socialLabels } from "@orasso/shared";
import { Form, useNavigation } from "react-router";
import { FicheBar, ficheHandle } from "../components/FicheBar";
import { PersonAvatar } from "../components/People";
import { apiOrThrow, originOf, requireMe } from "../lib/api.server";
import { friendAction } from "../lib/friends.server";
import { withRetour } from "../lib/retour";
import type { Route } from "./+types/amis";

// Mes amis (lot 17) : amis, demandes reçues et envoyées, ajout par pseudo, mon lien d'ami. Le scan d'un QR de compte
// se fait dans l'appli (caméra).
// Lot M7 : fiche ou parcours, mode B (en-tête de fiche, sans bande ni barre d'onglets).
export const handle = ficheHandle;

export function meta() {
  return [{ title: "Mes amis · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const [friends, requests] = await Promise.all([
    apiOrThrow<{ items: FriendItem[] }>(request, "/me/friends"),
    apiOrThrow<{ items: FriendRequestView[] }>(request, "/me/friends/requests"),
  ]);
  return {
    friends: friends.items,
    incoming: requests.items.filter((r) => r.direction === "in"),
    outgoing: requests.items.filter((r) => r.direction === "out"),
    inviteLink: `${originOf(request)}/ami/${me.profile.inviteToken}`,
  };
}

export async function action({ request }: Route.ActionArgs) {
  return friendAction(request, await request.formData());
}

export default function Amis({ loaderData, actionData }: Route.ComponentProps) {
  const { friends, incoming, outgoing, inviteLink } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <>
      <FicheBar title={socialLabels.myFriends} back="/app/moi" />
      <div className="s-narrow s-stack" data-testid="amis">
        {actionData?.friendError && (
          <p className="s-error" role="alert">
            {actionData.friendError}
          </p>
        )}

        {incoming.length > 0 && (
          <section className="s-section s-section--first" aria-labelledby="recues-titre" data-testid="requests-in">
            <h2 id="recues-titre" className="s-h2">
              {socialLabels.friendRequestsIn}
            </h2>
            <ul className="s-people">
              {incoming.map((r) => (
                <li key={r.id} className="s-person">
                  <PersonAvatar url={r.person.avatarUrl} pseudo={r.person.pseudo} size={48} />
                  <div className="s-person__main">
                    <a
                      className="s-person__name o-t-title"
                      href={withRetour(`/u/${encodeURIComponent(r.person.pseudo)}`, "/app/amis")}
                    >
                      {r.person.pseudo}
                    </a>
                    <Chip>{gradeLabels[r.person.grade]}</Chip>
                    {r.message && <p className="o-t-caption s-muted s-prewrap">{r.message}</p>}
                  </div>
                  <div className="s-row">
                    <Form method="post">
                      <input type="hidden" name="intent" value="friend_accept" />
                      <input type="hidden" name="id" value={r.id} />
                      <Button type="submit" variant="secondary" icon="check" loading={busy}>
                        {socialLabels.accept}
                      </Button>
                    </Form>
                    <Form method="post">
                      <input type="hidden" name="intent" value="friend_decline" />
                      <input type="hidden" name="id" value={r.id} />
                      <Button type="submit" variant="secondary" icon="close" loading={busy}>
                        {socialLabels.decline}
                      </Button>
                    </Form>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="s-section" aria-labelledby="amis-titre">
          <h2 id="amis-titre" className="s-h2">
            {socialLabels.myFriends} · {friends.length}
          </h2>
          {friends.length === 0 ? (
            <p className="s-notice">{socialLabels.noFriends}</p>
          ) : (
            <ul className="s-people" data-testid="friends-list">
              {friends.map((f) => (
                <li key={f.userId} className="s-person">
                  <PersonAvatar url={f.avatarUrl} pseudo={f.pseudo} size={48} />
                  <div className="s-person__main">
                    <a
                      className="s-person__name o-t-title"
                      href={withRetour(`/u/${encodeURIComponent(f.pseudo)}`, "/app/amis")}
                    >
                      {f.pseudo}
                    </a>
                    <Chip>{gradeLabels[f.grade]}</Chip>
                  </div>
                  <Form method="post">
                    <input type="hidden" name="intent" value="friend_remove" />
                    <input type="hidden" name="userId" value={f.userId} />
                    <Button type="submit" variant="secondary" icon="close" loading={busy}>
                      {socialLabels.removeFriend}
                    </Button>
                  </Form>
                </li>
              ))}
            </ul>
          )}
        </section>

        {outgoing.length > 0 && (
          <section className="s-section" aria-labelledby="envoyees-titre" data-testid="requests-out">
            <h2 id="envoyees-titre" className="s-h2">
              {socialLabels.friendRequestsOut}
            </h2>
            <ul className="s-people">
              {outgoing.map((r) => (
                <li key={r.id} className="s-person">
                  <PersonAvatar url={r.person.avatarUrl} pseudo={r.person.pseudo} size={48} />
                  <div className="s-person__main">
                    <a
                      className="s-person__name o-t-title"
                      href={withRetour(`/u/${encodeURIComponent(r.person.pseudo)}`, "/app/amis")}
                    >
                      {r.person.pseudo}
                    </a>
                    <span className="o-t-caption s-muted">{socialLabels.requestSent}</span>
                  </div>
                  <Form method="post">
                    <input type="hidden" name="intent" value="friend_remove" />
                    <input type="hidden" name="userId" value={r.person.userId} />
                    <Button type="submit" variant="secondary" icon="undo" loading={busy}>
                      Annuler
                    </Button>
                  </Form>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="s-section" aria-labelledby="ajout-titre">
          <h2 id="ajout-titre" className="s-h2">
            {socialLabels.addFriend}
          </h2>
          <Form method="post" className="s-form">
            <input type="hidden" name="intent" value="friend_add" />
            <input type="hidden" name="source" value="search" />
            <TextField label="Pseudo" name="pseudo" autoComplete="off" required />
            <Button type="submit" variant="primary" icon="add" loading={busy}>
              Envoyer la demande
            </Button>
          </Form>
          <Button variant="secondary" icon="search" href="/app/explorer?segment=personnes">
            {socialLabels.searchPeople}
          </Button>
          <TextField label="Mon lien d'ami" value={inviteLink} readOnly onFocus={(e) => e.currentTarget.select()} />
          <p className="o-t-caption s-muted">{socialLabels.scanFriendHint} Le scan se fait dans l'appli.</p>
        </section>
      </div>
    </>
  );
}
