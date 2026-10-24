// Gabarits d'écran : le fond vivant, l'en-tête et la zone qui défile. Les zones de sécurité (encoche, barre de gestes)
// sont passées à l'en-tête et à la barre d'onglets, comme le demande le README du système de design.
// Lot M7 (deux modes d'affichage, règle de Damien du 23/10) : un écran est soit
//   (A) une page d'un groupe d'onglets : `TabScreen` (ou `TabStage` sans zone qui défile), la bande ORASSO posée par le
//       layout du groupe en haut, la barre d'onglets en bas ;
//   (B) une fiche, un plein écran ou un parcours : `FlowScreen` (ou `PosterFlow` pour une fiche à affiche), l'en-tête
//       de fiche (`FicheHeader`) et jamais de barre d'onglets.
// Un `TabScreen` rendu hors d'un groupe d'onglets (garde d'une page sortie du groupe, Boîte de la structure) passe de
// lui-même en mode B : aucune page sans bande, aucune bande en double.
import {
  Button,
  GradientFill,
  Ground,
  Icon,
  OliveActivityProvider,
  TAB_BAR_SPACE,
  tokens,
  useFlowChrome,
  useTheme,
  withAlpha,
} from "@orasso/design-system/native";
import { useFocusEffect, useIsFocused, useRouter } from "expo-router";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SwipeEntry } from "@/features/nav/SwipeEntry";
import { usePersona } from "@/lib/persona";
import { landingOf } from "@/lib/personaModel";
import { useSession } from "@/lib/session";
import { Muted } from "@/ui/Muted";
import { FicheHeader } from "./FicheHeader";
import { useInInbox } from "./InboxScope";
import { JournalSheet } from "./JournalSheet";
import { KeyboardSafe } from "./KeyboardSafe";
import { OverlayProvider, OverlaySlot } from "./Overlay";
import { revealOffset, type ScrollAssist, ScrollAssistContext } from "./ScrollAssist";
import { endReached } from "./scrollEnd";
import { TabTitle } from "./TabTitle";
import { TopBar, useInTabs, useTabBandRefresh } from "./TopBar";

const { space2, space3, space4, space6 } = tokens.spacing;

type Common = {
  children: ReactNode;
  /** Glisser pour recharger. */
  onRefresh?: () => Promise<unknown>;
  /** Zone fixe sous le contenu (bouton principal de l'écran). */
  footer?: ReactNode;
  /** Fond immobile (modes terrain : jour J, staff). */
  still?: boolean;
  /** Feuilles de l'écran : posées sur toute la surface de l'écran, hors de la zone qui défile. */
  overlays?: ReactNode;
};

/** Place laissée sous le contenu d'un onglet (`.scr .body { padding-bottom: 150px }` de l'artefact) : barre
 * d'onglets flottante et accès flottant passent par-dessus. */
const TAB_BODY_BOTTOM = 150;

/** Lot M3 : délai de la relecture du profil à l'arrivée sur un onglet (après l'affichage de la page). */
const REFRESH_AFTER_FOCUS_MS = 400;

type TabProps = Common & { title?: string; facts?: string; home?: boolean };

/**
 * Écran d'un onglet, mode A (DA v2, lot 40 ; lot C1 : fond de l'artefact, barre flottante par-dessus le contenu) : la
 * bande ORASSO du groupe d'onglets (logotype, pastille de casquette, Recherche, Boîte), puis le grand titre sur une ligne
 * (`BigTitle`, `facts` en étiquette à droite) en tête de la zone qui défile. L'onglet ouvert par un glissement se gare
 * depuis le côté (`SwipeEntry`) : seule la page glisse, la bande reste fixe. Hors d'un groupe d'onglets : mode B.
 */
export function TabScreen(props: TabProps) {
  return useInTabs() ? <TabPage {...props} /> : <OutsideTabs {...props} />;
}

/** Relit le profil (compteurs de la Boîte, casquettes) à chaque arrivée sur un onglet. */
function useRefreshOnFocus() {
  const { refreshMe } = useSession();
  // Lot M7, tour 2 : et le compteur de la Boîte de la structure, s'il a pu changer depuis sa dernière lecture.
  const refreshBand = useTabBandRefresh();
  // Compteurs de la Boîte et du garage, casquettes (un véhicule ajouté fait passer de visiteur à exposant) à jour à
  // chaque retour sur un onglet.
  // Lot M3 : un peu après l'arrivée sur l'onglet, pour que la page s'affiche d'abord (la relecture du profil
  // redessine toute l'appli).
  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => {
        void refreshMe();
        refreshBand();
      }, REFRESH_AFTER_FOCUS_MS);
      return () => clearTimeout(timer);
    }, [refreshMe, refreshBand]),
  );
}

