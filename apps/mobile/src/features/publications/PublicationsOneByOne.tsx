// La vue « Une par une » (maquette R8.6 `pubCard`) : la carte entière du Fil (`FeedPostCard`), réutilisée telle quelle, une sous
// l'autre ; la légende est repliée après trois lignes (« plus » / « moins », `FoldCaptions`). Le menu « ⋯ » de la carte ouvre
// celui de la publication (Supprimer pour la mienne, Signaler sinon).
import { type FeedPostView, publicationCard } from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { FeedPostCard } from "@/features/fil/cards/FeedPostCard";
import { FoldCaptions } from "./FoldedCaption";
import { JournalBadges, type JournalOptions } from "./JournalBadges";
import { PostMenu } from "./PostMenu";

/**
 * `journal` (lot R8d, fiche d'un événement) : les étiquettes au-dessus de chaque carte, et le menu « … » est celui de la fiche
 * (`onMenu`, qui porte « Épingler en tête » pour l'organisateur) ; sans `journal`, la brique ne change pas.
 */
export function PublicationsOneByOne({ posts, journal }: { posts: readonly FeedPostView[]; journal?: JournalOptions }) {
  const [menu, setMenu] = useState<FeedPostView | null>(null);
  return (
    <FoldCaptions>
      <View style={styles.list} testID="publications-one-by-one">
        {posts.map((post) => (
          <View key={post.id} style={journal ? styles.item : undefined}>
            {journal ? <JournalBadges post={post} /> : null}
            <FeedPostCard
              card={publicationCard(post)}
              faded={false}
              onMenu={() => (journal?.onMenu ? journal.onMenu(post) : setMenu(post))}
            />
          </View>
        ))}
      </View>
      {journal?.onMenu ? null : (
        <PostMenu
          post={menu}
          canDelete={Boolean(menu?.mine)}
          onClose={() => setMenu(null)}
          onRemoved={() => undefined}
        />
      )}
    </FoldCaptions>
  );
}

const styles = StyleSheet.create({ list: { gap: 12 }, item: { gap: 6 } });
