// Ligne « X t'a identifié dans sa story » (lot R7c2, remplie par le lot R7h). Maquette R7.2 : l'identification se gère sur
// place. Pour moi : « Repartager » (reprendre la story dans la mienne, l'auteur est crédité) et « Retirer » (l'identification
// tombe, la story reste). Pour ma structure (`data.target = "structure"`) : « Ajouter à ma story », seulement si je gère
// CETTE structure (propriétaire ou co-organisateur) : la ligne bascule d'abord sur sa casquette organisateur, puis ouvre
// la mention avec cette structure en cible explicite (jamais « la structure active du moment »).
// L'API décide de tout (refus d'un crew, d'un compte privé, story disparue) : l'écran n'affiche que sa réponse.
import { type ActivityItem, storyShareLabels as L } from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { SmallButton } from "@/features/sorties/bits";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { usePersona } from "@/lib/persona";
import { mentionStructure } from "@/lib/storyMention";
import { Muted } from "@/ui/Muted";
import { ActivityLine } from "../ActivityRow";

type Done = "untagged" | "reshared" | "gone" | null;

export function StoryMentionRow({
  item,
  day,
  onPress,
}: {
  item: ActivityItem;
  day: "today" | "week" | "earlier";
  onPress?: () => void;
}) {
  const { entries, choose } = usePersona();
  const storyId = typeof item.data.storyId === "string" ? item.data.storyId : null;
  const authorKey = typeof item.data.authorKey === "string" ? item.data.authorKey : null;
  const structureId = typeof item.data.structureId === "string" ? item.data.structureId : null;
  // Mes casquettes organisateur : propriétaire et co-organisateur seulement (le staff n'en a pas).
  const managed = mentionStructure(entries, structureId);
  const target = item.data.target;
  const [done, setDone] = useState<Done>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: "untag" | "reshare") => {
    if (!storyId) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "untag") await api.storyTagRemove(storyId);
      else await api.storyShare(storyId);
      setDone(kind === "untag" ? "untagged" : "reshared");
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) setDone("gone");
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  let actions: React.ReactNode = null;
  if (storyId && target === "user") {
    actions = (
      <View style={styles.actions} testID="story-mention-actions">
        {done ? (
          <Muted variant="caption" testID="story-mention-done">
            {done === "untagged" ? L.untagged : done === "reshared" ? L.reshared : L.gone}
          </Muted>
        ) : (
          <>
            <SmallButton icon="add" onPress={() => void run("reshare")} testID="story-mention-reshare">
              {L.reshare}
            </SmallButton>
            <SmallButton icon="close" onPress={() => void run("untag")} testID="story-mention-untag">
              {L.untag}
            </SmallButton>
          </>
        )}
        {busy ? <Muted variant="caption">…</Muted> : null}
        {error ? <Muted variant="caption">{error}</Muted> : null}
      </View>
    );
  } else if (storyId && authorKey && managed && target === "structure") {
    actions = (
      <View style={styles.actions} testID="story-mention-actions">
        <SmallButton
          icon="add"
          onPress={() =>
            choose(
              { kind: "organizer", structureId: managed },
              `/story/mention/${storyId}?author=${encodeURIComponent(authorKey)}&structure=${encodeURIComponent(managed)}`,
            )
          }
          testID="story-mention-add"
        >
          {L.add}
        </SmallButton>
      </View>
    );
  }
  return <ActivityLine item={item} day={day} onPress={onPress} actions={actions} testID="activity-story-mention" />;
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, paddingLeft: 68, paddingBottom: 12 },
});
