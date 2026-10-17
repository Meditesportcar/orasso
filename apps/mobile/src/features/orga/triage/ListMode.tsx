// Mode liste (lot 23, docs/01 : vue liste avec filtres) : les candidatures d'un événement avec filtres (statut,
// catégorie, marque, origine, année, grade, crew, recherche), sélection multiple, décision en masse (`decide-many` :
// chaque candidature réussit ou échoue seule, le résultat est dit pour chacune) et zone d'une retenue. Les décisions de
// la liste partent tout de suite : la sélection est déjà un geste volontaire, comme sur le site.
import {
  Button,
  CheckboxField,
  Chip,
  Plate,
  SelectField,
  StatusBadge,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import {
  type ApplicationForTriage,
  type ApplicationKind,
  applicationStatusLabels,
  type EventCrewFilter,
  type EventDay,
  type EventZone,
  eventDaysLabels,
  formatDayDate,
  gradeLabels,
  grades,
  type RefusalReason,
  type TriageDecision,
  triageAppLabels,
  type VehicleMake,
} from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { activeFilterCount, bulkOutcome, emptyFilters, type ListFilters, listQuery, toggleId } from "@/lib/triage";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { titleOf } from "./CandidateCard";
import { FullSheet } from "./FullSheet";
import { RefusalSheet } from "./RefusalSheet";
import { ScreenSheet } from "./ScreenSheet";
import { ZoneSheet } from "./ZoneSheet";

const { space2, space3 } = tokens.spacing;

const STATUS_OPTIONS = [
  { value: "pending", label: triageAppLabels.listStatusPending },
  { value: "accepted", label: triageAppLabels.listStatusAccepted },
  { value: "waitlisted", label: triageAppLabels.listStatusWaitlisted },
  { value: "refused", label: triageAppLabels.listStatusRefused },
  { value: "", label: triageAppLabels.listAll },
];

function RowBadge({ item }: { item: ApplicationForTriage }) {
  switch (item.status) {
    case "pending":
      return <StatusBadge status="pending" onPlate animated={false} />;
    case "accepted":
      return <StatusBadge status="retained" animated={false} />;
    case "waitlisted":
    case "offered":
      return <StatusBadge status="waitlist" rank={item.waitlistRank ?? undefined} onPlate animated={false} />;
    case "refused":
      return <StatusBadge status="refused" onPlate animated={false} />;
    default:
      return <Chip surface="plate">{applicationStatusLabels[item.status]}</Chip>;
  }
}

type Refs = {
  categories: { value: string; label: string }[];
  makes: VehicleMake[];
  crews: EventCrewFilter[];
};

function FiltersSheet({
  visible,
  filters,
  refs,
  kind,
  days,
  onApply,
  onClose,
}: {
  visible: boolean;
  filters: ListFilters;
  refs: Refs;
  kind: ApplicationKind;
  days: readonly EventDay[];
  onApply: (f: ListFilters) => void;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const [draft, setDraft] = useState(filters);
  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);
  const set = (patch: Partial<ListFilters>) => setDraft((d) => ({ ...d, ...patch }));
  const countries = [...new Set(refs.makes.map((m) => m.country).filter((c): c is string => Boolean(c)))].sort();
  const vehicle = kind === "vehicle";
  return (
    <ScreenSheet visible={visible} onClose={onClose} accessibilityLabel={triageAppLabels.listTitle} maxHeight={0.9}>
      <Text variant="title" color={t.color.ink}>
        {triageAppLabels.listTitle}
      </Text>
      <TextField
        label={triageAppLabels.listSearch}
        value={draft.q}
        onChangeText={(q) => set({ q })}
        returnKeyType="search"
        testID="triage-filter-q"
      />
      <SelectField
        label={triageAppLabels.listStatus}
        options={STATUS_OPTIONS}
        value={draft.status}
        onValueChange={(status) => set({ status })}
      />
      {days.length > 1 ? (
        <SelectField
          label={eventDaysLabels.day}
          options={[
            { value: "", label: eventDaysLabels.allDays },
            { value: "whole", label: eventDaysLabels.wholeEvent },
            ...days.map((d) => ({ value: d.id, label: formatDayDate(d.date) })),
          ]}
          value={draft.dayId}
          onValueChange={(dayId) => set({ dayId })}
        />
      ) : null}
      {vehicle ? (
        <>
          <SelectField
            label={triageAppLabels.listCategory}
            options={[{ value: "", label: triageAppLabels.listAllF }, ...refs.categories]}
            value={draft.categoryId}
            onValueChange={(categoryId) => set({ categoryId })}
          />
          <SelectField
            label={triageAppLabels.listMake}
            options={[
              { value: "", label: triageAppLabels.listAllF },
              ...refs.makes.filter((m) => !m.isOther).map((m) => ({ value: m.id, label: m.name })),
            ]}
            value={draft.makeId}
            onValueChange={(makeId) => set({ makeId })}
          />
          <SelectField
            label={triageAppLabels.listOrigin}
            options={[
              { value: "", label: triageAppLabels.listAllF },
              ...countries.map((c) => ({ value: c, label: c })),
            ]}
            value={draft.country}
            onValueChange={(country) => set({ country })}
          />
          <TextField
            label={triageAppLabels.listYearFrom}
            value={draft.yearFrom}
            onChangeText={(yearFrom) => set({ yearFrom: yearFrom.replace(/\D/g, "").slice(0, 4) })}
            keyboardType="number-pad"
          />
          <TextField
            label={triageAppLabels.listYearTo}
            value={draft.yearTo}
            onChangeText={(yearTo) => set({ yearTo: yearTo.replace(/\D/g, "").slice(0, 4) })}
            keyboardType="number-pad"
          />
        </>
      ) : null}
      <SelectField
        label={triageAppLabels.listGrade}
        options={[
          { value: "", label: triageAppLabels.listAll },
          ...grades.map((g) => ({ value: g, label: gradeLabels[g] })),
        ]}
        value={draft.grade}
        onValueChange={(grade) => set({ grade })}
      />
      {vehicle && refs.crews.length > 0 ? (
        <SelectField
          label={triageAppLabels.crewFilter}
          options={[
            { value: "", label: triageAppLabels.crewFilterAny },
            ...refs.crews.map((c) => ({ value: c.id, label: `${c.name} (${c.count})` })),
          ]}
          value={draft.crewId}
          onValueChange={(crewId) => set({ crewId })}
        />
      ) : null}
      <Button variant="secondary" icon="check" onPress={() => onApply(draft)} fullWidth testID="triage-filters-apply">
        {triageAppLabels.listFiltersApply}
      </Button>
      <Button variant="plate" icon="undo" onPress={() => setDraft({ ...emptyFilters })} fullWidth>
        {triageAppLabels.listFiltersReset}
      </Button>
    </ScreenSheet>
  );
}

export function ListMode({
  eventId,
  kind,
  zones,
  days = [],
  onChanged,
}: {
  eventId: string;
  kind: ApplicationKind;
  zones: readonly EventZone[];
  /** Lot 34 : jours d'un événement sur plusieurs jours (filtre « Jour » et jour de chaque ligne, comme le site). */
  days?: readonly EventDay[];
  onChanged: () => void;
}) {
  const { t } = useTheme();
  const [filters, setFilters] = useState<ListFilters>({ ...emptyFilters });
  const [items, setItems] = useState<ApplicationForTriage[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [fullFor, setFullFor] = useState<string | null>(null);
  const [zoneFor, setZoneFor] = useState<string | null>(null);
  const [refs, setRefs] = useState<Refs>({ categories: [], makes: [], crews: [] });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Données des filtres (catégories, marques, crews inscrits) : une fois, sans bloquer la liste.
  useEffect(() => {
    void Promise.allSettled([api.categories(), api.makes(), api.triageCrews(eventId)]).then(([c, m, k]) => {
      if (!alive.current) return;
      setRefs({
        categories: c.status === "fulfilled" ? c.value.map((x) => ({ value: x.id, label: x.label })) : [],
        makes: m.status === "fulfilled" ? m.value : [],
        crews: k.status === "fulfilled" ? k.value : [],
      });
    });
  }, [eventId]);

  const load = useCallback(
    async (f: ListFilters, more: string | null) => {
      try {
        const page = await api.triagePage(eventId, listQuery(f, kind, more));
        if (!alive.current) return;
        setItems((cur) =>
          more && cur ? [...cur, ...page.items.filter((i) => !cur.some((c) => c.id === i.id))] : page.items,
        );
        setCursor(page.nextCursor);
      } catch (e) {
        if (alive.current) setMessage({ kind: "error", text: errorMessage(e) });
        if (alive.current) setItems((cur) => cur ?? []);
      }
    },
    [eventId, kind],
  );

  useEffect(() => {
    setItems(null);
    setSelected([]);
    void load(filters, null);
  }, [filters, load]);

  const list = items ?? [];
  const allSelected = list.length > 0 && selected.length === list.length;

  async function run(
    decision: TriageDecision,
    extra?: { reasons: RefusalReason[]; note: string; sendReasons: boolean },
  ) {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.triageDecideMany(eventId, {
        ids: selected,
        decision,
        sendReasons: extra?.sendReasons ?? true,
        ...(decision === "refuse" ? { reasons: extra?.reasons, note: extra?.note || undefined } : {}),
      });
      const out = bulkOutcome(res.results);
      const errors = out.errors.length ? ` (${out.errors.join(", ")})` : "";
      setMessage({
        kind: out.failed ? "error" : "ok",
        text: `${triageAppLabels.listBulkResult(out.ok, out.failed)}${errors}`,
      });
      onChanged();
    } catch (e) {
      setMessage({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
      setSelected([]);
      await load(filters, null);
    }
  }

  async function assignZone(zone: EventZone | null) {
    const id = zoneFor;
    setZoneFor(null);
    const row = list.find((r) => r.id === id);
    if (!id || !row) return;
    try {
      await api.triageAssignZone(eventId, id, zone?.id ?? null);
      setMessage({
        kind: "ok",
        text: zone
          ? triageAppLabels.zoneSaved(row.applicant.pseudo, `${zone.code} · ${zone.name}`)
          : triageAppLabels.zoneCleared(row.applicant.pseudo),
      });
      await load(filters, null);
    } catch (e) {
      setMessage({ kind: "error", text: errorMessage(e) });
    }
  }

  const filterCount = activeFilterCount(filters);
  const fullItem = list.find((r) => r.id === fullFor) ?? null;
  return (
    <View style={styles.fill} testID="triage-list">
      <View style={styles.bar}>
        <Button
          variant="plate"
          icon="search"
          onPress={() => setFiltersOpen(true)}
          style={styles.grow}
          testID="triage-filters"
        >
          {filterCount > 0 ? `${triageAppLabels.listFilters} · ${filterCount}` : triageAppLabels.listFilters}
        </Button>
        <Button
          variant="plate"
          icon="check"
          disabled={list.length === 0}
          onPress={() => setSelected(allSelected ? [] : list.map((i) => i.id))}
          style={styles.grow}
          testID="triage-select-all"
        >
          {allSelected ? triageAppLabels.listSelectNone : triageAppLabels.listSelectAll}
        </Button>
      </View>
      {message ? <Notice tone={message.kind === "error" ? "error" : "info"}>{message.text}</Notice> : null}
      <ScrollView style={styles.fill} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Muted variant="caption">
          {items === null ? triageAppLabels.loading : triageAppLabels.listCount(list.length, cursor !== null)}
        </Muted>
        {items && list.length === 0 ? <Muted variant="body">{triageAppLabels.listEmpty}</Muted> : null}
        {list.map((item) => (
          <Plate key={item.id} style={styles.row} testID="triage-list-row">
            <CheckboxField
              checked={selected.includes(item.id)}
              onChange={() => setSelected((cur) => toggleId(cur, item.id))}
              label={
                <Text variant="bodyStrong" color={t.color.plateInk}>
                  {`${item.applicant.pseudo} · ${titleOf(item)}`}
                </Text>
              }
            />
            <View style={styles.meta}>
              <RowBadge item={item} />
              {days.length > 1 ? (
                <Text variant="meta" color={t.color.plateMuted} testID="triage-row-day">
                  {item.day ? formatDayDate(item.day.date, { weekday: false }) : eventDaysLabels.wholeEvent}
                </Text>
              ) : null}
              {item.crew ? (
                <Text variant="meta" color={t.color.plateMuted}>
                  {item.crew.name}
                </Text>
              ) : null}
              {item.alerts.length > 0 ? (
                <Text variant="meta" color={t.color.plateMuted}>
                  {`${item.alerts.length} alerte${item.alerts.length > 1 ? "s" : ""}`}
                </Text>
              ) : null}
            </View>
            <View style={styles.actions}>
              <Button
                variant="plate"
                icon="list"
                onPress={() => setFullFor(item.id)}
                accessibilityLabel={`${triageAppLabels.listOpen} ${item.applicant.pseudo}`}
              >
                {triageAppLabels.fullSheetShort}
              </Button>
              {item.status === "accepted" && zones.length > 0 && kind === "vehicle" ? (
                <Button variant="plate" icon="place" onPress={() => setZoneFor(item.id)} testID="triage-row-zone">
                  {triageAppLabels.zone}
                </Button>
              ) : null}
            </View>
          </Plate>
        ))}
        {cursor ? (
          <Button variant="plate" icon="next" onPress={() => void load(filters, cursor)} fullWidth>
            {triageAppLabels.listMore}
          </Button>
        ) : null}
      </ScrollView>

      {selected.length > 0 ? (
        <Plate kind="note" style={styles.bulk} testID="triage-bulk">
          <Text variant="bodyStrong" color={t.color.plateInk}>
            {triageAppLabels.listSelected(selected.length)}
          </Text>
          <View style={styles.bar}>
            <Button
              variant="plate"
              tone="dashed"
              icon="close"
              layout="column"
              disabled={busy}
              onPress={() => setRefusing(true)}
              style={styles.grow}
              testID="triage-bulk-refuse"
            >
              {triageAppLabels.refuse}
            </Button>
            <Button
              variant="plate"
              tone="wait"
              icon="wait"
              layout="column"
              disabled={busy}
              onPress={() => void run("waitlist")}
              style={styles.grow}
              testID="triage-bulk-waitlist"
            >
              {triageAppLabels.waitlist}
            </Button>
            <Button
              variant="primary"
              icon="check"
              layout="column"
              loading={busy}
              disabled={busy}
              onPress={() => void run("accept")}
              style={styles.grow}
              testID="triage-bulk-accept"
            >
              {triageAppLabels.accept}
            </Button>
          </View>
        </Plate>
      ) : null}

      <FiltersSheet
        visible={filtersOpen}
        filters={filters}
        refs={refs}
        kind={kind}
        days={days}
        onApply={(f) => {
          setFiltersOpen(false);
          setFilters(f);
        }}
        onClose={() => setFiltersOpen(false)}
      />
      <RefusalSheet
        visible={refusing}
        title={triageAppLabels.listBulkRefuse}
        onClose={() => setRefusing(false)}
        onConfirm={(extra) => {
          setRefusing(false);
          void run("refuse", extra);
        }}
      />
      <ZoneSheet
        visible={zoneFor !== null}
        zones={zones}
        current={list.find((r) => r.id === zoneFor)?.zoneId ?? null}
        onPick={(zone) => void assignZone(zone)}
        onClose={() => setZoneFor(null)}
      />
      <FullSheet item={fullItem} eventId={eventId} onClose={() => setFullFor(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, gap: space2 },
  content: { gap: space2, paddingBottom: space3 * 2 },
  bar: { flexDirection: "row", gap: space2 },
  grow: { flex: 1 },
  row: { gap: space2 },
  meta: { flexDirection: "row", alignItems: "center", gap: space2, flexWrap: "wrap" },
  actions: { flexDirection: "row", alignItems: "center", gap: space2, justifyContent: "space-between" },
  bulk: { gap: space2 },
});
