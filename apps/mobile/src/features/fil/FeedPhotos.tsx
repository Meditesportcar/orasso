// Photos d'une publication du Fil : au format de la publication (4:5 par défaut, 1:1, paysage), en défilement horizontal
// avec « 1 / 3 ». Les images viennent d'une route privée (`GET /feed-posts/:id/photos/:name`, session exigée) : elles
// sont lues avec le jeton de session et gardées en mémoire seulement (`CrewPhotoImage`, même mécanique que les photos
// d'un crew : jamais dans le cache disque du téléphone, un compte qui part ne les retrouve pas).
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  FEED_ASPECT_RATIOS,
  type FeedPostView,
  isNearViewport,
  feedScreenLabels as L,
  slidesToLoad,
} from "@orasso/shared";
import { type RefObject, useEffect, useRef, useState } from "react";
import { Dimensions, ScrollView, StyleSheet, View } from "react-native";

import { CrewPhotoImage } from "@/features/crews/feed/CrewPhotoImage";
import { useScrollAssist } from "@/ui/ScrollAssist";
import { FilPhotoImage } from "./FilPhotoImage";

/** La première photo passe par `FilPhotoImage` (gardée pour le hors ligne) ; les autres comme toute photo privée. */
function PhotoSlide({
  first,
  ...props
}: {
  first: boolean;
  url: string;
  style: object;
  resizeMode: "cover";
  accessibilityLabel: string;
}) {
  return first ? <FilPhotoImage {...props} /> : <CrewPhotoImage {...props} />;
}

/**
 * Lot R7e2, tour 2 : la carte sait si elle est près de l'écran (à moins d'un écran de la fenêtre). Loin, ses photos sont
 * libérées (`CrewPhotoImage` démonté : les `data:` en mémoire partent avec) ; près, elle recharge. Hors d'une page qui
 * défile (pas d'aide de défilement), la carte est toujours « proche ».
 */
function useNearScreen(box: RefObject<View | null>): boolean {
  const assist = useScrollAssist();
  const [near, setNear] = useState(!assist);
  useEffect(() => {
    if (!assist) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const measure = () =>
      box.current?.measureInWindow((_x, y, _w, h) => {
        setNear(isNearViewport(y, h, Dimensions.get("window").height));
      });
    measure();
    const off = assist.watchScroll(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        measure();
      }, 150);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [assist, box]);
  return near;
}

export function FeedPhotos({ post }: { post: Pick<FeedPostView, "photos" | "aspect" | "author"> }) {
  const { t } = useTheme();
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const box = useRef<View>(null);
  const near = useNearScreen(box);
  const loaded = slidesToLoad(index, post.photos.length, near);
  const ratio = FEED_ASPECT_RATIOS[post.aspect];
  const height = width > 0 ? width / ratio : 0;
  const n = post.photos.length;
  return (
    <View
      ref={box}
      style={[styles.frame, { aspectRatio: ratio, backgroundColor: t.color.night }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      testID="feed-post-photos"
    >
      {width > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / width);
            if (i !== index && i >= 0 && i < n) setIndex(i);
          }}
          accessibilityLabel={L.photoOf(index + 1, n)}
        >
          {post.photos.map((p, i) => (
            <View key={p.url} style={{ width, height }}>
              {loaded.includes(i) ? (
                <PhotoSlide
                  first={i === 0}
                  url={p.url}
                  style={{ width, height }}
                  resizeMode="cover"
                  accessibilityLabel={L.photoAlt(post.author.pseudo, i + 1, n)}
                />
              ) : null}
            </View>
          ))}
        </ScrollView>
      ) : null}
      {n > 1 ? (
        <View style={[styles.count, { backgroundColor: `${t.color.night}b3` }]} pointerEvents="none">
          <Text variant="caption" color={t.color.nightInk} style={styles.countText} testID="feed-post-photo-count">
            {L.photoOf(index + 1, n)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", borderRadius: tokens.radius.radiusMd + 2, overflow: "hidden" },
  count: {
    position: "absolute",
    top: 10,
    right: 10,
    height: 24,
    paddingHorizontal: 9,
    borderRadius: tokens.radius.radiusPill,
    justifyContent: "center",
  },
  countText: { fontFamily: "Archivo-ExtraBold", fontSize: 11.5 },
});
