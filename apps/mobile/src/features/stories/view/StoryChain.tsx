// La lecture enchaînée des stories (lot R8s, décisions R8 § 8, maquette R8.10 `s-stories`). Avec `suite=barre` (la barre du Fil),
// la barre est lue une fois à l'ouverture et la chaîne des auteurs est figée (`storyChain` : l'auteur ouvert, puis les non vus
// qui le suivent dans la barre) ; l'auteur courant vit dans l'état de cet écran : pas de `router.replace` par auteur, un seul
// écran dans l'historique (« retour » revient d'où l'on vient). Après le dernier auteur de la chaîne, la visionneuse se ferme.
// Sans `suite=barre` (anneau d'un profil, story de l'organisateur, mentions) : l'auteur seul, comme avant.
// Changement d'auteur : glissement horizontal court et fondu (fondu de 120 ms en mouvement réduit), tout l'état propre à une story
// (flamme, réponse en cours, feuilles, minuterie) repart de zéro (visionneuse remontée, `key`). L'auteur suivant est lu d'avance.
import { useTheme } from "@orasso/design-system/native";
import { nextAuthor, prevAuthor, type StoriesByAuthor, storyChain } from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { AuthorViewer } from "./StoryViewer";

const SLIDE_MS = 200;
const REDUCED_FADE_MS = 120;
/** Part de la largeur parcourue par le glissement d'entrée (court). */
const SLIDE_SHARE = 0.12;
/** L'auteur suivant est lu d'avance après ce délai ; une lecture d'avance plus vieille que cela est relue. */
const PREFETCH_DELAY_MS = 800;
const PREFETCH_MAX_AGE_MS = 60_000;

export function StoryChain({ authorKey, followBar }: { authorKey: string; followBar: boolean }) {
  const { t, reducedMotion } = useTheme();
  const { me } = useSession();
  const { width } = useWindowDimensions();
  const [chain, setChain] = useState<string[]>([authorKey]);
  const [current, setCurrent] = useState(authorKey);
  const [arrival, setArrival] = useState<"next" | "prev" | null>(null);

  // La barre, lue une seule fois : la chaîne ne se réordonne plus pendant la lecture. Une panne : l'auteur seul.
  const myId = me?.user.id ?? null;
  useEffect(() => {
    if (!followBar) return;
    let alive = true;
    api
      .storiesBar()
      .then((bar) => {
        if (alive) setChain(storyChain(bar.authors, authorKey, bar.mine && myId ? `u:${myId}` : null));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [followBar, authorKey, myId]);

  // Lecture d'avance de l'auteur suivant (jamais d'effet de vue : la vue n'est posée que par la story réellement affichée).
  const ahead = useRef(new Map<string, { at: number; promise: Promise<StoriesByAuthor> }>());
  const fetchAuthor = useCallback((key: string) => {
    const hit = ahead.current.get(key);
    ahead.current.delete(key);
    if (hit && Date.now() - hit.at < PREFETCH_MAX_AGE_MS) return hit.promise;
    return api.storiesByAuthor(key);
  }, []);
  const following = nextAuthor(chain, current);
  useEffect(() => {
    if (!following) return;
    const timer = setTimeout(() => {
      const promise = api.storiesByAuthor(following);
      promise.catch(() => ahead.current.delete(following));
      ahead.current.set(following, { at: Date.now(), promise });
    }, PREFETCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [following]);

  // Entrée du nouvel auteur : glissement court depuis le côté d'où l'on vient, fondu seul en mouvement réduit.
  const tx = useSharedValue(0);
  const opacity = useSharedValue(1);
  const goAuthor = useCallback(
    (dir: "next" | "prev") => {
      const to = dir === "next" ? nextAuthor(chain, current) : prevAuthor(chain, current);
      if (!to) return;
      tx.value = reducedMotion ? 0 : (dir === "next" ? 1 : -1) * width * SLIDE_SHARE;
      opacity.value = 0;
      tx.value = withTiming(0, { duration: SLIDE_MS });
      opacity.value = withTiming(1, { duration: reducedMotion ? REDUCED_FADE_MS : SLIDE_MS });
      setArrival(dir);
      setCurrent(to);
    },
    [chain, current, reducedMotion, tx, opacity, width],
  );
  const style = useAnimatedStyle(() => {
    "worklet";
    return { opacity: opacity.value, transform: [{ translateX: tx.value }] };
  });

  const prevKey = prevAuthor(chain, current);
  return (
    <Animated.View style={[{ flex: 1, backgroundColor: t.color.night }, style]} testID="story-chain">
      <AuthorViewer
        key={current}
        authorKey={current}
        nav={
          followBar
            ? { prevKey, nextKey: following, startAtEnd: arrival === "prev", fetchAuthor, onAuthor: goAuthor }
            : undefined
        }
      />
    </Animated.View>
  );
}
