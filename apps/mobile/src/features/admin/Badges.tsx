// Casquette Administration, badges des structures et fiche d'une structure (lot 35d). Le badge vaut un an ; l'équipe le
// renouvelle, suspend la structure ou lève la suspension (chaque geste est écrit au journal d'administration). La fiche
// ajoute le mode assistance (« Survoler l'espace », fermeture d'une demande), le quota de messages aux abonnés et le
// changement de propriétaire sur justificatif, comme la page du site.
import { Button, Chip, Plate, SelectField, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  type AdminBadgeRow,
  afterEventLabels as AL,
  adminTexts,
  assistanceTexts,
  adminAppLabels as L,
  type StructureRole,
  structureRoleLabels,
  structureVerificationLabels,
  suspensionReasonLabels,
  verificationDocumentKindLabels,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { PrivateImage } from "@/features/boite/PrivateImage";
import { parseQuota } from "@/lib/adminModel";
import { api } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { imageForm, pickOneImage } from "@/lib/structureFiles";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle } from "@/ui/Screens";
import { SurveyButton } from "./Assistance";
import { AdminFailure, AdminGate, AdminPage, EmptyOrLoading, Fact, Filters, ReasonSheet, useGesture } from "./kit";

const { space2, space3 } = tokens.spacing;

type BadgeAction = "renew" | "suspend" | "lift";

const sheetOf = (action: BadgeAction) =>
  action === "renew"
    ? { title: L.badgeRenewTitle, body: L.badgeRenewBody, label: AL.adminRenew, icon: "check" as const, min: 0 }
    : action === "suspend"
      ? { title: L.badgeSuspendTitle, body: L.badgeSuspendBody, label: AL.adminSuspend, icon: "close" as const, min: 3 }
      : { title: L.badgeLiftTitle, body: L.badgeLiftBody, label: AL.adminLift, icon: "undo" as const, min: 3 };

/** Les trois gestes du badge, avec leur feuille de confirmation ; `done` est appelé après un succès. */
function useBadgeActions(done: () => Promise<unknown>) {
  const gesture = useGesture();
  const [pending, setPending] = useState<{ id: string; action: BadgeAction } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  async function confirm(reason: string) {
    if (!pending) return;
    const { id, action } = pending;
    const ok = await gesture.run(() =>
      action === "renew"
        ? api.renewBadge(id, reason || null)
        : action === "suspend"
          ? api.suspendStructure(id, reason)
          : api.liftStructure(id, reason),
    );
    if (!ok) return;
    setPending(null);
    setNotice(AL.adminDone);
    await done();
  }
  const sheet = pending ? sheetOf(pending.action) : null;
  const overlay = (
    <ReasonSheet
      visible={pending !== null}
      title={sheet?.title ?? ""}
      body={sheet?.body ?? ""}
      confirmLabel={sheet?.label ?? ""}
      confirmIcon={sheet?.icon}
      danger={pending?.action === "suspend"}
      reasonLabel={pending?.action === "renew" ? AL.adminRenewNote : AL.adminReason}
      minLength={sheet?.min ?? 0}
      requiredMessage="Écris le motif (3 caractères au moins)."
      busy={gesture.busy}
      error={gesture.error}
      onConfirm={(reason) => void confirm(reason)}
      onClose={() => {
        setPending(null);
        gesture.setError(null);
      }}
    />
  );
  return {
    overlay,
    notice,
    ask: (id: string, action: BadgeAction) => {
      gesture.setError(null);
      setNotice(null);
      setPending({ id, action });
    },
  };
}

function badgeChip(s: Pick<AdminBadgeRow, "verification" | "suspendedReason">) {
  return s.verification === "suspended" && s.suspendedReason
    ? suspensionReasonLabels[s.suspendedReason]
    : structureVerificationLabels[s.verification];
}

// --- Liste des badges -------------------------------------------------------------------------------------------------

