// Le haut compact de la page d'une structure et de la fiche d'un pro (lot R8g, maquette R9.3 `n-page`, vue « Un visiteur », même
// gabarit que le haut du Profil, lot R8b1) : le logo dans l'anneau de ses stories, le nom (il **passe à la ligne**, jamais
// tronqué), le type et la vérification, « Suivre » (le seul bouton principal de l'écran), la bio sur une ligne avec « plus »,
// à droite les icônes empilées (« Message », « Plus »), dessous la bande de compteurs. Avec la police du téléphone agrandie, la
// ligne du type, de la vérification et du bouton passe sur deux lignes sans rien couper.
import {
  AvatarRing,
  type AvatarRingState,
  GradientFill,
  Icon,
  Text,
  tokens,
  useTheme,
  withAlpha,
} from "@orasso/design-system/native";
import { fitWideWordSize, pagesLabels as L, type PageCounter } from "@orasso/shared";
import { type ReactNode, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import { type BandCell, CounterBand, ProfileBio } from "@/features/profil/ProfileHead";
import { mediaSource } from "@/lib/media";
import { SmButton } from "@/ui/Kit";

const { space2, space3, space4 } = tokens.spacing;
/** Corps du nom (même corps que le pseudo du Profil, `.r8idm h1`). */
const NAME_SIZE = 18;

/** « Suivre » (le seul bouton principal) ou « Suivi » : un petit bouton sur la ligne du type. */
export function FollowLine({
  following,
  busy,
  onPress,
  testID,
}: {
  following: boolean;
  busy: boolean;
  onPress: () => void;
  testID: string;
}) {
  return following ? (
    <SmButton kind="s" icon="check" style={styles.line} disabled={busy} onPress={onPress} testID={testID}>
      {L.following}
    </SmButton>
  ) : (
    <SmButton kind="p" icon="add" style={styles.line} disabled={busy} onPress={onPress} testID={testID}>
      {L.follow}
    </SmButton>
  );
}

export function PageHead({
  testID,
  name,
  logoUrl,
  ring,
  onOpenStories,
  typeLabel,
  verifiedLabel,
  follow,
  bio,
  side,
  counters,
  onCounter,
}: {
  testID: string;
  name: string;
  logoUrl: string | null;
  /** L'état de l'anneau des stories (`profileRingState`) ; `null` : pas d'anneau. */
  ring: AvatarRingState;
  /** Présent quand il y a une story à ouvrir. */
  onOpenStories?: () => void;
  typeLabel: string;
  verifiedLabel: string | null;
  /** « Suivre » / « Suivi » (`FollowLine`). */
  follow: ReactNode;
  bio: string | null;
  /** Les icônes empilées à droite. */
  side: ReactNode;
  counters: readonly PageCounter[];
  /** Un compteur qui ouvre quelque chose (« événements », « partenaires » : l'onglet des événements). */
  onCounter?: (key: PageCounter["key"]) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const { fontScale } = useWindowDimensions();
  const [midW, setMidW] = useState(0);
  // Un mot très long rapetisse (jusqu'à 9) au lieu de se couper ; le nom passe à la ligne entre les mots.
  const widest = name.split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), "");
  const size = fitWideWordSize(widest, midW / Math.max(1, fontScale), NAME_SIZE, 9);
  const cells: BandCell[] = counters.map((x) => ({
    key: x.key,
    value: x.value,
    label: x.label,
    accessibilityLabel: x.value === null ? `${x.label}, ${"–"}` : `${x.value} ${x.label}`,
    onPress: x.key !== "followers" && onCounter ? () => onCounter(x.key) : undefined,
    testID: `page-count-${x.key}`,
  }));
  return (
    <View style={styles.top} testID={testID} accessibilityLabel={name}>
      <View style={styles.id}>
        <GradientFill
          css={`linear-gradient(180deg, ${withAlpha(c.ground, 0.82)} 0%, ${withAlpha(c.ground, 0.82)} 62%, ${withAlpha(c.ground, 0)} 100%)`}
          style={styles.veil}
        />
        <AvatarRing
          ring={ring}
          neon={false}
          size="profile"
          source={mediaSource(logoUrl)}
          name={name}
          onPress={onOpenStories}
          accessibilityLabel={onOpenStories ? L.openStories : undefined}
          testID="page-story-ring"
        />
        <View style={styles.mid} onLayout={(e) => setMidW(e.nativeEvent.layout.width)}>
          <Text
            variant="posterL"
            color={c.ink}
            style={{ fontSize: size, lineHeight: size + 2 }}
            accessibilityRole="header"
            testID="page-name"
          >
            {name}
          </Text>
          <View style={styles.gl}>
            <View style={[styles.type, { borderColor: c.ink }]}>
              <Text variant="label" color={c.ink} testID="page-type">
                {typeLabel.toUpperCase()}
              </Text>
            </View>
            {verifiedLabel ? (
              <View style={styles.verified} testID="page-verified">
                <Icon name="check" size={14} color={c.inkMuted} />
                <Text variant="bodyStrong" color={c.inkMuted} style={styles.verifiedText}>
                  {verifiedLabel}
                </Text>
              </View>
            ) : null}
            {follow}
          </View>
          <ProfileBio text={bio} testID="page-bio" />
        </View>
        <View style={styles.side}>{side}</View>
      </View>
      {cells.length ? (
        <CounterBand
          cells={cells}
          testID="page-counts"
          accessibilityLabel={cells.map((x) => `${x.value ?? "–"} ${x.label}`).join(", ")}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Le petit bouton de la ligne du type, comme « Suivre » sur le Profil d'un autre (`FollowButton`, taille `line`).
  line: { minHeight: 32, paddingHorizontal: 10, borderRadius: tokens.radius.radiusSm },
  top: { gap: space2 },
  id: { flexDirection: "row", alignItems: "flex-start", gap: space3 - 2 },
  veil: { top: -space3, bottom: -space3, left: -space4, right: -space4 },
  mid: { flex: 1, minWidth: 0, gap: 3 },
  gl: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space2, rowGap: 4 },
  type: {
    borderWidth: 1.5,
    borderRadius: tokens.radius.radiusSm,
    paddingVertical: 3,
    paddingHorizontal: space2,
    justifyContent: "center",
  },
  verified: { flexDirection: "row", alignItems: "center", gap: 4 },
  verifiedText: { fontSize: 13, lineHeight: 16 },
  side: { gap: 4 },
});
