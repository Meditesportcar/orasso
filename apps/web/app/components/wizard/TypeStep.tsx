// Temps 1 (`s-create` data-cs 0) : « C'est quel genre ? » — format, ponctuel / récurrent / plusieurs jours et leurs
// options, titre, description ; volet « Public et places » (véhicules admis, véhicules par personne, places).
import {
  Button,
  CheckboxField,
  Chip,
  ChipRow,
  Icon,
  type IconName,
  SelectField,
  TextField,
} from "@orasso/design-system/web";
import {
  dayAccesses,
  dayAccessLabels,
  eventEditorLabels as E,
  type EventFormat,
  type EventKind,
  eventDaysLabels,
  eventFormatLabels,
  eventKindOf,
  RECURRENCE_MAX_COUNT,
  recurrenceDates,
  vehicleTypeLabels,
  vehicleTypes,
  wizardV2Labels as W,
  withAddedDay,
  withEventKind,
  withRecurrence,
  withSingleDate,
} from "@orasso/shared";
import { now as clockNow } from "../../lib/clock";
import { TextAreaField } from "../Fields";
import { formatLongDay, formatShortDay, type StepProps, toggle } from "./types";

const KIND_ICONS: Record<EventKind, IconName> = { one: "calendar", rec: "undo", multi: "cards" };
const NTHS = [1, 2, 3, 4, -1] as const;

