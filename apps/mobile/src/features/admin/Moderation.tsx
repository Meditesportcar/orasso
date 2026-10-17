// Casquette Administration, modération (lot 35d) : la file des signalements et le dossier d'un signalement
// (modérateur et super admin), puis les sanctions et les contestations de malus (super admin). Mêmes données et mêmes
// droits que les pages du site : les gestes proposés viennent du champ `can` que l'API renvoie selon le rôle ; chaque
// décision (statut, sanction, levée) passe par une feuille de confirmation avant de partir.
import { Button, CheckboxField, Chip, Plate, SelectField, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type AdminReportDetail,
  type AdminSanction,
  adminTexts,
  contestStateLabels,
  adminAppLabels as L,
  type MalusContestView,
  moderationLabels,
  type ReportStatus,
  reportReasonLabels,
  reportStatuses,
  reportStatusLabels,
  reportTargetLabels,
  type SanctionKind,
  sanctionKindLabels,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { PrivateImage } from "@/features/boite/PrivateImage";
import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle, TabScreen } from "@/ui/Screens";
import {
  AdminFailure,
  AdminGate,
  AdminPage,
  EmptyOrLoading,
  Fact,
  Filters,
  ReasonSheet,
  useAdmin,
  useGesture,
} from "./kit";

const { space2, space3 } = tokens.spacing;

// --- File des signalements (onglet) -----------------------------------------------------------------------------------

function ReportsBody() {
  const { t } = useTheme();
  const router = useRouter();
  const { role, reload } = useAdmin();
  const [status, setStatus] = useState<ReportStatus>("pending");
  const list = useApi(() => api.adminReports(status), [status]);
  return (
    <TabScreen
      title={moderationLabels.queueTitle}
      facts={role === "moderator" ? L.kindModerator : L.kind}
      onRefresh={async () => {
        await Promise.all([list.reload(), reload()]);
      }}
    >
      <AdminFailure error={list.error} />
      <Filters
        value={status}
        options={reportStatuses.map((s) => ({ id: s, label: reportStatusLabels[s] }))}
        onChange={setStatus}
      />
      {!list.data ? (
        <EmptyOrLoading loading={list.loading} empty={moderationLabels.queueEmpty} />
      ) : list.data.items.length === 0 ? (
        <Notice>{moderationLabels.queueEmpty}</Notice>
      ) : null}
      {(list.data?.items ?? []).map((r) => (
        <Pressable
          key={r.id}
          accessibilityRole="button"
          accessibilityLabel={`${reportTargetLabels[r.targetType]} · ${reportReasonLabels[r.reason]}`}
          onPress={() => router.push(`/(admin)/signalement/${r.id}` as never)}
          testID="report-item"
        >
          <Plate style={styles.block}>
            <Text variant="bodyStrong" color={t.color.plateInk}>
              {reportTargetLabels[r.targetType]} · {reportReasonLabels[r.reason]}
            </Text>
            <Text variant="caption" color={t.color.plateMuted}>
              {formatDayHour(r.createdAt)}
            </Text>
            <Text variant="caption" color={t.color.plateMuted}>
              {r.ownerPseudo ?? "—"}
              {r.ownerSuspended ? " · suspendu" : ""} · {r.openOnOwner} signaleur(s) en 24 h
              {r.hasScreenshot ? " · capture" : ""}
            </Text>
          </Plate>
        </Pressable>
      ))}
    </TabScreen>
  );
}

export function ReportsScreen() {
  return (
    <AdminGate title={moderationLabels.queueTitle} moderator>
      <ReportsBody />
    </AdminGate>
  );
}

// --- Dossier d'un signalement -----------------------------------------------------------------------------------------

type Pending =
  | { kind: "status"; status: Exclude<ReportStatus, "pending"> }
  | { kind: "sanction"; subject: "owner" | "reporter" }
  | { kind: "lift"; sanctionId: string };

