// Casquette Pro, Publier : une offre ou une actualité pour mes abonnés, avec le compteur du mois (limite mensuelle).
import { Button, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet } from "react-native";

import { api } from "@/lib/endpoints";
import { errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";

const { space2, space3 } = tokens.spacing;

export default function ProPublier() {
  const { t } = useTheme();
  const router = useRouter();
  const myPro = useApi(() => api.myPro(), [], { cacheKey: "my-pro" });
  const pro = myPro.data;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function publish() {
    if (!pro) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.createProPost(pro.id, { title: title.trim(), body: body.trim() });
      setTitle("");
      setBody("");
      setMessage({ text: "Publié : tes abonnés la voient sur ta fiche.", error: false });
      await myPro.reload();
    } catch (error) {
      setMessage({ text: errorMessage(error), error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <FlowScreen
      title="Publier"
      facts={pro ? `${pro.postsUsed} / ${pro.postsLimit} ce mois-ci` : undefined}
      onClose={() => router.replace("/accueil")}
    >
      {!pro ? (
        myPro.loading ? null : <Notice>Tu n'as pas encore de fiche pro. Crée-la sur le site Orasso.</Notice>
      ) : !pro.published ? (
        <Notice>Publie ta fiche sur le site pour pouvoir écrire à tes abonnés.</Notice>
      ) : (
        <>
          <Plate style={styles.block}>
            <Text variant="label" color={t.color.plateMuted}>
              Publications ce mois-ci
            </Text>
            <Text variant="posterL" color={t.color.plateInk} testID="pro-posts-counter">
              {pro.postsUsed} / {pro.postsLimit}
            </Text>
            <Text variant="caption" color={t.color.plateMuted}>
              {pro.followersCount} abonné{pro.followersCount > 1 ? "s" : ""} voient tes publications.
            </Text>
          </Plate>
          {pro.postsRemaining === 0 ? (
            <Notice>Limite du mois atteinte. Le compteur repart au 1er du mois prochain.</Notice>
          ) : (
            <>
              <SectionTitle>Nouvelle publication</SectionTitle>
              <TextField label="Titre" value={title} onChangeText={setTitle} maxLength={80} />
              <TextField
                label="Texte"
                value={body}
                onChangeText={setBody}
                multiline
                maxLength={1000}
                style={{ minHeight: 96 }}
              />
              {message ? (
                <Text
                  variant="caption"
                  color={message.error ? t.color.winText : t.color.ink}
                  accessibilityRole={message.error ? "alert" : undefined}
                >
                  {message.text}
                </Text>
              ) : null}
              <Button
                variant="primary"
                icon="chat"
                loading={busy}
                disabled={title.trim().length < 2 || body.trim().length < 2}
                onPress={() => void publish()}
                fullWidth
              >
                Publier
              </Button>
            </>
          )}
          <Muted variant="caption">Les publications sont visibles par tes abonnés sur ta fiche.</Muted>
        </>
      )}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
});
