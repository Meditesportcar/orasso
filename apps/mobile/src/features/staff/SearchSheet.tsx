// « Plaque ou pseudo » (docs/02 : si le QR ne passe pas) : recherche dans la liste du téléphone, sans réseau. Plaque
// entière → hachage salé ; 3 premiers caractères → préfixe ; pseudo → début du pseudo. « Pointer » fait entrer.
import { Button, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { type AccessListEntry, scanRefusalLabels } from "@orasso/shared";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { type SearchHit, type StaffState, searchLocal } from "@/lib/staff/model";
import { AppSheet } from "@/ui/AppSheet";
import { clock } from "./result";

const { space2, space3 } = tokens.spacing;

export function SearchSheet({
  visible,
  state,
  onClose,
  onPoint,
}: {
  visible: boolean;
  state: StaffState | null;
  onClose: () => void;
  onPoint: (entry: AccessListEntry) => void;
}) {
  const { t } = useTheme();
  const [text, setText] = useState("");
  const hits = useMemo(() => (state ? searchLocal(state, text) : []), [state, text]);
  const close = () => {
    setText("");
    onClose();
  };
  return (
    <AppSheet visible={visible} onClose={close} accessibilityLabel="Plaque ou pseudo" maxHeight={0.85}>
      <Text variant="title" color={t.color.ink}>
        Plaque ou pseudo
      </Text>
      <TextField
        label="Plaque (entière ou 3 premiers caractères) ou pseudo"
        value={text}
        onChangeText={setText}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        placeholder="AB-123-CD ou Kenji"
      />
      {text.trim().length >= 2 && hits.length === 0 ? (
        <Text variant="body" color={t.color.ink}>
          Personne dans la liste du téléphone. Synchronise si quelqu'un vient d'être retenu, ou propose l'express.
        </Text>
      ) : null}
      {hits.map((hit) => (
        <HitRow
          key={hit.entry.passId}
          hit={hit}
          onPoint={() => {
            onPoint(hit.entry);
            setText("");
          }}
        />
      ))}
    </AppSheet>
  );
}

export function HitRow({ hit, onPoint }: { hit: SearchHit; onPoint: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  const { entry, checkedInAt } = hit;
  const valid = entry.status === "valid";
  const status = !valid
    ? scanRefusalLabels[entry.revokedReason ?? "cancelled"]
    : checkedInAt
      ? `Entré à ${clock(checkedInAt)}`
      : "Attendu";
  return (
    <Plate style={styles.row}>
      <View style={styles.text}>
        <Text variant="bodyStrong" color={c.plateInk}>
          {entry.vehicleLabel ?? "Sans véhicule"} · {entry.pseudo}
        </Text>
        <Text variant="meta" color={valid && checkedInAt ? c.accent : c.plateMuted}>
          {[entry.zoneCode ? `Zone ${entry.zoneCode}` : null, entry.plateHint ? `${entry.plateHint}-…` : null, status]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      {valid ? (
        <Button variant="plate" icon="check" onPress={onPoint} disabled={Boolean(checkedInAt)}>
          {checkedInAt ? "Pointé" : "Pointer"}
        </Button>
      ) : null}
    </Plate>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space2, padding: space3 },
  text: { flex: 1, gap: 2 },
});
