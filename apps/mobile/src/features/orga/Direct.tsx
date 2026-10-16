// Casquette Organisateur, Direct (lot 22, docs/02) : l'événement du jour (sinon le prochain) en un coup d'œil : arrivés
// et attendus par catégorie, staff et prestataires, alertes en cours (avec la position), main courante, rapport des
// scans. Compteurs en direct par le canal `event:{id}:live` (preuve de la double authentification de la session), et
// rechargement toutes les 60 s au cas où le canal se coupe.
import { Button, Chip, ChipRow, Counters, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type LiveCounters, orgaLabels } from "@orasso/shared";
import { useIsFocused, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { api, type FieldIncident } from "@/lib/api";
import { formatDayHour, formatHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import {
  applyAlertEvent,
  type CurrentEvent,
  categoryRows,
  mapUrl,
  missingVehicles,
  openAlerts,
  pickCurrentEvent,
  scanSummary,
} from "@/lib/orga";
import { useChannel } from "@/lib/realtime";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle, TabScreen } from "@/ui/Screens";
import { OrgaFailure, useOrga } from "./OrgaGate";

const { space1, space2, space3 } = tokens.spacing;

const phaseLabels = {
  live: orgaLabels.phaseLive,
  today: orgaLabels.phaseToday,
  next: orgaLabels.phaseNext,
} as const;

export function DirectScreen() {
  const { structureId, structureName } = useOrga();
  const at = useNow(60_000);
  const events = useApi(() => api.structureEvents(structureId), [structureId], {
    cacheKey: `orga-events-${structureId}`,
    refreshMs: 60_000,
  });
  const current = useMemo(() => pickCurrentEvent(events.data ?? [], at), [events.data, at]);
  if (!current) {
    return (
      <TabScreen title={orgaLabels.directTitle} facts={structureName} onRefresh={events.reload}>
        <OrgaFailure error={events.error} />
        {events.error ? null : <Muted variant="body">{events.loading ? "Chargement…" : orgaLabels.directEmpty}</Muted>}
      </TabScreen>
    );
  }
  // Une instance par événement : changer d'événement repart de zéro (aucun chiffre de l'ancien ne reste affiché).
  return (
    <DirectEvent key={current.event.id} current={current} structureName={structureName} reloadEvents={events.reload} />
  );
}

function DirectEvent({
  current,
  structureName,
  reloadEvents,
}: {
  current: CurrentEvent;
  structureName: string;
  reloadEvents: () => Promise<unknown>;
}) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const focused = useIsFocused();
  const eventId = current.event.id;
  const field = current.phase !== "next";
  const live = useApi(() => api.liveCounters(eventId), [eventId], { refreshMs: 60_000 });
  const alerts = useApi(() => api.eventAlerts(eventId), [eventId], { enabled: field, refreshMs: 60_000 });
  const incidents = useApi(() => api.eventIncidents(eventId), [eventId], { enabled: field, refreshMs: 60_000 });
  const scans = useApi(() => api.scanReport(eventId), [eventId], { enabled: field, refreshMs: 60_000 });
  const [incident, setIncident] = useState<FieldIncident | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (scanTimer.current) clearTimeout(scanTimer.current);
    },
    [],
  );

  // Canal en direct, seulement tant que l'onglet est affiché : le changement de casquette ou d'onglet désabonne.
  useChannel(focused ? `event:${eventId}:live` : null, (event) => {
    if (event.type === "live") {
      live.setData(event.payload as LiveCounters);
      // Un compteur bouge : le rapport des scans suit (au plus une fois toutes les 5 s).
      if (field && !scanTimer.current) {
        scanTimer.current = setTimeout(() => {
          scanTimer.current = null;
          void scans.reload();
        }, 5_000);
      }
    } else if (event.type === "alert" || event.type === "alert.resolved") {
      alerts.setData(applyAlertEvent(alerts.data ?? [], event.type, event.payload, new Date()));
    } else if (event.type === "incident") {
      void incidents.reload();
    }
  });

  const reloadAll = async () => {
    await Promise.all([reloadEvents(), live.reload(), alerts.reload(), incidents.reload(), scans.reload()]);
  };

  async function resolve(alertId: string) {
    setBusy(alertId);
    setError(null);
    try {
      await api.resolveAlert(eventId, alertId);
      await Promise.all([alerts.reload(), live.reload()]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const l = live.data;
  const cats = l ? categoryRows(l) : [];
  const open = openAlerts(alerts.data ?? []);
  const summary = scans.data ? scanSummary(scans.data) : null;
  const firstError = live.error ?? firstOf(alerts.error, incidents.error, scans.error);

  return (
    <TabScreen
      title={orgaLabels.directTitle}
      facts={structureName}
      onRefresh={reloadAll}
      overlays={
        <AppSheet visible={incident !== null} onClose={() => setIncident(null)} accessibilityLabel="Main courante">
          {incident ? (
            <>
              <Text variant="title" color={c.ink}>
                {orgaLabels.directIncidents}
              </Text>
              <Muted variant="label">
                {formatHour(incident.occurredAt)}
                {incident.location ? ` · ${incident.location}` : ""}
                {incident.reporter ? ` · ${incident.reporter}` : ""}
              </Muted>
              <Text variant="body" color={c.ink}>
                {incident.description}
              </Text>
              {incident.lat !== null && incident.lng !== null ? (
                <Button
                  variant="plate"
                  icon="place"
                  onPress={() => void Linking.openURL(mapUrl(incident.lat as number, incident.lng as number))}
                  fullWidth
                >
                  {orgaLabels.directAlertWhere}
                </Button>
              ) : null}
              <Button variant="plate" icon="close" onPress={() => setIncident(null)} fullWidth>
                Fermer
              </Button>
            </>
          ) : null}
        </AppSheet>
      }
    >
      <OrgaFailure error={firstError} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {live.offline ? <Notice>Hors ligne : derniers chiffres connus.</Notice> : null}

      <Plate style={styles.block} testID="orga-direct-event">
        <ChipRow>
          <Chip surface="plate" variant="accent">
            {phaseLabels[current.phase]}
          </Chip>
        </ChipRow>
        <Text variant="posterM" color={c.plateInk}>
          {current.event.title}
        </Text>
        <Text variant="body" color={c.plateMuted}>
          {formatDayHour(current.event.startsAt)}
          {current.event.city ? ` · ${current.event.city}` : ""}
        </Text>
      </Plate>

      {l ? (
        <>
          <Counters
            items={[
              { value: l.arrived, label: orgaLabels.directArrived },
              { value: missingVehicles(l), label: orgaLabels.directExpected },
              { value: l.alertsOpen, label: orgaLabels.directAlerts },
            ]}
            active={0}
          />
          <Counters
            items={[
              { value: `${l.staffPresent}/${l.staffExpected}`, label: orgaLabels.directStaff },
              ...(l.providers.expected > 0
                ? [{ value: `${l.providers.arrived}/${l.providers.expected}`, label: orgaLabels.directProviders }]
                : []),
            ]}
          />
        </>
      ) : (
        <Muted variant="body">{live.loading ? "Chargement…" : null}</Muted>
      )}

      {cats.length > 0 ? (
        <>
          <SectionTitle>{orgaLabels.directByCategory}</SectionTitle>
          <Plate style={styles.block} testID="orga-direct-categories">
            {cats.map((row) => (
              <View key={row.key} style={styles.line}>
                <Text variant="bodyStrong" color={c.plateInk} style={styles.grow}>
                  {row.label}
                </Text>
                <Text variant="bodyStrong" color={c.plateInk}>
                  {row.arrived} / {row.expected}
                </Text>
              </View>
            ))}
          </Plate>
        </>
      ) : null}

      {field ? (
        <>
          <SectionTitle>{orgaLabels.directAlertsTitle}</SectionTitle>
          {open.length === 0 ? (
            <Muted variant="body">{orgaLabels.directAlertsNone}</Muted>
          ) : (
            open.map((a) => (
              <Plate key={a.id} style={styles.block} testID="orga-direct-alert">
                <Text variant="label" color={c.plateMuted}>
                  {formatHour(a.createdAt)}
                  {a.pseudo ? ` · ${a.pseudo}` : ""}
                </Text>
                <Text variant="bodyStrong" color={c.plateInk}>
                  {a.message ?? "Alerte du staff"}
                </Text>
                {a.lat !== null && a.lng !== null ? (
                  <Button
                    variant="plate"
                    icon="place"
                    onPress={() => void Linking.openURL(mapUrl(a.lat as number, a.lng as number))}
                    fullWidth
                  >
                    {orgaLabels.directAlertWhere}
                  </Button>
                ) : null}
                <Button
                  variant="plate"
                  icon="check"
                  loading={busy === a.id}
                  disabled={busy !== null}
                  onPress={() => void resolve(a.id)}
                  fullWidth
                >
                  {orgaLabels.directAlertResolve}
                </Button>
              </Plate>
            ))
          )}

          <SectionTitle>{orgaLabels.directIncidents}</SectionTitle>
          {(incidents.data ?? []).length === 0 ? (
            <Muted variant="body">{orgaLabels.directIncidentsNone}</Muted>
          ) : (
            <Plate style={styles.block} testID="orga-direct-incidents">
              {(incidents.data ?? []).map((i) => (
                <Pressable
                  key={i.id}
                  onPress={() => setIncident(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatHour(i.occurredAt)}, ${i.description}`}
                  style={[styles.incident, { borderTopColor: c.plateLine }]}
                >
                  <Text variant="meta" color={c.plateMuted}>
                    {formatHour(i.occurredAt)}
                    {i.location ? ` · ${i.location}` : ""}
                  </Text>
                  <Text variant="body" color={c.plateInk} numberOfLines={2}>
                    {i.description}
                  </Text>
                </Pressable>
              ))}
            </Plate>
          )}

          <SectionTitle>{orgaLabels.directScans}</SectionTitle>
          {!summary || summary.scans === 0 ? (
            <Muted variant="body">{orgaLabels.directScansNone}</Muted>
          ) : (
            <Plate style={styles.block} testID="orga-direct-scans">
              <Counters
                items={[
                  { value: summary.scans, label: "Scans" },
                  { value: summary.duplicates, label: "Doublons" },
                  { value: summary.rejected, label: "Refusés" },
                ]}
              />
              {(scans.data?.byDevice ?? [])
                .filter((d) => d.scans > 0)
                .map((d) => (
                  <View key={d.deviceId ?? "none"} style={styles.line}>
                    <Text variant="body" color={c.plateInk} style={styles.grow}>
                      {d.staffPseudo ?? d.deviceName ?? "Appareil"}
                    </Text>
                    <Text variant="body" color={c.plateMuted}>
                      {orgaLabels.directScansTotal(d.scans)}
                      {d.duplicates > 0 ? ` · ${orgaLabels.directScansDuplicates(d.duplicates)}` : ""}
                    </Text>
                  </View>
                ))}
            </Plate>
          )}
        </>
      ) : null}

      <View style={styles.buttons}>
        {field ? (
          <Button
            variant="primary"
            icon="staff"
            next
            onPress={() => router.push(`/staff/${eventId}`)}
            fullWidth
            testID="orga-direct-staff-mode"
          >
            {orgaLabels.directStaffMode}
          </Button>
        ) : null}
        <Button
          variant={field ? "plate" : "primary"}
          icon="calendar"
          next={!field}
          onPress={() => router.push(`/evenement/${eventId}`)}
          fullWidth
          testID="orga-direct-open"
        >
          {orgaLabels.directOpenEvent}
        </Button>
      </View>
      <Muted variant="meta">{orgaLabels.directLiveHint}</Muted>
    </TabScreen>
  );
}

/** La première erreur des chargements secondaires (alertes, main courante, scans). */
function firstOf(...errors: (unknown | null)[]): unknown | null {
  return errors.find((e) => e !== null && e !== undefined) ?? null;
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  line: { flexDirection: "row", alignItems: "baseline", gap: space2 },
  grow: { flex: 1 },
  incident: { gap: space1, paddingTop: space2, marginTop: space1, borderTopWidth: 1 },
  buttons: { gap: space2, marginTop: space2 },
});
