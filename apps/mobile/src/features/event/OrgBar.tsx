// Bande de l'organisateur (lot M4, maquette 4.2, correction de Damien) : l'en-tête de la fiche événement (mode B),
// toujours fixée en haut, jamais au défilement : retour, logo, nom et ✓ d'une structure validée, abonnés, « Suivre »
// en secondaire (contour ; « Suivie » en moutarde) et ✉, qui ouvre « Écrire à » avec le contexte de l'événement.
// Elle remplace la pastille O et la croix flottantes ; le nom de l'organisateur ne se répète pas sur l'affiche.
import { Icon, OrgLogo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { eventPageLabels as L } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { space1, space2 } = tokens.spacing;

/** `.orgbar` : 58 px sous la barre d'état. */
export const ORG_BAR_HEIGHT = 58;

export type OrgBarProps = {
  name: string;
  logoUrl: string | null;
  verified: boolean;
  /** `null` tant que la page de la structure n'est pas lue. */
  followers: number | null;
  following: boolean;
  busy?: boolean;
  onBack: () => void;
  onOpen: () => void;
  onFollow: () => void;
  /** Absent : pas de message possible (structure non validée). */
  onWrite?: () => void;
};

export function OrgBar({
  name,
  logoUrl,
  verified,
  followers,
  following,
  busy = false,
  onBack,
  onOpen,
  onFollow,
  onWrite,
}: OrgBarProps) {
  const { t } = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="header"
      style={[
        styles.bar,
        {
          paddingTop: insets.top,
          height: insets.top + ORG_BAR_HEIGHT,
          backgroundColor: c.bar,
          borderBottomColor: c.barEdge,
          boxShadow: t.shadow.shadowBarTop,
        },
      ]}
      testID="org-bar"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retour"
        onPress={onBack}
        hitSlop={8}
        style={styles.back}
        testID="flow-close"
      >
        <Icon name="back" size={22} color={c.barInk} />
      </Pressable>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Organisateur : ${name}`}
        onPress={onOpen}
        style={styles.who}
        testID="event-organizer"
      >
        <OrgLogo name={name} logoUrl={logoUrl} size={34} />
        <View style={styles.text}>
          <View style={styles.nameRow}>
            {/* Le nom passe entier : la bande le réduit plutôt que de le couper au milieu d'un mot. */}
            <Text
              variant="bodyStrong"
              color={c.barInk}
              style={styles.name}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {name}
            </Text>
            {verified ? <Icon name="check" size={15} strokeWidth={3} color={c.accent} /> : null}
          </View>
          <Text variant="caption" color={c.barMuted} style={styles.small} numberOfLines={1}>
            {followers !== null ? `${L.followers(followers)} · ${L.organizerRole}` : L.organizerRole}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: following, disabled: busy }}
        disabled={busy}
        onPress={onFollow}
        style={[
          styles.follow,
          following ? { backgroundColor: c.accent } : { borderWidth: 1.5, borderColor: `${c.barInk}59` },
        ]}
        testID="follow-structure"
      >
        <Icon name={following ? "check" : "add"} size={14} strokeWidth={3} color={following ? c.accentInk : c.barInk} />
        <Text variant="meta" color={following ? c.accentInk : c.barInk} style={styles.followText}>
          {following ? L.following : L.follow}
        </Text>
      </Pressable>
      {onWrite ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={L.write(name)}
          onPress={onWrite}
          hitSlop={6}
          style={styles.mail}
          testID="org-write"
        >
          <Icon name="chat" size={22} color={c.barInk} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    paddingHorizontal: 10,
    borderBottomWidth: 2,
    zIndex: 20,
  },
  back: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  who: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space2 },
  text: { flex: 1, minWidth: 0, gap: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: space1 },
  name: { flexShrink: 1, fontSize: 13.5, lineHeight: 17, fontFamily: "Archivo-ExtraBold" },
  small: { fontSize: 11.5, lineHeight: 14 },
  follow: {
    height: 34,
    paddingHorizontal: 11,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  followText: { fontSize: 11.5, lineHeight: 14, fontFamily: "Archivo-ExtraBold", textTransform: "uppercase" },
  mail: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
});
