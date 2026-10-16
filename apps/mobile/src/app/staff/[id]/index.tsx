// Mode staff, écran d'entrée (docs/02 « Mode staff (détail) », prototype « Mode staff · accueil ») : l'événement,
// l'état de la synchro, mon rôle, « je suis là », les tuiles selon mes rôles, la file d'envoi et les doublons
// rapportés par le serveur. Tout s'affiche sans réseau depuis la liste du téléphone.
import { Button, Counters, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  communicationLabels,
  type MyStaffEvent,
  type StaffRole,
  staffPresenceLabels,
  staffRoleLabels,
} from "@orasso/shared";
import { useNetworkState } from "expo-network";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AlertSheet } from "@/features/staff/AlertSheet";
import { IncidentSheet } from "@/features/staff/IncidentSheet";
import { clock } from "@/features/staff/result";
import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { counters, serverReport } from "@/lib/staff/model";
import { flushNow, record, syncEvent, TRUST_MISSING } from "@/lib/staff/runtime";
import { useStaffActions, useStaffEvent } from "@/lib/staff/useStaff";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";

const { space2, space3 } = tokens.spacing;

const SCANNERS: StaffRole[] = ["scan", "control", "super_staff"];

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
  const autoSynced = useRef(false);
  // Fermé à J+1 : la liste est purgée du téléphone (openEvent), on ne la redemande pas.
  const closed = mine ? !mine.staffModeOpen && new Date() >= new Date(mine.staffModeClosesAt) : false;

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
  const roles = state?.meta.myRoles ?? mine?.roles ?? [];
  const canScan = roles.some((r) => SCANNERS.includes(r));
  const canPlace = roles.includes("placement") || roles.includes("super_staff");
  const currentPresence = presence ?? mine?.presence ?? "unknown";
  const title = state?.meta.title ?? mine?.event.title ?? "Mode staff";
  const close = () => (router.canGoBack() ? router.back() : router.replace("/acces"));
  const pseudoOf = (passId: unknown, applicationId: unknown) => {
    if (!state) return null;
    const byPass = typeof passId === "string" ? state.entries.get(passId) : undefined;
    const pass = typeof applicationId === "string" ? state.byApplication.get(applicationId) : undefined;
    return byPass?.pseudo ?? (pass ? state.entries.get(pass)?.pseudo : null) ?? null;
  };

  return (
    <FlowScreen
      title={title}
      facts={`Mode staff · ${roles.map((r) => staffRoleLabels[r]).join(" · ") || "staff"}`}
      onClose={close}
      still
      overlays={
        <>
          <AlertSheet
            visible={sheet === "alert"}
            onClose={() => setSheet(null)}
            onSend={(message) => {
              if (userId) void record(id, userId, "alert", { message: message || null });
              setSheet(null);
            }}
          />
          <IncidentSheet
            visible={sheet === "incident"}
            onClose={() => setSheet(null)}
            onSave={(body) => {
              if (userId) void record(id, userId, "incident", { ...body, occurredAt: new Date().toISOString() });
              setSheet(null);
            }}
          />
        </>
      }
      footer={
        // Toujours accessibles en bas (docs/02) : l'alerte et, à côté, la discussion du staff (lot 20, en ligne).
        <View style={styles.row}>
          <Button variant="alert" icon="alert" onPress={() => setSheet("alert")} style={styles.tile}>
            Alerte
          </Button>
          <Button
            variant="rescue"
            icon="chat"
            onPress={() => router.push(`/staff/${id}/discussion`)}
            style={styles.tile}
            testID="staff-discussion"
          >
            {communicationLabels.staffDiscussion}
          </Button>
        </View>
      }
    >
      {error ? <Notice tone="error">{error}</Notice> : null}
      {TRUST_MISSING ? <Notice tone="error">{TRUST_MISSING}</Notice> : null}
      {closed ? (
        <Notice>Mode staff fermé depuis J+1 : la liste et les coordonnées ont été effacées de ce téléphone.</Notice>
      ) : null}

      <Plate style={styles.block}>
        <Text variant="label" color={c.plateMuted}>
          {mine ? `${formatDayHour(mine.event.startsAt)} · ${mine.structure.name}` : "Ton poste"}
        </Text>
        <Text variant="bodyStrong" color={c.plateInk}>
          {state
            ? "Hors ligne OK : la liste est sur ton téléphone."
            : state === null
              ? "La liste n'est pas encore sur ce téléphone : synchronise avec du réseau avant l'ouverture des portes."
              : "Lecture de la liste…"}
        </Text>
        {count ? (
          <Counters
            items={[
              { value: count.arrived, label: "Arrivés" },
              { value: count.expected - count.arrived, label: "Attendus" },
              { value: pending.length, label: "À envoyer" },
            ]}
            active={pending.length > 0 ? 2 : undefined}
          />
        ) : null}
      </Plate>

      {/* Un organisateur qui ouvre le mode staff n'est pas dans la liste « Où je suis staff » : pas de réponse de présence (lot 22). */}
      {organizerView ? null : (
        <Plate style={styles.block}>
          <Text variant="label" color={c.plateMuted}>
            Présence
          </Text>
          <Text variant="bodyStrong" color={c.plateInk}>
            {currentPresence === "present"
              ? "Je suis là"
              : currentPresence === "absent"
                ? "Pas là"
                : staffPresenceLabels.unknown}
          </Text>
          <Button
            variant="plate"
            icon={currentPresence === "present" ? "close" : "check"}
            onPress={() => {
              if (!userId) return;
              const next = currentPresence !== "present";
              setPresence(next ? "present" : "absent");
              void record(id, userId, "presence", { present: next });
            }}
            fullWidth
          >
            {currentPresence === "present" ? "Pas là" : "Je suis là"}
          </Button>
        </Plate>
      )}

      <Plate style={styles.block}>
        <Text variant="label" color={c.plateMuted}>
          Synchro
        </Text>
        <Text variant="bodyStrong" color={c.plateInk}>
          {state
            ? `Liste à jour ${clock(state.meta.syncedAt)}${state.meta.isLocked ? "" : " · liste non verrouillée"} · ${pending.length} envoi${pending.length > 1 ? "s" : ""} en attente`
            : "Jamais synchronisée sur ce téléphone"}
        </Text>
        {syncMessage ? (
          <Text variant="body" color={syncMessage.error ? c.plateInk : c.plateMuted}>
            {syncMessage.error ? `Attention : ${syncMessage.text}` : syncMessage.text}
          </Text>
        ) : null}
        <Button variant="plate" icon="list" loading={syncing} onPress={() => void sync(true)} fullWidth>
          Synchroniser la liste
        </Button>
        {pending.length > 0 ? (
          <Button variant="plate" icon="export" onPress={() => userId && void flushNow(userId)} fullWidth>
            Envoyer maintenant
          </Button>
        ) : null}
      </Plate>

      {state ? (
        <View style={styles.tiles}>
          {canScan ? (
            <Button icon="qr" onPress={() => router.push(`/staff/${id}/scan`)} next fullWidth>
              Ouvrir le scan
            </Button>
          ) : null}
          <View style={styles.row}>
            <Button variant="rescue" icon="list" onPress={() => router.push(`/staff/${id}/liste`)} style={styles.tile}>
              Liste
            </Button>
            {canPlace ? (
              <Button
                variant="rescue"
                icon="place"
                onPress={() => router.push(`/staff/${id}/placement`)}
                style={styles.tile}
              >
                Placement
              </Button>
            ) : null}
            <Button variant="rescue" icon="incident" onPress={() => setSheet("incident")} style={styles.tile}>
              Main courante
            </Button>
          </View>
        </View>
      ) : null}

      {duplicates.length > 0 || refusedByServer.length > 0 || failed.length > 0 ? (
        <>
          <SectionTitle>Rapport · réponses du serveur</SectionTitle>
          <Plate style={styles.block}>
            {duplicates.map((l) => (
              <Text key={l.key} variant="body" color={c.plateInk}>
                Doublon · {pseudoOf(l.passId, l.applicationId) ?? "véhicule"} déjà entré à {l.at ? clock(l.at) : "—"}
                {l.otherDevice ? " (autre téléphone)" : ""}
                {l.count > 1 ? ` · ×${l.count}` : ""}
              </Text>
            ))}
            {refusedByServer.map((l) => (
              <Text key={l.key} variant="body" color={c.plateInk}>
                {l.result === "unknown" ? "Inconnu du serveur" : "Refusé par le serveur"} ·{" "}
                {pseudoOf(l.passId, l.applicationId) ?? "QR"} · {l.at ? clock(l.at) : "—"}
                {l.count > 1 ? ` · ×${l.count}` : ""}
              </Text>
            ))}
            {failed.map((a) => (
              <Text key={a.id} variant="body" color={c.plateInk}>
                {a.kind === "express" ? `Express ${String(a.payload.email)}` : "Envoi"} : {String(a.result?.error)}
              </Text>
            ))}
          </Plate>
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

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  tiles: { gap: space2 },
  row: { flexDirection: "row", gap: space2 },
  tile: { flex: 1 },
});
