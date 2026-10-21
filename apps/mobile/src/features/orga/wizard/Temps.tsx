// Les huit temps de l'assistant dans l'appli (lot 53, prototype DA v2 `s-create`, parité D20 avec le site) : type,
// lieu avec épingle, arrivées, critères en trois questions, avant-première, règlement, affiche, « Tout est prêt ».
// Mêmes règles et mêmes textes que le site (`@orasso/shared`) ; les morceaux de l'ancien assistant sont repris dans
// des volets (« Public et places », « Sur place », « Public », « Hauts grades et verrouillage »).
import {
  Button,
  CheckboxField,
  Chip,
  Icon,
  type IconName,
  Plate,
  SelectField,
  SendProgress,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import {
  arrivalTexts as A,
  type ArrivalSlot,
  arrivalLabel,
  criteriaOrigins,
  defaultArrivalSlot,
  defaultEventRules,
  draftStart,
  eventFormatLabels,
  eventKindOf,
  eventEditorLabels as L,
  type NeedDraft,
  POSTER_DEFAULT_STYLE,
  POSTER_TITLE_MAX,
  type PosterFormat,
  type PosterSettings,
  posterStyleLabels,
  posterStyles,
  posterTexts,
  previewHourOptions,
  previewTimeline,
  providerPowerLabels,
  providerPowers,
  providerSelectableTypes,
  RECURRENCE_MAX_COUNT,
  recurrenceDates,
  rulesCount,
  rulesReplaceNeedsConfirm,
  rulesTemplates,
  styleCategories,
  summaryOfCriteria,
  vendorTypeLabels,
  wizardV2Labels as W,
  withArrivalSlot,
  withEventKind,
  withRecurrence,
  withSingleDate,
} from "@orasso/shared";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { now } from "@/lib/clock";
import { formatDay, formatDayHour, formatShortDate } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { imageForm, pickOneImage } from "@/lib/structureFiles";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { Choices, DateField, DateTimeFields, Group, MultiChoices, TimeField, wizardStyles } from "./fields";
import { PinMap } from "./PinMap";
import { posterPreview } from "./posterPreview";
import { HighGradesFields, InstructionsField, OwnPosterField, ShopField, ZonesStep } from "./StepsHow";
import { DatesStep, FormatStep, PlaceStep } from "./StepsWhat";
import { AdmissionStep, PlacesStep, PublicStep, VehiclesStep, VendorsStep } from "./StepsWho";
import { type StepContext, toggle } from "./types";

const { space1, space2, space3 } = tokens.spacing;

/** Un volet replié (« Public et places », « Sur place »…) : un toucher l'ouvre. */
function Panel({
  icon,
  title,
  hint,
  children,
  testID,
}: {
  icon: IconName;
  title: string;
  hint?: string;
  children: ReactNode;
  testID?: string;
}) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.panel, { borderColor: t.color.line }]} testID={testID}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.panelHead}
        testID={testID ? `${testID}-toggle` : undefined}
      >
        <Icon name={icon} color={t.color.ink} />
        <View style={styles.grow}>
          <Text variant="bodyStrong">{title}</Text>
          {hint ? <Muted variant="caption">{hint}</Muted> : null}
        </View>
        <Icon name={open ? "up" : "down"} color={t.color.ink} />
      </Pressable>
      {open ? <View style={styles.panelBody}>{children}</View> : null}
    </View>
  );
}

// --- (1) Type ---------------------------------------------------------------------------------------------------

const KIND_ICONS = { one: "calendar", rec: "undo", multi: "cards" } as const;

