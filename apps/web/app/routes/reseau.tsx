import { Button, Icon, TextField } from "@orasso/design-system/web";
import {
  type FollowersPage,
  type FollowingPage,
  type FollowPerson,
  type FriendItem,
  type FriendRequestView,
  gradeLabels,
  networkLabels as N,
  type NetworkCounts,
} from "@orasso/shared";
import { Form, useNavigation } from "react-router";

import { PersonAvatar } from "../components/People";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { friendAction, isFriendIntent } from "../lib/friends.server";
import type { Route } from "./+types/reseau";
import "../styles/network.css";

// Lot R4c (maquette R4.6b) : « Ton réseau » sur le site, comme l'appli : trois onglets (abonnés, abonnements, amis),
// recherche dans la liste (côté serveur), 30 par page (« Suivants »), « Suivre aussi » / « Suivi », demandes d'amis en
// tête des amis. Toi seul vois ces listes : la page ne lit que les routes `/me/...` de la personne connectée.
export function meta() {
  return [{ title: "Ton réseau · Orasso" }, { name: "robots", content: "noindex" }];
}

const TABS = ["abonnes", "abonnements", "amis"] as const;
type Tab = (typeof TABS)[number];

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const url = new URL(request.url);
  const raw = url.searchParams.get("onglet") ?? "abonnes";
  const tab: Tab = (TABS as readonly string[]).includes(raw) ? (raw as Tab) : "abonnes";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 40);
  const cursor = url.searchParams.get("apres") ?? "";
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), ...extra });
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const network = await apiOrThrow<NetworkCounts>(request, "/me/network");
  if (tab === "abonnes") {
    const followers = await apiOrThrow<FollowersPage>(request, `/me/followers${qs(cursor ? { cursor } : {})}`);
    return { me, tab, q, network, followers, following: null, friends: null };
  }
  if (tab === "abonnements") {
    type PeoplePage = Extract<FollowingPage, { kind: "people" }>;
    type OrgPage = Extract<FollowingPage, { kind: "structures" | "pros" }>;
    const page = (kind: "people" | "structures" | "pros") =>
      apiOrThrow<FollowingPage>(
        request,
        `/me/following${qs({ kind, ...(cursor && kind === "people" ? { cursor } : {}) })}`,
      );
    const [people, structures, pros] = (await Promise.all([page("people"), page("structures"), page("pros")])) as [
      PeoplePage,
      OrgPage,
      OrgPage,
    ];
    return { me, tab, q, network, followers: null, following: { people, structures, pros }, friends: null };
  }
  const [friends, requests] = await Promise.all([
    apiOrThrow<{ items: FriendItem[] }>(request, `/me/friends${qs({})}`),
    q ? Promise.resolve(null) : api<{ items: FriendRequestView[] }>(request, "/me/friends/requests?direction=in"),
  ]);
  return {
    me,
    tab,
    q,
    network,
    followers: null,
    following: null,
    friends: { items: friends.items, requests: requests?.ok ? requests.data.items : [] },
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (isFriendIntent(intent)) return friendAction(request, form);
  if (intent === "follow" || intent === "unfollow") {
    const res = await api(request, `/users/${encodeURIComponent(String(form.get("pseudo") ?? ""))}/follow`, {
      method: intent === "follow" ? "POST" : "DELETE",
    });
    return { friendError: res.ok ? null : res.error.message };
  }
  return { friendError: "Action inconnue." };
}

function caption(p: FollowPerson) {
  return [p.vehicle ?? gradeLabels[p.grade], p.friend ? N.yourFriend : null].filter(Boolean).join(" · ");
}

