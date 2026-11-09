// Mode jour J participant, plein écran, hors ligne (docs/02, prototype DA v2 `s-qr`, lot 48) : le QR d'accès tournant
// en grand (nouveau code signé toutes les 20 s, anneau de compte à rebours, captures bloquées), le compte à rebours, le
// statut de l'événement, l'itinéraire, les consignes, la météo. Tout vient du kit enregistré sur le téléphone dès la
// retenue (secret du code compris) : l'écran s'affiche et le code se fabrique sans aucun réseau. S'ouvre à partir de la
// veille, se ferme après le scan ou à J+1.
// Lot 50 : une fois entré, le bouton « Prix du public » (secondaire : le QR reste l'élément principal) ; au scan, le
// tampon tombe à l'écran (`passport.stamped`, `StampArrival` à la racine).
// Lot R7-0 : l'écran suit le thème (la carte du QR reste crème) ; avant, lot C2a (artefact DA v2 `s-qr`) : écran sombre dans les deux thèmes (`#s-qr` sur `--bg-deep`, encre crème), en-tête
// « Jour J · <événement> » et « Hors ligne : tout est déjà sur ton téléphone », la carte crème du QR, l'encart des
// captures, « Comment ça marche sans réseau », Maps / Waze / Sur la carte. Plus de « Me désister » ici : on se retire
// depuis le ticket de Sorties (audit § 5.2, une seule porte). Statut « Annulé » ou « Incertain » seulement s'il y a lieu.
// Lot M4 (maquette 5.1, retours 26 et 27) : Mon QR épuré. Le titre est celui de l'événement ; « Hors ligne » porte un
// « ? » ; un seul texte, « Présente le QR code », dans la carte ; luminosité au maximum, rendue en quittant ; le O au
// centre du QR ; plus de pavé des captures (bandeau à la tentative), plus de grade, plus de lieu ni de météo (ils
// restent sur la fiche) ; Maps et Waze discrets, et seulement à partir de la veille. Consignes et dernière annonce
// restent : elles servent hors ligne, à l'entrée.

import { Button, Plate, StatusBadge, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  arrivalLabel,
  communicationLabels,
  directionsOpen,
  eventDaysLabels,
  eventLastDayInstant,
  eventPageLabels,
  formatDayDate,
  liveAt,
  presenceLabels,
  voteScreenTexts,
  wholeEventEntered,
  wholeEventEntryHolds,
  wholeEventReentry,
} from "@orasso/shared";
import { useNetworkState } from "expo-network";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { seenText } from "@/features/event/CandSheet";
import { CaptureBanner, GpsRow, OfflineLine, useBlockCapture, useMaxBrightness } from "@/features/jour-j/QrExtras";
import { type QrHolder, QrPoster } from "@/features/jour-j/QrPoster";
import { useRotatingCode } from "@/features/jour-j/useRotatingCode";
import { api } from "@/lib/api";
import { useApplications } from "@/lib/applications";
import { serverSkewAt } from "@/lib/clock";
import { formatDayHour } from "@/lib/format";
import { jourJState } from "@/lib/jourj";
import { type AccessKit, loadKit, loadOtpSecret, refreshKit } from "@/lib/kits";
import { useSession } from "@/lib/session";
import { useReloadOnForeground, useServerClock } from "@/lib/useAfter";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

const { space2, space3, space4 } = tokens.spacing;

const TITLE = "Mon QR";
// Mention de l'artefact sous le titre (`.qr-top small`), dans l'en-tête de flux du socle (lot C1).
const FACTS = "Hors ligne : tout est déjà sur ton téléphone";
/** Sans nouvelles du serveur depuis 24 h, l'heure du téléphone n'a pas été recoupée : le code risque d'être refusé. */
const STALE_MS = 24 * 3600_000;

/** En-tête du QR selon la candidature (prototype `s-qr`, variantes par profil). */
function holderOf(kit: AccessKit, pseudo: string): QrHolder {
  const kind = kit.holder?.kind ?? "vehicle";
  if (kind === "provider") {
    return { label: "Emplacement", value: kit.holder?.spotLabel ?? "—", rightLabel: "Prestataire", lines: [pseudo] };
  }
  if (kind === "media") {
    const lines = [kit.holder?.mediaName, pseudo].filter((x): x is string => Boolean(x));
    return { label: "Accès", value: "Presse", rightLabel: "Badge", lines };
  }
  return {
    label: "Ta zone",
    value: kit.zone?.code ?? "—",
    rightLabel: "Véhicule",
    lines: [kit.vehicleLabel ?? "Sans véhicule", pseudo],
  };
}

