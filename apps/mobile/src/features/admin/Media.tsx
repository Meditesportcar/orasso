// Casquette Administration (lot 57, parité du site `/admin/medias`) : profils média à vérifier. D26 : aucun numéro de
// carte de presse ; l'équipe vérifie le profil (nom, formats, liens) et pose ou retire « Profil vérifié »
// (`POST /admin/media/:id/verify`, tracé au journal d'administration).
import { Button, Chip, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { adminTexts, adminAppLabels as L, mediaAppLabels as M, mediaFormatLabels } from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Notice } from "@/ui/Notice";
import { AdminFailure, AdminGate, AdminPage, EmptyOrLoading, Filters, useGesture } from "./kit";

const { space2, space3 } = tokens.spacing;

function MediaBody() {
  const { t } = useTheme();
  const [filter, setFilter] = useState<"to_verify" | "all">("to_verify");
  const rows = useApi(() => api.adminMedia(filter === "to_verify"), [filter]);
  const gesture = useGesture();
  const [notice, setNotice] = useState<string | null>(null);

  async function toggle(id: string, verified: boolean) {
    setNotice(null);
    const ok = await gesture.run(() => api.verifyMedia(id, verified));
    if (!ok) return;
    setNotice(L.doneLogged);
    await rows.reload();
  }

  return (
    <AdminPage title="Médias" onRefresh={rows.reload}>
      <Filters
        value={filter}
        options={[
          { id: "to_verify", label: L.proFilterToVerify },
          { id: "all", label: L.proFilterAll },
        ]}
        onChange={setFilter}
      />
      <AdminFailure error={rows.error} />
      {gesture.error ? <Notice tone="error">{gesture.error}</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}
      {!rows.data ? (
        <EmptyOrLoading loading={rows.loading} empty={adminTexts.noResult} />
      ) : rows.data.length === 0 ? (
        <Notice>{adminTexts.noResult}</Notice>
      ) : null}
      {(rows.data ?? []).map((m) => (
        <Plate key={m.id} style={styles.block} testID="admin-media-row">
          <Text variant="title" color={t.color.plateInk}>
            {m.name}
          </Text>
          <View style={styles.chips}>
            <Chip surface="plate" variant={m.verifiedAt ? "verified" : "default"}>
              {m.verifiedAt ? M.profileVerified : M.profileToVerify}
            </Chip>
            {m.formats.map((f) => (
              <Chip key={f} surface="plate">
                {mediaFormatLabels[f]}
              </Chip>
            ))}
          </View>
          <Text variant="caption" color={t.color.plateMuted}>
            {[m.website, m.instagram, m.youtube].filter(Boolean).join(" · ") || m.issue || ""}
          </Text>
          <Button
            variant="plate"
            icon={m.verifiedAt ? "close" : "check"}
            loading={gesture.busy}
            onPress={() => void toggle(m.id, !m.verifiedAt)}
            fullWidth
            testID="admin-media-verify"
          >
            {m.verifiedAt ? "Retirer « Profil vérifié »" : "Vérifier le profil"}
          </Button>
        </Plate>
      ))}
    </AdminPage>
  );
}

export function MediaScreen() {
  return (
    <AdminGate title="Médias">
      <MediaBody />
    </AdminGate>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
});
