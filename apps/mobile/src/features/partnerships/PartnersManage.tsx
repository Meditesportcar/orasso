// Lot R7m1 : côté pro, dans « Modifier ma fiche » : mes propositions en attente (« Retirer la proposition ») et mes partenaires
// (« Mettre fin », feuille de confirmation : la personne est prévenue, les contenus déjà publiés gardent leur mention). Après
// la date de l'abonnement, la ligne « Réservé à l'abonnement pro » dit pourquoi on ne propose plus. Proposer se fait depuis
// le profil d'un passionné. Tour 2 : retirer une proposition a le même retour que « Mettre fin » (occupé, erreur visible,
// « Réessayer ») ; une panne de lecture ne ressemble pas à « aucun partenaire ».
import { Button, Text, tokens, useTheme } from "@orasso/design-system/native";
import { gradeLabels, partnershipLabels as L, type ProPartnershipRow, type ProPartnerships } from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { Avatar } from "@/ui/Avatar";
import { SecH } from "@/ui/KitTz";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { EndSheet } from "./EndSheet";

const { space2, space3 } = tokens.spacing;

function Row({
  row,
  label,
  onEnd,
}: {
  row: ProPartnershipRow;
  label: string;
  /** Une promesse : le bouton est occupé tant qu'elle court, et son échec s'affiche dans la carte. */
  onEnd: () => Promise<unknown>;
}) {
  const { t } = useTheme();
  const c = t.color;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function press() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onEnd();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
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
      {error ? (
        <Notice tone="error" testID="partnership-end-error">
          {error}
        </Notice>
      ) : null}
      <Button
        variant="secondary"
        icon={error ? "undo" : "close"}
        fullWidth
        loading={busy}
        disabled={busy}
        onPress={() => void press()}
        testID="partnership-end"
      >
        {error ? L.retry : label}
      </Button>
    </View>
  );
}

export function PartnersManage({
  proId,
  data,
  error,
  reload,
}: {
  proId: string;
  data: ProPartnerships | null;
  /** La lecture a échoué : on le dit (jamais confondu avec « aucun partenaire »). */
  error?: boolean;
  reload: () => Promise<unknown>;
}) {
  const [ending, setEnding] = useState<ProPartnershipRow | null>(null);
  if (!data) {
    return error ? (
      <View style={styles.section} testID="pro-partnerships-error">
        <LoadError message={L.proPartnershipsLoadError} onRetry={() => void reload()} />
      </View>
    ) : null;
  }
  const pending = data.items.filter((i) => i.status === "pending");
  const active = data.items.filter((i) => i.status === "active");
  return (
    <View style={styles.section} testID="pro-partnerships">
      <SecH title={L.mineTitle} hint={L.partnersCount(active.length)} />
      {data.canPropose === "subscription_required" ? (
        <Notice testID="partnership-locked">{L.subscriptionOnly}</Notice>
      ) : null}
      {data.canPropose === "not_verified" ? <Notice>{L.notVerified}</Notice> : null}
      {data.canPropose === "not_published" ? <Notice>{L.notPublished}</Notice> : null}
      {pending.length ? (
        <>
          <Muted variant="label">{L.pendingTitle.toUpperCase()}</Muted>
          {pending.map((r) => (
            // Une proposition sans réponse se retire d'un geste : personne n'a encore rien accepté.
            <Row
              key={r.id}
              row={r}
              label={L.withdraw}
              onEnd={async () => {
                try {
                  await api.endPartnershipAsPro(proId, r.id, "pending");
                } catch (e) {
                  // La personne vient peut-être d'accepter : la liste se relit pour dire la vérité.
                  void reload();
                  throw e;
                }
                await reload();
              }}
            />
          ))}
        </>
      ) : null}
      {active.map((r) => (
        <Row key={r.id} row={r} label={L.end} onEnd={async () => setEnding(r)} />
      ))}
      {!pending.length && !active.length ? <Muted variant="body">{L.partnersEmpty}</Muted> : null}
      <EndSheet
        visible={ending !== null}
        name={ending?.user.pseudo ?? ""}
        forPro
        onClose={() => setEnding(null)}
        onConfirm={async () => {
          if (!ending) return;
          await api.endPartnershipAsPro(proId, ending.id, "active");
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
