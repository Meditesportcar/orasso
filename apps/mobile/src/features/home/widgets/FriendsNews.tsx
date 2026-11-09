// Bloc « Du nouveau chez tes potes » de l'Accueil (lot R7a2, maquette R7.4) : 3 nouveautés au plus des personnes que je
// suis ; la suite est dans Le Fil (« Le Fil › »). L'Accueil reste un tableau de bord : aucune liste qui s'allonge.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type HomeFriendNews, type HomeFriendsNews, homeBlockLabels } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { Avatar } from "@/ui/Avatar";
import { agoLabel } from "../ago";
import { SecH } from "../fanBlocks";

const { space2, space3 } = tokens.spacing;

export function FriendsNews({
  data,
  now,
  onOpen,
  onFeed,
}: {
  data: HomeFriendsNews;
  now: Date;
  onOpen: (news: HomeFriendNews) => void;
  onFeed: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={styles.wrap} testID="home-friends-news">
      <SecH title={homeBlockLabels.friendsTitle} link={homeBlockLabels.friendsLink} onLink={onFeed} />
      {data.items.map((n) => {
        // « Kenji_66 va au Rassemblement… » : le pseudo en gras, le reste en texte courant.
        const lead = n.text.startsWith(n.actor.pseudo) ? n.actor.pseudo : "";
        const rest = lead ? n.text.slice(lead.length) : n.text;
        return (
          <Pressable
            key={n.id}
            onPress={() => onOpen(n)}
            accessibilityRole="link"
            accessibilityLabel={n.text}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard },
              pressed && styles.pressed,
            ]}
            testID="home-friend-news"
          >
            <Avatar url={n.actor.avatarUrl} pseudo={n.actor.pseudo} size={40} />
            <View style={styles.fill}>
              <Text variant="body" color={c.ink} style={styles.text}>
                {lead ? (
                  <Text variant="bodyStrong" color={c.ink} style={styles.text}>
                    {lead}
                  </Text>
                ) : null}
                {rest}
              </Text>
              <Text variant="caption" color={c.inkMuted}>
                {n.caption ?? agoLabel(n.at, now)}
              </Text>
            </View>
            <Icon name="next" size={16} color={c.inkMuted} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space2 },
  fill: { flex: 1, minWidth: 0, gap: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: space3, padding: 12, borderRadius: 16 },
  pressed: { opacity: 0.85 },
  text: { fontSize: 14.5, lineHeight: 19 },
});
