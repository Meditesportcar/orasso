// Casquette Organisateur, une mention (lot R7h, maquette R7.14 `og_add`) : l'aperçu 9:16 de la story qui nous identifie, ce
// que fait « Ajouter à ma story » (elle rejoint celle de la structure, l'auteur est crédité et prévenu, elle part avec
// l'originale) et le bouton principal. Une copie déjà faite se « Retire ». Les options viennent de l'API (`story.sharing`).
import { Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { storyShareLabels as L, type StoryView } from "@orasso/shared";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { CrewPhotoImage } from "@/features/crews/feed/CrewPhotoImage";
import { confirmRemove } from "@/features/crews/feed/confirm";
import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { useCloseTo } from "@/ui/useCloseTo";
import { OrgaFailure, useOrga } from "../OrgaGate";

const { space2, space3 } = tokens.spacing;

export function MentionStoryScreen() {
  const { t } = useTheme();
  const c = t.color;
  const { id, author } = useLocalSearchParams<{ id: string; author?: string }>();
  const { structureId, structureName } = useOrga();
  const close = useCloseTo("/story/mentions");
  const data = useApi(() => api.storiesByAuthor(String(author ?? "")), [author]);
  const story: StoryView | undefined = data.data?.stories.find((s) => s.id === id);
  const option = story?.sharing?.options.find((o) => o.as === "structure" && o.id === structureId);
  const [copyId, setCopyId] = useState<string | null | undefined>(undefined);
  const copy = copyId === undefined ? (option?.copyId ?? null) : copyId;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const authorName = data.data?.author?.pseudoOrName ?? "";

  const add = async () => {
    if (!story) return;
    setBusy(true);
    setError(null);
    try {
      const done = await api.storyShare(story.id, structureId);
      setCopyId(done.id);
      setNotice(L.added);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!copy) return;
    if (!(await confirmRemove(L.removeConfirm))) return;
    setBusy(true);
    setError(null);
    try {
      await api.storyDelete(copy);
      setCopyId(null);
      setNotice(L.removeDone);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FlowScreen
      title={story ? `Story de ${authorName}` : L.mentions}
      facts={story ? formatDayHour(story.createdAt) : structureName}
      onClose={close}
      footer={
        story && option ? (
          <View style={styles.footer}>
            {copy ? (
              <SmButton kind="s" icon="close" onPress={() => void remove()} disabled={busy} testID="mention-remove">
                {L.remove}
              </SmButton>
            ) : (
              <SmButton kind="p" icon="add" onPress={() => void add()} disabled={busy} testID="mention-add">
                {L.add}
              </SmButton>
            )}
          </View>
        ) : undefined
      }
    >
      <OrgaFailure error={data.error} />
      {!data.data && !data.error ? <Muted variant="body">Chargement…</Muted> : null}
      {data.data && !story ? <Notice>{L.gone}</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {story ? (
        <>
          <View style={styles.preview} testID="mention-preview">
            <CrewPhotoImage url={story.mediaUrl} style={styles.previewImg} resizeMode="cover" />
          </View>
          {story.caption ? (
            <Text variant="body" color={c.ink}>
              {story.caption}
            </Text>
          ) : null}
          <Plate style={styles.info}>
            <Text variant="body" color={c.plateInk}>
              {copy ? L.alreadyAdded : L.addExplain}
            </Text>
            <Text variant="caption" color={c.plateMuted}>
              {L.addCredit(authorName)}
            </Text>
          </Plate>
        </>
      ) : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  preview: { alignSelf: "center", width: 216, height: 384, borderRadius: 16, overflow: "hidden" },
  previewImg: { width: 216, height: 384 },
  info: { gap: space2 },
  footer: { gap: space3 },
});
