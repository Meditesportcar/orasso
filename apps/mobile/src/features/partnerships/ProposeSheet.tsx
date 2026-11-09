// Lot R7m1 (maquette R7.19 `pp_feuille`) : la feuille « Proposer un partenariat », ouverte depuis le profil d'un passionné par
// un pro vérifié : un texte court (200 caractères au plus), un véhicule concerné parmi ceux que son profil montre
// (facultatif), puis « Envoyer la proposition ». La demande arrive dans Activité › Demandes de la personne. Aucune somme,
// aucun champ de rémunération : Orasso ne touche à aucun paiement entre eux. Les règles (qui propose, véhicule visible,
// doublon) sont celles de l'API ; la feuille montre son message.
import { Icon, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { partnershipLabels as L, PARTNERSHIP_MESSAGE_MAX } from "@orasso/shared";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";
import { SmButton } from "@/ui/Kit";
import { Notice } from "@/ui/Notice";

const { space1, space2, space3 } = tokens.spacing;

export type ProposeTarget = {
  pseudo: string;
  /** Les voitures que le profil montre à ce pro (sa liste détaillée), au choix. */
  vehicles: { id: string; label: string }[];
};

export function ProposeSheet({
  proId,
  proName,
  target,
  onClose,
  onSent,
}: {
  proId: string;
  proName: string;
  /** La personne visée ; `null` : feuille fermée. */
  target: ProposeTarget | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const [message, setMessage] = useState("");
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Une nouvelle ouverture repart d'une feuille vide (jamais le mot écrit pour quelqu'un d'autre).
  useEffect(() => {
    if (!target) return;
    setMessage("");
    setVehicleId(null);
    setError(null);
  }, [target]);

  async function send() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await api.proposePartnership(proId, { userPseudo: target.pseudo, vehicleId, message: message.trim() });
      onSent();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const options: { id: string | null; title: string; hint: string; icon: "profile" | "vehicle" }[] = target
    ? [
        { id: null, title: L.noVehicle, hint: L.noVehicleHint(target.pseudo), icon: "profile" },
        ...target.vehicles.map((v) => ({
          id: v.id,
          title: v.label,
          hint: L.vehicleHint(proName),
          icon: "vehicle" as const,
        })),
      ]
    : [];

  return (
    <AppSheet visible={target !== null} onClose={onClose} accessibilityLabel={L.sheetTitle}>
      {target ? (
        <>
          <View style={styles.head}>
            <View style={styles.headText}>
              <Text variant="posterM" color={c.ink} accessibilityRole="header" style={styles.title}>
                {L.sheetTitle}
              </Text>
              <Text variant="caption" color={c.inkMuted}>
                {L.sheetTo(target.pseudo)}
              </Text>
            </View>
          </View>
          <TextField
            label={`${L.messageLabel} · ${L.messageHint}`}
            value={message}
            onChangeText={setMessage}
            maxLength={PARTNERSHIP_MESSAGE_MAX}
            placeholder={L.messagePlaceholder}
            multiline
            testID="partnership-message"
          />
          <Text variant="label" color={c.inkMuted}>
            {`${L.vehicleLabel} · ${L.vehicleOptional}`.toUpperCase()}
          </Text>
          <View style={styles.options} accessibilityRole="radiogroup">
            {options.map((o) => {
              const on = o.id === vehicleId;
              return (
                <Pressable
                  key={o.id ?? "none"}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${o.title}, ${o.hint}`}
                  onPress={() => setVehicleId(o.id)}
                  testID={o.id ? `partnership-vehicle-${o.id}` : "partnership-vehicle-none"}
                  style={[
                    styles.option,
                    { backgroundColor: c.surface, borderColor: on ? c.accent : c.line },
                    on && { borderWidth: 2 },
                  ]}
                >
                  <Icon name={o.icon} size={20} color={on ? c.accentText : c.inkMuted} />
                  <View style={styles.optionText}>
                    <Text variant="bodyStrong" color={c.ink}>
                      {o.title}
                    </Text>
                    <Text variant="caption" color={c.inkMuted}>
                      {o.hint}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <View style={[styles.notes, { backgroundColor: c.surface, borderColor: c.line }]}>
            {[
              { icon: "bell" as const, text: L.noteRequest(target.pseudo) },
              { icon: "close" as const, text: L.noteEnd },
              { icon: "info" as const, text: L.noteMoney },
            ].map((n) => (
              <View key={n.text} style={styles.note}>
                <Icon name={n.icon} size={16} color={c.accentText} />
                <Text variant="caption" color={c.inkMuted} style={styles.noteText}>
                  {n.text}
                </Text>
              </View>
            ))}
          </View>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <SmButton
            kind="p"
            big
            wide
            icon="send"
            disabled={busy || message.trim().length === 0}
            onPress={() => void send()}
            testID="partnership-send"
          >
            {L.send}
          </SmButton>
        </>
      ) : null}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space2 },
  headText: { flex: 1, gap: 2 },
  title: { fontSize: 18, lineHeight: 20 },
  options: { gap: space2 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space3,
    borderRadius: 14,
    borderWidth: 1,
  },
  optionText: { flex: 1, gap: 2 },
  notes: { gap: space2, padding: space3, borderRadius: 14, borderWidth: 1 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: space2 },
  noteText: { flex: 1, paddingTop: space1 - 2 },
});
