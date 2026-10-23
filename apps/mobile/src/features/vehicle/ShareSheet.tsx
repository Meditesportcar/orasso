// Affiche à partager (lots 31 et 50 ; lot M6 : maquettes 2.1 à 2.3) : story 9:16 par défaut ou post 4:5, trois styles
// (Nuit, Sable, Néon), rendue par l'API (même composition sur le site). Un aperçu à l'échelle, « Voir les zones masquées
// par Instagram » (story seulement : 13 % en haut, 15 % en bas), « En story » / « En post » (feuille de partage du
// système), « Image » (enregistrer) et le lien de la fiche. Jamais de fausse plaque : la photo garde la plaque floutée
// par le serveur ; filet de sécurité : la plaque est re-détectée sur l'affiche composée avant le partage, et une plaque
// lisible se masque d'un toucher (l'API floute la zone).
// Le contenu (`ShareBody`) est commun à l'écran de flux (`/vehicule/<id>/partager`) et à la feuille de fin d'ajout.

import { Button, Icon, OLoader, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  shareSheetLabels as L,
  type PlateRect,
  SHARE_SAFE,
  SHARE_SIZES,
  type ShareFormat,
  type ShareStyle,
  shareFormatLabels,
  shareFormats,
  shareStyleLabels,
  shareStyles,
} from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { Alert, Image, Platform, Share, StyleSheet, View } from "react-native";
import { siteUrl } from "@/api";
import { Seg, SmButton } from "@/features/passionne/kit";
import { errorMessage } from "@/lib/http";
import { detectSharePlates } from "@/lib/sharePlates";
import {
  type PreparedShare,
  prepareShareImage,
  releasePrepared,
  type ShareOutcome,
  sendShareImage,
} from "@/lib/shareVehicle";
import { AppSheet } from "@/ui/AppSheet";
import { PLATE_CHECK_TIMEOUT_MS, type PlateCheck, plateGate } from "./sharePlateGate";
import { shareSheetKey } from "./shareSheetKey";

const { space1, space2 } = tokens.spacing;

/** Largeur de l'aperçu (maquette `.aff` : 266 px en story, 300 px en post). */
const PREVIEW_WIDTH: Record<ShareFormat, number> = { story: 266, post: 300 };

const keyOf = (format: ShareFormat, style: ShareStyle) => `${format}:${style}`;

/** Partager malgré une plaque détectée ou non vérifiée : toujours confirmé (Damien : aucune plaque visible). */
function confirmShareAnyway(go: () => void, unchecked = false) {
  const message = unchecked ? L.shareUncheckedConfirm : L.shareAnywayConfirm;
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.confirm(message)) go();
    return;
  }
  Alert.alert(unchecked ? L.plateSlow : L.plateFound, message, [
    { text: "Annuler", style: "cancel" },
    { text: L.shareAnyway, style: "destructive", onPress: go },
  ]);
}

/**
 * La feuille repart de zéro quand le véhicule ou sa version change (relecture du lot 50) : après le floutage d'une
 * plaque, la version change et l'ancien PNG (plaque nette) ne doit jamais être resservi.
 */
export function ShareSheet(props: {
  vehicleId: string;
  /** `VehicleFull.shareVersion`. */
  version: string;
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <AppSheet visible={props.visible} onClose={props.onClose} accessibilityLabel={L.title}>
      <ShareBody key={shareSheetKey(props.vehicleId, props.version)} {...props} sheet />
    </AppSheet>
  );
}

