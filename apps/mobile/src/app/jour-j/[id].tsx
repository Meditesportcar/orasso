// Mode jour J participant, plein écran, hors ligne (docs/02, prototype DA v2 `s-qr`, lot 48) : le QR d'accès tournant
// en grand (nouveau code signé toutes les 20 s, anneau de compte à rebours, captures bloquées), le compte à rebours, le
// statut de l'événement, l'itinéraire, les consignes, la météo. Tout vient du kit enregistré sur le téléphone dès la
// retenue (secret du code compris) : l'écran s'affiche et le code se fabrique sans aucun réseau. S'ouvre à partir de la
// veille, se ferme après le scan ou à J+1.
// Lot 50 : une fois entré, le bouton « Prix du public » (secondaire : le QR reste l'élément principal) ; au scan, le
// tampon tombe à l'écran (`passport.stamped`, `StampArrival` à la racine).
// Lot C2a (artefact DA v2 `s-qr`) : écran sombre dans les deux thèmes (`#s-qr` sur `--bg-deep`, encre crème), en-tête
// « Jour J · <événement> » et « Hors ligne : tout est déjà sur ton téléphone », la carte crème du QR, l'encart des
// captures, « Comment ça marche sans réseau », Maps / Waze / Sur la carte. Plus de « Me désister » ici : on se retire
// depuis le ticket de Sorties (audit § 5.2, une seule porte). Statut « Annulé » ou « Incertain » seulement s'il y a lieu.

import { Button, Plate, StatusBadge, Text, ThemeScope, tokens, useTheme } from "@orasso/design-system/native";
import {
  communicationLabels,
  eventDaysLabels,
  formatDayDate,
  gradeLabels,
  localDate,
  voteScreenTexts,
  weatherTexts,
} from "@orasso/shared";
import { useNetworkState } from "expo-network";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { CaptureNote, GpsRow, HowItWorks, useBlockCapture } from "@/features/jour-j/QrExtras";
import { type QrHolder, QrPoster } from "@/features/jour-j/QrPoster";
import { useRotatingCode } from "@/features/jour-j/useRotatingCode";
import { WeatherWidget } from "@/features/WeatherWidget";
import { api } from "@/lib/api";
import { useApplications } from "@/lib/applications";
import { serverSkewAt } from "@/lib/clock";
import { formatDay, formatDayHour, formatHour, formatStamp } from "@/lib/format";
import { jourJState } from "@/lib/jourj";
import { type AccessKit, loadKit, loadOtpSecret, refreshKit } from "@/lib/kits";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

const { space2, space3, space4 } = tokens.spacing;

const TITLE = "Jour J";
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
  // L'artefact garde cet écran sombre en Sable aussi : la carte crème du QR y ressort au soleil comme de nuit.
  return (
    <ThemeScope theme="beton">
      <JourJScreen />
    </ThemeScope>
  );
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
  const [refreshFailed, setRefreshFailed] = useState(false);
  const app = [...(upcoming ?? []), ...(past ?? []), ...press].find((a) => a.id === id) ?? null;
  const pseudo = me?.profile.pseudo ?? kit?.pseudo ?? "";
  // Dernière annonce de l'organisateur (lot 20) : avec du réseau, gardée sur le téléphone pour la suite (hors ligne OK).
  const slug = app?.event.slug ?? kit?.event.slug ?? "";
  const feed = useApi(() => api.eventAnnouncements(slug), [slug, online], {
    enabled: Boolean(slug) && online,
    cacheKey: slug ? `feed.${slug}` : undefined,
  });
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
        setRefreshFailed(false);
      })
      .catch(() => !cancelled && setRefreshFailed(true));
    return () => {
      cancelled = true;
    };
  }, [app?.id, app?.status, online, pseudo]);

  const rotating = useRotatingCode(secret, kit?.pass.eventNo, kit?.pass.passId ?? "");
  const tz = kit?.event.timezone;
  const span = kit ? (kit.day ?? kit.event) : null;
  const entered = Boolean(
    kit?.checkedInAt && (!kit.multiDay || kit.day || localDate(new Date(kit.checkedInAt), tz) === localDate(now, tz)),
  );
  const state = kit && span ? jourJState(span, now, entered, tz) : null;
  // Captures bloquées dès que le QR est à l'écran (D34 : consultable avant le jour J, quel que soit l'état « early » ou « open »).
  useBlockCapture(state !== null && state !== "closed");

  const close = () => (router.canGoBack() ? router.back() : router.replace("/acces"));
  const offline = !online || refreshFailed;

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

  // Kits enregistrés avant le lot 28 : ancienne forme de météo, ignorée jusqu'au prochain rafraîchissement.
  const weather = kit.weather && "summary" in kit.weather ? kit.weather : null;
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

  return (
    <FlowScreen title={`${TITLE} · ${kit.event.title}`} facts={FACTS} onClose={close} still>
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
      ) : (
        <>
          <QrPoster
            holder={holderOf(kit, kit.pseudo || pseudo)}
            value={qrValue}
            rotating={rotating.code ? { secondsLeft: rotating.secondsLeft, number: rotating.number } : undefined}
            size={qrSize}
            label="QR d'accès à présenter à l'entrée"
          />
          {me ? (
            <Muted variant="caption" style={styles.center}>
              {gradeLabels[me.profile.grade]} · luminosité au maximum, présente le code à travers le pare-brise
            </Muted>
          ) : null}
          {rotating.code ? (
            <CaptureNote />
          ) : (
            <Notice testID="jourj-legacy">
              Ancien QR : ouvre l'appli une fois avec du réseau pour recevoir ton code qui change toutes les 20
              secondes.
            </Notice>
          )}
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

      <HowItWorks />

      <GpsRow
        destination={{
          title: kit.event.title,
          lat: kit.event.lat,
          lng: kit.event.lng,
          address: place || kit.event.title,
        }}
        onMap={() => router.push(`/e/${kit.event.slug}`)}
      />

      <Plate kind="note" style={styles.block}>
        <Text variant="bodyStrong" color={c.plateInk}>
          {place || kit.event.title}
        </Text>
        {kit.event.entranceNote ? (
          <Text variant="meta" color={c.plateInk} testID="jour-j-entrance">
            {kit.event.entranceNote}
          </Text>
        ) : null}
        <Text variant="meta" color={c.plateMuted}>
          {formatDay(kit.event.startsAt, tz)} · {formatHour(kit.event.startsAt, tz)} –{" "}
          {formatHour(kit.event.endsAt, tz)}
        </Text>
        <Text variant="meta" color={offline ? c.accent : c.plateMuted}>
          {offline
            ? `Hors ligne · QR et infos enregistrés le ${formatStamp(kit.savedAt, tz)}`
            : `À jour · enregistré sur ce téléphone le ${formatStamp(kit.savedAt, tz)}`}
        </Text>
      </Plate>

      {weather ? (
        <WeatherWidget summary={weather.summary} attribution={weather.attribution} title={weatherTexts.todayTitle} />
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
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: "center" },
  block: { gap: space2, padding: space3 },
});
