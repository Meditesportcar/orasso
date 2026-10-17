// Accès : ta place aux événements. À venir (une carte par candidature avec son statut, place libérée à accepter,
// désistement), Où je suis staff, Passés (carnet de route : pointage en attente, points, contestation d'un malus).

import { Button, Chip, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  afterEventLabels,
  type ContestStatus,
  contestStatusLabels,
  invitationLabels,
  type MyApplication,
  type MyStaffEvent,
  POINTS_PENDING_LABEL,
  type ReceivedInvitation,
  staffPresenceLabels,
  staffRequestLabels,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ContestSheet } from "@/features/ContestSheet";
import { CrewConfirmSheet } from "@/features/CrewConfirmSheet";
import { InvitationSheet } from "@/features/invitations/InvitationSheet";
import { InvitationCard } from "@/features/invitations/ReceivedInvitations";
import { ReviewSheet, type ReviewTarget } from "@/features/ReviewSheet";
import { WithdrawSheet } from "@/features/WithdrawSheet";
import { api } from "@/lib/api";
import { useApplications } from "@/lib/applications";
import { formatDayHour, formatShortDate } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";
import { useStaffActions } from "@/lib/staff/useStaff";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { AccessCard } from "@/ui/AccessCard";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { plateText } from "@/ui/plateText";
import { SectionTitle, TabScreen } from "@/ui/Screens";

const { space2, space3 } = tokens.spacing;

