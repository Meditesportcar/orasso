// Casquette Organisateur, modèles de message (lot 35a, décision D20) : création, modification et suppression des modèles
// de la structure, en plus de l'envoi (Boîte > Groupés, qui les propose déjà). Les modèles Orasso sont en lecture seule.
// Mêmes champs et mêmes limites que la page Communication du site.
import { Button, Chip, Plate, SelectField, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  communicationLabels,
  GROUP_MESSAGE_BODY_MAX,
  GROUP_MESSAGE_SUBJECT_MAX,
  orgaManageLabels as L,
  TEMPLATE_NAME_MAX,
  type TemplateKind,
  type TemplateView,
  templateKindLabels,
  templateKinds,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { isTwoFactorError } from "@/lib/orga";
import { templateIssue } from "@/lib/teamModel";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";
import { ConfirmSheet } from "./ConfirmSheet";
import { OrgaFailure, useOrga } from "./OrgaGate";

const { space2, space3 } = tokens.spacing;

/** `null` : feuille fermée ; `{ template: null }` : nouveau modèle ; sinon, modification. */
type Editing = { template: TemplateView | null } | null;

function TemplateSheet({
  structureId,
  editing,
  onDone,
  onClose,
  onTwoFactor,
}: {
  structureId: string;
  editing: Editing;
  onDone: (message: string) => void;
  onClose: () => void;
  onTwoFactor: (error: unknown) => void;
}) {
  const { t } = useTheme();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<TemplateKind>("message");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!editing) return;
    setName(editing.template?.name ?? "");
    setKind(editing.template?.kind ?? "message");
    setSubject(editing.template?.subject ?? "");
    setBody(editing.template?.body ?? "");
    setError(null);
  }, [editing]);

  async function save() {
    const issue = templateIssue({ name, body });
    if (issue) {
      setError(issue);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = { kind, name: name.trim(), subject: subject.trim() || null, body: body.trim() };
      if (editing?.template) await api.updateTemplate(structureId, editing.template.id, payload);
      else await api.createTemplate(structureId, payload);
      onDone(L.templateSaved);
    } catch (e) {
      if (isTwoFactorError(e)) onTwoFactor(e);
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppSheet
      visible={editing !== null}
      onClose={onClose}
      accessibilityLabel={editing?.template ? L.templateEditTitle : L.templateNew}
    >
      <Text variant="title" color={t.color.ink}>
        {editing?.template ? L.templateEditTitle : L.templateNew}
      </Text>
      <TextField
        label={communicationLabels.templateName}
        value={name}
        onChangeText={setName}
        maxLength={TEMPLATE_NAME_MAX}
        testID="template-name"
      />
      <SelectField
        label={communicationLabels.templateKind}
        value={kind}
        onValueChange={(v) => setKind(v as TemplateKind)}
        options={templateKinds.map((k) => ({ value: k, label: templateKindLabels[k] }))}
      />
      <TextField
        label={L.templateSubject}
        value={subject}
        onChangeText={setSubject}
        maxLength={GROUP_MESSAGE_SUBJECT_MAX}
        testID="template-subject"
      />
      <TextField
        label={L.templateBody}
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={GROUP_MESSAGE_BODY_MAX}
        help={communicationLabels.groupVariables}
        testID="template-body"
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        variant="secondary"
        icon="check"
        loading={busy}
        disabled={busy}
        onPress={() => void save()}
        fullWidth
        testID="template-save"
      >
        {L.templateSave}
      </Button>
      <Button variant="plate" icon="close" onPress={onClose} disabled={busy} fullWidth>
        Annuler
      </Button>
    </AppSheet>
  );
}

