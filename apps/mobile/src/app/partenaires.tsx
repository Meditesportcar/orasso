// « Voir tout » de « Ses partenaires » (lot R7m1, tour 2) : la liste complète des passionnés partenaires d'une fiche pro, 20
// par page. L'API décide de ce qui s'y trouve (connecté seulement ; compte privé non suivi : pseudo, photo et grade sans
// voiture). Une panne se dit avec « Réessayer » : jamais une liste vide à sa place.
import { Button, Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { gradeLabels, partnershipLabels as L, type PartnerOfPro } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";
import { Avatar } from "@/ui/Avatar";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { FlowScreen } from "@/ui/Screens";

const { space3 } = tokens.spacing;

export default function Partenaires() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { me } = useSession();
  const { pro } = useLocalSearchParams<{ pro?: string }>();
  const [items, setItems] = useState<PartnerOfPro[]>([]);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Une réponse arrivée après un autre chargement ou un changement de compte est jetée.
  const ticket = useRef(0);
  const account = me?.user.id ?? null;

  const load = useCallback(
    async (cursor?: string) => {
      if (!pro) return;
      const mine = ++ticket.current;
      setLoading(true);
      setError(null);
      try {
        const page = await api.proPartnersPage(pro, cursor);
        if (mine !== ticket.current) return;
        setItems((cur) => (cursor ? [...cur, ...page.items] : page.items));
        setTotal(page.total);
        setNext(page.nextCursor);
      } catch (e) {
        if (mine !== ticket.current) return;
        setError(errorMessage(e));
      } finally {
        if (mine === ticket.current) setLoading(false);
      }
    },
    [pro],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: `account` relance la lecture au changement de compte.
  useEffect(() => {
    setItems([]);
    setNext(null);
    void load();
  }, [load, account]);

  return (
    <FlowScreen
      title={L.partnersTitle}
      facts={total ? L.partnersCount(total) : undefined}
      onClose={() => (router.canGoBack() ? router.back() : router.replace(pro ? `/p/${pro}` : "/"))}
      onRefresh={() => load()}
    >
      {items.map((p) => (
        <Pressable
          key={p.pseudo}
          accessibilityRole="link"
          accessibilityLabel={p.pseudo}
          onPress={() => router.push(`/u/${encodeURIComponent(p.pseudo)}`)}
          style={[styles.row, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
          testID="pro-partner"
        >
          <Avatar url={p.avatarUrl} pseudo={p.pseudo} size={40} />
          <View style={styles.text}>
            <Text variant="bodyStrong" color={c.ink}>
              {p.pseudo}
            </Text>
            <Text variant="caption" color={c.inkMuted}>
              {[gradeLabels[p.grade], p.vehicle?.label].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <Icon name="next" size={16} color={c.inkMuted} />
        </Pressable>
      ))}
      {error ? (
        <LoadError message={error} onRetry={() => void load(items.length ? (next ?? undefined) : undefined)} />
      ) : null}
      {!error && loading ? <Muted variant="body">Chargement…</Muted> : null}
      {!error && !loading && !items.length ? <Muted variant="body">{L.partnersEmpty}</Muted> : null}
      {!error && !loading && next ? (
        <Button variant="secondary" icon="next" fullWidth onPress={() => void load(next)} testID="partners-more">
          Voir plus
        </Button>
      ) : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3, borderRadius: 14 },
  text: { flex: 1, gap: 2 },
});
