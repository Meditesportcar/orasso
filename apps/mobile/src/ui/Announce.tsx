// Système d'annonces unique (lot M6, maquette 9.1, décision de Damien au retour 25) : tout ce qui arrive pendant qu'on
// utilise l'appli (retenue, liste d'attente, refus, place libérée, message, demande, accréditation, certification…)
// s'affiche dans un seul bandeau, en haut de l'écran, toujours au même endroit, environ 4 s (la barre du bas se vide) :
// toucher = ouvrir, glisser vers le haut = fermer. Deux tons : moutarde (bonne nouvelle, O d'Orasso), sobre (info).
// Pas de plein écran pour l'acceptation : le bandeau, et le ticket concerné pulse dans Sorties (`TicketPulse`). Le O
// vivant « succès » reste réservé à la fin d'une action faite par la personne. Une annonce à la fois, dans l'ordre.
// Mouvement réduit : fondu de 120 ms, barre de temps immobile.
import { Icon, type IconName, Text, tokens, useTheme } from "@orasso/design-system/native";
import { ANNOUNCE_MS, type AnnounceTone } from "@orasso/shared";
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PanResponder, Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { radiusPill } = tokens.radius;

export type Announcement = {
  /** Une même annonce n'est jamais montrée deux fois (identifiant de la notification, de la candidature…). */
  id: string;
  tone: AnnounceTone;
  title: string;
  text?: string;
  /** Icône du ton sobre ; une bonne nouvelle porte le O d'Orasso. */
  icon?: IconName;
  /** Toucher le bandeau : ouvrir ce qu'il annonce. */
  onOpen?: () => void;
};

// --- File d'attente (module : une seule pour toute l'appli) ------------------------------------------------------------
let queue: Announcement[] = [];
const seen = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

/** Annonce quelque chose (de n'importe quel écran). Rien ne se passe si cette annonce a déjà été montrée. */
export function announce(a: Announcement): void {
  if (seen.has(a.id)) return;
  seen.add(a.id);
  queue = [...queue, a];
  emit();
}

const dropFirst = () => {
  queue = queue.slice(1);
  emit();
};