function TemplateCard({
  template,
  onEdit,
  onDelete,
}: {
  template: TemplateView;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const { t } = useTheme();
  return (
    <Plate style={styles.block} testID="template-card">
      <View style={styles.head}>
        <Text variant="bodyStrong" color={t.color.plateInk} style={styles.grow}>
          {template.name}
        </Text>
        <Chip surface="plate">{templateKindLabels[template.kind]}</Chip>
      </View>
      {template.subject ? (
        <Text variant="caption" color={t.color.plateInk}>
          {template.subject}
        </Text>
      ) : null}
      <Text variant="body" color={t.color.plateMuted}>
        {template.body}
      </Text>
      {template.orasso ? (
        <Text variant="caption" color={t.color.plateMuted}>
          {communicationLabels.templateReadOnly}
        </Text>
      ) : (
        <View style={styles.buttons}>
          <Button variant="plate" icon="incident" onPress={onEdit} style={styles.grow} testID="template-edit">
            {L.templateEdit}
          </Button>
          <Button
            variant="plate"
            tone="dashed"
            icon="close"
            onPress={onDelete}
            style={styles.grow}
            testID="template-delete"
          >
            {L.templateDelete}
          </Button>
        </View>
      )}
    </Plate>
  );
}

export function TemplatesScreen() {
  const router = useRouter();
  const { structureId, structureName } = useOrga();
  const templates = useApi(() => api.templates(structureId), [structureId]);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<TemplateView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/(orga)/equipe"));
  const all = templates.data?.items ?? [];
  const orasso = all.filter((x) => x.orasso);
  const mine = all.filter((x) => !x.orasso);

  const done = (message: string) => {
    setEditing(null);
    setDeleting(null);
    setError(null);
    setNotice(message);
    void templates.reload();
  };

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setSheetError(null);
    try {
      await api.deleteTemplate(structureId, deleting.id);
      done(L.templateDeleted);
    } catch (e) {
      if (isTwoFactorError(e)) {
        setDeleting(null);
        setError(e);
      } else setSheetError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FlowScreen
      title={L.templatesTitle}
      facts={structureName}
      onClose={close}
      onRefresh={async () => {
        await templates.reload();
      }}
      overlays={
        <>
          <TemplateSheet
            structureId={structureId}
            editing={editing}
            onDone={done}
            onClose={() => setEditing(null)}
            onTwoFactor={(e) => {
              setEditing(null);
              setError(e);
            }}
          />
          <ConfirmSheet
            visible={deleting !== null}
            title={L.templateDeleteTitle(deleting?.name ?? "")}
            body={L.templateDeleteBody}
            confirmLabel={L.templateDelete}
            confirmIcon="close"
            danger
            busy={busy}
            error={sheetError}
            onConfirm={() => void remove()}
            onClose={() => {
              setDeleting(null);
              setSheetError(null);
            }}
          />
        </>
      }
    >
      <OrgaFailure error={error ?? templates.error} />
      {notice ? <Notice>{notice}</Notice> : null}
      <Muted variant="caption">{L.templatesIntro}</Muted>
      <Button
        variant="primary"
        icon="add"
        onPress={() => {
          setNotice(null);
          setEditing({ template: null });
        }}
        fullWidth
        testID="template-new"
      >
        {L.templateNew}
      </Button>

      <SectionTitle>{communicationLabels.templatesMine}</SectionTitle>
      {mine.length === 0 ? (
        <Muted variant="body">{templates.loading ? "Chargement…" : L.templatesMineEmpty}</Muted>
      ) : (
        mine.map((x) => (
          <TemplateCard
            key={x.id}
            template={x}
            onEdit={() => {
              setNotice(null);
              setEditing({ template: x });
            }}
            onDelete={() => {
              setNotice(null);
              setSheetError(null);
              setDeleting(x);
            }}
          />
        ))
      )}

      <SectionTitle>{communicationLabels.templatesOrasso}</SectionTitle>
      {orasso.map((x) => (
        <TemplateCard key={x.id} template={x} />
      ))}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  head: { flexDirection: "row", alignItems: "center", gap: space2 },
  grow: { flex: 1 },
  buttons: { flexDirection: "row", gap: space2 },
});
