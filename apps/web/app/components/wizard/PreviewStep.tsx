// Temps 5 (`s-create` data-cs 4) : « Avant-première » — l'option avant les dates, ouverture aux abonnés et à tous,
// frise ; volet « Hauts grades et verrouillage » (réglages existants du lot 25 et du verrouillage).
import { CheckboxField, Icon, SelectField, TextField } from "@orasso/design-system/web";
import {
  eventEditorLabels as E,
  type Grade,
  gradeLabels,
  grades,
  highGradePreviewOptions,
  highGradesText,
  invitationLabels,
  lockOffsetOptions,
  previewHourOptions,
  previewTimeline,
  wizardV2Labels as W,
} from "@orasso/shared";
import { formatDayTime, formatShortDay, type StepProps } from "./types";

export function PreviewStep({
  d,
  set,
  followers,
  structureName,
}: StepProps & { followers: number | null; structureName: string }) {
  const on = Number(d.previewHours) > 0;
  const t = previewTimeline(d);
  return (
    <>
      <div className="wz-box s-stack">
        <div className="wz-switchrow">
          <div>
            <b>{W.previewSwitch}</b>
            {followers !== null ? (
              <div className="o-t-caption s-muted">{W.followers(followers, structureName)}</div>
            ) : null}
          </div>
          <label className="wz-switch">
            <input
              type="checkbox"
              role="switch"
              checked={on}
              aria-checked={on}
              aria-label={W.previewTitle}
              onChange={(e) => set("previewHours", e.currentTarget.checked ? "24" : "0")}
              data-testid="wizard-preview-switch"
            />
            <span aria-hidden="true" />
          </label>
        </div>
        {on ? (
          <>
            <SelectField
              label={W.previewLead}
              name="previewHours"
              value={d.previewHours}
              onChange={(e) => set("previewHours", e.currentTarget.value)}
              options={previewHourOptions.filter((o) => o.value !== "0").map((o) => ({ ...o }))}
            />
            <p className="wz-timep" data-testid="wizard-open-subscribers">
              <small>{W.openSubscribers}</small>
              <b>{t.subscribers ? formatDayTime(t.subscribers) : "—"}</b>
            </p>
          </>
        ) : null}
        <TextField
          label={W.openEveryone}
          name="registrationsOpenAt"
          type="datetime-local"
          value={d.registrationsOpenAt}
          onChange={(e) => set("registrationsOpenAt", e.currentTarget.value)}
        />
      </div>
      <ol className="wz-tl" data-testid="wizard-timeline">
        {t.subscribers ? (
          <li className="is-on">
            <b>{formatShortDay(t.subscribers)}</b>
            <span>{W.timelineSubscribers}</span>
          </li>
        ) : null}
        {t.everyone ? (
          <li className="is-on">
            <b>{formatShortDay(t.everyone)}</b>
            <span>{W.timelineEveryone}</span>
          </li>
        ) : null}
        {t.start ? (
          <li>
            <b>{formatShortDay(t.start)}</b>
            <span>{d.title || "—"}</span>
          </li>
        ) : null}
      </ol>

      <details className="wz-panel">
        <summary>
          <Icon name="grade" />
          <span>
            <b>{W.morePanel}</b>
          </span>
        </summary>
        <div className="s-stack">
          <fieldset className="s-fieldset s-stack s-stack--tight" data-testid="wizard-high-grades">
            <legend className="o-t-label s-label">{invitationLabels.highGradeTitle}</legend>
            <CheckboxField
              name="highGradePriority"
              label={invitationLabels.highGradePriority}
              checked={d.highGradePriority}
              onChange={(e) => set("highGradePriority", e.currentTarget.checked)}
            />
            <p className="o-t-caption s-muted">{invitationLabels.highGradePriorityHint}</p>
            <SelectField
              label={invitationLabels.highGradePreview}
              name="highGradePreviewHours"
              value={d.highGradePreviewHours}
              onChange={(e) => set("highGradePreviewHours", e.currentTarget.value)}
              options={[...highGradePreviewOptions]}
              help={invitationLabels.highGradePreviewHint}
            />
            <SelectField
              label={invitationLabels.highGradeMin}
              name="highGradeMin"
              value={d.highGradeMin}
              onChange={(e) => set("highGradeMin", e.currentTarget.value as Grade)}
              options={grades.filter((g) => g !== "rodage").map((g) => ({ value: g, label: gradeLabels[g] }))}
              help={`Concerne : ${highGradesText(d.highGradeMin)}.`}
            />
          </fieldset>
          <SelectField
            label={E.lockOffset}
            name="lockOffsetMinutes"
            value={d.lockOffsetMinutes}
            onChange={(e) => set("lockOffsetMinutes", e.currentTarget.value)}
            options={[...lockOffsetOptions]}
            help={E.lockOffsetHint}
          />
        </div>
      </details>
    </>
  );
}
