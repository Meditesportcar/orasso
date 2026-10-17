// Casquette Pro, publier : mes publications avec « Modifier » et « Supprimer » (lot 35c). La modification garde la date
// de la publication, donc son mois : le compteur ne bouge pas. La suppression passe par une feuille de confirmation.
import { Button, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { proAppLabels as L, type ProOwner, type ProPostView } from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { useRun } from "@/lib/useRun";
import { AppSheet } from "@/ui/AppSheet";
import { Feedback } from "@/ui/Feedback";
import { Muted } from "@/ui/Muted";
import { Overlay } from "@/ui/Overlay";
import { SectionTitle } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

export function Posts({ pro, reload }: { pro: ProOwner; reload: () => Promise<unknown> }) {
  const { t } = useTheme();
  const { busy, error, notice, run, clear, setError } = useRun();
  const [editing, setEditing] = useState<ProPostView | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [removing, setRemoving] = useState<ProPostView | null>(null);
  const posts = pro.posts ?? [];

  const startEdit = (post: ProPostView) => {
    clear();
    setTitle(post.title);
    setBody(post.body);
    setEditing(post);
  };

  async function save() {
    if (!editing) return;
    if (title.trim().length < 2 || body.trim().length < 2)
      return setError("Le titre et le texte font 2 caractères au moins.");
    const ok = await run(
      "save",
      async () => {
        await api.updateProPost(pro.id, editing.id, { title: title.trim(), body: body.trim() });
        await reload();
      },
      L.postSaved,
    );
    if (ok) setEditing(null);
  }

  async function remove() {
    if (!removing) return;
    const ok = await run(
      "delete",
      async () => {
        await api.deleteProPost(pro.id, removing.id);
        await reload();
      },
      L.postDeleted,
    );
    if (ok) setRemoving(null);
  }

  return (
    <>
      <SectionTitle>{L.postsTitle}</SectionTitle>
      {posts.length === 0 ? (
        <Muted variant="body">{L.postsEmpty}</Muted>
      ) : (
        posts.map((post) => (
          <Plate key={post.id} style={styles.post} testID="pro-post">
            <Text variant="bodyStrong" color={t.color.plateInk}>
              {post.title}
            </Text>
            <Text variant="body" color={t.color.plateInk}>
              {post.body}
            </Text>
            <Text variant="meta" color={t.color.plateMuted}>
              {formatDayHour(post.createdAt)}
            </Text>
            <View style={styles.actions}>
              <Button
                variant="plate"
                icon="chat"
                disabled={busy !== null}
                onPress={() => startEdit(post)}
                fullWidth
                testID="pro-post-edit"
              >
                {L.postEdit}
              </Button>
              <Button
                variant="plate"
                tone="dashed"
                icon="close"
                disabled={busy !== null}
                onPress={() => {
                  clear();
                  setRemoving(post);
                }}
                fullWidth
                testID="pro-post-delete"
              >
                {L.postDelete}
              </Button>
            </View>
          </Plate>
        ))
      )}
      <Feedback
        error={editing || removing ? null : error}
        notice={editing || removing ? null : notice}
        onPlate={false}
        testID="pro-posts-notice"
      />

      <Overlay>
        <AppSheet visible={editing !== null} onClose={() => setEditing(null)} accessibilityLabel={L.postEditTitle}>
          <Text variant="title" color={t.color.ink}>
            {L.postEditTitle}
          </Text>
          <TextField
            label={L.postTitleField}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
            testID="pro-post-title"
          />
          <TextField
            label={L.postBodyField}
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={1000}
            style={{ minHeight: 96 }}
            testID="pro-post-body"
          />
          <Feedback error={error} onPlate={false} />
          <Button
            variant="secondary"
            icon="check"
            loading={busy === "save"}
            onPress={() => void save()}
            fullWidth
            testID="pro-post-save"
          >
            {L.postSave}
          </Button>
          <Button variant="plate" icon="close" onPress={() => setEditing(null)} fullWidth>
            Annuler
          </Button>
        </AppSheet>
      </Overlay>

      <Overlay>
        <ConfirmSheet
          visible={removing !== null}
          title={L.postDeleteTitle}
          body={removing ? `« ${removing.title} » : ${L.postDeleteBody}` : L.postDeleteBody}
          confirmLabel={L.postDelete}
          confirmIcon="close"
          danger
          busy={busy === "delete"}
          error={removing ? error : null}
          onConfirm={() => void remove()}
          onClose={() => {
            setRemoving(null);
            clear();
          }}
        />
      </Overlay>
    </>
  );
}

const styles = StyleSheet.create({
  post: { gap: space1, padding: space3 },
  actions: { gap: space2, paddingTop: space1 },
});
