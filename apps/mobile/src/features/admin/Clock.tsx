// Casquette Administration, horloge simulée (lot 35d, lot 34a côté API, développement seulement). Avance le temps d'Orasso
// pour voir tout de suite verrouillage, rappels, points et malus, bilan. L'écran n'existe que si l'API envoie l'en-tête
// de l'horloge (`DEV_CLOCK`) : sans lui, la rubrique n'est pas proposée et l'écran dit qu'il est indisponible.
import { Button, Chip, Plate, SelectField, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  adminAppLabels as A,
  type ClockAdvanceResult,
  type ClockMilestone,
  clockMilestones,
  devClockMilestoneLabels,
  formatClockOffset,
  devClockLabels as L,
} from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { parseDateTimeFr } from "@/lib/adminModel";
import { api } from "@/lib/api";
import type { ClockAdvanceBody } from "@/lib/api/admin";
import { useClockAvailable } from "@/lib/clock";
import { formatDayHour } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle } from "@/ui/Screens";
import { AdminFailure, AdminGate, AdminPage, EmptyOrLoading, useGesture } from "./kit";

const { space2, space3 } = tokens.spacing;

function ClockBody() {
  const { t } = useTheme();
  const available = useClockAvailable();
  const status = useApi(() => api.clockStatus(), [], { enabled: available });
  const events = useApi(() => api.clockEvents(), [], { enabled: available });
  const gesture = useGesture();
  const [pending, setPending] = useState<{ body: ClockAdvanceBody; label: string } | null>(null);
  const [result, setResult] = useState<ClockAdvanceResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [toIssue, setToIssue] = useState<string | undefined>();
  const [eventId, setEventId] = useState("");
  const [milestone, setMilestone] = useState<ClockMilestone>("h-2");
  const [resetAsk, setResetAsk] = useState(false);

  const rows = events.data?.items ?? [];
  const chosenEvent = rows.find((e) => e.id === eventId) ?? rows[0];
  const nowMs = status.data ? Date.parse(status.data.now) : 0;
  const reached = (at: string) => Date.parse(at) <= nowMs;
  const target = chosenEvent?.milestones.find((m) => m.milestone === milestone);

  async function advance() {
    if (!pending) return;
    const out = { value: null as ClockAdvanceResult | null };
    const ok = await gesture.run(async () => {
      out.value = await api.clockAdvance(pending.body);
    });
    if (!ok) return;
    setPending(null);
    setResult(out.value);
    setNotice(null);
    await Promise.all([status.reload(), events.reload()]);
  }

  if (!available) {
    return (
      <AdminPage title={L.title}>
        <Notice>Cette API n'a pas d'horloge simulée.</Notice>
      </AdminPage>
    );
  }

  return (
    <AdminPage
      title={L.title}
      facts={L.intro}
      onRefresh={async () => {
        await Promise.all([status.reload(), events.reload()]);
      }}
      overlays={
        <>
          <ConfirmSheet
            visible={pending !== null}
            title={A.clockAdvanceConfirmTitle}
            body={`${pending?.label ?? ""} ${A.clockAdvanceConfirmBody}`}
            confirmLabel="Avancer"
            confirmIcon="next"
            busy={gesture.busy}
            error={gesture.error}
            onConfirm={() => void advance()}
            onClose={() => {
              setPending(null);
              gesture.setError(null);
            }}
          />
          <ConfirmSheet
            visible={resetAsk}
            title={L.reset}
            body={A.clockAdvanceConfirmBody}
            confirmLabel={L.reset}
            confirmIcon="undo"
            busy={gesture.busy}
            error={gesture.error}
            onConfirm={() =>
              void (async () => {
                if (await gesture.run(() => api.clockReset())) {
                  setResetAsk(false);
                  setResult(null);
                  setNotice(L.resetDone);
                  await Promise.all([status.reload(), events.reload()]);
                }
              })()
            }
            onClose={() => {
              setResetAsk(false);
              gesture.setError(null);
            }}
          />
        </>
      }
    >
      <AdminFailure error={status.error} />
      {!status.data ? <EmptyOrLoading loading={status.loading} empty={L.noEvent} /> : null}
      {notice ? <Notice>{notice}</Notice> : null}
      {gesture.error && pending === null && !resetAsk ? <Notice tone="error">{gesture.error}</Notice> : null}
      {status.data ? (
        <Plate style={styles.block} testID="clock-status">
          <Muted variant="label">{L.simulatedNow}</Muted>
          <Text variant="bodyStrong" color={t.color.plateInk} testID="clock-now">
            {formatDayHour(status.data.now)}
          </Text>
          <Muted variant="label">{L.realNow}</Muted>
          <Text variant="body" color={t.color.plateInk}>
            {formatDayHour(status.data.realNow)}
          </Text>
          <Muted variant="label">{L.offset}</Muted>
          <Text variant="bodyStrong" color={t.color.plateInk} testID="clock-offset">
            {formatClockOffset(status.data.offsetMs) || L.noOffset}
          </Text>
        </Plate>
      ) : null}
      {result ? (
        <Plate style={styles.block} testID="clock-advanced">
          <Text variant="bodyStrong" color={t.color.plateInk}>
            {L.advanced} {L.releasedJobs(result.releasedJobs)}
          </Text>
          <Muted variant="label">{L.sweepsTitle}</Muted>
          <View style={styles.chips}>
            {result.sweeps.map((s) => (
              <Chip key={s.name} surface="plate" variant={s.ok ? "default" : "accent"}>
                {`${s.name} · ${s.ok ? L.sweepsOk : L.sweepsFailed}`}
              </Chip>
            ))}
          </View>
        </Plate>
      ) : null}

      <SectionTitle>Avancer</SectionTitle>
      <Plate style={styles.block}>
        <Button
          variant="plate"
          icon="next"
          onPress={() => setPending({ body: { by: "1h" }, label: L.advance1h })}
          fullWidth
          testID="clock-1h"
        >
          {L.advance1h}
        </Button>
        <Button
          variant="plate"
          icon="next"
          onPress={() => setPending({ body: { by: "1d" }, label: L.advance1d })}
          fullWidth
          testID="clock-1d"
        >
          {L.advance1d}
        </Button>
        <TextField
          label={A.clockToField}
          value={to}
          onChangeText={(v) => {
            setTo(v);
            setToIssue(undefined);
          }}
          placeholder="25/12/2026 18:30"
          help={L.advanceToHint}
          error={toIssue}
          testID="clock-to"
        />
        <Button
          variant="plate"
          icon="calendar"
          onPress={() => {
            const iso = parseDateTimeFr(to);
            if (!iso) {
              setToIssue(A.clockToInvalid);
              return;
            }
            gesture.setError(null);
            setPending({ body: { to: iso }, label: `${L.advanceTo} ${to.trim()}.` });
          }}
          fullWidth
          testID="clock-to-go"
        >
          {L.advanceTo}
        </Button>
      </Plate>

      <SectionTitle>{L.event}</SectionTitle>
      <Plate style={styles.block}>
        {rows.length === 0 ? (
          <Notice>{L.noEvent}</Notice>
        ) : (
          <>
            <Muted variant="caption">{L.eventHint}</Muted>
            <SelectField
              label={L.event}
              value={chosenEvent?.id ?? ""}
              onValueChange={setEventId}
              options={rows.map((e) => ({ value: e.id, label: `${e.title} · ${formatDayHour(e.startsAt)}` }))}
            />
            <SelectField
              label={L.goTo}
              value={milestone}
              onValueChange={(v) => setMilestone(v as ClockMilestone)}
              options={clockMilestones.map((m) => ({ value: m, label: devClockMilestoneLabels[m] }))}
            />
            {chosenEvent?.milestones.map((m) => (
              <Text key={m.milestone} variant="caption" color={t.color.plateMuted}>
                {devClockMilestoneLabels[m.milestone]} · {formatDayHour(m.at)}
                {reached(m.at) ? ` · ${L.reached}` : ""}
              </Text>
            ))}
            <Button
              variant="plate"
              icon="next"
              disabled={!chosenEvent || !target || reached(target.at)}
              onPress={() => {
                if (!chosenEvent) return;
                gesture.setError(null);
                setPending({
                  body: { eventId: chosenEvent.id, milestone },
                  label: `${L.goTo} : ${devClockMilestoneLabels[milestone]} (${chosenEvent.title}).`,
                });
              }}
              fullWidth
              testID="clock-milestone-go"
            >
              {L.goTo}
            </Button>
          </>
        )}
      </Plate>

      <Button
        variant="plate"
        icon="undo"
        disabled={!status.data || status.data.offsetMs === 0}
        onPress={() => {
          gesture.setError(null);
          setResetAsk(true);
        }}
        fullWidth
        testID="clock-reset"
      >
        {L.reset}
      </Button>
    </AdminPage>
  );
}

export function ClockScreen() {
  return (
    <AdminGate title={L.title}>
      <ClockBody />
    </AdminGate>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
});
