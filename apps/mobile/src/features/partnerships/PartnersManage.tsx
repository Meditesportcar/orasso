// Lot R7m1 : côté pro, dans « Modifier ma fiche » : mes propositions en attente (« Retirer la proposition ») et mes partenaires
// (« Mettre fin », feuille de confirmation : la personne est prévenue, les contenus déjà publiés gardent leur mention). Après
// la date de l'abonnement, la ligne « Réservé à l'abonnement pro » dit pourquoi on ne propose plus. Proposer se fait depuis
// le profil d'un passionné.
import { Button, Text, tokens, useTheme } from "@orasso/design-system/native";
import { gradeLabels, partnershipLabels as L, type ProPartnershipRow, type ProPartnerships } from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { Avatar } from "@/ui/Avatar";
import { SecH } from "@/ui/KitTz";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { EndSheet } from "./EndSheet";

const { space2, space3 } = tokens.spacing;

function Row({ row, label, onEnd }: { row: ProPartnershipRow; label: string; onEnd: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View
      style={[styles.card, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
      testID="partnership-row"
    >
      <View style={styles.head}>
        <Avatar url={row.user.avatarUrl} pseudo={row.user.pseudo} size={40} />
        <View style={styles.text}>
          <Text variant="bodyStrong" color={c.ink}>
            {row.user.pseudo}
          </Text>
          <Text variant="caption" color={c.inkMuted}>
            {[gradeLabels[row.user.grade], row.vehicle?.label].filter(Boolean).join(" · ")}
          </Text>
        </View>
      </View>
      <Text variant="caption" color={c.inkMuted}>
        {`« ${row.message} »`}
      </Text>
      <Button variant="secondary" icon="close" fullWidth onPress={onEnd} testID="partnership-end">
        {label}
      </Button>
    </View>
  );
}

export function PartnersManage({
  proId,
  data,
  reload,
}: {
  proId: string;
  data: ProPartnerships | null;
  reload: () => Promise<unknown>;
}) {
  const [ending, setEnding] = useState<ProPartnershipRow | null>(null);
  if (!data) return null;
  const pending = data.items.filter((i) => i.status === "pending");
  const active = data.items.filter((i) => i.status === "active");
  return (
    <View style={styles.section} testID="pro-partnerships">
      <SecH title={L.mineTitle} hint={L.partnersCount(active.length)} />
      {data.canPropose === "subscription_required" ? (
        <Notice testID="partnership-locked">{L.subscriptionOnly}</Notice>
      ) : null}
      {data.canPropose === "not_verified" ? <Notice>{L.notVerified}</Notice> : null}
      {pending.length ? (
        <>
          <Muted variant="label">{L.pendingTitle.toUpperCase()}</Muted>
          {pending.map((r) => (
            // Une proposition sans réponse se retire d'un geste : personne n'a encore rien accepté.
            <Row
              key={r.id}
              row={r}
              label={L.withdraw}
              onEnd={() => void api.endPartnershipAsPro(proId, r.id).then(() => reload())}
            />
          ))}
        </>
      ) : null}
      {active.map((r) => (
        <Row key={r.id} row={r} label={L.end} onEnd={() => setEnding(r)} />
      ))}
      {!pending.length && !active.length ? <Muted variant="body">{L.partnersEmpty}</Muted> : null}
      <EndSheet
        visible={ending !== null}
        name={ending?.user.pseudo ?? ""}
        forPro
        onClose={() => setEnding(null)}
        onConfirm={async () => {
          if (!ending) return;
          await api.endPartnershipAsPro(proId, ending.id);
          setEnding(null);
          await reload();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space2 },
  card: { gap: space3, padding: space3, borderRadius: 14 },
  head: { flexDirection: "row", alignItems: "center", gap: space3 },
  text: { flex: 1, gap: 2 },
});
