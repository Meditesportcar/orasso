import { Button, departmentChoices, Icon, TextField } from "@orasso/design-system/web";
import {
  type CrewMemberView,
  type CrewPendingList,
  type CrewView,
  crewInstagramUrl,
  crewInviteLabels,
  crewLabels,
  crewOutingRsvps,
  crewPageLabels as L,
} from "@orasso/shared";
import { data, Form, useNavigation } from "react-router";

import { CrewLogo } from "../components/Crews";
import { CrewFeed } from "../components/crew-feed/CrewFeed";
import {
  CrewEventRow,
  CrewRequestDialog,
  CrewSecHead,
  FriendsBox,
  GarageTile,
  InfoBox,
  MemberRow,
  OutingCard,
  RequestCard,
  vitrineCaption,
} from "../components/crew-page/CrewPage";
import { FicheBar, ficheHandle } from "../components/FicheBar";
import { ReportDialog } from "../components/ReportDialog";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { type CrewActionData, crewAction, isCrewIntent } from "../lib/crews.server";
import type { Route } from "./+types/crew";

// Page d'un crew. Lot 19 : fiche, membres, demandes, invitations. Lot M7 : mode B (en-tête de fiche).
// Lot R5c2 (maquettes R5.7 et R5.8, décisions de Damien du 26/10), comme l'appli :
// - membre : bannière, logo, nom, « Crew · département · N membres · depuis », description, « Tu es le chef »,
//   Instagram ; Discussion (non-lus), Réglages (chef) ; onglets Fil (le fil du lot R5c1), Sorties, Garage,
//   Membres (`?onglet=`) ; sur grand écran, les sorties à droite ;
// - non-membre : la vitrine (image du crew, description, Instagram, amis membres, membres) et « Demander à rejoindre »,
//   qui ouvre la fenêtre avec un mot pour le chef.
// Les réglages du chef ont leur page (`/c/:slug/reglages`), la sortie la sienne (`/c/:slug/sortie`).
export const handle = ficheHandle;

type Tab = "fil" | "sorties" | "garage" | "membres";
const TABS: readonly Tab[] = ["fil", "sorties", "garage", "membres"];

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.crew.name ?? "Crew"} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const crew = await apiOrThrow<CrewView>(request, `/crews/by-slug/${encodeURIComponent(params.slug)}`);
  const member = crew.viewerState === "member" || crew.viewerState === "leader";
  const live = !crew.archived;
  const members = member && live ? await apiOrThrow<CrewMemberView[]>(request, `/crews/${crew.id}/members`) : null;
  const pending =
    crew.viewerState === "leader" && live
      ? await apiOrThrow<CrewPendingList>(request, `/crews/${crew.id}/requests`)
      : null;
  const asked = new URL(request.url).searchParams.get("onglet");
  const tab: Tab = (TABS as readonly string[]).includes(asked ?? "") ? (asked as Tab) : "fil";
  return { crew, members, pending, userId: me.user.id, tab };
}

type ActionData = CrewActionData;

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (isCrewIntent(intent)) return crewAction(request, form);
  const crewId = encodeURIComponent(String(form.get("crewId") ?? ""));
  const outingId = encodeURIComponent(String(form.get("outingId") ?? ""));
  if (intent === "outing_rsvp") {
    const answer = String(form.get("answer") ?? "");
    if (!(crewOutingRsvps as readonly string[]).includes(answer)) {
      return data<ActionData>({ crewError: "Réponse inconnue." }, { status: 400 });
    }
    const res = await api(request, `/crews/${crewId}/outings/${outingId}/rsvp`, { method: "PUT", json: { answer } });
    if (!res.ok) return data<ActionData>({ crewError: res.error.message }, { status: res.status });
    return data<ActionData>({ crewError: null });
  }
  if (intent === "outing_cancel") {
    const res = await api(request, `/crews/${crewId}/outings/${outingId}`, { method: "DELETE" });
    if (!res.ok) return data<ActionData>({ crewError: res.error.message }, { status: res.status });
    return data<ActionData>({ crewError: null, crewOk: L.outingCancelled });
  }
  return data<ActionData>({ crewError: "Action inconnue." }, { status: 400 });
}

function Hidden({ crewId, userId, intent }: { crewId: string; userId?: string; intent: string }) {
  return (
    <>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="crewId" value={crewId} />
      {userId && <input type="hidden" name="userId" value={userId} />}
    </>
  );
}

