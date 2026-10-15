// Accès : ta place aux événements. À venir (une carte par candidature avec son statut, place libérée à accepter,
// désistement), Où je suis staff, Passés (carnet de route : pointage en attente, points, contestation d'un malus).
import {
  contestStatusLabels,
  type ContestStatus,
  type MyApplication,
  type MyStaffEvent,
  POINTS_PENDING_LABEL,
  staffPresenceLabels,
} from "@orasso/shared";
import { Button, Chip, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { ContestSheet } from "@/features/ContestSheet";
import { WithdrawSheet } from "@/features/WithdrawSheet";
import { useApplications } from "@/lib/applications";
import { api } from "@/lib/endpoints";
import { formatDayHour, formatShortDate } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { AccessCard } from "@/ui/AccessCard";
import { Notice } from "@/ui/Notice";
import { SectionTitle, TabScreen } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

export default function Acces() {
  const { t } = useTheme();
  const router = useRouter();
  const now = useNow();
  const { upcoming, past, loading, offline, reload } = useApplications();
  const staff = useApi(() => api.staffEvents(), []);
  const [withdrawing, setWithdrawing] = useState<MyApplication | null>(null);
  const [contesting, setContesting] = useState<{ applicationId: string; title: string } | null>(null);
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
        await Promise.all([reload(), staff.reload()]);
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
        </>
      }
    >
      {offline ? <Notice>Hors ligne : voici ce que ton téléphone a gardé. Tes QR du jour J restent disponibles.</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

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
          />
        ))
      ) : loading ? (
        <Text variant="body" color={t.color.inkMuted}>
          Chargement…
        </Text>
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
            <StaffCard key={s.event.id} item={s} onChanged={() => void staff.reload()} />
          ))}
        </>
      ) : null}

      <SectionTitle>Passés · carnet de route</SectionTitle>
      {history.length > 0 ? (
        <Plate style={styles.log}>
          {history.map((app, i) => (
            <LogLine
              key={app.id}
              app={app}
              last={i === history.length - 1}
              onContest={() => setContesting({ applicationId: app.id, title: app.event.title })}
            />
          ))}
        </Plate>
      ) : (
        <Text variant="body" color={t.color.inkMuted}>
          Ton carnet de route se remplira après ton premier événement : présence, points, avis.
        </Text>
      )}
    </TabScreen>
  );
}

/** Une ligne du carnet de route. */
function LogLine({ app, last, onContest }: { app: MyApplication; last: boolean; onContest: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  let result: string;
  let resultColor = c.plateInk;
  if (app.event.status === "cancelled") result = "événement annulé";
  else if (app.checkedInAt) result = app.points !== null ? `présent · ${signed(app.points)} pts` : "présent";
  else if (app.pointsPending) {
    result = POINTS_PENDING_LABEL.toLowerCase();
    resultColor = c.accentText;
  } else if (app.withdrawnAfterLock || app.malus) {
    result = app.points !== null ? `absent · ${signed(app.points)} pts` : "absent";
    resultColor = c.winText;
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
      </View>
      {contest?.contestStatus ? (
        <Chip surface="plate">{contestStatusLabels[contest.contestStatus as ContestStatus] ?? "Contesté"}</Chip>
      ) : contest?.canContest ? (
        <Button variant="plate" icon="chat" onPress={onContest}>
          Contester
        </Button>
      ) : null}
    </View>
  );
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`.replace("-", "−"));

/** « Où je suis staff » : l'événement, mon rôle et « je suis là / pas là ». Le mode staff arrive avec le lot 10. */
function StaffCard({ item, onChanged }: { item: MyStaffEvent; onChanged: () => void }) {
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
    </Plate>
  );
}

const styles = StyleSheet.create({
  empty: { gap: space3 },
  log: { paddingVertical: 4 },
  line: { flexDirection: "row", alignItems: "center", gap: space2, paddingVertical: space3 },
  lineDate: { width: 52 },
  lineBody: { flex: 1, gap: space1 },
  staff: { gap: space2, padding: space3 },
});
