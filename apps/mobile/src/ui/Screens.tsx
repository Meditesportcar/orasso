// Gabarits d'écran : le fond vivant, l'en-tête (AppBar) et la zone qui défile. Les zones de sécurité (encoche, barre de
// gestes) sont passées à l'en-tête et à la barre d'onglets, comme le demande le README du système de design.
import { AppBar, Ground, tokens, useTheme } from "@orasso/design-system/native";
import { useFocusEffect, useRouter } from "expo-router";
import { type ReactNode, useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSession } from "@/lib/session";
import { Muted } from "@/ui/Muted";
import { Avatar } from "./Avatar";
import { JournalSheet } from "./JournalSheet";

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

/** Écran d'un onglet : AppBar « page » (ou le logotype sur l'Accueil) avec Recherche, Cloche et Avatar. */
export function TabScreen({
  title,
  home = false,
  children,
  onRefresh,
  footer,
  still,
  overlays,
}: Common & { title?: string; home?: boolean }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { me, refreshMe } = useSession();
  const [journal, setJournal] = useState(false);
  // Compteurs de la cloche et du garage à jour à chaque retour sur un onglet.
  useFocusEffect(
    useCallback(() => {
      void refreshMe();
    }, [refreshMe]),
  );
  const bar = (
    <AppBar
      kind={home ? "home" : "page"}
      title={title}
      safeTop={insets.top}
      notificationCount={me?.counts.unreadNotifications}
      onSearch={() => router.navigate("/explorer")}
      onNotifications={() => setJournal(true)}
      notificationsOn={journal}
      onAvatar={() => router.push("/moi")}
      avatar={<Avatar url={me?.profile.avatarUrl} pseudo={me?.profile.pseudo} />}
    />
  );
  return (
    <Ground animated={!still} style={styles.fill}>
      {bar}
      <Body onRefresh={onRefresh}>{children}</Body>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
      {overlays}
      <JournalSheet visible={journal} onClose={() => setJournal(false)} />
    </Ground>
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
  const insets = useSafeAreaInsets();
  return (
    <Ground animated={!still} style={styles.fill}>
      <AppBar kind="flow" title={title} facts={facts} counter={counter} onClose={onClose} safeTop={insets.top} />
      <Body onRefresh={onRefresh}>{children}</Body>
      {footer ? <View style={[styles.footer, { paddingBottom: space3 + insets.bottom }]}>{footer}</View> : null}
      {overlays}
    </Ground>
  );
}

function Body({ children, onRefresh }: { children: ReactNode; onRefresh?: () => Promise<unknown> }) {
  const { t } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
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
      {children}
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
