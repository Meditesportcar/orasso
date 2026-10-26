// Lot R4c (maquette R4.6c) : « Mon profil public », en aperçu. Mon profil tel que le voit un membre connecté (bascule
// « vu par un ami »), calculé par l'API (`/me/public-preview?as=`) avec les règles de `GET /users/:pseudo`. Bandeau
// « Aperçu », boutons inertes, « Régler la confidentialité ».
// Lot R5b (maquette R5.6) : le même écran que le profil d'un membre (`PublicProfile`) ; l'aperçu ajoute seulement le
// bandeau et « Modifier » en haut (vers « Modifier mon profil »).
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { publicPreviewLabels as P, type PreviewAs, publicProfileLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { PublicProfile } from "@/features/profil/PublicProfile";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

export default function ProfilPublic() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const [as, setAs] = useState<PreviewAs>("member");
  const preview = useApi(() => api.publicPreviewAs(as), [as]);
  const p = preview.data;
  const limited = p?.audience === "public_limited";
  const banner = as === "friend" ? P.bannerFriend : limited ? P.bannerMemberPrivate : P.bannerMemberPublic;

  return (
    <FlowScreen
      title={P.title}
      facts={P.subtitle}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/profil"))}
      closeLabel="Retour au profil"
      onRefresh={preview.reload}
      actions={
        <SmButton kind="s" icon="edit" onPress={() => router.push("/reglages/profil")} testID="preview-edit">
          {publicProfileLabels.edit}
        </SmButton>
      }
    >
      <View style={[styles.seg, { backgroundColor: c.surfaceRaised }]} accessibilityRole="tablist" testID="preview-as">
        {(["member", "friend"] as const).map((x) => {
          const on = x === as;
          return (
            <SmButton
              key={x}
              kind={on ? "k" : "g"}
              icon={x === "member" ? "profile" : "staff"}
              onPress={() => setAs(x)}
              style={styles.segBtn}
              testID={`preview-as-${x}`}
            >
              {x === "member" ? P.asMember : P.asFriend}
            </SmButton>
          );
        })}
      </View>

      <View style={[styles.banner, { backgroundColor: c.surface, borderColor: c.accent }]} testID="preview-banner">
        <Icon name="eye" size={16} color={c.accentText} />
        <Text variant="caption" color={c.ink} style={styles.bannerText}>
          {banner}
        </Text>
      </View>

      {preview.error ? <Notice tone="error">{preview.error.message}</Notice> : null}
      {!p ? <Muted variant="body">Chargement…</Muted> : null}
      {p ? <PublicProfile p={p} mode="preview" previewAsFriend={as === "friend"} /> : null}

      <SmButton
        kind="s"
        icon="lock"
        big
        wide
        onPress={() => router.push("/reglages/confidentialite")}
        testID="preview-privacy"
      >
        {P.privacy}
      </SmButton>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: "row", gap: space1, padding: 4, borderRadius: 14 },
  segBtn: { flex: 1 },
  banner: {
    flexDirection: "row",
    gap: space2,
    alignItems: "flex-start",
    padding: space3,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  bannerText: { flex: 1, fontSize: 12.5, lineHeight: 17 },
});