/** Le contenu de l'affiche à partager (écran de flux ou feuille). `visible` : l'aperçu se prépare seulement à l'écran. */
export function ShareBody({
  vehicleId,
  version,
  visible,
  onClose,
  sheet,
}: {
  vehicleId: string;
  /** `VehicleFull.shareVersion`. */
  version: string;
  visible: boolean;
  onClose: () => void;
  /** Dans la feuille : titre et bouton Fermer (l'écran de flux a les siens dans sa barre). */
  sheet?: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  const [format, setFormat] = useState<ShareFormat>("story");
  const [style, setStyle] = useState<ShareStyle>("night");
  const [prepared, setPrepared] = useState<Record<string, PreparedShare>>({});
  const [masks, setMasks] = useState<Record<string, PlateRect[]>>({});
  const [checks, setChecks] = useState<Record<string, PlateCheck>>({});
  const [found, setFound] = useState<Record<string, PlateRect[]>>({});
  const [loading, setLoading] = useState(false);
  const [showSafe, setShowSafe] = useState(false);
  const [busy, setBusy] = useState<"share" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ShareOutcome | "copied" | null>(null);
  const key = keyOf(format, style);
  const current = prepared[key];
  const check = checks[key];
  // Les adresses d'objet du web sont libérées à la fermeture.
  const kept = useRef(prepared);
  kept.current = prepared;
  useEffect(
    () => () => {
      for (const p of Object.values(kept.current)) releasePrepared(p);
    },
    [],
  );

  // Tour 3 (point 2) : le rendu et la vérification de la plaque sont deux étapes séparées. 1) Le rendu : l'affiche choisie,
  // demandée une fois à l'API et gardée tant que l'écran est ouvert (« La masquer » change `masks` et retire l'affiche :
  // le rendu masqué repart).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `prepared` est lu pour ne pas redemander une affiche déjà rendue
  useEffect(() => {
    if (!visible || prepared[key]) return;
    let cancelled = false;
    const zone = masks[key] ?? [];
    setLoading(true);
    setError(null);
    prepareShareImage(vehicleId, format, style, version, zone)
      .then((p) => {
        if (cancelled) return releasePrepared(p);
        setPrepared((all) => ({ ...all, [key]: p }));
      })
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [visible, key, vehicleId, version, masks]);

  // 2) La vérification : pour l'affiche affichée, si elle n'a pas encore de résultat. Interrompue (changement de style
  // ou de format), elle s'efface et reprend au retour sur cette variante : le partage ne reste jamais bloqué.
  const checksRef = useRef(checks);
  checksRef.current = checks;
  const shownUri = current?.uri;
  /** Tour 4 : « Vérifier à nouveau » relance la vérification de la variante affichée. */
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: l'état de la vérification est lu par `checksRef` (pas de boucle) ; `attempt` relance
  useEffect(() => {
    if (!visible || !shownUri) return;
    const done = checksRef.current[key];
    if (done && done !== "checking" && done !== "slow") return;
    if ((masks[key] ?? []).length) {
      setChecks((all) => ({ ...all, [key]: "masked" }));
      return;
    }
    let cancelled = false;
    setChecks((all) => ({ ...all, [key]: "checking" }));
    // Tour 4 : au-delà du délai, plus « en cours » mais « pas vérifiée » ; un résultat tardif s'applique encore.
    const timer = setTimeout(() => {
      if (!cancelled) setChecks((all) => (all[key] === "checking" ? { ...all, [key]: "slow" } : all));
    }, PLATE_CHECK_TIMEOUT_MS);
    const size = SHARE_SIZES[format];
    void detectSharePlates(shownUri, size.width, size.height)
      .catch(() => null)
      .then((plates) => {
        clearTimeout(timer);
        if (cancelled) return;
        if (plates === null) setChecks((all) => ({ ...all, [key]: "server" }));
        else if (plates.length === 0) setChecks((all) => ({ ...all, [key]: "clear" }));
        else {
          setFound((all) => ({ ...all, [key]: plates }));
          setChecks((all) => ({ ...all, [key]: "found" }));
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      // Interrompue (ou trop longue) : plus « en cours », elle repartira au retour.
      setChecks((all) => {
        if (all[key] !== "checking" && all[key] !== "slow") return all;
        const next = { ...all };
        delete next[key];
        return next;
      });
    };
  }, [visible, key, shownUri, masks, attempt]);

  function maskPlates() {
    const plates = found[key];
    if (!plates?.length) return;
    const old = prepared[key];
    setMasks((all) => ({ ...all, [key]: plates }));
    setPrepared((all) => {
      const next = { ...all };
      delete next[key];
      return next;
    });
    // La vérification repart sur l'affiche masquée (elle dira « Plaque masquée sur l'affiche. »).
    setChecks((all) => {
      const next = { ...all };
      delete next[key];
      return next;
    });
    if (old) releasePrepared(old);
  }

  async function send(kind: "share" | "save") {
    if (!current) return;
    setBusy(kind);
    setError(null);
    setOutcome(null);
    try {
      setOutcome(await sendShareImage(current, kind));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function shareLink() {
    const url = siteUrl(`/v/${vehicleId}`);
    setError(null);
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setOutcome("copied");
      } else {
        await Share.share({ message: url });
      }
    } catch {
      // Feuille fermée ou presse-papiers refusé : rien à dire.
    }
  }

  const width = PREVIEW_WIDTH[format];
  const height = Math.round((width * SHARE_SIZES[format].height) / SHARE_SIZES[format].width);
  const safe = format === "story" && showSafe;
  // Tour 4 : pas encore d'état = en cours ; le partage direct n'est possible qu'après une vérification aboutie.
  const { checking, blocked } = plateGate(check, Boolean(current));
  const plateLine = checking
    ? L.plateChecking
    : check === "clear"
      ? L.plateClear
      : check === "server"
        ? L.plateServer
        : check === "masked"
          ? L.plateMasked
          : check === "found"
            ? L.plateFound
            : check === "slow"
              ? L.plateSlow
              : null;

  return (
    <View style={styles.body}>
      {sheet ? (
        <View>
          <Text variant="posterM" color={c.ink}>
            {L.title}
          </Text>
          <Text variant="caption" color={c.inkMuted}>
            {L.subtitle}
          </Text>
        </View>
      ) : null}
      <View style={styles.segs}>
        <Seg
          testID="share-formats"
          options={shareFormats.map((f) => ({ value: f, label: shareFormatLabels[f] }))}
          value={format}
          onChange={(f) => {
            setFormat(f);
            setOutcome(null);
          }}
        />
        <Seg
          testID="share-styles"
          options={shareStyles.map((s) => ({ value: s, label: shareStyleLabels[s] }))}
          value={style}
          onChange={(s) => {
            setStyle(s);
            setOutcome(null);
          }}
        />
      </View>

      <View style={styles.affw}>
        <View
          testID="share-preview"
          style={[styles.preview, { width, height, backgroundColor: c.night, boxShadow: t.shadow.shadowPoster }]}
        >
          {current ? (
            <Image
              source={{ uri: current.uri }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              accessibilityLabel={`${L.title} · ${shareFormatLabels[format]} · ${shareStyleLabels[style]}`}
            />
          ) : loading ? (
            <View style={styles.center}>
              <OLoader size={56} tone="dark" label={null} />
              <Text variant="caption" color={c.nightInk}>
                {L.loading}
              </Text>
            </View>
          ) : null}
          {safe ? (
            <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="share-safe">
              {(
                [
                  { key: "top", height: height * SHARE_SAFE.top },
                  { key: "bottom", height: height * SHARE_SAFE.bottom },
                ] as const
              ).map((band) => (
                <View
                  key={band.key}
                  style={[
                    styles.band,
                    band.key === "top" ? { top: 0 } : { bottom: 0 },
                    { height: band.height, borderColor: c.accent, backgroundColor: `${c.night}b3` },
                  ]}
                >
                  <Text variant="credit" color={c.nightInk}>
                    {L.maskedByInstagram}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {plateLine ? (
          <View style={styles.check} testID="share-plate-check" accessibilityLiveRegion="polite">
            <Icon name={blocked ? "alert" : "shield"} size={16} color={blocked ? c.winText : c.accentText} />
            <Text variant="caption" color={blocked ? c.winText : c.inkMuted} style={styles.checkText}>
              {plateLine}
            </Text>
          </View>
        ) : null}
      </View>

      {format === "story" ? (
        <SmButton
          kind="g"
          icon="eye"
          onPress={() => setShowSafe((s) => !s)}
          style={styles.safeToggle}
          testID="share-safe-toggle"
        >
          {showSafe ? L.hideSafe : L.showSafe}
        </SmButton>
      ) : null}
      {/* Tour 2 : une plaque détectée, le bouton principal est « La masquer » ; partager reste possible, confirmé. */}
      {check === "found" ? (
        <View style={styles.row}>
          <SmButton kind="p" big icon="eyeOff" onPress={maskPlates} style={styles.grow} testID="share-plate-mask">
            {L.plateMask}
          </SmButton>
          <SmButton
            kind="s"
            big
            icon="share"
            disabled={!current || busy !== null}
            onPress={() => confirmShareAnyway(() => void send("share"))}
            testID="share-anyway"
          >
            {L.shareAnyway}
          </SmButton>
        </View>
      ) : null}
      {/* Tour 4 : vérification trop longue ; rien à masquer sans plaque repérée : la refaire, ou partager, confirmé. */}
      {check === "slow" ? (
        <View style={styles.row}>
          <SmButton
            kind="p"
            big
            icon="shield"
            onPress={() => setAttempt((n) => n + 1)}
            style={styles.grow}
            testID="share-plate-retry"
          >
            {L.plateRetry}
          </SmButton>
          <SmButton
            kind="s"
            big
            icon="share"
            disabled={!current || busy !== null}
            onPress={() => confirmShareAnyway(() => void send("share"), true)}
            testID="share-anyway"
          >
            {L.shareAnyway}
          </SmButton>
        </View>
      ) : null}
      <View style={[styles.row, blocked ? styles.hidden : null]}>
        <SmButton
          kind="p"
          big
          icon="share"
          disabled={!current || busy !== null || checking || blocked}
          onPress={() => void send("share")}
          style={styles.grow}
          testID="share-story"
        >
          {busy === "share" ? L.loading : checking ? L.plateCheckingShort : format === "story" ? L.story : L.post}
        </SmButton>
        <SmButton
          kind="s"
          big
          icon="gallery"
          disabled={!current || busy !== null || checking || blocked}
          onPress={() => void send("save")}
          accessibilityLabel={`${L.image} · ${shareFormatLabels[format]}`}
          testID="share-post"
        >
          {L.image}
        </SmButton>
        <SmButton
          kind="s"
          big
          icon="copy"
          onPress={() => void shareLink()}
          accessibilityLabel={L.copyLink}
          testID="share-link"
        />
      </View>
      {outcome === "saved" ? (
        <Text variant="caption" color={c.inkMuted}>
          {L.saved}
        </Text>
      ) : null}
      {outcome === "copied" ? (
        <Text variant="caption" color={c.inkMuted}>
          {L.linkCopied}
        </Text>
      ) : null}
      {outcome === "unavailable" ? (
        <Text variant="caption" color={c.inkMuted}>
          {L.unavailable}
        </Text>
      ) : null}
      {error ? (
        <Text variant="caption" color={c.winText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {sheet ? (
        <Button variant="plate" icon="back" onPress={onClose} fullWidth>
          Fermer
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: space2 + 6 },
  segs: { gap: space2 },
  affw: { alignItems: "center", gap: 10 },
  preview: { alignSelf: "center", maxWidth: "100%", borderRadius: 16, overflow: "hidden" },
  safeToggle: { alignSelf: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space1 },
  band: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderStyle: "dashed",
    gap: space2,
  },
  check: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", alignSelf: "stretch" },
  checkText: { flexShrink: 1 },
  row: { flexDirection: "row", gap: space2 },
  /** Le bouton « Copier le lien » : une icône seule, carré de 50 px (`.btn.btn-s` de la maquette). */
  square: { width: 50, paddingHorizontal: 0 },
  hidden: { display: "none" },
  grow: { flex: 1, alignSelf: "stretch" },
});
