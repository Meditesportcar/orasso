// Temps 4 (`s-create` data-cs 3) : « Qui peut venir ? » — mode d'admission, puis (sur sélection) trois questions dans
// l'ordre : origines, styles (catégories), marques ; une phrase les résume. Les critères ne refusent personne d'office.
import { Chip, ChipRow, TextField } from "@orasso/design-system/web";
import {
  type Category,
  criteriaOrigins,
  eventEditorLabels as E,
  eventAdmissionLabels,
  styleCategories,
  summaryOfCriteria,
  type VehicleMake,
  wizardV2Labels as W,
} from "@orasso/shared";
import { useState } from "react";
import { TextAreaField } from "../Fields";
import { type StepProps, toggle } from "./types";

export function CriteriaStep({
  d,
  set,
  categories,
  makes,
}: StepProps & { categories: Category[]; makes: VehicleMake[] }) {
  const [q, setQ] = useState("");
  const chosenMakes = makes.filter((m) => d.makeIds.includes(m.id));
  const found =
    q.trim().length < 2
      ? []
      : makes
          .filter((m) => m.name !== "Autre" && !d.makeIds.includes(m.id))
          .filter((m) => m.name.toLowerCase().includes(q.trim().toLowerCase()))
          .slice(0, 8);
  const summary = summaryOfCriteria({
    countries: d.countries,
    styles: categories.filter((c) => d.categoryIds.includes(c.id)).map((c) => c.label),
    makes: chosenMakes.map((m) => m.name),
  });
  return (
    <>
      <fieldset className="s-fieldset s-stack s-stack--tight">
        <legend className="o-t-label s-label">{W.admission}</legend>
        <ChipRow className="s-chips-wrap">
          {(["filtered", "open", "invite_only"] as const).map((a) => (
            <Chip key={a} selected={d.admission === a} onClick={() => set("admission", a)}>
              {eventAdmissionLabels[a]}
            </Chip>
          ))}
        </ChipRow>
        <p className="s-muted">
          {d.admission === "open"
            ? E.admissionOpen
            : d.admission === "invite_only"
              ? E.admissionInvite
              : E.admissionFiltered}
        </p>
      </fieldset>

      {d.admission === "filtered" && (
        <>
          <div className="wz-q">
            <h3 className="wz-h3">
              <i>1</i>
              {W.q1}
            </h3>
            <ChipRow className="s-chips-wrap">
              {criteriaOrigins.map((o) => (
                <Chip
                  key={o.code}
                  selected={d.countries.includes(o.code)}
                  onClick={() => set("countries", toggle(d.countries, o.code))}
                >
                  {o.chip}
                </Chip>
              ))}
            </ChipRow>
          </div>
          <div className="wz-q">
            <h3 className="wz-h3">
              <i>2</i>
              {W.q2}
            </h3>
            <ChipRow className="s-chips-wrap">
              {styleCategories(categories, d.categoryIds).map((c) => (
                <Chip
                  key={c.id}
                  selected={d.categoryIds.includes(c.id)}
                  onClick={() => set("categoryIds", toggle(d.categoryIds, c.id))}
                >
                  {c.label}
                </Chip>
              ))}
            </ChipRow>
          </div>
          <div className="wz-q">
            <h3 className="wz-h3">
              <i>3</i>
              {W.q3}
            </h3>
            <TextField
              label={E.makesSearch}
              name="makeSearch"
              value={q}
              placeholder={W.makesPlaceholder}
              onChange={(e) => setQ(e.currentTarget.value)}
            />
            {found.length > 0 || chosenMakes.length > 0 ? (
              <ChipRow className="s-chips-wrap" data-testid="wizard-makes">
                {[...chosenMakes, ...found].map((m) => (
                  <Chip
                    key={m.id}
                    selected={d.makeIds.includes(m.id)}
                    onClick={() => set("makeIds", toggle(d.makeIds, m.id))}
                  >
                    {m.name}
                  </Chip>
                ))}
              </ChipRow>
            ) : null}
            {chosenMakes.length === 0 ? <span className="o-t-caption s-muted">{W.makesNone}</span> : null}
          </div>
          <div className="wz-sum" data-testid="wizard-criteria-summary">
            {summary}
          </div>
          <TextAreaField
            label={W.criteriaMore}
            name="criteriaText"
            value={d.criteriaText}
            onChange={(e) => set("criteriaText", e.currentTarget.value)}
            help={E.criteriaTextHint}
          />
        </>
      )}
    </>
  );
}