export default function Crew({ loaderData, actionData }: Route.ComponentProps) {
  const { crew, members, pending, userId, tab } = loaderData;
  const result = actionData as ActionData | undefined;
  const busy = useNavigation().state !== "idle";
  const leader = crew.viewerState === "leader";
  const member = crew.viewerState === "member" || leader;
  const live = !crew.archived;
  const space = crew.space;
  const back = `/c/${crew.slug}`;
  const since = new Date(crew.createdAt).getFullYear();
  const requests = pending?.requests ?? [];
  const confirm = (text: string) => (e: React.FormEvent<HTMLFormElement>) => {
    if (!window.confirm(text)) e.preventDefault();
  };
  const tabHref = (t: Tab) => (t === "fil" ? back : `${back}?onglet=${t}`);
  const tabs: { id: Tab; label: string }[] = [
    { id: "fil", label: L.tabFeed },
    { id: "sorties", label: L.tabCount(L.tabOutings, space?.outings.length ?? 0) },
    { id: "garage", label: L.tabGarage },
    { id: "membres", label: L.tabCount(L.tabMembers, leader ? requests.length : 0) },
  ];
  // Sur grand écran, les sorties sont toujours à droite : l'onglet « Sorties » y montre le fil à gauche.
  const main = tab === "sorties" ? "fil" : tab;

  const outings = space ? (
    <aside className="crw-col crw-side" data-active={tab === "sorties" ? "" : undefined} data-testid="crew-outings">
      {space.canProposeOuting ? (
        <>
          {/* Tour 2 : un seul bouton principal par écran. Sur grand écran, le fil et son « Publier » sont à côté des
              sorties : « Proposer une sortie » y passe en secondaire (CSS `crw-propose--narrow` / `crw-propose--wide`). */}
          <Button
            icon="add"
            href={`${back}/sortie`}
            fullWidth
            className={main === "fil" ? "crw-propose--narrow" : undefined}
            data-testid="crew-propose-outing"
          >
            {L.proposeOuting}
          </Button>
          {main === "fil" ? (
            <Button
              variant="secondary"
              icon="add"
              href={`${back}/sortie`}
              fullWidth
              className="crw-propose--wide"
              data-testid="crew-propose-outing-wide"
            >
              {L.proposeOuting}
            </Button>
          ) : null}
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

  return (
    <>
      <FicheBar heading={false} title={crewLabels.crew} back="/app/crews" />
      <div className="crw-page" data-testid="crew" data-state={crew.viewerState}>
        <div className="crw-hero">
          {crew.bannerUrl ? <img src={crew.bannerUrl} alt={`Bannière de ${crew.name}`} /> : null}
        </div>
        <div className="crw-id">
          <span className="crw-id__ring">
            <CrewLogo url={crew.logoUrl} name={crew.name} size={84} />
          </span>
          <div className="crw-id__text">
            <h1 className="s-title o-never-truncate">{crew.name}</h1>
            <span className="o-t-caption s-muted">
              {L.idLine(
                departmentChoices.find((d) => d.code === crew.department)?.name ?? crew.department,
                crew.membersCount,
                since,
              )}
            </span>
          </div>
        </div>
        {crew.description ? (
          <p className="crw-bio s-prewrap" data-testid="crew-description">
            {crew.description}
          </p>
        ) : null}
        {leader || crew.instagram ? (
          <div className="crw-chips">
            {leader ? <span className="crw-tag crw-tag--acc">{L.youLead}</span> : null}
            {crew.instagram ? (
              <a
                className="crw-sc"
                href={crewInstagramUrl(crew.instagram)}
                rel="noopener noreferrer"
                target="_blank"
                aria-label={L.instagramA11y(crew.instagram)}
                data-testid="crew-instagram"
              >
                <Icon name="instagram" size={16} />
                {crew.instagram}
              </a>
            ) : null}
          </div>
        ) : null}

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

        {member && crew.conversationId ? (
          <div className="crw-acts">
            <span className="crw-acts__main">
              <Button
                variant="secondary"
                icon="chat"
                href={`/app/boite/${crew.conversationId}`}
                aria-label={L.discussionA11y(space?.unreadCount ?? 0)}
                data-testid="crew-discussion"
              >
                {L.discussion}
              </Button>
              {space && space.unreadCount > 0 ? (
                <span className="crw-dot" data-testid="crew-unread">
                  {space.unreadCount > 99 ? "99+" : space.unreadCount}
                </span>
              ) : null}
            </span>
            {leader && live ? (
              <Button
                variant="secondary"
                icon="gear"
                href={`${back}/reglages`}
                aria-label={L.settingsA11y}
                data-testid="crew-settings"
              />
            ) : null}
          </div>
        ) : null}

        {space ? (
          <>
            <nav className="crw-tabs" aria-label={crewLabels.crew} data-testid="crew-tabs">
              {tabs.map((t) => (
                <a
                  key={t.id}
                  href={tabHref(t.id)}
                  className={t.id === "sorties" ? "crw-tab-outings" : undefined}
                  aria-current={tab === t.id ? "page" : undefined}
                  data-testid={`crew-tab-${t.id}`}
                >
                  {t.label}
                </a>
              ))}
            </nav>
            <div className="crw-layout crw-layout--space">
              <div className="crw-col">
                {main === "fil" ? (
                  <div className={tab === "sorties" ? "crw-wide-only" : undefined}>
                    <CrewFeed crew={{ id: crew.id, slug: crew.slug, archived: crew.archived }} />
                  </div>
                ) : null}
                {main === "garage" ? (
                  <section className="crw-col" data-testid="crew-garage">
                    <CrewSecHead title={L.garageTitle} hint={L.garageCount(space.garage.length)} />
                    {space.garage.length === 0 ? <p className="s-muted">{L.garageEmpty}</p> : null}
                    <div className="crw-grid">
                      {space.garage.map((g) => (
                        <GarageTile key={g.id} vehicle={g} />
                      ))}
                    </div>
                  </section>
                ) : null}
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
                        href={`${back}/inviter`}
                        fullWidth
                        data-testid="crew-invite-someone"
                      >
                        {crewInviteLabels.inviteSomeone}
                      </Button>
                    ) : null}
                    <ul className="crw-list">
                      {(members ?? []).map((m) => (
                        <MemberRow
                          key={m.userId}
                          pseudo={m.pseudo}
                          avatarUrl={m.avatarUrl}
                          caption={m.vehicleLabel ?? L.noVehicle}
                          leader={m.role === "leader"}
                          back={back}
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

        {!member ? (
          <section className="crw-vitrine" data-testid="crew-vitrine">
            <FriendsBox friends={crew.members.filter((m) => m.friend)} />
            <CrewSecHead title={L.membersTitle} hint={String(crew.membersCount)} />
            <ul className="crw-list">
              {crew.members.map((m) => (
                <MemberRow
                  key={m.pseudo}
                  pseudo={m.pseudo}
                  avatarUrl={m.avatarUrl}
                  caption={vitrineCaption(m)}
                  leader={m.role === "leader"}
                  back={back}
                />
              ))}
            </ul>
            <InfoBox
              icon="lock"
              title={L.membersOnly}
              caption={L.leaderAccepts(crew.leader?.pseudo ?? null)}
              testId="crew-members-only"
            />
            {live && crew.viewerState === "none" ? (
              <CrewRequestDialog
                crew={crew}
                leaderPseudo={crew.leader?.pseudo ?? null}
                wide
                primary
                testId="crew-request"
              />
            ) : null}
            {crew.viewerState === "requested" ? (
              <>
                <InfoBox
                  icon="check"
                  accent
                  title={L.requestSentTo(crew.leader?.pseudo ?? null)}
                  caption={L.requestSentHint}
                  testId="crew-request-sent"
                />
                <Form method="post">
                  <Hidden crewId={crew.id} userId={userId} intent="crew_request_cancel" />
                  <Button
                    type="submit"
                    variant="secondary"
                    icon="close"
                    loading={busy}
                    fullWidth
                    data-testid="crew-request-cancel"
                  >
                    {L.cancelRequest}
                  </Button>
                </Form>
              </>
            ) : null}
            {crew.viewerState === "invited" && live ? (
              <div className="s-row">
                <Form method="post">
                  <Hidden crewId={crew.id} intent="crew_invitation_accept" />
                  <Button type="submit" icon="check" loading={busy} data-testid="crew-invitation-accept">
                    {crewLabels.acceptInvitation}
                  </Button>
                </Form>
                <Form method="post">
                  <Hidden crewId={crew.id} intent="crew_invitation_decline" />
                  <Button type="submit" variant="secondary" icon="close" loading={busy}>
                    {crewLabels.declineInvitation}
                  </Button>
                </Form>
              </div>
            ) : null}
          </section>
        ) : null}

        {!leader && live ? <ReportDialog look="link" targetType="crew" targetId={crew.id} /> : null}
      </div>
    </>
  );
}
