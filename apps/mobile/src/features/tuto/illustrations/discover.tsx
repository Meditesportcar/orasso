// Illustrations « découvrir » : la carte et son épingle, la carte d'un événement avec sa souche de date (Explorer).
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { tutoArt } from "@orasso/shared";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { Card, DateStub, Enter, Grow, Row, Sm } from "../kit";

const { space2 } = tokens.spacing;
const radius = tokens.radius;

/** L'épingle moutarde du prototype (44 × 54), son cœur à l'encre moutarde. */
export function Pin({ size = 44 }: { size?: number }) {
  const { t } = useTheme();
  return (
    <Svg width={size} height={(size * 54) / 44} viewBox="0 0 44 54">
      <Path d="M22 52s-18-16-18-30a18 18 0 0 1 36 0c0 14-18 30-18 30z" fill={t.color.accent} />
      <Circle cx={22} cy={22} r={7} fill={t.color.accentInk} />
    </Svg>
  );
}

/** Une carte simplifiée : des routes en filet, l'épingle au centre, des points pour les autres adresses. */
export function MiniMap({ dots = [], children }: { dots?: readonly [number, number][]; children?: ReactNode }) {
  const { t } = useTheme();
  return (
    <View style={[styles.map, { backgroundColor: t.color.night, borderRadius: radius.radiusMd }]}>
      <Svg width="100%" height="100%" viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice">
        <Path d="M0 110 C80 90 120 130 190 100 S280 60 300 70" stroke={t.color.plateLine} strokeWidth={5} fill="none" />
        <Path d="M60 0 C70 50 110 70 120 150" stroke={t.color.plateLine} strokeWidth={3} fill="none" />
        <Path d="M220 0 C210 40 240 80 250 150" stroke={t.color.plateLine} strokeWidth={3} fill="none" />
        <Path d="M0 40 C60 30 140 50 300 20" stroke={t.color.plateLine} strokeWidth={2} fill="none" />
        {dots.map(([x, y]) => (
          <Circle key={`${x}-${y}`} cx={x * 3} cy={y * 1.5} r={5} fill={t.color.plateChip} />
        ))}
      </Svg>
      <View style={styles.pin}>
        <Enter kind="pop" delay={200}>
          <Pin />
        </Enter>
      </View>
      {children}
    </View>
  );
}

/** Explorer : la carte, l'épingle et la carte de l'événement avec sa souche de date. */
export function EventOnMap({ meta, extra }: { meta: string; extra?: ReactNode }) {
  const { event } = tutoArt;
  const { t } = useTheme();
  return (
    <>
      <MiniMap />
      <Enter kind="up" delay={500}>
        <Card>
          <Row>
            <DateStub weekday={event.weekday} day={event.day} month={event.month} />
            <Grow>
              <Text variant="posterS" color={t.color.plateInk}>
                {event.title}
              </Text>
              <Sm>{meta}</Sm>
            </Grow>
          </Row>
        </Card>
      </Enter>
      {extra}
    </>
  );
}

const styles = StyleSheet.create({
  map: { height: 150, overflow: "hidden", alignItems: "center", justifyContent: "center", gap: space2 },
  pin: { position: "absolute", alignSelf: "center", top: 36 },
});
