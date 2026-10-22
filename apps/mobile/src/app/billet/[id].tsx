// Mon billet (lot C2a, artefact DA v2 `s-qr`, variante visiteur) : le billet d'un visiteur s'ouvre comme le QR d'accès
// de l'exposant, sur l'écran sombre de l'artefact (dans les deux thèmes) : « Jour J · <événement> », la carte crème
// « Entrée · Public » avec « Billet · Gratuit / <pseudo> », la note sur les captures, l'itinéraire. Le QR du billet est
// statique (charge utile signée OR1, lot 34) : pas d'anneau ni de « nouveau code ». Le billet reste lisible hors ligne
// (liste gardée sur le téléphone). On le rend depuis son ticket dans Sorties. `/billets` garde la liste complète.
import { Text, ThemeScope, useTheme } from "@orasso/design-system/native";
import { ticketAppLabels as L, type MyTicket } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Platform, StyleSheet, useWindowDimensions } from "react-native";

import { CaptureNote, GpsRow, useBlockCapture } from "@/features/jour-j/QrExtras";
import { QrPoster } from "@/features/jour-j/QrPoster";
import { SmallButton } from "@/features/sorties/bits";
import { formatPrice } from "@/features/tickets/TicketsBlock";
import { api } from "@/lib/api";
import { formatDay, formatHour } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

// Mention de l'artefact sous le titre (`.qr-top small`), dans l'en-tête de flux du socle (lot C1).
/** Ce que fait vraiment l'écran selon la plateforme (le QR du billet est statique : pas de code qui se périme). */
const TICKET_CAPTURE_TEXT =
  Platform.OS === "android"
    ? "Captures et enregistrement d'écran bloqués sur cet écran. Présente le code à l'entrée, luminosité au maximum."
    : Platform.OS === "ios"
      ? "Enregistrement d'écran masqué sur cet écran. Présente le code à l'entrée, luminosité au maximum."
      : "Présente le code à l'entrée, luminosité au maximum.";

const FACTS = "Hors ligne : tout est déjà sur ton téléphone";

export default function Billet() {
  return (
    <ThemeScope theme="beton">
      <BilletScreen />
    </ThemeScope>
  );
}

function BilletScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const pseudo = useSession().me?.profile.pseudo ?? "";
  const tickets = useApi(() => api.myTickets(), [], { cacheKey: "tickets-home" });
  const ticket: MyTicket | undefined = (tickets.data ?? []).find((x) => x.id === id);
  useBlockCapture(Boolean(ticket && ticket.status === "valid"));
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (!ticket) {
    // Relecture du lot C2a : une panne sans billet gardé sur le téléphone se dit, avec « Réessayer » (plus de
    // « Chargement… » sans fin).
    return (
      <FlowScreen title="Mon billet" facts={FACTS} onClose={close} still onRefresh={tickets.reload}>
        {tickets.data ? (
          <Notice tone="error">{L.none}</Notice>
        ) : tickets.error ? (
          <>
            <Notice tone="error" testID="billet-error">
              Billet indisponible : ouvre l'appli une fois avec du réseau pour le garder sur ce téléphone.
            </Notice>
            <SmallButton icon="undo" onPress={() => void tickets.reload()} testID="billet-retry">
              Réessayer
            </SmallButton>
          </>
        ) : (
          <Muted variant="body">Chargement…</Muted>
        )}
      </FlowScreen>
    );
  }
  const e = ticket.event;
  const used = ticket.status === "used";
  const price = ticket.priceCents == null ? "Gratuit" : formatPrice(ticket.priceCents);
  return (
    <FlowScreen title={`Jour J · ${e.title}`} facts={FACTS} onClose={close} still onRefresh={tickets.reload}>
      <QrPoster
        holder={{ label: "Entrée", value: "Public", rightLabel: "Billet", lines: [price, pseudo].filter(Boolean) }}
        value={ticket.payload}
        size={Math.min(width - 96, 280)}
        label={L.qrLabel(e.title)}
      />
      <Text variant="caption" color={t.color.inkMuted} style={styles.center} testID="billet-state">
        {`${used ? L.entryRecorded : L.showAtEntry} ${formatDay(e.startsAt)} · ${formatHour(e.startsAt)} – ${formatHour(e.endsAt)}`}
      </Text>
      {ticket.priceCents != null && ticket.testMode ? (
        <Text variant="caption" color={t.color.inkMuted} style={styles.center} testID="billet-demo">
          {`${formatPrice(ticket.priceCents)} · ${L.demoPayment}`}
        </Text>
      ) : null}
      {tickets.error ? <Notice testID="billet-offline">Hors ligne : billet gardé sur ce téléphone.</Notice> : null}
      <CaptureNote text={TICKET_CAPTURE_TEXT} />
      {/* Le billet ne porte pas les coordonnées du lieu : Maps et Waze restent éteints, « Sur la carte » ouvre la fiche. */}
      <GpsRow
        destination={{ title: e.title, lat: null, lng: null, address: [e.title, e.city].filter(Boolean).join(", ") }}
        onMap={() => router.push(`/e/${e.slug}`)}
        routes={false}
      />
    </FlowScreen>
  );
}

const styles = StyleSheet.create({ center: { textAlign: "center" } });