export function TypeTemps(ctx: StepContext) {
  const { d, setD } = ctx;
  const { t } = useTheme();
  const kind = eventKindOf(d);
  const rec = d.recurrence;
  const dates = kind === "rec" ? recurrenceDates(d) : [];
  // « Récurrent » se choisit sur un brouillon seulement (relecture du lot 53 : sur un événement publié, la date bougerait
  // et tous les inscrits seraient prévenus).
  const published = Boolean(ctx.event && ctx.event.status !== "draft");
  const locked = Boolean(ctx.event?.recurrenceRule || ctx.event?.parentEventId || published);
  return (
    <>
      <FormatStep {...ctx} />
      <Group label={W.howOften} testID="wizard-kinds">
        {(["one", "rec", "multi"] as const).map((k) => (
          <Pressable
            key={k}
            onPress={() => setD((p) => withEventKind(p, k, now()))}
            disabled={locked && k === "rec" && kind !== "rec"}
            accessibilityRole="button"
            accessibilityState={{ selected: kind === k, disabled: locked && k === "rec" && kind !== "rec" }}
            style={[styles.kind, { borderColor: kind === k ? t.color.accent : t.color.line }]}
            testID={`wizard-kind-${k}`}
          >
            <Icon name={KIND_ICONS[k]} color={kind === k ? t.color.accentText : t.color.ink} />
            <View style={styles.grow}>
              <Text variant="bodyStrong">{W.kinds[k].title}</Text>
              <Muted variant="caption">{W.kinds[k].hint}</Muted>
            </View>
            {kind === k ? <Icon name="check" color={t.color.accentText} /> : null}
          </Pressable>
        ))}
      </Group>
      {ctx.event?.recurrenceRule ? <Notice>{W.recurrenceExisting}</Notice> : null}
      {published && !ctx.event?.recurrenceRule ? (
        <Muted variant="caption" testID="wizard-rec-draft-only">
          {W.recurrenceDraftOnly}
        </Muted>
      ) : null}
      {kind === "multi" ? (
        <DatesStep {...ctx} />
      ) : (
        <Plate style={wizardStyles.block} testID="wizard-kind-options">
          {kind === "one" ? (
            <DateField
              label={W.date}
              value={d.startsAt.slice(0, 10)}
              onChange={(date) => setD((p) => withSingleDate(p, { date }))}
              testID="wizard-date"
            />
          ) : rec ? (
            <>
              <Choices
                label={W.returns}
                options={[1, 2, 3, 4, -1].map((n) => ({ value: String(n), label: W.nthChips[n] ?? "" }))}
                value={String(rec.nth)}
                onChange={(v) => setD((p) => withRecurrence(p, { ...rec, nth: Number(v) }, now()))}
              />
              <Choices
                label={W.eachMonth}
                options={W.weekdayChips.map((label, i) => ({ value: String(i), label }))}
                value={String(rec.weekday)}
                onChange={(v) => setD((p) => withRecurrence(p, { ...rec, weekday: Number(v) }, now()))}
              />
            </>
          ) : null}
          <View style={wizardStyles.row}>
            <TimeField
              label={kind === "rec" ? W.from : W.start}
              value={d.startsAt.slice(11, 16)}
              onChange={(start) => setD((p) => withSingleDate(p, { start }))}
              testID="wizard-start-time"
            />
            <TimeField
              label={kind === "rec" ? W.to : W.end}
              value={d.endsAt.slice(11, 16)}
              onChange={(end) => setD((p) => withSingleDate(p, { end }))}
              testID="wizard-end-time"
            />
          </View>
          {kind === "rec" && rec ? (
            <>
              <SelectField
                label={W.recurrenceCount}
                options={Array.from({ length: RECURRENCE_MAX_COUNT }, (_, i) => ({
                  value: String(i + 1),
                  label: String(i + 1),
                }))}
                value={String(rec.count)}
                onValueChange={(v) => setD((p) => ({ ...p, recurrence: { ...rec, count: Number(v) } }))}
              />
              {dates.length > 0 ? (
                <View testID="wizard-next-dates" style={styles.gap1}>
                  <Muted variant="label">{W.nextDates}</Muted>
                  <Text variant="body">
                    {dates
                      .slice(0, 3)
                      .map((x) => formatDay(x))
                      .join(" · ")}
                  </Text>
                  <Muted variant="label">{W.until}</Muted>
                  <Text variant="body">{W.untilValue(formatDay(dates[dates.length - 1] as Date))}</Text>
                </View>
              ) : null}
            </>
          ) : null}
        </Plate>
      )}
      <Panel icon="vehicle" title={W.placesPanel} hint={W.placesPanelHint} testID="wizard-panel-places">
        <VehiclesStep {...ctx} />
        <PlacesStep {...ctx} />
      </Panel>
    </>
  );
}

