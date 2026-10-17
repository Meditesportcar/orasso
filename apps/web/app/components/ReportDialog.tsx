// « Signaler » (lot 32, docs/01 « Signalement et modération ») : un seul composant pour toutes les cibles du site. Le
// bouton (icône drapeau) ouvre une fenêtre : motif, détails, capture facultative (envoyée à `/api/me/uploads`, privée),
// puis `POST /api/reports`. Pour un message, le serveur joint la copie des 5 messages avant et après.
import { Button, Icon, SelectField } from "@orasso/design-system/web";
import {
  MODERATION,
  moderationLabels,
  type ReportReason,
  type ReportTarget,
  reportReasonLabels,
  reportReasons,
  reportTargetThis,
  type UploadResult,
} from "@orasso/shared";
import { useId, useRef, useState } from "react";

import { apiFetch } from "../lib/api.client";
import { FileField, TextAreaField } from "./Fields";
import "../styles/moderation.css";

type Props = {
  targetType: ReportTarget;
  targetId: string;
  /** `link` : petit lien sous un avis, une annonce ou un message ; `button` (défaut) : bouton secondaire. */
  look?: "button" | "link";
};

const REASON_OPTIONS = reportReasons.map((r) => ({ value: r, label: reportReasonLabels[r] }));

export function ReportDialog({ targetType, targetId, look = "button" }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [reason, setReason] = useState<ReportReason | "">("");
  const [details, setDetails] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const open = () => {
    setError(null);
    ref.current?.showModal();
  };
  const close = () => ref.current?.close();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason) return setError("Choisis un motif.");
    if (reason === "other" && !details.trim()) return setError("Précise le motif « Autre » en quelques mots.");
    setBusy(true);
    setError(null);
    try {
      let screenshotKey: string | null = null;
      if (file) {
        if (file.size > 15 * 1024 * 1024) return setError("Image de 15 Mo au plus.");
        const form = new FormData();
        form.append("purpose", "report");
        form.append("file", file);
        const res = await fetch("/api/me/uploads", { method: "POST", body: form, credentials: "same-origin" });
        const json = (await res.json().catch(() => null)) as UploadResult | { error?: { message?: string } } | null;
        if (!res.ok || !json || !("key" in json)) {
          return setError(
            (json as { error?: { message?: string } } | null)?.error?.message ?? "Envoi de la capture impossible.",
          );
        }
        screenshotKey = json.key;
      }
      const res = await apiFetch<{ id: string }>("/reports", {
        method: "POST",
        json: { targetType, targetId, reason, details: details.trim() || null, screenshotKey },
      });
      if (res.ok) setDone(moderationLabels.sent);
      else if (res.error.code === "already_reported") setDone(moderationLabels.alreadyReported);
      else setError(res.error.message);
    } catch {
      setError("Connexion impossible. Réessaie.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {look === "link" ? (
        <button
          type="button"
          className="s-linkbutton o-t-button mod-reportlink"
          onClick={open}
          aria-label={moderationLabels.reportTitle(reportTargetThis[targetType])}
          data-testid="report-open"
          data-target={targetType}
        >
          <Icon name="flag" size={16} />
          {moderationLabels.report}
        </button>
      ) : (
        <Button
          type="button"
          variant="secondary"
          icon="flag"
          onClick={open}
          aria-label={moderationLabels.reportTitle(reportTargetThis[targetType])}
          data-testid="report-open"
          data-target={targetType}
        >
          {moderationLabels.report}
        </Button>
      )}
      <dialog ref={ref} className="mod-dialog" aria-labelledby={titleId} data-testid="report-dialog">
        <div className="s-stack">
          <div className="mod-dialog__head">
            <h2 id={titleId} className="s-h2 mod-dialog__title">
              {moderationLabels.reportTitle(reportTargetThis[targetType])}
            </h2>
            <Button variant="close" label={moderationLabels.cancel} onClick={close} />
          </div>
          {done ? (
            <>
              <p className="s-notice s-notice--ok" role="status" data-testid="report-done">
                {done}
              </p>
              <div className="s-row">
                <Button type="button" variant="secondary" icon="check" onClick={close}>
                  Fermer
                </Button>
              </div>
            </>
          ) : (
            <form className="s-form" onSubmit={submit}>
              {targetType === "message" && (
                <p className="o-t-caption s-muted">{moderationLabels.messageContextNotice}</p>
              )}
              <p className="o-t-caption s-muted">{moderationLabels.anonymityNotice}</p>
              <SelectField
                label={moderationLabels.reason}
                name="reason"
                required
                value={reason}
                placeholder="Choisir un motif"
                options={REASON_OPTIONS}
                onChange={(e) => setReason(e.target.value as ReportReason)}
              />
              <TextAreaField
                label={moderationLabels.details}
                name="details"
                rows={3}
                maxLength={MODERATION.detailsMax}
                help={moderationLabels.detailsHint}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
              <FileField
                label={moderationLabels.screenshot}
                name="screenshot"
                accept="image/jpeg,image/png,image/webp,image/heic"
                help={moderationLabels.screenshotHint}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {error && (
                <p className="s-error" role="alert">
                  {error}
                </p>
              )}
              <div className="s-row">
                <Button type="submit" variant="secondary" icon="flag" loading={busy} data-testid="report-send">
                  {moderationLabels.send}
                </Button>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
