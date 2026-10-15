// Mode jour J participant, plein écran, hors ligne (docs/02) : le QR d'inscription en grand, le compte à rebours, le
// statut de l'événement, l'itinéraire, les consignes, la zone, la météo. Tout vient du kit enregistré sur le
// téléphone dès la retenue : l'écran s'affiche et le QR se dessine sans aucun réseau. S'ouvre à partir de la veille,
// se ferme après le scan ou à J+1.
import { gradeLabels } from "@orasso/shared";
import { Button, Chip, Plate, StatusBadge, Text, tokens, useTheme } from "@orasso/design-system/native";
import { useNetworkState } from "expo-network";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Platform, StyleSheet, useWindowDimensions, View } from "react-native";

import { WithdrawSheet } from "@/features/WithdrawSheet";
import { useApplications } from "@/lib/applications";
import { api } from "@/lib/endpoints";
import { formatDay, formatDayHour, formatDuration, formatHour, formatStamp } from "@/lib/format";
import { jourJOpensAt, jourJState } from "@/lib/jourj";
import { type AccessKit, loadKit, refreshKit } from "@/lib/kits";
import { useSession } from "@/lib/session";
import { useNow } from "@/lib/useNow";
import { Notice } from "@/ui/Notice";
import { QrCode } from "@/ui/QrCode";
import { FlowScreen } from "@/ui/Screens";

const { space1, space2, space3, space4 } = tokens.spacing;

