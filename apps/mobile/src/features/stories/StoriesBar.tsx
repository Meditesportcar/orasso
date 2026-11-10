// La barre de stories, en tête du Fil (lot R7f2, maquette R7.6 `p-fil` `.r7stories`) : « Ta story » d'abord (« + » sans story,
// ton anneau sinon), puis un rond par auteur (`GET /stories/bar`, déjà trié par l'API : non vues d'abord) : anneau clair
// (abonnés), rouge brique (crew), moutarde « EN COURS » (sans néon : un seul néon par écran, celui du bouton principal), anneau fin quand tout est
// vu. Le nom dessous ne se coupe jamais (`WordSafeText`). Défilement horizontal. Relue au retour sur l'écran (`useApi`) et
// quand `story.ready` arrive sur le canal `user:{id}`. Aucune règle de visibilité ici : l'API a déjà filtré. Une panne n'est
// jamais une barre vide : « Réessayer ». Rien n'est gardé dans le trousseau (vie privée).
import { AvatarRing, Icon, Text, tokens, useTheme, WordSafeText } from "@orasso/design-system/native";
import { barDisplay, storyViewerLabels as L, mineRingState } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useTabSwipeScrollGuard } from "@/features/nav/useTabSwipe";
import { api } from "@/lib/api";
import { mediaSource } from "@/lib/media";
import { useChannel } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { SmButton } from "@/ui/Kit";

const { space2, space3, space4 } = tokens.spacing;
const ITEM_W = 68;
/** Route créée par le lot R7f3 (fusionné juste après celui-ci) : le « + » y mène toujours (Metro ne sait pas la détecter). */
const PUBLISH = "/story/publier" as never;

/**
 * Ouvre la visionneuse d'un auteur (`u:<compte>`, `s:<structure>`, `p:<pro>`). Depuis la barre du Fil (lot R8s) : `suite=barre`,
 * la lecture enchaîne les auteurs suivants de la barre.
 */
export function useOpenStories() {
  const router = useRouter();
  return (authorKey: string) => router.push({ pathname: "/story/[authorKey]", params: { authorKey, suite: "barre" } });
}

export function StoriesBar() {
  const { t } = useTheme();
  const { me } = useSession();
  // La barre défile à l'horizontale : le glissement d'onglet se tait pendant son défilement (comme les carrousels).
  const scrollGuard = useTabSwipeScrollGuard();
  const open = useOpenStories();
  const router = useRouter();
  const bar = useApi(() => api.storiesBar(), []);
  const reload = bar.reload;
  useChannel(me ? `user:${me.user.id}` : null, (event) => {
    if (event.type === "story.ready") void reload();
  });

  const data = bar.data;
  const mine = data?.mine ?? null;
  const mineState = mineRingState(mine);
  const display = barDisplay(data?.authors ?? []);
  const myId = me?.user.id;

  return (
    <View style={styles.wrap} testID="stories-bar">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityLabel={L.barTitle}
        {...scrollGuard}
      >
        {/* Ta story : « + » (publier, si la route existe) sans story ; ton anneau (ouvre ta story) avec. */}
        <View style={styles.item} testID="stories-mine">
          {mineState && myId ? (
            <View>
              <AvatarRing
                ring={mineState}
                size="lg"
                source={mediaSource(me?.profile.avatarUrl)}
                name={me?.profile.pseudo ?? "?"}
                onPress={() => open(`u:${myId}`)}
                accessibilityLabel={L.openMine}
                testID="stories-mine-ring"
              />
              <Pressable
                onPress={() => router.push(PUBLISH)}
                accessibilityRole="button"
                accessibilityLabel={L.addStoryHint}
                hitSlop={6}
                style={[styles.plus, { backgroundColor: t.color.accent, borderColor: t.color.ground }]}
                testID="stories-add"
              >
                <Icon name="add" size={12} color={t.color.accentInk} strokeWidth={3} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => router.push(PUBLISH)}
              accessibilityRole="button"
              accessibilityLabel={L.addStoryHint}
              style={[styles.add, { borderColor: t.color.line }]}
              testID="stories-add"
            >
              <Icon name="add" size={24} color={t.color.inkMuted} />
            </Pressable>
          )}
          <WordSafeText base={11} variant="caption" color={t.color.ink} style={styles.name}>
            {L.addStory}
          </WordSafeText>
        </View>

        {(data?.authors ?? []).map((a, i) => {
          const d = display[i];
          if (!d) return null;
          return (
            <View key={a.key} style={styles.item} testID={`stories-author-${a.key}`}>
              <View>
                <AvatarRing
                  ring={d.state}
                  neon={false}
                  size="lg"
                  source={mediaSource(a.avatarUrl)}
                  name={a.pseudoOrName}
                  onPress={() => open(a.key)}
                  accessibilityLabel={`${L.openStories(a.pseudoOrName)}${a.crewName ? `, ${a.crewName}` : ""}`}
                  testID={`stories-ring-${d.state}`}
                />
                {d.liveLabel ? (
                  <View pointerEvents="none" style={styles.liveWrap}>
                    <View style={[styles.live, { backgroundColor: t.color.accent }]} testID="stories-live-label">
                      <Text variant="meta" color={t.color.accentInk} style={styles.liveText}>
                        {L.live}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>
              <WordSafeText
                base={11}
                variant="caption"
                color={t.color.ink}
                style={[styles.name, d.liveLabel && styles.afterLive]}
              >
                {a.pseudoOrName}
              </WordSafeText>
            </View>
          );
        })}
      </ScrollView>
      {bar.error && !data ? (
        <View style={styles.error} testID="stories-error">
          <Text variant="caption" color={t.color.inkMuted} style={styles.errorText}>
            {bar.error.status === 429 ? L.tooMany : L.loadError}
          </Text>
          <SmButton kind="s" icon="undo" onPress={() => void reload()} testID="stories-retry">
            {L.retry}
          </SmButton>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // La barre déborde jusqu'aux bords de l'écran (le contenu du Fil a 16 px de marge) : `.r7stories{margin:0 -16px}`.
  wrap: { marginHorizontal: -space4 },
  row: { flexDirection: "row", gap: space3, paddingHorizontal: space4, paddingVertical: 2, alignItems: "flex-start" },
  item: { width: ITEM_W, alignItems: "center", gap: 5 },
  name: { textAlign: "center", fontFamily: "Archivo-Bold", lineHeight: 13, maxWidth: ITEM_W },
  afterLive: { marginTop: 4 },
  add: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  plus: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  // `.r7lv` : étiquette inclinée, posée sur le bas de l'anneau.
  liveWrap: { position: "absolute", top: 52, left: 0, right: 0, alignItems: "center" },
  live: {
    height: 17,
    paddingHorizontal: 6,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ skewX: "-8deg" }],
  },
  liveText: { fontSize: 9.5, lineHeight: 11, letterSpacing: 0.6 },
  error: { flexDirection: "row", alignItems: "center", gap: space2, paddingHorizontal: space4, paddingTop: space2 },
  errorText: { flex: 1 },
});
