// Explorer, segment « Personnes et crews » (lot 19) : les crews, trouvables par leur nom et leur département (docs/01),
// et l'accès à mes crews. La fiche d'un crew s'ouvre au toucher. Lot 29 : pas de champ propre, le crew suit le texte et
// le département de la recherche de personnes du segment (un seul champ).
import { Button, Chip, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type CrewCard, crewLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle } from "@/ui/Screens";
import { CrewLogo } from "./CrewLogo";

const { space2, space3 } = tokens.spacing;

/** Un crew dans une liste (le nom ne se tronque pas). */
export function CrewRowNative({ crew, onPress }: { crew: CrewCard; onPress: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={crew.name} testID="crew-row">
      <Plate style={styles.row}>
        <CrewLogo url={crew.logoUrl} name={crew.name} size={44} />
        <View style={styles.text}>
          <Text variant="bodyStrong" color={t.color.plateInk}>
            {crew.name}
          </Text>
          <Text variant="caption" color={t.color.plateMuted}>
            {crew.department} · {crewLabels.membersCount(crew.membersCount)}
          </Text>
        </View>
      </Plate>
    </Pressable>
  );
}

export function CrewSearch({ q, department }: { q: string; department: string }) {
  const router = useRouter();
  const mine = useApi(() => api.myCrews(), []);
  const [items, setItems] = useState<CrewCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  useEffect(() => {
    const id = ++request.current;
    if (!q.trim() && !department) {
      setItems(null);
      return;
    }
    const timer = setTimeout(() => {
      api
        .searchCrews(q.trim(), department || undefined)
        .then((page) => {
          if (id !== request.current) return;
          setItems(page.items);
          setError(null);
        })
        .catch((e) => id === request.current && setError(errorMessage(e)));
    }, 300);
    return () => clearTimeout(timer);
  }, [q, department]);

  return (
    <View style={styles.col} testID="crew-search">
      <SectionTitle>{crewLabels.crews}</SectionTitle>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {!items ? <Muted variant="body">{crewLabels.searchIdle}</Muted> : null}
      {items && items.length === 0 ? <Muted variant="body">{crewLabels.searchEmpty}</Muted> : null}
      {items?.map((c) => (
        <CrewRowNative key={c.id} crew={c} onPress={() => router.push(`/crew/${c.slug}`)} />
      ))}
      {mine.data && mine.data.length > 0 ? (
        <>
          <Muted variant="label">{crewLabels.yourCrews}</Muted>
          <View style={styles.actions}>
            {mine.data.map((c) => (
              <Chip
                key={c.id}
                variant={c.role === "leader" ? "accent" : "default"}
                onPress={() => router.push(`/crew/${c.slug}`)}
              >
                {c.name}
              </Chip>
            ))}
          </View>
        </>
      ) : null}
      <Button variant="plate" icon="add" onPress={() => router.push("/crew/nouveau")} fullWidth testID="crew-new">
        {crewLabels.createCrew}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: space3 },
  row: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3 },
  text: { flex: 1, gap: 2 },
  actions: { flexDirection: "row", gap: space2 },
});