export function TypeStep({
  d,
  set,
  setD,
  formats,
  recurrenceLocked,
  seriesExists,
}: StepProps & { formats: readonly EventFormat[]; recurrenceLocked: boolean; seriesExists: boolean }) {
  const kind = eventKindOf(d);
  const dates = kind === "rec" ? recurrenceDates(d) : [];
  const rec = d.recurrence;
  return (
    <>
      <ChipRow className="s-chips-wrap" aria-label={E.format}>
        {formats.map((f) => (
          <Chip key={f} selected={d.format === f} onClick={() => set("format", f)}>
            {eventFormatLabels[f]}
          </Chip>
        ))}
      </ChipRow>

      <span className="o-t-label s-label">{W.howOften}</span>
      <div className="wz-kinds">
        {(["one", "rec", "multi"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            className={kind === k ? "wz-kind is-on" : "wz-kind"}
            disabled={recurrenceLocked && k === "rec" && kind !== "rec"}
            onClick={() => setD((p) => withEventKind(p, k, clockNow()))}
            data-testid={`wizard-kind-${k}`}
          >
            <span className="wz-kind__icon">
              <Icon name={KIND_ICONS[k]} />
            </span>
            <span className="wz-kind__text">
              <b>{W.kinds[k].title}</b>
              <span className="o-t-caption s-muted">{W.kinds[k].hint}</span>
            </span>
            <span className="wz-kind__check">{kind === k ? <Icon name="check" /> : null}</span>
          </button>
        ))}
      </div>
      {seriesExists ? <p className="s-notice">{W.recurrenceExisting}</p> : null}

      {kind !== "multi" && (
        <div className="wz-box s-stack s-stack--tight" data-testid="wizard-kind-options">
          {kind === "one" ? (
            <TextField
              label={W.date}
              name="date"
              type="date"
              value={d.startsAt.slice(0, 10)}
              onChange={(e) => {
                const date = e.currentTarget.value;
                setD((p) => withSingleDate(p, { date }));
              }}
            />
          ) : rec ? (
            <>
              <span className="o-t-label s-label">{W.returns}</span>
              <ChipRow className="s-chips-wrap">
                {NTHS.map((n) => (
                  <Chip
                    key={n}
                    selected={rec.nth === n}
                    onClick={() => setD((p) => withRecurrence(p, { ...rec, nth: n }, clockNow()))}
                  >
                    {W.nthChips[n]}
                  </Chip>
                ))}
              </ChipRow>
              <ChipRow className="s-chips-wrap">
                {W.weekdayChips.map((label, weekday) => (
                  <Chip
                    key={label}
                    selected={rec.weekday === weekday}
                    onClick={() => setD((p) => withRecurrence(p, { ...rec, weekday }, clockNow()))}
                  >
                    {label}
                  </Chip>
                ))}
              </ChipRow>
              <b>{W.eachMonth}</b>
            </>
          ) : null}
          <div className="wz-timepair">
            <TextField
              label={kind === "rec" ? W.from : W.start}
              name="startTime"
              type="time"
              value={d.startsAt.slice(11, 16)}
              onChange={(e) => {
                const start = e.currentTarget.value;
                setD((p) => withSingleDate(p, { start }));
              }}
            />
            <Icon name="next" />
            <TextField
              label={kind === "rec" ? W.to : W.end}
              name="endTime"
              type="time"
              value={d.endsAt.slice(11, 16)}
              onChange={(e) => {
                const end = e.currentTarget.value;
                setD((p) => withSingleDate(p, { end }));
              }}
            />
          </div>
          {rec && kind === "rec" ? (
            <>
              <SelectField
                label={W.recurrenceCount}
                name="recurrenceCount"
                value={String(rec.count)}
                onChange={(e) => {
                  const count = Number(e.currentTarget.value);
                  setD((p) => ({ ...p, recurrence: { ...rec, count } }));
                }}
                options={Array.from({ length: RECURRENCE_MAX_COUNT }, (_, i) => ({
                  value: String(i + 1),
                  label: String(i + 1),
                }))}
              />
              {dates.length > 0 ? (
                <div className="wz-preview" data-testid="wizard-next-dates">
                  <span className="o-t-label s-label">{W.nextDates}</span>
                  <span>
                    {dates
                      .slice(0, 3)
                      .map((x) => formatShortDay(x))
                      .join(" · ")}
                  </span>
                  <span className="o-t-label s-label">{W.until}</span>
                  <span>{W.untilValue(formatLongDay(dates[dates.length - 1] as Date))}</span>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      )}

      {kind === "multi" && (
        <div className="wz-box s-stack s-stack--tight" data-testid="wizard-days">
          {d.days.map((day, i) => (
            <fieldset key={`day-${i.toString()}`} className="s-fieldset s-stack s-stack--tight">
              <legend className="o-t-label s-label">
                {eventDaysLabels.day} {i + 1}
              </legend>
              <div className="s-two">
                <TextField
                  label={W.date}
                  name={`day-${i}-date`}
                  type="date"
                  value={day.date}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    setD((p) => ({ ...p, days: p.days.map((x, j) => (j === i ? { ...x, date: value } : x)) }));
                  }}
                />
                <TextField
                  label={W.start}
                  name={`day-${i}-start`}
                  type="time"
                  value={day.startTime}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    setD((p) => ({ ...p, days: p.days.map((x, j) => (j === i ? { ...x, startTime: value } : x)) }));
                  }}
                />
                <TextField
                  label={W.end}
                  name={`day-${i}-end`}
                  type="time"
                  value={day.endTime}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    setD((p) => ({ ...p, days: p.days.map((x, j) => (j === i ? { ...x, endTime: value } : x)) }));
                  }}
                />
                <TextField
                  label={eventDaysLabels.dayCapacity}
                  name={`day-${i}-capacity`}
                  inputMode="numeric"
                  value={day.capacity}
                  placeholder={eventDaysLabels.dayCapacityHint}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    setD((p) => ({ ...p, days: p.days.map((x, j) => (j === i ? { ...x, capacity: value } : x)) }));
                  }}
                />
              </div>
              {d.days.length > 2 ? (
                <div className="s-row">
                  <Button
                    variant="secondary"
                    icon="close"
                    onClick={() => setD((p) => ({ ...p, days: p.days.filter((_, j) => j !== i) }))}
                  >
                    {eventDaysLabels.removeDay}
                  </Button>
                </div>
              ) : null}
            </fieldset>
          ))}
          <div className="s-row">
            <Button variant="secondary" icon="add" onClick={() => setD((p) => withAddedDay(p, clockNow()))}>
              {eventDaysLabels.addDay}
            </Button>
          </div>
          <fieldset className="s-fieldset s-stack s-stack--tight">
            <legend className="o-t-label s-label">{eventDaysLabels.dayAccess}</legend>
            <ChipRow className="s-chips-wrap">
              {dayAccesses.map((a) => (
                <Chip key={a} selected={d.dayAccess === a} onClick={() => set("dayAccess", a)}>
                  {dayAccessLabels[a]}
                </Chip>
              ))}
            </ChipRow>
          </fieldset>
        </div>
      )}

      <TextField
        label={W.eventTitle}
        name="title"
        value={d.title}
        onChange={(e) => set("title", e.currentTarget.value)}
      />
      <TextAreaField
        label={W.eventDescription}
        name="description"
        value={d.description}
        onChange={(e) => set("description", e.currentTarget.value)}
      />

      <details className="wz-panel" data-testid="wizard-panel-places">
        <summary>
          <Icon name="vehicle" />
          <span>
            <b>{W.placesPanel}</b>
            <span className="o-t-caption s-muted">{W.placesPanelHint}</span>
          </span>
        </summary>
        <div className="s-stack">
          <fieldset className="s-fieldset s-stack s-stack--tight">
            <legend className="o-t-label s-label">{E.vehicleTypes}</legend>
            {vehicleTypes.map((t) => (
              <CheckboxField
                key={t}
                label={vehicleTypeLabels[t]}
                checked={d.vehicleTypes.includes(t)}
                onChange={() => set("vehicleTypes", toggle(d.vehicleTypes, t))}
              />
            ))}
          </fieldset>
          <TextField
            label={E.maxVehicles}
            name="maxVehiclesPerUser"
            type="number"
            min={1}
            max={10}
            value={d.maxVehiclesPerUser}
            onChange={(e) => set("maxVehiclesPerUser", e.currentTarget.value)}
            help={E.maxVehiclesHint}
          />
          <fieldset className="s-fieldset s-stack s-stack--tight">
            <legend className="o-t-label s-label">{E.capacityTitle}</legend>
            <ChipRow>
              <Chip selected={d.unlimited} onClick={() => set("unlimited", true)}>
                {E.unlimited}
              </Chip>
              <Chip selected={!d.unlimited} onClick={() => set("unlimited", false)}>
                {E.limited}
              </Chip>
            </ChipRow>
          </fieldset>
          {!d.unlimited && (
            <TextField
              label={E.capacityTitle}
              name="capacity"
              type="number"
              min={1}
              value={d.capacity}
              onChange={(e) => set("capacity", e.currentTarget.value)}
            />
          )}
          <p className="s-muted">{E.capacityHint}</p>
        </div>
      </details>
    </>
  );
}
