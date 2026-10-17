// « Signaler » (lot 32, docs/01) : une seule feuille pour toutes les cibles de l'appli. Motif, détails, capture choisie
// dans la photothèque (envoyée à `/api/me/uploads purpose=report`, privée), puis `POST /api/reports`. Pour un message,
// l'API joint la copie des 5 messages avant et après (rien à envoyer d'ici).
import { Button, Icon, SelectField, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  MODERATION,
  moderationLabels,
  type ReportReason,
  type ReportTarget,
  reportReasonLabels,
  reportReasons,
  reportTargetThis,
} from "@orasso/shared";
import { useState, useSyncExternalStore } from "react";
import { Platform, Pressable, StyleSheet } from "react-native";

import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { type PickedPhoto, pickPhotos } from "@/lib/photos";
import { AppSheet } from "@/ui/AppSheet";

export type ReportTargetRef = { type: ReportTarget; id: string };

const OPTIONS = reportReasons.map((r) => ({ value: r, label: reportReasonLabels[r] }));

async function uploadCapture(photo: PickedPhoto): Promise<string> {
  const form = new FormData();
  form.append("purpose", "report");
  if (Platform.OS === "web") {
    const blob = await (await fetch(photo.uri)).blob();
    form.append("file", new File([blob], "capture.jpg", { type: "image/jpeg" }));
  } else {
    form.append("file", { uri: photo.uri, name: "capture.jpg", type: "image/jpeg" } as unknown as Blob);
  }
  return (await api.upload(form)).key;
}

export function ReportSheet({ target, onClose }: { target: ReportTargetRef | null; onClose: () => void }) {
  const { t } = useTheme();
  const [reason, setReason] = useState<ReportReason | "">("");
  const [details, setDetails] = useState("");
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const close = () => {
    setReason("");
    setDetails("");
    setPhoto(null);
    setError(null);
    setDone(null);
    onClose();
  };

  const send = async () => {
    if (!target || !reason) return;
    if (reason === "other" && !details.trim()) {
      setError("Précise le motif « Autre » en quelques mots.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const screenshotKey = photo ? await uploadCapture(photo) : null;
      await api.report({
        targetType: target.type,
        targetId: target.id,
        reason,
        details: details.trim() || null,
        screenshotKey,
      });
      setDone(moderationLabels.sent);
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === "already_reported") setDone(moderationLabels.alreadyReported);
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppSheet visible={Boolean(target)} onClose={close} accessibilityLabel={moderationLabels.report}>
      {target ? (
        <>
          <Text variant="title" color={t.color.ink}>
            {moderationLabels.reportTitle(reportTargetThis[target.type])}
          </Text>
          {done ? (
            <>
              <Text variant="body" color={t.color.ink} accessibilityRole="alert" testID="report-done">
                {done}
              </Text>
              <Button variant="secondary" icon="check" fullWidth onPress={close}>
                Fermer
              </Button>
            </>
          ) : (
            <>
              {target.type === "message" ? (
                <Text variant="caption" color={t.color.inkMuted}>
                  {moderationLabels.messageContextNotice}
                </Text>
              ) : null}
              <Text variant="caption" color={t.color.inkMuted}>
                {moderationLabels.anonymityNotice}
              </Text>
              <SelectField
                label={moderationLabels.reason}
                options={OPTIONS}
                value={reason}
                placeholder="Choisir un motif"
                onValueChange={(v) => setReason(v as ReportReason)}
              />
              <TextField
                label={moderationLabels.details}
                help={moderationLabels.detailsHint}
                value={details}
                onChangeText={setDetails}
                multiline
                maxLength={MODERATION.detailsMax}
                style={{ minHeight: 88 }}
              />
              <Text variant="caption" color={t.color.inkMuted}>
                {photo ? `${moderationLabels.screenshot} : ajoutée` : moderationLabels.screenshotHint}
              </Text>
              <Button
                variant="secondary"
                icon={photo ? "close" : "add"}
                fullWidth
                onPress={async () => {
                  if (photo) return setPhoto(null);
                  const [picked] = await pickPhotos(1);
                  if (picked) setPhoto(picked);
                }}
              >
                {photo ? moderationLabels.removeScreenshot : moderationLabels.addScreenshot}
              </Button>
              {error ? (
                <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
                  {error}
                </Text>
              ) : null}
              <Button
                variant="primary"
                icon="flag"
                loading={busy}
                disabled={!reason}
                fullWidth
                onPress={() => void send()}
                testID="report-send"
              >
                {moderationLabels.send}
              </Button>
            </>
          )}
        </>
      ) : null}
    </AppSheet>
  );
}

/**
 * Bouton « Signaler » (icône drapeau) avec sa feuille. `link` : lien discret sous un avis, une annonce ou une photo ;
 * `button` (défaut) : bouton secondaire.
 */
export function ReportButton({
  type,
  id,
  look = "button",
  onPlate = false,
}: {
  type: ReportTarget;
  id: string;
  look?: "button" | "link";
  /** Lien posé sur une plaque (graphite) : couleur de texte de la plaque. */
  onPlate?: boolean;
}) {
  const { t } = useTheme();
  const setTarget = openReport;
  const label = moderationLabels.reportTitle(reportTargetThis[type]);
  return (
    <>
      {look === "link" ? (
        <Pressable
          onPress={() => setTarget({ type, id })}
          accessibilityRole="button"
          accessibilityLabel={label}
          hitSlop={8}
          style={linkStyles.link}
          testID={`report-open-${type}`}
        >
          <Icon name="flag" size={16} color={onPlate ? t.color.plateMuted : t.color.inkMuted} />
          <Text variant="caption" color={onPlate ? t.color.plateMuted : t.color.inkMuted}>
            {moderationLabels.report}
          </Text>
        </Pressable>
      ) : (
        <Button
          variant="secondary"
          icon="flag"
          onPress={() => setTarget({ type, id })}
          accessibilityLabel={label}
          testID={`report-open-${type}`}
        >
          {moderationLabels.report}
        </Button>
      )}
    </>
  );
}

// Une seule feuille pour toute l'appli, posée à la racine (`app/_layout.tsx`) : une feuille du système de design
// s'étend sur son parent, elle doit donc être hors des écrans qui défilent.
let current: ReportTargetRef | null = null;
const listeners = new Set<() => void>();

/** Ouvre la feuille « Signaler » (depuis un bouton, un appui long sur un message, la visionneuse de photos). */
export function openReport(target: ReportTargetRef | null) {
  current = target;
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function ReportSheetHost() {
  const target = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  return <ReportSheet target={target} onClose={() => openReport(null)} />;
}

const linkStyles = StyleSheet.create({
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.space1,
    minHeight: tokens.spacing.touch,
    alignSelf: "flex-start",
  },
});
