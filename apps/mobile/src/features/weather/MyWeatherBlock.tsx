// Bloc « Ma météo » de l'Accueil (lot R8m, maquette R8.8 `meteoBlock`) : une carte par lieu, deux au plus, côte à côte. Le nom
// du lieu et sa source (« Perpignan · ma position », « Perpignan · ta ville », ou le nom seul d'une ville choisie), la
// température, « Vent 18 km/h · pluie 5 % ». Toucher une carte ouvre le détail. Sans position donnée : « Utiliser ma
// position » (jamais enregistrée) ; refusée, la météo reste celle de la ville, sans message d'erreur.
import { Icon, Text, tokens, useTheme, weatherIcons } from "@orasso/design-system/native";
import {
  homeWidgetTitles,
  myWeatherTexts as L,
  type MyWeatherPlaces,
  type WeatherCard,
  weatherCards,
  weatherCodeLabels,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { SecH } from "@/features/home/fanBlocks";
import { SmButton } from "@/ui/Kit";
import { askMyPosition, refreshMyPosition, useWeatherPosition } from "./position";

const { space2, space3 } = tokens.spacing;

/** Le nom du lieu et sa source, tels que la carte les écrit. */
export function cardTitle(card: Pick<WeatherCard, "kind" | "label">): string {
  return L.place(card.label, card.kind === "position" ? "position" : card.kind === "city" ? "city" : "saved");
}

/** Une carte `.r8mw` : lieu, icône et température, vent et pluie. */
export function MyWeatherCard({ card, index, onOpen }: { card: WeatherCard; index: number; onOpen: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  const w = card.weather;
  const title = cardTitle(card);
  const sky = w ? weatherCodeLabels[w.now.code] : null;
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={w && sky ? L.aria(title, sky, Math.round(w.now.temp)) : `${L.title}, ${title}`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard },
        pressed && styles.pressed,
      ]}
      testID={`my-weather-card-${index}`}
    >
      <Text variant="label" color={c.inkMuted}>
        {title}
      </Text>
      {w ? (
        <>
          <View style={styles.temp}>
            <Icon name={weatherIcons[w.now.code]} size={26} color={c.accentText} />
            <Text variant="numberNarrow" color={c.ink} style={styles.tempNum}>
              {`${Math.round(w.now.temp)}°`}
            </Text>
          </View>
          <Text variant="caption" color={c.inkMuted}>
            {L.windRain(w.now.windKmh, w.now.precipitationProbability)}
          </Text>
        </>
      ) : (
        <Text variant="caption" color={c.inkMuted}>
          {L.unavailable}
        </Text>
      )}
    </Pressable>
  );
}

export function MyWeatherBlock({ myWeather }: { myWeather: MyWeatherPlaces | null }) {
  const router = useRouter();
  const { at, busy } = useWeatherPosition();
  // Retour sur l'Accueil : la météo de la position gardée en mémoire est relue (rien n'est redemandé à l'appareil).
  useEffect(() => {
    void refreshMyPosition();
  }, []);
  if (!myWeather) return null;
  const cards = weatherCards(myWeather.places, at);
  const open = (index: number) => router.push(`/meteo?card=${index}` as never);
  return (
    <View style={styles.wrap} testID="home-weather">
      <SecH title={homeWidgetTitles.weather} />
      {cards.length === 0 ? (
        <SmButton kind="s" icon="place" wide onPress={() => open(0)} testID="my-weather-choose">
          {L.choosePlace}
        </SmButton>
      ) : (
        <View style={styles.row}>
          {cards.map((card, i) => (
            <View key={card.key} style={styles.cell}>
              <MyWeatherCard card={card} index={i} onOpen={() => open(i)} />
            </View>
          ))}
        </View>
      )}
      {!at && cards.length > 0 ? (
        <View style={styles.gps}>
          <SmButton
            kind="s"
            icon="target"
            disabled={busy}
            onPress={() => void askMyPosition()}
            testID="my-weather-use-position"
          >
            {L.useMyPosition}
          </SmButton>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space2 },
  row: { flexDirection: "row", gap: 8, alignItems: "stretch" },
  cell: { flex: 1, minWidth: 0 },
  card: {
    flexGrow: 1,
    gap: 3,
    padding: 12,
    borderRadius: tokens.radius.radiusLg,
    justifyContent: "flex-start",
  },
  pressed: { opacity: 0.85 },
  temp: { flexDirection: "row", alignItems: "center", gap: 8 },
  tempNum: { fontSize: 28, lineHeight: 30 },
  gps: { alignItems: "flex-start", paddingTop: space3 - space2 },
});
