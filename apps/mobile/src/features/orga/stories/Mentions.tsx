// Casquette Organisateur, « Mentions » (lot R7h, maquette R7.14 `og_men`) : les stories qui identifient la structure ou un de
// ses événements, avec un aperçu 9:16 réduit, l'auteur et l'heure. Toucher une ligne ouvre la story (`MentionStory`) avec son
// bouton principal « Ajouter à ma story ». Tout vient de l'API (qui juge ce qui est visible) ; rien n'est gardé sur l'appareil.
import { Icon, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { storyShareLabels as L, type StoryMentionItem } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { CrewPhotoImage } from "@/features/crews/feed/CrewPhotoImage";
import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { useTail } from "@/lib/tailPages";
import { useApi } from "@/lib/useApi";
import { SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { useCloseTo } from "@/ui/useCloseTo";
import { OrgaFailure, useOrga } from "../OrgaGate";

const { space2, space3 } = tokens.spacing;

export function MentionsScreen() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { structureId, structureName } = useOrga();
  const close = useCloseTo("/(orga)/direct");
  const first = useApi(() => api.storyMentions(structureId), [structureId]);
  // Les pages suivantes : le mécanisme commun (pages vidées quand la première page est relue, réponses dépassées rejetées).
  const fetchPage = useCallback((cursor: string) => api.storyMentions(structureId, cursor), [structureId]);
  const tail = useTail<StoryMentionItem>(first.data ?? null, first.data?.nextCursor ?? null, fetchPage, errorMessage);
  const items = [...(first.data?.items ?? []), ...tail.items];
  const next = tail.nextCursor;

  return (
    <FlowScreen title={L.mentionsTitle} facts={structureName} onClose={close} onRefresh={first.reload}>
      <OrgaFailure error={first.error} />
      <Muted variant="body">{L.mentionsHint}</Muted>
      {!first.data && !first.error ? <Muted variant="body">Chargement…</Muted> : null}
      {first.data && items.length === 0 ? <Muted variant="body">{L.mentionsEmpty}</Muted> : null}
      <View style={styles.list} testID="mentions-list">
        {items.map((m) => (
          <Pressable
            key={m.storyId}
            onPress={() =>
              router.push(`/story/mention/${m.storyId}?author=${encodeURIComponent(m.authorKey)}` as never)
            }
            accessibilityRole="button"
            accessibilityLabel={`${m.authorName}, ${formatDayHour(m.createdAt)}${m.copyId ? `, ${L.alreadyAdded}` : ""}`}
            testID="mention-row"
          >
            <Plate style={styles.row}>
              <View style={styles.thumb}>
                <CrewPhotoImage url={m.mediaUrl} style={styles.thumbImg} resizeMode="cover" />
              </View>
              <View style={styles.text}>
                <Text variant="bodyStrong" color={c.plateInk}>
                  {m.authorName}
                </Text>
                <Text variant="caption" color={c.plateMuted}>
                  {formatDayHour(m.createdAt)}
                </Text>
                {m.caption ? (
                  <Text variant="caption" color={c.plateMuted} numberOfLines={2}>
                    {m.caption}
                  </Text>
                ) : null}
                {m.copyId ? (
                  <View style={styles.added} testID="mention-added">
                    <Icon name="check" size={14} color={c.plateInk} />
                    <Text variant="caption" color={c.plateInk}>
                      {L.alreadyAdded}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Icon name="next" size={18} color={c.plateMuted} />
            </Plate>
          </Pressable>
        ))}
      </View>
      {tail.error ? <Notice tone="error">{tail.error}</Notice> : null}
      {next ? (
        <SmButton kind="s" icon="down" onPress={() => void tail.more()} disabled={tail.busy} testID="mentions-more">
          {L.mentionsMore}
        </SmButton>
      ) : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space2 },
  row: { flexDirection: "row", alignItems: "center", gap: space3 },
  thumb: { width: 54, height: 96, borderRadius: 10, overflow: "hidden" },
  thumbImg: { width: 54, height: 96 },
  text: { flex: 1, gap: 2 },
  added: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
});