export default function Acces() {
  const { t } = useTheme();
  const router = useRouter();
  const now = useNow();
  const { upcoming, past, loading, offline, reload } = useApplications();
  const staff = useApi(() => api.staffEvents(), [], { cacheKey: "staff-events" });
  // Invitations nominatives reçues (lot 25, docs/02 « Accès »).
  const invitations = useApi(() => api.myEventInvitations(), []);
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

  const firstAccepted = upcoming?.find((a) => a.status === "accepted")?.id;
  const history = (past ?? []).filter((a) => a.status === "accepted" || a.withdrawnAfterLock);

  return (
    <TabScreen
      title="Accès"
      onRefresh={async () => {
        await Promise.all([reload(), staff.reload(), invitations.reload()]);
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
        </>
      }
    >
      {offline ? (
        <Notice>Hors ligne : voici ce que ton téléphone a gardé. Tes QR du jour J restent disponibles.</Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {answered ? <Notice>{answered}</Notice> : null}
      {avisNotice ? <Notice>{avisNotice}</Notice> : null}

      {invitations.data && invitations.data.length > 0 ? (
        <>
          <SectionTitle>{invitationLabels.received}</SectionTitle>
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

      <SectionTitle>À venir</SectionTitle>
      {upcoming && upcoming.length > 0 ? (
        upcoming.map((app) => (
          <AccessCard
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
        ))
      ) : loading ? (
        <Muted variant="body">Chargement…</Muted>
      ) : (
        <Plate kind="note" style={styles.empty}>
          <Text variant="body" color={t.color.plateInk}>
            Aucune candidature en cours. Trouve un événement et candidate avec l'un de tes véhicules : ta carte d'accès
            apparaîtra ici.
          </Text>
          <Button variant="plate" icon="explore" onPress={() => router.navigate("/explorer")} fullWidth>
            Explorer les événements
          </Button>
        </Plate>
      )}

      {staff.data && staff.data.length > 0 ? (
        <>
          <SectionTitle>Où je suis staff</SectionTitle>
          {staff.data.map((s) => (
            <StaffCard
              key={s.event.id}
              item={s}
              unsent={unsentBy.get(s.event.id)?.count ?? 0}
              onOpen={() => router.push(`/staff/${s.event.id}`)}
              onChanged={() => void staff.reload()}
            />
          ))}
        </>
      ) : null}
      {(me?.memberships ?? [])
        .filter((m) => m.role === "staff" && m.status === "requested")
        .map((m) => (
          <Notice key={m.structureId}>
            {staffRequestLabels.sent} · {m.structureName} : tu seras prévenu quand l'organisateur aura répondu.
          </Notice>
        ))}
      {orphans.map(([eventId, u]) => (
        <Notice key={eventId}>
          {u.count} envoi{u.count > 1 ? "s" : ""} du staff à faire · {u.title || "événement terminé"} : ils partiront au
          retour du réseau.
        </Notice>
      ))}

      <SectionTitle>Passés · carnet de route</SectionTitle>
      {history.length > 0 ? (
        <Plate style={styles.log}>
          {history.map((app, i) => (
            <LogLine
              key={app.id}
              app={app}
              last={i === history.length - 1}
              onContest={() => setContesting({ applicationId: app.id, title: app.event.title })}
              onReview={() =>
                app.review &&
                setReviewing({ applicationId: app.id, title: app.event.title, deadline: app.review.deadline })
              }
            />
          ))}
        </Plate>
      ) : (
        <Muted variant="body">
          Ton carnet de route se remplira après ton premier événement : présence, points, avis.
        </Muted>
      )}
    </TabScreen>
  );
}

/** Une ligne du carnet de route. */
function LogLine({
  app,
  last,
  onContest,
  onReview,
}: {
  app: MyApplication;
  last: boolean;
  onContest: () => void;
  onReview: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  let result: string;
  let resultColor = c.plateInk;
  // Le carnet est une plaque graphite : couleurs de texte faites pour le graphite (`plateText`).
  if (app.event.status === "cancelled") result = "événement annulé";
  else if (app.checkedInAt) result = app.points !== null ? `présent · ${signed(app.points)} pts` : "présent";
  else if (app.pointsPending) {
    result = POINTS_PENDING_LABEL.toLowerCase();
    resultColor = plateText.accent;
  } else if (app.withdrawnAfterLock || app.malus) {
    result = app.points !== null ? `absent · ${signed(app.points)} pts` : "absent";
    resultColor = plateText.alert;
  } else result = "terminé";
  const contest = app.malus;
  return (
    <View style={[styles.line, !last && { borderBottomWidth: 1, borderBottomColor: c.plateLine }]}>
      <Text variant="meta" color={c.plateMuted} style={styles.lineDate}>
        {formatShortDate(app.event.startsAt)}
      </Text>
      <View style={styles.lineBody}>
        <Text variant="bodyStrong" color={c.plateInk}>
          {app.event.title}
        </Text>
        <Text variant="body" color={resultColor}>
          {result}
        </Text>
        {contest?.contestStatus ? (
          <View style={styles.contestChip}>
            <Chip surface="plate">{contestStatusLabels[contest.contestStatus as ContestStatus] ?? "Contesté"}</Chip>
          </View>
        ) : contest?.canContest ? (
          <Button variant="plate" icon="chat" onPress={onContest} fullWidth>
            Contester le malus
          </Button>
        ) : null}
        {app.review?.given ? (
          <View style={styles.review}>
            <View style={styles.reviewHead}>
              <Chip surface="plate">Avis donné</Chip>
              <Text variant="bodyStrong" color={c.accent} accessibilityLabel={starsLabel(app.review.given.rating)}>
                {"★".repeat(app.review.given.rating)}
              </Text>
            </View>
            {app.review.given.reply ? (
              <Text variant="meta" color={c.plateMuted}>
                Réponse de l'organisateur : {app.review.given.reply}
              </Text>
            ) : null}
          </View>
        ) : app.review?.canReview ? (
          <>
            <Text variant="meta" color={c.plateMuted}>
              Ton avis · jusqu'au {formatDayHour(app.review.deadline)} · affiché avec ton pseudo
            </Text>
            <Button variant="plate" icon="chat" onPress={onReview} fullWidth>
              Laisser un avis
            </Button>
          </>
        ) : null}
      </View>
    </View>
  );
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`.replace("-", "−"));
const starsLabel = (n: number) => `${n} étoile${n > 1 ? "s" : ""} sur 3`;

/** « Où je suis staff » : l'événement, mon rôle, « je suis là / pas là » et l'entrée du mode staff (veille → J+1). */
function StaffCard({
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
  const { t } = useTheme();
  const [busy, setBusy] = useState(false);
  const present = item.presence === "present";
  return (
    <Plate style={styles.staff}>
      <Text variant="label" color={t.color.plateMuted}>
        {formatDayHour(item.event.startsAt)} · {item.structure.name}
      </Text>
      <Text variant="posterM" color={t.color.plateInk}>
        {item.event.title}
      </Text>
      <Text variant="body" color={t.color.plateMuted}>
        {staffPresenceLabels[item.presence]}
      </Text>
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
        {present ? "Pas là" : "Je suis là"}
      </Button>
      {item.staffModeOpen ? (
        <Button variant="plate" icon="qr" onPress={onOpen} next fullWidth>
          Mode staff
        </Button>
      ) : (
        <Text variant="meta" color={t.color.plateMuted}>
          Mode staff à partir du {formatDayHour(item.staffModeOpensAt)} : synchronise la liste ce jour-là.
        </Text>
      )}
      {unsent > 0 ? (
        <Text variant="meta" color={t.color.plateInk}>
          {unsent} envoi{unsent > 1 ? "s" : ""} en attente : ils partiront au retour du réseau.
        </Text>
      ) : null}
    </Plate>
  );
}

const styles = StyleSheet.create({
  empty: { gap: space3 },
  log: { paddingVertical: 4 },
  line: { flexDirection: "row", alignItems: "flex-start", gap: space2, paddingVertical: space3 },
  lineDate: { width: 52 },
  lineBody: { flex: 1, gap: space2 },
  contestChip: { alignItems: "flex-start" },
  review: { gap: space2 },
  reviewHead: { flexDirection: "row", alignItems: "center", gap: space2 },
  staff: { gap: space2, padding: space3 },
});