function BadgesBody() {
  const { t } = useTheme();
  const router = useRouter();
  const [filter, setFilter] = useState<"expiring" | "suspended" | "all">("expiring");
  const list = useApi(() => api.adminBadges(filter), [filter]);
  const actions = useBadgeActions(list.reload);
  const counts = list.data?.counts;
  return (
    <AdminPage
      title={AL.adminBadgesTitle}
      facts={AL.adminBadgesIntro}
      onRefresh={list.reload}
      overlays={actions.overlay}
    >
      <AdminFailure error={list.error} />
      <Filters
        value={filter}
        options={[
          { id: "expiring", label: `${AL.adminFilterExpiring}${counts ? ` · ${counts.expiring}` : ""}` },
          { id: "suspended", label: `${AL.adminFilterSuspended}${counts ? ` · ${counts.suspended}` : ""}` },
          { id: "all", label: AL.adminFilterAll },
        ]}
        onChange={setFilter}
      />
      {actions.notice ? <Notice>{actions.notice}</Notice> : null}
      {!list.data ? (
        <EmptyOrLoading loading={list.loading} empty={AL.adminEmpty} />
      ) : list.data.items.length === 0 ? (
        <Notice>{AL.adminEmpty}</Notice>
      ) : null}
      {(list.data?.items ?? []).map((s) => (
        <Plate key={s.id} style={styles.block} testID="badge-row">
          <Text variant="title" color={t.color.plateInk}>
            {s.name}
          </Text>
          <Text variant="caption" color={t.color.plateMuted}>
            {s.owner ? `${s.owner.pseudo} · ${s.owner.email}` : "Pas de propriétaire actif"}
          </Text>
          <Chip surface="plate" variant={s.verification === "suspended" ? "accent" : "default"}>
            {badgeChip(s)}
          </Chip>
          <Text variant="bodyStrong" color={t.color.plateInk}>
            {AL.adminDaysLeft(s.daysLeft)}
            {s.badgeExpiresAt ? ` · ${AL.adminExpiresOn(formatDay(s.badgeExpiresAt))}` : ""}
          </Text>
          <Text variant="caption" color={t.color.plateMuted}>
            {AL.adminReminded} :{" "}
            {(["30", "7", "1"] as const)
              .map((d) => (s.reminded[d] ? `J−${d} (${formatDay(s.reminded[d])})` : `J−${d} non envoyé`))
              .join(" · ")}
          </Text>
          <View style={styles.stack}>
            {s.verification === "suspended" ? (
              <>
                {s.suspendedReason !== "moderation" ? (
                  <Button
                    variant="plate"
                    icon="check"
                    onPress={() => actions.ask(s.id, "renew")}
                    fullWidth
                    testID="badge-renew"
                  >
                    {AL.adminRenew}
                  </Button>
                ) : null}
                <Button
                  variant="plate"
                  icon="undo"
                  onPress={() => actions.ask(s.id, "lift")}
                  fullWidth
                  testID="badge-lift"
                >
                  {AL.adminLift}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="plate"
                  icon="check"
                  onPress={() => actions.ask(s.id, "renew")}
                  fullWidth
                  testID="badge-renew"
                >
                  {AL.adminRenew}
                </Button>
                <Button
                  variant="plate"
                  icon="close"
                  onPress={() => actions.ask(s.id, "suspend")}
                  fullWidth
                  testID="badge-suspend"
                >
                  {AL.adminSuspend}
                </Button>
              </>
            )}
            <Button
              variant="plate"
              icon="next"
              onPress={() => router.push(`/(admin)/structure/${s.id}` as never)}
              fullWidth
            >
              {AL.adminOpen}
            </Button>
          </View>
        </Plate>
      ))}
    </AdminPage>
  );
}

export function BadgesScreen() {
  return (
    <AdminGate title={AL.adminBadgesTitle}>
      <BadgesBody />
    </AdminGate>
  );
}

// --- Fiche d'une structure --------------------------------------------------------------------------------------------

