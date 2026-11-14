// Le crew affiché dans l'onglet Crew du site (lot R7b2, D38, maquette R7.11), comme l'appli : le haut compact (`CrewHead`, petit
// lot de fin partie E : vignette de la couverture, nom ▾, description repliée, Inviter et Réglages, Discussion), puis les
// onglets soulignés Fil · Sorties · Membres · Spots (`?crew=` et `?onglet=`), « Publier » en icône au bout. Ce que faisait la page du crew (lots 19, R5c2, R6a, R6c) pour un membre actif. Sur grand écran,
// les sorties restent à droite, comme avant ; l'onglet Sorties n'y a plus lieu d'être.
import { Button, TextField } from "@orasso/design-system/web";
import {
  type CrewMemberView,
  type CrewPendingList,
  type CrewView,
  crewInviteLabels,
  crewLabels,
  crewPageLabels as L,
  type MyCrew,
  crewTabLabels as T,
} from "@orasso/shared";
import { useEffect, useState } from "react";
import { Form, useNavigate, useNavigation, useSearchParams } from "react-router";

import type { CrewActionData } from "../../lib/crews.server";
import { CrewFeed } from "../crew-feed/CrewFeed";
import { CrewLiveProvider } from "../crew-feed/CrewLive";
import { CrewEventRow, CrewSecHead, Hidden, MemberFiche, MemberRow, OutingCard, RequestCard } from "./CrewPage";
import { CrewSpots } from "./CrewSpots";
import { CrewHead, CrewTabsBar } from "./CrewTop";

export type CrewTabId = "fil" | "sorties" | "membres" | "spots";
export const CREW_TABS: readonly CrewTabId[] = ["fil", "sorties", "membres", "spots"];

/** L'onglet d'un lien (`?onglet=`) ; l'ancien « garage » mène aux Membres, où sont les voitures. */
export function crewTabOf(asked: string | null): CrewTabId {
  if (asked === "garage") return "membres";
  return (CREW_TABS as readonly string[]).includes(asked ?? "") ? (asked as CrewTabId) : "fil";
}

export type CrewSpaceData = {
  crews: MyCrew[];
  crew: CrewView;
  members: CrewMemberView[] | null;
  pending: CrewPendingList | null;
  userId: string;
  tab: CrewTabId;
};

/** L'adresse de l'onglet Crew pour ce crew et cet onglet. */
export const crewTabHref = (slug: string, tab: CrewTabId = "fil") =>
  `/app/crew?crew=${encodeURIComponent(slug)}${tab === "fil" ? "" : `&onglet=${tab}`}`;

