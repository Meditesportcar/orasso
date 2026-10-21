// Gabarits d'écran : le fond vivant, l'en-tête (AppBar) et la zone qui défile. Les zones de sécurité (encoche, barre de
// gestes) sont passées à l'en-tête et à la barre d'onglets, comme le demande le README du système de design.
import { AppBar, Button, Ground, OliveActivityProvider, tokens, useTheme } from "@orasso/design-system/native";
import { useFocusEffect, useIsFocused, useRouter } from "expo-router";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SwipeEntry } from "@/features/nav/SwipeEntry";
import { useSession } from "@/lib/session";
import { Muted } from "@/ui/Muted";
import { useInInbox } from "./InboxScope";
import { JournalSheet } from "./JournalSheet";
import { KeyboardSafe } from "./KeyboardSafe";
import { OverlayProvider, OverlaySlot } from "./Overlay";
import { type ScrollAssist, ScrollAssistContext } from "./ScrollAssist";
import { TabTitle } from "./TabTitle";
import { TopBar } from "./TopBar";

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

/**
 * Écran d'un onglet (DA v2, lot 40) : la barre du haut v2 (logotype, pastille de casquette, Recherche, Boîte), puis le
 * grand titre sur une ligne (`BigTitle`, `facts` en étiquette à droite) en tête de la zone qui défile. L'onglet ouvert
 * par un glissement se gare depuis le côté (`SwipeEntry`). Sous `/boite` (la Boîte, hors de la barre d'onglets), la
 * pastille Boîte est allumée, ✕ ramène d'où l'on vient et les notifications (l'ancien Journal de la cloche) s'ouvrent
 * en tête de l'écran.
 */
export function TabScreen({
  title,
  facts,
  children,
  onRefresh,
  footer,
  still,
  overlays,
}: Common & { title?: string; facts?: string; home?: boolean }) {
  const { refreshMe, me } = useSession();
  const router = useRouter();
  const inInbox = useInInbox();
  // Lot 39 : le O vivant et le fond se mettent en pause quand l'écran n'est plus affiché.
  const focused = useIsFocused();
  const [journal, setJournal] = useState(false);
  // Compteurs de la Boîte et du garage, casquettes (un véhicule ajouté fait passer de visiteur à exposant) à jour à
  // chaque retour sur un onglet.
  useFocusEffect(
    useCallback(() => {
      void refreshMe();
    }, [refreshMe]),
  );
  const unread = me?.counts.unreadNotifications ?? 0;
  return (
    <OliveActivityProvider active={focused}>
      <OverlayProvider>
        <Ground animated={!still} style={styles.fill}>
          <TopBar
            inboxOn={inInbox}
            onClose={inInbox ? () => (router.canGoBack() ? router.back() : router.replace("/")) : undefined}
          />
          <SwipeEntry>
            <KeyboardSafe style={styles.fill}>
              <Body onRefresh={onRefresh}>
                {title ? <TabTitle title={title} label={facts} /> : null}
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
              {footer ? <View style={styles.footer}>{footer}</View> : null}
            </KeyboardSafe>
          </SwipeEntry>
          {overlays}
          <OverlaySlot />
          {inInbox ? <JournalSheet visible={journal} onClose={() => setJournal(false)} /> : null}
        </Ground>
      </OverlayProvider>
    </OliveActivityProvider>
  );
}

/** Écran de flux (candidature, ajout de véhicule, jour J) : monogramme, titre, ✕ Fermer en dernier. */
export function FlowScreen({
  title,
  facts,
  counter,
  onClose,
  children,
  footer,
  still,
  onRefresh,
  overlays,
}: Common & { title: string; facts?: string; counter?: string; onClose: () => void }) {
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  return (
    <OliveActivityProvider active={focused}>
      <OverlayProvider>
        <Ground animated={!still} style={styles.fill}>
          <AppBar kind="flow" title={title} facts={facts} counter={counter} onClose={onClose} safeTop={insets.top} />
          <KeyboardSafe style={styles.fill}>
            <Body onRefresh={onRefresh}>{children}</Body>
            {footer ? <View style={[styles.footer, { paddingBottom: space3 + insets.bottom }]}>{footer}</View> : null}
          </KeyboardSafe>
          {overlays}
          <OverlaySlot />
        </Ground>
      </OverlayProvider>
    </OliveActivityProvider>
  );
}

function Body({ children, onRefresh }: { children: ReactNode; onRefresh?: () => Promise<unknown> }) {
  const { t } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  // Lot 59c : une carte tient la page pendant ses gestes (`ScrollAssist`).
  const [held, setHeld] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);
  const assist = useMemo<ScrollAssist>(
    () => ({
      hold: (on) => setHeld(on),
      reveal: (view) => {
        // Après le rendu de la fiche : on mesure la page et la vue à l'écran, puis on défile de ce qui dépasse en bas.
        setTimeout(() => {
          const page = scroll.current?.getNativeScrollRef();
          if (!page || !view) return;
          page.measureInWindow((_px, py, _pw, ph) => {
            view.measureInWindow((_x, y, _w, h) => {
              const overflow = y + h - (py + ph);
              if (overflow > 0) scroll.current?.scrollTo({ y: offset.current + overflow + space3, animated: true });
            });
          });
        }, 80);
      },
    }),
    [],
  );
  return (
    <ScrollView
      ref={scroll}
      style={styles.fill}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      scrollEnabled={!held}
      scrollEventThrottle={32}
      onScroll={(e) => {
        offset.current = e.nativeEvent.contentOffset.y;
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
  section: { marginTop: space3 },
});
