// Casquette Administration, emplacements sponsorisés de l'Accueil et du Fil (lot 35d, routes du lot 30, lot R7k1) :
// annonceur (un pro d'Orasso ou un annonceur externe, ce dernier derrière `sponsored.external_enabled`), endroits (Accueil,
// Le Fil), mention libre, création, période, ciblage par département, plafond quotidien, statut (brouillon, actif, en
// pause, terminé), image, affichages et clics par endroit, aperçu de la carte 4:5. Tarif informatif seulement (aucune
// facturation avant juin 2027). Les dates se saisissent JJ/MM/AAAA. Activer, mettre en pause, terminer et supprimer
// passent par une feuille de confirmation (ils changent ce que voient les passionnés).
import {
  Button,
  CheckboxField,
  Chip,
  Plate,
  SelectField,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import {
  adminTexts,
  displayDomain,
  adminAppLabels as L,
  placementStatuses,
  placementStatusLabels,
  placementSurfaceLabels,
  type SponsoredPlacementAdmin,
  type SponsoredSurface,
  sponsoredSurfaces,
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
import { SponsoredPreview } from "./SponsoredPreview";

const { space2, space3 } = tokens.spacing;

type Change = { row: SponsoredPlacementAdmin; action: "active" | "paused" | "ended" | "delete" };

function SponsoredBody() {
  const { t } = useTheme();
  const placements = useApi(() => api.sponsoredPlacements(), []);
  const pros = useApi(() => api.adminPros("all", ""), []);
  const settings = useApi(() => api.adminSettings(), []);
  // Réglage `sponsored.external_enabled` : tant qu'il est coupé, aucun annonceur externe n'est diffusé.
  const externalEnabled = settings.data?.entries.find((e) => e.key === "sponsored.external_enabled")?.value === true;
  const gesture = useGesture();
  const [change, setChange] = useState<Change | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const today = dayToFr(new Date().toISOString().slice(0, 10));
  const [form, setForm] = useState({
    kind: "pro" as "pro" | "external",
    proProfileId: "",
    advertiserName: "",
    disclosure: "",
    surfaces: ["home"] as SponsoredSurface[],
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
  // Modification d'un emplacement existant : un seul à la fois.
  const [edit, setEdit] = useState<{
    id: string;
    advertiserName: string;
    disclosure: string;
    departments: string;
    surfaces: SponsoredSurface[];
  } | null>(null);
  const published = (pros.data ?? []).filter((p) => p.published);
  const external = form.kind === "external";
  const draftName = external ? form.advertiserName : (published.find((p) => p.id === form.proProfileId)?.name ?? "");
  const hasExternal = (placements.data ?? []).some((p) => p.advertiserKind === "external");

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
        advertiserKind: form.kind,
        ...(external ? { advertiserName: form.advertiserName.trim() } : { proProfileId: form.proProfileId }),
        disclosure: form.disclosure.trim() || null,
        surfaces: external ? ["feed"] : form.surfaces,
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

  async function saveEdit(row: SponsoredPlacementAdmin) {
    if (!edit) return;
    setNotice(null);
    const ok = await gesture.run(() =>
      api.updatePlacement(row.id, {
        ...(row.advertiserKind === "external" ? { advertiserName: edit.advertiserName.trim() } : {}),
        disclosure: edit.disclosure.trim() || null,
        surfaces: row.advertiserKind === "external" ? ["feed"] : edit.surfaces,
        departments: departmentsOf(edit.departments),
      }),
    );
    if (!ok) return;
    setEdit(null);
    setNotice(L.sponsoredDone);
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
      {!externalEnabled && (hasExternal || external) ? (
        <Notice testID="external-warning">{L.sponsoredExternalWarning}</Notice>
      ) : null}
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
          <View style={styles.chips}>
            <Chip surface="plate" variant={p.status === "active" ? "accent" : "default"}>
              {placementStatusLabels[p.status]}
            </Chip>
            {p.advertiserKind === "external" && !externalEnabled ? (
              <Chip surface="plate">{L.sponsoredExternalCut}</Chip>
            ) : null}
          </View>
          <Text variant="caption" color={t.color.plateMuted}>
            {p.advertiserName}
            {p.advertiserKind === "external" ? ` · ${L.sponsoredAdvertiserExternal.toLowerCase()}` : ""}
            {` · ${p.surfaces.map((x) => placementSurfaceLabels[x]).join(" + ")}`}
            {` · ${L.sponsoredPeriod(formatDay(p.startsOn), formatDay(p.endsOn))}`}
            {p.departments.length ? ` · ${p.departments.join(", ")}` : ` · ${L.sponsoredEverywhere}`}
            {p.dailyCap ? ` · ${L.sponsoredCapText(p.dailyCap)}` : ""}
          </Text>
          <Text variant="body" color={t.color.plateInk}>
            {p.body}
          </Text>
          <Text variant="caption" color={t.color.plateMuted}>
            {L.sponsoredStats(p.impressions, p.clicks)}
          </Text>
          {sponsoredSurfaces
            .filter((x) => p.surfaces.includes(x))
            .map((x) => (
              <Text key={x} variant="caption" color={t.color.plateMuted} testID={`placement-stats-${x}`}>
                {L.sponsoredSurfaceStats(placementSurfaceLabels[x], p.bySurface[x].impressions, p.bySurface[x].clicks)}
              </Text>
            ))}
          <SponsoredPreview
            advertiserName={
              edit?.id === p.id && p.advertiserKind === "external" ? edit.advertiserName : p.advertiserName
            }
            title={p.title}
            body={p.body}
            imageUrl={p.imageUrl}
            disclosure={edit?.id === p.id ? edit.disclosure.trim() || null : p.disclosure}
            domain={p.advertiserKind === "external" ? p.externalUrlDomain : null}
          />
          {edit?.id === p.id ? (
            <View style={styles.stack} testID="placement-edit">
              <Text variant="label" color={t.color.plateInk}>
                {L.sponsoredEditTitle}
              </Text>
              {p.advertiserKind === "external" ? (
                <TextField
                  label={L.sponsoredAdvertiserName}
                  value={edit.advertiserName}
                  onChangeText={(v) => setEdit((e) => (e ? { ...e, advertiserName: v } : e))}
                  maxLength={80}
                  testID="placement-edit-advertiser"
                />
              ) : (
                <Muted variant="caption">{L.sponsoredProNameFixed}</Muted>
              )}
              <Text variant="label" color={t.color.plateMuted}>
                {L.sponsoredSurfacesField}
              </Text>
              {sponsoredSurfaces.map((x) => (
                <CheckboxField
                  key={x}
                  label={placementSurfaceLabels[x]}
                  checked={edit.surfaces.includes(x)}
                  disabled={p.advertiserKind === "external"}
                  onChange={(on) =>
                    setEdit((e) =>
                      e ? { ...e, surfaces: on ? [...e.surfaces, x] : e.surfaces.filter((y) => y !== x) } : e,
                    )
                  }
                />
              ))}
              <TextField
                label={L.sponsoredDisclosureField}
                value={edit.disclosure}
                onChangeText={(v) => setEdit((e) => (e ? { ...e, disclosure: v } : e))}
                maxLength={40}
                placeholder="Publicité"
                testID="placement-edit-disclosure"
              />
              <TextField
                label={L.sponsoredDepartments}
                value={edit.departments}
                onChangeText={(v) => setEdit((e) => (e ? { ...e, departments: v } : e))}
                placeholder="66, 11"
              />
              {gesture.error ? <Notice tone="error">{gesture.error}</Notice> : null}
              <Button
                variant="plate"
                icon="check"
                loading={gesture.busy}
                onPress={() => void saveEdit(p)}
                fullWidth
                testID="placement-edit-save"
              >
                {L.sponsoredSave}
              </Button>
              <Button
                variant="plate"
                icon="close"
                onPress={() => {
                  gesture.setError(null);
                  setEdit(null);
                }}
                fullWidth
                testID="placement-edit-cancel"
              >
                {L.sponsoredCancel}
              </Button>
            </View>
          ) : null}
          <View style={styles.stack}>
            {edit?.id !== p.id ? (
              <Button
                variant="plate"
                icon="edit"
                onPress={() => {
                  gesture.setError(null);
                  setNotice(null);
                  setEdit({
                    id: p.id,
                    advertiserName: p.advertiserName,
                    disclosure: p.disclosure ?? "",
                    departments: p.departments.join(", "),
                    surfaces: p.surfaces,
                  });
                }}
                fullWidth
                testID="placement-edit-open"
              >
                {L.sponsoredEdit}
              </Button>
            ) : null}
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
          label={L.sponsoredAdvertiser}
          value={form.kind}
          onValueChange={(v) =>
            setForm((f) => ({
              ...f,
              kind: v === "external" ? "external" : "pro",
              surfaces: v === "external" ? ["feed"] : ["home"],
            }))
          }
          options={[
            { value: "pro", label: L.sponsoredAdvertiserPro },
            { value: "external", label: L.sponsoredAdvertiserExternal },
          ]}
        />
        {external ? (
          <>
            <TextField
              label={L.sponsoredAdvertiserName}
              value={form.advertiserName}
              onChangeText={(v) => setForm((f) => ({ ...f, advertiserName: v }))}
              maxLength={80}
              testID="placement-advertiser"
            />
            <Muted variant="caption">{L.sponsoredExternalOnly}</Muted>
          </>
        ) : (
          <SelectField
            label={L.sponsoredPro}
            value={form.proProfileId}
            onValueChange={(v) => setForm((f) => ({ ...f, proProfileId: v }))}
            placeholder={L.sponsoredProPlaceholder}
            options={published.map((p) => ({ value: p.id, label: p.name }))}
          />
        )}
        <Text variant="label" color={t.color.plateMuted}>
          {L.sponsoredSurfacesField}
        </Text>
        {sponsoredSurfaces.map((x) => (
          <CheckboxField
            key={x}
            label={placementSurfaceLabels[x]}
            checked={form.surfaces.includes(x)}
            disabled={external}
            onChange={(on) =>
              setForm((f) => ({ ...f, surfaces: on ? [...f.surfaces, x] : f.surfaces.filter((y) => y !== x) }))
            }
          />
        ))}
        <TextField
          label={L.sponsoredDisclosureField}
          value={form.disclosure}
          onChangeText={(v) => setForm((f) => ({ ...f, disclosure: v }))}
          maxLength={40}
          placeholder="Publicité"
          testID="placement-disclosure"
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
        <SponsoredPreview
          advertiserName={draftName}
          title={form.title}
          body={form.body}
          imageUrl={null}
          disclosure={form.disclosure.trim() || null}
          domain={external ? displayDomain(form.linkUrl) : null}
          isNew
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
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
});
