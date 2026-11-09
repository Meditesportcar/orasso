// Carte « Sponsorisé » du Fil (lot R7k2, maquette R7.6 `p-fil`) : une carte comme les autres, distinguée par l'étiquette
// « Sponsorisé » (contour, toujours visible, à la place de la ligne de raison), pas par la couleur. L'annonceur, l'image
// 4:5 (ou un bloc de texte sans image), le titre, le corps, la mention (« Publicité ») et le domaine d'un annonceur
// externe. Un seul bouton secondaire « Voir » : la fiche du pro dans l'appli, sinon le lien dans le navigateur (hors
// de l'appli). Jamais le bouton principal de l'écran, jamais de néon. L'affichage est compté à l'apparition (au moins la
// moitié de la carte dans la fenêtre), une fois par emplacement et par session ; le clic est compté au toucher ; un refus
// de l'API (plafond atteint, emplacement arrêté) retire la carte.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { feedScreenLabels as L, sponsoredSessionKey } from "@orasso/shared";
import { useIsFocused, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Image, Linking, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import { api } from "@/lib/api";
import { cacheScope } from "@/lib/kv";
import { mediaSource } from "@/lib/media";
import { SmButton } from "@/ui/Kit";
import { useScrollAssist } from "@/ui/ScrollAssist";
import { CardShell } from "./CardShell";
import { OrgLogo } from "./parts";
import {
  claimImpression,
  countsAsSeen,
  isImpressionRefused,
  isRefusalStatus,
  refuseImpression,
  releaseImpression,
} from "./sponsoredSession";
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
  // Un emplacement déjà refusé dans cette session (plafond atteint, arrêté) ne se réaffiche pas : ni cette carte ni ses reprises.
  const refused = isImpressionRefused(sponsoredSessionKey(cacheScope(), p.id));
  useEffect(() => {
    if (refused) removed.current?.(card);
  }, [refused, card]);

  // L'affichage : compté quand la moitié de la carte est dans la fenêtre, écran au premier plan, une fois par session.
  // Tour 2 : la carte n'est comptée que si sa partie visible n'est pas cachée sous la bande ORASSO ou la barre d'onglets
  // (`visibleArea`) ; la session est celle du compte et du jour de Paris.
  useEffect(() => {
    if (!focused || refused) return;
    let stopped = false;
    const check = () =>
      ref.current?.measureInWindow((_x, y, _w, h) => {
        if (stopped) return;
        const count = (top: number, bottom: number) => {
          if (stopped || !countsAsSeen(y, h, top, bottom)) return;
          stopped = true;
          const key = sponsoredSessionKey(cacheScope(), p.id);
          if (!claimImpression(key)) return;
          api.sponsoredImpression(p.id, "feed").catch((e: { status?: number }) => {
            if (isRefusalStatus(e.status)) {
              refuseImpression(key);
              removed.current?.(card);
            } else releaseImpression(key);
          });
        };
        if (assist) assist.visibleArea(count);
        else count(0, height);
      });
    check();
    const timer = setInterval(check, 700);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [p.id, focused, refused, height, card, assist]);

  function open() {
    void api.sponsoredClick(p.id, "feed").catch(() => undefined);
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
