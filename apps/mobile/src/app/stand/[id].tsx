// QR de stand (lot 21) : le pass de la candidature retenue d'un prestataire, en grand, pour le jour J. Même QR que celui
// des participants ; une copie est gardée sur le téléphone après la première lecture (marche sans réseau).
// Lot 48 (prototype `s-qr`, variante prestataire) : code tournant toutes les 20 s, emplacement en tête, captures
// bloquées sur cet écran.
import { Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, useWindowDimensions } from "react-native";

import { CaptureNote, HowItWorks, useBlockCapture } from "@/features/jour-j/QrExtras";
import { QrPoster } from "@/features/jour-j/QrPoster";
import { useRotatingCode } from "@/features/jour-j/useRotatingCode";
import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
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
  const rotating = useRotatingCode(pass.data?.otpSecret ?? null, pass.data?.eventNo, pass.data?.passId ?? "");
  const valid = Boolean(pass.data?.payload);
  useBlockCapture(valid);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/candidatures"));
  const qrSize = Math.min(width - 6 * space4, 280);

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
        <>
          <QrPoster
            holder={{
              label: "Emplacement",
              value: pass.data.spotLabel ?? "—",
              rightLabel: "Prestataire",
              lines: profile.data ? [profile.data.name] : [],
            }}
            value={rotating.code ?? pass.data.payload}
            rotating={rotating.code ? { secondsLeft: rotating.secondsLeft, number: rotating.number } : undefined}
            size={qrSize}
            label="QR de stand à présenter à l'entrée"
          />
          <Muted variant="meta">
            Présente ce QR à l'équipe d'accueil en arrivant : ton entrée est enregistrée comme celle d'un participant.
          </Muted>
          {rotating.code ? <CaptureNote /> : null}
          <HowItWorks />
        </>
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
});
