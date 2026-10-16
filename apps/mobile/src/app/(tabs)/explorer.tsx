// Explorer : le segment Événements en liste simple (recherche et format) et le segment « Personnes et crews » (lot 17 :
// recherche de personnes ; lot 19 : crews). La carte et les Pros viennent plus tard.

import { Button, Chip, ChipRow, Photo, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { type EventCard, type EventFormat, eventFormatLabels, eventFormats, socialLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { CrewSearch } from "@/features/crews/CrewSearch";
import { PeopleSearch } from "@/features/social/PeopleSearch";
import { api } from "@/lib/api";
import { formatDay, formatHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";

const { space1, space3 } = tokens.spacing;

export default function Explorer() {
  const { t } = useTheme();
  const router = useRouter();
  const [segment, setSegment] = useState<"evenements" | "personnes">("evenements");
  const [q, setQ] = useState("");
  const [format, setFormat] = useState<EventFormat | null>(null);
  const [items, setItems] = useState<EventCard[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    try {
      const page = await api.events({ q: q.trim() || undefined, format: format ?? undefined, limit: 20 });
      if (id !== request.current) return;
      setItems(page.items);
      setCursor(page.nextCursor);
      setError(null);
    } catch (e) {
      if (id === request.current) setError(errorMessage(e));
    }
  }, [q, format]);

  // Recherche différée : on attend une pause de frappe avant d'interroger l'API.
  useEffect(() => {
    const timer = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [q, load]);

  async function more() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await api.events({ q: q.trim() || undefined, format: format ?? undefined, limit: 20, cursor });
      setItems((current) => [...(current ?? []), ...page.items]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }

  const segments = (
    <ChipRow>
      <Chip selected={segment === "evenements"} onPress={() => setSegment("evenements")}>
        {socialLabels.segmentEvents}
      </Chip>
      <Chip selected={segment === "personnes"} onPress={() => setSegment("personnes")}>
        {socialLabels.segmentPeople}
      </Chip>
    </ChipRow>
  );

  if (segment === "personnes") {
    return (
      <TabScreen title="Explorer">
        {segments}
        <PeopleSearch />
        <CrewSearch />
      </TabScreen>
    );
  }

  return (
    <TabScreen title="Explorer" onRefresh={load}>
      {segments}
      <TextField
        label="Recherche"
        placeholder="Nom d'événement, ville…"
        value={q}
        onChangeText={setQ}
        autoCapitalize="none"
        returnKeyType="search"
      />
      <ChipRow>
        <Chip selected={format === null} onPress={() => setFormat(null)}>
          Tous
        </Chip>
        {eventFormats.map((f) => (
          <Chip key={f} selected={format === f} onPress={() => setFormat(format === f ? null : f)}>
            {eventFormatLabels[f]}
          </Chip>
        ))}
      </ChipRow>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {items === null && !error ? <Muted variant="body">Chargement…</Muted> : null}
      {items?.length === 0 ? (
        <Muted variant="body">Aucun événement ne correspond. Essaie un autre format ou une autre recherche.</Muted>
      ) : null}

      {items?.map((event) => (
        <Pressable
          key={event.id}
          accessibilityRole="link"
          accessibilityLabel={event.title}
          onPress={() => router.push(`/e/${event.slug}`)}
        >
          <Plate style={styles.row}>
            <Photo
              source={mediaSource(event.posterUrl)}
              placeholder={`linear-gradient(135deg, ${t.color.surfaceRaised} 0%, ${t.color.night} 100%)`}
              cut="thumb"
              style={styles.thumb}
            />
            <View style={styles.body}>
              <Text variant="label" color={t.color.plateMuted}>
                {eventFormatLabels[event.format]}
                {event.outlook === "uncertain" ? " · Incertain" : ""}
                {event.status === "cancelled" ? " · Annulé" : ""}
              </Text>
              <Text variant="posterM" color={t.color.plateInk}>
                {event.title}
              </Text>
              <Text variant="meta" color={t.color.plateMuted}>
                {formatDay(event.startsAt)} · {formatHour(event.startsAt)}
                {event.city ? ` · ${event.city}` : ""}
              </Text>
              <Text variant="meta" color={t.color.plateMuted}>
                {event.remaining === null
                  ? "Places libres"
                  : event.remaining > 0
                    ? `${event.remaining} places`
                    : "Complet"}
              </Text>
            </View>
          </Plate>
        </Pressable>
      ))}
      {cursor ? (
        <Button variant="secondary" icon="add" loading={loadingMore} onPress={() => void more()} fullWidth>
          Voir plus
        </Button>
      ) : null}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space3, padding: space3, alignItems: "center" },
  thumb: { width: 84, height: 84, borderRadius: 8 },
  body: { flex: 1, gap: space1 },
});
