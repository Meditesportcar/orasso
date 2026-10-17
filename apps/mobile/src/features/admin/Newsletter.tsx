// Casquette Administration, newsletter Orasso (lot 35d) : rédaction en Markdown réduit avec un aperçu en texte fidèle,
// envoi d'un test à soi-même, planification (date à venir, heure de Paris), « Envoyer à N personnes » confirmé avec le
// nombre de destinataires du moment, pause et reprise, historique. L'envoi part par lots aux seules personnes qui l'ont
// acceptée (adresse confirmée), avec un lien de désinscription dans chaque e-mail. Super admin seulement.
import { Button, Chip, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  adminAppLabels as L,
  markdownToText,
  type NewsletterView,
  newsletterStatusLabels,
  newsletterTexts,
} from "@orasso/shared";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { dateTimeToFr, newsletterEditable, newsletterPausable, parseDateTimeFr } from "@/lib/adminModel";
import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle } from "@/ui/Screens";
import { AdminFailure, AdminGate, AdminPage, useGesture } from "./kit";

const { space2, space3 } = tokens.spacing;

type Pending = "send" | "schedule" | "pause" | "resume" | "delete";

function NewsletterBody() {
  const { t } = useTheme();
  const list = useApi(() => api.newsletters(), []);
  const audience = useApi(() => api.newsletterAudience(), []);
  const gesture = useGesture();
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [at, setAt] = useState("");
  const [atIssue, setAtIssue] = useState<string | undefined>();
  const [pending, setPending] = useState<Pending | null>(null);
  /** Nombre de destinataires affiché dans la confirmation (relu à l'ouverture). */
  const [recipients, setRecipients] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const current: NewsletterView | null = list.data?.find((n) => n.id === currentId) ?? null;
  const editable = newsletterEditable(current?.status);
  const pausable = newsletterPausable(current?.status);

  /** Choisir une newsletter de l'historique (ou une nouvelle, `null`) remplit l'éditeur. */
  function pick(id: string | null) {
    const found = id ? list.data?.find((n) => n.id === id) : undefined;
    setCurrentId(id);
    setSubject(found?.subject ?? "");
    setBody(found?.bodyMd ?? "");
    setAt(found?.scheduledAt && found.status === "scheduled" ? dateTimeToFr(found.scheduledAt) : "");
    setAtIssue(undefined);
    setNotice(null);
  }

  /** Enregistre le brouillon (le crée au besoin) et renvoie son identifiant. */
  async function saveDraft(): Promise<string> {
    if (currentId) {
      await api.saveNewsletter(currentId, { subject: subject.trim(), bodyMd: body });
      return currentId;
    }
    const made = await api.createNewsletter({ subject: subject.trim(), bodyMd: body });
    setCurrentId(made.id);
    return made.id;
  }

  async function save(message: string, then?: (id: string) => Promise<unknown>) {
    setNotice(null);
    const ok = await gesture.run(async () => {
      const id = await saveDraft();
      if (then) await then(id);
    });
    if (ok) {
      setNotice(message);
      await Promise.all([list.reload(), audience.reload()]);
    }
    return ok;
  }

  async function ask(kind: Pending) {
    gesture.setError(null);
    setNotice(null);
    if (kind === "send") {
      // Le nombre confirmé est celui du moment : on le relit avant d'ouvrir la confirmation.
      const ok = await gesture.run(async () => {
        await saveDraft();
        setRecipients((await api.newsletterAudience()).recipients);
      });
      if (!ok) return;
    }
    if (kind === "schedule" && !parseDateTimeFr(at)) {
      setAtIssue(L.newsletterAtInvalid);
      return;
    }
    if (kind === "schedule") setRecipients(audience.data?.recipients ?? 0);
    setAtIssue(undefined);
    setPending(kind);
  }

  async function confirm() {
    if (!pending || !currentId) return;
    const id = currentId;
    const done = await gesture.run(async () => {
      if (pending === "send") {
        await api.saveNewsletter(id, { subject: subject.trim(), bodyMd: body });
        await api.sendNewsletterNow(id, recipients);
      } else if (pending === "schedule") {
        const iso = parseDateTimeFr(at);
        if (!iso) throw new Error(L.newsletterAtInvalid);
        await api.saveNewsletter(id, { subject: subject.trim(), bodyMd: body });
        await api.scheduleNewsletter(id, iso);
      } else if (pending === "pause") await api.pauseNewsletter(id);
      else if (pending === "resume") await api.resumeNewsletter(id);
      else await api.deleteNewsletter(id);
    });
    if (!done) return;
    if (pending === "delete") pick(null);
    setNotice(
      pending === "send"
        ? L.newsletterDone.sending
        : pending === "schedule"
          ? L.newsletterDone.scheduled
          : pending === "pause"
            ? L.newsletterDone.paused
            : pending === "resume"
              ? L.newsletterDone.resumed
              : L.newsletterDone.deleted,
    );
    setPending(null);
    await list.reload();
  }

  const sheet = (() => {
    switch (pending) {
      case "send":
        return {
          title: newsletterTexts.confirmSend(recipients),
          body: newsletterTexts.confirmHint,
          label: newsletterTexts.confirmSend(recipients),
          icon: "inbox" as const,
          danger: false,
        };
      case "schedule":
        return {
          title: L.newsletterScheduleConfirmTitle,
          body: L.newsletterScheduleConfirmBody(at.trim(), recipients),
          label: newsletterTexts.schedule,
          icon: "calendar" as const,
          danger: false,
        };
      case "pause":
        return {
          title: L.newsletterPauseConfirmTitle,
          body: L.newsletterPauseConfirmBody,
          label: newsletterTexts.pause,
          icon: "wait" as const,
          danger: false,
        };
      case "resume":
        return {
          title: L.newsletterResumeConfirmTitle,
          body: L.newsletterResumeConfirmBody,
          label: newsletterTexts.resume,
          icon: "next" as const,
          danger: false,
        };
      case "delete":
        return {
          title: L.newsletterDeleteTitle,
          body: L.newsletterDeleteBody,
          label: L.newsletterDelete,
          icon: "close" as const,
          danger: true,
        };
      default:
        return { title: "", body: "", label: "", icon: "check" as const, danger: false };
    }
  })();

  return (
    <AdminPage
      title={newsletterTexts.title}
      facts={newsletterTexts.recipients(audience.data?.recipients ?? 0)}
      onRefresh={async () => {
        await Promise.all([list.reload(), audience.reload()]);
      }}
      overlays={
        <ConfirmSheet
          visible={pending !== null}
          title={sheet.title}
          body={sheet.body}
          confirmLabel={sheet.label}
          confirmIcon={sheet.icon}
          danger={sheet.danger}
          busy={gesture.busy}
          error={gesture.error}
          onConfirm={() => void confirm()}
          onClose={() => {
            setPending(null);
            gesture.setError(null);
          }}
        />
      }
    >
      <AdminFailure error={list.error} />
      <Muted variant="caption">{newsletterTexts.hint}</Muted>
      {notice ? <Notice>{notice}</Notice> : null}
      {gesture.error && pending === null ? <Notice tone="error">{gesture.error}</Notice> : null}
      {current?.status === "paused" ? (
        <Notice>{current.pauseReason === "errors" ? newsletterTexts.pausedErrors : newsletterTexts.pausedAdmin}</Notice>
      ) : null}
      {current?.resumeAfter ? <Notice>{newsletterTexts.resumeAfter}</Notice> : null}

      <Button variant="plate" icon="add" onPress={() => pick(null)} fullWidth testID="newsletter-new">
        {L.newsletterNew}
      </Button>

      <Plate style={styles.block} testID="newsletter-editor">
        {current ? (
          <View style={styles.chips}>
            <Chip surface="plate" variant={current.status === "paused" ? "accent" : "default"}>
              {newsletterStatusLabels[current.status]}
            </Chip>
            {current.scheduledAt && current.status === "scheduled" ? (
              <Text variant="caption" color={t.color.plateMuted}>
                Planifiée le {formatDayHour(current.scheduledAt)}
              </Text>
            ) : null}
          </View>
        ) : null}
        <TextField
          label={L.newsletterSubject}
          value={subject}
          onChangeText={setSubject}
          editable={editable}
          testID="newsletter-subject"
        />
        <TextField
          label={L.newsletterBody}
          value={body}
          onChangeText={setBody}
          editable={editable}
          multiline
          help={newsletterTexts.markdownHelp}
          testID="newsletter-body"
        />
        <Muted variant="label">{newsletterTexts.preview}</Muted>
        <Plate kind="note" testID="newsletter-preview">
          <Text variant="body" color={t.color.plateInk}>
            {markdownToText(body) || "—"}
          </Text>
        </Plate>

        {editable ? (
          <>
            <Button
              variant="plate"
              icon="check"
              loading={gesture.busy}
              onPress={() => void save(L.newsletterDone.saved)}
              fullWidth
              testID="newsletter-save"
            >
              {newsletterTexts.save}
            </Button>
            {current ? (
              <>
                <Button
                  variant="plate"
                  icon="inbox"
                  loading={gesture.busy}
                  onPress={() => void save(L.newsletterDone.test, (id) => api.testNewsletter(id))}
                  fullWidth
                  testID="newsletter-test"
                >
                  {newsletterTexts.test}
                </Button>
                <Button variant="plate" icon="next" onPress={() => void ask("send")} fullWidth testID="newsletter-send">
                  {newsletterTexts.sendNow}
                </Button>
                <TextField
                  label={L.newsletterAt}
                  value={at}
                  onChangeText={(v) => {
                    setAt(v);
                    setAtIssue(undefined);
                  }}
                  placeholder="25/12/2026 18:30"
                  error={atIssue}
                  testID="newsletter-at"
                />
                <Button
                  variant="plate"
                  icon="calendar"
                  onPress={() => void ask("schedule")}
                  fullWidth
                  testID="newsletter-schedule"
                >
                  {newsletterTexts.schedule}
                </Button>
                {current.status === "scheduled" ? (
                  <Button
                    variant="plate"
                    icon="undo"
                    loading={gesture.busy}
                    onPress={() =>
                      void (async () => {
                        setNotice(null);
                        if (await gesture.run(() => api.unscheduleNewsletter(current.id))) {
                          setNotice(L.newsletterDone.unscheduled);
                          await list.reload();
                        }
                      })()
                    }
                    fullWidth
                    testID="newsletter-unschedule"
                  >
                    {L.newsletterUnschedule}
                  </Button>
                ) : null}
                {current.status === "draft" ? (
                  <Button
                    variant="plate"
                    icon="close"
                    onPress={() => void ask("delete")}
                    fullWidth
                    testID="newsletter-delete"
                  >
                    {L.newsletterDelete}
                  </Button>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {current && (pausable || current.status === "paused") ? (
          <View style={styles.stack}>
            {pausable ? (
              <Button variant="plate" icon="wait" onPress={() => void ask("pause")} fullWidth testID="newsletter-pause">
                {newsletterTexts.pause}
              </Button>
            ) : null}
            {current.status === "paused" ? (
              <Button
                variant="plate"
                icon="next"
                onPress={() => void ask("resume")}
                fullWidth
                testID="newsletter-resume"
              >
                {newsletterTexts.resume}
              </Button>
            ) : null}
          </View>
        ) : null}
        {current && !editable ? (
          <Text variant="caption" color={t.color.plateMuted} testID="newsletter-progress">
            {current.status === "sent"
              ? L.newsletterSentTo(formatDayHour(current.sentAt ?? current.updatedAt), current.recipientsCount)
              : newsletterTexts.progress(current.delivered, current.failed)}
          </Text>
        ) : null}
      </Plate>

      <SectionTitle>{L.newsletterHistory}</SectionTitle>
      {list.data && list.data.length === 0 ? <Muted variant="body">{L.newsletterHistoryEmpty}</Muted> : null}
      {(list.data ?? []).map((n) => (
        <Pressable
          key={n.id}
          accessibilityRole="button"
          accessibilityState={{ selected: n.id === currentId }}
          accessibilityLabel={n.subject}
          onPress={() => pick(n.id)}
          testID="newsletter-history-item"
        >
          <Plate style={styles.block}>
            <Text variant={n.id === currentId ? "bodyStrong" : "body"} color={t.color.plateInk}>
              {n.subject}
            </Text>
            <Text variant="caption" color={t.color.plateMuted}>
              {newsletterStatusLabels[n.status]}
              {n.status === "sent" ? ` · ${n.recipientsCount} destinataires` : ""}
            </Text>
          </Plate>
        </Pressable>
      ))}
    </AdminPage>
  );
}

export function NewsletterScreen() {
  return (
    <AdminGate title={newsletterTexts.title}>
      <NewsletterBody />
    </AdminGate>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  stack: { gap: space2 },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space2 },
});
