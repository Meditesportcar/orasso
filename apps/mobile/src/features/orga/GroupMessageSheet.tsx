// Nouveau message groupé (lot 22, ARCHITECTURE-SUITE § 5.2) : événement, destinataires (segment), modèle, objet, texte, puis
// l'aperçu du nombre de destinataires et du quota d'envois aux abonnés. L'envoi est idempotent (`clientId`) : un double
// appui ou un réseau coupé n'envoie jamais deux fois. Les variables des modèles sont remplacées par l'API à l'envoi.
import { Button, SelectField, Text, TextField, useTheme } from "@orasso/design-system/native";
import {
  communicationLabels,
  type EventCard,
  GROUP_MESSAGE_BODY_MAX,
  GROUP_MESSAGE_SUBJECT_MAX,
  type GroupMessagePreview,
  type MessageSegment,
  messageSegmentLabels,
  orgaLabels,
  type TemplateView,
} from "@orasso/shared";
import { randomUUID } from "expo-crypto";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { availableSegments, groupMessageIssue } from "@/lib/orga";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";

const NO_EVENT = "none";
const NO_TEMPLATE = "none";

export function GroupMessageSheet({
  structureId,
  events,
  visible,
  onClose,
  onSent,
}: {
  structureId: string;
  /** Événements proposés (publiés, pas finis depuis plus de 7 jours : l'API refuse au-delà). */
  events: readonly EventCard[];
  visible: boolean;
  onClose: () => void;
  onSent: (recipients: number) => void;
}) {
  const { t } = useTheme();
  const [eventId, setEventId] = useState<string>(NO_EVENT);
  const [segment, setSegment] = useState<MessageSegment | "">("");
  const [templateId, setTemplateId] = useState<string>(NO_TEMPLATE);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templates, setTemplates] = useState<TemplateView[]>([]);
  const [preview, setPreview] = useState<GroupMessagePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un identifiant par message composé : le même si on réessaie après une coupure, un neuf après un envoi réussi.
  const [clientId, setClientId] = useState(() => randomUUID());

  const hasEvent = eventId !== NO_EVENT;
  const segments = useMemo(() => availableSegments(hasEvent), [hasEvent]);
  const chosenEvent = hasEvent ? eventId : null;

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void api
      .templates(structureId)
      .then((r) => alive && setTemplates(r.items.filter((x) => x.kind === "message")))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [visible, structureId]);

  // Le segment choisi doit rester proposable quand on enlève l'événement.
  useEffect(() => {
    if (segment && !segments.includes(segment)) setSegment("");
  }, [segments, segment]);

  // Aperçu : nombre de destinataires et quota, recalculés quand l'événement ou le segment change.
  useEffect(() => {
    setPreview(null);
    if (!visible || !segment) return;
    let alive = true;
    setPreviewing(true);
    void api
      .groupPreview(structureId, segment, chosenEvent)
      .then((r) => alive && setPreview(r))
      .catch((e) => alive && setError(errorMessage(e)))
      .finally(() => alive && setPreviewing(false));
    return () => {
      alive = false;
    };
  }, [visible, structureId, segment, chosenEvent]);

  const issue = groupMessageIssue({ segment: segment || null, eventId: chosenEvent, body });
  const quotaBlocked = segment === "followers" && preview !== null && preview.quota.followers.remaining <= 0;

  function pickTemplate(id: string) {
    setTemplateId(id);
    const found = templates.find((x) => x.id === id);
    if (found) {
      setSubject(found.subject ?? "");
      setBody(found.body);
    }
  }

  async function send() {
    if (!segment) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.sendGroupMessage(structureId, {
        clientId,
        eventId: chosenEvent,
        segment,
        templateId: templateId === NO_TEMPLATE ? null : templateId,
        subject: subject.trim() || null,
        body: body.trim(),
      });
      setClientId(randomUUID());
      setBody("");
      setSubject("");
      setTemplateId(NO_TEMPLATE);
      onSent(result.recipientsCount);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={orgaLabels.groupNew} maxHeight={0.9}>
      <Text variant="title" color={t.color.ink}>
        {orgaLabels.groupNew}
      </Text>
      <SelectField
        label={orgaLabels.groupSelectEvent}
        value={eventId}
        onValueChange={setEventId}
        options={[
          { value: NO_EVENT, label: communicationLabels.groupNoEvent },
          ...events.map((e) => ({ value: e.id, label: `${e.title} · ${formatDayHour(e.startsAt)}` })),
        ]}
      />
      <SelectField
        label={orgaLabels.groupSelectSegment}
        value={segment}
        onValueChange={(v) => setSegment(v as MessageSegment)}
        placeholder="Choisis les destinataires"
        options={segments.map((s) => ({ value: s, label: messageSegmentLabels[s] }))}
      />
      {templates.length > 0 ? (
        <SelectField
          label={orgaLabels.groupSelectTemplate}
          value={templateId}
          onValueChange={pickTemplate}
          options={[
            { value: NO_TEMPLATE, label: communicationLabels.groupNoTemplate },
            ...templates.map((x) => ({ value: x.id, label: x.name })),
          ]}
        />
      ) : null}
      <TextField
        label={communicationLabels.groupSubject}
        value={subject}
        onChangeText={setSubject}
        maxLength={GROUP_MESSAGE_SUBJECT_MAX}
      />
      <TextField
        label={communicationLabels.groupBody}
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={GROUP_MESSAGE_BODY_MAX}
        help={communicationLabels.groupVariables}
        testID="orga-group-body"
      />
      {segment ? (
        <Muted variant="bodyStrong" testID="orga-group-preview">
          {previewing || !preview ? orgaLabels.groupPreviewLoading : orgaLabels.groupPreview(preview.recipientsCount)}
        </Muted>
      ) : null}
      {segment === "followers" && preview ? (
        <Muted variant="caption">
          {communicationLabels.quotaFollowers(preview.quota.followers.remaining, preview.quota.followers.quota)}
          {preview.quota.followers.remaining <= 0 && preview.quota.followers.resetsAt
            ? ` ${communicationLabels.quotaResetsAt(formatDayHour(preview.quota.followers.resetsAt))}`
            : ""}
        </Muted>
      ) : null}
      <Muted variant="caption">{communicationLabels.groupHint}</Muted>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        variant="secondary"
        icon="share"
        loading={busy}
        disabled={issue !== null || quotaBlocked || busy}
        onPress={() => void send()}
        fullWidth
        testID="orga-group-send"
      >
        {communicationLabels.groupSend}
      </Button>
      {issue && body.trim() !== "" ? <Muted variant="caption">{issue}</Muted> : null}
      <Button variant="plate" icon="close" onPress={onClose} disabled={busy} fullWidth>
        {orgaLabels.groupCancel}
      </Button>
    </AppSheet>
  );
}
