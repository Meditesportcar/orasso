// Onglet Crew (lot R7b2, D38, maquette R7.11) : le sélecteur de crew (« Roussillon Drift ▾ » quand j'en ai plusieurs ; le
// dernier ouvert revient, rangé par compte), puis le crew affiché (`CrewSpace` : Fil · Sorties · Membres · Spots et la
// Discussion) ; sans crew, « Rejoindre un crew » ou « Créer un crew » (`NoCrew`). Mode A : bande ORASSO et barre d'onglets.
// Un lien peut cibler un crew et un onglet (`/crew?crew=<adresse>&onglet=sorties`) : la page d'un crew dont je suis membre
// y renvoie.
import { tokens, useTheme } from "@orasso/design-system/native";
import { crewTabLabels as T } from "@orasso/shared";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { CrewFeedScroller } from "@/features/crews/feed/CrewFeed";
import { api } from "@/lib/api";
import { kvGet, kvSet } from "@/lib/kv";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { TabStage } from "@/ui/Screens";
import { CrewSelector } from "./CrewSelector";
import { CrewSpace } from "./CrewSpace";
import { crewLastKey, pickCrew } from "./crewTabModel";
import { NoCrew } from "./NoCrew";

const { space3, space4 } = tokens.spacing;

/** Place laissée sous le contenu d'un onglet (comme `TabScreen`) : la barre d'onglets flottante passe par-dessus. */
const TAB_BODY_BOTTOM = 150;

export function CrewTab() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { me } = useSession();
  const userId = me?.user.id ?? null;
  const params = useLocalSearchParams<{ crew?: string; onglet?: string }>();
  const crews = useApi(() => api.myCrews(), [], { cacheKey: "my-crews" });
  const list = crews.data;
  // Le dernier crew ouvert, relu à l'arrivée (`undefined` : pas encore lu) ; le choix est rangé sous le compte.
  const [last, setLast] = useState<string | null | undefined>(undefined);
  const [chosen, setChosen] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    setLast(undefined);
    setChosen(null);
    if (!userId) return;
    let alive = true;
    void kvGet(crewLastKey(userId)).then((v) => alive && setLast(v));
    return () => {
      alive = false;
    };
  }, [userId]);

  const current = useMemo(
    () => (list && last !== undefined ? pickCrew(list, chosen ?? params.crew, last) : null),
    [list, last, chosen, params.crew],
  );
  const slug = current?.slug ?? null;
  // Un crew montré (même choisi par un lien) devient « le dernier ouvert ».
  useEffect(() => {
    if (userId && slug) void kvSet(crewLastKey(userId), slug);
  }, [userId, slug]);
  const choose = useCallback((next: string) => {
    setChosen(next);
    setUnread(0);
  }, []);

  // Pour le fil : la zone qui défile est la mienne (la pastille « nouvelle publication » y remonte au haut du fil).
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollY = useRef(0);
  const scroller = useMemo<CrewFeedScroller>(
    () => ({
      scrollTo: (y, animated) => scrollRef.current?.scrollTo({ y, animated }),
      y: () => scrollY.current,
    }),
    [],
  );

  return (
    <TabStage>
      <ScrollView
        ref={scrollRef}
        style={styles.fill}
        contentContainerStyle={[styles.content, { paddingBottom: TAB_BODY_BOTTOM + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={32}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={t.color.accent}
            onRefresh={async () => {
              setRefreshing(true);
              try {
                await crews.reload();
                setRefreshKey((n) => n + 1);
              } finally {
                setRefreshing(false);
              }
            }}
          />
        }
        testID="crew-tab"
      >
        {!list && crews.error ? (
          <LoadError message={crews.error.message || T.loadError} onRetry={() => void crews.reload()} />
        ) : null}
        {!list && !crews.error ? <Muted variant="body">Chargement…</Muted> : null}
        {list && list.length === 0 ? <NoCrew /> : null}
        {list && current ? (
          <View style={styles.col}>
            <CrewSelector crews={list} current={current} unread={unread} onChoose={choose} />
            <CrewSpace
              key={current.slug}
              slug={current.slug}
              initialTab={chosen ? null : params.onglet}
              scroller={scroller}
              refreshKey={refreshKey}
              onLost={() => void crews.reload()}
              onLoaded={(view) => setUnread(view.space?.unreadCount ?? 0)}
            />
          </View>
        ) : null}
      </ScrollView>
    </TabStage>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: space4, paddingTop: space3, gap: space3 },
  col: { gap: space3 },
});