function PersonRows({ items, busy }: { items: FollowPerson[]; busy: boolean }) {
  return (
    <ul className="n-list">
      {items.map((p) => (
        <li key={p.userId} className="n-row" data-testid="net-person">
          <a className="n-row__main" href={`/u/${encodeURIComponent(p.pseudo)}?retour=/app/reseau`}>
            <PersonAvatar url={p.avatarUrl} pseudo={p.pseudo} />
            <span>
              <strong>{p.pseudo}</strong>
              <small>{caption(p)}</small>
            </span>
          </a>
          {(p.following || p.canFollow) && (
            <Form method="post">
              <input type="hidden" name="pseudo" value={p.pseudo} />
              <Button
                type="submit"
                name="intent"
                value={p.following ? "unfollow" : "follow"}
                variant="secondary"
                icon={p.following ? "check" : "add"}
                loading={busy}
                data-testid={p.following ? "net-followed" : "net-follow"}
              >
                {p.following ? N.followed : N.followBack}
              </Button>
            </Form>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function Reseau({ loaderData, actionData }: Route.ComponentProps) {
  const { me, tab, q, network, followers, following, friends } = loaderData;
  const busy = useNavigation().state !== "idle";
  const label = (t: Tab) =>
    t === "abonnes"
      ? `${network.followers} ${N.followers(network.followers)}`
      : t === "abonnements"
        ? `${network.following} ${N.following(network.following)}`
        : `${network.friends} ${N.friends(network.friends)}`;
  const next = (cursor: string | null) =>
    cursor ? (
      <Button
        variant="secondary"
        icon="down"
        href={`/app/reseau?${new URLSearchParams({ onglet: tab, ...(q ? { q } : {}), apres: cursor }).toString()}`}
        data-testid="net-next"
      >
        Suivants
      </Button>
    ) : null;
  const empty = (text: string) => (
    <p className="s-muted" data-testid="net-empty">
      {q ? N.emptySearch : text}
    </p>
  );
  return (
    <div className="s-narrow s-stack" data-testid="reseau">
      <div className="s-stack s-stack--tight">
        <h1 className="s-title">{me.profile.pseudo}</h1>
        <p className="o-t-caption s-muted">{N.title}</p>
      </div>
      <nav className="n-tabs" aria-label={N.title} data-testid="net-tabs">
        {TABS.map((t) => (
          <a
            key={t}
            href={`/app/reseau?onglet=${t}`}
            aria-current={t === tab ? "page" : undefined}
            data-testid={`net-tab-${t}`}
          >
            {label(t)}
          </a>
        ))}
      </nav>
      <Form method="get" className="n-search" role="search">
        <input type="hidden" name="onglet" value={tab} />
        <TextField label={N.searchLabel} name="q" defaultValue={q} placeholder={N.search} data-testid="net-search" />
        <Button type="submit" variant="secondary" icon="search">
          Chercher
        </Button>
      </Form>
      {actionData?.friendError && (
        <p className="s-error" role="alert">
          {actionData.friendError}
        </p>
      )}

      {followers &&
        (followers.items.length ? (
          <div className="n-group" data-testid="net-followers">
            <PersonRows items={followers.items} busy={busy} />
            {next(followers.nextCursor)}
          </div>
        ) : (
          empty(N.emptyFollowers)
        ))}

      {following &&
        (following.people.total + following.structures.total + following.pros.total === 0 ? (
          empty(N.emptyFollowing)
        ) : (
          <>
            {following.people.total > 0 && (
              <section className="n-group" data-testid="net-people">
                <div className="n-group__head">
                  <h2 className="s-h2">{N.groupPeople}</h2>
                  <span className="o-t-caption">{following.people.total}</span>
                </div>
                <PersonRows items={following.people.items} busy={busy} />
                {next(following.people.nextCursor)}
              </section>
            )}
            {([following.structures, following.pros] as const).map((page) =>
              page.total > 0 ? (
                <section key={page.kind} className="n-group" data-testid={`net-${page.kind}`}>
                  <div className="n-group__head">
                    <h2 className="s-h2">{page.kind === "structures" ? N.groupStructures : N.groupPros}</h2>
                    <span className="o-t-caption">{page.total}</span>
                  </div>
                  <ul className="n-list">
                    {page.items.map((o) => (
                      <li key={o.id} className="n-row">
                        <a className="n-row__main" href={page.kind === "structures" ? `/o/${o.slug}` : `/p/${o.slug}`}>
                          <span className={page.kind === "pros" ? "n-face n-face--pro" : "n-face"}>
                            {o.logoUrl ? <img src={o.logoUrl} alt="" /> : o.name.slice(0, 3).toUpperCase()}
                          </span>
                          <span>
                            <strong>{o.name}</strong>
                            <small>{o.caption}</small>
                          </span>
                        </a>
                        <span className="o-t-caption s-muted">
                          <Icon name="check" size={14} /> {N.followed}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null,
            )}
          </>
        ))}

      {friends && (
        <>
          {friends.items.length + friends.requests.length === 0 && empty(N.emptyFriends)}
          {friends.requests.length > 0 && (
            <section className="n-group" data-testid="net-requests">
              <div className="n-group__head">
                <h2 className="s-h2">{N.requestsIn}</h2>
                <span className="o-t-caption">{friends.requests.length}</span>
              </div>
              <ul className="n-list">
                {friends.requests.map((r) => (
                  <li key={r.id} className="n-row">
                    <a className="n-row__main" href={`/u/${encodeURIComponent(r.person.pseudo)}?retour=/app/reseau`}>
                      <PersonAvatar url={r.person.avatarUrl} pseudo={r.person.pseudo} />
                      <span>
                        <strong>{r.person.pseudo}</strong>
                        <small>{r.message ?? gradeLabels[r.person.grade]}</small>
                      </span>
                    </a>
                    <Form method="post" className="n-actions">
                      <input type="hidden" name="id" value={r.id} />
                      <Button
                        type="submit"
                        name="intent"
                        value="friend_accept"
                        variant="secondary"
                        icon="check"
                        loading={busy}
                      >
                        Accepter
                      </Button>
                      <Button
                        type="submit"
                        name="intent"
                        value="friend_decline"
                        variant="secondary"
                        icon="close"
                        loading={busy}
                      >
                        Refuser
                      </Button>
                    </Form>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {friends.items.length > 0 && (
            <section className="n-group" data-testid="net-friends">
              <div className="n-group__head">
                <h2 className="s-h2">{N.myFriends}</h2>
                <span className="o-t-caption">{friends.items.length}</span>
              </div>
              <ul className="n-list">
                {friends.items.map((f) => (
                  <li key={f.userId} className="n-row">
                    <a className="n-row__main" href={`/u/${encodeURIComponent(f.pseudo)}?retour=/app/reseau`}>
                      <PersonAvatar url={f.avatarUrl} pseudo={f.pseudo} />
                      <span>
                        <strong>{f.pseudo}</strong>
                        <small>{gradeLabels[f.grade]}</small>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Button variant="secondary" icon="add" href="/app/amis" data-testid="net-add-friend">
            Ajouter un ami
          </Button>
        </>
      )}

      <p className="n-note" data-testid="net-privacy">
        <Icon name="lock" size={16} />
        <span>
          <strong>{N.privacyNoteStrong}</strong> {N.privacyNote}
        </span>
      </p>
    </div>
  );
}