// --- (2) Lieu ---------------------------------------------------------------------------------------------------

const newNeed = (): NeedDraft => ({
  trade: "food_truck",
  quantity: "1",
  power: "none",
  water: false,
  frontageM: "",
  installTime: "",
});

function MissionsEditor({ d, setD }: StepContext) {
  const { t } = useTheme();
  const update = (i: number, patch: Partial<NeedDraft>) =>
    setD((p) => ({ ...p, needs: (p.needs ?? []).map((n, j) => (j === i ? { ...n, ...patch } : n)) }));
  return (
    <Group label={W.missionsTitle} testID="wizard-missions">
      <Muted variant="caption">{W.missionsIntro}</Muted>
      {(d.needs ?? []).map((n, i) => (
        <Plate key={n.id ?? `new-${i.toString()}`} style={wizardStyles.block} testID="wizard-mission">
          <Text variant="bodyStrong" color={t.color.plateInk}>
            {W.mission(i + 1)}
          </Text>
          <SelectField
            label={W.missionTrade}
            options={providerSelectableTypes.map((c) => ({ value: c, label: vendorTypeLabels[c] }))}
            value={n.trade}
            onValueChange={(v) => update(i, { trade: v as NeedDraft["trade"] })}
          />
          <View style={wizardStyles.row}>
            <TextField
              label={W.missionQuantity}
              value={n.quantity}
              onChangeText={(v) => update(i, { quantity: v.replace(/\D/g, "") })}
              keyboardType="number-pad"
              maxLength={1}
              style={wizardStyles.grow}
            />
            <TextField
              label={W.missionFrontage}
              value={n.frontageM}
              onChangeText={(v) => update(i, { frontageM: v.replace(/\D/g, "") })}
              keyboardType="number-pad"
              maxLength={2}
              style={wizardStyles.grow}
            />
          </View>
          <SelectField
            label={W.missionPower}
            options={providerPowers.map((p) => ({ value: p, label: providerPowerLabels[p] }))}
            value={n.power}
            onValueChange={(v) => update(i, { power: v as NeedDraft["power"] })}
          />
          <TimeField
            label={W.missionInstall}
            value={n.installTime}
            onChange={(v) => update(i, { installTime: v })}
            testID={`wizard-mission-${i}-install`}
          />
          {n.installDay && n.installTime ? (
            <Text variant="meta" color={t.color.plateMuted}>
              {W.missionDay(n.installDay)}
            </Text>
          ) : null}
          <CheckboxField label={W.missionWater} checked={n.water} onChange={(v) => update(i, { water: v })} />
          <Button
            variant="plate"
            tone="dashed"
            icon="close"
            onPress={() => setD((p) => ({ ...p, needs: (p.needs ?? []).filter((_, j) => j !== i) }))}
          >
            {W.missionRemove}
          </Button>
        </Plate>
      ))}
      <Button
        variant="secondary"
        icon="add"
        onPress={() => setD((p) => ({ ...p, needs: [...(p.needs ?? []), newNeed()] }))}
        testID="wizard-mission-add"
      >
        {W.missionAdd}
      </Button>
    </Group>
  );
}

export function LieuTemps(ctx: StepContext) {
  const { d, set, setD } = ctx;
  return (
    <>
      <PlaceStep {...ctx} />
      <PinMap
        lat={d.lat}
        lng={d.lng}
        label={d.addressLine || W.search}
        onMove={(lat, lng) =>
          setD((p) => ({ ...p, lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 }))
        }
      />
      <Muted variant="caption" testID="wizard-coords">
        {d.lat !== null && d.lng !== null ? W.coords(d.lat, d.lng) : W.pinMissing}
      </Muted>
      <TextField
        label={W.entrance}
        value={d.entranceNote ?? ""}
        placeholder={W.entrancePlaceholder}
        onChangeText={(v) => set("entranceNote", v)}
        maxLength={160}
        testID="wizard-entrance"
      />
      <Panel icon="place" title={W.onSitePanel} hint={W.onSitePanelHint} testID="wizard-panel-onsite">
        <ZonesStep {...ctx} />
        <VendorsStep {...ctx} />
        <MissionsEditor {...ctx} />
      </Panel>
    </>
  );
}

