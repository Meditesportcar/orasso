// Onglet Crew (lot R7b2, D38, maquette R7.11) : le crew affiché (`CrewSpace` : le haut compact, puis Fil · Sorties · Membres ·
// Spots ; le nom ▾ ouvre « Mes crews » quand j'en ai plusieurs ; le dernier ouvert revient, rangé par compte) ; sans crew, « Rejoindre un crew » ou « Créer un crew » (`NoCrew`). Mode A : bande ORASSO et barre d'onglets.
// Un lien peut cibler un crew et un onglet (`/crew?crew=<adresse>&onglet=sorties`) : la page d'un crew dont je suis membre
// y renvoie. Reçu alors que l'onglet est déjà monté, un lien l'emporte sur le choix manuel (et le lien est consommé : les
// paramètres sont retirés, l'adresse redevient `/crew`, pour qu'un même lien relu agisse encore) ; le crew d'un lien qui n'est pas le mien mène à
// sa vitrine.
import { crewTabLabels as T } from "@orasso/shared";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ScrollView } from "react-native";

import type { CrewFeedScroller } from "@/features/crews/feed/CrewFeed";
import { api } from "@/lib/api";
import { kvGet, kvSet } from "@/lib/kv";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { TabStage } from "@/ui/Screens";
import { CrewScroll } from "./CrewScroll";
import { CrewSpace } from "./CrewSpace";
import { crewLastKey, pickCrew } from "./crewTabModel";
import { NoCrew } from "./NoCrew";

export function CrewTab() {
  const { me } = useSession();
  const userId = me?.user.id ?? null;
  const router = useRouter();
  const params = useLocalSearchParams<{ crew?: string; onglet?: string }>();
  const crews = useApi(() => api.myCrews(), [], { cacheKey: "my-crews" });
  const list = crews.data;
  const reloadCrews = crews.reload;
  // Le dernier crew ouvert, relu à l'arrivée (`undefined` : pas encore lu) ; le choix est rangé sous le compte.
  const [last, setLast] = useState<string | null | undefined>(undefined);
  const [chosen, setChosen] = useState<string | null>(null);
  // Le crew et l'onglet d'un lien, en attente d'être appliqués (lus des paramètres, qui sont ensuite retirés).
  const [wanted, setWanted] = useState<string | null>(params.crew ?? null);
  const [tabLink, setTabLink] = useState<{ value: string | null; n: number }>({
    value: params.onglet ?? null,
    n: params.onglet ? 1 : 0,
  });
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    setLast(undefined);
    setChosen(null);
    if (!userId) return;
    let alive = true;
    void kvGet(crewLastKey(userId)).then((v) => alive && setLast(v));
    return () => {
      alive = false;
    };
  }, [userId]);

  // Un lien reçu (onglet déjà monté) l'emporte sur le choix manuel ; puis on retire les paramètres.
  useEffect(() => {
    if (!params.crew && !params.onglet) return;
    if (params.crew) {
      setWanted(params.crew);
      setChosen(null);
    }
    setTabLink((l) => ({ value: params.onglet ?? null, n: l.n + 1 }));
    // `setParams` ne retire rien ici (essayé : `undefined`, chaîne vide, `useNavigation`) ; remplacer l'adresse par `/crew` retire
    // les paramètres, sans démonter l'onglet.
    router.replace("/crew");
  }, [params.crew, params.onglet, router]);
  // Le crew du lien : un des miens, il devient le choix ; sinon la liste est relue une fois (crew qui vient d'être créé ou
  // accepté), et s'il n'y est toujours pas, c'est la vitrine du crew qui s'ouvre (jamais un autre de mes crews en silence).
  const checking = useRef<string | null>(null);
  // La relecture est asynchrone : la vitrine ne s'ouvre que si l'onglet est encore affiché (monté et au premier plan), et
  // par `push` pour que « retour » ramène à l'onglet au lieu de fermer l'appli.
  const navigation = useNavigation();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const shown = useRef<() => boolean>(() => false);
  shown.current = () => mounted.current && navigation.isFocused();
  useEffect(() => {
    if (!wanted || !list) return;
    if (list.some((c) => c.slug === wanted)) {
      setChosen(wanted);
      setWanted(null);
      return;
    }
    if (checking.current === wanted) return;
    checking.current = wanted;
    void reloadCrews().then((fresh) => {
      checking.current = null;
      setWanted((w) => (w === wanted ? null : w));
      if (!fresh) return;
      if (fresh.some((c) => c.slug === wanted)) {
        setChosen(wanted);
      } else if (shown.current()) router.push(`/crew/${encodeURIComponent(wanted)}`);
    });
  }, [wanted, list, reloadCrews, router]);

  const current = useMemo(
    () => (list && last !== undefined ? pickCrew(list, chosen ?? wanted, last) : null),
    [list, last, chosen, wanted],
  );
  const slug = current?.slug ?? null;
  // Un crew montré (même choisi par un lien) devient « le dernier ouvert ».
  useEffect(() => {
    if (userId && slug) void kvSet(crewLastKey(userId), slug);
  }, [userId, slug]);
  const choose = useCallback((next: string) => {
    setChosen(next);
    setWanted(null);
    setTabLink((l) => ({ value: null, n: l.n }));
  }, []);

  // Pour le fil : la zone qui défile est la mienne (la pastille « nouvelle publication » y remonte au haut du fil).
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollY = useRef(0);
  const scroller = useMemo<CrewFeedScroller>(
    () => ({
      scrollTo: (y, animated) => scrollRef.current?.scrollTo({ y, animated }),
      y: () => scrollY.current,
    }),
    [],
  );

  // Tirer pour recharger : la liste de mes crews, puis le crew affiché.
  const onRefresh = async () => {
    await crews.reload();
    setRefreshKey((n) => n + 1);
  };
  const scroll = { scrollRef, scrollY, onRefresh };

  return (
    <TabStage>
      {list && current ? (
        <CrewSpace
          key={current.slug}
          slug={current.slug}
          crews={list}
          onChoose={choose}
          linkTab={tabLink}
          scroller={scroller}
          scroll={scroll}
          refreshKey={refreshKey}
          onLost={async () => (await crews.reload()) !== null}
        />
      ) : (
        <CrewScroll {...scroll}>
          {[
            !list && crews.error ? (
              <LoadError key="error" message={crews.error.message || T.loadError} onRetry={() => void crews.reload()} />
            ) : null,
            !list && !crews.error ? (
              <Muted key="loading" variant="body">
                Chargement…
              </Muted>
            ) : null,
            list && list.length === 0 ? <NoCrew key="none" /> : null,
          ].filter((n) => n !== null)}
        </CrewScroll>
      )}
    </TabStage>
  );
}
