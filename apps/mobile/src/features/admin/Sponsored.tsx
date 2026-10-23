// Casquette Administration, emplacements sponsorisés de l'Accueil (lot 35d, routes du lot 30) : création, période,
// ciblage par département, plafond quotidien, statut (brouillon, actif, en pause, terminé), image, affichages et clics.
// Tarif informatif seulement (aucune facturation avant juin 2027). Les dates se saisissent JJ/MM/AAAA. Activer, mettre en
// pause, terminer et supprimer passent par une feuille de confirmation (ils changent ce que voient les passionnés).
import { Button, Chip, Plate, SelectField, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  adminTexts,
  adminAppLabels as L,
  placementStatuses,
  placementStatusLabels,
  type SponsoredPlacementAdmin,
} from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { dayToFr, departmentsOf, parseDayFr } from "@/lib/adminModel";
import { api } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { imageForm, pickOneImage } from "@/lib/structureFiles";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle } from "@/ui/Screens";
import { AdminFailure, AdminGate, AdminPage, EmptyOrLoading, useGesture } from "./kit";

const { space2, space3 } = tokens.spacing;

type Change = { row: SponsoredPlacementAdmin; action: "active" | "paused" | "ended" | "delete" };

function SponsoredBody() {
  const { t } = useTheme();
  const placements = useApi(() => api.sponsoredPlacements(), []);
  const pros = useApi(() => api.adminPros("all", ""), []);
  const gesture = useGesture();
  const [change, setChange] = useState<Change | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const today = dayToFr(new Date().toISOString().slice(0, 10));
  const [form, setForm] = useState({
    proProfileId: "",
    title: "",
    body: "",
    linkUrl: "",
    departments: "",
    startsOn: today,
    endsOn: today,
    dailyCap: "",
    status: "draft",
  });
  const [issue, setIssue] = useState<string | null>(null);
  const published = (pros.data ?? []).filter((p) => p.published);

  async function confirm() {
    if (!change) return;
    const ok = await gesture.run(() =>
      change.action === "delete"
        ? api.deletePlacement(change.row.id)
        : api.setPlacementStatus(change.row.id, change.action),
    );
    if (!ok) return;
    setChange(null);
    setNotice(L.sponsoredDone);
    await placements.reload();
  }

  async function create() {
    const startsOn = parseDayFr(form.startsOn);
    const endsOn = parseDayFr(form.endsOn);
    if (!startsOn || !endsOn) {
      setIssue(L.sponsoredDateInvalid);
      return;
    }
    setIssue(null);
    setNotice(null);
    const cap = form.dailyCap.trim() === "" ? null : Number(form.dailyCap);
    const ok = await gesture.run(() =>
      api.createPlacement({
        proProfileId: form.proProfileId,
        title: form.title.trim(),
        body: form.body.trim(),
        linkUrl: form.linkUrl.trim(),
        departments: departmentsOf(form.departments),
        startsOn,
        endsOn,
        dailyCap: cap !== null && Number.isFinite(cap) ? cap : null,
        status: form.status as "draft" | "active" | "paused",
      }),
    );
    if (!ok) return;
    setNotice(L.sponsoredDone);
    setForm((f) => ({ ...f, title: "", body: "", linkUrl: "", departments: "", dailyCap: "" }));
    await placements.reload();
  }

  async function sendImage(id: string) {
    const photo = await pickOneImage();
    if (!photo) return;
    setNotice(null);
    const ok = await gesture.run(async () =>
      api.uploadPlacementImage(id, await imageForm(photo, "image", "emplacement.jpg")),
    );
    if (ok) {
      setNotice(L.sponsoredDone);
      await placements.reload();
    }
  }

  const sheet = (() => {
    switch (change?.action) {
      case "active":
        return {
          title: L.sponsoredActivateTitle,
          body: L.sponsoredActivateBody,
          label: L.sponsoredActivate,
          icon: "check" as const,
          danger: false,
        };
      case "paused":
        return {
          title: L.sponsoredPauseTitle,
          body: L.sponsoredPauseBody,
          label: L.sponsoredPause,
          icon: "wait" as const,
          danger: false,
        };
      case "ended":
        return {
          title: L.sponsoredEndTitle,
          body: L.sponsoredEndBody,
          label: L.sponsoredEnd,
          icon: "close" as const,
          danger: true,
        };
      case "delete":
        return {
          title: L.sponsoredDeleteTitle,
          body: L.sponsoredDeleteBody,
          label: L.sponsoredDelete,
          icon: "close" as const,
          danger: true,
        };
      default:
        return { title: "", body: "", label: "", icon: "check" as const, danger: false };
    }
  })();

  return (
    <AdminPage
      title="Emplacements sponsorisés"
      onRefresh={placements.reload}
      overlays={
        <ConfirmSheet
          visible={change !== null}
          title={sheet.title}
          body={sheet.body}
          confirmLabel={sheet.label}
          confirmIcon={sheet.icon}
          danger={sheet.danger}
          busy={gesture.busy}
          error={gesture.error}
          onConfirm={() => void confirm()}
          onClose={() => {
            setChange(null);
            gesture.setError(null);
          }}
        />
      }
    >
      <AdminFailure error={placements.error} />
      <Muted variant="caption">{L.sponsoredHint}</Muted>
      {notice ? <Notice>{notice}</Notice> : null}
      {gesture.error && change === null ? <Notice tone="error">{gesture.error}</Notice> : null}
      {!placements.data ? (
        <EmptyOrLoading loading={placements.loading} empty={adminTexts.overviewEmpty} />
      ) : placements.data.length === 0 ? (
        <Notice>{adminTexts.overviewEmpty}</Notice>
      ) : null}
      {(placements.data ?? []).map((p) => (
        <Plate key={p.id} style={styles.block} testID="placement-row">
          <Text variant="title" color={t.color.plateInk}>
            {p.title}
          </Text>
          <Chip surface="plate" variant={p.status === "active" ? "accent" : "default"}>
            {placementStatusLabels[p.status]}
          </Chip>
          <Text variant="caption" color={t.color.plateMuted}>
            {p.proName} · {L.sponsoredPeriod(formatDay(p.startsOn), formatDay(p.endsOn))}
            {p.departments.length ? ` · ${p.departments.join(", ")}` : ` · ${L.sponsoredEverywhere}`}
            {p.dailyCap ? ` · ${L.sponsoredCapText(p.dailyCap)}` : ""}
          </Text>
          <Text variant="body" color={t.color.plateInk}>
            {p.body}
          </Text>
          <Text variant="caption" color={t.color.plateMuted}>
            {L.sponsoredStats(p.impressions, p.clicks)}
          </Text>
          <View style={styles.stack}>
            {p.status !== "active" && p.status !== "ended" ? (
              <Button
                variant="plate"
                icon="check"
                onPress={() => {
                  gesture.setError(null);
                  setNotice(null);
                  setChange({ row: p, action: "active" });
                }}
                fullWidth
                testID="placement-activate"
              >
                {L.sponsoredActivate}
              </Button>
            ) : null}
            {p.status === "active" ? (
              <Button
                variant="plate"
                icon="wait"
                onPress={() => {
                  gesture.setError(null);
                  setNotice(null);
                  setChange({ row: p, action: "paused" });
                }}
                fullWidth
                testID="placement-pause"
              >
                {L.sponsoredPause}
              </Button>
            ) : null}
            {p.status !== "ended" ? (
              <Button
                variant="plate"
                icon="close"
                onPress={() => {
                  gesture.setError(null);
                  setNotice(null);
                  setChange({ row: p, action: "ended" });
                }}
                fullWidth
                testID="placement-end"
              >
                {L.sponsoredEnd}
              </Button>
            ) : null}
            <Button
              variant="plate"
              icon="add"
              loading={gesture.busy}
              onPress={() => void sendImage(p.id)}
              fullWidth
              testID="placement-image"
            >
              {L.sponsoredImage}
            </Button>
            <Button
              variant="plate"
              icon="close"
              onPress={() => {
                gesture.setError(null);
                setNotice(null);
                setChange({ row: p, action: "delete" });
              }}
              fullWidth
              testID="placement-delete"
            >
              {L.sponsoredDelete}
            </Button>
          </View>
        </Plate>
      ))}

      <SectionTitle>{L.sponsoredNew}</SectionTitle>
      <Plate style={styles.block} testID="placement-form">
        <SelectField
          label={L.sponsoredPro}
          value={form.proProfileId}
          onValueChange={(v) => setForm((f) => ({ ...f, proProfileId: v }))}
          placeholder={L.sponsoredProPlaceholder}
          options={published.map((p) => ({ value: p.id, label: p.name }))}
        />
        <TextField
          label={L.sponsoredTitleField}
          value={form.title}
          onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
          maxLength={60}
          testID="placement-title"
        />
        <TextField
          label={L.sponsoredBodyField}
          value={form.body}
          onChangeText={(v) => setForm((f) => ({ ...f, body: v }))}
          maxLength={160}
          multiline
          testID="placement-body"
        />
        <TextField
          label={L.sponsoredLinkField}
          value={form.linkUrl}
          onChangeText={(v) => setForm((f) => ({ ...f, linkUrl: v }))}
          autoCapitalize="none"
          keyboardType="url"
          testID="placement-link"
        />
        <TextField
          label={L.sponsoredDepartments}
          value={form.departments}
          onChangeText={(v) => setForm((f) => ({ ...f, departments: v }))}
          placeholder="66, 11"
        />
        <TextField
          label={L.sponsoredFrom}
          value={form.startsOn}
          onChangeText={(v) => setForm((f) => ({ ...f, startsOn: v }))}
          testID="placement-from"
        />
        <TextField
          label={L.sponsoredTo}
          value={form.endsOn}
          onChangeText={(v) => setForm((f) => ({ ...f, endsOn: v }))}
          testID="placement-to"
          error={issue ?? undefined}
        />
        <TextField
          label={L.sponsoredCap}
          value={form.dailyCap}
          onChangeText={(v) => setForm((f) => ({ ...f, dailyCap: v }))}
          keyboardType="number-pad"
        />
        <SelectField
          label={L.sponsoredStatus}
          value={form.status}
          onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
          options={placementStatuses
            .filter((s) => s !== "ended")
            .map((s) => ({ value: s, label: placementStatusLabels[s] }))}
        />
        <Button
          variant="plate"
          icon="add"
          loading={gesture.busy}
          onPress={() => void create()}
          fullWidth
          testID="placement-create"
        >
          {L.sponsoredCreate}
        </Button>
      </Plate>
    </AdminPage>
  );
}

export function SponsoredScreen() {
  return (
    <AdminGate page title="Sponsorisés">
      <SponsoredBody />
    </AdminGate>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  stack: { gap: space2 },
});