function ReportBody() {
  const { t } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useApi(() => api.adminReport(id), [id]);
  const gesture = useGesture();
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [kind, setKind] = useState<string>("");
  const [hide, setHide] = useState(false);
  const [reporterKind, setReporterKind] = useState<string>("warning");
  const [shot, setShot] = useState(false);
  const d: AdminReportDetail | null = detail.data;

  const sanctionOptions = (d?.can.sanctionKinds ?? []).map((k) => ({ value: k, label: sanctionKindLabels[k] }));
  const chosenKind = (kind || (d?.can.hideContent ? "" : (sanctionOptions[0]?.value ?? ""))) as SanctionKind | "";

  async function confirm(note: string) {
    if (!pending || !d) return;
    const body = note || null;
    const ok = await gesture.run(() => {
      if (pending.kind === "status") return api.setReportStatus(d.id, pending.status, body);
      if (pending.kind === "lift") return api.liftSanction(pending.sanctionId, body);
      return pending.subject === "owner"
        ? api.sanctionReport(d.id, { kind: chosenKind || null, note: body, hideContent: hide, subject: "owner" })
        : api.sanctionReport(d.id, {
            kind: reporterKind as SanctionKind,
            note: body,
            hideContent: false,
            subject: "reporter",
          });
    });
    if (!ok) return;
    setPending(null);
    setNotice(L.doneLogged);
    await detail.reload();
  }

  const sheet = (() => {
    if (!pending) return { title: "", body: "", label: "", icon: "check" as const };
    if (pending.kind === "status") {
      const label =
        pending.status === "reviewing"
          ? moderationLabels.markReviewing
          : pending.status === "resolved_no_action"
            ? moderationLabels.closeNoAction
            : pending.status === "resolved_action"
              ? moderationLabels.resolveAction
              : moderationLabels.dismissAbusive;
      return { title: L.reportStatusConfirmTitle, body: L.reportStatusConfirmBody, label, icon: "check" as const };
    }
    if (pending.kind === "lift") {
      return {
        title: L.sanctionLiftTitle,
        body: L.sanctionLiftBody,
        label: moderationLabels.lift,
        icon: "undo" as const,
      };
    }
    return {
      title: L.reportSanctionTitle,
      body: L.reportSanctionBody,
      label: pending.subject === "reporter" ? moderationLabels.sanctionReporter : moderationLabels.sanctionSubmit,
      icon: "flag" as const,
    };
  })();

  const open = (next: Pending) => {
    gesture.setError(null);
    setNotice(null);
    setPending(next);
  };

  return (
    <AdminPage
      title={d ? reportTargetLabels[d.targetType] : moderationLabels.queueTitle}
      facts={d ? reportStatusLabels[d.status] : undefined}
      onRefresh={detail.reload}
      overlays={
        <ReasonSheet
          visible={pending !== null}
          title={sheet.title}
          body={sheet.body}
          confirmLabel={sheet.label}
          confirmIcon={sheet.icon}
          danger={pending?.kind === "sanction" && (pending.subject === "reporter" || chosenKind === "ban")}
          reasonLabel={moderationLabels.decisionNote}
          minLength={0}
          busy={gesture.busy}
          error={gesture.error}
          onConfirm={(note) => void confirm(note)}
          onClose={() => {
            setPending(null);
            gesture.setError(null);
          }}
        />
      }
    >
      <AdminFailure error={detail.error} />
      {!d ? <EmptyOrLoading loading={detail.loading} empty="Signalement introuvable." /> : null}
      {notice ? <Notice>{notice}</Notice> : null}
      {d ? (
        <>
          <Plate style={styles.block} testID="report-detail">
            <Muted variant="label">
              {reportTargetLabels[d.targetType]} · {formatDayHour(d.createdAt)}
            </Muted>
            <Text variant="title" color={t.color.plateInk}>
              {d.target.title}
            </Text>
            <Chip surface="plate" variant={d.status === "pending" ? "accent" : "default"}>
              {reportStatusLabels[d.status]}
            </Chip>
            {d.target.gone ? <Notice>{moderationLabels.targetGone}</Notice> : null}
            {d.target.removed ? <Notice>{moderationLabels.targetRemoved}</Notice> : null}
            {d.target.imageUrl ? <PrivateImage url={d.target.imageUrl} style={styles.image} /> : null}
            {d.target.text && d.targetType !== "message" ? (
              <Text variant="body" color={t.color.plateInk}>
                {d.target.text}
              </Text>
            ) : null}
            <Fact label={moderationLabels.reason}>{reportReasonLabels[d.reason]}</Fact>
            {d.details ? <Fact label={moderationLabels.details}>{d.details}</Fact> : null}
            <Fact label="Compte visé">
              {`${d.ownerPseudo ?? "—"}${d.ownerSuspended ? " · suspendu" : ""} · ${d.openOnOwner} signaleur(s) en 24 h`}
            </Fact>
            <Fact label={moderationLabels.reporterLabel}>
              {`${d.reporter.pseudo} · compte de ${d.reporter.accountAgeDays} jours · ${d.reporter.dismissedAbusive} rejet(s) pour abus`}
            </Fact>
            {d.handledByPseudo ? (
              <Fact label="Traité par">
                {`${d.handledByPseudo}${d.handledAt ? ` · ${formatDayHour(d.handledAt)}` : ""}`}
              </Fact>
            ) : null}
          </Plate>

          {d.context ? (
            <>
              <SectionTitle>{moderationLabels.contextTitle}</SectionTitle>
              <Plate style={styles.block} testID="report-context">
                {d.context.map((m) => (
                  <View key={m.id} style={styles.line}>
                    <Text variant="caption" color={t.color.plateMuted}>
                      {m.pseudo} · {formatDayHour(m.createdAt)}
                      {m.reported ? " · message signalé" : ""}
                    </Text>
                    <Text variant={m.reported ? "bodyStrong" : "body"} color={t.color.plateInk}>
                      {m.body ?? (m.note === "image" ? "[photo]" : "[message supprimé]")}
                    </Text>
                  </View>
                ))}
              </Plate>
            </>
          ) : null}

          {d.screenshotUrl ? (
            <Plate style={styles.block}>
              <Muted variant="label">{moderationLabels.screenshot}</Muted>
              <Button variant="plate" icon="eye" onPress={() => setShot((v) => !v)} fullWidth>
                {L.reportCaptureOpen}
              </Button>
              {shot ? (
                <PrivateImage
                  url={d.screenshotUrl}
                  style={styles.image}
                  accessibilityLabel="Capture jointe au signalement"
                />
              ) : null}
            </Plate>
          ) : null}

          {d.sanction ? (
            <Plate style={styles.block} testID="report-sanction">
              <Text variant="bodyStrong" color={t.color.plateInk}>
                {sanctionKindLabels[d.sanction.kind]}
                {d.sanction.auto ? ` · ${moderationLabels.autoSanction}` : ""}
                {d.sanction.liftedAt ? ` · ${moderationLabels.sanctionLifted(formatDayHour(d.sanction.liftedAt))}` : ""}
              </Text>
              {d.sanction.liftable ? (
                <Button
                  variant="plate"
                  icon="undo"
                  onPress={() => open({ kind: "lift", sanctionId: d.sanction?.id ?? "" })}
                  fullWidth
                  testID="report-lift"
                >
                  {moderationLabels.lift}
                </Button>
              ) : null}
            </Plate>
          ) : null}

          {d.can.review || d.can.closeNoAction || d.can.resolveAction || d.can.dismissAbusive ? (
            <>
              <SectionTitle>Statut</SectionTitle>
              <Plate style={styles.block}>
                {d.can.review ? (
                  <Button
                    variant="plate"
                    icon="wait"
                    onPress={() => open({ kind: "status", status: "reviewing" })}
                    fullWidth
                    testID="report-reviewing"
                  >
                    {moderationLabels.markReviewing}
                  </Button>
                ) : null}
                {d.can.closeNoAction ? (
                  <Button
                    variant="plate"
                    icon="close"
                    onPress={() => open({ kind: "status", status: "resolved_no_action" })}
                    fullWidth
                    testID="report-close-no-action"
                  >
                    {moderationLabels.closeNoAction}
                  </Button>
                ) : null}
                {d.can.resolveAction ? (
                  <Button
                    variant="plate"
                    icon="check"
                    onPress={() => open({ kind: "status", status: "resolved_action" })}
                    fullWidth
                    testID="report-resolve"
                  >
                    {moderationLabels.resolveAction}
                  </Button>
                ) : null}
                {d.can.dismissAbusive ? (
                  <Button
                    variant="plate"
                    icon="undo"
                    onPress={() => open({ kind: "status", status: "dismissed_abusive" })}
                    fullWidth
                    testID="report-dismiss"
                  >
                    {moderationLabels.dismissAbusive}
                  </Button>
                ) : null}
              </Plate>
            </>
          ) : null}

          {sanctionOptions.length > 0 || d.can.hideContent ? (
            <>
              <SectionTitle>{moderationLabels.sanctionSubmit}</SectionTitle>
              <Plate style={styles.block} testID="sanction-form">
                {sanctionOptions.length > 0 ? (
                  <SelectField
                    label="Sanction"
                    value={chosenKind}
                    onValueChange={setKind}
                    options={
                      d.can.hideContent
                        ? [{ value: "", label: moderationLabels.noSanction }, ...sanctionOptions]
                        : sanctionOptions
                    }
                  />
                ) : null}
                {d.can.hideContent ? (
                  <CheckboxField label={moderationLabels.hideContent} checked={hide} onChange={setHide} />
                ) : null}
                <Button
                  variant="plate"
                  icon="flag"
                  disabled={chosenKind === "" && !hide}
                  onPress={() => open({ kind: "sanction", subject: "owner" })}
                  fullWidth
                  testID="sanction-submit"
                >
                  {moderationLabels.sanctionSubmit}
                </Button>
              </Plate>
            </>
          ) : null}

          {d.can.sanctionReporter ? (
            <Plate style={styles.block}>
              <SelectField
                label={moderationLabels.sanctionReporter}
                value={reporterKind}
                onValueChange={setReporterKind}
                options={(["warning", "suspension_7d", "suspension_30d", "ban"] as const).map((k) => ({
                  value: k,
                  label: sanctionKindLabels[k],
                }))}
              />
              <Button
                variant="plate"
                icon="flag"
                onPress={() => open({ kind: "sanction", subject: "reporter" })}
                fullWidth
              >
                {moderationLabels.sanctionReporter}
              </Button>
            </Plate>
          ) : null}
        </>
      ) : null}
    </AdminPage>
  );
}