// --- (3) Arrivées -----------------------------------------------------------------------------------------------

function SlotCard({
  which,
  title,
  icon,
  slot,
  onChange,
}: {
  which: "exhibitors" | "public";
  title: string;
  icon: IconName;
  slot: ArrivalSlot | null;
  onChange: (slot: ArrivalSlot | null) => void;
}) {
  const { t } = useTheme();
  return (
    <Plate style={wizardStyles.block} testID={`arrival-${which}`}>
      <View style={styles.row}>
        <Icon name={icon} color={t.color.plateInk} />
        <Text variant="bodyStrong" color={t.color.plateInk}>
          {title}
        </Text>
      </View>
      {slot ? (
        <>
          <View style={wizardStyles.row}>
            <TimeField label={A.from} value={slot.from} onChange={(from) => onChange({ ...slot, from })} />
            <TimeField label={A.to} value={slot.to ?? ""} onChange={(to) => onChange({ ...slot, to: to || null })} />
          </View>
          <View style={styles.chips}>
            <Chip selected={slot.strict} onPress={() => onChange({ ...slot, strict: true })}>
              {A.strict}
            </Chip>
            <Chip selected={!slot.strict} onPress={() => onChange({ ...slot, strict: false })}>
              {A.advised}
            </Chip>
          </View>
          <Muted variant="caption">{slot.strict ? A.strictHint : W.advisedHint}</Muted>
          <Button variant="plate" tone="dashed" icon="close" onPress={() => onChange(null)}>
            {W.arrivalsNone}
          </Button>
        </>
      ) : (
        <Button
          variant="plate"
          icon="add"
          onPress={() => onChange(defaultArrivalSlot(which))}
          testID={`arrival-${which}-set`}
        >
          {W.arrivalsSet}
        </Button>
      )}
    </Plate>
  );
}

export function ArriveesTemps(ctx: StepContext) {
  const { d, setD } = ctx;
  const ex = d.arrivals?.exhibitors ?? null;
  const ticketing = d.publicAccess === "free_reservation" || d.publicAccess === "paid_orasso";
  return (
    <>
      <SlotCard
        which="exhibitors"
        title={A.exhibitors}
        icon="vehicle"
        slot={ex}
        onChange={(slot) => setD((p) => withArrivalSlot(p, "exhibitors", slot))}
      />
      <SlotCard
        which="public"
        title={A.public}
        icon="profile"
        slot={d.arrivals?.public ?? null}
        onChange={(slot) => setD((p) => withArrivalSlot(p, "public", slot))}
      />
      <Group label={W.exhibitorSees} testID="wizard-exhibitor-sees">
        <Text variant="body">{ex ? `${arrivalLabel(ex)}. ${W.exhibitorSeesBody}` : W.exhibitorSeesNone}</Text>
      </Group>
      <Panel icon="ticket" title={W.publicPanel} hint={W.publicPanelHint} testID="wizard-panel-public">
        <PublicStep {...ctx} />
        {ticketing ? (
          <Group label={W.ticketsTitle}>
            <Muted variant="caption">{L.ticketingNoticeOrasso}</Muted>
          </Group>
        ) : null}
        <ShopField {...ctx} />
      </Panel>
    </>
  );
}

// --- (4) Critères -----------------------------------------------------------------------------------------------