/** Recette et tests : vide la file et l'historique. */
export function resetAnnouncements(): void {
  queue = [];
  seen.clear();
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// --- Ticket qui pulse dans Sorties ------------------------------------------------------------------------------------
let pulsing: { id: string; at: number } | null = null;
const pulseListeners = new Set<() => void>();

/** Le ticket de cette candidature pulse (deux battements) dans Sorties, s'il est à l'écran ou dès qu'il y arrive. */
export function pulseTicket(id: string): void {
  pulsing = { id, at: Date.now() };
  for (const l of pulseListeners) l();
}

const subscribePulse = (l: () => void) => {
  pulseListeners.add(l);
  return () => pulseListeners.delete(l);
};

/** Cadre autour d'un ticket : un liseré moutarde qui bat deux fois quand le ticket vient d'être annoncé. */
export function TicketPulse({ id, children }: { id: string; children: ReactNode }) {
  const { t, reducedMotion } = useTheme();
  const current = useSyncExternalStore(
    subscribePulse,
    () => pulsing,
    () => null,
  );
  const ring = useSharedValue(0);
  const at = current?.id === id ? current.at : null;
  useEffect(() => {
    if (at === null || Date.now() - at > 30_000) return;
    ring.value = reducedMotion
      ? withSequence(
          withTiming(1, { duration: 120 }),
          withTiming(1, { duration: 1600 }),
          withTiming(0, { duration: 120 }),
        )
      : withSequence(
          withTiming(1, { duration: 300 }),
          withTiming(0.25, { duration: 400 }),
          withTiming(1, { duration: 300 }),
          withTiming(0, { duration: 700 }),
        );
  }, [at, reducedMotion, ring]);
  const style = useAnimatedStyle(() => ({ opacity: ring.value }));
  return (
    <View testID={at !== null ? `ticket-pulse-${id}` : undefined}>
      {children}
      <Animated.View
        pointerEvents="none"
        style={[styles.ring, { borderColor: t.color.accent, boxShadow: `0 0 18px ${t.color.accent}` }, style]}
      />
    </View>
  );
}

// --- Le bandeau ------------------------------------------------------------------------------------------------------

/** Posé une fois à la racine de l'appli, au-dessus de tout (écrans, feuilles). */
export function AnnounceHost() {
  const current = useSyncExternalStore(
    subscribe,
    () => queue[0] ?? null,
    () => null,
  );
  // La clé remonte le bandeau à chaque annonce (minuteur et animations repartent de zéro).
  return current ? <Banner key={current.id} item={current} onDone={dropFirst} /> : null;
}

function Banner({ item, onDone }: { item: Announcement; onDone: () => void }) {
  const { t, reducedMotion } = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const good = item.tone === "good";
  const shown = useSharedValue(0);
  const timer = useSharedValue(1);
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);

  const leave = () => {
    if (done.current) return;
    done.current = true;
    setLeaving(true);
    shown.value = withTiming(0, { duration: reducedMotion ? 120 : 220, easing: Easing.in(Easing.quad) });
    setTimeout(onDone, reducedMotion ? 130 : 240);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: une fois, à l'arrivée du bandeau
  useEffect(() => {
    shown.value = reducedMotion
      ? withTiming(1, { duration: 120 })
      : withTiming(1, { duration: 500, easing: Easing.out(Easing.back(1.4)) });
    if (!reducedMotion) timer.value = withTiming(0, { duration: ANNOUNCE_MS, easing: Easing.linear });
    const auto = setTimeout(leave, ANNOUNCE_MS);
    return () => clearTimeout(auto);
  }, []);

  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_e, g) => {
        if (g.dy < -18) leave();
      },
    }),
  ).current;

  const style = useAnimatedStyle(() =>
    reducedMotion
      ? { opacity: shown.value }
      : { opacity: Math.min(1, shown.value * 2), transform: [{ translateY: (shown.value - 1) * 140 }] },
  );
  const timerStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: timer.value }] }));

  return (
    <Animated.View
      pointerEvents={leaving ? "none" : "box-none"}
      style={[styles.wrap, { top: insets.top + 8 }, style]}
      {...swipe.panHandlers}
    >
      <Pressable
        onPress={() => {
          item.onOpen?.();
          leave();
        }}
        accessibilityRole="button"
        accessibilityLiveRegion="polite"
        accessibilityLabel={item.text ? `${item.title}. ${item.text}` : item.title}
        accessibilityHint="Touche pour ouvrir, glisse vers le haut pour fermer"
        testID={`announce-${item.tone}`}
        style={[styles.ann, { backgroundColor: c.poster, boxShadow: t.shadow.shadowPoster }]}
      >
        <View
          style={[styles.ai, { backgroundColor: good ? c.accent : `${c.posterInk}24` }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Icon
            name={good ? "o" : (item.icon ?? "bell")}
            size={good ? 26 : 22}
            color={good ? c.accentInk : c.posterInk}
          />
        </View>
        <View style={styles.body}>
          <Text
            variant={good ? "posterS" : "bodyStrong"}
            color={c.posterInk}
            style={good ? styles.titleGood : styles.titleInfo}
          >
            {item.title}
          </Text>
          {item.text ? (
            <Text variant="caption" color={c.posterMuted} style={styles.text}>
              {item.text}
            </Text>
          ) : null}
        </View>
        <Icon name="next" size={18} color={c.posterMuted} />
        <Animated.View
          style={[styles.tm, { backgroundColor: good ? c.accent : c.posterMuted }, timerStyle]}
          pointerEvents="none"
        />
        <View style={[styles.grab, { backgroundColor: `${c.posterInk}40` }]} pointerEvents="none" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 10, right: 10, zIndex: 2000, elevation: 30 },
  ann: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 11,
    paddingBottom: 13,
    paddingHorizontal: 12,
    borderRadius: 18,
    overflow: "hidden",
  },
  ai: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, minWidth: 0 },
  titleGood: { fontSize: 16, lineHeight: 17 },
  titleInfo: { fontSize: 14.5, lineHeight: 18 },
  text: { fontSize: 12.5, lineHeight: 16, marginTop: 2 },
  tm: { position: "absolute", left: 0, right: 0, bottom: 0, height: 3, transformOrigin: "left" },
  grab: {
    position: "absolute",
    left: "50%",
    bottom: 6,
    width: 30,
    height: 3,
    marginLeft: -15,
    borderRadius: radiusPill,
  },
  ring: { position: "absolute", top: -3, right: -3, bottom: -3, left: -3, borderRadius: 20, borderWidth: 2 },
});