export default function JourJ() {
  // Lot R7-0 (B1) : l'écran suit le thème choisi (Béton ou Sable) ; la carte du QR reste crème dans les deux (`QrPoster`).
  return <JourJScreen />;
}

function JourJScreen() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useSession();
  const { upcoming, past, press } = useApplications();
  const now = useNow(10_000);
  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  // `undefined` : lecture du kit en cours ; `null` : pas de kit sur ce téléphone.
  const [kit, setKit] = useState<AccessKit | null | undefined>(undefined);
  const [secret, setSecret] = useState<string | null>(null);
  // Lot R7-0, tour 3 : entré pour tout l'événement, le QR n'est plus en tête : il s'ouvre à la demande, « pour un contrôle ».
  const [qrOpen, setQrOpen] = useState(false);
  const app = [...(upcoming ?? []), ...(past ?? []), ...press].find((a) => a.id === id) ?? null;
  const pseudo = me?.profile.pseudo ?? kit?.pseudo ?? "";
  // Dernière annonce de l'organisateur (lot 20) : avec du réseau, gardée sur le téléphone pour la suite (hors ligne OK).
  const slug = app?.event.slug ?? kit?.event.slug ?? "";
  const feed = useApi(() => api.eventAnnouncements(slug), [slug, online], {
    enabled: Boolean(slug) && online,
    cacheKey: slug ? `feed.${slug}` : undefined,
  });
  // Lot R7d2 : « Sur place · N » sous l'état d'entrée. Seulement avec du réseau, seulement ce que l'API renvoie pendant
  // l'événement (après la fin, rien : règle des absents) ; rien n'est gardé sur le téléphone pour le hors ligne.
  const liveNow = useApi(async () => (await api.eventBySlug(slug)).live, [slug, online], {
    enabled: Boolean(slug) && online,
  });
  // Tour 2 : garde d'heure. Resté ouvert au-delà de la fin, l'écran n'affiche plus « Sur place · N » (re-rendu à `endsAt`).
  const endsAtIso = app?.event.endsAt ?? kit?.event.endsAt;
  const liveClock = useServerClock(endsAtIso ? { endsAt: endsAtIso } : null, () => void liveNow.reload());
  useReloadOnForeground(online && Boolean(slug), () => void liveNow.reload());
  const liveGuarded = endsAtIso ? liveAt(liveNow.data, { endsAt: endsAtIso }, liveClock) : (liveNow.data ?? null);
  const onSiteNow = liveGuarded?.phase === "running" ? (liveGuarded.onSiteCount ?? null) : null;
  const lastAnnouncement =
    [...(feed.data?.items ?? [])]
      .filter((i) => i.kind === "announcement")
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0] ?? null;

  // 1. Le kit enregistré s'affiche tout de suite, sans réseau.
  useEffect(() => {
    let cancelled = false;
    loadKit(id).then((stored) => !cancelled && setKit((current) => current ?? stored));
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Le secret du code tournant (trousseau sécurisé) : relu à chaque nouveau kit (le premier kit l'apporte).
  // biome-ignore lint/correctness/useExhaustiveDependencies: relu quand le kit est réenregistré (savedAt change)
  useEffect(() => {
    let cancelled = false;
    void loadOtpSecret(id).then((s) => !cancelled && setSecret(s));
    return () => {
      cancelled = true;
    };
  }, [id, kit?.savedAt]);

  // 2. S'il y a du réseau (et à chaque retour du réseau), on rafraîchit : consignes, zone, météo, entrée enregistrée.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `app` change d'identité à chaque rechargement des candidatures ; seuls son identifiant et son statut relancent le rafraîchissement
  useEffect(() => {
    if (!app || !online) return;
    let cancelled = false;
    refreshKit(app, pseudo)
      .then((fresh) => {
        if (cancelled) return;
        setKit(fresh);
      })
      // Sans réseau ou refus : le kit enregistré reste à l'écran.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [app?.id, app?.status, online, pseudo]);

  const rotating = useRotatingCode(secret, kit?.pass.eventNo, kit?.pass.passId ?? "");
  const tz = kit?.event.timezone;
  const span = kit ? (kit.day ?? kit.event) : null;
  // Lot R7-0 (accès sur plusieurs jours) : une entrée enregistrée vaut ce qu'elle couvre. « Par jour » (le jour de la
  // candidature) : ce jour-là ; « tout l'événement » : jusqu'à la fin, le QR ne revient pas chaque matin à faire scanner.
  const entered = Boolean(kit?.checkedInAt);
  // Entré pour tout l'événement et pas fini (règle partagée avec la fiche et le site) : l'écran dit « Entrée … » et garde
  // le QR, en second, pour un contrôle.
  const reentry = kit ? wholeEventEntryHolds(kit, kit.event, now, tz) : false;
  const state = kit && span ? (reentry ? "open" : jourJState(span, now, entered, tz)) : null;
  // Captures bloquées dès que le QR est à l'écran (D34 : consultable avant le jour J, quel que soit l'état « early » ou « open »).
  const showing = state !== null && state !== "closed" && (!reentry || qrOpen);
  useBlockCapture(showing);
  // Lot M4 : luminosité au maximum tant que le QR est à l'écran (rien à dire : elle se règle toute seule).
  useMaxBrightness(showing);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/acces"));

  if (kit === undefined) {
    return (
      <FlowScreen title={TITLE} facts={FACTS} onClose={close} still>
        <Muted variant="body">Chargement…</Muted>
      </FlowScreen>
    );
  }

  if (kit === null || !span) {
    return (
      <FlowScreen title={TITLE} facts={FACTS} onClose={close} still>
        <Notice tone="error">
          {app && app.status !== "accepted"
            ? "Cette place n'est plus valide : il n'y a plus de QR à présenter."
            : "Ce QR n'est pas encore enregistré sur ce téléphone. Ouvre l'appli une fois avec du réseau : il sera gardé pour le jour J."}
        </Notice>
      </FlowScreen>
    );
  }

  const qrSize = Math.min(width - 6 * space4, 280);
  const place = [kit.event.addressLine, [kit.event.postalCode, kit.event.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  // Dernière mesure de l'heure du serveur (en-tête `Date`, relecture du lot 48) : jamais, ou il y a plus de 24 h.
  const skewAt = serverSkewAt();
  const stale = skewAt === null || Date.now() - skewAt > STALE_MS;
  // Kit d'avant le lot 48 pas encore rafraîchi (pas de secret) : l'ancien QR statique, toujours accepté par le staff
  // jusqu'au lot 58, plutôt que rien à présenter à l'entrée.
  const qrValue = rotating.code ?? kit.pass.payload;

  const qrPoster = (
    <QrPoster
      holder={holderOf(kit, kit.pseudo || pseudo)}
      value={qrValue}
      rotating={rotating.code ? { secondsLeft: rotating.secondsLeft, number: rotating.number } : undefined}
      size={qrSize}
      label="QR d'accès à présenter à l'entrée"
      say={reentry ? "Seulement si on te le demande" : "Présente le QR code"}
      // Tour 2 (décision du coordinateur) : pas de O au centre pour l'instant. À taille d'écran égale, le QR avec logo
      // ne se relit plus au moindre flou (`lib/qr.test.ts`) ; à réessayer sur le scanner staff du Pixel et du Xiaomi.
      logo={false}
    />
  );
  const legacyNotice = (
    <Notice testID="jourj-legacy">
      Ancien QR : ouvre l'appli une fois avec du réseau pour recevoir ton code qui change toutes les 20 secondes.
    </Notice>
  );

  return (
    <FlowScreen
      title={kit.event.title}
      onClose={close}
      still
      overlays={<CaptureBanner active={showing && Boolean(rotating.code)} />}
    >
      <OfflineLine text={FACTS} />
      {stale ? (
        <Notice tone="error" testID="jourj-stale">
          Ouvre l'appli avec du réseau une fois avant l'événement : l'heure de ton téléphone sera recoupée et ton code
          passera du premier coup.
        </Notice>
      ) : null}

      {kit.multiDay ? (
        <Text variant="label" color={c.inkMuted} testID="jourj-day">
          {kit.day ? formatDayDate(kit.day.date) : eventDaysLabels.wholeEvent}
        </Text>
      ) : null}
      {kit.event.cancelled ? (
        <StatusBadge status="cancelled" />
      ) : kit.event.outlook === "uncertain" ? (
        <StatusBadge status="uncertain" />
      ) : null}

      {reentry && kit.checkedInAt ? (
        <Plate kind="note" style={styles.block} testID="jourj-entered">
          <Text variant="posterM" color={c.plateInk}>
            Entrée enregistrée
          </Text>
          <Text variant="body" color={c.plateMuted}>
            {wholeEventEntered(
              new Date(kit.checkedInAt),
              eventLastDayInstant(new Date(kit.event.startsAt), new Date(kit.event.endsAt), tz),
              tz,
            )}
          </Text>
          {onSiteNow !== null ? (
            <Text variant="bodyStrong" color={c.plateInk} testID="jourj-onsite">
              {presenceLabels.dayOnSite(onSiteNow)}
            </Text>
          ) : null}
        </Plate>
      ) : null}

      {state === "closed" ? (
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
      ) : reentry ? null : (
        <>
          {qrPoster}
          {rotating.code ? null : legacyNotice}
        </>
      )}

      {/* Prix du public (lot 50) : ouvert dès le pointage, jusqu'à la fin de l'événement. En bouton secondaire. */}
      {(entered || Boolean(app?.checkedInAt)) && now < new Date(kit.event.endsAt) ? (
        <Button
          variant="plate"
          icon="badge"
          next
          fullWidth
          testID="jourj-vote"
          onPress={() => router.push(`/vote/${kit.event.id}?titre=${encodeURIComponent(kit.event.title)}`)}
        >
          {voteScreenTexts.open}
        </Button>
      ) : null}

      {/* Lot M4 : Maps et Waze seulement à partir de la veille (à J-6, « Sur la carte » seul), plus discrets. */}
      <GpsRow
        destination={{
          title: kit.event.title,
          lat: kit.event.lat,
          lng: kit.event.lng,
          address: place || kit.event.title,
        }}
        directions={directionsOpen(span.startsAt, span.endsAt, now)}
        discreet
        onMap={() => router.push(`/e/${kit.event.slug}`)}
      />

      {/* Tour 2 (relecture Codex) : le créneau privé et sa consigne restent ici, hors ligne, sauf si les consignes de
          l'équipe commencent déjà par lui (elles le reprennent quand l'organisateur les envoie). */}
      {kit.arrival && !(kit.event.instructions ?? "").startsWith(arrivalLabel(kit.arrival)) ? (
        <Plate style={styles.block} testID="jourj-arrival">
          <Text variant="label" color={c.plateMuted}>
            {eventPageLabels.myArrivalTitle}
          </Text>
          <Text variant="body" color={c.plateInk}>
            {seenText(kit.arrival)}
          </Text>
        </Plate>
      ) : null}

      {kit.event.instructions ? (
        <Plate style={styles.block}>
          <Text variant="label" color={c.plateMuted}>
            Consignes de l'équipe organisatrice
          </Text>
          <Text variant="body" color={c.plateInk}>
            {kit.event.instructions}
          </Text>
        </Plate>
      ) : null}

      {lastAnnouncement ? (
        <Plate style={styles.block} testID="last-announcement">
          <Text variant="label" color={c.plateMuted}>
            {communicationLabels.lastAnnouncement} · {formatDayHour(lastAnnouncement.publishedAt, tz)}
          </Text>
          <Text variant="body" color={c.plateInk}>
            {lastAnnouncement.body}
          </Text>
        </Plate>
      ) : null}

      {/* Lot R7-0, tour 3 : le QR d'une personne déjà entrée passe en bas, derrière un bouton secondaire. */}
      {reentry ? (
        <>
          <Button variant="secondary" icon="qr" fullWidth testID="jourj-qr-open" onPress={() => setQrOpen(true)}>
            {eventPageLabels.myQrForCheck}
          </Button>
          <AppSheet visible={qrOpen} onClose={() => setQrOpen(false)} accessibilityLabel={eventPageLabels.myQrForCheck}>
            <View testID="jourj-qr-sheet">
              {qrPoster}
              <Muted variant="body" testID="jourj-reentry">
                {wholeEventReentry}
              </Muted>
              {rotating.code ? null : legacyNotice}
            </View>
          </AppSheet>
        </>
      ) : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
});
