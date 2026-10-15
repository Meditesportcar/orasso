// Brand : logotype, monogramme, signature, pastille flottante, « Propulsé par ».
// (L'indicateur de chargement est dans Loader.tsx, le logo animé d'ouverture dans Opening.tsx.)
// Les formes viennent du kit d'identité (brandArt.ts, généré) et sont dessinées avec react-native-svg.

import { type ReactNode, useId } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Defs, G, Mask, Path, Rect } from "react-native-svg";
import { brandArt } from "./brandArt";
import { withAlpha } from "./color";
import { Icon } from "./Icon";
import { Labeled } from "./Labeled";
import { Text } from "./text";
import { useTheme } from "./theme";

/** Version du fichier de marque : « dark » = fond sombre (O crème), « light » = fond clair (O noir), « auto » = selon le thème. */
export type BrandTone = "auto" | "dark" | "light";

export function useTone(tone: BrandTone): "dark" | "light" {
  const { theme } = useTheme();
  if (tone !== "auto") return tone;
  // Barres Béton sombres : O crème. Barres Sable en métal moyen : O noir (README Brand).
  return theme === "sable" ? "light" : "dark";
}

const { carSkew } = brandArt;
/** La voiture et ses vitres sont penchées de 10° autour du centre de l'O, dans le repère décalé du monogramme. */
export const carTransform = `translate(${brandArt.oOffset} 0) translate(${carSkew.cx} ${carSkew.cy}) skewX(${carSkew.angle}) translate(${-carSkew.cx} ${-carSkew.cy})`;
export const oTransform = `translate(${brandArt.oOffset} 0)`;

/** La voiture du monogramme : moutarde, penchée de 10°, ses vitres découpées dans un masque. */
function Car({ id }: { id: string }) {
  return (
    <>
      <Defs>
        <Mask id={id} maskUnits="userSpaceOnUse" x={-50} y={-50} width={300} height={200}>
          <Rect x={-50} y={-50} width={300} height={200} fill="white" />
          <Path
            transform={carTransform}
            d={brandArt.windowPath}
            fill="black"
            stroke="black"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        </Mask>
      </Defs>
      <G mask={`url(#${id})`}>
        <G transform={carTransform} fill={brandArt.car}>
          {brandArt.carRects.map((r) => (
            <Rect key={r.x} x={r.x} y={r.y} width={r.width} height={r.height} rx={r.rx} />
          ))}
        </G>
      </G>
    </>
  );
}

/**
 * Les lettres du logotype (le premier O mis à part) : chacune est découpée par le contour de la précédente,
 * comme dans le fichier de marque. À poser dans un <Svg> au viewBox du logotype.
 */
export function LogoLetters({ id, ink, withO = true }: { id: string; ink: string; withO?: boolean }) {
  const [, , w] = brandArt.logoViewBox;
  const [first, ...rest] = brandArt.letters;
  return (
    <>
      <Defs>
        {brandArt.letters.slice(0, -1).map((letter, i) => (
          <Mask
            key={letter.dx}
            id={`${id}m${i}`}
            maskUnits="userSpaceOnUse"
            x={-20}
            y={-20}
            width={w + 40}
            height={140}
          >
            <Rect x={-20} y={-20} width={w + 40} height={140} fill="white" />
            <Path
              transform={`translate(${letter.dx} 0)`}
              d={letter.d}
              fill="black"
              stroke="black"
              strokeWidth={brandArt.letterGap}
            />
          </Mask>
        ))}
      </Defs>
      <G fill={ink}>
        {withO && first && <Path transform={`translate(${first.dx} 0)`} d={first.d} fillRule="evenodd" />}
        {rest.map((letter, i) => (
          <G key={letter.dx} mask={`url(#${id}m${i})`}>
            <Path transform={`translate(${letter.dx} 0)`} d={letter.d} />
          </G>
        ))}
      </G>
    </>
  );
}

export type LogoProps = {
  /** Largeur en px : 128 en tête de l'Accueil, 120 en-tête public du site, 110 en tête du menu latéral organisateur. */
  width?: number;
  tone?: BrandTone;
};

