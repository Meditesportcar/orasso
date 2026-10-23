// Casquette Administration, registres (lot 35d) : structures, pros, base véhicules avec la file « Autre », journal des
// accès. Les utilisateurs ont leur fichier (`Users.tsx`). Mêmes pages, mêmes droits (super admin) et mêmes motifs que
// le site ; les gestes d'écriture passent par une feuille de confirmation.
import {
  Button,
  Chip,
  Photo,
  Plate,
  SelectField,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import {
  type AdminAuditRow,
  type AdminProRow,
  adminTexts,
  adminAppLabels as L,
  type OtherVehicleGroup,
  type ProActivity,
  proActivityLabels,
  type ReferenceGeneration,
  type ReferenceMake,
  type ReferenceModel,
  registryStatusLabels,
  structureVerificationLabels,
  vehicleTypeLabels,
  vehicleTypes,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { auditRange, parseYear } from "@/lib/adminModel";
import { api, type StructureRegistryRow } from "@/lib/api";
import { formatDay, formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle } from "@/ui/Screens";
import { SurveyButton } from "./Assistance";
import {
  AdminFailure,
  AdminGate,
  AdminPage,
  EmptyOrLoading,
  Fact,
  Filters,
  ReasonSheet,
  SearchBox,
  useGesture,
} from "./kit";

const { space2, space3 } = tokens.spacing;

// --- Structures -------------------------------------------------------------------------------------------------------

function StructuresBody() {
  const { t } = useTheme();
  const router = useRouter();
  const [field, setField] = useState("");
  const [q, setQ] = useState("");
  const rows = useApi(() => api.structureRegistry(q), [q]);
  return (
    <AdminPage title={L.registryStructures} onRefresh={rows.reload}>
      <SearchBox
        label={L.structureSearch}
        value={field}
        onChange={setField}
        onSubmit={() => setQ(field.trim())}
        testID="admin-structures-q"
      />
      <AdminFailure error={rows.error} />
      {!rows.data ? (
        <EmptyOrLoading loading={rows.loading} empty={adminTexts.noResult} />
      ) : rows.data.length === 0 ? (
        <Notice>{adminTexts.noResult}</Notice>
      ) : null}
      {(rows.data ?? []).map((s: StructureRegistryRow) => (
        <Plate key={s.id} style={styles.block} testID="structure-row">
          <Text variant="title" color={t.color.plateInk}>
            {s.name}
          </Text>
          <Text variant="caption" color={t.color.plateMuted}>
            {[s.city, s.department].filter(Boolean).join(" · ")}
          </Text>
          <View style={styles.chips}>
            <Chip surface="plate">{structureVerificationLabels[s.verification]}</Chip>
            {s.assistanceOpen ? (
              <Chip surface="plate" variant="accent">
                Demande d'aide
              </Chip>
            ) : null}
          </View>
          <Text variant="caption" color={t.color.plateMuted}>
            {s.badgeExpiresAt ? `Badge jusqu'au ${formatDay(s.badgeExpiresAt)}` : "Pas de badge"} ·{" "}
            {s.owner ? `propriétaire ${s.owner.pseudo}` : "pas de propriétaire"} ·{" "}
            {L.structureMembersEvents(s.members, s.events)}
          </Text>
          <Button
            variant="plate"
            icon="next"
            onPress={() => router.push(`/(admin)/fiche-structure/${s.id}` as never)}
            fullWidth
            testID="structure-open"
          >
            {L.userFile}
          </Button>
          <SurveyButton structure={{ id: s.id, name: s.name, slug: s.slug }} />
        </Plate>
      ))}
    </AdminPage>
  );
}

export function StructuresScreen() {
  return (
    <AdminGate page title={L.registryStructures}>
      <StructuresBody />
    </AdminGate>
  );
}

// --- Pros -------------------------------------------------------------------------------------------------------------

function ProsBody() {
  const { t } = useTheme();
  const [filter, setFilter] = useState<"to_verify" | "all">("to_verify");
  const [field, setField] = useState("");
  const [q, setQ] = useState("");
  const rows = useApi(() => api.adminPros(filter, q), [filter, q]);
  const gesture = useGesture();
  const [pending, setPending] = useState<AdminProRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function confirm(note: string) {
    if (!pending) return;
    const ok = await gesture.run(() => api.verifyPro(pending.id, !pending.verified, note));
    if (!ok) return;
    setPending(null);
    setNotice(L.doneLogged);
    await rows.reload();
  }
  return (
    <AdminPage
      title={L.registryPros}
      onRefresh={rows.reload}
      overlays={
        <ReasonSheet
          visible={pending !== null}
          title={pending?.verified ? L.proUnverifyTitle : L.proVerifyTitle}
          body={pending?.verified ? L.proUnverifyBody : L.proVerifyBody}
          confirmLabel={pending?.verified ? L.proRemoveBadge : L.proVerifyManual}
          confirmIcon={pending?.verified ? "close" : "check"}
          reasonLabel={adminTexts.reasonLabel}
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
      <Filters
        value={filter}
        options={[
          { id: "to_verify", label: L.proFilterToVerify },
          { id: "all", label: L.proFilterAll },
        ]}
        onChange={setFilter}
      />
      <SearchBox
        label={L.proSearch}
        value={field}
        onChange={setField}
        onSubmit={() => setQ(field.trim())}
        testID="admin-pros-q"
      />
      <AdminFailure error={rows.error} />
      {notice ? <Notice>{notice}</Notice> : null}
      {!rows.data ? (
        <EmptyOrLoading loading={rows.loading} empty={adminTexts.noResult} />
      ) : rows.data.length === 0 ? (
        <Notice>{adminTexts.noResult}</Notice>
      ) : null}
      {(rows.data ?? []).map((p) => (
        <Plate key={p.id} style={styles.block} testID="pro-row">
          <Text variant="title" color={t.color.plateInk}>
            {p.name}
          </Text>
          <Text variant="caption" color={t.color.plateMuted}>
            {p.activities.map((a) => proActivityLabels[a as ProActivity] ?? a).join(" · ")}
            {p.city ? ` · ${p.city}` : ""}
            {p.owner ? ` · ${p.owner.pseudo}` : ""}
          </Text>
          <View style={styles.chips}>
            <Chip surface="plate">{p.verified ? "Pro vérifié" : "Sans badge"}</Chip>
            {!p.published ? <Chip surface="plate">Non publiée</Chip> : null}
          </View>
          <Text variant="caption" color={t.color.plateMuted}>
            {p.siret ? `SIRET ${p.siret}` : "Pas de SIRET"}
            {p.registryStatus
              ? ` · ${registryStatusLabels[p.registryStatus as keyof typeof registryStatusLabels] ?? p.registryStatus}`
              : ""}
          </Text>
          <Button
            variant="plate"
            icon={p.verified ? "close" : "check"}
            onPress={() => {
              gesture.setError(null);
              setNotice(null);
              setPending(p);
            }}
            fullWidth
            testID="pro-verify"
          >
            {p.verified ? L.proRemoveBadge : L.proVerifyManual}
          </Button>
        </Plate>
      ))}
    </AdminPage>
  );
}

export function ProsScreen() {
  return (
    <AdminGate page title={L.registryPros}>
      <ProsBody />
    </AdminGate>
  );
}

// --- Base véhicules ---------------------------------------------------------------------------------------------------

function ListRow({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} testID={testID}>
      <Plate style={styles.listRow}>
        <Text variant={selected ? "bodyStrong" : "body"} color={t.color.plateInk} style={styles.grow}>
          {label}
        </Text>
        {selected ? (
          <Chip surface="plate" selected>
            Choisi
          </Chip>
        ) : null}
      </Plate>
    </Pressable>
  );
}

function VehiclesBody() {
  const { t } = useTheme();
  const [makeId, setMakeId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const makes = useApi(() => api.referenceMakes(), []);
  const others = useApi(() => api.referenceOthers(), []);
  const models = useApi(() => api.referenceModels(makeId ?? ""), [makeId], { enabled: makeId !== null });
  const generations = useApi(() => api.referenceGenerations(modelId ?? ""), [modelId], { enabled: modelId !== null });
  const gesture = useGesture();
  const [notice, setNotice] = useState<string | null>(null);

  const make: ReferenceMake | null = makes.data?.find((m) => m.id === makeId) ?? null;
  const modelList: ReferenceModel[] = makeId ? (models.data ?? []) : [];
  const model: ReferenceModel | null = modelList.find((m) => m.id === modelId) ?? null;
  const genList: ReferenceGeneration[] = model ? (generations.data ?? []) : [];
  const target = make && model && !model.isOther ? { make, model } : null;

  // Formulaires.
  const [makeName, setMakeName] = useState("");
  const [makeCountry, setMakeCountry] = useState("");
  const [modelName, setModelName] = useState("");
  const [modelType, setModelType] = useState<string>(vehicleTypes[0]);
  const [genName, setGenName] = useState("");
  const [genFrom, setGenFrom] = useState("");
  const [genTo, setGenTo] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reassigning, setReassigning] = useState<{ id: string; label: string } | null>(null);
  const [genChoice, setGenChoice] = useState<Record<string, string>>({});

  const reloadAll = async () => {
    await Promise.all([makes.reload(), others.reload(), models.reload(), generations.reload()]);
  };

  async function create(task: () => Promise<unknown>, message: string, after?: () => void) {
    setFormError(null);
    setNotice(null);
    const ok = await gesture.run(task);
    if (!ok) return;
    after?.();
    setNotice(message);
    await reloadAll();
  }

  return (
    <AdminPage
      title={L.registryVehicles}
      onRefresh={reloadAll}
      overlays={
        <>
          <ConfirmSheet
            visible={deleting}
            title={L.vehicleDeleteTitle}
            body={L.vehicleDeleteBody}
            confirmLabel={L.vehicleDeleteMake}
            confirmIcon="close"
            danger
            busy={gesture.busy}
            error={gesture.error}
            onConfirm={() =>
              void (async () => {
                if (make && (await gesture.run(() => api.deleteMake(make.id)))) {
                  setDeleting(false);
                  setMakeId(null);
                  setModelId(null);
                  setNotice(L.doneLogged);
                  await reloadAll();
                }
              })()
            }
            onClose={() => {
              setDeleting(false);
              gesture.setError(null);
            }}
          />
          <ConfirmSheet
            visible={reassigning !== null}
            title={L.vehicleReassignTitle}
            body={`${L.vehicleReassignBody} ${target ? `${L.vehicleTarget} : ${target.make.name} ${target.model.name}.` : ""}`}
            confirmLabel={adminTexts.reassign}
            busy={gesture.busy}
            error={gesture.error}
            onConfirm={() =>
              void (async () => {
                if (!reassigning || !target) return;
                const generationId = genChoice[reassigning.id] || null;
                if (
                  await gesture.run(() =>
                    api.reassignVehicle(reassigning.id, target.make.id, target.model.id, generationId),
                  )
                ) {
                  setReassigning(null);
                  setNotice(L.doneLogged);
                  await reloadAll();
                }
              })()
            }
            onClose={() => {
              setReassigning(null);
              gesture.setError(null);
            }}
          />
        </>
      }
    >
      <AdminFailure error={makes.error ?? others.error} />
      {notice ? <Notice>{notice}</Notice> : null}
      {formError ? <Notice tone="error">{formError}</Notice> : null}
      {gesture.error && !deleting && reassigning === null ? <Notice tone="error">{gesture.error}</Notice> : null}

      <SectionTitle>{L.vehicleMakes}</SectionTitle>
      {(makes.data ?? []).map((m) => (
        <ListRow
          key={m.id}
          label={`${m.name}${m.country ? ` · ${m.country}` : ""} · ${m.vehicles}`}
          selected={m.id === makeId}
          onPress={() => {
            setMakeId(m.id === makeId ? null : m.id);
            setModelId(null);
          }}
          testID="make-row"
        />
      ))}
      <Plate style={styles.block} testID="make-form">
        <TextField label={L.vehicleNewMake} value={makeName} onChangeText={setMakeName} testID="make-name" />
        <TextField
          label={L.vehicleCountry}
          value={makeCountry}
          onChangeText={setMakeCountry}
          maxLength={2}
          autoCapitalize="characters"
        />
        <Button
          variant="plate"
          icon="add"
          loading={gesture.busy}
          onPress={() =>
            void create(
              async () => {
                const made = await api.createMake(makeName.trim(), makeCountry.trim().toUpperCase() || null);
                setMakeId(made.id);
                setModelId(null);
              },
              L.doneLogged,
              () => {
                setMakeName("");
                setMakeCountry("");
              },
            )
          }
          fullWidth
          testID="make-create"
        >
          {L.vehicleCreateMake}
        </Button>
      </Plate>

      {make && !make.isOther ? (
        <>
          <SectionTitle>{`${L.vehicleModels} · ${make.name}`}</SectionTitle>
          {modelList.map((m) => (
            <ListRow
              key={m.id}
              label={`${m.name} · ${vehicleTypeLabels[m.vehicleType as keyof typeof vehicleTypeLabels]} · ${m.vehicles}`}
              selected={m.id === modelId}
              onPress={() => setModelId(m.id === modelId ? null : m.id)}
              testID="model-row"
            />
          ))}
          <Plate style={styles.block} testID="model-form">
            <TextField label={L.vehicleNewModel} value={modelName} onChangeText={setModelName} testID="model-name" />
            <SelectField
              label={L.vehicleType}
              value={modelType}
              onValueChange={setModelType}
              options={vehicleTypes.map((v) => ({ value: v, label: vehicleTypeLabels[v] }))}
            />
            <Button
              variant="plate"
              icon="add"
              loading={gesture.busy}
              onPress={() =>
                void create(
                  async () => {
                    const made = await api.createModel(make.id, modelName.trim(), modelType);
                    setModelId(made.id);
                  },
                  L.doneLogged,
                  () => setModelName(""),
                )
              }
              fullWidth
              testID="model-create"
            >
              {L.vehicleCreateModel}
            </Button>
            {make.vehicles === 0 ? (
              <Button
                variant="plate"
                icon="close"
                onPress={() => {
                  gesture.setError(null);
                  setDeleting(true);
                }}
                fullWidth
                testID="make-delete"
              >
                {L.vehicleDeleteMake}
              </Button>
            ) : null}
          </Plate>
        </>
      ) : null}

      {make && model && !model.isOther ? (
        <>
          <SectionTitle>{`${L.vehicleGenerations} · ${make.name} ${model.name}`}</SectionTitle>
          {genList.map((g) => (
            <Plate key={g.id} style={styles.block} testID="generation-row">
              <Text variant="body" color={t.color.plateInk}>
                {g.name}
                {g.yearFrom ? ` · ${g.yearFrom}–${g.yearTo ?? ""}` : ""} · {g.vehicles}
              </Text>
            </Plate>
          ))}
          <Plate style={styles.block} testID="generation-form">
            <TextField
              label={L.vehicleNewGeneration}
              value={genName}
              onChangeText={setGenName}
              testID="generation-name"
            />
            <TextField
              label={L.vehicleYearFrom}
              value={genFrom}
              onChangeText={setGenFrom}
              keyboardType="number-pad"
              maxLength={4}
            />
            <TextField
              label={L.vehicleYearTo}
              value={genTo}
              onChangeText={setGenTo}
              keyboardType="number-pad"
              maxLength={4}
            />
            <Button
              variant="plate"
              icon="add"
              loading={gesture.busy}
              onPress={() => {
                const from = parseYear(genFrom);
                const to = parseYear(genTo);
                if (from === undefined || to === undefined) {
                  setFormError("Années sur quatre chiffres.");
                  return;
                }
                void create(
                  () => api.createGeneration(model.id, genName.trim(), from, to),
                  L.doneLogged,
                  () => {
                    setGenName("");
                    setGenFrom("");
                    setGenTo("");
                  },
                );
              }}
              fullWidth
              testID="generation-create"
            >
              {L.vehicleCreateGeneration}
            </Button>
          </Plate>
        </>
      ) : null}

      <SectionTitle>{adminTexts.otherQueue}</SectionTitle>
      <Muted variant="caption">{adminTexts.otherQueueHint}</Muted>
      {target ? (
        <Notice>{`${L.vehicleTarget} : ${target.make.name} ${target.model.name}`}</Notice>
      ) : (
        <Notice>{L.vehicleChooseTarget}</Notice>
      )}
      {!others.data ? (
        <EmptyOrLoading loading={others.loading} empty={adminTexts.overviewEmpty} />
      ) : others.data.length === 0 ? (
        <Notice>{adminTexts.overviewEmpty}</Notice>
      ) : null}
      {(others.data ?? []).map((g: OtherVehicleGroup) => (
        <View key={g.key} style={styles.stack} testID="other-group">
          <Muted variant="label">
            {
              (g.level === "make"
                ? L.vehicleUnknownMake
                : g.level === "model"
                  ? L.vehicleUnknownModel(g.make.name)
                  : L.vehicleUnknownGeneration(g.make.name, g.model.name)) as string
            }{" "}
            · {g.vehicles.length}
          </Muted>
          {g.vehicles.map((v) => (
            <Plate key={v.id} style={styles.block} testID="other-vehicle">
              {v.photoUrl ? <Photo source={mediaSource(v.photoUrl)} style={styles.photo} /> : null}
              <Text variant="bodyStrong" color={t.color.plateInk}>
                {v.description ?? L.vehicleNoDescription}
              </Text>
              <Text variant="caption" color={t.color.plateMuted}>
                {v.ownerPseudo}
                {v.year ? ` · ${v.year}` : ""}
                {v.engine ? ` · ${v.engine}` : ""}
              </Text>
              {target ? (
                <>
                  <SelectField
                    label="Génération"
                    value={genChoice[v.id] ?? ""}
                    onValueChange={(value) => setGenChoice((c) => ({ ...c, [v.id]: value }))}
                    options={[
                      { value: "", label: L.vehicleNoGeneration },
                      ...genList.filter((x) => !x.isOther).map((x) => ({ value: x.id, label: x.name })),
                    ]}
                  />
                  <Button
                    variant="plate"
                    icon="check"
                    onPress={() => {
                      gesture.setError(null);
                      setReassigning({ id: v.id, label: v.description ?? "" });
                    }}
                    fullWidth
                    testID="vehicle-reassign"
                  >
                    {adminTexts.reassign}
                  </Button>
                </>
              ) : null}
            </Plate>
          ))}
        </View>
      ))}
    </AdminPage>
  );
}

export function VehiclesScreen() {
  return (
    <AdminGate page title={L.registryVehicles}>
      <VehiclesBody />
    </AdminGate>
  );
}

// --- Journal des accès ------------------------------------------------------------------------------------------------

function AuditBody() {
  const { t } = useTheme();
  const [form, setForm] = useState({ action: "", actor: "", target: "", from: "", to: "" });
  const [applied, setApplied] = useState<{
    action?: string;
    actor?: string;
    target?: string;
    from?: string;
    to?: string;
  }>({});
  const [issue, setIssue] = useState<string | null>(null);
  const first = useApi(() => api.adminAudit(applied), [JSON.stringify(applied)]);
  const [more, setMore] = useState<AdminAuditRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    setMore([]);
    setCursor(first.data?.nextCursor ?? null);
  }, [first.data]);
  const items = [...(first.data?.items ?? []), ...more];

  function apply() {
    const range = auditRange(form.from, form.to);
    if (range.invalid) {
      setIssue(L.auditDateInvalid);
      return;
    }
    setIssue(null);
    setApplied({
      action: form.action.trim() || undefined,
      actor: form.actor.trim() || undefined,
      target: form.target.trim() || undefined,
      from: range.from,
      to: range.to,
    });
  }
  async function next() {
    if (!cursor) return;
    try {
      const page = await api.adminAudit({ ...applied, cursor });
      setMore((m) => [...m, ...page.items]);
      setCursor(page.nextCursor);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }
  return (
    <AdminPage title={adminTexts.audit} onRefresh={first.reload}>
      <Plate style={styles.block}>
        <TextField
          label={L.auditAction}
          value={form.action}
          onChangeText={(v) => setForm((f) => ({ ...f, action: v }))}
          autoCapitalize="none"
          testID="audit-action"
        />
        <TextField
          label={L.auditActor}
          value={form.actor}
          onChangeText={(v) => setForm((f) => ({ ...f, actor: v }))}
          autoCapitalize="none"
          testID="audit-actor"
        />
        <TextField
          label={L.auditTarget}
          value={form.target}
          onChangeText={(v) => setForm((f) => ({ ...f, target: v }))}
          autoCapitalize="none"
        />
        <TextField
          label={L.auditFrom}
          value={form.from}
          onChangeText={(v) => setForm((f) => ({ ...f, from: v }))}
          placeholder="25/12/2026"
        />
        <TextField
          label={L.auditTo}
          value={form.to}
          onChangeText={(v) => setForm((f) => ({ ...f, to: v }))}
          placeholder="31/12/2026"
          error={issue ?? undefined}
        />
        <Button variant="plate" icon="search" onPress={apply} fullWidth testID="audit-filter">
          {L.auditFilter}
        </Button>
      </Plate>
      <AdminFailure error={first.error} />
      {loadError ? <Notice tone="error">{loadError}</Notice> : null}
      {!first.data ? (
        <EmptyOrLoading loading={first.loading} empty={adminTexts.noResult} />
      ) : items.length === 0 ? (
        <Notice>{adminTexts.noResult}</Notice>
      ) : null}
      {items.map((r) => (
        <Plate key={r.id} style={styles.block} testID="audit-row">
          <Text variant="bodyStrong" color={t.color.plateInk}>
            {r.action}
            {r.assistanceRequestId ? ` · ${L.auditOnRequest}` : ""}
          </Text>
          <Text variant="caption" color={t.color.plateMuted}>
            {formatDayHour(r.createdAt)} · {r.actorPseudo ?? r.actorUserId}
          </Text>
          <Text variant="caption" color={t.color.plateMuted}>
            {r.targetType} · {r.targetId}
          </Text>
          <Fact label={L.reasonShort}>{r.reason ?? "—"}</Fact>
        </Plate>
      ))}
      {cursor ? (
        <Button variant="plate" icon="down" onPress={() => void next()} fullWidth testID="audit-more">
          {L.more}
        </Button>
      ) : null}
    </AdminPage>
  );
}

export function AuditScreen() {
  return (
    <AdminGate page title={adminTexts.audit}>
      <AuditBody />
    </AdminGate>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  stack: { gap: space2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  listRow: { flexDirection: "row", alignItems: "center", gap: space2, padding: space3 },
  grow: { flex: 1 },
  photo: { width: "100%", height: 140 },
});
