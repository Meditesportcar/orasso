import { Button, Icon, TextField } from "@orasso/design-system/web";
import {
  type FollowersPage,
  type FollowingPage,
  type FollowPerson,
  type FollowRequestsPage,
  gradeLabels,
  networkLabels as N,
  type NetworkCounts,
} from "@orasso/shared";
import { Form, useNavigation } from "react-router";

import { FollowAction, FollowerMenu, PersonAvatar } from "../components/People";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { type FollowActionData, followAction, isFollowIntent } from "../lib/follow.server";
import type { Route } from "./+types/reseau";
import "../styles/network.css";

// Lot R4c (maquette R4.6b), puis lot R6b (D37, maquette R6.2) : « Ton réseau » sur le site, comme l'appli : onglets
// « N abonnés », « N abonnements » et, pour un compte privé (ou s'il y en a), « N demandes » ; `?liste=` choisit la liste.
// Recherche dans la liste (côté serveur), 30 par page (« Suivants »). Abonnés : « Suivre en retour » / « Abonné » /
// « Demandé ». Demandes : « Accepter » et ✕. Toi seul vois ces listes : la page ne lit que les routes `/me/...`.
// Tour 2 : dans Abonnés, le menu ⋯ d'une ligne propose « Retirer cet abonné », avec confirmation.
export function meta() {
  return [{ title: "Ton réseau · Orasso" }, { name: "robots", content: "noindex" }];
}

const TABS = ["abonnes", "abonnements", "demandes"] as const;
type Tab = (typeof TABS)[number];

type PeoplePage = Extract<FollowingPage, { kind: "people" }>;
type OrgPage = Extract<FollowingPage, { kind: "structures" | "pros" }>;

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const url = new URL(request.url);
  const raw = url.searchParams.get("liste") ?? "abonnes";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 40);
  // Un curseur par groupe (personnes ou abonnés, organisateurs, pros), chacun avec son « Suivants ».
  const cursor = url.searchParams.get("apres") ?? "";
  const cursors: Record<"people" | "structures" | "pros", string> = {
    people: cursor,
    structures: url.searchParams.get("apres_org") ?? "",
    pros: url.searchParams.get("apres_pro") ?? "",
  };
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), ...extra });
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const network = await apiOrThrow<NetworkCounts>(request, "/me/network");
  const requestsTab = network.private || network.requestsIn > 0 || raw === "demandes";
  const tab: Tab = raw === "abonnements" ? "abonnements" : raw === "demandes" && requestsTab ? "demandes" : "abonnes";
  const base = { me, tab, q, network, requestsTab, error: null as string | null };
  const none = { followers: null, following: null, requests: null };

  if (tab === "abonnes") {
    const res = await api<FollowersPage>(request, `/me/followers${qs(cursor ? { cursor } : {})}`);
    return res.ok
      ? { ...base, ...none, followers: res.data }
      : { ...base, ...none, error: res.error.message || "Impossible de lire cette liste." };
  }
  if (tab === "demandes") {
    const res = await api<FollowRequestsPage>(request, `/me/follow-requests${qs(cursor ? { cursor } : {})}`);
    return res.ok
      ? { ...base, ...none, requests: res.data }
      : { ...base, ...none, error: res.error.message || "Impossible de lire cette liste." };
  }
  const page = (kind: "people" | "structures" | "pros") =>
    api<FollowingPage>(request, `/me/following${qs({ kind, ...(cursors[kind] ? { cursor: cursors[kind] } : {}) })}`);
  const [people, structures, pros] = await Promise.all([page("people"), page("structures"), page("pros")]);
  if (!people.ok || !structures.ok || !pros.ok) {
    const failed = [people, structures, pros].find((r) => !r.ok);
    return {
      ...base,
      ...none,
      error: (failed && !failed.ok && failed.error.message) || "Impossible de lire cette liste.",
    };
  }
  return {
    ...base,
    ...none,
    following: {
      people: people.data as PeoplePage,
      structures: structures.data as OrgPage,
      pros: pros.data as OrgPage,
    },
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (isFollowIntent(intent)) return followAction(request, form);
  return { followError: "Action inconnue." } satisfies FollowActionData;
}

function caption(p: FollowPerson) {
  return p.vehicle ?? gradeLabels[p.grade];
}

function PersonLine({ p }: { p: FollowPerson }) {
  return (
    <a className="r6row__main" href={`/u/${encodeURIComponent(p.pseudo)}?retour=/app/reseau`}>
      <PersonAvatar url={p.avatarUrl} pseudo={p.pseudo} size={42} />
      <span>
        <b>{p.pseudo}</b>
        <small className="o-never-truncate">{caption(p)}</small>
      </span>
    </a>
  );
}

