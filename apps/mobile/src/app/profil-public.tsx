// Lot R4c (maquette R4.6c) : « Mon profil public », en aperçu. Mon profil tel que le voit un membre connecté (bascule
// « vu par un ami »), calculé par l'API (`/me/public-preview?as=`) avec les règles de `GET /users/:pseudo`. Bandeau
// « Aperçu », boutons inertes, garage en vitrine (le principal en premier), « Régler la confidentialité ».
import { Button, Icon, Text, tokens, useTheme, VehicleCard } from "@orasso/design-system/native";
import { mainVehicleLabels, networkLabels, publicPreviewLabels as P, type PreviewAs } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { SmButton } from "@/features/passionne/kit";
import { PublicHead } from "@/features/profil/network";
import { api } from "@/lib/api";
import { mediaSource } from "@/lib/media";
import { useApi } from "@/lib/useApi";
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

      {p ? (
        <>
          <PublicHead
            p={p}
            actions={
              // Les boutons ne font rien dans l'aperçu : c'est ce que voient les autres.
              <View style={styles.inert} pointerEvents="none" accessibilityElementsHidden testID="preview-actions">
                <View style={styles.grow}>
                  <Button variant="primary" icon={as === "friend" ? "check" : "add"} fullWidth>
                    {as === "friend" ? "Ami" : "Ajouter en ami"}
                  </Button>
                </View>
                {p.follow.canFollow ? (
                  <Button variant="secondary" icon="add">
                    {networkLabels.follow}
                  </Button>
                ) : null}
                <SmButton kind="s" icon="chat" big accessibilityLabel="Écrire" />
              </View>
            }
          />
          <Muted variant="caption">{P.inert}</Muted>

          {limited ? (
            <>
              <View style={styles.secHead}>
                <Text variant="posterM" color={c.ink}>
                  {P.vehiclesPrivate}
                </Text>
                <Muted variant="caption">{P.vehiclesPrivateHint}</Muted>
              </View>
              <View style={styles.plist} testID="preview-vehicles">
                {p.vehicles.map((v) => (
                  <View key={v.id} style={[styles.pitem, { backgroundColor: c.surface }]}>
                    <Icon name="vehicle" size={16} color={c.ink} />
                    <Text variant="bodyStrong" color={c.ink}>
                      {v.label}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={[styles.note, { backgroundColor: c.surface }]}>
                <Icon name="lock" size={16} color={c.inkMuted} />
                <Text variant="caption" color={c.inkMuted} style={styles.bannerText}>
                  {P.privateRest}
                </Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.secHead}>
                <Text variant="posterM" color={c.ink}>
                  {P.garage}
                </Text>
                <Muted variant="caption">{`${p.vehicles.length} véhicule${p.vehicles.length > 1 ? "s" : ""}`}</Muted>
              </View>
              <View style={styles.plist} testID="preview-vehicles">
                {p.vehicles.map((v, i) => (
                  <VehicleCard
                    key={v.id}
                    first={i === 0}
                    name={v.label}
                    facts={v.main ? `★ ${mainVehicleLabels.tag}` : undefined}
                    photo={{
                      source: mediaSource(v.photoUrl),
                      placeholder: `linear-gradient(135deg, ${c.surfaceRaised} 0%, ${c.night} 100%)`,
                    }}
                  />
                ))}
              </View>
            </>
          )}
        </>
      ) : null}

      <View style={styles.buttons}>
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
        {/* Photo, pseudo, description : l'édition était derrière l'ancienne ligne « Mon profil public » des réglages. */}
        <SmButton kind="g" icon="edit" wide onPress={() => router.push("/reglages/profil")} testID="preview-edit">
          Modifier ma photo, mon pseudo, ma description
        </SmButton>
      </View>
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
  inert: { flexDirection: "row", gap: space2, opacity: 0.6, alignItems: "center" },
  grow: { flex: 1 },
  secHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space2 },
  plist: { gap: space2 },
  pitem: { flexDirection: "row", alignItems: "center", gap: space2, padding: space3, borderRadius: 12 },
  note: { flexDirection: "row", gap: space2, alignItems: "flex-start", padding: space3, borderRadius: 14 },
  buttons: { gap: space2 },
});