export function CriteresTemps(ctx: StepContext) {
  const { d, set, categories, makes } = ctx;
  const [q, setQ] = useState("");
  const chosen = makes.filter((m) => d.makeIds.includes(m.id));
  const found =
    q.trim().length < 2
      ? []
      : makes
          .filter((m) => m.name !== "Autre" && !d.makeIds.includes(m.id))
          .filter((m) => m.name.toLowerCase().includes(q.trim().toLowerCase()))
          .slice(0, 8);
  return (
    <>
      <AdmissionStep {...ctx} />
      {d.admission === "filtered" ? (
        <>
          <MultiChoices
            label={`1 · ${W.q1}`}
            options={criteriaOrigins.map((o) => ({ value: o.code, label: o.chip }))}
            values={d.countries}
            onToggle={(v) => set("countries", toggle(d.countries, v))}
            testID="wizard-origins"
          />
          <MultiChoices
            label={`2 · ${W.q2}`}
            options={styleCategories(categories, d.categoryIds).map((c) => ({ value: c.id, label: c.label }))}
            values={d.categoryIds}
            onToggle={(v) => set("categoryIds", toggle(d.categoryIds, v))}
            testID="wizard-categories"
          />
          <Group label={`3 · ${W.q3}`}>
            <TextField
              label={L.makesSearch}
              value={q}
              placeholder={W.makesPlaceholder}
              onChangeText={setQ}
              testID="wizard-makes-search"
            />
            <View style={styles.chips}>
              {[...chosen, ...found].map((m) => (
                <Chip
                  key={m.id}
                  selected={d.makeIds.includes(m.id)}
                  onPress={() => set("makeIds", toggle(d.makeIds, m.id))}
                >
                  {m.name}
                </Chip>
              ))}
            </View>
            {chosen.length === 0 ? <Muted variant="caption">{W.makesNone}</Muted> : null}
          </Group>
          <Plate style={wizardStyles.block} testID="wizard-criteria-summary">
            <Text variant="bodyStrong">
              {summaryOfCriteria({
                countries: d.countries,
                styles: categories.filter((c) => d.categoryIds.includes(c.id)).map((c) => c.label),
                makes: chosen.map((m) => m.name),
              })}
            </Text>
          </Plate>
          <TextField
            label={W.criteriaMore}
            value={d.criteriaText}
            onChangeText={(v) => set("criteriaText", v)}
            multiline
            maxLength={1000}
            help={L.criteriaTextHint}
            testID="wizard-criteria-text"
          />
        </>
      ) : null}
    </>
  );
}

// --- (5) Avant-première -----------------------------------------------------------------------------------------

export function AvantTemps(ctx: StepContext) {
  const { d, set, followers, structureName } = ctx;
  const on = Number(d.previewHours) > 0;
  const tl = previewTimeline(d);
  const points = [
    tl.subscribers ? [formatShortDate(tl.subscribers), W.timelineSubscribers] : null,
    tl.everyone ? [formatShortDate(tl.everyone), W.timelineEveryone] : null,
    tl.start ? [formatShortDate(tl.start), d.title || "—"] : null,
  ].filter((x): x is string[] => x !== null);
  return (
    <>
      <Plate style={wizardStyles.block}>
        <CheckboxField label={W.previewSwitch} checked={on} onChange={(v) => set("previewHours", v ? "24" : "0")} />
        {followers !== null ? <Muted variant="caption">{W.followers(followers, structureName)}</Muted> : null}
        {on ? (
          <>
            <SelectField
              label={W.previewLead}
              options={previewHourOptions.filter((o) => o.value !== "0")}
              value={d.previewHours}
              onValueChange={(v) => set("previewHours", v)}
            />
            <View testID="wizard-open-subscribers" style={styles.gap1}>
              <Muted variant="label">{W.openSubscribers}</Muted>
              <Text variant="bodyStrong">{tl.subscribers ? formatDayHour(tl.subscribers) : "—"}</Text>
            </View>
          </>
        ) : null}
        <DateTimeFields
          dateLabel={`${W.openEveryone} · ${L.date}`}
          timeLabel={L.start}
          value={d.registrationsOpenAt}
          onChange={(v) => set("registrationsOpenAt", v)}
          testID="wizard-opens"
        />
      </Plate>
      <View style={styles.timeline} testID="wizard-timeline">
        {points.map(([day, what]) => (
          <View key={`${day}-${what}`} style={styles.grow}>
            <Text variant="bodyStrong">{day}</Text>
            <Muted variant="caption">{what}</Muted>
          </View>
        ))}
      </View>
      <Panel icon="grade" title={W.morePanel}>
        <HighGradesFields {...ctx} />
      </Panel>
    </>
  );
}

// --- (6) Règlement ----------------------------------------------------------------------------------------------

