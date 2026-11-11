// Invitation à publier avec quelqu'un (lot R8o, maquette R8.13 `p-collab`, vue « dem » ; carte de `GET /me/requests`, `kind
// coauthor`) : « Kenji_66 te propose de publier avec lui » (pour une page : « … avec <page> »), la légende, la vignette,
// « Accepter » / « Refuser ». `id` = la publication, routes `/me/feed-coauthor-requests/:postId/accept` et `/decline`. La
// confirmation de la maquette (« Acceptée : elle apparaît sur vos deux profils, signée des deux ») reste quelques secondes à
// la place des boutons, puis la liste se relit.
import { Button, Icon, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { coauthorLabels as L } from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { CrewPhotoImage } from "@/features/crews/feed/CrewPhotoImage";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { Avatar } from "@/ui/Avatar";

import { fromOf, payloadObject, payloadString, type RequestCardProps, textOf } from "./types";

const { space2, space3 } = tokens.spacing;
const THUMB = tokens.spacing.space12 + tokens.spacing.space2;
/** Le temps de lire la confirmation avant que la demande quitte la liste. */
const CONFIRM_MS = 2500;

export function CoAuthorRequest({ item, onDone }: RequestCardProps) {
  const { t } = useTheme();
  const c = t.color;
  const { name, imageUrl } = fromOf(item);
  const forName = payloadString(item, "forName");
  const caption = payloadString(item, "caption");
  const photoUrl = payloadString(item, "photoUrl");
  const author = textOf(payloadObject(item, "author"), "name") ?? name;
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [answer, setAnswer] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function reply(which: "accept" | "decline") {
    setBusy(which);
    setError(null);
    try {
      await (which === "accept" ? api.acceptCoAuthor(item.id) : api.declineCoAuthor(item.id));
      setAnswer(which);
      timer.current = setTimeout(onDone, CONFIRM_MS);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Plate style={styles.card} testID="request-coauthor">
      <View style={styles.head}>
        <Avatar url={imageUrl} pseudo={name} size={40} />
        <View style={styles.text}>
          <Text variant="bodyStrong" color={c.plateInk}>
            {L.requestTitle(author, forName)}
          </Text>
          {caption ? (
            <Text variant="caption" color={c.plateMuted} testID="request-coauthor-caption">
              {caption}
            </Text>
          ) : null}
        </View>
        {photoUrl ? (
          <View style={[styles.thumb, { backgroundColor: c.night }]}>
            <CrewPhotoImage url={photoUrl} style={styles.thumbImage} resizeMode="cover" accessibilityLabel={author} />
          </View>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" color={c.winText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {answer ? (
        <View style={styles.confirm} testID="request-coauthor-confirm">
          <Icon name="check" size={18} color={c.plateInk} />
          <Text variant="bodyStrong" color={c.plateInk} style={styles.flex}>
            {answer === "accept" ? L.accepted : L.declined(author)}
          </Text>
        </View>
      ) : (
        <View style={styles.row}>
          <Button
            variant="plate"
            icon="check"
            loading={busy === "accept"}
            disabled={busy !== null}
            onPress={() => void reply("accept")}
          >
            {L.accept}
          </Button>
          <Button
            variant="plate"
            tone="dashed"
            icon="close"
            loading={busy === "decline"}
            disabled={busy !== null}
            onPress={() => void reply("decline")}
          >
            {L.decline}
          </Button>
        </View>
      )}
    </Plate>
  );
}

const styles = StyleSheet.create({
  card: { gap: space3, padding: space3 },
  head: { flexDirection: "row", alignItems: "center", gap: space3 },
  text: { flex: 1, gap: 2 },
  flex: { flex: 1, flexShrink: 1 },
  thumb: { width: THUMB, aspectRatio: 0.8, borderRadius: tokens.radius.radiusMd, overflow: "hidden" },
  thumbImage: { width: THUMB, height: THUMB / 0.8 },
  confirm: { flexDirection: "row", alignItems: "center", gap: space2 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
});
