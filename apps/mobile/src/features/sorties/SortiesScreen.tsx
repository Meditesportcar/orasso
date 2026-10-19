// Sorties (ex-Accès ; lot 40 : contenu déplacé tel quel, lot 43 : tickets, prototype `s-sorties`) : ta place aux
// événements, sous forme de tickets dont la souche porte la date. Trois segments : « À venir » (candidatures, billets du
// public, invitations reçues), « Staff » (missions de l'exposant : « Je serai là », mode staff), « Passées » (carnet de
// route : pointage, points, avis, malus). Les candidatures sont lues dans le cache du téléphone (lisibles hors ligne).

import { Button, Chip, EmptyState, Text, tokens, useTheme } from "@orasso/design-system/native";
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
  refusalReasonLabels,
  seasonYear,
  sortiesLabels,
  staffPresenceLabels,
  staffRequestLabels,
  staffRoleLabels,
  ticketAppLabels,
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
import { dayCountdown, formatDay, formatDayHour, formatDuration, formatShortDate } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { usePersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { useStaffActions } from "@/lib/staff/useStaff";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { ApplicationStatusTag, StatusTag } from "@/ui/StatusTag";
import {
  arrivalPhrase,
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

  const firstAccepted = upcoming?.find((a) => a.status === "accepted" && !a.checkedInAt)?.id;
  const history = (past ?? []).filter((a) => a.status === "accepted" || a.withdrawnAfterLock);
  const upcomingTickets = ticketsUpcoming(tickets.data ?? [], now);
  const pastTickets = ticketsPast(tickets.data ?? [], now);
  const staffItems = staffUpcoming(staff.data ?? [], now);
  const showStaff = persona.kind === "fan";
  const countUpcoming = (upcoming?.length ?? 0) + upcomingTickets.length;
  const countPast = history.length + pastTickets.length;
  const canWithdrawAny = (upcoming ?? []).some((a) => ["pending", "waitlisted", "accepted"].includes(a.status));

  // Rang au prix du public des sorties pointées récentes (calculé par le récap ; rien avant J+1 10 h).
  const [ranks, setRanks] = useState<Record<string, { rank: number; of: number } | null>>({});
  useEffect(() => {
    const recent = history.filter((a) => a.checkedInAt && !(a.event.id in ranks)).slice(0, 3);
    for (const a of recent) {
      void api.eventAudienceRank(a.event.id).then((r) => setRanks((prev) => ({ ...prev, [a.event.id]: r })));
    }
  }, [history, ranks]);

  return (
    <TabScreen
      title="Mes sorties"
      facts={`Saison ${seasonYear(now)}`}
      onRefresh={async () => {
        await Promise.all([reload(), staff.reload(), invitations.reload(), tickets.reload()]);
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

      <View style={styles.segments} testID="sorties-segments">
        <Chip selected={segment === "upcoming"} onPress={() => setSegment("upcoming")}>
          {`À venir · ${countUpcoming}`}
        </Chip>
        {showStaff ? (
          <Chip selected={segment === "staff"} onPress={() => setSegment("staff")}>
            {`Staff · ${staffItems.length}`}
          </Chip>
        ) : null}
        <Chip selected={segment === "past"} onPress={() => setSegment("past")}>
          {`Passées · ${countPast}`}
        </Chip>
      </View>

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

          {(upcoming ?? []).map((app) => (
            <ApplicationTicket
              key={app.id}
              app={app}
              now={now}
              busy={busyId === app.id}
              primary={app.id === firstAccepted}
              onOpen={() => router.push(`/e/${app.event.slug}`)}
              onJourJ={() => router.push(`/jour-j/${app.id}`)}
              onWithdraw={() => setWithdrawing(app)}
              onAccept={() => void run(app, () => api.acceptOffer(app.id))}
              onDecline={() => void run(app, () => api.declineOffer(app.id))}
              onConfirmCrew={() => setConfirmingCrew(app)}
              onDeclineCrew={() => void run(app, () => api.declineCrewVenue(app.id))}
            />
          ))}

          {upcomingTickets.map((x, i) => (
            <TicketOfPublic
              key={x.id}
              ticket={x}
              now={now}
              primary={!firstAccepted && i === 0}
              onOpen={() => router.push(`/e/${x.event.slug}`)}
              onShow={() => router.push("/billets")}
              onGiveBack={() => setGiving(x)}
            />
          ))}

          {countUpcoming === 0 && loading ? (
            <Muted variant="body">Chargement…</Muted>
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

          {canWithdrawAny ? <Muted variant="body">{sortiesLabels.withdrawHelp}</Muted> : null}
          {upcomingTickets.some((x) => x.priceCents == null) ? (
            <Muted variant="body">{sortiesLabels.giveBackHelp}</Muted>
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
              now={now}
              rank={ranks[app.event.id] ?? null}
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
              badge={<Chip surface="plate">{x.status === "used" ? "Entrée enregistrée" : "Terminé"}</Chip>}
              title={x.event.title}
              detail={sortiesLabels.publicTicketLine(x.name)}
              onPressTitle={() => router.push(`/e/${x.event.slug}`)}
            />
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
  onOpen,
  onJourJ,
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
  onOpen: () => void;
  onJourJ: () => void;
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
    detail.unshift(sortiesLabels.pendingLine(organizer, formatDay(app.withdrawDeadline).toLowerCase()));
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
      badge={<ApplicationStatusTag app={app} />}
      lead={lead}
      title={app.event.title}
      detail={detail.length ? upperFirst(detail.join(" · ")) : undefined}
      notes={notes}
      onPressTitle={onOpen}
    >
      {awaiting ? (
        <>
          <Button
            variant="plate"
            icon="check"
            disabled={busy}
            onPress={onConfirmCrew}
            fullWidth
            testID="crew-confirm-open"
          >
            {crewLabels.confirmVenue}
          </Button>
          <Button variant="plate" tone="dashed" icon="close" loading={busy} onPress={onDeclineCrew} fullWidth>
            {crewLabels.notComing}
          </Button>
        </>
      ) : null}
      {offered ? (
        <>
          <Button variant="primary" icon="check" loading={busy} onPress={onAccept} fullWidth>
            J'accepte la place
          </Button>
          <Button variant="plate" tone="dashed" icon="close" disabled={busy} onPress={onDecline} fullWidth>
            Laisser
          </Button>
        </>
      ) : null}
      {app.status === "accepted" && !app.checkedInAt ? (
        <Button variant={primary ? "primary" : "plate"} icon="qr" next onPress={onJourJ} fullWidth testID="ticket-qr">
          {sortiesLabels.myQr}
        </Button>
      ) : null}
      {canWithdraw && !app.checkedInAt ? (
        <Button variant="plate" tone="dashed" icon="close" disabled={busy} onPress={onWithdraw} fullWidth>
          {sortiesLabels.withdraw}
        </Button>
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
}: {
  ticket: MyTicket;
  now: Date;
  primary: boolean;
  onOpen: () => void;
  onShow: () => void;
  onGiveBack: () => void;
}) {
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
      badge={<Chip surface="plate">Billet</Chip>}
      lead={dayCountdown(ticket.event.startsAt, now)}
      title={ticket.event.title}
      detail={upperFirst(detail)}
      onPressTitle={onOpen}
    >
      <Button variant={primary ? "primary" : "plate"} icon="ticket" next onPress={onShow} fullWidth testID="my-tickets">
        {sortiesLabels.myTicket}
      </Button>
      {ticket.priceCents == null ? (
        <Button variant="plate" tone="dashed" icon="undo" onPress={onGiveBack} fullWidth testID="ticket-give-back">
          {ticketAppLabels.giveBack}
        </Button>
      ) : null}
    </Ticket>
  );
}

/** Une mission staff : le rôle, « Je serai là », l'entrée du mode staff (veille → J+1). */
function StaffTicket({
  item,
  unsent,
  onOpen,
  onChanged,
}: {
  item: MyStaffEvent;
  unsent: number;
  onOpen: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const present = item.presence === "present";
  const roles = item.roles.map((r) => staffRoleLabels[r]).join(" · ");
  const notes = [sortiesLabels.staffRoleGiven(item.structure.name)];
  if (!item.staffModeOpen) notes.push(sortiesLabels.staffModeOpensEve(formatDayHour(item.staffModeOpensAt)));
  if (unsent > 0) notes.push(sortiesLabels.staffUnsent(unsent));
  return (
    <Ticket
      testID="ticket-staff"
      date={item.event.startsAt}
      badge={<Chip surface="plate">{roles || "Staff"}</Chip>}
      lead={staffPresenceLabels[item.presence]}
      title={item.event.title}
      detail={`${formatDayHour(item.event.startsAt)} · ${item.structure.name}`}
      notes={notes}
    >
      <Button
        variant="plate"
        icon={present ? "close" : "check"}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await api.setPresence(item.event.id, !present);
            onChanged();
          } finally {
            setBusy(false);
          }
        }}
        fullWidth
      >
        {present ? "Pas là" : sortiesLabels.willBeThere}
      </Button>
      {item.staffModeOpen ? (
        <Button variant="plate" icon="qr" onPress={onOpen} next fullWidth>
          Mode staff
        </Button>
      ) : null}
    </Ticket>
  );
}

/** Une sortie passée : pointage, points, avis, malus, prix du public. */
function PastTicket({
  app,
  now,
  rank,
  onContest,
  onReview,
  onOpen,
}: {
  app: MyApplication;
  now: Date;
  rank: { rank: number; of: number } | null;
  onContest: () => void;
  onReview: () => void;
  onOpen: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  let result: string;
  let badge: "onsite" | "cancelled" | null = null;
  let chip: string | null = null;
  // Le carnet est une plaque graphite : couleurs de texte faites pour le graphite (`plateText`).
  if (app.event.status === "cancelled") {
    result = "Événement annulé";
    badge = "cancelled";
  } else if (app.checkedInAt) {
    result = app.points !== null ? `Pointé · ${signed(app.points)} pts` : "Pointé";
    badge = "onsite";
  } else if (app.pointsPending) {
    result = POINTS_PENDING_LABEL;
    chip = "Pointage en attente";
  } else if (app.withdrawnAfterLock || app.malus) {
    result = app.points !== null ? `Absent · ${signed(app.points)} pts` : "Absent";
    chip = "Absent";
  } else {
    result = "Terminé";
    chip = "Terminé";
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
      badge={badge ? <StatusTag status={badge} /> : <Chip surface="plate">{chip}</Chip>}
      title={app.event.title}
      detail={result}
      notes={notes}
      onPressTitle={onOpen}
    >
      {contest?.contestStatus ? (
        <View style={styles.chipLine}>
          <Chip surface="plate">{contestStatusLabels[contest.contestStatus as ContestStatus] ?? "Contesté"}</Chip>
        </View>
      ) : contest?.canContest ? (
        <Button variant="plate" icon="chat" onPress={onContest} fullWidth>
          Contester le malus
        </Button>
      ) : null}
      {app.review?.given ? (
        <View style={styles.chipLine}>
          <Chip surface="plate">Avis donné</Chip>
          <Text variant="bodyStrong" color={c.accent} accessibilityLabel={starsLabel(app.review.given.rating)}>
            {"★".repeat(app.review.given.rating)}
          </Text>
        </View>
      ) : app.review?.canReview ? (
        <Button variant="plate" icon="chat" onPress={onReview} fullWidth>
          Laisser un avis
        </Button>
      ) : null}
      {app.review?.given?.reply ? (
        <Text variant="meta" color={c.plateMuted} style={styles.reply}>
          Réponse de l'équipe organisatrice : {app.review.given.reply}
        </Text>
      ) : null}
      {/* lot 50 : « Voir le récap » (route recap/[id]) vient ici. */}
    </Ticket>
  );
}

const styles = StyleSheet.create({
  segments: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  chipLine: { flexDirection: "row", alignItems: "center", gap: space2 },
  reply: { textTransform: "none" },
});
