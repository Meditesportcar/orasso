// Casquette Prestataire, Candidatures (lot 21) : mes candidatures par statut, les événements ouverts à mon type, le QR
// de stand du jour J (le pass de la candidature retenue, en grand). Les prestataires ne comptent jamais dans les places.
import { Button, Chip, ChipRow, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import type { OpenEventForProvider, ProviderApplicationView } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { ApplySheet } from "@/features/provider/ApplySheet";
import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle, TabScreen } from "@/ui/Screens";
import { ApplicationStatusBadge } from "@/ui/StatusOf";

const { space1, space2, space3 } = tokens.spacing;

const ORDER = ["accepted", "pending", "waitlisted", "offered", "refused", "withdrawn", "expired", "cancelled"];

export default function Candidatures() {
  const { t } = useTheme();
  const router = useRouter();
  const { refreshMe } = useSession();
  const profile = useApi(async () => (await api.providerProfile()).profile, [], { cacheKey: "provider-profile" });
  const mine = useApi(() => api.providerApplications("upcoming"), [], { cacheKey: "provider-applications" });
  const open = useApi(() => api.openToProviders(), [], { cacheKey: "provider-open-events" });
  const [applying, setApplying] = useState<OpenEventForProvider | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apps = [...(mine.data ?? [])].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const firstAccepted = apps.find((a) => a.status === "accepted")?.id;
  const openEvents = (open.data ?? []).filter(
    (e) => !e.myApplication || ["withdrawn", "refused", "expired", "cancelled"].includes(e.myApplication.status),
  );

  async function reloadAll() {
    await Promise.all([mine.reload(), open.reload(), profile.reload()]);
    void refreshMe();
  }

  async function withdraw(app: ProviderApplicationView) {
    setBusy(app.id);
    setError(null);
    try {
      await api.withdraw(app.id);
      await reloadAll();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <TabScreen
      title="Candidatures"
      facts={profile.data?.name}
      onRefresh={reloadAll}
      overlays={
        <ApplySheet
          eventTitle={applying?.title ?? null}
          onClose={() => setApplying(null)}
          onSend={async (message) => {
            if (!applying) return;
            await api.applyAsProvider(applying.id, { rulesAccepted: true, message });
            setApplying(null);
            await reloadAll();
          }}
        />
      }
    >
      {profile.data?.issue ? <Notice>Complète ton profil pour candidater : {profile.data.issue}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <SectionTitle>Mes candidatures</SectionTitle>
      {apps.length === 0 ? (
        <Muted variant="body">{mine.loading ? "Chargement…" : "Aucune candidature à venir."}</Muted>
      ) : (
        apps.map((app) => (
          <Plate key={app.id} style={styles.card} testID="provider-application">
            <View style={styles.head}>
              <View style={styles.title}>
                <Text variant="label" color={t.color.plateMuted}>
                  {formatDayHour(app.event.startsAt)}
                </Text>
                <Text
                  variant="posterM"
                  color={t.color.plateInk}
                  onPress={() => router.push(`/e/${app.event.slug}`)}
                  accessibilityRole="link"
                >
                  {app.event.title}
                </Text>
              </View>
              <ApplicationStatusBadge app={app} />
            </View>
            {app.accreditedMedia ? (
              <ChipRow>
                <Chip surface="plate" variant="accent">
                  Média officiel
                </Chip>
              </ChipRow>
            ) : null}
            {app.status === "pending" ? (
              <Text variant="body" color={t.color.plateMuted}>
                Réponse de l'organisateur à venir.
              </Text>
            ) : null}
            {app.status === "waitlisted" ? (
              <Text variant="body" color={t.color.plateMuted}>
                En liste d'attente : l'organisateur te recontacte s'il y a de la place pour toi.
              </Text>
            ) : null}
            {app.refusalNote ? (
              <Text variant="body" color={t.color.plateMuted}>
                « {app.refusalNote} »
              </Text>
            ) : null}
            <View style={styles.buttons}>
              {app.status === "accepted" ? (
                <Button
                  variant={app.id === firstAccepted ? "primary" : "plate"}
                  icon="qr"
                  next
                  onPress={() => router.push(`/stand/${app.id}`)}
                  fullWidth
                >
                  Mon QR de stand
                </Button>
              ) : null}
              {app.canWithdraw ? (
                <Button
                  variant="plate"
                  tone="dashed"
                  icon="close"
                  disabled={busy !== null}
                  loading={busy === app.id}
                  onPress={() => void withdraw(app)}
                  fullWidth
                >
                  Me désister
                </Button>
              ) : null}
            </View>
          </Plate>
        ))
      )}

      <SectionTitle>Ouverts à mon activité</SectionTitle>
      {openEvents.length === 0 ? (
        <Muted variant="body">
          {open.loading ? "Chargement…" : "Aucun événement n'attend ton type d'activité pour le moment."}
        </Muted>
      ) : (
        openEvents.map((e) => (
          <Plate key={e.id} style={styles.card} testID="provider-open-event">
            <Text variant="label" color={t.color.plateMuted}>
              {formatDayHour(e.startsAt)} · {e.structureName}
            </Text>
            <Text
              variant="posterM"
              color={t.color.plateInk}
              onPress={() => router.push(`/e/${e.slug}`)}
              accessibilityRole="link"
            >
              {e.title}
            </Text>
            {e.city ? (
              <Text variant="body" color={t.color.plateMuted}>
                {e.city}
              </Text>
            ) : null}
            <Button
              variant="secondary"
              icon="next"
              disabled={Boolean(profile.data?.issue) || !profile.data}
              onPress={() => setApplying(e)}
              fullWidth
            >
              Candidater
            </Button>
          </Plate>
        ))
      )}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space2, padding: space3 },
  head: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space2 },
  title: { flex: 1, gap: space1 },
  buttons: { gap: space2, marginTop: space1 },
});
