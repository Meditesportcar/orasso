// Mode staff, écran d'entrée (docs/02 « Mode staff (détail) », prototype DA v2 `s-staff`, lot 48) : synchro et liste
// en mémoire en tête, mon rôle donné par la structure et « Je suis là », grandes tuiles selon mes rôles (Scanner, Liste,
// Placement, Contrôle des billets), entrés par zone, et toujours en bas : Alerte, Main courante, Discussion. Tout
// s'affiche sans réseau depuis la liste du téléphone. Thème au choix de l'utilisateur (D25b), fond immobile.
// Lot C4a : mise en page de l'artefact (en-tête de flux sans grand titre, rôle sur carte crème, Scanner moutarde).

import { Button, Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  communicationLabels,
  staffHomeLabels as L,
  type MyStaffEvent,
  type StaffRole,
  staffRoleLabels,
  wallTime,
} from "@orasso/shared";
import { useNetworkState } from "expo-network";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AlertSheet } from "@/features/staff/AlertSheet";
import { recordAlert, recordIncident } from "@/features/staff/actions";
import { IncidentSheet } from "@/features/staff/IncidentSheet";
import { clock } from "@/features/staff/result";
import { StaffTile } from "@/features/staff/StaffTile";
import { api } from "@/lib/api";
import { now as clockNow } from "@/lib/clock";
import { formatDayHour } from "@/lib/format";
import { counters, serverReport, shopAccess, ticketDuplicates } from "@/lib/staff/model";
import { askLocationConsent, type LocationConsent, locationConsent } from "@/lib/staff/position";
import { flushNow, record, syncEvent, TRUST_MISSING } from "@/lib/staff/runtime";
import { useStaffActions, useStaffEvent } from "@/lib/staff/useStaff";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";

const { space2, space3 } = tokens.spacing;

const SCANNERS: StaffRole[] = ["scan", "control", "super_staff"];

/** « 8 h 12 » (heure de Paris), comme le prototype. */
function hourFr(iso: string): string {
  const w = wallTime(new Date(iso));
  return `${w.hour} h ${String(w.minute).padStart(2, "0")}`;
}