type Replacement = { text: string; what: string; note: string };

export function ReglementTemps(ctx: StepContext) {
  const { d, set, structureId, event } = ctx;
  const [note, setNote] = useState<string | null>(null);
  const [asking, setAsking] = useState<Replacement | null>(null);
  const count = rulesCount(d.rulesText);
  const apply = (r: Replacement) => {
    set("rulesText", r.text);
    setNote(r.note);
    setAsking(null);
  };
  // Un règlement déjà saisi n'est pas remplacé sans le demander (relecture du lot 53).
  const offer = (r: Replacement) => (rulesReplaceNeedsConfirm(d.rulesText, r.text) ? setAsking(r) : apply(r));
  const insert = (text: string, label: string) =>
    offer({ text, what: W.rulesWhatTemplate(label), note: W.rulesInserted });
  async function takeLast() {
    try {
      const list = (await api.structureEvents(structureId))
        .filter((e) => e.id !== event?.id)
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
      for (const e of list) {
        const full = await api.orgEvent(e.id);
        if (full.rulesText?.trim()) {
          return offer({ text: full.rulesText, what: W.rulesWhatLast, note: W.rulesTaken(full.title) });
        }
      }
      setNote(W.rulesLastNone);
    } catch (e) {
      setNote(errorMessage(e));
    }
  }
  return (
    <>
      <View style={styles.chips}>
        <Chip onPress={() => insert(defaultEventRules, W.rulesOrasso)}>{W.rulesOrasso}</Chip>
        {rulesTemplates.map((tpl) => (
          <Chip key={tpl.id} onPress={() => insert(tpl.text, tpl.label)}>
            {tpl.label}
          </Chip>
        ))}
        <Chip onPress={() => void takeLast()}>{W.rulesLast}</Chip>
      </View>
      {asking ? (
        <View style={styles.gap1} testID="wizard-rules-replace">
          <Notice>{`${W.rulesReplaceTitle} ${W.rulesReplaceBody(asking.what)}`}</Notice>
          <View style={wizardStyles.row}>
            <Button variant="secondary" icon="check" onPress={() => apply(asking)} testID="wizard-rules-replace-yes">
              {W.rulesReplaceConfirm}
            </Button>
            <Button variant="secondary" icon="close" onPress={() => setAsking(null)}>
              {W.rulesReplaceKeep}
            </Button>
          </View>
        </View>
      ) : null}
      {note ? <Muted variant="caption">{note}</Muted> : null}
      <TextField
        label={L.rules}
        value={d.rulesText}
        onChangeText={(v) => set("rulesText", v)}
        multiline
        maxLength={10000}
        help={W.rulesCount(count.lines, count.chars)}
        style={styles.rules}
        testID="wizard-rules"
      />
      <InstructionsField {...ctx} />
    </>
  );
}

// --- (7) Affiche ------------------------------------------------------------------------------------------------

