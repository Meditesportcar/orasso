// « Changer de lieu » et « Second lieu » (lot R8m, maquette R8.8) : une feuille pour chercher une ville (`GET /geo/cities`) ou,
// pour « Changer de lieu », « Utiliser ma position ». La phrase « La position n'est jamais enregistrée… » est sous ce bouton.
import { Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import type { CitySuggestion, PlaceCoords } from "@orasso/shared";
import { myWeatherTexts as L } from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { AppSheet } from "@/ui/AppSheet";
import { SmButton } from "@/ui/Kit";

const { space2, space3 } = tokens.spacing;
const DEBOUNCE_MS = 300;

type Search = { state: "idle" | "loading" | "done" | "failed"; cities: CitySuggestion[] };

export function PlaceSheet({
  visible,
  mode,
  busy,
  onClose,
  onPick,
  onUsePosition,
}: {
  visible: boolean;
  /** `change` : « Changer de lieu » (avec « Utiliser ma position ») ; `add` : « Second lieu » (une ville seulement). */
  mode: "change" | "add";
  busy?: boolean;
  onClose: () => void;
  onPick: (city: PlaceCoords) => void;
  onUsePosition?: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<Search>({ state: "idle", cities: [] });
  const latest = useRef(0);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setSearch({ state: "idle", cities: [] });
    }
  }, [visible]);

  useEffect(() => {
    const q = query.trim();
    const run = ++latest.current;
    if (q.length < 2) {
      setSearch({ state: "idle", cities: [] });
      return undefined;
    }
    setSearch((s) => ({ ...s, state: "loading" }));
    const timer = setTimeout(() => {
      api
        .searchCities(q)
        .then((res) => {
          if (run === latest.current) setSearch({ state: "done", cities: res.cities });
        })
        .catch(() => {
          if (run === latest.current) setSearch({ state: "failed", cities: [] });
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <AppSheet
      visible={visible}
      onClose={onClose}
      accessibilityLabel={mode === "change" ? L.changePlace : L.secondPlace}
    >
      <Text variant="posterS" color={c.ink} accessibilityRole="header">
        {mode === "change" ? L.changePlace : L.secondPlace}
      </Text>
      <TextField
        label={L.searchPlaceholder}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={80}
        returnKeyType="search"
        testID="place-search"
      />
      {search.state === "idle" ? (
        <Text variant="caption" color={c.inkMuted}>
          {L.searchHint}
        </Text>
      ) : null}
      {search.state === "failed" ? (
        <Text variant="caption" color={c.inkMuted} testID="place-search-failed">
          {L.searchFailed}
        </Text>
      ) : null}
      {search.state === "done" && search.cities.length === 0 ? (
        <Text variant="caption" color={c.inkMuted} testID="place-search-empty">
          {L.searchEmpty}
        </Text>
      ) : null}
      <View style={styles.results}>
        {search.cities.map((city, i) => (
          <Pressable
            key={`${city.label}-${city.lat}-${city.lng}`}
            onPress={() => onPick({ label: city.label.replace(/ \(\w+\)$/, ""), lat: city.lat, lng: city.lng })}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={city.label}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard },
              pressed && styles.pressed,
            ]}
            testID={`place-result-${i}`}
          >
            <Text variant="bodyStrong" color={c.ink}>
              {city.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {mode === "change" && onUsePosition ? (
        <View style={styles.gps}>
          <SmButton kind="s" icon="target" wide disabled={busy} onPress={onUsePosition} testID="place-use-position">
            {L.useMyPosition}
          </SmButton>
          <Text variant="caption" color={c.inkMuted}>
            {L.positionNote}
          </Text>
        </View>
      ) : null}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  results: { gap: 8 },
  row: { padding: 12, borderRadius: tokens.radius.radiusMd },
  pressed: { opacity: 0.85 },
  gps: { gap: space2, paddingTop: space3 - space2 },
});
