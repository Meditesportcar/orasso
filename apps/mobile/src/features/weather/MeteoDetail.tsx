// Détail de « Ma météo » (lot R8m, maquette R8.8 `meteoDetail`) : plein écran, mode B. Le ciel et la température, le ressenti,
// « Heure par heure » (six heures), « Vent » (vitesse, rafales, direction), « Pluie » (probabilité, hauteur), « Changer de
// lieu », « Second lieu » (masqué quand il y en a deux) et « Retirer ce lieu » (sur un lieu choisi). Attribution du
// fournisseur visible. Hors ligne : la dernière météo connue, sans erreur propre.
import { Icon, Text, tokens, useTheme, weatherIcons } from "@orasso/design-system/native";
import {
  BUSINESS_TIMEZONE,
  myWeatherTexts as L,
  type MyWeatherPlaces,
  type PlaceCoords,
  type PlaceWeather,
  placesAfterAdd,
  placesAfterChange,
  placesAfterRemove,
  WEATHER_PLACES_MAX,
  type WeatherCard,
  wallTime,
  weatherCards,
  weatherCodeLabels,
  windCompass,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { SmButton } from "@/ui/Kit";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { cardTitle } from "./MyWeatherBlock";
import { PlaceSheet } from "./PlaceSheet";
import { askMyPosition, forgetMyPosition, useWeatherPosition } from "./position";

const { space2, space3 } = tokens.spacing;

const hourOf = (iso: string) => wallTime(new Date(iso), BUSINESS_TIMEZONE).hour;

function Hours({ weather }: { weather: PlaceWeather }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.hours}
      testID="meteo-hours"
    >
      {weather.hours.map((h) => (
        <View
          key={h.time}
          style={[styles.hour, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
          accessible
          accessibilityLabel={`${L.hourLabel(hourOf(h.time))}, ${weatherCodeLabels[h.code]}, ${Math.round(h.temp)} degrés`}
        >
          <Text variant="caption" color={c.inkMuted}>
            {L.hourLabel(hourOf(h.time))}
          </Text>
          <Icon name={weatherIcons[h.code]} size={22} color={c.accentText} />
          <Text variant="numberNarrow" color={c.ink} style={styles.hourTemp}>
            {`${Math.round(h.temp)}°`}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

function Detail({ card }: { card: WeatherCard }) {
  const { t } = useTheme();
  const c = t.color;
  const w = card.weather;
  if (!w) {
    return (
      <Text variant="body" color={c.inkMuted} testID="meteo-unavailable">
        {L.unavailable}
      </Text>
    );
  }
  const now = w.now;
  return (
    <>
      <View
        style={[styles.big, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
        accessible
        accessibilityLabel={L.aria(cardTitle(card), weatherCodeLabels[now.code], Math.round(now.temp))}
        testID="meteo-now"
      >
        <Icon name={weatherIcons[now.code]} size={40} color={c.accentText} />
        <Text variant="numberNarrow" color={c.ink} style={styles.bigNum}>
          {`${Math.round(now.temp)}°`}
        </Text>
        <View style={styles.fill}>
          <Text variant="bodyStrong" color={c.ink}>
            {weatherCodeLabels[now.code]}
          </Text>
          <Text variant="caption" color={c.inkMuted}>
            {L.detailLine(now.feelsLike, now.windKmh, now.precipitationProbability)}
          </Text>
        </View>
      </View>

      {w.hours.length > 0 ? (
        <>
          <Text variant="label" color={c.inkMuted}>
            {L.hourByHour}
          </Text>
          <Hours weather={w} />
        </>
      ) : null}

      <View style={[styles.same, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}>
        <View style={styles.sameRow} testID="meteo-wind">
          <Icon name="weatherWind" size={18} color={c.inkMuted} />
          <View style={styles.fill}>
            <Text variant="body" color={c.ink}>
              <Text variant="bodyStrong" color={c.ink}>{`${L.wind} `}</Text>
              {L.windDetail(now.windKmh, now.gustKmh)}
            </Text>
          </View>
          {now.windDirection !== undefined ? (
            <Text variant="caption" color={c.inkMuted}>
              {windCompass(now.windDirection)}
            </Text>
          ) : null}
        </View>
        <View style={[styles.sameRow, styles.sameSplit, { borderTopColor: c.line }]} testID="meteo-rain">
          <Icon name="drop" size={18} color={c.inkMuted} />
          <View style={styles.fill}>
            <Text variant="body" color={c.ink}>
              <Text variant="bodyStrong" color={c.ink}>{`${L.rain} `}</Text>
              {L.rainDetail(now.precipitationProbability)}
            </Text>
          </View>
          <Text variant="caption" color={c.inkMuted}>
            {L.rainAmount(w.today.precipitationMm)}
          </Text>
        </View>
      </View>

      <Text variant="caption" color={c.inkMuted} testID="meteo-attribution">
        {w.attribution}
      </Text>
    </>
  );
}

export function MeteoDetail() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const params = useLocalSearchParams<{ card?: string }>();
  const places = useApi(() => api.myWeatherPlaces(), [], { cacheKey: "my-weather-places" });
  const { at } = useWeatherPosition();
  const [sheet, setSheet] = useState<"change" | "add" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data: MyWeatherPlaces | null = places.data;
  const cards = data ? weatherCards(data.places, at) : [];
  const wanted = Number.parseInt(params.card ?? "0", 10);
  const index = Number.isFinite(wanted) && wanted >= 0 && wanted < cards.length ? wanted : 0;
  const card = cards[index] ?? null;
  const canAdd = cards.length < WEATHER_PLACES_MAX;

  async function save(next: PlaceCoords[]) {
    setBusy(true);
    setError(null);
    try {
      const saved = await api.saveWeatherPlaces(next);
      places.setData(saved);
      setSheet(null);
    } catch (e) {
      setError(errorMessage(e) || L.savedFailed);
    }
    setBusy(false);
  }

  async function givePosition() {
    setBusy(true);
    setError(null);
    const ok = await askMyPosition();
    setBusy(false);
    // Refusée : la ville, sans message d'erreur.
    if (ok) setSheet(null);
  }

  return (
    <FlowScreen
      title={L.detailTitle}
      facts={card ? cardTitle(card) : undefined}
      onClose={() => router.back()}
      onRefresh={async () => {
        await places.reload();
      }}
      overlays={
        <PlaceSheet
          visible={sheet !== null}
          mode={sheet ?? "change"}
          busy={busy}
          onClose={() => setSheet(null)}
          onUsePosition={() => void givePosition()}
          onPick={(city) => {
            if (!data) return;
            if (sheet === "add") {
              void save(placesAfterAdd(data.places, city));
            } else {
              // La ville choisie remplace la carte ; la position gardée en mémoire est oubliée.
              forgetMyPosition();
              void save(placesAfterChange(data.places, card ?? { slot: null }, city));
            }
          }}
        />
      }
    >
      {places.offline ? <Notice>{L.offline}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {!data && places.error ? <Notice tone="error">{L.unavailable}</Notice> : null}
      {card ? <Detail card={card} /> : null}
      {data && !card ? (
        <Text variant="bodyStrong" color={c.ink} testID="meteo-empty">
          {L.choosePlace}
        </Text>
      ) : null}

      {data ? (
        <View style={styles.actions}>
          <SmButton kind="s" icon="place" onPress={() => setSheet("change")} testID="meteo-change" style={styles.fill}>
            {L.changePlace}
          </SmButton>
          {canAdd && card ? (
            <SmButton kind="s" icon="add" onPress={() => setSheet("add")} testID="meteo-second" style={styles.fill}>
              {L.secondPlace}
            </SmButton>
          ) : null}
        </View>
      ) : null}
      {data && card?.kind === "saved" && card.slot !== null ? (
        <SmButton
          kind="s"
          icon="trash"
          wide
          disabled={busy}
          onPress={() => {
            if (card.slot === null) return;
            void save(placesAfterRemove(data.places, card.slot)).then(() => router.back());
          }}
          testID="meteo-remove"
        >
          {L.removePlace}
        </SmButton>
      ) : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  big: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: tokens.radius.radiusLg,
  },
  bigNum: { fontSize: 44, lineHeight: 44 },
  hours: { gap: 8, paddingBottom: 2 },
  hour: {
    width: 62,
    alignItems: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: tokens.radius.radiusMd,
  },
  hourTemp: { fontSize: 16, lineHeight: 18 },
  same: { borderRadius: 14, overflow: "hidden" },
  sameRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12 },
  sameSplit: { borderTopWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: "row", gap: space2, alignItems: "center", paddingTop: space3 - space2 },
});