function TabPage({ title, facts, children, onRefresh, footer, still, overlays }: TabProps) {
  // Lot 39 : le O vivant et le fond se mettent en pause quand l'écran n'est plus affiché.
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  useRefreshOnFocus();
  return (
    <OliveActivityProvider active={focused}>
      <OverlayProvider>
        <Ground still={still} paused={!focused} style={styles.fill}>
          <TopBar />
          <SwipeEntry>
            <KeyboardSafe style={styles.fill}>
              <Body onRefresh={onRefresh} bottom={footer ? space6 : TAB_BODY_BOTTOM + insets.bottom}>
                {title ? <TabTitle title={title} label={facts} /> : null}
                {children}
              </Body>
              {footer ? (
                // Le bouton fixe de l'écran reste au-dessus de la barre d'onglets flottante.
                <View style={[styles.footer, { paddingBottom: TAB_BAR_SPACE + insets.bottom + space2 }]}>{footer}</View>
              ) : null}
            </KeyboardSafe>
          </SwipeEntry>
          {overlays}
          <OverlaySlot />
        </Ground>
      </OverlayProvider>
    </OliveActivityProvider>
  );
}

/**
 * Page d'onglet sans zone qui défile (Tri : la pile de cartes occupe l'écran), mode A : même bande, même fond, la page
 * se gare au glissement. Les feuilles (`overlays`) passent au-dessus de la bande.
 */
export function TabStage({
  children,
  still,
  overlays,
}: {
  children: ReactNode;
  still?: boolean;
  overlays?: ReactNode;
}) {
  const focused = useIsFocused();
  useRefreshOnFocus();
  return (
    <OliveActivityProvider active={focused}>
      <OverlayProvider>
        <Ground still={still} paused={!focused} style={styles.fill}>
          <TopBar />
          <SwipeEntry>{children}</SwipeEntry>
          {overlays}
          <OverlaySlot />
        </Ground>
      </OverlayProvider>
    </OliveActivityProvider>
  );
}

/**
 * Un gabarit d'onglet rendu hors d'un groupe d'onglets (garde d'une page de l'organisateur sortie du groupe, écran
 * d'attente) : mode B, le titre dans l'en-tête de fiche, ✕ revient d'où l'on vient (sinon au premier écran de la
 * casquette).
 */
function OutsideTabs({ title, facts, children, onRefresh, footer, still, overlays }: TabProps) {
  const router = useRouter();
  const { persona } = usePersona();
  const close = () => (router.canGoBack() ? router.back() : router.replace(landingOf(persona) as never));
  return (
    <FlowScreen
      title={title ?? ""}
      facts={facts}
      onClose={close}
      onRefresh={onRefresh}
      footer={footer}
      still={still}
      overlays={overlays}
    >
      {children}
    </FlowScreen>
  );
}

/**
 * Écran de flux, mode B (candidature, ajout de véhicule, jour J, réglages, pages hors onglets) : l'en-tête de fiche
 * (`.flowbar` de l'artefact : titre ou bande, ✕ Fermer en dernier). Lot C1 : affiché dans un groupe d'onglets (pages
 * masquées), il retire la barre d'onglets et l'accès flottant (`.app.is-flow`) ; il ne porte jamais la bande ORASSO.
 * Sous la Boîte de la structure (`InboxScope`), les notifications (l'ancien Journal de la cloche) s'ouvrent en tête.
 */
