// Certification d'un véhicule (lot 31 ; lot M5 : sortie de la page du véhicule pour servir aussi au Garage). La ligne
// d'état (`CertificationLine`) dit d'abord ce qui manque ; la feuille donne le détail au toucher : les conditions
// cochées ou non, la demande quand tout est prêt. Un ancien véhicule (vendu, souvenir, accidenté) ne peut pas être
// certifié : la ligne et la feuille le disent, sans bouton (décision de Damien). La règle est celle de l'API
// (`certificationEligibility` de `packages/shared`) : l'appli n'affiche que ce que l'API renvoie.
import { Icon, Tag, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  certificationConditions,
  certificationLine,
  certificationLineLabels,
  certificationLostLabels,
  certificationMissingLabels,
  certificationStatusLabels,
  type CertificationLine as Line,
  type VehicleCertification,
} from "@orasso/shared";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { SmButton } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";
import { Notice } from "@/ui/Notice";

const { space1, space2, space3 } = tokens.spacing;

/** `.certl` de la maquette 7.1 : pastille bouclier, titre (ce qui manque), détail, chevron ; toucher = la feuille. */
export function CertificationRow({
  cert,
  photoCount,
  onPress,
  testID = "certification-line",
}: {
  cert: Pick<VehicleCertification, "certified" | "missing">;
  photoCount: number;
  onPress?: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  const line = certificationLine(cert, photoCount);
  const headline = certificationLineLabels.headline(line);
  const detail = certificationLineLabels.detail(line, { photoCount, missing: cert.missing });
  const body = (
    <View style={[styles.row, { backgroundColor: c.surfaceRaised }]}>
      <View style={[styles.icon, { backgroundColor: c.ground }]}>
        <Icon name={line.kind === "impossible" ? "lock" : "shield"} size={18} color={c.accentText} />
      </View>
      <View style={styles.grow}>
        <Text variant="bodyStrong" color={c.ink} style={styles.title} testID={`${testID}-title`}>
          {headline}
        </Text>
        <Text variant="caption" color={c.inkMuted} style={styles.detail}>
          {detail}
        </Text>
      </View>
      {onPress ? <Icon name="next" size={18} color={c.ink} /> : null}
    </View>
  );
  // Ancien véhicule : la ligne le dit, sans bouton (rien à demander).
  if (!onPress || line.kind === "impossible") return <View testID={testID}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${headline}. ${detail}`}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      {body}
    </Pressable>
  );
}

/** La feuille « Certification » : conditions, état de la demande, demande quand tout est prêt. */
export function CertificationSheet({
  visible,
  onClose,
  vehicleId,
  photoCount,
  cert,
  onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  vehicleId: string;
  photoCount: number;
  cert: VehicleCertification;
  /** Après la demande : recharger la fiche. */
  onChanged: () => Promise<unknown>;
}) {
  const { t } = useTheme();
  const c = t.color;
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = new Set(cert.missing ?? []);
  const line: Line = certificationLine(cert, photoCount);

  const request = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.requestCertification(vehicleId, message.trim() || null);
      await onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel="Certification">
      <Text variant="posterM" color={c.ink} style={styles.sheetTitle}>
        Certification
      </Text>
      {line.kind === "impossible" ? (
        <Text variant="body" color={c.ink} testID="certification-impossible">
          {certificationLineLabels.detail(line, { photoCount, missing: cert.missing })}
        </Text>
      ) : cert.certified ? (
        <>
          <Tag tone="acc">Certifié</Tag>
          <Text variant="body" color={c.ink}>
            {`Certifié depuis le ${cert.certifiedAt ? formatDay(cert.certifiedAt) : ""}. Elle se perd si la fiche technique est modifiée, ou après six mois sans événement.`}
          </Text>
        </>
      ) : (
        <>
          {cert.lostReason ? (
            <Text variant="body" color={c.winText}>
              {`Certification perdue : ${certificationLostLabels[cert.lostReason].toLowerCase()}.`}
            </Text>
          ) : null}
          {cert.request?.status === "pending" ? (
            <Text variant="bodyStrong" color={c.ink}>
              {`${certificationStatusLabels.pending}. L'équipe Orasso valide à la main.`}
            </Text>
          ) : null}
          {cert.request?.status === "refused" ? (
            <Text variant="body" color={c.winText}>
              {`${certificationStatusLabels.refused}${cert.request.note ? ` : ${cert.request.note}` : "."}`}
            </Text>
          ) : null}
          {certificationConditions.map((cond) => (
            <View key={cond.key} style={styles.condition}>
              <Icon
                name={missing.has(cond.key) ? "close" : "check"}
                size={18}
                color={missing.has(cond.key) ? c.inkMuted : c.accentText}
              />
              <Text variant="body" color={missing.has(cond.key) ? c.inkMuted : c.ink} style={styles.grow}>
                {cond.label}
              </Text>
            </View>
          ))}
          {cert.missing.some((m) => m === "plate" || m === "pending") ? (
            <Text variant="caption" color={c.inkMuted}>
              {cert.missing
                .filter((m) => m === "plate" || m === "pending")
                .map((m) => certificationMissingLabels[m])
                .join(" · ")}
            </Text>
          ) : null}
          {cert.eligible ? (
            <>
              <TextField
                label="Message pour l'équipe (facultatif)"
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={500}
                testID="certification-message"
              />
              <SmButton
                kind="p"
                big
                wide
                icon="check"
                disabled={busy}
                onPress={() => void request()}
                testID="certification-request"
              >
                Demander la certification
              </SmButton>
            </>
          ) : null}
        </>
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2 + 2,
    paddingVertical: space2 + 2,
    paddingHorizontal: space3,
    borderRadius: 14,
  },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  grow: { flex: 1, minWidth: 0 },
  title: { fontSize: 13.5, lineHeight: 17, fontWeight: "800" },
  detail: { fontSize: 12, lineHeight: 16 },
  pressed: { opacity: 0.85 },
  sheetTitle: { fontSize: 18, lineHeight: 19 },
  condition: { flexDirection: "row", alignItems: "center", gap: space2 },
});