function mapsUrl(kit: AccessKit): string {
  const { lat, lng, addressLine, city, title } = kit.event;
  const where = lat !== null && lng !== null ? `${lat},${lng}` : [addressLine, city].filter(Boolean).join(", ");
  if (Platform.OS === "ios") return `maps:?daddr=${encodeURIComponent(where)}`;
  if (Platform.OS === "android") return `geo:0,0?q=${encodeURIComponent(where)}(${encodeURIComponent(title)})`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(where)}`;
}

export default function JourJ() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useSession();
  const { upcoming, past, reload } = useApplications();
  const now = useNow(10_000);
  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  // `undefined` : lecture du kit en cours ; `null` : pas de kit sur ce téléphone.
  const [kit, setKit] = useState<AccessKit | null | undefined>(undefined);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const app = [...(upcoming ?? []), ...(past ?? [])].find((a) => a.id === id) ?? null;
  const pseudo = me?.profile.pseudo ?? kit?.pseudo ?? "";

  // 1. Le kit enregistré s'affiche tout de suite, sans réseau.
  useEffect(() => {
    let cancelled = false;
    loadKit(id).then((stored) => !cancelled && setKit((current) => current ?? stored));
    return () => {
      cancelled = true;
    };
  }, [id]);

  // 2. S'il y a du réseau (et à chaque retour du réseau), on rafraîchit : consignes, zone, météo, entrée enregistrée.
  useEffect(() => {
    if (!app || !online) return;
    let cancelled = false;
    refreshKit(app, pseudo)
      .then((fresh) => {
        if (cancelled) return;
        setKit(fresh);
        setRefreshFailed(false);
      })
      .catch(() => !cancelled && setRefreshFailed(true));
    return () => {
      cancelled = true;
    };
  }, [app?.id, app?.status, online, pseudo]);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/acces"));
  const offline = !online || refreshFailed;

  if (kit === undefined) {
    return (
      <FlowScreen title="Jour J · hors ligne OK" onClose={close} still>
        <Text variant="body" color={c.inkMuted}>
          Chargement…
        </Text>
      </FlowScreen>
    );
  }

  if (kit === null) {
    return (
      <FlowScreen title="Jour J · hors ligne OK" onClose={close} still>
        <Notice tone="error">
          {app && app.status !== "accepted"
            ? "Cette place n'est plus valide : il n'y a plus de QR à présenter."
            : "Ce QR n'est pas encore enregistré sur ce téléphone. Ouvre l'appli une fois avec du réseau (idéalement la veille) : il sera gardé pour le jour J."}
        </Notice>
      </FlowScreen>
    );
  }

  const tz = kit.event.timezone;
  const state = jourJState(kit.event, now, Boolean(kit.checkedInAt), tz);
  const untilStart = new Date(kit.event.startsAt).getTime() - now.getTime();
  const qrSize = Math.min(width - 4 * space4, 320);
  const place = [kit.event.addressLine, [kit.event.postalCode, kit.event.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  return (
    <FlowScreen
      title="Jour J · hors ligne OK"
      onClose={close}
      still
      overlays={
        <WithdrawSheet
          app={withdrawing ? app : null}
          now={now}
          onClose={() => setWithdrawing(false)}
          onConfirm={async (target) => {
            await api.withdraw(target.id);
            setWithdrawing(false);
            await reload();
            router.replace("/acces");
          }}
        />
      }
      footer={
        state === "open" && app && app.status === "accepted" ? (
          <Button
            variant="plate"
            tone="dashed"
            icon="close"
            disabled={!online}
            onPress={() => setWithdrawing(true)}
            fullWidth
          >
            Me désister
          </Button>
        ) : undefined
      }
    >
      <View style={styles.head}>
        <Text variant="posterXl" color={c.ink}>
          {kit.event.title}
        </Text>
        <Text variant="body" color={c.inkMuted}>
          {untilStart > 0
            ? `${formatDay(kit.event.startsAt, tz)} · ouverture des portes dans ${formatDuration(untilStart)}`
            : "L'événement a commencé."}
        </Text>
        <View style={styles.chips}>
          {kit.event.cancelled ? (
            <StatusBadge status="cancelled" />
          ) : kit.event.outlook === "uncertain" ? (
            <StatusBadge status="uncertain" />
          ) : (
            <Chip>Maintenu</Chip>
          )}
          {kit.weather ? (
            <Chip>
              {kit.weather.temperature} °C · {kit.weather.label}
            </Chip>
          ) : null}
        </View>
      </View>

      {state === "early" ? (
        <Plate kind="note" style={styles.block}>
          <Text variant="posterM" color={c.plateInk}>
            Ton QR est prêt
          </Text>
          <Text variant="body" color={c.plateMuted}>
            Il est enregistré sur ce téléphone et fonctionnera sans réseau. Le mode jour J s'ouvre la veille, le{" "}
            {formatDayHour(jourJOpensAt(kit.event, tz), tz)}.
          </Text>
        </Plate>
      ) : state === "closed" ? (
        <Plate kind="note" style={styles.block}>
          <Text variant="posterM" color={c.plateInk}>
            {kit.checkedInAt ? "Entrée enregistrée" : "Mode jour J terminé"}
          </Text>
          <Text variant="body" color={c.plateMuted}>
            {kit.checkedInAt
              ? `Tu es entré le ${formatDayHour(kit.checkedInAt, tz)}. Bonne soirée !`
              : "L'événement est terminé : le QR n'est plus utile. Tes points arrivent deux jours après."}
          </Text>
        </Plate>
      ) : (
        <View style={[styles.poster, { backgroundColor: c.poster, boxShadow: t.shadow.shadowPoster }]}>
          <View style={styles.badge}>
            <StatusBadge status="retained" />
          </View>
          <View style={styles.qr}>
            <QrCode value={kit.pass.payload} size={qrSize} label="QR d'inscription à présenter à l'entrée" />
          </View>
          <View style={styles.posterFoot}>
            <View style={styles.posterText}>
              <Text variant="posterM" color={c.posterInk}>
                {kit.vehicleLabel ?? "Sans véhicule"}
              </Text>
              <Text variant="meta" color={c.posterMuted}>
                {kit.pseudo}
                {me ? ` · ${gradeLabels[me.profile.grade]}` : ""}
              </Text>
            </View>
            {kit.zone ? (
              <View style={styles.zone}>
                <Text variant="label" color={c.posterMuted}>
                  Zone
                </Text>
                <Text variant="zone" color={c.posterInk}>
                  {kit.zone.code}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      )}

      {state === "open" ? (
        <Text variant="label" color={c.inkMuted} style={styles.center}>
          Luminosité au maximum · présente le code à travers le pare-brise
        </Text>
      ) : null}

      <Text variant="meta" color={offline ? c.accentText : c.inkMuted} style={styles.center}>
        {offline
          ? `Hors ligne · QR et infos enregistrés le ${formatStamp(kit.savedAt, tz)}`
          : `À jour · enregistré sur ce téléphone le ${formatStamp(kit.savedAt, tz)}`}
      </Text>

      <Plate style={styles.block}>
        <Text variant="label" color={c.plateMuted}>
          Itinéraire
        </Text>
        <Text variant="bodyStrong" color={c.plateInk}>
          {place || kit.event.title}
        </Text>
        <Text variant="meta" color={c.plateMuted}>
          {formatDay(kit.event.startsAt, tz)} · {formatHour(kit.event.startsAt, tz)} – {formatHour(kit.event.endsAt, tz)}
        </Text>
        <Button variant="plate" icon="place" onPress={() => void Linking.openURL(mapsUrl(kit))} fullWidth>
          Ouvrir dans Plans
        </Button>
      </Plate>

      {kit.event.instructions ? (
        <Plate style={styles.block}>
          <Text variant="label" color={c.plateMuted}>
            Consignes de l'organisateur
          </Text>
          <Text variant="body" color={c.plateInk}>
            {kit.event.instructions}
          </Text>
        </Plate>
      ) : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space2, alignItems: "center" },
  poster: { borderRadius: tokens.radius.radiusLg, padding: space4, gap: space3 },
  badge: { alignSelf: "flex-end" },
  qr: { alignItems: "center" },
  posterFoot: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space3 },
  posterText: { flex: 1, gap: space1 },
  zone: { alignItems: "flex-end" },
  center: { textAlign: "center" },
  block: { gap: space2, padding: space3 },
});