export function FlowScreen({
  title,
  facts,
  counter,
  band,
  onClose,
  closeLabel,
  children,
  footer,
  still,
  onRefresh,
  overlays,
  header,
  endGate,
}: Common & {
  title: string;
  facts?: string;
  counter?: string;
  /** Lot M7 : une bande à la place du titre dans l'en-tête de fiche (l'organisateur). */
  band?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  /** Lot M1 : zone fixe sous l'en-tête, qui ne défile pas (barre de progression, fiche en construction). */
  header?: ReactNode;
  /** Lot R3a : le bas de la page doit être vu (voir `EndGate`). */
  endGate?: EndGate;
}) {
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const inInbox = useInInbox();
  const { me } = useSession();
  const [journal, setJournal] = useState(false);
  useFlowChrome(focused);
  const unread = me?.counts.unreadNotifications ?? 0;
  return (
    <OliveActivityProvider active={focused}>
      <OverlayProvider>
        <Ground still={still} paused={!focused} style={styles.fill}>
          <FicheHeader
            title={title}
            facts={facts}
            counter={counter}
            band={band}
            onClose={onClose}
            closeLabel={closeLabel}
          />
          {header ? <View style={styles.flowHeader}>{header}</View> : null}
          <KeyboardSafe style={styles.fill}>
            <Body onRefresh={onRefresh} endGate={endGate}>
              {inInbox ? (
                <Button
                  variant="plate"
                  icon="bell"
                  next
                  fullWidth
                  onPress={() => setJournal(true)}
                  testID="inbox-journal"
                >
                  {unread > 0 ? `Notifications · ${unread}` : "Notifications"}
                </Button>
              ) : null}
              {children}
            </Body>
            {footer ? <View style={[styles.footer, { paddingBottom: space3 + insets.bottom }]}>{footer}</View> : null}
          </KeyboardSafe>
          {overlays}
          <OverlaySlot />
          {inInbox ? <JournalSheet visible={journal} onClose={() => setJournal(false)} /> : null}
        </Ground>
      </OverlayProvider>
    </OliveActivityProvider>
  );
}

/**
 * Lot R3a (retour 3 de Damien) : une page dont le bas doit être vu avant de continuer (étape d'un parcours plus haute
 * que l'écran). `key` : la page affichée (une nouvelle page repart en haut et se remesure) ; `locked` : pas encore vue ;
 * `onSeen` : son bas est visible, ou presque ; `label` : l'indicateur discret qui invite à descendre (lecture d'écran).
 */
export type EndGate = { key: string | number; locked: boolean; onSeen: () => void; label: string };

/** Délai après lequel une nouvelle page de même hauteur que la précédente garde l'ancienne mesure. */
const REMEASURE_MS = 250;
/** Temps pendant lequel le bas doit rester visible pour que la page compte comme vue. */
const SETTLE_MS = 300;

