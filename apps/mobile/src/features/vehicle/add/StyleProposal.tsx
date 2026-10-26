// « Il manque un style ? Propose-le » (lot R5a, maquette R5.2) : la ligne en pointillés sous les styles, et la feuille
// « Proposer un style » : un nom (2 à 24 caractères, nettoyé comme les noms tapés du lot R4a), le type du véhicule ; la
// famille est choisie par l'équipe. En modification, le véhicule part avec la proposition ; à l'ajout, il lui est
// rattaché à sa création. Une erreur (déjà dans la liste, trop de demandes) se dit dans la feuille.
import { Button, Icon, Tag, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  type CategoryProposalResult,
  cleanStyleName,
  styleLabels as S,
  STYLE_NAME_MAX,
  type VehicleType,
  vehicleTypeLabels,
} from "@orasso/shared";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";

const { space2, space3 } = tokens.spacing;

/** La ligne en pointillés (`.r5prop`) : « Il manque un style ? » et ce qui se passe ensuite. */
export function ProposeStyleRow({ onPress }: { onPress: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${S.proposeTitle} ${S.proposeText}`}
      onPress={onPress}
      testID="style-propose"
      style={[styles.row, { borderColor: c.line }]}
    >
      <Icon name="add" size={20} color={c.ink} />
      <View style={styles.grow}>
        <Text variant="bodyStrong" color={c.ink}>
          {S.proposeTitle}
        </Text>
        <Text variant="caption" color={c.inkMuted}>
          {S.proposeText}
        </Text>
      </View>
      <Icon name="next" size={16} color={c.inkMuted} />
    </Pressable>
  );
}

export function StyleProposalSheet({
  visible,
  vehicleType,
  vehicleId,
  vehicleName,
  onClose,
  onSent,
}: {
  visible: boolean;
  vehicleType: VehicleType;
  /** Modification : le véhicule de la personne. */
  vehicleId?: string;
  /** « Yamaha » : la note dit où le style sera posé. */
  vehicleName: string | null;
  onClose: () => void;
  onSent: (result: CategoryProposalResult) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setName("");
    setError(null);
    onClose();
  };
  async function send() {
    const label = cleanStyleName(name);
    if (!label) {
      setError(S.nameIssue);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.proposeStyle({ label, vehicleType, ...(vehicleId ? { vehicleId } : {}) });
      setName("");
      onSent(result);
    } catch (e) {
      // Un 429 dit « Trop de demandes », jamais « introuvable ».
      setError(e instanceof ApiRequestError && e.status === 429 ? e.message : errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppSheet visible={visible} onClose={close} accessibilityLabel={S.sheetTitle}>
      <Text variant="title" color={c.ink} accessibilityRole="header">
        {S.sheetTitle}
      </Text>
      <TextField
        label={S.nameField}
        value={name}
        onChangeText={(v) => setName(v.slice(0, STYLE_NAME_MAX))}
        maxLength={STYLE_NAME_MAX}
        autoCapitalize="sentences"
        autoFocus
        testID="style-propose-name"
      />
      <View style={styles.for}>
        <Text variant="caption" color={c.inkMuted}>
          {S.forType}
        </Text>
        <Tag tone="line">{vehicleTypeLabels[vehicleType]}</Tag>
        <Text variant="caption" color={c.inkMuted}>
          {S.familyByTeam}
        </Text>
      </View>
      <View style={styles.note}>
        <Icon name="spark" size={16} color={c.accentText} />
        <Text variant="caption" color={c.inkMuted} style={styles.grow}>
          {S.sheetNote(vehicleName, vehicleType)}
        </Text>
      </View>
      {error ? (
        <Text variant="caption" color={c.winText} accessibilityRole="alert" testID="style-propose-error">
          {error}
        </Text>
      ) : null}
      <Button
        variant="primary"
        icon="send"
        loading={busy}
        fullWidth
        onPress={() => void send()}
        testID="style-propose-send"
      >
        {S.send}
      </Button>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    paddingVertical: space3,
    paddingHorizontal: space3 + 2,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  grow: { flex: 1, minWidth: 0 },
  for: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space2 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: space2 },
});
