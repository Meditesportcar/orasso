// Sorties (ex-Accès ; lot 40 : contenu déplacé tel quel, lot 43 : tickets, prototype `s-sorties`) : ta place aux
// événements, sous forme de tickets dont la souche porte la date. Trois segments : « À venir » (candidatures, billets du
// public, invitations reçues), « Staff » (missions de l'exposant : « Je serai là », mode staff), « Passées » (carnet de
// route : pointage, points, avis, malus). Les candidatures sont lues dans le cache du téléphone (lisibles hors ligne).

import { Button, EmptyState, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  afterEventLabels,
  type ContestStatus,
  contestStatusLabels,
  crewLabels,
  invitationLabels,
  type MyApplication,
  type MyStaffEvent,
  type MyTicket,
  POINTS_PENDING_LABEL,
  type ReceivedInvitation,
  recapScreenTexts,
  refusalReasonLabels,
  seasonYear,
  sortiesLabels,
  staffMissionActions,
  staffPresenceLabels,
  staffRequestLabels,
  staffRoleLabels,
  ticketAppLabels,
  voteScreenTexts,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ContestSheet } from "@/features/ContestSheet";
import { CrewConfirmSheet } from "@/features/CrewConfirmSheet";
import { InvitationSheet } from "@/features/invitations/InvitationSheet";
import { InvitationCard } from "@/features/invitations/ReceivedInvitations";
import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { ReviewSheet, type ReviewTarget } from "@/features/ReviewSheet";
import { formatPrice } from "@/features/tickets/TicketsBlock";
import { WithdrawSheet } from "@/features/WithdrawSheet";
import { api } from "@/lib/api";
import { useApplications } from "@/lib/applications";
import { dayCountdown, formatDayHour, formatDuration, formatShortDate } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { usePersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { useStaffActions } from "@/lib/staff/useStaff";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { TicketPulse } from "@/ui/Announce";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { TICKET_BLOCKS, Waiting } from "@/ui/Waiting";
import { ApplicationTag, Seg, SkewTag, SmallButton } from "./bits";
import {
  arrivalPhrase,
  liveApplications,
  type SortiesSegment,
  staffUpcoming,
  ticketsPast,
  ticketsUpcoming,
  waitlistPhrase,
} from "./model";
import { Ticket } from "./Ticket";

const { space2 } = tokens.spacing;

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`.replace("-", "−"));
const starsLabel = (n: number) => `${n} étoile${n > 1 ? "s" : ""} sur 3`;
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function SortiesScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const { goTab, persona } = usePersona();
  const now = useNow();
  const { upcoming, past, loading, offline, reload } = useApplications();
  const staff = useApi(() => api.staffEvents(), [], { cacheKey: "staff-events" });
  // Invitations nominatives reçues (lot 25, docs/02 « Accès »).
  const invitations = useApi(() => api.myEventInvitations(), []);
  // Billets du public (lot 34).
  const tickets = useApi(() => api.myTickets(), []);
  // Récaps prêts (lot 50) : à partir du lendemain de l'événement, 10 h.
  const recaps = useApi(() => api.recaps(), [], { cacheKey: "recaps" });
  const recapReady = new Set((recaps.data ?? []).filter((r) => new Date(r.readyAt) <= now).map((r) => r.eventId));
  const [segment, setSegment] = useState<SortiesSegment>("upcoming");
  const [answering, setAnswering] = useState<ReceivedInvitation | null>(null);
  const [answered, setAnswered] = useState<string | null>(null);
  const { me } = useSession();
  const staffActions = useStaffActions(me?.user.id ?? null);
  const unsentBy = new Map<string, { title: string; count: number }>();
  for (const a of staffActions) {
    if (a.sentAt) continue;
    const u = unsentBy.get(a.eventId) ?? { title: a.eventTitle, count: 0 };
    u.count++;
    unsentBy.set(a.eventId, u);
  }
  const orphans = [...unsentBy.entries()].filter(([eventId]) => !staff.data?.some((s) => s.event.id === eventId));
  const [withdrawing, setWithdrawing] = useState<MyApplication | null>(null);
  const [giving, setGiving] = useState<MyTicket | null>(null);
  const [givingBusy, setGivingBusy] = useState(false);
  const [givingError, setGivingError] = useState<string | null>(null);
  const [contesting, setContesting] = useState<{ applicationId: string; title: string } | null>(null);
  const [reviewing, setReviewing] = useState<ReviewTarget | null>(null);
  // Lien d'avis d'un remerciement (lot 27, `orasso://acces?avis=<candidature>`) : ouvre la feuille d'avis, une seule fois.
  const { avis } = useLocalSearchParams<{ avis?: string }>();
  const [avisNotice, setAvisNotice] = useState<string | null>(null);
  const avisHandled = useRef<string | null>(null);
  useEffect(() => {
    if (!avis || avisHandled.current === avis || !past) return;
    avisHandled.current = avis;
    const app = past.find((a) => a.id === avis);
    if (!app) return setAvisNotice(afterEventLabels.reviewLinkInvalid);
    if (app.review?.canReview) {
      setReviewing({ applicationId: app.id, title: app.event.title, deadline: app.review.deadline });
    } else if (app.review?.given) {
      setAvisNotice("Tu as déjà laissé ton avis, merci !");
    } else {
      setAvisNotice(afterEventLabels.reviewLinkInvalid);
    }
  }, [avis, past]);
  const [confirmingCrew, setConfirmingCrew] = useState<MyApplication | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(app: MyApplication, action: () => Promise<unknown>) {
    setBusyId(app.id);
    setError(null);
    try {
      await action();
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function giveBack() {
    if (!giving) return;
    setGivingBusy(true);
    setGivingError(null);
    try {
      await api.returnTicket(giving.id);
      setGiving(null);
      await tickets.reload();
    } catch (e) {
      setGivingError(errorMessage(e));
    } finally {
      setGivingBusy(false);
    }
  }

  const live = liveApplications(upcoming);
  // Un seul bouton principal par écran : la place libérée d'abord (elle expire), sinon le QR de la première place retenue,
  // sinon le premier billet.
  const offerId = live.find((a) => a.status === "offered")?.id;
  const firstAccepted = offerId ? undefined : live.find((a) => a.status === "accepted" && !a.checkedInAt)?.id;
  // Le ticket crème de l'artefact (`.tk.me`) : ta prochaine place retenue, même quand une place libérée prend le bouton principal.
  const meId = live.find((a) => a.status === "accepted" && !a.checkedInAt)?.id;
  const history = (past ?? []).filter((a) => a.status === "accepted" || a.withdrawnAfterLock);
  const upcomingTickets = ticketsUpcoming(tickets.data ?? [], now);
  const pastTickets = ticketsPast(tickets.data ?? [], now);
  const staffItems = staffUpcoming(staff.data ?? [], now);
  const showStaff = persona.kind === "fan";
  const countUpcoming = live.length + upcomingTickets.length;
  const countPast = history.length + pastTickets.length;
  const canWithdrawAny = live.some((a) => ["pending", "waitlisted", "accepted"].includes(a.status));

  // Rang au prix du public des sorties pointées récentes (calculé par le récap ; rien avant J+1 10 h).
  const [ranks, setRanks] = useState<Record<string, { rank: number; of: number } | null>>({});
  // `history` est recalculé à chaque rendu : `asked` limite chaque événement à une seule requête.
  const asked = useRef(new Set<string>());
  useEffect(() => {
    const recent = history.filter((a) => a.checkedInAt && !asked.current.has(a.event.id)).slice(0, 3);
    for (const a of recent) {
      asked.current.add(a.event.id);
      void api.eventAudienceRank(a.event.id).then((r) => setRanks((prev) => ({ ...prev, [a.event.id]: r })));
    }
  }, [history]);

  return (
    <TabScreen
      title="Mes sorties"
      facts={`Saison ${seasonYear(now)}`}
      onRefresh={async () => {
        await Promise.all([reload(), staff.reload(), invitations.reload(), tickets.reload(), recaps.reload()]);
      }}
      overlays={
        <>
          <WithdrawSheet
            app={withdrawing}
            now={now}
            onClose={() => setWithdrawing(null)}
            onConfirm={async (app) => {
              await api.withdraw(app.id);
              setWithdrawing(null);
              await reload();
            }}
          />
          <ContestSheet
            target={contesting}
            onClose={() => setContesting(null)}
            onDone={() => {
              setContesting(null);
              void reload();
            }}
          />
          <CrewConfirmSheet
            app={confirmingCrew}
            onClose={() => setConfirmingCrew(null)}
            onDone={() => {
              setConfirmingCrew(null);
              void reload();
            }}
          />
          <InvitationSheet
            invitation={answering}
            onClose={() => setAnswering(null)}
            onDone={(message) => {
              setAnswering(null);
              setAnswered(message);
              void invitations.reload();
              void reload();
            }}
          />
          <ReviewSheet
            target={reviewing}
            onClose={() => setReviewing(null)}
            onDone={() => {
              setReviewing(null);
              void reload();
            }}
          />
          <ConfirmSheet
            visible={giving !== null}
            title={ticketAppLabels.giveBackTitle}
            body={ticketAppLabels.giveBackBody}
            confirmLabel={ticketAppLabels.giveBack}
            confirmIcon="undo"
            busy={givingBusy}
            error={givingError}
            onConfirm={() => void giveBack()}
            onClose={() => setGiving(null)}
          />
        </>
      }
    >
      {offline ? (
        <Notice>Hors ligne : voici ce que ton téléphone a gardé. Tes QR du jour J restent disponibles.</Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {answered ? <Notice>{answered}</Notice> : null}
      {avisNotice ? <Notice>{avisNotice}</Notice> : null}

      <Seg
        testID="sorties-segments"
        value={segment}
        onChange={setSegment}
        items={[
          { id: "upcoming", label: `À venir · ${countUpcoming}` },
          ...(showStaff ? [{ id: "staff" as const, label: `Staff · ${staffItems.length}` }] : []),
          { id: "past", label: `Passées · ${countPast}` },
        ]}
      />

      {segment === "upcoming" ? (
        <>
          {invitations.data && invitations.data.length > 0 ? (
            <>
              <Text variant="label" color={t.color.ink}>
                {invitationLabels.received}
              </Text>
              {invitations.data.map((inv) => (
                <InvitationCard
                  key={inv.id}
                  inv={inv}
                  onAnswer={() => setAnswering(inv)}
                  onOpenEvent={() => router.push(`/e/${inv.event.slug}`)}
                />
              ))}
            </>
          ) : null}

          {live.map((app) => (
            // Lot M6 : le ticket annoncé par le bandeau (« Retenue ! », place libérée) bat deux fois.
            <TicketPulse key={app.id} id={app.id}>
              <ApplicationTicket
                app={app}
                now={now}
                busy={busyId === app.id}
                primary={app.id === firstAccepted}
                highlight={app.id === meId}
                primaryOffer={app.id === offerId}
                onOpen={() => router.push(`/e/${app.event.slug}`)}
                onJourJ={() => router.push(`/jour-j/${app.id}`)}
                onVote={() => router.push(`/vote/${app.event.id}?titre=${encodeURIComponent(app.event.title)}`)}
                onWithdraw={() => setWithdrawing(app)}
                onAccept={() => void run(app, () => api.acceptOffer(app.id))}
                onDecline={() => void run(app, () => api.declineOffer(app.id))}
                onConfirmCrew={() => setConfirmingCrew(app)}
                onDeclineCrew={() => void run(app, () => api.declineCrewVenue(app.id))}
              />
            </TicketPulse>
          ))}

          {upcomingTickets.map((x, i) => (
            <TicketOfPublic
              key={x.id}
              ticket={x}
              now={now}
              primary={!offerId && !firstAccepted && i === 0}
              onOpen={() => router.push(`/e/${x.event.slug}`)}
              onShow={() => router.push(`/billet/${x.id}`)}
              onGiveBack={() => setGiving(x)}
              onVote={() => router.push(`/vote/${x.event.id}?titre=${encodeURIComponent(x.event.title)}`)}
            />
          ))}

          {countUpcoming === 0 && loading ? (
            // Lot M3 : squelettes des tickets pendant la première lecture (le cache des candidatures arrive d'abord).
            <Waiting blocks={TICKET_BLOCKS} testID="sorties-loading" />
          ) : countUpcoming === 0 && !(invitations.data && invitations.data.length > 0) ? (
            <EmptyState
              title={sortiesLabels.emptyUpcomingTitle}
              text={sortiesLabels.emptyUpcomingText}
              action={
                <Button variant="primary" icon="explore" onPress={() => goTab("explorer")} fullWidth>
                  Explorer les événements
                </Button>
              }
            />
          ) : null}

          {canWithdrawAny ? (
            <Muted variant="caption" style={styles.help}>
              {sortiesLabels.withdrawHelp}
            </Muted>
          ) : null}
          {upcomingTickets.some((x) => x.priceCents == null) ? (
            <Muted variant="caption" style={styles.help}>
              {sortiesLabels.giveBackHelp}
            </Muted>
          ) : null}
        </>
      ) : null}

      {segment === "staff" ? (
        <>
          {staffItems.map((s) => (
            <StaffTicket
              key={s.event.id}
              item={s}
              unsent={unsentBy.get(s.event.id)?.count ?? 0}
              now={now}
              onVote={() => router.push(`/vote/${s.event.id}?titre=${encodeURIComponent(s.event.title)}`)}
              onOpen={() => router.push(`/staff/${s.event.id}`)}
              onChanged={() => void staff.reload()}
            />
          ))}
          {(me?.memberships ?? [])
            .filter((m) => m.role === "staff" && m.status === "requested")
            .map((m) => (
              <Notice key={m.structureId}>
                {staffRequestLabels.sent} · {m.structureName} : tu seras prévenu quand l'équipe organisatrice aura
                répondu.
              </Notice>
            ))}
          {orphans.map(([eventId, u]) => (
            <Notice key={eventId}>
              {u.count} envoi{u.count > 1 ? "s" : ""} du staff à faire · {u.title || "événement terminé"} : ils
              partiront au retour du réseau.
            </Notice>
          ))}
          {staffItems.length === 0 ? (
            <EmptyState title={sortiesLabels.emptyStaffTitle} text={sortiesLabels.emptyStaffText} />
          ) : null}
        </>
      ) : null}

      {segment === "past" ? (
        <>
          {history.map((app) => (
            <PastTicket
              key={app.id}
              app={app}
              rank={ranks[app.event.id] ?? null}
              recapReady={recapReady.has(app.event.id)}
              onRecap={() => router.push(`/recap/${app.event.id}`)}
              onContest={() => setContesting({ applicationId: app.id, title: app.event.title })}
              onReview={() =>
                app.review &&
                setReviewing({ applicationId: app.id, title: app.event.title, deadline: app.review.deadline })
              }
              onOpen={() => router.push(`/e/${app.event.slug}`)}
            />
          ))}
          {pastTickets.map((x) => (
            <Ticket
              key={x.id}
              testID="ticket-past-public"
              dim
              date={x.event.startsAt}
              badge={<SkewTag tone="line">{x.status === "used" ? "Entrée enregistrée" : "Terminé"}</SkewTag>}
              title={x.event.title}
              detail={sortiesLabels.publicTicketLine(x.name)}
              onPressTitle={() => router.push(`/e/${x.event.slug}`)}
            >
              {x.status === "used" && recapReady.has(x.event.id) ? (
                <SmallButton
                  icon="list"
                  onPress={() => router.push(`/recap/${x.event.id}`)}
                  testID="ticket-public-recap"
                >
                  {recapScreenTexts.seeRecap}
                </SmallButton>
              ) : null}
            </Ticket>
          ))}
          {countPast === 0 ? (
            <EmptyState title={sortiesLabels.emptyPastTitle} text={sortiesLabels.emptyPastText} />
          ) : null}
        </>
      ) : null}
    </TabScreen>
  );
}

/** Une candidature à venir : statut, créneau d'arrivée, et ce qu'on peut en faire. */
function ApplicationTicket({
  app,
  now,
  busy,
  primary,
  primaryOffer,
  highlight,
  onOpen,
  onJourJ,
  onVote,
  onWithdraw,
  onAccept,
  onDecline,
  onConfirmCrew,
  onDeclineCrew,
}: {
  app: MyApplication;
  now: Date;
  busy?: boolean;
  /** Seul bouton principal de l'écran : « Mon QR » de la première place retenue. */
  primary?: boolean;
  /** La place libérée à accepter porte le bouton principal de l'écran (elle expire). */
  primaryOffer?: boolean;
  /** Ticket crème (`.tk.me`). */
  highlight?: boolean;
  onOpen: () => void;
  onJourJ: () => void;
  /** Lot 50 : le vote du prix du public, pendant l'événement, pour qui est pointé. */
  onVote: () => void;
  onWithdraw: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onConfirmCrew: () => void;
  onDeclineCrew: () => void;
}) {
  const offered = app.status === "offered";
  const awaiting = app.status === "awaiting_member";
  const remaining = app.offerExpiresAt ? new Date(app.offerExpiresAt).getTime() - now.getTime() : 0;
  const organizer = app.organizer?.name ?? sortiesLabels.theTeam;
  const detail: string[] = [];
  if (app.status === "accepted") {
    if (app.zone) detail.push(`Zone ${app.zone.code}`);
    const arrival = arrivalPhrase(app.arrival);
    if (arrival) detail.push(arrival);
    if (app.vehicle) detail.push(app.vehicle.label);
  } else {
    if (app.vehicle) detail.push(app.vehicle.label);
    if (app.crew) detail.push(`${crewLabels.crew} « ${app.crew.name} »`);
  }
  if (app.status === "pending") {
    detail.unshift(sortiesLabels.pendingLine(organizer));
  }
  if (app.status === "waitlisted") detail.unshift(waitlistPhrase);
  if (awaiting && app.crew?.confirmBefore) {
    detail.push(crewLabels.confirmBefore(formatShortDate(app.crew.confirmBefore)).toLowerCase());
  }
  if (app.status === "refused") {
    const reasons = (app.refusalReasons ?? []).map((r) => refusalReasonLabels[r]).join(", ");
    if (reasons) detail.push(`Motif : ${reasons.toLowerCase()}`);
  }
  if (app.checkedInAt) detail.push(sortiesLabels.enteredAt(formatDayHour(app.checkedInAt)));
  const notes: string[] = [];
  if (app.status === "accepted" && !app.checkedInAt) {
    notes.push(sortiesLabels.withdrawBefore(formatShortDate(app.withdrawDeadline)));
  }
  if (app.refusalNote) notes.push(`« ${app.refusalNote} »`);
  if (offered) notes.push(sortiesLabels.offerNote);
  if (awaiting && app.crew) notes.push(crewLabels.confirmBody(app.crew.leaderPseudo, null));
  const voting = app.status === "accepted" && Boolean(app.checkedInAt) && now < new Date(app.event.endsAt);
  const canWithdraw = app.status === "pending" || app.status === "waitlisted" || app.status === "accepted";
  const lead = offered
    ? sortiesLabels.offerLead(formatDuration(remaining))
    : app.status === "accepted"
      ? dayCountdown(app.event.startsAt, now)
      : undefined;
  return (
    <Ticket
      testID="ticket-application"
      date={app.day?.startsAt ?? app.event.startsAt}
      badge={<ApplicationTag app={app} />}
      highlight={highlight}
      lead={lead}
      title={app.event.title}
      detail={detail.length ? upperFirst(detail.join(" · ")) : undefined}
      notes={notes}
      onPressTitle={onOpen}
    >
      {awaiting ? (
        <>
          <SmallButton icon="check" disabled={busy} onPress={onConfirmCrew} testID="crew-confirm-open">
            {crewLabels.confirmVenue}
          </SmallButton>
          <SmallButton kind="g" icon="close" disabled={busy} onPress={onDeclineCrew}>
            {crewLabels.notComing}
          </SmallButton>
        </>
      ) : null}
      {offered ? (
        <>
          <SmallButton kind={primaryOffer ? "p" : "s"} icon="check" disabled={busy} onPress={onAccept}>
            J'accepte la place
          </SmallButton>
          <SmallButton kind="g" icon="close" disabled={busy} onPress={onDecline}>
            Laisser
          </SmallButton>
        </>
      ) : null}
      {app.status === "accepted" && !app.checkedInAt ? (
        <SmallButton kind={primary ? "p" : "s"} icon="qr" onPress={onJourJ} testID="ticket-qr">
          {sortiesLabels.myQr}
        </SmallButton>
      ) : null}
      {voting ? (
        <SmallButton icon="badge" onPress={onVote} testID="ticket-vote">
          {voteScreenTexts.open}
        </SmallButton>
      ) : null}
      {canWithdraw && !app.checkedInAt ? (
        <SmallButton kind="g" icon="close" disabled={busy} onPress={onWithdraw} testID="ticket-withdraw">
          {sortiesLabels.withdraw}
        </SmallButton>
      ) : null}
    </Ticket>
  );
}

/** Un billet du public : « Mon billet », et le rendre s'il est gratuit. */
function TicketOfPublic({
  ticket,
  now,
  primary,
  onOpen,
  onShow,
  onGiveBack,
  onVote,
}: {
  ticket: MyTicket;
  now: Date;
  primary: boolean;
  onOpen: () => void;
  onShow: () => void;
  onGiveBack: () => void;
  /** Lot 50 : le vote du prix du public, pendant l'événement, pour un billet contrôlé à l'entrée. */
  onVote: () => void;
}) {
  const voting = ticket.status === "used" && now < new Date(ticket.event.endsAt);
  const detail = [
    ticket.name,
    ticket.priceCents == null ? "gratuit" : formatPrice(ticket.priceCents),
    ticket.event.city,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Ticket
      testID="ticket-public"
      date={ticket.event.startsAt}
      badge={
        <SkewTag tone={ticket.status === "used" ? "line" : "acc"}>
          {ticket.status === "used" ? "Entrée enregistrée" : "Billet"}
        </SkewTag>
      }
      highlight={primary}
      lead={dayCountdown(ticket.event.startsAt, now)}
      title={ticket.event.title}
      detail={upperFirst(detail)}
      onPressTitle={onOpen}
    >
      <SmallButton kind={primary ? "p" : "s"} icon="qr" onPress={onShow} testID="my-tickets">
        {sortiesLabels.myTicket}
      </SmallButton>
      {voting ? (
        <SmallButton icon="badge" onPress={onVote} testID="ticket-vote">
          {voteScreenTexts.open}
        </SmallButton>
      ) : null}
      {ticket.priceCents == null && ticket.status === "valid" ? (
        <SmallButton kind="g" icon="undo" onPress={onGiveBack} testID="ticket-give-back">
          {ticketAppLabels.giveBack}
        </SmallButton>
      ) : null}
    </Ticket>
  );
}

/** Une mission staff : le rôle, « Je serai là », l'entrée du mode staff (veille → J+1). */
function StaffTicket({
  item,
  unsent,
  now,
  onVote,
  onOpen,
  onChanged,
}: {
  item: MyStaffEvent;
  unsent: number;
  now: Date;
  /** Lot 50 : le staff présent peut voter pendant l'événement (l'API tranche). */
  onVote: () => void;
  onOpen: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const present = item.presence === "present";
  // Lot 59c : après la fin, plus de « Je serai là » ; le mode staff reste ouvert jusqu'à J+1 (`staffModeClosesAt`).
  const actions = staffMissionActions(item, now.getTime());
  const roles = item.roles.map((r) => staffRoleLabels[r]).join(" · ");
  const notes = [sortiesLabels.staffRoleGiven(item.structure.name)];
  if (!item.staffModeOpen) notes.push(sortiesLabels.staffModeOpensEve(formatDayHour(item.staffModeOpensAt)));
  if (unsent > 0) notes.push(sortiesLabels.staffUnsent(unsent));
  if (failed) notes.push(failed);
  return (
    <Ticket
      testID="ticket-staff"
      date={item.event.startsAt}
      badge={<SkewTag>{roles ? `Staff · ${roles}` : "Staff"}</SkewTag>}
      staff
      lead={staffPresenceLabels[item.presence]}
      title={item.event.title}
      detail={`${formatDayHour(item.event.startsAt)} · ${item.structure.name}`}
      notes={notes}
    >
      {actions.presence ? (
        <SmallButton
          kind={present ? "s" : "k"}
          icon={present ? "close" : "check"}
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            setFailed(null);
            try {
              await api.setPresence(item.event.id, !present);
              onChanged();
            } catch (e) {
              // Hors ligne : la présence reste comme avant, et on le dit.
              setFailed(`Présence non enregistrée : ${errorMessage(e)}`);
            } finally {
              setBusy(false);
            }
          }}
        >
          {present ? "Pas là" : sortiesLabels.willBeThere}
        </SmallButton>
      ) : null}
      {item.staffModeOpen && actions.staffMode ? (
        <SmallButton icon="qr" onPress={onOpen}>
          Mode staff
        </SmallButton>
      ) : null}
      {present && now >= new Date(item.event.startsAt) && now < new Date(item.event.endsAt) ? (
        <SmallButton icon="badge" onPress={onVote} testID="staff-vote">
          {voteScreenTexts.open}
        </SmallButton>
      ) : null}
    </Ticket>
  );
}

/** Une sortie passée : pointage, points, avis, malus, prix du public. */
function PastTicket({
  app,
  rank,
  recapReady,
  onRecap,
  onContest,
  onReview,
  onOpen,
}: {
  app: MyApplication;
  rank: { rank: number; of: number } | null;
  recapReady: boolean;
  onRecap: () => void;
  onContest: () => void;
  onReview: () => void;
  onOpen: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  let result: string;
  let badge: "onsite" | "cancelled" | null = null;
  // Le résultat en étiquette (artefact : « Pointé · +40 pts »).
  if (app.event.status === "cancelled") {
    result = "Événement annulé";
    badge = "cancelled";
  } else if (app.checkedInAt) {
    result = app.points !== null ? `Pointé · ${signed(app.points)} pts` : "Pointé";
    badge = "onsite";
  } else if (app.pointsPending) {
    result = POINTS_PENDING_LABEL;
  } else if (app.withdrawnAfterLock || app.malus) {
    result = app.points !== null ? `Absent · ${signed(app.points)} pts` : "Absent";
  } else {
    result = "Terminé";
  }
  const contest = app.malus;
  const notes: string[] = [];
  if (app.review?.canReview) {
    notes.push(sortiesLabels.reviewUntil(formatShortDate(app.review.deadline)));
  }
  if (rank) notes.push(sortiesLabels.audienceRank(rank.rank, rank.of));
  return (
    <Ticket
      testID="ticket-past"
      dim
      date={app.event.startsAt}
      badge={<SkewTag tone={badge === "cancelled" ? "win" : "line"}>{result}</SkewTag>}
      title={app.event.title}
      notes={notes}
      onPressTitle={onOpen}
    >
      {contest?.contestStatus ? (
        <View style={styles.chipLine}>
          <SkewTag tone="line">{contestStatusLabels[contest.contestStatus as ContestStatus] ?? "Contesté"}</SkewTag>
        </View>
      ) : contest?.canContest ? (
        <SmallButton icon="chat" onPress={onContest}>
          Contester le malus
        </SmallButton>
      ) : null}
      {app.review?.given ? (
        <View style={styles.chipLine}>
          <SkewTag tone="line">Avis donné</SkewTag>
          <Text variant="bodyStrong" color={c.accentText} accessibilityLabel={starsLabel(app.review.given.rating)}>
            {"★".repeat(app.review.given.rating)}
          </Text>
        </View>
      ) : app.review?.canReview ? (
        <SmallButton icon="chat" onPress={onReview}>
          Laisser un avis
        </SmallButton>
      ) : null}
      {app.review?.given?.reply ? (
        <Text variant="meta" color={c.plateMuted} style={styles.reply}>
          Réponse de l'équipe organisatrice : {app.review.given.reply}
        </Text>
      ) : null}
      {recapReady && app.checkedInAt ? (
        <SmallButton icon="list" onPress={onRecap} testID="ticket-recap">
          {recapScreenTexts.seeRecap}
        </SmallButton>
      ) : null}
    </Ticket>
  );
}

const styles = StyleSheet.create({
  chipLine: { flexDirection: "row", alignItems: "center", gap: space2 },
  reply: { textTransform: "none" },
  help: { textAlign: "center" },
});
