// Le crew affiché dans l'onglet Crew du site (lot R7b2, D38, maquette R7.11), comme l'appli : le sélecteur de crew, l'image du
// crew, sa description, la Discussion (avec ses non-lus), Réglages (chef), puis les onglets Fil · Sorties · Membres · Spots
// (`?crew=` et `?onglet=`). Ce que faisait la page du crew (lots 19, R5c2, R6a, R6c) pour un membre actif. Sur grand écran,
// les sorties restent à droite, comme avant ; l'onglet Sorties n'y a plus lieu d'être.
import { Button, Icon, TextField } from "@orasso/design-system/web";
import {
  type CrewMemberView,
  type CrewPendingList,
  type CrewView,
  crewInstagramUrl,
  crewInviteLabels,
  crewLabels,
  crewPageLabels as L,
  type MyCrew,
  crewTabLabels as T,
} from "@orasso/shared";
import { Form, useNavigation } from "react-router";

import type { CrewActionData } from "../../lib/crews.server";
import { CrewFeed } from "../crew-feed/CrewFeed";
import { CrewLiveProvider } from "../crew-feed/CrewLive";
import { ReportDialog } from "../ReportDialog";
import {
  CrewBadge,
  CrewEventRow,
  CrewSecHead,
  Hidden,
  MemberFiche,
  MemberRow,
  OutingCard,
  RequestCard,
} from "./CrewPage";
import { CrewSpots } from "./CrewSpots";

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

/** Le sélecteur de crew : « Roussillon Drift ▾ » (plusieurs crews) ; avec un seul, le nom seul. */
function CrewSelector({ crews, crew }: { crews: readonly MyCrew[]; crew: CrewView }) {
  const several = crews.length > 1;
  const sub = [
    crewLabels.membersCount(crew.membersCount),
    several ? T.otherCrews(crews.length - 1) : crew.viewerState === "leader" ? T.youLeader : T.youMember,
  ].join(" · ");
  const head = (
    <>
      <CrewBadge name={crew.name} logoUrl={crew.logoUrl} size={40} />
      <span className="crw-grow">
        <b className="crw-sel__name o-never-truncate">{crew.name}</b>
        <span className="o-t-caption s-muted crw-block">{sub}</span>
      </span>
      {several ? <Icon name="down" size={20} /> : null}
    </>
  );
  if (!several) {
    return (
      <div className="crw-sel" data-testid="crew-selector-single">
        <div className="crw-sel__head">{head}</div>
      </div>
    );
  }
  return (
    <div className="crw-sel">
      <details className="crw-sel__menu">
        <summary className="crw-sel__head" aria-label={T.selectorA11y(crew.name)} data-testid="crew-selector">
          {head}
        </summary>
        <ul className="crw-sel__list" aria-label={T.selectorTitle} data-testid="crew-selector-list">
          {crews.map((c) => (
            <li key={c.id}>
              <a
                href={crewTabHref(c.slug)}
                aria-current={c.id === crew.id ? "true" : undefined}
                data-testid={`crew-choice-${c.slug}`}
              >
                <CrewBadge name={c.name} logoUrl={c.logoUrl} size={36} />
                <span className="crw-grow">
                  <b className="o-never-truncate">{c.name}</b>
                  <span className="o-t-caption s-muted crw-block">{crewLabels.membersCount(c.membersCount)}</span>
                </span>
                {c.id === crew.id ? <Icon name="check" size={20} /> : null}
              </a>
            </li>
          ))}
          <li>
            <a href="/app/crews/rejoindre" data-testid="crew-choice-more">
              <Icon name="add" size={22} />
              <span className="crw-grow">
                <b>{T.joinOrCreate}</b>
              </span>
            </a>
          </li>
        </ul>
      </details>
    </div>
  );
}

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
  const tabs: { id: CrewTabId; label: string }[] = [
    { id: "fil", label: L.tabFeed },
    { id: "sorties", label: L.tabCount(L.tabOutings, space?.outings.length ?? 0) },
    { id: "membres", label: L.tabCount(L.tabMembers, leader ? requests.length : 0) },
    { id: "spots", label: T.tabSpots },
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
            href={`/c/${crew.slug}/sortie`}
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
              href={`/c/${crew.slug}/sortie`}
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

  // Lot R6a : en direct (membre d'un crew non dissous) ; une sortie, une arrivée, un départ ou un réglage relit la page.
  return (
    <CrewLiveProvider crewId={member && live ? crew.id : null}>
      <div className="crw-page" data-testid="crew" data-state={crew.viewerState}>
        <CrewSelector crews={crews} crew={crew} />
        {crew.bannerUrl ? (
          <div className="crw-hero" data-testid="crew-cover">
            <img src={crew.bannerUrl} alt={`Bannière de ${crew.name}`} />
          </div>
        ) : null}
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
              <>
                <Button
                  variant="secondary"
                  icon="share"
                  href={`/c/${crew.slug}/inviter`}
                  aria-label={L.inviteA11y}
                  data-testid="crew-invite"
                />
                <Button
                  variant="secondary"
                  icon="gear"
                  href={`/c/${crew.slug}/reglages`}
                  aria-label={L.settingsA11y}
                  data-testid="crew-settings"
                />
              </>
            ) : null}
          </div>
        ) : null}

        {space ? (
          <>
            <nav className="crw-tabs" aria-label={crewLabels.crew} data-testid="crew-tabs">
              {tabs.map((t) => (
                <a
                  key={t.id}
                  href={crewTabHref(crew.slug, t.id)}
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
        {/* Signaler (lot 32) : un crew dont on n'est pas le chef, depuis son espace comme avant. */}
        {member && !leader && live ? <ReportDialog look="link" targetType="crew" targetId={crew.id} /> : null}
      </div>
    </CrewLiveProvider>
  );
}
