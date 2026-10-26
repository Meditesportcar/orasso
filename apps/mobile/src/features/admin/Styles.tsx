// Casquette Administration, catalogue des styles (lot R5a, maquette R5.3 ; remarque 5 de Damien : aussi dans l'appli).
// Même contenu que l'onglet « Styles » de la base véhicules du site, en une colonne : un onglet par type, les styles
// rangés par famille, dans l'ordre (flèches haut / bas au lieu du glisser) ; ajouter, modifier (nom, masculin, famille,
// icône de la liste fermée, âge minimal), mettre en pause ; puis la file « Styles proposés » : ajouter au catalogue,
// rattacher à un style existant, refuser. Les règles (droits, transaction, 409, journal, notifications) sont dans l'API.
import {
  Button,
  Icon,
  type IconName,
  Plate,
  SelectField,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import {
  type AdminCategory,
  type AdminStyleProposalGroup,
  type CategoryIcon,
  categoryFamilyLabels,
  categoryIconLabels,
  categoryIcons,
  cleanStyleName,
  styleLabels as S,
  STYLE_NAME_MAX,
  type StyleFamily,
  styleFamilies,
  styleFitsType,
  type VehicleType,
  vehicleTypes,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle } from "@/ui/Screens";
import { Segments } from "@/ui/Segments";
import { AdminFailure, AdminGate, AdminPage, EmptyOrLoading, useGesture } from "./kit";
import { mergeProposalPages } from "./stylesModel";

const { space1, space2, space3 } = tokens.spacing;

/** Les deux pages de la base véhicules : marques et modèles, styles (onglets en tête de chacune). */
export function VehicleBaseTabs({ current, proposed }: { current: "base" | "styles"; proposed: number | null }) {
  const router = useRouter();
  return (
    <Segments
      items={[
        { id: "base", label: S.baseTab, testID: "vehicle-base-tab" },
        { id: "styles", label: S.adminTabCount(proposed ?? 0), testID: "vehicle-styles-tab" },
      ]}
      value={current}
      onChange={(id) => {
        if (id !== current) router.replace((id === "styles" ? "/styles" : "/vehicules") as never);
      }}
      testID="vehicle-base-tabs"
    />
  );
}

/** Nombre de propositions en attente (onglet « Styles · N proposés »). */
export function useProposedStyles(): number | null {
  const page = useApi(() => api.styleProposals(), []);
  return page.data ? page.data.total : null;
}

type Form = { label: string; labelM: string; family: StyleFamily; icon: CategoryIcon; age: string };
const emptyForm: Form = { label: "", labelM: "", family: "genre", icon: "star", age: "" };
const formOf = (c: AdminCategory): Form => ({
  label: c.label,
  labelM: c.labelM ?? "",
  family: c.family === "pays" ? "genre" : c.family,
  icon: c.icon,
  age: c.minVehicleAge ? String(c.minVehicleAge) : "",
});

/** Champs d'un style : nom, masculin, famille, icône, âge minimal (`pays` : nom seulement, la famille ne change pas). */
function StyleFields({ form, set, country = false }: { form: Form; set: (f: Form) => void; country?: boolean }) {
  return (
    <>
      <TextField
        label={S.fieldLabel}
        value={form.label}
        onChangeText={(label) => set({ ...form, label: label.slice(0, STYLE_NAME_MAX) })}
        maxLength={STYLE_NAME_MAX}
        testID="style-form-label"
      />
      <TextField
        label={S.fieldLabelM}
        value={form.labelM}
        onChangeText={(labelM) => set({ ...form, labelM: labelM.slice(0, STYLE_NAME_MAX) })}
        maxLength={STYLE_NAME_MAX}
      />
      {country ? null : (
        <SelectField
          label={S.fieldFamily}
          value={form.family}
          onValueChange={(family) => set({ ...form, family: family as StyleFamily })}
          options={styleFamilies.map((f) => ({ value: f, label: categoryFamilyLabels[f] }))}
        />
      )}
      <SelectField
        label={S.fieldIcon}
        value={form.icon}
        onValueChange={(icon) => set({ ...form, icon: icon as CategoryIcon })}
        options={categoryIcons.map((i) => ({ value: i, label: categoryIconLabels[i] ?? i }))}
      />
      <TextField
        label={S.fieldAge}
        value={form.age}
        onChangeText={(age) => set({ ...form, age: age.replace(/\D/g, "").slice(0, 3) })}
        keyboardType="number-pad"
        maxLength={3}
      />
    </>
  );
}

/** Le corps envoyé à l'API, ou le message d'une saisie refusée avant l'appel. */
function bodyOf(form: Form) {
  const label = cleanStyleName(form.label);
  if (!label) return { error: S.nameIssue } as const;
  const labelM = form.labelM.trim() ? cleanStyleName(form.labelM) : null;
  if (form.labelM.trim() && !labelM) return { error: S.nameIssue } as const;
  const age = form.age ? Number(form.age) : null;
  if (age !== null && (age < 1 || age > 100)) return { error: "Âge minimal : de 1 à 100 ans." } as const;
  return { label, labelM, family: form.family, icon: form.icon, minVehicleAge: age } as const;
}

type Sheet =
  | { kind: "create" }
  | { kind: "edit"; style: AdminCategory }
  | { kind: "accept"; group: AdminStyleProposalGroup }
  | { kind: "merge"; group: AdminStyleProposalGroup }
  | { kind: "decline"; group: AdminStyleProposalGroup }
  | null;

function StylesBody() {
  const { t } = useTheme();
  const c = t.color;
  const [type, setType] = useState<VehicleType>("car");
  const list = useApi(() => api.adminCategories(), []);
  const queue = useApi(() => api.styleProposals(), []);
  // Tour 2 : la file par pages de 50 groupes, « Charger la suite » ajoute la suivante.
  const [more, setMore] = useState<{ items: AdminStyleProposalGroup[]; next: string | null } | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const groups = mergeProposalPages(queue.data?.items ?? [], more?.items ?? []);
  const nextCursor = more ? more.next : (queue.data?.nextCursor ?? null);
  async function loadMore() {
    if (!nextCursor) return;
    setMoreBusy(true);
    try {
      const page = await api.styleProposals(nextCursor);
      setMore((m) => ({ items: [...(m?.items ?? []), ...page.items], next: page.nextCursor }));
    } catch (e) {
      gesture.setError(errorMessage(e));
    } finally {
      setMoreBusy(false);
    }
  }
  const gesture = useGesture();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [target, setTarget] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const all = list.data ?? [];
  // Les styles du type (pays à part), dans l'ordre ; ceux en pause sont listés à la fin de leur type.
  const ofType = all.filter((s) => s.family !== "pays" && styleFitsType(s.allowedVehicleTypes, type));
  const active = ofType.filter((s) => s.active);
  const paused = ofType.filter((s) => !s.active);
  const countries = all.filter((s) => s.family === "pays");
  const count = (v: VehicleType) =>
    all.filter((s) => s.family !== "pays" && s.active && styleFitsType(s.allowedVehicleTypes, v)).length;

  const reload = async () => {
    setMore(null);
    await Promise.all([list.reload(), queue.reload()]);
  };
  const open = (next: NonNullable<Sheet>) => {
    gesture.setError(null);
    setFormError(null);
    setTarget("");
    if (next.kind === "create") setForm(emptyForm);
    if (next.kind === "edit") setForm(formOf(next.style));
    if (next.kind === "accept") setForm({ ...emptyForm, label: next.group.label });
    setSheet(next);
  };
  const close = () => {
    setSheet(null);
    gesture.setError(null);
    setFormError(null);
  };
  async function act(task: () => Promise<unknown>) {
    setNotice(null);
    if (await gesture.run(task)) {
      setSheet(null);
      setNotice(S.done);
      await reload();
    }
  }

  /** Monte ou descend un style dans sa famille : l'ordre de tout le type part à l'API. */
  async function move(style: AdminCategory, dir: -1 | 1) {
    const family = active.filter((s) => s.family === style.family);
    const i = family.findIndex((s) => s.id === style.id);
    const other = family[i + dir];
    if (!other) return;
    const ids = ofType.map((s) => s.id);
    const a = ids.indexOf(style.id);
    const b = ids.indexOf(other.id);
    [ids[a], ids[b]] = [ids[b] as string, ids[a] as string];
    await act(() => api.orderCategories(type, ids));
  }

  function confirm() {
    if (!sheet) return;
    setFormError(null);
    if (sheet.kind === "decline") return void act(() => api.declineStyle(sheet.group.key, sheet.group.version));
    if (sheet.kind === "merge") {
      if (!target) return setFormError(S.mergeTo);
      return void act(() => api.mergeStyle(sheet.group.key, { version: sheet.group.version, categoryId: target }));
    }
    const body = bodyOf(form);
    if ("error" in body) return setFormError(body.error ?? null);
    if (sheet.kind === "create") return void act(() => api.createCategory({ ...body, vehicleType: type }));
    if (sheet.kind === "edit") {
      const { family, ...rest } = body;
      return void act(() =>
        api.updateCategory(sheet.style.id, sheet.style.family === "pays" ? rest : { ...rest, family }),
      );
    }
    return void act(() => api.acceptStyle(sheet.group.key, { version: sheet.group.version, ...body }));
  }

  const title =
    sheet?.kind === "create"
      ? S.addStyleTo(type)
      : sheet?.kind === "edit"
        ? sheet.style.label
        : sheet?.kind === "accept"
          ? S.accept
          : sheet?.kind === "merge"
            ? S.merge
            : S.declineTitle;
  const sheetBody =
    sheet?.kind === "accept" || sheet?.kind === "merge"
      ? S.queueWithVehicle(sheet.group.withVehicle)
      : sheet?.kind === "decline"
        ? S.declineBody
        : sheet?.kind === "edit"
          ? S.sharedWith(S.typesList(vehicleTypes.filter((v) => styleFitsType(sheet.style.allowedVehicleTypes, v))))
          : S.adminIntroApp;

  const row = (s: AdminCategory, index: number, family: AdminCategory[]) => (
    <Plate key={s.id} style={[styles.row, !s.active && styles.paused]} testID="style-row">
      <View style={[styles.icon, { backgroundColor: c.surfaceRaised }]}>
        <Icon name={s.icon as IconName} size={18} color={c.plateInk} />
      </View>
      <View style={styles.grow}>
        <Text variant="bodyStrong" color={c.plateInk}>
          {s.label}
        </Text>
        <Text variant="caption" color={c.plateMuted}>
          {[
            s.makeMode === "whitelist" ? S.makesRule : S.ageRule(s.minVehicleAge),
            S.vehicles(s.vehicles[type]),
            s.active ? null : S.pausedState,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      {s.active && s.family !== "pays" ? (
        <View style={styles.arrows}>
          <ArrowButton
            icon="up"
            label={`${S.up} ${s.label}`}
            disabled={index === 0 || gesture.busy}
            onPress={() => void move(s, -1)}
          />
          <ArrowButton
            icon="down"
            label={`${S.down} ${s.label}`}
            disabled={index === family.length - 1 || gesture.busy}
            onPress={() => void move(s, 1)}
          />
        </View>
      ) : null}
      <ArrowButton icon="edit" label={`${S.edit} ${s.label}`} onPress={() => open({ kind: "edit", style: s })} />
    </Plate>
  );

  return (
    <AdminPage
      title="Base véhicules"
      onRefresh={reload}
      overlays={
        <ConfirmSheet
          visible={sheet !== null}
          title={title}
          body={sheetBody}
          confirmLabel={
            sheet?.kind === "decline"
              ? S.decline
              : sheet?.kind === "merge"
                ? S.mergeConfirm
                : sheet?.kind === "accept"
                  ? S.accept
                  : sheet?.kind === "create"
                    ? S.addStyle
                    : S.save
          }
          confirmIcon={sheet?.kind === "decline" ? "close" : sheet?.kind === "merge" ? "layers" : "check"}
          danger={sheet?.kind === "decline"}
          busy={gesture.busy}
          error={formError ?? gesture.error}
          onConfirm={confirm}
          onClose={close}
        >
          {sheet?.kind === "create" || sheet?.kind === "edit" || sheet?.kind === "accept" ? (
            <StyleFields form={form} set={setForm} country={sheet.kind === "edit" && sheet.style.family === "pays"} />
          ) : null}
          {sheet?.kind === "merge" ? (
            <SelectField
              label={S.mergeTo}
              value={target}
              onValueChange={setTarget}
              placeholder={S.mergeTo}
              options={all
                .filter((s) => s.active && s.family !== "pays")
                .map((s) => ({
                  value: s.id,
                  label: `${s.label} · ${S.typesList(vehicleTypes.filter((v) => styleFitsType(s.allowedVehicleTypes, v)))}`,
                }))}
            />
          ) : null}
          {sheet?.kind === "edit" ? (
            <Button
              variant="plate"
              icon={sheet.style.active ? "wait" : "undo"}
              loading={gesture.busy}
              onPress={() => void act(() => api.updateCategory(sheet.style.id, { active: !sheet.style.active }))}
              fullWidth
              testID="style-pause"
            >
              {sheet.style.active ? S.pause : S.resume}
            </Button>
          ) : null}
        </ConfirmSheet>
      }
    >
      <VehicleBaseTabs current="styles" proposed={queue.data?.total ?? null} />
      <AdminFailure error={list.error ?? queue.error} />
      {notice ? <Notice>{notice}</Notice> : null}
      {gesture.error && sheet === null ? <Notice tone="error">{gesture.error}</Notice> : null}

      <Segments
        items={vehicleTypes.map((v) => ({ id: v, label: S.typeTab(v, count(v)), testID: `styles-type-${v}` }))}
        value={type}
        onChange={setType}
        testID="styles-types"
      />
      <Muted variant="caption">{S.adminIntroApp}</Muted>
      <Button variant="plate" icon="add" onPress={() => open({ kind: "create" })} fullWidth testID="style-create">
        {S.addStyle}
      </Button>
      {/* Une erreur n'est jamais une liste vide : elle est dite par `AdminFailure`, en tête. */}
      {!list.data && !list.error ? <EmptyOrLoading loading={list.loading} empty={S.queueEmpty} /> : null}
      {styleFamilies.map((f) => {
        const family = active.filter((s) => s.family === f);
        if (!family.length) return null;
        return (
          <View key={f} style={styles.family} testID={`styles-family-${f}`}>
            <SectionTitle>{`${categoryFamilyLabels[f]} · ${S.styleCount(family.length)}`}</SectionTitle>
            {family.map((s, i) => row(s, i, family))}
          </View>
        );
      })}
      {paused.length ? (
        <View style={styles.family} testID="styles-family-paused">
          <SectionTitle>{`${S.pausedFamily} · ${S.styleCount(paused.length)}`}</SectionTitle>
          {paused.map((s, i) => row(s, i, paused))}
        </View>
      ) : null}
      {countries.length ? (
        <View style={styles.family}>
          <SectionTitle>{S.countriesFamily}</SectionTitle>
          {countries.map((s, i) => row(s, i, countries))}
        </View>
      ) : null}

      <SectionTitle>{`${S.queueTitle} · ${queue.data?.total ?? 0}`}</SectionTitle>
      {!queue.data ? (
        queue.error ? null : (
          <EmptyOrLoading loading={queue.loading} empty={S.queueEmpty} />
        )
      ) : groups.length === 0 ? (
        <Notice>{S.queueEmpty}</Notice>
      ) : null}
      {groups.map((g) => (
        <Plate key={g.key} style={styles.group} testID="style-proposal">
          <View style={styles.groupHead}>
            <View style={[styles.badge, { backgroundColor: c.accent }]}>
              <Text variant="bodyStrong" color={c.accentInk}>
                {String(g.count)}
              </Text>
            </View>
            <View style={styles.grow}>
              <Text variant="bodyStrong" color={c.plateInk}>
                {g.label}
              </Text>
              <Text variant="caption" color={c.plateMuted}>
                {S.queueGroup(
                  S.typesList(g.vehicleTypes),
                  g.variants.map((v) => `« ${v.text} » (${v.count})`).join(", "),
                  S.sinceDays(Math.floor((Date.now() - new Date(g.since).getTime()) / 86_400_000)),
                )}
              </Text>
            </View>
          </View>
          <Text variant="caption" color={c.plateMuted}>
            {g.authors.join(", ")}
          </Text>
          {g.existing ? (
            <Text variant="caption" color={c.plateMuted}>
              {S.queueExisting(g.existing.label)}
            </Text>
          ) : null}
          {/* Trois gestes l'un sous l'autre : aucun libellé ne passe sur deux lignes (384 px, police agrandie). */}
          <Button
            variant="plate"
            icon="check"
            onPress={() => open({ kind: "accept", group: g })}
            fullWidth
            testID="style-proposal-accept"
          >
            {S.accept}
          </Button>
          <Button
            variant="plate"
            icon="layers"
            onPress={() => open({ kind: "merge", group: g })}
            fullWidth
            testID="style-proposal-merge"
          >
            {S.merge}
          </Button>
          <Button
            variant="plate"
            icon="close"
            onPress={() => open({ kind: "decline", group: g })}
            fullWidth
            testID="style-proposal-decline"
          >
            {S.decline}
          </Button>
        </Plate>
      ))}
      {nextCursor ? (
        <Button
          variant="plate"
          icon="down"
          loading={moreBusy}
          onPress={() => void loadMore()}
          fullWidth
          testID="style-proposals-more"
        >
          {S.loadMore}
        </Button>
      ) : null}
    </AdminPage>
  );
}

/** Petit bouton carré à icône (flèches, modifier), avec son nom pour les lecteurs d'écran. */
function ArrowButton({
  icon,
  label,
  disabled = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { t } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={[styles.square, { borderColor: t.color.plateLine }, disabled ? styles.off : null]}
    >
      <Icon name={icon} size={18} color={t.color.plateInk} />
    </Pressable>
  );
}

export function StylesScreen() {
  return (
    <AdminGate page title="Base véhicules">
      <StylesBody />
    </AdminGate>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space2, padding: space3 },
  paused: { opacity: 0.6 },
  icon: {
    width: 32,
    height: 32,
    borderRadius: tokens.radius.radiusSm,
    alignItems: "center",
    justifyContent: "center",
  },
  grow: { flex: 1, minWidth: 0 },
  arrows: { flexDirection: "row", gap: space1 },
  square: {
    width: 36,
    height: 36,
    borderRadius: tokens.radius.radiusSm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  off: { opacity: 0.4 },
  family: { gap: space2 },
  group: { gap: space2, padding: space3 },
  groupHead: { flexDirection: "row", alignItems: "center", gap: space3 },
  badge: {
    minWidth: 32,
    height: 32,
    borderRadius: tokens.radius.radiusPill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space2,
  },
});
