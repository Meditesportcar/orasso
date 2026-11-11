// La vue « Une par une » (maquette R8.6 `pubCard`) : la carte entière du Fil (`FeedPostCard`), réutilisée telle quelle, une sous
// l'autre ; la légende est repliée après trois lignes (« plus » / « moins », `FoldCaptions`). Le menu « ⋯ » de la carte ouvre
// celui de la publication (Supprimer pour la mienne, Signaler sinon).
import type { FeedPostView } from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { FeedPostCard } from "@/features/fil/cards/FeedPostCard";
import { FoldCaptions } from "./FoldedCaption";
import { PostMenu } from "./PostMenu";
import { postCard } from "./postCard";

export function PublicationsOneByOne({ posts }: { posts: readonly FeedPostView[] }) {
  const [menu, setMenu] = useState<FeedPostView | null>(null);
  return (
    <FoldCaptions>
      <View style={styles.list} testID="publications-one-by-one">
        {posts.map((post) => (
          <FeedPostCard key={post.id} card={postCard(post)} faded={false} onMenu={() => setMenu(post)} />
        ))}
      </View>
      <PostMenu post={menu} canDelete={Boolean(menu?.mine)} onClose={() => setMenu(null)} onRemoved={() => undefined} />
    </FoldCaptions>
  );
}

const styles = StyleSheet.create({ list: { gap: 12 } });