export function CrewSpaceView({ data, result }: { data: CrewSpaceData; result?: CrewActionData }) {
  const { crews, crew, members, pending, userId, tab } = data;
  const busy = useNavigation().state !== "idle";
  const leader = crew.viewerState === "leader";
  const member = crew.viewerState === "member" || leader;
  const live = !crew.archived;
  const space = crew.space;
  const back = crewTabHref(crew.slug, tab);
  const requests = pending?.requests ?? [];
  const confirm = (text: string) => (e: React.FormEvent<HTMLFormElement>) => {
    if (!window.confirm(text)) e.preventDefault();
  };
  const tabs: { id: CrewTabId; label: string; count?: number | null }[] = [
    { id: "fil", label: L.tabFeed },
    { id: "sorties", label: L.tabOutings, count: space?.outings.length || null },
    { id: "membres", label: L.tabMembers, count: leader ? requests.length || null : null },
    { id: "spots", label: T.tabSpots },
  ];
  // « Publier » : sur l'onglet Fil il ouvre la fenêtre de publication du fil ; ailleurs il mène au Fil, fenêtre ouverte (`?publier=1`).
  const [publishTick, setPublishTick] = useState(0);
  const [params] = useSearchParams();
  const autoPublish = params.get("publier") === "1" && tab === "fil";
  // Une fois la fenêtre ouverte, `publier` quitte l'adresse par la navigation du routeur (un F5 ne la rouvre pas, l'état du
  // routeur est gardé).
  const navigate = useNavigate();
  useEffect(() => {
    if (!autoPublish) return;
    const next = new URLSearchParams(params);
    next.delete("publier");
    navigate(`?${next.toString()}`, { replace: true, preventScrollReset: true });
  }, [autoPublish, params, navigate]);
  // Sur grand écran, les sorties sont toujours à droite : l'onglet « Sorties » y montre le fil à gauche.
  const main = tab === "sorties" ? "fil" : tab;

  const outings = space ? (
    <aside className="crw-col crw-side" data-active={tab === "sorties" ? "" : undefined} data-testid="crew-outings">
      {space.canProposeOuting ? (
        <>
          {/* Un seul bouton principal par écran : « Publier » (icône moutarde, au bout des onglets). « Proposer une sortie » est
              toujours secondaire, un seul bouton : la colonne des sorties est affichée ou non selon la largeur (CSS `.crw-side`). */}
          <Button
            variant="secondary"
            icon="add"
            href={`/c/${crew.slug}/sortie`}
            fullWidth
            data-testid="crew-propose-outing"
          >
            {L.proposeOuting}
          </Button>
        </>
      ) : (
        <p className="o-t-caption s-muted" data-testid="crew-propose-reserved">
          {L.proposeReserved}
        </p>
      )}
      <CrewSecHead title={L.outingsTitle} hint={L.outingsHint} icon="lock" />
      {space.outings.length === 0 ? <p className="s-muted">{L.outingsEmpty}</p> : null}
      {space.outings.map((o) => (
        <OutingCard key={o.id} crewId={crew.id} slug={crew.slug} outing={o} />
      ))}
      <CrewSecHead title={L.crewEventsTitle} hint={L.crewEventsHint} />
      {space.events.length === 0 ? <p className="s-muted">{L.crewEventsEmpty}</p> : null}
      {space.events.map((e) => (
        <CrewEventRow key={e.slug} event={e} href={leader && e.registered > 0 ? `/e/${e.slug}/crew` : `/e/${e.slug}`} />
      ))}
      {leader ? (
        <Button variant="secondary" icon="ticket" href="/evenements" fullWidth data-testid="crew-register">
          {L.registerCrew}
        </Button>
      ) : null}
    </aside>
  ) : null;

  // Lot R6a : en direct (membre d'un crew non dissous) ; une sortie, une arrivée, un départ ou un réglage relit la page.
  return (
    <CrewLiveProvider crewId={member && live ? crew.id : null}>
      <div className="crw-page" data-testid="crew" data-state={crew.viewerState}>
        <CrewHead
          crews={crews}
          crew={crew}
          leader={leader}
          member={member}
          live={live}
          tabHref={(slug, t) => crewTabHref(slug, t as CrewTabId)}
        />
        {crew.archived && <p className="s-notice">{L.archived}</p>}
        {result?.crewError && (
          <p className="s-error" role="alert">
            {result.crewError}
          </p>
        )}
        {result?.crewOk && (
          <p className="s-notice s-notice--ok" role="status" data-testid="crew-ok">
            {result.crewOk}
          </p>
        )}

        {space ? (
          <>
            <CrewTabsBar
              value={tab}
              items={tabs.map((t) => ({ ...t, href: crewTabHref(crew.slug, t.id) }))}
              publish={
                member && live
                  ? tab === "fil"
                    ? { onClick: () => setPublishTick((n) => n + 1) }
                    : {
                        href: `${crewTabHref(crew.slug, "fil")}${crewTabHref(crew.slug, "fil").includes("?") ? "&" : "?"}publier=1`,
                      }
                  : null
              }
            />
            <div className="crw-layout crw-layout--space">
              <div className="crw-col">
                {main === "fil" ? (
                  <div className={tab === "sorties" ? "crw-wide-only" : undefined}>
                    <CrewFeed
                      crew={{ id: crew.id, slug: crew.slug, archived: crew.archived }}
                      publishTick={publishTick}
                      autoPublish={autoPublish}
                    />
                  </div>
                ) : null}
                {main === "spots" ? <CrewSpots crewId={crew.id} archived={crew.archived} /> : null}
                {main === "membres" ? (
                  <section className="crw-col" data-testid="crew-members">
                    {leader && requests.length > 0 ? (
                      <>
                        <CrewSecHead title={L.requestsTitle} hint={L.requestsHint} />
                        <ul className="crw-list">
                          {requests.map((r) => (
                            <RequestCard key={r.person.userId} crewId={crew.id} request={r} back={back} />
                          ))}
                        </ul>
                      </>
                    ) : null}
                    <CrewSecHead title={L.membersTitle} hint={String(members?.length ?? crew.membersCount)} />
                    {/* Lot R6c (R6.7) : tout membre actif invite quelqu'un de son réseau (page à part). */}
                    {live ? (
                      <Button
                        variant="secondary"
                        icon="add"
                        href={`/c/${crew.slug}/inviter`}
                        fullWidth
                        data-testid="crew-invite-someone"
                      >
                        {crewInviteLabels.inviteSomeone}
                      </Button>
                    ) : null}
                    <ul className="crw-list">
                      {(members ?? []).map((m) => (
                        <MemberFiche
                          key={m.userId}
                          pseudo={m.pseudo}
                          avatarUrl={m.avatarUrl}
                          caption={m.vehicleLabel ?? L.noVehicle}
                          leader={m.role === "leader"}
                          back={back}
                          cars={space.garage.filter((g) => g.ownerPseudo.toLowerCase() === m.pseudo.toLowerCase())}
                        />
                      ))}
                    </ul>
                    {leader && pending ? (
                      <>
                        <Form method="post" className="s-row crw-row-end" data-testid="crew-invite-form">
                          <Hidden crewId={crew.id} intent="crew_invite" />
                          <TextField label={crewLabels.invitePseudo} name="pseudo" required autoComplete="off" />
                          <Button type="submit" variant="secondary" icon="add" loading={busy}>
                            {L.inviteSomeone}
                          </Button>
                        </Form>
                        {pending.invitations.length > 0 && (
                          <>
                            <h3 className="s-label o-t-label">{crewLabels.pendingInvitations}</h3>
                            <ul className="crw-list">
                              {pending.invitations.map((r) => (
                                <MemberRow
                                  key={r.person.userId}
                                  pseudo={r.person.pseudo}
                                  avatarUrl={r.person.avatarUrl}
                                  caption={
                                    r.invitedBy
                                      ? `${crewLabels.pendingInvitations} · ${crewInviteLabels.invitedBy(r.invitedBy)}`
                                      : crewLabels.pendingInvitations
                                  }
                                  leader={false}
                                  back={back}
                                >
                                  <Form method="post">
                                    <Hidden crewId={crew.id} userId={r.person.userId} intent="crew_invitation_cancel" />
                                    <Button type="submit" variant="secondary" icon="close" loading={busy}>
                                      {crewLabels.cancelInvitation}
                                    </Button>
                                  </Form>
                                </MemberRow>
                              ))}
                            </ul>
                          </>
                        )}
                      </>
                    ) : null}
                    {crew.viewerState === "member" ? (
                      <Form method="post" onSubmit={confirm(crewLabels.leaveConfirm)}>
                        <Hidden crewId={crew.id} userId={userId} intent="crew_leave" />
                        <Button type="submit" variant="secondary" icon="undo" loading={busy} data-testid="crew-leave">
                          {crewLabels.leave}
                        </Button>
                      </Form>
                    ) : null}
                  </section>
                ) : null}
              </div>
              {outings}
            </div>
          </>
        ) : null}
      </div>
    </CrewLiveProvider>
  );
}
