// Les feuilles de l'Explorer R2 (maquettes R2.2, R2.3, R2.5) : « Où chercher ? » (Autour de moi et sa distance, Mon
// coin, Ailleurs, Partout en France), « Trier », « Quel métier ? », « Filtres », et pour Personnes et crews « Où
// chercher ? » (départements seulement), « Montrer » et « Filtres ». Règle commune : un seul choix (Trier, Métier,
// Montrer) s'applique au toucher et ferme la feuille ; plusieurs réglages (Où chercher, Filtres) se valident par un
// bouton « Voir les N … » dont le nombre suit les réglages.
import {
  archivoAt,
  Button,
  Chip,
  ChipRow,
  departmentChoices,
  departmentLabel,
  Icon,
  type IconName,
  proActivityIcons,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import {
  clampKm,
  type ExplorerWhere,
  eventFormatLabels,
  eventFormats,
  explorerV2Labels as L,
  type ProActivity,
  type ProActivityCounts,
  proActivities,
  proActivityLabels,
  explorerR2Labels as R,
  roadTime,
  WHERE_KM,
} from "@orasso/shared";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from "react-native";

import { AppSheet } from "@/ui/AppSheet";
import type { PeopleWhere } from "./explorerChoice";
import type { EventFilters, When } from "./queries";

const { space1, space2, space3 } = tokens.spacing;

/** En-tête de feuille `.sh-h` : titre italique 18 px, ✕ sur fond de carte. */
export function SheetHead({ title, onClose }: { title: string; onClose: () => void }) {
  const { t } = useTheme();
  return (
    <View style={styles.shH}>
      <Text variant="posterM" color={t.color.ink} accessibilityRole="header" style={styles.shTitle}>
        {title}
      </Text>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Fermer"
        style={[styles.closex, { backgroundColor: t.color.surface }]}
        testID="sheet-close"
      >
        <Icon name="close" size={20} color={t.color.ink} />
      </Pressable>
    </View>
  );
}

/** Nom d'un département : « Pyrénées-Orientales ». */
export const deptName = (code: string) => departmentChoices.find((d) => d.code === code)?.name ?? code;
/** « Pyrénées-Orientales (66) ». */
export const deptLong = (code: string) => R.pillDept(deptName(code), code);

/** `.opt` : une option, sa pastille d'icône, son rond de choix. */
export function OptRow({
  on,
  icon,
  title,
  hint,
  onPress,
  disabled = false,
  testID,
}: {
  on: boolean;
  icon: IconName;
  title: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
  testID: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on, disabled }}
      aria-checked={on}
      disabled={disabled}
      onPress={onPress}
      style={[styles.opt, { backgroundColor: c.surface }, on && { borderColor: c.accent }, disabled && styles.dim]}
      testID={testID}
    >
      <View style={[styles.optIcon, { backgroundColor: c.surfaceRaised }]}>
        <Icon name={icon} size={18} color={c.ink} />
      </View>
      <View style={styles.grow}>
        <Text variant="bodyStrong" color={c.ink} style={styles.optTitle}>
          {title}
        </Text>
        {hint ? (
          <Text variant="caption" color={c.inkMuted}>
            {hint}
          </Text>
        ) : null}
      </View>
      <View style={[styles.radio, { borderColor: on ? c.accent : c.line }]}>
        {on ? <View style={[styles.radioDot, { backgroundColor: c.accent }]} /> : null}
      </View>
    </Pressable>
  );
}

/**
 * `.rng` : le curseur de distance, 10 à 200 km par pas de 5, le grand nombre et le temps de route. Un glissé ou un
 * toucher sur la piste (système de réponse de React Native, aucun worklet) ; au lecteur d'écran, « ajustable ».
 */
