// Le calque des meutes du fond « battle » (lot 39, V14) : une paire (parfois un train de trois) toutes les 9 à 14 s, qui
// entre par un bord, enchaîne ses virages en glisse et ressort. Entre deux meutes, rien ne tourne : pas d'horloge
// image par image, seulement une minuterie. Opacité 18 % (Béton) / 10 % (Sable).

import { useEffect, useState } from "react";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { battle } from "../../motion";
import { useTheme } from "../theme";
import { type BattlePath, battleDuration, battlePath, type PackCar, poseAt, seededRandom, tandem } from "./path";
import { CarTop, carBox, useOliveClock } from "./shared";

type Pack = BattlePath & { cars: PackCar[]; speed: number };
const MAX_CARS = 3;
const between = (random: () => number, [a, b]: readonly [number, number]) => a + random() * (b - a);

function BattleCar({
  index,
  pack,
  clock,
  color,
}: {
  index: number;
  pack: SharedValue<Pack | null>;
  clock: SharedValue<number>;
  color: string;
}) {
  const box = carBox(battle.carLength);
  const style = useAnimatedStyle(() => {
    "worklet";
    const p = pack.value;
    const car = p?.cars[index];
    if (!p || !car) return { opacity: 0 };
    const s = (clock.value * p.speed) / 1000 - car.lag;
    if (s < 0 || s > p.length) return { opacity: 0 };
    const pose = poseAt(p, s, car.side);
    return {
      opacity: 1,
      transform: [
        { translateX: pose.x - box.width / 2 },
        { translateY: pose.y - box.height / 2 },
        { rotate: `${pose.heading}rad` },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.car, { width: box.width, height: box.height }, style]}>
      <CarTop length={battle.carLength} color={color} />
    </Animated.View>
  );
}

/** Les meutes, tant que `running` (écran au focus, appli au premier plan, pas de feuille, animations permises). */
export function BattleLayer({ running }: { running: boolean }) {
  const { t, theme } = useTheme();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [live, setLive] = useState(false);
  const pack = useSharedValue<Pack | null>(null);
  const clock = useOliveClock(live && running);

  useEffect(() => {
    if (!running || !size.w || !size.h) {
      pack.value = null;
      setLive(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const spawn = () => {
      const seed = Math.floor(Math.random() * 2147483647);
      const random = seededRandom(seed ^ 0x5bd1e995);
      const path = battlePath(seed, size.w, size.h);
      const train = random() < battle.trainChance;
      const cars = tandem(path, train ? battle.spacing.train : battle.spacing.pair, train ? MAX_CARS : 2);
      const speed = between(random, battle.speed);
      clock.value = 0;
      pack.value = { ...path, cars, speed };
      setLive(true);
      timer = setTimeout(
        () => {
          setLive(false);
          pack.value = null;
          timer = setTimeout(spawn, between(random, battle.gap));
        },
        battleDuration(path, cars, speed),
      );
    };
    timer = setTimeout(spawn, battle.firstDelay);
    return () => {
      if (timer) clearTimeout(timer);
      pack.value = null;
      setLive(false);
    };
  }, [running, size.w, size.h, pack, clock]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (Math.abs(width - size.w) > 1 || Math.abs(height - size.h) > 1) setSize({ w: width, h: height });
  };
  const colors = [t.color.accent, t.color.poster, t.color.accent];
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity: battle.opacity[theme] }]}
      onLayout={onLayout}
    >
      {running &&
        colors.map((color, i) => (
          <BattleCar key={color + String(i)} index={i} pack={pack} clock={clock} color={color} />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  car: { position: "absolute", left: 0, top: 0 },
});
