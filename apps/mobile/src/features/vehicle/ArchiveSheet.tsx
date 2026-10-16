// Feuille « Vendu / Souvenir / Accidenté » (lot 31) : archive un véhicule du garage actif, avec un motif facultatif.
// Un véhicule archivé ne candidate plus ; sa plaque devient facultative et redevient libre pour les autres.

import { Button, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { archiveStatusChoices, type VehicleStatus } from "@orasso/shared";
import { useState } from "react";
import { Pressable, StyleSheet } from "react-native";

import { errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";
import { plateText } from "@/ui/plateText";

const { space1, space2, space3 } = tokens.spacing;

export function ArchiveSheet({
  visible,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (status: Exclude<VehicleStatus, "active">, note: string | null) => Promise<void>;
}) {
  const { t } = useTheme();
  const [status, setStatus] = useState<Exclude<VehicleStatus, "active"> | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel="Archiver le véhicule">
      <Text variant="title" color={t.color.ink}>
        Archiver ce véhicule
      </Text>
      <Text variant="body" color={t.color.inkMuted}>
        Il quitte ton garage actif et ne candidate plus. Sa plaque redevient libre.
      </Text>
      {archiveStatusChoices.map((c) => {
        const on = status === c.status;
        return (
          <Pressable
            key={c.status}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={c.label}
            onPress={() => setStatus(c.status)}
          >
            <Plate style={[styles.choice, on && { borderColor: t.color.accent, borderWidth: 2 }]}>
              <Text variant="bodyStrong" color={on ? plateText.accent : t.color.plateInk}>
                {c.label}
              </Text>
              <Text variant="caption" color={t.color.plateMuted}>
                {c.hint}
              </Text>
            </Plate>
          </Pressable>
        );
      })}
      <TextField label="Motif (facultatif)" value={note} onChangeText={setNote} maxLength={300} />
      {error ? (
        <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button
        variant="secondary"
        icon="entry"
        loading={busy}
        disabled={!status}
        fullWidth
        onPress={async () => {
          if (!status) return;
          setBusy(true);
          setError(null);
          try {
            await onConfirm(status, note.trim() || null);
            setStatus(null);
            setNote("");
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Archiver
      </Button>
      <Button variant="plate" icon="back" disabled={busy} onPress={onClose} fullWidth>
        Annuler
      </Button>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  choice: { gap: space1, padding: space3, marginBottom: space2 },
});