export function ReportDetailScreen() {
  return (
    <AdminGate title={moderationLabels.queueTitle} moderator>
      <ReportBody />
    </AdminGate>
  );
}

// --- Sanctions et contestations de sanction ---------------------------------------------------------------------------

const SANCTION_FILTERS = [
  { id: "contested", label: "Contestations à décider" },
  { id: "active", label: "En cours" },
  { id: "all", label: L.filterAll },
] as const;

function SanctionsBody() {
  const { t } = useTheme();
  const [filter, setFilter] = useState<"contested" | "active" | "all">("contested");
  const rows = useApi(() => api.adminSanctions(filter), [filter]);
  const gesture = useGesture();
  const [pending, setPending] = useState<{ row: AdminSanction; action: "uphold" | "lift" | "liftPlain" } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function confirm(note: string) {
    if (!pending) return;
    const body = note || null;
    const ok = await gesture.run(() =>
      pending.action === "liftPlain"
        ? api.liftSanction(pending.row.id, body)
        : api.decideSanction(pending.row.id, pending.action, body),
    );
    if (!ok) return;
    setPending(null);
    setNotice(L.doneLogged);
    await rows.reload();
  }

  const uphold = pending?.action === "uphold";
  return (
    <AdminPage
      title={moderationLabels.sanctionsTitle}
      onRefresh={rows.reload}
      overlays={
        <ReasonSheet
          visible={pending !== null}
          title={uphold ? L.sanctionUpholdTitle : L.sanctionLiftTitle}
          body={uphold ? L.sanctionUpholdBody : L.sanctionLiftBody}
          confirmLabel={uphold ? moderationLabels.uphold : moderationLabels.lift}
          confirmIcon={uphold ? "check" : "undo"}
          reasonLabel={moderationLabels.decisionNote}
          minLength={0}
          busy={gesture.busy}
          error={gesture.error}
          onConfirm={(note) => void confirm(note)}
          onClose={() => {
            setPending(null);
            gesture.setError(null);
          }}
        />
      }
    >
      <AdminFailure error={rows.error} />
      <Filters value={filter} options={SANCTION_FILTERS} onChange={setFilter} />
      {notice ? <Notice>{notice}</Notice> : null}
      {!rows.data ? (
        <EmptyOrLoading loading={rows.loading} empty={moderationLabels.sanctionsEmpty} />
      ) : rows.data.length === 0 ? (
        <Notice>{moderationLabels.sanctionsEmpty}</Notice>
      ) : null}
      {(rows.data ?? []).map((s) => (
        <Plate key={s.id} style={styles.block} testID="sanction">
          <Muted variant="label">
            {moderationLabels.sanctionFrom(formatDayHour(s.startsAt))}
            {s.endsAt && s.kind !== "warning" ? ` · ${moderationLabels.sanctionUntil(formatDayHour(s.endsAt))}` : ""}
          </Muted>
          <Text variant="title" color={t.color.plateInk}>
            {s.pseudo}
          </Text>
          <Chip surface="plate" variant={s.active ? "accent" : "default"}>
            {sanctionKindLabels[s.kind]}
          </Chip>
          <Text variant="body" color={t.color.plateInk}>
            Motif : {reportReasonLabels[s.reason]}
            {s.auto ? ` · ${moderationLabels.autoSanction}` : s.issuedByPseudo ? ` · par ${s.issuedByPseudo}` : ""}
            {s.liftedAt ? ` · ${moderationLabels.sanctionLifted(formatDayHour(s.liftedAt))}` : ""}
          </Text>
          {s.note ? (
            <Text variant="caption" color={t.color.plateMuted}>
              {s.note}
            </Text>
          ) : null}
          <Text variant="caption" color={t.color.plateMuted}>
            {contestStateLabels[s.contestStatus]}
          </Text>
          {s.contestMessage ? (
            <Plate kind="note" testID="contest-message">
              <Text variant="body" color={t.color.plateInk}>
                {s.contestMessage}
                {s.contestedAt ? ` (${formatDayHour(s.contestedAt)})` : ""}
              </Text>
            </Plate>
          ) : null}
          {s.can.decide || s.can.lift ? (
            <View style={styles.stack}>
              {s.can.decide ? (
                <>
                  <Button
                    variant="plate"
                    icon="check"
                    onPress={() => {
                      gesture.setError(null);
                      setNotice(null);
                      setPending({ row: s, action: "uphold" });
                    }}
                    fullWidth
                    testID="sanction-uphold"
                  >
                    {moderationLabels.uphold}
                  </Button>
                  <Button
                    variant="plate"
                    icon="undo"
                    onPress={() => {
                      gesture.setError(null);
                      setNotice(null);
                      setPending({ row: s, action: "lift" });
                    }}
                    fullWidth
                    testID="sanction-contest-lift"
                  >
                    {moderationLabels.lift}
                  </Button>
                </>
              ) : (
                <Button
                  variant="plate"
                  icon="undo"
                  onPress={() => {
                    gesture.setError(null);
                    setNotice(null);
                    setPending({ row: s, action: "liftPlain" });
                  }}
                  fullWidth
                  testID="sanction-lift"
                >
                  {moderationLabels.lift}
                </Button>
              )}
            </View>
          ) : null}
        </Plate>
      ))}
    </AdminPage>
  );
}

