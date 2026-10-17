// Export des participants d'un événement (lot 35a, décision D20 ; API du lot 27) : le motif est obligatoire (10 caractères
// au moins), l'export est tracé au journal d'Orasso, les notes internes n'en font jamais partie. Le CSV se partage avec
// la feuille du système. Une feuille de confirmation précède l'envoi, car le fichier contient des données personnelles.
import { Button, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { afterEventLabels as A, orgaManageLabels as L } from "@orasso/shared";
import { useState } from "react";
import { StyleSheet } from "react-native";

import { exportParticipants } from "@/lib/exportParticipants";
import { errorMessage } from "@/lib/http";
import { isTwoFactorError } from "@/lib/orga";
import { exportReasonIssue } from "@/lib/teamModel";
import { Notice } from "@/ui/Notice";
import { ConfirmSheet } from "./ConfirmSheet";

const { space2, space3 } = tokens.spacing;

export function ExportPanel({ eventId, onTwoFactor }: { eventId: string; onTwoFactor: (error: unknown) => void }) {
  const { t } = useTheme();
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const issue = exportReasonIssue(reason);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const outcome = await exportParticipants(eventId, reason);
      setConfirming(false);
      setReason("");
      setDone(outcome === "unavailable" ? L.exportUnavailable : outcome === "saved" ? L.exportSavedWeb : L.exportDone);
    } catch (e) {
      if (isTwoFactorError(e)) {
        setConfirming(false);
        onTwoFactor(e);
      } else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Plate style={styles.block} testID="orga-export">
        <Text variant="body" color={t.color.plateInk}>
          {A.exportIntro}
        </Text>
        <TextField
          label={L.exportReason}
          value={reason}
          onChangeText={(v) => {
            setReason(v);
            setDone(null);
          }}
          help={L.exportReasonHelp}
          maxLength={300}
          autoCorrect={false}
          testID="orga-export-reason"
        />
        <Text variant="caption" color={t.color.plateMuted}>
          {L.exportTrace} {L.exportNotes}
        </Text>
        {done ? (
          <Text variant="bodyStrong" color={t.color.plateInk} testID="orga-export-done">
            {done}
          </Text>
        ) : null}
        <Button
          variant="plate"
          icon="export"
          disabled={issue !== null || busy}
          onPress={() => {
            setError(null);
            setConfirming(true);
          }}
          fullWidth
          testID="orga-export-button"
        >
          {L.exportButton}
        </Button>
      </Plate>
      <ConfirmSheet
        visible={confirming}
        title={L.exportConfirmTitle}
        body={`${L.exportConfirmBody} ${L.exportReason} : ${reason.trim()}`}
        confirmLabel={L.exportConfirm}
        confirmIcon="export"
        busy={busy}
        error={error}
        onConfirm={() => void run()}
        onClose={() => {
          setConfirming(false);
          setError(null);
        }}
      />
      {error && !confirming ? <Notice tone="error">{error}</Notice> : null}
    </>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
});
