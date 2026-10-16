// Widget météo (lot 28) : le jour, l'icône du kit, les températures, la pluie, le vent et l'attribution du fournisseur.
// Utilisé par le mode jour J et la page événement ; exporté pour le widget de l'Accueil (lot 30), qui lui donne la
// réponse de `GET /me/weather`. Aucun réseau ici : il affiche ce qu'on lui donne (le kit du jour J reste lisible
// hors ligne).
import { Icon, Plate, Text, useTheme, weatherIcons } from "@orasso/design-system/native";
import { type WeatherSummary, weatherCodeLabels, weatherTexts } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { temperatureRange } from "@/lib/weather";

export type WeatherWidgetProps = {
  summary: WeatherSummary;
  /** « Météo : Open-Meteo » : toujours affichée. */
  attribution: string;
  /** Titre de la plaque (défaut : « Météo à l'approche »). */
  title?: string;
};

const round = (n: number) => Math.round(n);

export function WeatherWidget({ summary, attribution, title = weatherTexts.upcomingTitle }: WeatherWidgetProps) {
  const { t } = useTheme();
  const c = t.color;
  const details = [
    summary.precipitationProbability !== null
      ? `${weatherTexts.rain} ${round(summary.precipitationProbability)} %`
      : summary.precipitationMm >= 0.5
        ? `${weatherTexts.rain} ${summary.precipitationMm.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} mm`
        : null,
    `${weatherTexts.wind} ${round(summary.windMaxKmh)} km/h`,
  ].filter((part): part is string => part !== null);
  const label = weatherCodeLabels[summary.code];
  return (
    <Plate
      accessible
      accessibilityLabel={`${title} : ${label}, ${temperatureRange(summary)}, ${details.join(", ")}. ${attribution}`}
      style={styles.plate}
    >
      <Text variant="meta" color={c.plateMuted}>
        {title}
      </Text>
      <View style={styles.row}>
        <Icon name={weatherIcons[summary.code]} size={40} color={c.plateInk} />
        <View style={styles.text}>
          <Text variant="number" color={c.plateInk}>
            {temperatureRange(summary)}
          </Text>
          <Text variant="bodyStrong" color={c.plateInk}>
            {label}
          </Text>
        </View>
      </View>
      <Text variant="body" color={c.plateMuted}>
        {details.join(" · ")}
      </Text>
      <Text variant="caption" color={c.plateMuted}>
        {attribution}
      </Text>
    </Plate>
  );
}

const styles = StyleSheet.create({
  plate: { gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  text: { flex: 1 },
});
