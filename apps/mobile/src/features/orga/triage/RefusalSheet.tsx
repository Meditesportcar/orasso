// Feuille des motifs de refus (lot 23, prototype « Motif du refus ») : cases à cocher (au moins un motif), note
// obligatoire pour « Autre », case « Envoyer les motifs au candidat ». Elle s'ouvre au glissement à gauche (ou au bouton
// Refuser) AVANT d'armer la décision : annuler la feuille ne refuse rien. Utilisée aussi par le mode liste.
import { Button, CheckboxField, Text, TextField, useTheme } from "@orasso/design-system/native";
import { type RefusalReason, refusalReasonLabels, triageAppLabels } from "@orasso/shared";
import { useEffect, useState } from "react";

import { useRefusalReasons } from "@/lib/lists";
import { type DecisionExtra, refusalProblem } from "@/lib/triage";
import { Notice } from "@/ui/Notice";
import { ScreenSheet } from "./ScreenSheet";

export function RefusalSheet({
  visible,
  title = triageAppLabels.refusalTitle,
  body = triageAppLabels.refusalBody,
  confirmLabel = triageAppLabels.refusalConfirm,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title?: string;
  body?: string;
  confirmLabel?: string;
  onConfirm: (extra: Required<Pick<DecisionExtra, "reasons" | "sendReasons">> & { note: string }) => void;
  onClose: () => void;
}) {
  const { t } = useTheme();
  // Lot 33 : motifs proposés par l'administration (repli sur les constantes partagées).
  const refusalReasons = useRefusalReasons();
  const [reasons, setReasons] = useState<RefusalReason[]>([]);
  const [note, setNote] = useState("");
  const [send, setSend] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);

  // Une feuille neuve à chaque ouverture : on ne garde pas les motifs du refus précédent.
  useEffect(() => {
    if (visible) {
      setReasons([]);
      setNote("");
      setSend(true);
      setProblem(null);
    }
  }, [visible]);

  const toggle = (reason: RefusalReason) =>
    setReasons((cur) => (cur.includes(reason) ? cur.filter((r) => r !== reason) : [...cur, reason]));

  function confirm() {
    const issue = refusalProblem(reasons, note, triageAppLabels);
    setProblem(issue);
    if (!issue) onConfirm({ reasons, note: note.trim(), sendReasons: send });
  }

  return (
    <ScreenSheet visible={visible} onClose={onClose} accessibilityLabel={title}>
      <Text variant="title" color={t.color.ink}>
        {title}
      </Text>
      <Text variant="body" color={t.color.ink}>
        {body}
      </Text>
      {refusalReasons.map((reason) => (
        <CheckboxField
          key={reason}
          checked={reasons.includes(reason)}
          onChange={() => toggle(reason)}
          label={refusalReasonLabels[reason]}
        />
      ))}
      <TextField
        label={triageAppLabels.refusalNote}
        value={note}
        onChangeText={setNote}
        multiline={false}
        maxLength={500}
        returnKeyType="done"
        testID="triage-refusal-note"
      />
      <CheckboxField checked={send} onChange={setSend} label={triageAppLabels.refusalSend} />
      {problem ? <Notice tone="error">{problem}</Notice> : null}
      <Button variant="secondary" icon="check" onPress={confirm} fullWidth testID="triage-refusal-confirm">
        {confirmLabel}
      </Button>
      <Button variant="plate" icon="close" onPress={onClose} fullWidth>
        {triageAppLabels.refusalCancel}
      </Button>
    </ScreenSheet>
  );
}