function Body({
  children,
  onRefresh,
  bottom,
  endGate,
}: {
  children: ReactNode;
  onRefresh?: () => Promise<unknown>;
  /** Marge sous le contenu (onglets : place de la barre flottante). */
  bottom?: number;
  endGate?: EndGate;
}) {
  const { t } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  // Lot 59c : une carte tient la page pendant ses gestes (`ScrollAssist`).
  const [held, setHeld] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);
  // Lot R3a : mesures de la page pour `endGate` (hauteur visible, hauteur du contenu ; 0 = à remesurer).
  const viewport = useRef(0);
  const content = useRef(0);
  const lastContent = useRef(0);
  const [atEnd, setAtEnd] = useState(true);
  const gate = useRef(endGate);
  gate.current = endGate;
  // Le bas doit rester visible un court instant : une mise en page passagère (premier rendu, polices, en-tête qui se
  // pose) ne débloque pas l'étape.
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkEnd = useCallback(() => {
    const g = gate.current;
    if (!g) return;
    const reached = endReached({ offset: offset.current, viewport: viewport.current, content: content.current });
    // L'indicateur ne se montre qu'une fois la page mesurée et plus haute que l'écran.
    setAtEnd(reached || !(content.current > 0) || !(viewport.current > 0));
    if (settle.current) clearTimeout(settle.current);
    settle.current = null;
    if (reached && g.locked) {
      settle.current = setTimeout(() => {
        settle.current = null;
        const now = gate.current;
        const still = endReached({ offset: offset.current, viewport: viewport.current, content: content.current });
        if (now?.locked && still) now.onSeen();
      }, SETTLE_MS);
    }
  }, []);
  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );
  const gateKey = endGate?.key;
  const gateLocked = endGate?.locked;
  // Nouvelle page : elle repart en haut et sa hauteur se remesure (sinon celle de la page d'avant la débloquerait).
  // biome-ignore lint/correctness/useExhaustiveDependencies: seul le changement de page relance la mesure
  useEffect(() => {
    if (gateKey === undefined) return;
    offset.current = 0;
    scroll.current?.scrollTo({ y: 0, animated: false });
    content.current = 0;
    setAtEnd(true);
    const timer = setTimeout(() => {
      if (content.current === 0) content.current = lastContent.current;
      checkEnd();
    }, REMEASURE_MS);
    return () => clearTimeout(timer);
  }, [gateKey]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: un verrou posé ou levé relit la position
  useEffect(() => {
    checkEnd();
  }, [gateLocked]);
  const assist = useMemo<ScrollAssist>(
    () => ({
      hold: (on) => setHeld(on),
      reveal: (view) => {
        // Après le rendu de la fiche : on mesure la page et la vue à l'écran, puis on défile (`revealOffset`).
        setTimeout(() => {
          const page = scroll.current?.getNativeScrollRef();
          if (!page || !view) return;
          page.measureInWindow((_px, pageY, _pw, pageH) => {
            view.measureInWindow((_x, viewY, _w, viewH) => {
              const y = revealOffset({ offset: offset.current, pageY, pageH, viewY, viewH, margin: space3 });
              if (y !== null) scroll.current?.scrollTo({ y, animated: true });
            });
          });
        }, 80);
      },
    }),
    [],
  );
  const page = (
    <ScrollView
      ref={scroll}
      style={styles.fill}
      contentContainerStyle={[styles.content, bottom !== undefined ? { paddingBottom: bottom } : null]}
      keyboardShouldPersistTaps="handled"
      scrollEnabled={!held}
      scrollEventThrottle={32}
      // Lot 59c, tour 2 : filet de sécurité, plus aucun doigt sur la page = elle défile de nouveau.
      onTouchEnd={(e) => {
        if (e.nativeEvent.touches.length === 0) setHeld(false);
      }}
      onTouchCancel={() => setHeld(false)}
      onScroll={(e) => {
        offset.current = e.nativeEvent.contentOffset.y;
        if (gate.current) checkEnd();
      }}
      onLayout={(e) => {
        viewport.current = e.nativeEvent.layout.height;
        if (gate.current) checkEnd();
      }}
      onContentSizeChange={(_w, h) => {
        content.current = h;
        lastContent.current = h;
        if (gate.current) checkEnd();
      }}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            enabled={!held}
            refreshing={refreshing}
            tintColor={t.color.accent}
            onRefresh={async () => {
              setRefreshing(true);
              try {
                await onRefresh();
              } finally {
                setRefreshing(false);
              }
            }}
          />
        ) : undefined
      }
    >
      <ScrollAssistContext.Provider value={assist}>{children}</ScrollAssistContext.Provider>
    </ScrollView>
  );
  if (!endGate) return page;
  const ground = t.color.ground;
  return (
    <View style={styles.fill}>
      {page}
      {/* Lot R3a : indicateur discret et immobile (rien à réduire en mouvement réduit) : un fondu en bas de la page et
          une petite flèche ; la toucher fait descendre. */}
      {endGate.locked && !atEnd ? (
        <View style={styles.endHint} pointerEvents="box-none" testID="flow-end-hint">
          <GradientFill css={`linear-gradient(180deg, ${withAlpha(ground, 0)} 0%, ${withAlpha(ground, 0.88)} 100%)`} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={endGate.label}
            onPress={() => scroll.current?.scrollToEnd({ animated: true })}
            hitSlop={12}
            style={[styles.endArrow, { backgroundColor: t.color.surface, borderColor: t.color.line }]}
            testID="flow-end-arrow"
          >
            <Icon name="down" size={18} color={t.color.inkMuted} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/** Intitulé de section (« À venir », « Passés · carnet de route ») : étiquette étroite en capitales. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Muted variant="label" style={styles.section} accessibilityRole="header">
      {children}
    </Muted>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: space4, paddingTop: space3, paddingBottom: space6 * 2, gap: space3 },
  footer: { paddingHorizontal: space4, paddingTop: space2, gap: space2 },
  flowHeader: { paddingHorizontal: space4, gap: space3, paddingBottom: space2 },
  section: { marginTop: space3 },
  endHint: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: space2,
  },
  endArrow: {
    width: 32,
    height: 32,
    borderRadius: tokens.radius.radiusPill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