export function AfficheTemps(ctx: StepContext) {
  const { d, setD, structureId, structureName, event } = ctx;
  const { t } = useTheme();
  const poster: PosterSettings = d.poster ?? {
    photoKey: null,
    style: POSTER_DEFAULT_STYLE,
    title: d.title.trim().slice(0, POSTER_TITLE_MAX),
  };
  // Les réglages sont posés en touchant à l'affiche, ou en quittant le temps (`withDefaultPoster`).
  const patch = (change: Partial<PosterSettings>) =>
    setD((p) => ({ ...p, poster: { ...(p.poster ?? poster), ...change } }));
  const [format, setFormat] = useState<PosterFormat>("post");
  const [preview, setPreview] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  // Rendu refusé (limite atteinte, réseau) : dit, avec de quoi réessayer (`retry` relance les rendus).
  const [refused, setRefused] = useState(false);
  const [retry, setRetry] = useState(0);
  const [photo, setPhoto] = useState<string | null>(mediaSource(event?.posterSettings?.photoUrl)?.uri ?? null);
  const { photoSending: sending, setPhotoSending: setSending, photoError: error, setPhotoError: setError } = ctx;
  const input = (p: PosterSettings, width: number) => ({
    ...p,
    title: p.title.trim() || d.title.trim().slice(0, POSTER_TITLE_MAX) || "—",
    date: draftStart(d) ?? new Date().toISOString(),
    place: d.city.slice(0, 80),
    structureName,
    structureId,
    format,
    width,
  });
  const latest = useRef(input);
  latest.current = input;
  const key = `${poster.photoKey}|${poster.style}|${poster.title}|${format}|${retry}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` résume ce qui change l'aperçu (débounce 300 ms).
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      void posterPreview(latest.current(poster, 540)).then((u) => {
        if (!alive) return;
        if (u) setPreview(u);
        else setRefused(true);
      });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [key]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: les vignettes suivent la photo et le format (limite de l'API).
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      void (async () => {
        for (const style of posterStyles) {
          const u = await posterPreview(latest.current({ ...poster, style }, 180));
          if (!alive) return;
          if (!u) return setRefused(true);
          setThumbs((x) => ({ ...x, [`${format}:${style}`]: u }));
        }
      })();
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [poster.photoKey, format, retry]);

  // Un seul envoi à la fois (le bouton est inactif pendant l'envoi) ; la réponse d'un envoi dépassé est ignorée.
  const upload = useRef(0);
  async function pick() {
    if (sending !== null) return;
    setError(null);
    const picked = await pickOneImage();
    if (!picked) return;
    const turn = ++upload.current;
    setSending(0);
    try {
      const form = await imageForm(picked, "file", "photo.jpg");
      form.append("purpose", "event_poster_photo");
      const { key: photoKey } = await api.upload(form);
      if (turn !== upload.current) return;
      setSending(1);
      setPhoto(picked.uri);
      patch({ photoKey });
    } catch (e) {
      if (turn === upload.current) setError(errorMessage(e));
    } finally {
      // Tenu par l'assistant : se termine même si on a quitté le temps entre-temps.
      if (turn === upload.current) setTimeout(() => setSending(null), 400);
    }
  }

  return (
    <>
      <Choices
        label={posterTexts.photo}
        options={[
          { value: "post", label: posterTexts.post },
          { value: "story", label: posterTexts.story },
        ]}
        value={format}
        onChange={(f) => setFormat(f as PosterFormat)}
      />
      <View style={styles.row}>
        {photo ? <Image source={{ uri: photo }} style={[styles.photo, { borderColor: t.color.accent }]} /> : null}
        {sending !== null ? <SendProgress size={56} progress={sending} /> : null}
        <Button
          variant="secondary"
          icon="gallery"
          disabled={sending !== null}
          onPress={() => void pick()}
          testID="wizard-poster-photo"
        >
          {photo ? W.posterPhotoChange : W.posterPhotoPick}
        </Button>
      </View>
      {!poster.photoKey ? <Muted variant="caption">{W.posterNoPhoto}</Muted> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <View
        style={[styles.preview, format === "story" ? styles.story : styles.post, { backgroundColor: t.color.line }]}
      >
        {preview ? (
          <Image
            source={{ uri: preview }}
            style={StyleSheet.absoluteFill}
            accessibilityLabel={W.posterPreviewAlt}
            testID="wizard-poster-preview"
          />
        ) : null}
      </View>
      {refused ? (
        <View style={styles.gap1} testID="wizard-poster-refused">
          <Notice tone="error">{W.posterPreviewFailed}</Notice>
          <Button
            variant="secondary"
            icon="undo"
            onPress={() => {
              setRefused(false);
              setRetry((n) => n + 1);
            }}
          >
            {W.posterPreviewRetry}
          </Button>
        </View>
      ) : null}
      <Muted variant="label">{`${posterTexts.style} · ${posterTexts.stylesCount}`}</Muted>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {posterStyles.map((style) => (
          <Pressable
            key={style}
            onPress={() => patch({ style })}
            accessibilityRole="button"
            accessibilityState={{ selected: poster.style === style }}
            accessibilityLabel={posterStyleLabels[style]}
            style={styles.tpl}
            testID={`wizard-style-${style}`}
          >
            <View
              style={[
                styles.tplImg,
                { borderColor: poster.style === style ? t.color.accent : "transparent", backgroundColor: t.color.line },
              ]}
            >
              {thumbs[`${format}:${style}`] ? (
                <Image source={{ uri: thumbs[`${format}:${style}`] }} style={StyleSheet.absoluteFill} />
              ) : null}
            </View>
            <Text variant="caption">{posterStyleLabels[style]}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <TextField
        label={W.posterTitleField}
        value={poster.title}
        onChangeText={(title) => patch({ title })}
        maxLength={POSTER_TITLE_MAX}
        help={`${poster.title.length} / ${POSTER_TITLE_MAX}`}
        testID="wizard-poster-title"
      />
      <OwnPosterField {...ctx} />
    </>
  );
}

// --- (8) Tout est prêt ------------------------------------------------------------------------------------------

export function PretTemps(ctx: StepContext) {
  const { d, event, verified, editing, openStructure } = ctx;
  const { t } = useTheme();
  const posterSource = mediaSource(event?.posterUrl);
  const start = draftStart(d);
  const tl = previewTimeline(d);
  const rows = [
    `${eventFormatLabels[d.format]} · ${d.title || "—"}`,
    start ? formatDayHour(start) : "—",
    [d.addressLine, d.city].filter(Boolean).join(", ") || "—",
    d.unlimited ? W.recapNoLimit : W.recapExhibitors(Number(d.capacity)),
    tl.subscribers ? W.recapPreview(formatShortDate(tl.subscribers)) : W.recapNoPreview,
    ...(eventKindOf(d) === "rec" && d.recurrence ? [W.recapRecurrence(d.recurrence.count)] : []),
  ];
  return (
    <>
      <View style={styles.row}>
        <View style={[styles.readyPoster, styles.post]}>
          {posterSource ? (
            <Image
              source={posterSource}
              style={StyleSheet.absoluteFill}
              accessibilityLabel={W.posterPreviewAlt}
              testID="wizard-ready-poster"
            />
          ) : null}
        </View>
        <View style={[styles.grow, styles.gap2]} testID="wizard-recap">
          {rows.map((r) => (
            <View key={r} style={styles.recapRow}>
              <Icon name="check" size={18} color={t.color.accentText} />
              <Text variant="body" style={styles.grow}>
                {r}
              </Text>
            </View>
          ))}
        </View>
      </View>
      {!verified && (!event || event.status === "draft") ? (
        <Plate kind="note" style={wizardStyles.block} testID="wizard-not-verified">
          <Muted variant="body">{L.notVerified}</Muted>
          <Button variant="plate" icon="check" onPress={openStructure}>
            {L.publishBlockedLink}
          </Button>
        </Plate>
      ) : null}
      {editing && event?.status === "published" ? <Notice>{L.publishedWarning}</Notice> : null}
    </>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  gap1: { gap: space1 },
  gap2: { gap: space2 },
  row: { flexDirection: "row", alignItems: "center", gap: space2, flexWrap: "wrap" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  panel: { borderWidth: 1.5, borderRadius: tokens.radius.radiusMd },
  panelHead: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3, minHeight: 56 },
  panelBody: { gap: space3, paddingHorizontal: space3, paddingBottom: space3 },
  kind: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space3,
    borderWidth: 1.5,
    borderRadius: tokens.radius.radiusMd,
    minHeight: 56,
  },
  timeline: { flexDirection: "row", gap: space2 },
  rules: { minHeight: 200 },
  photo: { width: 64, height: 64, borderRadius: tokens.radius.radiusSm, borderWidth: 2 },
  preview: {
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
    borderRadius: tokens.radius.radiusMd,
    overflow: "hidden",
  },
  post: { aspectRatio: 4 / 5 },
  story: { aspectRatio: 9 / 16, maxWidth: 260 },
  rail: { gap: space2 },
  tpl: { gap: space1, width: 84 },
  tplImg: { width: 84, aspectRatio: 4 / 5, borderRadius: tokens.radius.radiusSm, borderWidth: 2, overflow: "hidden" },
  readyPoster: { width: 120, borderRadius: tokens.radius.radiusSm, overflow: "hidden" },
  recapRow: { flexDirection: "row", gap: space2, alignItems: "flex-start" },
});
