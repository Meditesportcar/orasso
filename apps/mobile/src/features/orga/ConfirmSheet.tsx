// Feuille de confirmation de la casquette Organisateur (lot 22) : un titre, un texte qui dit ce qui va se passer, un
// champ éventuel (mot à retaper, motif), et deux boutons. Toute action qui prévient des inscrits passe par ici.
import { Button, type IconName, Text, useTheme } from "@orasso/design-system/native";
import type { ReactNode } from "react";

import { AppSheet } from "@/ui/AppSheet";
import { Notice } from "@/ui/Notice";
import { ScreenSheet } from "./triage/ScreenSheet";

export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  confirmIcon = "check",
  cancelLabel = "Annuler",
  danger = false,
  busy = false,
  disabled = false,
  modal = false,
  error,
  children,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  confirmIcon?: IconName;
  cancelLabel?: string;
  /** Action définitive (annulation) : le bouton est celui des alertes, jamais le bouton principal. */
  danger?: boolean;
  busy?: boolean;
  disabled?: boolean;
  /** Posée depuis une feuille plein écran (fiche de tri) : s'ouvre dans son propre `Modal` (lot 35a). */
  modal?: boolean;
  error?: string | null;
  children?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const Sheet = modal ? ScreenSheet : AppSheet;
  return (
    <Sheet visible={visible} onClose={onClose} accessibilityLabel={title}>
      <Text variant="title" color={t.color.ink}>
        {title}
      </Text>
      <Text variant="body" color={t.color.ink}>
        {body}
      </Text>
      {children}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        variant={danger ? "alert" : "secondary"}
        icon={confirmIcon}
        loading={busy}
        disabled={disabled || busy}
        onPress={onConfirm}
        fullWidth
        testID="orga-confirm"
      >
        {confirmLabel}
      </Button>
      <Button variant="plate" icon="close" onPress={onClose} disabled={busy} fullWidth>
        {cancelLabel}
      </Button>
    </Sheet>
  );
}