export default function StaffHome() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  const { userId, state, error } = useStaffEvent(id);
  const staffEvents = useApi(() => api.staffEvents(), [], { cacheKey: "staff-events" });
  const mine: MyStaffEvent | null = staffEvents.data?.find((s) => s.event.id === id) ?? null;
  // Les événements du staff sont chargés et celui-ci n'y est pas : c'est un organisateur (ou l'administration) qui l'ouvre.
  const organizerView = staffEvents.data !== null && mine === null;
  const actions = useStaffActions(userId, id);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [presence, setPresence] = useState<MyStaffEvent["presence"] | null>(null);
  const [sheet, setSheet] = useState<"alert" | "incident" | null>(null);
  // Position de l'alerte (lot 24) : demandée à l'ouverture du mode staff, après un texte qui dit à quoi elle sert.
  const [consent, setConsent] = useState<LocationConsent | null>(null);
  useEffect(() => {
    let alive = true;
    void locationConsent().then((c) => alive && setConsent(c));
    return () => {
      alive = false;
    };
  }, []);
  const autoSynced = useRef(false);
  // Fermé à J+1 : la liste est purgée du téléphone (openEvent), on ne la redemande pas.
  const closed = mine ? !mine.staffModeOpen && clockNow() >= new Date(mine.staffModeClosesAt) : false;

  /** `auto` : synchro d'ouverture, silencieuse sans réseau (la liste du téléphone suffit). */
  async function sync(full: boolean, auto = false) {
    if (!userId) return;
    setSyncing(true);
    const r = await syncEvent(id, userId, full);
    setSyncing(false);
    if (auto && !r.ok && r.offline) return;
    setSyncMessage(
      r.ok
        ? {
            text: `Liste synchronisée · ${r.count} entrée${r.count > 1 ? "s" : ""} reçue${r.count > 1 ? "s" : ""}`,
            error: false,
          }
        : { text: r.message, error: !r.offline },
    );
  }

  // À l'ouverture, avec du réseau : synchro (complète si le téléphone n'a rien, différentielle sinon) et envoi.
  // biome-ignore lint/correctness/useExhaustiveDependencies: une seule fois, dès que la liste locale est lue
  useEffect(() => {
    if (autoSynced.current || !userId || state === undefined || !online || closed) return;
    autoSynced.current = true;
    void sync(state === null, true);
    void flushNow(userId).catch(() => undefined);
  }, [userId, state, online, closed]);

  const pending = actions.filter((a) => !a.sentAt);
  const { duplicates, refused: refusedByServer } = serverReport(actions);
  const failed = actions.filter((a) => a.result && typeof a.result.error === "string");
  const count = state ? counters(state) : null;
  const inMemory = state ? [...state.entries.values()].filter((e) => e.status === "valid").length : 0;
  const roles = state?.meta.myRoles ?? mine?.roles ?? [];
  const canScan = roles.some((r) => SCANNERS.includes(r));
  const canPlace = roles.includes("placement") || roles.includes("super_staff");
  // Contrôle des billets (lot 24, renommé au lot 48) : rôle `shop` et boutique activée pour cet événement.
  const canShop = state ? shopAccess(state.meta) === "ok" : false;
  const ticketDupes = ticketDuplicates(actions);
  const currentPresence = presence ?? mine?.presence ?? "unknown";
  const title = state?.meta.title ?? mine?.event.title ?? L.title;
  const startsAt = state?.meta.startsAt ?? mine?.event.startsAt ?? null;
  const close = () => (router.canGoBack() ? router.back() : router.replace("/acces"));
  const pseudoOf = (passId: unknown, applicationId: unknown) => {
    if (!state) return null;
    const byPass = typeof passId === "string" ? state.entries.get(passId) : undefined;
    const pass = typeof applicationId === "string" ? state.byApplication.get(applicationId) : undefined;
    return byPass?.pseudo ?? (pass ? state.entries.get(pass)?.pseudo : null) ?? null;
  };
  const zones = (count?.zones ?? []).filter((z) => z.expected > 0);

  return (
    <FlowScreen
      title={L.title}
      facts={startsAt ? `${title} · ${formatDayHour(startsAt)}` : title}
      onClose={close}
      still
      overlays={
        <>
          <AlertSheet
            visible={sheet === "alert"}
            onClose={() => setSheet(null)}
            onSend={(message, position) => {
              if (userId) recordAlert(id, userId, message, position);
              setSheet(null);
            }}
          />
          <IncidentSheet
            visible={sheet === "incident"}
            onClose={() => setSheet(null)}
            onSave={(draft) => {
              if (userId) void recordIncident(id, userId, draft);
              setSheet(null);
            }}
          />
        </>
      }
      footer={
        // Toujours en bas (artefact `.stf-bar`) : Alerte, Main courante, et la discussion du staff en bouton carré.
        <View style={styles.row}>
          <Button variant="alert" icon="bell" onPress={() => setSheet("alert")}>
            {L.alert}
          </Button>
          <Button
            variant="secondary"
            icon="edit"
            onPress={() => setSheet("incident")}
            style={styles.flex}
            testID="staff-logbook"
          >
            {L.logbook}
          </Button>
          <Pressable
            onPress={() => router.push(`/staff/${id}/discussion`)}
            accessibilityRole="button"
            accessibilityLabel={communicationLabels.staffDiscussion}
            testID="staff-discussion"
            style={({ pressed }) => [styles.square, { borderColor: c.ink, opacity: pressed ? 0.8 : 1 }]}
          >
            <Icon name="chat" size={22} color={c.ink} />
          </Pressable>
        </View>
      }
    >
      {error ? <Notice tone="error">{error}</Notice> : null}
      {TRUST_MISSING ? <Notice tone="error">{TRUST_MISSING}</Notice> : null}
      {closed ? (
        <Notice>Mode staff fermé depuis J+1 : la liste et les coordonnées ont été effacées de ce téléphone.</Notice>
      ) : null}

      {/* `.stf-sync` : point moutarde, heure de synchro, inscrits en mémoire ; la synchro manuelle reste, discrète. */}
      <View style={[styles.sync, { backgroundColor: c.surface }]} testID="staff-sync">
        <View style={styles.syncRow}>
          <View
            style={[
              styles.dot,
              state
                ? { backgroundColor: c.accent, boxShadow: `0 0 0 5px ${c.accent}40` }
                : { backgroundColor: c.inkFaint },
            ]}
          />
          <View style={styles.flex}>
            <Text variant="bodyStrong" color={c.ink}>
              {state ? L.synced(hourFr(state.meta.syncedAt)) : state === null ? L.neverSynced : "Lecture de la liste…"}
            </Text>
            <Muted variant="caption">{state ? L.inMemory(inMemory) : L.syncFirst}</Muted>
            {pending.length > 0 ? (
              <Text variant="caption" color={c.ink} testID="staff-pending">
                {`${pending.length} envoi${pending.length > 1 ? "s" : ""} en attente : ils partent au retour du réseau`}
              </Text>
            ) : null}
          </View>
        </View>
        {syncMessage ? (
          <Text variant="caption" color={syncMessage.error ? c.ink : c.inkMuted}>
            {syncMessage.error ? `Attention : ${syncMessage.text}` : syncMessage.text}
          </Text>
        ) : null}
        <View style={styles.syncActions}>
          <Pressable
            onPress={() => void sync(true)}
            disabled={syncing}
            accessibilityRole="button"
            testID="staff-sync-now"
            style={styles.link}
          >
            <Icon name="list" size={16} color={c.accentText} />
            <Text variant="bodyStrong" color={c.accentText} style={styles.linkText}>
              {syncing ? "Synchronisation…" : "Synchroniser la liste"}
            </Text>
          </Pressable>
          {pending.length > 0 ? (
            <Pressable onPress={() => userId && void flushNow(userId)} accessibilityRole="button" style={styles.link}>
              <Icon name="export" size={16} color={c.accentText} />
              <Text variant="bodyStrong" color={c.accentText} style={styles.linkText}>
                {`Envoyer · ${pending.length}`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* `.stf-role` : carte crème (noire en Sable), « Je suis là » en pilule moutarde une fois confirmé. */}
      <View style={[styles.role, { backgroundColor: c.poster }]} testID="staff-role">
        <View style={styles.flex}>
          <Text variant="label" color={c.posterMuted}>
            {L.role}
          </Text>
          <Text variant="posterS" color={c.posterInk} style={styles.roleTitle}>
            {roles.map((r) => staffRoleLabels[r]).join(" · ") || "Staff"}
          </Text>
          {mine ? (
            <Text variant="caption" color={c.posterMuted}>
              {L.givenBy(mine.structure.name)}
            </Text>
          ) : null}
        </View>
        {/* Un organisateur qui ouvre le mode staff n'est pas dans « Où je suis staff » : pas de présence (lot 22). */}
        {organizerView ? null : (
          <Pressable
            onPress={() => {
              if (!userId) return;
              const next = currentPresence !== "present";
              setPresence(next ? "present" : "absent");
              void record(id, userId, "presence", { present: next });
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: currentPresence === "present" }}
            testID="staff-presence"
            style={[
              styles.here,
              currentPresence === "present"
                ? { backgroundColor: c.accent, borderColor: c.accent }
                : { borderColor: c.posterInk },
            ]}
          >
            <Icon
              name={currentPresence === "absent" ? "close" : "check"}
              size={16}
              color={currentPresence === "present" ? c.accentInk : c.posterInk}
            />
            <Text
              variant="bodyStrong"
              color={currentPresence === "present" ? c.accentInk : c.posterInk}
              style={styles.hereText}
            >
              {currentPresence === "absent" ? L.notHere : L.here}
            </Text>
          </Pressable>
        )}
      </View>

      {state ? (
        <View style={styles.tiles}>
          {canScan ? (
            <StaffTile
              big
              icon="qr"
              title={L.scanner}
              hint={L.scannerHint}
              onPress={() => router.push(`/staff/${id}/scan`)}
              testID="staff-tile-scan"
            />
          ) : null}
          <StaffTile
            icon="list"
            title={L.list}
            hint={L.listHint(inMemory)}
            onPress={() => router.push(`/staff/${id}/liste`)}
            testID="staff-tile-list"
          />
          {canPlace ? (
            <StaffTile
              icon="place"
              title={L.placement}
              hint={L.placementHint}
              onPress={() => router.push(`/staff/${id}/placement`)}
              testID="staff-tile-placement"
            />
          ) : null}
          {canShop ? (
            <StaffTile
              icon="ticket"
              title={L.tickets}
              hint={L.ticketsHint}
              onPress={() => router.push(`/staff/${id}/boutique`)}
              testID="staff-shop-tile"
            />
          ) : null}
        </View>
      ) : null}

      {count ? (
        <View style={[styles.tz, { backgroundColor: c.ground }]} testID="staff-counters">
          <View style={styles.between}>
            <Text variant="label" color={c.inkMuted}>
              {L.entered}
            </Text>
            <Muted variant="caption">{L.enteredOf(count.arrived, count.expected)}</Muted>
          </View>
          {zones.map((z) => (
            <View key={z.code ?? "none"} style={styles.zoneRow}>
              <Text variant="caption" color={c.inkMuted} style={styles.zoneName} numberOfLines={1}>
                {z.name}
              </Text>
              <View style={[styles.bar, { backgroundColor: c.line }]}>
                <View
                  style={[
                    styles.barFill,
                    { backgroundColor: c.accent, width: `${Math.round((100 * z.arrived) / z.expected)}%` },
                  ]}
                />
              </View>
              <Text variant="label" color={c.ink} style={styles.zoneCount}>
                {z.arrived}/{z.expected}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Muted variant="caption">{L.closesNote}</Muted>

      {consent === "undetermined" ? (
        <View style={[styles.block, styles.card, { backgroundColor: c.surface }]} testID="staff-location-ask">
          <Text variant="label" color={c.inkMuted}>
            Position de l'alerte
          </Text>
          <Text variant="body" color={c.ink}>
            Quand tu touches « Alerte », ta position peut partir avec elle pour que le staff te retrouve. Elle n'est lue
            qu'à ce moment-là, jamais suivie, et effacée dès l'alerte close.
          </Text>
          <Button variant="secondary" icon="place" onPress={() => void askLocationConsent().then(setConsent)} fullWidth>
            Autoriser la position
          </Button>
        </View>
      ) : consent === "denied" ? (
        <Muted variant="meta">
          Position refusée : l'alerte part sans position (réglage du téléphone pour l'autoriser).
        </Muted>
      ) : null}

      {ticketDupes.length > 0 ? (
        <>
          <SectionTitle>Rapport · billets</SectionTitle>
          <View style={[styles.block, styles.card, { backgroundColor: c.surface }]}>
            {ticketDupes.map((d) => (
              <Text key={d.ticketId} variant="body" color={c.ink}>
                Doublon · billet déjà utilisé à {d.usedAt ? clock(d.usedAt) : "—"} (autre téléphone)
                {d.count > 1 ? ` · ×${d.count}` : ""}
              </Text>
            ))}
          </View>
        </>
      ) : null}

      {duplicates.length > 0 || refusedByServer.length > 0 || failed.length > 0 ? (
        <>
          <SectionTitle>Rapport · réponses du serveur</SectionTitle>
          <View style={[styles.block, styles.card, { backgroundColor: c.surface }]}>
            {duplicates.map((l) => (
              <Text key={l.key} variant="body" color={c.ink}>
                Doublon · {pseudoOf(l.passId, l.applicationId) ?? "véhicule"} déjà entré à {l.at ? clock(l.at) : "—"}
                {l.otherDevice ? " (autre téléphone)" : ""}
                {l.count > 1 ? ` · ×${l.count}` : ""}
              </Text>
            ))}
            {refusedByServer.map((l) => (
              <Text key={l.key} variant="body" color={c.ink}>
                {l.result === "unknown" ? "Inconnu du serveur" : "Refusé par le serveur"} ·{" "}
                {pseudoOf(l.passId, l.applicationId) ?? "QR"} · {l.at ? clock(l.at) : "—"}
                {l.count > 1 ? ` · ×${l.count}` : ""}
              </Text>
            ))}
            {failed.map((a) => (
              <Text key={a.id} variant="body" color={c.ink}>
                {a.kind === "express" ? `Express ${String(a.payload.email)}` : "Envoi"} : {String(a.result?.error)}
              </Text>
            ))}
          </View>
        </>
      ) : null}

      {pending.some((a) => a.lastError) ? (
        <Muted variant="meta">
          Dernier essai d'envoi : {pending.find((a) => a.lastError)?.lastError?.replace(/\.$/, "")}. Les scans restent
          sur le téléphone et partiront au retour du réseau.
        </Muted>
      ) : null}
    </FlowScreen>
  );
}

// Mesures de l'artefact (`.stf`, `.stf-sync`, `.stf-role`, `.stf-here`, `.tz-card`, `.tz-bars`, `.stf-bar`).
const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  card: { borderRadius: 16 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  row: { flexDirection: "row", gap: space2, alignItems: "center" },
  flex: { flex: 1 },
  square: { width: 50, height: 50, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  sync: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, gap: space2 },
  syncRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  syncActions: { flexDirection: "row", flexWrap: "wrap", gap: space3, paddingLeft: 24 },
  link: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 },
  linkText: { fontSize: 13 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  role: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16 },
  roleTitle: { fontSize: 17, lineHeight: 19, textTransform: "uppercase", marginTop: 3 },
  here: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    borderWidth: 2,
  },
  hereText: { fontSize: 13 },
  tz: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 7,
    boxShadow: "0 8px 24px rgba(0,0,0,0.40)",
  },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  zoneRow: { flexDirection: "row", alignItems: "center", gap: space2 },
  zoneName: { width: 84, fontSize: 11.5, fontWeight: "800" },
  zoneCount: { width: 44, textAlign: "right" },
  bar: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
});