export function KmSlider({ value, onChange }: { value: number; onChange: (km: number) => void }) {
  const { t } = useTheme();
  const c = t.color;
  const width = useRef(0);
  const p = (value - WHERE_KM.min) / (WHERE_KM.max - WHERE_KM.min);
  const at = (x: number) => {
    if (width.current <= 0) return;
    const ratio = Math.min(1, Math.max(0, x / width.current));
    onChange(clampKm(WHERE_KM.min + ratio * (WHERE_KM.max - WHERE_KM.min)));
  };
  const step = (dir: 1 | -1) => onChange(clampKm(value + dir * WHERE_KM.step));
  return (
    <View style={[styles.rng, { backgroundColor: c.surface }]} testID="where-range">
      <View style={styles.rv}>
        <Text variant="posterM" color={c.ink} style={styles.rvNum} testID="where-km">
          {`${value}`}
          <Text variant="caption" color={c.inkMuted} style={styles.rvUnit}>
            {` ${R.km}`}
          </Text>
        </Text>
        <Text variant="caption" color={c.inkMuted}>
          {roadTime(value)}
        </Text>
      </View>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={L.aroundDistance}
        accessibilityValue={{ min: WHERE_KM.min, max: WHERE_KM.max, now: value, text: `${value} ${R.km}` }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 1 : -1)}
        onLayout={(e: LayoutChangeEvent) => {
          width.current = e.nativeEvent.layout.width;
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => at(e.nativeEvent.locationX)}
        onResponderMove={(e) => at(e.nativeEvent.locationX)}
        style={styles.track}
        testID="where-track"
      >
        <View style={[styles.rail, { backgroundColor: c.surfaceRaised }]} pointerEvents="none">
          <View style={[styles.fill, { width: `${p * 100}%`, backgroundColor: c.accent }]} />
        </View>
        <View
          pointerEvents="none"
          style={[styles.knob, { left: `${p * 100}%`, backgroundColor: c.ink, borderColor: c.surface }]}
        />
      </View>
      <View style={styles.ticks} pointerEvents="none">
        {[10, 50, 100, 150, 200].map((n) => (
          <Text key={n} variant="caption" color={c.inkFaint} style={styles.tick}>
            {n === 200 ? `${n} ${R.km}` : String(n)}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Le bouton principal d'une feuille à plusieurs réglages (« Voir les 12 événements »). */
export function SeeButton({
  label,
  onPress,
  testID,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  testID: string;
  disabled?: boolean;
}) {
  return (
    <Button icon="check" onPress={onPress} fullWidth testID={testID} disabled={disabled}>
      {label}
    </Button>
  );
}

function Hint({ children }: { children: string }) {
  const { t } = useTheme();
  return (
    <Text variant="caption" color={t.color.inkMuted} style={styles.hint}>
      {children}
    </Text>
  );
}

/** Le choix d'un département (« Ailleurs »), avec sa recherche. */
function DepartmentPicker({ value, onPick }: { value: string | null; onPick: (code: string) => void }) {
  const [find, setFind] = useState("");
  const matches = useMemo(() => {
    const needle = find.trim().toLowerCase();
    if (!needle) return departmentChoices;
    return departmentChoices.filter(
      (d) => d.code.toLowerCase().startsWith(needle) || d.name.toLowerCase().includes(needle),
    );
  }, [find]);
  return (
    <View style={styles.group} testID="around-departments">
      <TextField
        label={R.whereAwayFind}
        value={find}
        onChangeText={setFind}
        placeholder={R.whereAwayPlaceholder}
        testID="around-find"
      />
      <View style={styles.wrapRow}>
        {matches.map((d) => (
          <Chip key={d.code} accessibilityRole="radio" selected={value === d.code} onPress={() => onPick(d.code)}>
            {departmentLabel(d)}
          </Chip>
        ))}
      </View>
    </View>
  );
}

/** Un nombre lu pour un brouillon de réglages (bouton « Voir les N … »), un peu après le dernier changement. */
function useDraftCount<T>(draft: T, key: string, visible: boolean, countFor: (draft: T) => Promise<number | null>) {
  const [count, setCount] = useState<number | null>(null);
  const read = useRef(countFor);
  read.current = countFor;
  // biome-ignore lint/correctness/useExhaustiveDependencies: relu quand le brouillon (sa clé) change
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setCount(null);
    const timer = setTimeout(() => {
      void read.current(draft).then(
        (n) => alive && setCount(n),
        () => alive && setCount(null),
      );
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [key, visible]);
  return count;
}

const whereKey = (w: ExplorerWhere) => (w.kind === "me" ? `me${w.km}` : w.kind === "dept" ? `d${w.code}` : w.kind);

/**
 * « Où chercher ? » (maquette R2.2) : une seule feuille pour le lieu et la distance, commune aux Événements et aux Pros.
 * « Autour de moi » dit qu'il s'agit de la position du téléphone (lue sur ce geste, jamais gardée).
 */
export function WhereSheet({
  visible,
  onClose,
  value,
  coin,
  positionOn,
  positionDenied,
  onRequestPosition,
  countFor,
  seeLabel,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  value: ExplorerWhere;
  coin: readonly string[];
  positionOn: boolean;
  positionDenied: boolean;
  onRequestPosition: () => void;
  countFor: (where: ExplorerWhere) => Promise<number | null>;
  seeLabel: (n: number | null) => string;
  onApply: (where: ExplorerWhere) => void;
}) {
  const [draft, setDraft] = useState<ExplorerWhere>(value);
  const [away, setAway] = useState(value.kind === "dept");
  const [km, setKm] = useState(value.kind === "me" ? value.km : WHERE_KM.fallback);
  // biome-ignore lint/correctness/useExhaustiveDependencies: le brouillon repart de la valeur à chaque ouverture
  useEffect(() => {
    if (!visible) return;
    setDraft(value);
    setAway(value.kind === "dept");
    if (value.kind === "me") setKm(value.km);
  }, [visible]);
  const count = useDraftCount(draft, whereKey(draft), visible, countFor);
  const pick = (next: ExplorerWhere) => {
    setDraft(next);
    setAway(next.kind === "dept");
  };
  // Lot R3b (retour 11) : un seul choix actif. « Ailleurs » touché l'emporte sur le choix précédent, même avant qu'un
  // département soit choisi (« Autour de moi » restait coché avec lui) ; on ne voit alors qu'après le département.
  const choice: ExplorerWhere["kind"] = away ? "dept" : draft.kind;
  const awayPending = away && draft.kind !== "dept";
  const coinText = coin.map(deptLong).join(", ");
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={R.whereSheet}>
      <SheetHead title={R.whereSheet} onClose={onClose} />
      <View style={styles.optlist} accessibilityRole="radiogroup" testID="around-sheet">
        <OptRow
          on={choice === "me"}
          icon="place"
          title={R.whereMe}
          hint={positionDenied ? R.whereMeDenied : R.whereMeHint}
          onPress={() => {
            if (!positionOn) onRequestPosition();
            pick({ kind: "me", km });
          }}
          testID="around-me"
        />
        {choice === "me" && draft.kind === "me" ? (
          <KmSlider
            value={km}
            onChange={(next) => {
              setKm(next);
              setDraft({ kind: "me", km: next });
            }}
          />
        ) : null}
        <OptRow
          on={choice === "mine"}
          icon="home"
          title={R.whereMine}
          hint={R.whereMineHint(coinText)}
          disabled={coin.length === 0}
          onPress={() => pick({ kind: "mine" })}
          testID="around-mine"
        />
        <OptRow
          on={choice === "dept"}
          icon="map"
          title={draft.kind === "dept" ? `${R.whereAway} · ${deptLong(draft.code)}` : R.whereAway}
          hint={R.whereAwayHint}
          onPress={() => setAway(true)}
          testID="around-elsewhere"
        />
        {away ? (
          <DepartmentPicker
            value={draft.kind === "dept" ? draft.code : null}
            onPick={(code) => pick({ kind: "dept", code })}
          />
        ) : null}
        <OptRow
          on={choice === "all"}
          icon="explore"
          title={R.whereAll}
          hint={R.whereAllHint}
          onPress={() => pick({ kind: "all" })}
          testID="around-all"
        />
      </View>
      <View style={styles.foot}>
        <SeeButton
          label={seeLabel(awayPending ? null : count)}
          onPress={() => onApply(draft)}
          disabled={awayPending}
          testID="where-apply"
        />
        <Hint>{R.whereKeep}</Hint>
      </View>
    </AppSheet>
  );
}

/** « Où chercher ? » de Personnes et crews : des départements seulement (docs/01), jamais de position ni de distance. */
export function PeopleWhereSheet({
  visible,
  onClose,
  value,
  coin,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  /** `null` : rien de choisi (Mon coin pour les suggestions). */
  value: PeopleWhere | null;
  coin: readonly string[];
  onApply: (where: PeopleWhere) => void;
}) {
  const [away, setAway] = useState(value?.kind === "dept");
  // biome-ignore lint/correctness/useExhaustiveDependencies: repart de la valeur à chaque ouverture
  useEffect(() => {
    if (visible) setAway(value?.kind === "dept");
  }, [visible]);
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={R.whereSheet}>
      <SheetHead title={R.whereSheet} onClose={onClose} />
      <View style={styles.optlist} accessibilityRole="radiogroup" testID="people-where-sheet">
        <OptRow
          on={(value === null || value.kind === "mine") && !away}
          icon="home"
          title={R.whereMine}
          hint={R.whereMineHint(coin.map(deptLong).join(", "))}
          disabled={coin.length === 0}
          onPress={() => onApply({ kind: "mine" })}
          testID="people-where-mine"
        />
        <OptRow
          on={value?.kind === "dept" || away}
          icon="map"
          title={value?.kind === "dept" ? `${R.whereAway} · ${deptLong(value.code)}` : R.whereAway}
          hint={R.whereAwayHint}
          onPress={() => setAway(true)}
          testID="people-where-elsewhere"
        />
        {away ? (
          <DepartmentPicker
            value={value?.kind === "dept" ? value.code : null}
            onPick={(code) => onApply({ kind: "dept", code })}
          />
        ) : null}
        <OptRow
          on={value?.kind === "all" && !away}
          icon="explore"
          title={R.whereAll}
          hint={R.whereAllHint}
          onPress={() => onApply({ kind: "all" })}
          testID="people-where-all"
        />
      </View>
      <Hint>{R.wherePeopleHint}</Hint>
    </AppSheet>
  );
}

export type ChoiceOption<T extends string> = { id: T; icon: IconName; label: string; hint?: string };

/** Une feuille à un seul choix (Trier, Montrer) : le toucher applique et ferme. */
export function ChoiceSheet<T extends string>({
  visible,
  onClose,
  title,
  options,
  value,
  onPick,
  hint,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: readonly ChoiceOption<T>[];
  value: T;
  onPick: (value: T) => void;
  hint?: string;
  testID: string;
}) {
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={title}>
      <SheetHead title={title} onClose={onClose} />
      <View style={styles.optlist} accessibilityRole="radiogroup" testID={testID}>
        {options.map((o) => (
          <OptRow
            key={o.id}
            on={o.id === value}
            icon={o.icon}
            title={o.label}
            hint={o.hint}
            onPress={() => onPick(o.id)}
            testID={`${testID.replace(/-sheet$/, "")}-${o.id}`}
          />
        ))}
      </View>
      {hint ? <Hint>{hint}</Hint> : null}
    </AppSheet>
  );
}

/** « Quel métier ? » (maquette R2.5) : les 12 métiers et leur nombre de pros dans le lieu choisi ; un seul à la fois. */
export function JobSheet({
  visible,
  onClose,
  value,
  counts,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  value: ProActivity | "";
  counts: ProActivityCounts | null;
  onPick: (job: ProActivity | "") => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const tile = (id: ProActivity | "", icon: IconName, label: string, n: number | null, wide = false) => {
    const on = value === id;
    const zero = n === 0;
    return (
      <Pressable
        key={id || "all"}
        accessibilityRole="radio"
        accessibilityState={{ checked: on, disabled: zero }}
        aria-checked={on}
        disabled={zero}
        onPress={() => onPick(id)}
        style={[
          styles.mt,
          wide ? styles.mtWide : styles.mtHalf,
          { backgroundColor: on ? c.ground : c.surface, borderColor: on ? c.accent : "transparent" },
          zero && styles.dim,
        ]}
        testID={`job-${id || "all"}`}
      >
        <View style={[styles.mtIcon, { backgroundColor: c.surfaceRaised }]}>
          <Icon name={icon} size={18} color={c.ink} />
        </View>
        <View style={styles.grow}>
          <Text variant="bodyStrong" color={c.ink} style={styles.mtTitle}>
            {label}
          </Text>
          <Text variant="caption" color={c.inkMuted} style={styles.mtCount}>
            {n === null ? " " : R.jobCount(n)}
          </Text>
        </View>
      </Pressable>
    );
  };
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={R.jobSheet}>
      <SheetHead title={R.jobSheet} onClose={onClose} />
      <View style={styles.mgrid} accessibilityRole="radiogroup" testID="job-sheet">
        {tile("", "grid", R.jobAllLong, counts?.total ?? null, true)}
        {proActivities.map((a) =>
          tile(a, proActivityIcons[a], proActivityLabels[a], counts ? (counts.counts[a] ?? 0) : null),
        )}
      </View>
      <Hint>{R.jobHint}</Hint>
    </AppSheet>
  );
}

const WHEN: { id: When; label: string }[] = [
  { id: "all", label: L.whenAll },
  { id: "weekend", label: L.whenWeekend },
  { id: "month", label: L.whenMonth },
];

function Group({ label, children, exclusive = false }: { label: string; children: ReactNode; exclusive?: boolean }) {
  const { t } = useTheme();
  return (
    <View style={styles.group}>
      <Text variant="label" color={t.color.inkMuted}>
        {label}
      </Text>
      <ChipRow accessibilityRole={exclusive ? "tablist" : undefined} accessibilityLabel={label}>
        {children}
      </ChipRow>
    </View>
  );
}

export type FiltersDraft = { filters: EventFilters; prefOn: boolean };

/**
 * « Filtres » des événements : Format (« Mes préférences » : les types de « Tes préférences », tant qu'aucun format n'est
 * choisi à la main ; « Tous » : tous les formats), Quand, Selon mes goûts ; « Voir les N événements ».
 */
export function EventFiltersSheet({
  visible,
  onClose,
  value,
  hasPrefs,
  signedIn,
  countFor,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  value: FiltersDraft;
  /** « Tes préférences » restreignent les types : le choix « Mes préférences » existe. */
  hasPrefs: boolean;
  signedIn: boolean;
  countFor: (draft: FiltersDraft) => Promise<number | null>;
  onApply: (draft: FiltersDraft) => void;
}) {
  const [draft, setDraft] = useState<FiltersDraft>(value);
  // biome-ignore lint/correctness/useExhaustiveDependencies: le brouillon repart de la valeur à chaque ouverture
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible]);
  const f = draft.filters;
  const key = `${f.format}|${f.when}|${f.affinity}|${f.followed}|${draft.prefOn}`;
  const count = useDraftCount(draft, key, visible, countFor);
  const set = <K extends keyof EventFilters>(k: K, v: EventFilters[K], prefOn = draft.prefOn) =>
    setDraft((d) => ({ filters: { ...d.filters, [k]: v }, prefOn }));
  const prefsOn = hasPrefs && draft.prefOn && f.format === "";
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={R.filtersSheet}>
      <SheetHead title={R.filtersSheet} onClose={onClose} />
      <View style={styles.filters} testID="explorer-filters">
        <Group label={L.groupFormat} exclusive>
          {hasPrefs ? (
            <Chip accessibilityRole="tab" selected={prefsOn} onPress={() => set("format", "", true)}>
              {R.formatPrefs}
            </Chip>
          ) : null}
          <Chip accessibilityRole="tab" selected={f.format === "" && !prefsOn} onPress={() => set("format", "", false)}>
            {L.formatAll}
          </Chip>
          {eventFormats.map((x) => (
            <Chip
              accessibilityRole="tab"
              key={x}
              selected={f.format === x}
              onPress={() => (f.format === x ? set("format", "", false) : set("format", x, false))}
            >
              {eventFormatLabels[x]}
            </Chip>
          ))}
        </Group>
        <Group label={L.groupWhen} exclusive>
          {WHEN.map((w) => (
            <Chip accessibilityRole="tab" key={w.id} selected={f.when === w.id} onPress={() => set("when", w.id)}>
              {w.label}
            </Chip>
          ))}
        </Group>
        {signedIn ? (
          <Group label={L.groupTaste}>
            <Chip accessibilityRole="toggle" selected={f.affinity} onPress={() => set("affinity", !f.affinity)}>
              {L.tasteAffinity}
            </Chip>
            <Chip accessibilityRole="toggle" selected={f.followed} onPress={() => set("followed", !f.followed)}>
              {L.tasteFollowed}
            </Chip>
          </Group>
        ) : null}
      </View>
      <View style={styles.foot}>
        <SeeButton label={R.seeEvents(count)} onPress={() => onApply(draft)} testID="filters-apply" />
      </View>
    </AppSheet>
  );
}

