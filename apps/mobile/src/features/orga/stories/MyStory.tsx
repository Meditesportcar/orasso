// Casquette Organisateur, « Ma story » (lot R7h, maquette R7.14 `og_mine`) : les stories de la structure, publiées par elle
// ou ajoutées depuis une mention (crédit de l'auteur), chacune avec « Retirer ». L'anneau « EN COURS » se lit sur le Fil.
import { Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { storyShareLabels as L, type StoryView, storyAuthorKeyOf } from "@orasso/shared";
import { useRouter } from "expo-router";
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

export function MyStoryScreen() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { structureId, structureName } = useOrga();
  const close = useCloseTo("/(orga)/direct");
  const key = storyAuthorKeyOf("structure", structureId);
  const data = useApi(() => api.storiesByAuthor(key), [key]);
  const [gone, setGone] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list: StoryView[] = (data.data?.stories ?? []).filter((s) => !gone.includes(s.id));

  const remove = async (s: StoryView) => {
    if (!(await confirmRemove(L.removeConfirm))) return;
    setBusy(s.id);
    setError(null);
    try {
      await api.storyDelete(s.id);
      setGone((g) => [...g, s.id]);
      setNotice(L.removeDone);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <FlowScreen title={L.mineTitle} facts={structureName} onClose={close} onRefresh={data.reload}>
      <OrgaFailure error={data.error} />
      <Muted variant="body">{L.mineHint}</Muted>
      {!data.data && !data.error ? <Muted variant="body">Chargement…</Muted> : null}
      {data.data && list.length === 0 ? <Muted variant="body">{L.mineEmpty}</Muted> : null}
      {notice ? <Notice>{notice}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <View style={styles.list} testID="mystory-list">
        {list.map((s) => (
          <Plate key={s.id} style={styles.row} testID="mystory-row">
            <View style={styles.thumb}>
              <CrewPhotoImage url={s.mediaUrl} style={styles.thumbImg} resizeMode="cover" />
            </View>
            <View style={styles.text}>
              <Text variant="caption" color={c.plateMuted}>
                {formatDayHour(s.createdAt)}
              </Text>
              {s.sharedFrom ? (
                <Text variant="bodyStrong" color={c.plateInk} testID="mystory-credit">
                  {L.mineAddedBy(s.sharedFrom.name)}
                </Text>
              ) : null}
              {s.caption ? (
                <Text variant="caption" color={c.plateMuted} numberOfLines={2}>
                  {s.caption}
                </Text>
              ) : null}
              <SmButton
                kind="s"
                icon="close"
                onPress={() => void remove(s)}
                disabled={busy === s.id}
                testID="mystory-remove"
              >
                {L.remove}
              </SmButton>
            </View>
          </Plate>
        ))}
      </View>
      <SmButton kind="s" icon="camera" onPress={() => router.push("/story/publier" as never)} testID="mystory-publish">
        Ajouter une photo
      </SmButton>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space2 },
  row: { flexDirection: "row", gap: space3 },
  thumb: { width: 54, height: 96, borderRadius: 10, overflow: "hidden" },
  thumbImg: { width: 54, height: 96 },
  text: { flex: 1, gap: 4, alignItems: "flex-start" },
});
