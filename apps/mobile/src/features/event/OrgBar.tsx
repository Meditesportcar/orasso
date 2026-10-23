// Bande de l'organisateur (lot M4, maquette 4.2, correction de Damien) : l'en-tête de la fiche événement (mode B),
// toujours fixée en haut, jamais au défilement : retour, logo, nom et ✓ d'une structure validée, abonnés, « Suivre »
// en secondaire (contour ; « Suivie » en moutarde) et ✉, qui ouvre « Écrire à » avec le contexte de l'événement.
// Elle remplace la pastille O et la croix flottantes ; le nom de l'organisateur ne se répète pas sur l'affiche.
// Lot M7 (fusion) : elle se pose dans l'emplacement `band` de `PosterFlow` (en-tête de fiche `FicheHeader`) : l'aplat,
// la zone sûre et le ✕ (à droite, à sa place habituelle, à la place du retour) viennent de l'en-tête.
import { Icon, OrgLogo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { eventPageLabels as L } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

const { space1, space2 } = tokens.spacing;

export type OrgBarProps = {
  name: string;
  logoUrl: string | null;
  verified: boolean;
  /** `null` tant que la page de la structure n'est pas lue. */
  followers: number | null;
  following: boolean;
  busy?: boolean;
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
  onOpen,
  onFollow,
  onWrite,
}: OrgBarProps) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={styles.bar} testID="org-bar">
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
            {/* Tour 2 (relecture Opus) : un nom long passe sur deux lignes plutôt que d'être coupé (la réduction de la
                police n'existe pas sur le web) ; jamais coupé au milieu d'un mot. */}
            <Text variant="bodyStrong" color={c.barInk} style={styles.name} numberOfLines={2}>
              {name}
            </Text>
            {verified ? <Icon name="check" size={15} strokeWidth={3} color={c.accent} /> : null}
          </View>
          <Text variant="caption" color={c.barMuted} style={styles.small} numberOfLines={2}>
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
  bar: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space2 },
  who: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space2 },
  text: { flex: 1, minWidth: 0, gap: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: space1 },
  name: { flexShrink: 1, fontSize: 13.5, lineHeight: 16, fontFamily: "Archivo-ExtraBold" },
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