function StructureBody() {
  const { t } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const structure = useApi(() => api.adminStructure(id), [id]);
  const assistance = useApi(() => api.assistanceState(id), [id]);
  const registry = useApi(() => api.structureRegistry(structure.data?.name ?? ""), [structure.data?.name], {
    enabled: Boolean(structure.data?.name),
  });
  const reloadAll = async () => {
    await Promise.all([structure.reload(), assistance.reload(), registry.reload()]);
  };
  const actions = useBadgeActions(reloadAll);

  const quotaRow = registry.data?.find((r) => r.id === id);
  const slug = quotaRow?.slug ?? structure.data?.slug ?? "";

  // Quota des messages groupés.
  const [quota, setQuota] = useState<string | null>(null);
  const quotaText = quota ?? (quotaRow?.followerMessageQuota != null ? String(quotaRow.followerMessageQuota) : "");
  const quotaGesture = useGesture();
  const [quotaAsk, setQuotaAsk] = useState(false);
  const [quotaIssue, setQuotaIssue] = useState<string | undefined>();

  // Fermeture d'une demande d'aide.
  const closeGesture = useGesture();
  const [closing, setClosing] = useState(false);

  // Justificatif et changement de propriétaire.
  const docGesture = useGesture();
  const transferGesture = useGesture();
  const [pseudo, setPseudo] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [transferIssue, setTransferIssue] = useState<string | undefined>();
  const [transferAsk, setTransferAsk] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const s = structure.data;
  const others = (s?.documents ?? []).filter((d) => d.kind === "other");
  const chosenDocument = documentId || others[0]?.id || "";
  const current = assistance.data?.current ?? null;

  async function addDocument() {
    const photo = await pickOneImage();
    if (!photo) return;
    const ok = await docGesture.run(async () =>
      api.addStructureDocument(id, await imageForm(photo, "file", "justificatif.jpg")),
    );
    if (ok) {
      setNotice(AL.adminDone);
      await structure.reload();
    }
  }

  return (
    <AdminPage
      title={s?.name ?? "Structure"}
      facts={s ? badgeChip(s) : undefined}
      onRefresh={reloadAll}
      overlays={
        <>
          {actions.overlay}
          <ReasonSheet
            visible={quotaAsk}
            title="Changer le quota ?"
            body={`${L.structureQuotaHint} Le changement est écrit au journal d'administration.`}
            confirmLabel={L.structureQuotaSave}
            reasonLabel={adminTexts.reasonLabel}
            busy={quotaGesture.busy}
            error={quotaGesture.error}
            onConfirm={(reasonText) =>
              void (async () => {
                const parsed = parseQuota(quotaText);
                if (parsed === undefined) return;
                if (await quotaGesture.run(() => api.setStructureQuota(id, parsed, reasonText))) {
                  setQuotaAsk(false);
                  setNotice(AL.adminDone);
                  setQuota(null);
                  await registry.reload();
                }
              })()
            }
            onClose={() => {
              setQuotaAsk(false);
              quotaGesture.setError(null);
            }}
          />
          <ReasonSheet
            visible={transferAsk}
            title={L.structureTransferConfirmTitle}
            body={L.structureTransferConfirmBody}
            confirmLabel={AL.transferButton}
            reasonLabel={L.structureTransferReason}
            minLength={10}
            busy={transferGesture.busy}
            error={transferGesture.error}
            onConfirm={(text) =>
              void (async () => {
                if (
                  await transferGesture.run(() =>
                    api.transferStructureOwner(id, { pseudo: pseudo.trim(), reason: text, documentId: chosenDocument }),
                  )
                ) {
                  setTransferAsk(false);
                  setPseudo("");
                  setNotice(AL.transferDone);
                  await reloadAll();
                }
              })()
            }
            onClose={() => {
              setTransferAsk(false);
              transferGesture.setError(null);
            }}
          />
          <ReasonSheet
            visible={closing}
            title={L.assistanceCloseTitle}
            body={L.assistanceCloseBody}
            confirmLabel={assistanceTexts.close}
            confirmIcon="close"
            minLength={0}
            reasonLabel="Note"
            busy={closeGesture.busy}
            error={closeGesture.error}
            onConfirm={() =>
              void (async () => {
                if (current && (await closeGesture.run(() => api.closeAssistanceAsAdmin(current.id)))) {
                  setClosing(false);
                  setNotice(L.assistanceClosed);
                  await assistance.reload();
                }
              })()
            }
            onClose={() => {
              setClosing(false);
              closeGesture.setError(null);
            }}
          />
        </>
      }
    >
      <AdminFailure error={structure.error} />
      {!s ? <EmptyOrLoading loading={structure.loading} empty="Structure introuvable." /> : null}
      {notice ? <Notice>{notice}</Notice> : null}
      {s ? (
        <>
          {s.badgeExpiresAt ? (
            <Muted variant="caption">
              {AL.adminDaysLeft(s.daysLeft)} · {AL.adminExpiresOn(formatDay(s.badgeExpiresAt))}
            </Muted>
          ) : null}

          <SectionTitle>{assistanceTexts.current}</SectionTitle>
          <Plate style={styles.block} testID="admin-assistance">
            {current ? (
              <>
                <Text variant="body" color={t.color.plateInk}>
                  {current.message}
                </Text>
                <Text variant="caption" color={t.color.plateMuted}>
                  {L.assistanceCurrentLine(
                    current.requestedBy?.pseudo ?? "—",
                    formatDay(current.createdAt),
                    formatDay(current.expiresAt),
                    current.interventions,
                  )}
                </Text>
                <Button
                  variant="plate"
                  icon="close"
                  onPress={() => {
                    closeGesture.setError(null);
                    setClosing(true);
                  }}
                  fullWidth
                  testID="admin-assistance-close"
                >
                  {assistanceTexts.close}
                </Button>
              </>
            ) : (
              <Text variant="body" color={t.color.plateMuted}>
                {assistanceTexts.readOnlyHint}
              </Text>
            )}
            {slug ? <SurveyButton structure={{ id: s.id, name: s.name, slug }} /> : null}
          </Plate>

          <SectionTitle>{L.structureQuota}</SectionTitle>
          <Plate style={styles.block} testID="admin-quota">
            <Text variant="caption" color={t.color.plateMuted}>
              {L.structureQuotaHint} {L.structureQuotaCurrent(quotaRow?.followerMessageQuota ?? null)}
            </Text>
            <TextField
              label={L.structureQuotaLabel}
              value={quotaText}
              onChangeText={(v) => {
                setQuota(v);
                setQuotaIssue(undefined);
              }}
              keyboardType="number-pad"
              error={quotaIssue}
              testID="admin-quota-field"
            />
            <Button
              variant="plate"
              icon="check"
              onPress={() => {
                if (parseQuota(quotaText) === undefined) {
                  setQuotaIssue(L.structureQuotaInvalid);
                  return;
                }
                quotaGesture.setError(null);
                setNotice(null);
                setQuotaAsk(true);
              }}
              fullWidth
              testID="admin-quota-save"
            >
              {L.structureQuotaSave}
            </Button>
          </Plate>

          <SectionTitle>Badge</SectionTitle>
          <Plate style={styles.block} testID="admin-badge">
            <Text variant="caption" color={t.color.plateMuted}>
              {s.verification === "suspended" ? AL.adminLiftHint : AL.adminReasonHint}
            </Text>
            <View style={styles.stack}>
              {s.verification === "verified" || s.suspendedReason === "badge_expired" ? (
                <Button
                  variant="plate"
                  icon="check"
                  onPress={() => actions.ask(s.id, "renew")}
                  fullWidth
                  testID="badge-renew"
                >
                  {AL.adminRenew}
                </Button>
              ) : null}
              {s.verification === "verified" ? (
                <Button
                  variant="plate"
                  icon="close"
                  onPress={() => actions.ask(s.id, "suspend")}
                  fullWidth
                  testID="badge-suspend"
                >
                  {AL.adminSuspend}
                </Button>
              ) : null}
              {s.verification === "suspended" ? (
                <Button
                  variant="plate"
                  icon="undo"
                  onPress={() => actions.ask(s.id, "lift")}
                  fullWidth
                  testID="badge-lift"
                >
                  {AL.adminLift}
                </Button>
              ) : null}
            </View>
            {actions.notice ? <Notice>{actions.notice}</Notice> : null}
          </Plate>

          <SectionTitle>{AL.members}</SectionTitle>
          <Plate style={styles.block}>
            {s.members.map((m) => (
              <Fact key={m.userId} label={m.pseudo}>
                {structureRoleLabels[m.role as StructureRole] ?? m.role}
                {m.status === "active" ? "" : ` · ${m.status}`}
              </Fact>
            ))}
          </Plate>

          <SectionTitle>{AL.transferTitle}</SectionTitle>
          <Plate style={styles.block} testID="admin-transfer">
            <Text variant="body" color={t.color.plateMuted}>
              {AL.transferIntro}
            </Text>
            <Fact label={AL.transferOwner}>{s.owner?.pseudo ?? "—"}</Fact>
            <Muted variant="label">{AL.documents}</Muted>
            {s.documents.length === 0 ? (
              <Text variant="caption" color={t.color.plateMuted}>
                {AL.transferNoDocument}
              </Text>
            ) : (
              s.documents.map((d) => (
                <DocumentRow
                  key={d.id}
                  id={d.id}
                  name={d.fileName}
                  meta={`${verificationDocumentKindLabels[d.kind]} · ${formatDay(d.createdAt)}`}
                />
              ))
            )}
            <Button
              variant="plate"
              icon="export"
              onPress={() => void addDocument()}
              loading={docGesture.busy}
              fullWidth
              testID="admin-document-upload"
            >
              {L.structureUpload}
            </Button>
            <Text variant="caption" color={t.color.plateMuted}>
              {L.structureUploadHint}
            </Text>
            {docGesture.error ? <Notice tone="error">{docGesture.error}</Notice> : null}
            <TextField
              label={L.structureTransferPseudo}
              value={pseudo}
              onChangeText={setPseudo}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={40}
              testID="admin-transfer-pseudo"
            />
            {others.length > 0 ? (
              <SelectField
                label={AL.transferDocument}
                value={chosenDocument}
                onValueChange={setDocumentId}
                options={others.map((d) => ({ value: d.id, label: `${d.fileName} (${formatDay(d.createdAt)})` }))}
              />
            ) : null}
            {transferIssue ? <Notice tone="error">{transferIssue}</Notice> : null}
            <Button
              variant="plate"
              icon="check"
              disabled={others.length === 0}
              onPress={() => {
                if (pseudo.trim() === "" || !chosenDocument) {
                  setTransferIssue(L.structureTransferInvalid);
                  return;
                }
                setTransferIssue(undefined);
                transferGesture.setError(null);
                setNotice(null);
                setTransferAsk(true);
              }}
              fullWidth
              testID="admin-transfer-owner"
            >
              {AL.transferButton}
            </Button>
          </Plate>
        </>
      ) : null}
    </AdminPage>
  );
}

/** Une ligne de justificatif : son nom, et l'image à la demande. */
function DocumentRow({ id, name, meta }: { id: string; name: string; meta: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.stack}>
      <Fact label={meta}>{name}</Fact>
      <Button variant="plate" icon="eye" onPress={() => setOpen((v) => !v)} fullWidth>
        {L.documentOpen}
      </Button>
      {open ? (
        <PrivateImage url={`/api/admin/verification-documents/${id}`} style={styles.doc} accessibilityLabel={name} />
      ) : null}
    </View>
  );
}

export function StructureFileScreen() {
  return (
    <AdminGate title="Structure">
      <StructureBody />
    </AdminGate>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  stack: { gap: space2 },
  doc: { width: "100%", height: 220 },
});