/** Le logotype complet. En dessous de 100 px de large, utiliser Monogram. Jamais déformé ni recoloré. */
export function Logo({ width = 128, tone = "auto" }: LogoProps) {
  const version = useTone(tone);
  const id = `l${useId().replaceAll(":", "")}`;
  const [, , w, h] = brandArt.logoViewBox;
  return (
    <Labeled label="Orasso">
      <Svg width={width} height={Math.round((width * h) / w)} viewBox={brandArt.logoViewBox.join(" ")}>
        <LogoLetters id={id} ink={brandArt.logoInk[version]} />
        <Car id={`${id}c`} />
      </Svg>
    </Labeled>
  );
}

export type MonogramProps = { size?: number; tone?: BrandTone; alt?: string };

/**
 * Le monogramme (le O) : 30 px dans un en-tête, avec margin-left −1,5 px pour que son bord gauche soit celui
 * du O du logotype. Jamais l'avatar de quelqu'un d'autre.
 */
export function Monogram({ size = 30, tone = "auto", alt = "Orasso" }: MonogramProps) {
  const version = useTone(tone);
  const id = `m${useId().replaceAll(":", "")}`;
  return (
    <View style={styles.monogram}>
      <Labeled label={alt}>
        <Svg width={size} height={size} viewBox={brandArt.viewBox.join(" ")}>
          <Path transform={oTransform} d={brandArt.oPath} fill={brandArt.ink[version]} fillRule="evenodd" />
          <Car id={id} />
        </Svg>
      </Labeled>
    </View>
  );
}

// --- Signature, pastille flottante, « Propulsé par » -------------------------------------------------------------

export type CreditProps = {
  /** `dark-surface` : plaque, photo, affiche inversée (brand-credit) ; `light-surface` : crème, moutarde (brand-credit-light). */
  surface?: "dark-surface" | "light-surface";
};

/**
 * La signature « ORASSO » : une seule par écran, en bas à droite de l'objet principal (qui doit être
 * positionné). Jamais sur une carte secondaire.
 */
export function Credit({ surface = "dark-surface" }: CreditProps) {
  const { t } = useTheme();
  return (
    <Text
      variant="credit"
      color={surface === "dark-surface" ? t.color.brandCredit : t.color.brandCreditLight}
      style={styles.credit}
      aria-hidden
    >
      Orasso
    </Text>
  );
}

export type FloatingMarkProps = {
  /** `mark` : le monogramme à gauche ; `close` : la pastille ✕ à droite. */
  kind: "mark" | "close";
  onPress?: () => void;
  closeLabel?: string;
};

/**
 * Pastille flottante de 40 px des écrans à photo sans barre (Événement, Pro) : la marque à 12 px du bord gauche,
 * Fermer à 12 px du bord droit, à 18 px du haut. Le O reste exactement là où il est sur les écrans à barre.
 */
export function FloatingMark({ kind, onPress, closeLabel = "Fermer" }: FloatingMarkProps) {
  const { t } = useTheme();
  const base = [
    styles.floating,
    kind === "mark" ? styles.floatingLeft : styles.floatingRight,
    { backgroundColor: withAlpha(t.color.night, 0.55) },
  ];
  if (kind === "mark") {
    return (
      <View style={base}>
        <Monogram tone="dark" />
      </View>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onPress} style={base}>
      <Icon name="close" size={16} strokeWidth={2.2} color={t.color.nightInk} />
    </Pressable>
  );
}

/** « Propulsé par Orasso » : pied de page du site public seulement (pas dans le back-office). */
export function PoweredBy({ children }: { children?: ReactNode }) {
  const { t } = useTheme();
  return (
    <Text variant="label" color={t.color.barInk}>
      {children ?? "Propulsé par Orasso"}
    </Text>
  );
}

const styles = StyleSheet.create({
  monogram: { marginLeft: -1.5 },
  credit: { position: "absolute", right: 12, bottom: 8 },
  floating: {
    position: "absolute",
    top: 18,
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  floatingLeft: { left: 12 },
  floatingRight: { right: 12 },
});
