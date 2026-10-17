// Pros partenaires de la structure (lot 35a, décision D20) : les demandes des pros s'acceptent ou se refusent, un
// partenaire accepté se retire (confirmation). Mêmes routes et mêmes mots que la page Structure du site.
import { Button, Chip, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { orgaManageLabels as L, type StructurePartnerRow } from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { Muted } from "@/ui/Muted";
import { SectionTitle } from "@/ui/Screens";
import { ConfirmSheet } from "../ConfirmSheet";
import { failWith } from "../team/fail";

const { space2, space3 } = tokens.spacing;

export function PartnersPanel({
  structureId,
  structureName,
  partners,
  onChanged,
  onTwoFactor,
}: {
  structureId: string;
  structureName: string;
  partners: StructurePartnerRow[];
  onChanged: (message: string) => void;
  onTwoFactor: (error: unknown) => void;
}) {
  const { t } = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const [dropping, setDropping] = useState<StructurePartnerRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(row: StructurePartnerRow, kind: "accept" | "drop") {
    setBusy(row.proSlug);
    setError(null);
    try {
      if (kind === "accept") await api.acceptPartner(structureId, row.proSlug);
      else await api.dropPartner(structureId, row.proSlug);
      setDropping(null);
      onChanged(kind === "accept" ? L.partnerAcceptDone : L.partnerDropDone);
    } catch (e) {
      failWith(e, setError, onTwoFactor);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <SectionTitle>{L.partnersTitle}</SectionTitle>
      <Muted variant="caption">{L.partnersIntro(structureName)}</Muted>
      {partners.length === 0 ? (
        <Muted variant="body">{L.partnersEmpty}</Muted>
      ) : (
        partners.map((p) => (
          <Plate key={p.proSlug} style={styles.block} testID="orga-partner">
            <View style={styles.head}>
              <Text variant="bodyStrong" color={t.color.plateInk} style={styles.grow}>
                {p.proName}
              </Text>
              <Chip surface="plate">{p.status === "accepted" ? L.partnerAccepted : L.partnerPending}</Chip>
            </View>
            <View style={styles.buttons}>
              {p.status === "pending" ? (
                <Button
                  variant="plate"
                  icon="check"
                  loading={busy === p.proSlug}
                  disabled={busy !== null}
                  onPress={() => void act(p, "accept")}
                  style={styles.grow}
                  testID="orga-partner-accept"
                >
                  {L.partnerAccept}
                </Button>
              ) : null}
              <Button
                variant="plate"
                tone={p.status === "pending" ? "dashed" : "default"}
                icon="close"
                disabled={busy !== null}
                onPress={() => {
                  setError(null);
                  setDropping(p);
                }}
                style={styles.grow}
                testID="orga-partner-drop"
              >
                {p.status === "accepted" ? L.partnerDropAccepted : L.partnerDropPending}
              </Button>
            </View>
          </Plate>
        ))
      )}
      <ConfirmSheet
        visible={dropping !== null}
        title={L.partnerDropTitle(dropping?.proName ?? "")}
        body={L.partnerDropBody}
        confirmLabel={dropping?.status === "accepted" ? L.partnerDropAccepted : L.partnerDropPending}
        confirmIcon="close"
        danger
        busy={busy !== null}
        error={error}
        onConfirm={() => dropping && void act(dropping, "drop")}
        onClose={() => {
          setDropping(null);
          setError(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  head: { flexDirection: "row", alignItems: "center", gap: space2 },
  grow: { flex: 1 },
  buttons: { flexDirection: "row", gap: space2 },
});