export function SanctionsScreen() {
  return (
    <AdminGate title={moderationLabels.sanctionsTitle}>
      <SanctionsBody />
    </AdminGate>
  );
}

// --- Contestations de malus -------------------------------------------------------------------------------------------

function ContestsBody() {
  const { t } = useTheme();
  const rows = useApi(() => api.adminMalusContests(), []);
  const gesture = useGesture();
  const [pending, setPending] = useState<{ row: MalusContestView; accept: boolean } | null>(null);
  const [checkin, setCheckin] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function confirm(note: string) {
    if (!pending) return;
    const ok = await gesture.run(() =>
      api.decideMalusContest(pending.row.id, {
        decision: pending.accept ? "accept" : "reject",
        note: note || null,
        checkin: pending.accept ? checkin : false,
      }),
    );
    if (!ok) return;
    setPending(null);
    setCheckin(false);
    setNotice(pending.accept ? "Malus annulé." : "Malus maintenu.");
    await rows.reload();
  }

  return (
    <AdminPage
      title="Contestations de malus"
      onRefresh={rows.reload}
      overlays={
        <ReasonSheet
          visible={pending !== null}
          title={pending?.accept ? L.malusAcceptTitle : L.malusRejectTitle}
          body={pending?.accept ? L.malusAcceptBody : L.malusRejectBody}
          confirmLabel={pending?.accept ? "Annuler le malus" : "Maintenir le malus"}
          confirmIcon={pending?.accept ? "check" : "close"}
          reasonLabel="Note (envoyée à la personne en cas de refus)"
          minLength={0}
          busy={gesture.busy}
          error={gesture.error}
          onConfirm={(note) => void confirm(note)}
          onClose={() => {
            setPending(null);
            gesture.setError(null);
          }}
        >
          {pending?.accept ? (
            <CheckboxField
              label="Pointer aussi la présence (entré sans scan)"
              checked={checkin}
              onChange={setCheckin}
            />
          ) : null}
        </ReasonSheet>
      }
    >
      <AdminFailure error={rows.error} />
      {notice ? <Notice>{notice}</Notice> : null}
      {!rows.data ? (
        <EmptyOrLoading loading={rows.loading} empty={adminTexts.overviewEmpty} />
      ) : rows.data.length === 0 ? (
        <Notice>{adminTexts.overviewEmpty}</Notice>
      ) : null}
      {(rows.data ?? []).map((c) => (
        <Plate key={c.id} style={styles.block} testID="contest-row">
          <Text variant="title" color={t.color.plateInk}>
            {c.user.pseudo} · {c.event.title}
          </Text>
          <Text variant="body" color={t.color.plateInk}>
            {c.message}
          </Text>
          <Text variant="caption" color={t.color.plateMuted}>
            Déposée le {formatDayHour(c.createdAt)}
            {c.checkedIn ? " · entrée enregistrée" : ""}
          </Text>
          <View style={styles.stack}>
            <Button
              variant="plate"
              icon="check"
              onPress={() => {
                gesture.setError(null);
                setNotice(null);
                setCheckin(false);
                setPending({ row: c, accept: true });
              }}
              fullWidth
              testID="contest-accept"
            >
              Annuler le malus
            </Button>
            <Button
              variant="plate"
              icon="close"
              onPress={() => {
                gesture.setError(null);
                setNotice(null);
                setPending({ row: c, accept: false });
              }}
              fullWidth
              testID="contest-reject"
            >
              Maintenir le malus
            </Button>
          </View>
        </Plate>
      ))}
    </AdminPage>
  );
}

export function ContestsScreen() {
  return (
    <AdminGate title="Contestations de malus">
      <ContestsBody />
    </AdminGate>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  stack: { gap: space2 },
  line: { gap: 2 },
  image: { width: "100%", height: 220 },
});
