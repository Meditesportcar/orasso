// Le nuancier de la fiche technique (lot M1, correction de Damien sur la maquette 1.6 : « plus beau que des vignettes,
// et plus de choix »). De vraies teintes de carrosserie rangées par famille (`bodyColors` de `@orasso/shared`) : une
// rangée de familles qui défile, puis les pastilles de la famille, assez grandes, avec le reflet de leur finition
// (vernie, métallisée, nacrée, mate, bicolore, à effet) et le nom de la teinte dessous. « Autre teinte » : saisie libre.
import { Icon, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  BODY_COLOR_LIGHT,
  BODY_COLOR_SHADE,
  type BodyColor,
  type BodyColorFamily,
  bodyColorByName,
  bodyColorFamilies,
  bodyColors,
  mixHex,
  vehicleAddLabels as V,
} from "@orasso/shared";
import { useId, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";

import { FieldLabel } from "./parts";

const { space1, space2, space3 } = tokens.spacing;
const SWATCH = 48;

export function ColorPicker({
  value,
  custom,
  onChange,
}: {
  value: string | undefined;
  /** « Autre teinte » ouvert (saisie libre). */
  custom: boolean;
  onChange: (color: string | undefined, custom: boolean) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const known = custom ? null : bodyColorByName(value);
  const [family, setFamily] = useState<BodyColorFamily>(known?.family ?? "white");
  const shown = bodyColors.filter((b) => b.family === family);
  const summary = custom
    ? value || V.colorOther
    : known
      ? `${known.name} · ${V.colorFinish[known.finish]}`
      : V.colorPick;
  return (
    <View style={styles.wrap} testID="vehicle-colors">
      <FieldLabel
        aside={
          <Text variant="caption" color={known || (custom && value) ? c.ink : c.inkMuted} testID="vehicle-color-name">
            {summary}
          </Text>
        }
      >
        {V.color}
      </FieldLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.families}>
        {bodyColorFamilies.map((f) => {
          const on = !custom && family === f;
          const dots = bodyColors.filter((b) => b.family === f).slice(0, 3);
          return (
            <Pressable
              key={f}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={V.colorFamilies[f]}
              onPress={() => {
                setFamily(f);
                if (custom) onChange(undefined, false);
              }}
              testID={`vehicle-color-family-${f}`}
              style={[
                styles.family,
                { borderColor: on ? c.accent : c.line, backgroundColor: c.surface },
                on ? styles.familyOn : null,
              ]}
            >
              <View style={styles.dots}>
                {dots.map((d) => (
                  <View key={d.name} style={[styles.dot, { backgroundColor: d.hex, borderColor: c.surface }]} />
                ))}
              </View>
              <Text variant="bodyStrong" color={on ? c.ink : c.inkMuted} style={styles.familyText}>
                {V.colorFamilies[f]}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: custom }}
          accessibilityLabel={V.colorOther}
          onPress={() => onChange(custom ? undefined : known ? "" : (value ?? ""), !custom)}
          testID="vehicle-color-other"
          style={[
            styles.family,
            { borderColor: custom ? c.accent : c.line, borderStyle: custom ? "solid" : "dashed" },
            custom ? styles.familyOn : null,
          ]}
        >
          <Icon name="edit" size={14} color={custom ? c.ink : c.inkMuted} />
          <Text variant="bodyStrong" color={custom ? c.ink : c.inkMuted} style={styles.familyText}>
            {V.colorOther}
          </Text>
        </Pressable>
      </ScrollView>
      {custom ? (
        <TextField
          label={V.colorOtherLabel}
          value={value ?? ""}
          onChangeText={(text) => onChange(text, true)}
          placeholder={V.colorOtherPlaceholder}
          maxLength={40}
          testID="vehicle-color-custom"
        />
      ) : (
        <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel={V.colorFamilies[family]}>
          {shown.map((b) => {
            const on = known?.name === b.name;
            return (
              <Pressable
                key={b.name}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                aria-checked={on}
                accessibilityLabel={`${b.name}, ${V.colorFinish[b.finish]}`}
                onPress={() => onChange(on ? undefined : b.name, false)}
                testID={`vehicle-color-${b.name}`}
                style={styles.cell}
              >
                <View style={[styles.ring, { borderColor: on ? c.accent : "transparent" }]}>
                  <Swatch color={b} />
                </View>
                <Text variant="caption" color={on ? c.ink : c.inkMuted} style={styles.name} numberOfLines={2}>
                  {b.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** Une pastille de peinture : la teinte, son dégradé selon la finition, et le reflet du vernis (sauf le mat). */
export function Swatch({ color, size = SWATCH }: { color: BodyColor; size?: number }) {
  const { t } = useTheme();
  const id = `sw${useId().replaceAll(":", "")}`;
  const r = size / 2 - 1.5;
  const mid = size / 2;
  const { hex, hex2 = hex, finish } = color;
  const fill = finish === "duo" ? null : finish === "gloss" || finish === "matte" ? hex : `url(#${id}b)`;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        {finish === "metal" ? (
          <LinearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={mixHex(hex, BODY_COLOR_LIGHT, 0.35)} />
            <Stop offset="0.55" stopColor={hex} />
            <Stop offset="1" stopColor={mixHex(hex, BODY_COLOR_SHADE, 0.45)} />
          </LinearGradient>
        ) : null}
        {finish === "pearl" ? (
          <LinearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={mixHex(hex, BODY_COLOR_LIGHT, 0.3)} />
            <Stop offset="0.5" stopColor={hex} />
            <Stop offset="0.8" stopColor={hex2} />
            <Stop offset="1" stopColor={mixHex(hex, BODY_COLOR_SHADE, 0.3)} />
          </LinearGradient>
        ) : null}
        {finish === "chameleon" ? (
          <LinearGradient id={`${id}b`} x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor={hex} />
            <Stop offset="0.5" stopColor={hex2} />
            <Stop offset="1" stopColor={mixHex(hex, BODY_COLOR_LIGHT, 0.25)} />
          </LinearGradient>
        ) : null}
        <RadialGradient id={`${id}g`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={BODY_COLOR_LIGHT} stopOpacity={0.75} />
          <Stop offset="1" stopColor={BODY_COLOR_LIGHT} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {finish === "duo" ? (
        <>
          <Path d={`M${mid - r} ${mid}A${r} ${r} 0 0 1 ${mid + r} ${mid}Z`} fill={hex} />
          <Path d={`M${mid - r} ${mid}A${r} ${r} 0 0 0 ${mid + r} ${mid}Z`} fill={hex2} />
        </>
      ) : (
        <Circle cx={mid} cy={mid} r={r} fill={fill ?? hex} />
      )}
      {finish === "matte" ? null : (
        <Ellipse cx={mid * 0.72} cy={mid * 0.6} rx={r * 0.5} ry={r * 0.3} fill={`url(#${id}g)`} />
      )}
      <Circle cx={mid} cy={mid} r={r} fill="none" stroke={t.color.line} strokeWidth={1.5} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space2 + 2 },
  families: { gap: space2, paddingRight: space2 },
  family: {
    flexDirection: "row",
    alignItems: "center",
    gap: space1 + 2,
    height: 38,
    paddingHorizontal: space3,
    borderRadius: tokens.radius.radiusPill,
    borderWidth: 1.5,
  },
  familyOn: { borderWidth: 2 },
  familyText: { fontSize: tokens.type.caption.fontSize, lineHeight: tokens.type.caption.lineHeight },
  dots: { flexDirection: "row" },
  dot: { width: 12, height: 12, borderRadius: tokens.radius.radiusPill, borderWidth: 1.5, marginLeft: -4 },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: space3 },
  cell: { width: "25%", alignItems: "center", gap: space1 + 2 },
  ring: { padding: 3, borderRadius: SWATCH, borderWidth: 2.5 },
  name: {
    fontSize: tokens.type.label.fontSize,
    lineHeight: tokens.type.label.lineHeight,
    textAlign: "center",
    paddingHorizontal: 2,
  },
});
