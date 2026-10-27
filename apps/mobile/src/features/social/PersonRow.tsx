// Une personne dans une liste (recherche, propriétaires près de chez moi) : avatar, pseudo, grade, secteur et véhicules
// (le nom d'un véhicule ne se tronque jamais), puis le bouton « Suivre » (lot R6b).
import { Chip, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { gradeLabels, networkLabels as N, type PersonCard } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { Avatar } from "@/ui/Avatar";
import { cardVisibility, FollowButton } from "./FollowButton";

const { space1, space2, space3 } = tokens.spacing;

export function PersonRow({ person, onChanged }: { person: PersonCard; onChanged: () => void }) {
  const { t } = useTheme();
  const router = useRouter();
  return (
    <Plate style={styles.card} testID="person-row">
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Profil de ${person.pseudo}`}
        onPress={() => router.push(`/u/${encodeURIComponent(person.pseudo)}`)}
        style={styles.head}
      >
        <Avatar url={person.avatarUrl} pseudo={person.pseudo} size={48} />
        <View style={styles.text}>
          <Text variant="posterS" color={t.color.plateInk}>
            {person.pseudo}
          </Text>
          <View style={styles.chips}>
            <Chip surface="plate">{gradeLabels[person.grade]}</Chip>
            {person.follow.followsMe ? (
              <View testID="follows-you">
                <Chip surface="plate">{N.followsYou.toUpperCase()}</Chip>
              </View>
            ) : null}
            {person.departments && person.departments.length > 0 ? (
              <Text variant="meta" color={t.color.plateMuted}>
                {person.departments.join(", ")}
              </Text>
            ) : null}
          </View>
          {person.vehicles.map((v) => (
            <Text key={v.id} variant="body" color={t.color.plateInk}>
              {v.label}
            </Text>
          ))}
        </View>
      </Pressable>
      <FollowButton
        size="small"
        pseudo={person.pseudo}
        mine={person.follow.mine}
        followsMe={person.follow.followsMe}
        canFollow
        visibility={cardVisibility(person)}
        onChanged={() => onChanged()}
      />
    </Plate>
  );
}

const styles = StyleSheet.create({
  card: { gap: space3, padding: space3 },
  head: { flexDirection: "row", alignItems: "center", gap: space3 },
  text: { flex: 1, gap: space1 },
  chips: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space2 },
});