/** « Filtres » de Personnes et crews : centre d'intérêt et grade (docs/01) ; ils ne trouvent que les comptes publics. */
export function PeopleFiltersSheet({
  visible,
  onClose,
  value,
  categories,
  grades,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  value: { categoryId: string; grade: string };
  categories: { id: string; label: string }[];
  grades: { id: string; label: string }[];
  onApply: (next: { categoryId: string; grade: string }) => void;
}) {
  const [draft, setDraft] = useState(value);
  // biome-ignore lint/correctness/useExhaustiveDependencies: le brouillon repart de la valeur à chaque ouverture
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible]);
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={R.filtersSheet}>
      <SheetHead title={R.filtersSheet} onClose={onClose} />
      <View style={styles.filters} testID="people-filters-panel">
        <Group label="Centre d'intérêt" exclusive>
          <Chip
            accessibilityRole="tab"
            selected={draft.categoryId === ""}
            onPress={() => setDraft((d) => ({ ...d, categoryId: "" }))}
          >
            {L.formatAll}
          </Chip>
          {categories.map((x) => (
            <Chip
              key={x.id}
              accessibilityRole="tab"
              selected={draft.categoryId === x.id}
              onPress={() => setDraft((d) => ({ ...d, categoryId: d.categoryId === x.id ? "" : x.id }))}
            >
              {x.label}
            </Chip>
          ))}
        </Group>
        <Group label="Grade, au moins" exclusive>
          <Chip
            accessibilityRole="tab"
            selected={draft.grade === ""}
            onPress={() => setDraft((d) => ({ ...d, grade: "" }))}
          >
            {L.formatAll}
          </Chip>
          {grades.map((g) => (
            <Chip
              key={g.id}
              accessibilityRole="tab"
              selected={draft.grade === g.id}
              onPress={() => setDraft((d) => ({ ...d, grade: d.grade === g.id ? "" : g.id }))}
            >
              {g.label}
            </Chip>
          ))}
        </Group>
      </View>
      <View style={styles.foot}>
        <SeeButton label={R.seeResults} onPress={() => onApply(draft)} testID="people-filters-apply" />
        <Hint>{R.peopleFiltersHint}</Hint>
      </View>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  shH: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  shTitle: { flex: 1, fontSize: 18, lineHeight: 19 },
  closex: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  grow: { flex: 1, minWidth: 0 },
  dim: { opacity: 0.5 },
  optlist: { gap: 6 },
  opt: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    paddingVertical: space3,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "transparent",
  },
  optIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  optTitle: { fontSize: 14.5, lineHeight: 18, fontFamily: archivoAt(100, 800) },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  hint: { fontSize: 12.5, lineHeight: 17 },
  foot: { gap: space2, marginTop: space2 },
  group: { gap: space1 },
  filters: { gap: space2 },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  // `.rng.flat` : 12 × 14, le grand nombre 40 px, la piste, les graduations.
  rng: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, gap: 8 },
  rv: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space2 },
  rvNum: { fontSize: 40, lineHeight: 42 },
  rvUnit: { fontSize: 14, lineHeight: 16 },
  track: { height: 32, justifyContent: "center" },
  rail: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: 6 },
  knob: { position: "absolute", width: 24, height: 24, marginLeft: -12, borderRadius: 12, borderWidth: 3 },
  ticks: { flexDirection: "row", justifyContent: "space-between" },
  tick: { fontSize: 11, lineHeight: 14 },
  // `.mgrid` / `.mt` : deux colonnes, « Tous les métiers » sur toute la largeur.
  mgrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 10,
    borderRadius: 14,
    borderWidth: 2,
    minWidth: 0,
  },
  mtWide: { width: "100%" },
  mtHalf: { width: "48.5%", flexGrow: 1, flexBasis: "45%" },
  mtIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  mtTitle: { fontSize: 13, lineHeight: 15, fontFamily: archivoAt(100, 800) },
  mtCount: { fontSize: 11.5, lineHeight: 14 },
});
