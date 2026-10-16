// QR de stand (lot 21) : le pass de la candidature retenue d'un prestataire, en grand, pour le jour J. Même QR signé que
// celui des participants ; une copie est gardée sur le téléphone après la première lecture (marche sans réseau).
import { Plate, StatusBadge, Text, tokens, useTheme } from "@orasso/design-system/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { QrCode } from "@/ui/QrCode";
import { FlowScreen } from "@/ui/Screens";

const { space1, space3, space4 } = tokens.spacing;

export default function StandQr() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const pass = useApi(() => api.pass(id), [id], { cacheKey: `stand-pass-${id}` });
  const apps = useApi(() => api.providerApplications("upcoming"), [], { cacheKey: "provider-applications" });
  const profile = useApi(async () => (await api.providerProfile()).profile, [], { cacheKey: "provider-profile" });
  const app = apps.data?.find((a) => a.id === id);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/candidatures"));
  const qrSize = Math.min(width - 4 * space4, 320);

  return (
    <FlowScreen title="Mon QR de stand" onClose={close} still>
      {app ? (
        <Plate style={styles.head}>
          <Text variant="posterXl" color={c.plateInk}>
            {app.event.title}
          </Text>
          <Text variant="body" color={c.plateMuted}>
            {formatDayHour(app.event.startsAt)}
            {profile.data ? ` · ${profile.data.name}` : ""}
          </Text>
        </Plate>
      ) : null}
      {pass.data?.payload ? (
        <View style={[styles.poster, { backgroundColor: c.poster, boxShadow: t.shadow.shadowPoster }]}>
          <StatusBadge status="retained" />
          <QrCode value={pass.data.payload} size={qrSize} label="QR de stand à présenter à l'entrée" />
          <Text variant="body" color={c.posterInk} style={styles.centered}>
            Présente ce QR à l'équipe d'accueil en arrivant : ton entrée est enregistrée comme celle d'un participant.
          </Text>
        </View>
      ) : pass.error ? (
        <Notice tone="error">
          {pass.error.status === 404
            ? "Pas de QR pour cette candidature : elle n'est pas retenue (ou plus)."
            : pass.error.message}
        </Notice>
      ) : pass.data && !pass.data.payload ? (
        <Notice tone="error">Ce QR n'est plus valide : ta candidature n'est plus retenue.</Notice>
      ) : (
        <Muted variant="body">Chargement…</Muted>
      )}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space1, padding: space3 },
  poster: { alignItems: "center", gap: space3, padding: space4, borderRadius: tokens.radius.radiusLg },
  centered: { textAlign: "center" },
});
