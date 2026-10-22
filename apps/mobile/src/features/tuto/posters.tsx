// Le O d'Orasso (`oSvg('mono')`) et les trois affiches de la Nocturne que l'assistant génère dans le tuto de
// l'organisateur (artefact : `posterHTML`, gabarits `neon`, `jdm` et `flyer`, unités `cqw` = côté / 100).
import { textStyles } from "@orasso/design-system/native";
import { Platform, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { FILL, useArt } from "./art";
import { Photo } from "./scenes";

const P_O =
  "M69.19 101.74Q49.85 101.74 36.12 96.66Q22.38 91.57 15.04 81.98Q7.7 72.38 7.7 58.87Q7.7 47.38 11.41 37.57Q15.12 27.76 21.8 20.35Q31.69 9.59 47.02 3.92Q62.35 -1.74 81.54 -1.74Q100.87 -1.74 114.61 3.42Q128.34 8.58 135.68 18.17Q143.02 27.76 143.02 41.42Q143.02 53.05 139.17 63.01Q135.32 72.97 128.34 80.38Q118.6 90.84 103.27 96.29Q87.94 101.74 69.19 101.74ZM56.2 29L102.2 29C110.49 29 116.02 35.72 114.56 44L112.44 56C110.98 64.28 103.08 71 94.8 71L48.8 71C40.51 71 34.98 64.28 36.44 56L38.56 44C40.02 35.72 47.92 29 56.2 29Z";
const SKEW = "translate(75.5 50) skewX(-10) translate(-75.5 -50)";

/**
 * Couleurs propres aux gabarits d'affiche (celles du générateur d'affiches de l'API) ; la nuit, la crème et la moutarde
 * viennent des jetons (`night`, `photo-ink`, `accent`, identiques dans les deux thèmes).
 */
const POSTER = {
  jdmPaper: "#e8e2d4",
  sun: "#c8322b",
  flyerPaper: "#efe4c9",
  flyerInk: "#2a2018",
  white: "#ffffff",
} as const;

/** Le O d'Orasso, voiture garée moutarde (`data-o="mono"`), de la couleur `color`. */
export function OMono({ size, color, car }: { size: number; color: string; car?: string }) {
  const a = useArt();
  return (
    <Svg width={size} height={size} viewBox="-7.3 -25 150 150">
      <G transform="translate(-7.7 0)">
        <Path d={P_O} fill={color} fillRule="evenodd" />
        <G transform={SKEW}>
          <Rect x={82.1} y={33} width={4.5} height={34} rx={2} fill={car ?? a.accent} />
          <Rect x={42.5} y={36} width={66} height={28} rx={11.2} fill={car ?? a.accent} />
        </G>
      </G>
    </Svg>
  );
}

const serif = Platform.select({ ios: "Georgia", default: "serif" });

/** Une affiche carrée de `size` px. */
export function Poster({ tpl, size }: { tpl: "neon" | "jdm" | "flyer"; size: number }) {
  const a = useArt();
  const q = size / 100;
  const display = textStyles.posterL.fontFamily;
  const narrow = textStyles.numberNarrow.fontFamily;
  const label = textStyles.label.fontFamily;
  const sig = (color: string) => (
    <View style={[pz.sig, { right: 4 * q, bottom: 3 * q, gap: 1.4 * q }]}>
      <OMono size={Math.max(8, 6 * q)} color={color} car={a.accent} />
      <Text style={{ fontFamily: label, fontSize: Math.max(5, 3.2 * q), letterSpacing: 0.5, color }}>ORASSO</Text>
    </View>
  );
  if (tpl === "neon")
    return (
      <View style={[pz.box, { width: size, height: size, backgroundColor: a.night }]}>
        <Photo m="supra" style={FILL} />
        <Svg style={FILL} viewBox="0 0 10 10" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="pzn" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#000" stopOpacity={0.15} />
              <Stop offset="0.35" stopColor="#000" stopOpacity={0} />
              <Stop offset="0.82" stopColor="#0a0a0c" stopOpacity={0.92} />
            </LinearGradient>
          </Defs>
          <Rect width={10} height={10} fill="url(#pzn)" />
        </Svg>
        <View
          style={[
            pz.bar,
            { height: 1.4 * q, backgroundColor: a.accent, boxShadow: `0 0 ${4 * q}px rgba(233,184,36,.8)` },
          ]}
        />
        <View
          style={[
            pz.dt,
            {
              left: 5 * q,
              top: 4 * q,
              paddingHorizontal: 2.6 * q,
              paddingTop: 1.6 * q,
              paddingBottom: q,
              backgroundColor: a.accent,
            },
          ]}
        >
          <Text style={{ fontFamily: narrow, fontSize: 15 * q, lineHeight: 13 * q, color: a.night }}>24</Text>
          <Text style={{ fontFamily: label, fontSize: 3.4 * q, color: a.night, letterSpacing: 0.4 }}>OCT</Text>
        </View>
        <Text
          style={[
            pz.ti,
            {
              left: 5 * q,
              right: 5 * q,
              bottom: 13 * q,
              fontFamily: display,
              fontSize: 11 * q,
              lineHeight: 10 * q,
              color: a.paper,
            },
          ]}
        >
          NOCTURNE DE CANET
        </Text>
        <Text style={[pz.abs, { left: 5 * q, bottom: 7 * q, fontFamily: label, fontSize: 3.6 * q, color: a.accent }]}>
          SAM · 19 H · PORT DE CANET
        </Text>
        {sig(a.paper)}
      </View>
    );
  if (tpl === "jdm")
    return (
      <View style={[pz.box, { width: size, height: size, backgroundColor: POSTER.jdmPaper }]}>
        <Photo m="supra" style={[FILL, { left: "30%" }]} />
        <View
          style={[
            pz.abs,
            {
              right: 8 * q,
              top: 6 * q,
              width: 22 * q,
              height: 22 * q,
              borderRadius: 11 * q,
              backgroundColor: POSTER.sun,
            },
          ]}
        />
        <Text
          numberOfLines={1}
          style={[
            pz.abs,
            {
              width: 88 * q,
              left: 4 * q - 36.5 * q,
              bottom: 6 * q + 36.5 * q,
              transform: [{ rotate: "-90deg" }],
              fontFamily: display,
              fontSize: 14 * q,
              lineHeight: 13 * q,
              color: a.night,
            },
          ]}
        >
          NOCTURNE DE CANET
        </Text>
        <View style={[pz.abs, { right: 5 * q, bottom: 10 * q, alignItems: "flex-end" }]}>
          <Text style={{ fontFamily: narrow, fontSize: 16 * q, lineHeight: 14 * q, color: a.paper }}>24.10</Text>
          <Text style={{ fontFamily: label, fontSize: 3.4 * q, color: a.paper }}>19 H · PORT DE CANET</Text>
        </View>
        {sig(a.paper)}
      </View>
    );
  return (
    <View style={[pz.box, { width: size, height: size, backgroundColor: POSTER.flyerPaper }]}>
      <Text
        style={[
          pz.abs,
          {
            left: 6 * q,
            right: 6 * q,
            top: 5 * q,
            fontFamily: serif,
            fontWeight: "700",
            fontSize: 10 * q,
            lineHeight: 9.5 * q,
            color: POSTER.flyerInk,
            transform: [{ rotate: "-3deg" }],
          },
        ]}
      >
        {"MéditeSportCar présente\nla Nocturne !"}
      </Text>
      <Text
        style={[
          pz.abs,
          {
            right: 6 * q,
            top: 24 * q,
            fontFamily: serif,
            fontSize: 3 * q,
            backgroundColor: POSTER.sun,
            color: POSTER.white,
            paddingHorizontal: 2 * q,
            paddingVertical: q,
            transform: [{ rotate: "8deg" }],
          },
        ]}
      >
        Gratuit
      </Text>
      <View
        style={[
          pz.abs,
          pz.flyerPhoto,
          { borderWidth: 1.4 * q, borderColor: POSTER.white, boxShadow: `0 ${q}px ${3 * q}px rgba(0,0,0,.3)` },
        ]}
      >
        <Photo m="supra" style={FILL} />
      </View>
      <Text
        style={[
          pz.abs,
          {
            left: 8 * q,
            right: 8 * q,
            bottom: 6 * q,
            fontFamily: serif,
            fontSize: 3.6 * q,
            lineHeight: 5.2 * q,
            color: POSTER.flyerInk,
          },
        ]}
      >
        {
          "19 h ouverture · 20 h 30 photo de groupe\n22 h musique coupée · 23 h 30 fin\nPartenaires : Atelier Têt, Café Garage 66"
        }
      </Text>
    </View>
  );
}

const pz = StyleSheet.create({
  box: { overflow: "hidden" },
  abs: { position: "absolute" },
  sig: { position: "absolute", flexDirection: "row", alignItems: "center", opacity: 0.9, zIndex: 5 },
  bar: { position: "absolute", left: "-10%", right: "-10%", top: "52%", transform: [{ rotate: "-10deg" }] },
  dt: { position: "absolute", alignItems: "center", transform: [{ skewX: "-8deg" }] },
  ti: { position: "absolute", fontStyle: "italic" },
  flyerPhoto: { left: "8%", right: "8%", top: "30%", bottom: "34%", transform: [{ rotate: "2deg" }] },
});
