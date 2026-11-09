// Carte « Sponsorisé » du Fil (lot R7k2, maquette R7.6 `p-fil`) : une carte comme les autres, distinguée par l'étiquette
// « Sponsorisé » (contour, toujours visible, à la place de la ligne de raison), pas par la couleur. L'annonceur, l'image
// 4:5 (ou un bloc de texte sans image), le titre, le corps, la mention (« Publicité ») et le domaine d'un annonceur
// externe. Un seul bouton secondaire « Voir » : la fiche du pro dans l'appli, sinon le lien dans le navigateur (hors
// de l'appli). Jamais le bouton principal de l'écran, jamais de néon. L'affichage est compté quand 50 % de la carte (30 %
// d'une carte plus haute que la zone utile) est à la vue, une fois par emplacement et par session ; le clic est compté au toucher ; un refus
// de l'API (plafond atteint, emplacement arrêté) retire la carte.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  createDayWatcher,
  createImpressionWatcher,
  feedScreenLabels as L,
  parisDayOf,
  type SendOutcome,
  sponsoredSessionKeyForDay,
} from "@orasso/shared";
import { useIsFocused, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Image, Linking, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import { api } from "@/lib/api";
import { cacheScope } from "@/lib/kv";
import { mediaSource } from "@/lib/media";
import { SmButton } from "@/ui/Kit";
import { useScrollAssist } from "@/ui/ScrollAssist";
import { CardShell } from "./CardShell";
import { OrgLogo } from "./parts";
import { countsAsSeen, impressionSession, isImpressionRefused } from "./sponsoredSession";
import type { CardProps } from "./types";

const { space2, space3 } = tokens.spacing;

export function SponsoredCard({ card, onMenu, faded, onRemoved }: CardProps<"sponsored">) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const p = card.payload;
  const ref = useRef<View>(null);
  const focused = useIsFocused();
  const { height } = useWindowDimensions();
  const assist = useScrollAssist();
  const removed = useRef(onRemoved);
  removed.current = onRemoved;
  // Le jour de Paris, réactif (tour 3) : réévalué à minuit et au retour au premier plan ; la clé du comptage en dépend.
  const [day, setDay] = useState(() => parisDayOf(new Date()));
  useEffect(() => {
    const watcher = createDayWatcher({ onChange: setDay });
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") watcher.refresh();
    });
    return () => {
      sub.remove();
      watcher.stop();
    };
  }, []);
  const sessionKey = sponsoredSessionKeyForDay(cacheScope(), p.id, day);
  // Un emplacement déjà refusé dans cette session (plafond atteint, arrêté) ne se réaffiche pas : ni cette carte ni ses reprises.
  const refused = isImpressionRefused(sessionKey);
  useEffect(() => {
    if (refused) removed.current?.(card);
  }, [refused, card]);
  const sendImpression = useCallback(
    (_keepalive?: boolean): Promise<SendOutcome> =>
      api.sponsoredImpression(p.id, "feed").then(
        (): SendOutcome => ({ ok: true }),
        (e: { status?: number }): SendOutcome => ({ ok: false, status: e?.status }),
      ),
    [p.id],
  );

  // L'affichage : compté quand 50 % de la carte (30 % d'une carte plus haute que la zone utile) est à la vue, écran au
  // premier plan, une fois par session. La carte n'est comptée que pour sa partie visible, pas cachée sous la bande
  // ORASSO ou la barre d'onglets (`visibleArea`) ; la session est celle du compte et du jour de Paris. Après une panne
  // temporaire, la mesure repart (30 s, puis 60 s, trois essais) ; au changement de jour, elle repart avec la nouvelle clé.
  useEffect(() => {
    if (!focused || refused) return;
    let stopped = false;
    let disposed = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const watcher = createImpressionWatcher({
      session: impressionSession,
      key: sessionKey,
      send: sendImpression,
      onRefused: () => removed.current?.(card),
      rearm: () => start(),
    });
    const check = () => {
      // Affichage compté (ou écran quitté) : plus aucune mesure.
      if (stopped) {
        if (timer) clearInterval(timer);
        return;
      }
      ref.current?.measureInWindow((_x, y, _w, h) => {
        if (stopped) return;
        const count = (top: number, bottom: number) => {
          if (stopped || !countsAsSeen(y, h, top, bottom)) return;
          stopped = true;
          if (timer) clearInterval(timer);
          watcher.onSeen();
        };
        if (assist) assist.visibleArea(count);
        else count(0, height);
      });
    };
    function start() {
      if (disposed) return;
      stopped = false;
      if (timer) clearInterval(timer);
      check();
      timer = setInterval(check, 700);
    }
    start();
    return () => {
      disposed = true;
      stopped = true;
      watcher.dispose();
      clearInterval(timer);
    };
  }, [sessionKey, focused, refused, height, card, assist, sendImpression]);

  function open() {
    // Tour 3 : le clic n'est accepté par l'API qu'après l'affichage. Enregistré : le clic part tout de suite ; sinon,
    // l'affichage part d'abord (ou on attend celui qui est en cours, 3 s au plus), puis le clic. La navigation, elle,
    // n'attend rien.
    const key = sessionKey;
    const click = () => void api.sponsoredClick(p.id, "feed").catch(() => undefined);
    if (impressionSession.isRecorded(key)) click();
    else
      void impressionSession.beforeClick(key, sendImpression).then((r) => {
        if (r !== "refused") click();
      });
    if (p.pro) router.push(`/p/${p.pro.slug}`);
    else if (/^https?:\/\//i.test(p.linkUrl)) void Linking.openURL(p.linkUrl).catch(() => undefined);
  }

  if (refused) return null;
  const image = mediaSource(p.imageUrl);
  const mention = [p.disclosure, p.domain].filter(Boolean).join(" · ");
  return (
    <View ref={ref} collapsable={false}>
      <CardShell
        card={card}
        head={<OrgLogo url={p.pro?.logoUrl ?? null} name={p.advertiserName} />}
        title={p.advertiserName}
        reason={L.sponsoredTag}
        tag={L.sponsoredTag}
        onMenu={onMenu}
        onTitle={p.pro ? open : undefined}
        faded={faded}
        testID="feed-card-sponsored"
        actions={
          <>
            <View style={styles.grow} />
            <SmButton
              kind="s"
              icon="next"
              onPress={open}
              accessibilityLabel={L.seeAdFor(p.advertiserName)}
              testID="feed-sponsored-open"
            >
              {L.seeAd}
            </SmButton>
          </>
        }
      >
        {image ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={L.seeAdFor(p.advertiserName)}
            onPress={open}
            style={[styles.photo, { backgroundColor: c.night }]}
            testID="feed-sponsored-image"
          >
            <Image source={image} style={styles.img} resizeMode="cover" accessibilityIgnoresInvertColors />
          </Pressable>
        ) : (
          <View style={[styles.block, { backgroundColor: c.surfaceRaised }]} testID="feed-sponsored-block">
            <Text variant="posterM" color={c.ink}>
              {p.title}
            </Text>
          </View>
        )}
        {image ? (
          <Text variant="bodyStrong" color={c.ink} style={styles.text} testID="feed-sponsored-title">
            {p.title}
          </Text>
        ) : null}
        {p.body ? (
          <Text variant="body" color={c.ink} style={styles.text} testID="feed-sponsored-body">
            {p.body}
          </Text>
        ) : null}
        {mention ? (
          <Text variant="caption" color={c.inkMuted} testID="feed-sponsored-mention">
            {mention}
          </Text>
        ) : null}
      </CardShell>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  text: { fontSize: 14, lineHeight: 20 },
  photo: { aspectRatio: 4 / 5, borderRadius: tokens.radius.radiusMd + 2, overflow: "hidden" },
  img: { width: "100%", height: "100%" },
  // La maquette (`.r7adb`) : un bloc de 150 px, le titre en bas.
  block: {
    minHeight: 150,
    justifyContent: "flex-end",
    padding: space3,
    borderRadius: tokens.radius.radiusMd + 2,
    gap: space2,
  },
});