function PersonRows({ items, busy, removable = false }: { items: FollowPerson[]; busy: boolean; removable?: boolean }) {
  return (
    <ul className="r6list">
      {items.map((p) => (
        <li key={p.userId} className="r6row" data-testid="net-person">
          <PersonLine p={p} />
          <div className="r6row__acts">
            <FollowAction
              pseudo={p.pseudo}
              mine={p.mine}
              followsMe={p.followsMe}
              canFollow={p.canFollow}
              visibility={p.visibility}
              size="small"
              busy={busy}
            />
            {removable && <FollowerMenu userId={p.userId} pseudo={p.pseudo} busy={busy} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

function RequestRows({ items, busy }: { items: FollowPerson[]; busy: boolean }) {
  return (
    <ul className="r6list">
      {items.map((p) => (
        <li key={p.userId} className="r6row" data-testid="net-request">
          <PersonLine p={p} />
          <Form method="post" className="r6row__acts">
            <input type="hidden" name="userId" value={p.userId} />
            <input type="hidden" name="pseudo" value={p.pseudo} />
            <Button
              type="submit"
              name="intent"
              value="follow_accept"
              variant="secondary"
              icon="check"
              className="fl-sm"
              loading={busy}
              data-testid="net-request-accept"
            >
              {N.accept}
            </Button>
            <Button
              type="submit"
              name="intent"
              value="follow_decline"
              variant="close"
              label={N.decline(p.pseudo)}
              className="fl-x"
              disabled={busy}
              data-testid="net-request-decline"
            />
          </Form>
        </li>
      ))}
    </ul>
  );
}

export default function Reseau({ loaderData, actionData: raw }: Route.ComponentProps) {
  const { me, tab, q, network, requestsTab, error, followers, following, requests } = loaderData;
  const actionData = raw as FollowActionData | undefined;
  const busy = useNavigation().state !== "idle";
  const label = (t: Tab) =>
    t === "abonnes"
      ? `${network.followers} ${N.followers(network.followers)}`
      : t === "abonnements"
        ? `${network.following} ${N.following(network.following)}`
        : `${network.requestsIn} ${N.requests(network.requestsIn)}`;
  const tabs = TABS.filter((t) => t !== "demandes" || requestsTab);
  const here = `/app/reseau?${new URLSearchParams({ liste: tab, ...(q ? { q } : {}) }).toString()}`;
  const next = (cursor: string | null, param: "apres" | "apres_org" | "apres_pro" = "apres") =>
    cursor ? (
      <Button
        variant="secondary"
        icon="down"
        href={`/app/reseau?${new URLSearchParams({ liste: tab, ...(q ? { q } : {}), [param]: cursor }).toString()}`}
        data-testid={param === "apres" ? "net-next" : `net-next-${param === "apres_org" ? "structures" : "pros"}`}
      >
        {N.next}
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
      <nav className={tabs.length === 2 ? "n-tabs n-tabs--two" : "n-tabs"} aria-label={N.title} data-testid="net-tabs">
        {tabs.map((t) => (
          <a
            key={t}
            href={`/app/reseau?liste=${t}`}
            aria-current={t === tab ? "page" : undefined}
            data-testid={`net-tab-${t}`}
          >
            {label(t)}
          </a>
        ))}
      </nav>
      <Form method="get" className="n-search" role="search">
        <input type="hidden" name="liste" value={tab} />
        <TextField label={N.searchLabel} name="q" defaultValue={q} placeholder={N.search} data-testid="net-search" />
        <Button type="submit" variant="secondary" icon="search">
          Chercher
        </Button>
      </Form>
      {actionData?.followError && (
        <p className="s-error" role="alert">
          {actionData.followError}
        </p>
      )}
      {actionData?.followNotice && (
        <p className="s-notice s-notice--ok" role="status" data-testid="net-notice">
          {actionData.followNotice}
        </p>
      )}

      {error && (
        <div className="s-stack s-stack--tight" role="alert" data-testid="net-error">
          <p className="s-error">{error}</p>
          <Button variant="secondary" icon="undo" href={here}>
            Réessayer
          </Button>
        </div>
      )}

      {followers &&
        (followers.items.length ? (
          <div className="n-group" data-testid="net-followers">
            <PersonRows items={followers.items} busy={busy} removable />
            {next(followers.nextCursor)}
          </div>
        ) : (
          empty(N.emptyFollowers)
        ))}

      {requests && (
        <>
          <p className="o-t-caption s-muted">{N.requestsHint}</p>
          {requests.items.length ? (
            <div className="n-group" data-testid="net-requests">
              <RequestRows items={requests.items} busy={busy} />
              {next(requests.nextCursor)}
            </div>
          ) : (
            empty(N.emptyRequests)
          )}
        </>
      )}

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
                  {next(page.nextCursor, page.kind === "structures" ? "apres_org" : "apres_pro")}
                </section>
              ) : null,
            )}
          </>
        ))}

      <p className="n-note" data-testid="net-privacy">
        <Icon name="lock" size={16} />
        <span>
          <strong>{N.privacyNoteStrong}</strong> {N.privacyNote}
        </span>
      </p>
    </div>
  );
}
