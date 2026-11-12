// L'en-tête d'une publication signée des deux (lot R8o, maquette R8.13 `p-collab`, vue « fil ») : deux ronds qui se
// chevauchent, la signature « Kenji_66 et Wrap 66 » (chaque nom ouvre sa page ; un nom ne se tronque jamais) et la petite
// ligne « Collaboration · il y a 1 h ». Une page (structure, pro, média) s'ouvre avec la liste des pages (lot R8g) : en
// attendant, seul le nom d'une personne est touchable.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { type FeedAuthorView, type FeedCard, type FeedPostView, feedAgo, coauthorLabels as T } from "@orasso/shared";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { now } from "@/lib/clock";
import { Avatar } from "@/ui/Avatar";

const OVERLAP = tokens.spacing.space2 + tokens.spacing.space1 / 2;

/** Deux ronds qui se chevauchent : l'auteur, puis le co-auteur. */
export function TwoAvatars({
  author,
  coAuthor,
  size = 30,
}: {
  author: FeedAuthorView;
  coAuthor: FeedAuthorView;
  size?: number;
}) {
  const { t } = useTheme();
  return (
    <View style={[styles.two, { width: size * 2 - OVERLAP, height: size }]} accessibilityElementsHidden>
      <Avatar url={author.avatarUrl} pseudo={author.name} size={size} />
      <View style={[styles.second, { left: size - OVERLAP, borderColor: t.color.surface }]}>
        <Avatar url={coAuthor.avatarUrl} pseudo={coAuthor.name} size={size} />
      </View>
    </View>
  );
}

/** « Kenji_66 et Wrap 66 » : les deux noms, chacun son lien. */
export function CoAuthorSignature({ author, coAuthor }: { author: FeedAuthorView; coAuthor: FeedAuthorView }) {
  const { t } = useTheme();
  const router = useRouter();
  const open = (a: FeedAuthorView) =>
    a.kind === "user" ? () => router.push(`/u/${encodeURIComponent(a.pseudo)}`) : undefined;
  return (
    <View style={styles.titleBox}>
      <Text variant="bodyStrong" color={t.color.ink} testID="feed-card-signature">
        <Text
          variant="bodyStrong"
          color={t.color.ink}
          accessibilityRole={open(author) ? "link" : undefined}
          onPress={open(author)}
        >
          {author.name}
        </Text>
        {" et "}
        <Text
          variant="bodyStrong"
          color={t.color.ink}
          accessibilityRole={open(coAuthor) ? "link" : undefined}
          onPress={open(coAuthor)}
        >
          {coAuthor.name}
        </Text>
      </Text>
    </View>
  );
}

/** À l'auteur d'origine seul : l'état de son invitation (« Invitation envoyée à Wrap 66 », « Invitation refusée »). */
export function InviteStatusLine({ invite }: { invite: NonNullable<FeedPostView["coAuthorInvite"]> }) {
  const { t } = useTheme();
  if (invite.status === "accepted") return null;
  return (
    <Text variant="caption" color={t.color.inkMuted} testID="feed-card-invite">
      {T.inviteStatus(invite.name, invite.status)}
    </Text>
  );
}

/** « Collaboration · il y a 1 h ». */
export const collaborationLine = (card: FeedCard): string => `${T.collaboration} · ${feedAgo(card.at, now())}`;

const styles = StyleSheet.create({
  two: { position: "relative" },
  second: {
    position: "absolute",
    top: 0,
    borderRadius: tokens.radius.radiusPill,
    borderWidth: tokens.spacing.space1 / 2,
  },
  // Les noms sont des liens : la ligne de titre garde une zone de toucher de la hauteur du jeton `touch`.
  titleBox: { minHeight: tokens.spacing.touch, justifyContent: "center" },
});
