// Les publications d'une structure vues **sans session** (point T4, lot R8g) : la liste en liste blanche (`PublicPostView` : ni
// flamme active, ni commentaires, ni menu, ni auteur personne), sans rien qui exige une session. Une carte par publication :
// la photo, la date et le lieu, la légende, « Info importante » le cas échéant. Une panne n'est jamais une liste vide.
import { Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  appendUnique,
  feedPublishLabels as FP,
  importantReasonLabels,
  publicationsLabels as PL,
  type PublicPostView,
  tileMeta,
} from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { now } from "@/lib/clock";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { Card, SmButton } from "@/ui/Kit";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Waiting } from "@/ui/Waiting";

const { space2, space3 } = tokens.spacing;

export function PublicPublications({ authorKey, name }: { authorKey: string; name: string }) {
  const { t } = useTheme();
  const [items, setItems] = useState<PublicPostView[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [more, setMore] = useState(false);
  const cursor = useRef<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(
    async (first: boolean) => {
      const mine = ++seq.current;
      if (first) setState("loading");
      else setMore(true);
      try {
        const page = await api.publicAuthorPosts(authorKey, first ? null : cursor.current);
        if (mine !== seq.current) return;
        cursor.current = page.nextCursor;
        setNext(page.nextCursor);
        setItems((list) => (first ? page.items : appendUnique(list, page.items)));
        setState("ready");
      } catch (e) {
        if (mine !== seq.current) return;
        setState(first || items.length === 0 ? "error" : "ready");
        void errorMessage(e);
      } finally {
        if (mine === seq.current) setMore(false);
      }
    },
    [authorKey, items.length],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: seule une autre page relance la première lecture
  useEffect(() => {
    cursor.current = null;
    setItems([]);
    void load(true);
    return () => {
      seq.current++;
    };
  }, [authorKey]);

  if (state === "loading") return <Waiting blocks={[260, 260]} label={PL.loading} testID="publications-loading" />;
  if (state === "error") return <LoadError message={PL.error} onRetry={() => void load(true)} />;
  if (items.length === 0)
    return (
      <Card style={styles.empty} testID="publications-empty">
        <Text variant="bodyStrong" color={t.color.ink}>
          {PL.emptyOtherTitle}
        </Text>
        <Muted variant="caption">{PL.emptyOtherText(name)}</Muted>
      </Card>
    );
  return (
    <View style={styles.list} testID="public-publications">
      {items.map((post) => {
        const meta = tileMeta(post, now());
        const photo = post.photos[0];
        return (
          <Card key={post.id} padded={false} testID="public-publication">
            {photo ? (
              <Photo
                source={mediaSource(photo.url)}
                placeholder={`linear-gradient(135deg, ${t.color.surfaceRaised} 0%, ${t.color.night} 100%)`}
                style={styles.photo}
              />
            ) : null}
            <View style={styles.body}>
              {post.important ? (
                <Text variant="label" color={t.color.accentText}>
                  {`${FP.important} · ${importantReasonLabels[post.important.reason]}`.toUpperCase()}
                </Text>
              ) : null}
              <Text variant="bodyStrong" color={t.color.ink}>
                {PL.tileLabel(meta.date, meta.place)}
              </Text>
              {post.caption ? (
                <Text variant="body" color={t.color.ink}>
                  {post.caption}
                </Text>
              ) : null}
            </View>
          </Card>
        );
      })}
      {next ? (
        <SmButton kind="s" wide icon="down" disabled={more} onPress={() => void load(false)} testID="publications-more">
          {PL.more}
        </SmButton>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space3 },
  photo: { width: "100%", aspectRatio: 4 / 5 },
  body: { gap: space2, padding: space3 },
  empty: { alignItems: "center", gap: space2 },
});
