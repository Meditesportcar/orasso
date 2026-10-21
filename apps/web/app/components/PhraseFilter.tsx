// Filtre en phrase à trous de `/evenements` (lot 56, prototype `s-web-events`) : « Je cherche <format> dans le
// <département> autour de <ville · rayon> <dates> ». Chaque trou est une pastille qui change la page tout de suite ;
// le département s'ouvre en feuille avec la carte de France (et sa liste, chemin clavier).
import {
  Button,
  departmentChoices,
  departmentLabel,
  FranceMap,
  FranceMapCredit,
  Icon,
} from "@orasso/design-system/web";
import { eventFormatLabels, eventFormats, siteLabels as L } from "@orasso/shared";
import { useRef } from "react";
import { Form, useSubmit } from "react-router";

import { filterCities, filterRadii } from "../lib/events-filter";

export type PhraseValues = {
  format: string;
  department: string;
  city: string;
  radius: number;
  when: string;
  q: string;
  view: string;
};

/** Un trou de la phrase : un menu natif habillé en pastille (clavier et lecteur d'écran gratuits). */
function Pick({
  label,
  name,
  value,
  set,
  options,
}: {
  label: string;
  name: string;
  value: string;
  set: boolean;
  options: { value: string; label: string }[];
}) {
  const submit = useSubmit();
  return (
    <label className={`w-pick o-t-button${set ? " is-set" : ""}`}>
      <span className="o-visually-hidden">{label}</span>
      <select
        name={name}
        defaultValue={value}
        onChange={(e) => submit(e.currentTarget.form, { method: "get" })}
        data-testid={`pick-${name}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="down" size={16} />
    </label>
  );
}

/** Le département : une pastille qui ouvre la feuille (carte de France + liste). */
function DepartmentPick({ value }: { value: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const submit = useSubmit();
  const choose = (code: string) => {
    if (hidden.current) {
      hidden.current.value = code;
      dialog.current?.close();
      submit(hidden.current.form, { method: "get" });
    }
  };
  return (
    <>
      <input ref={hidden} type="hidden" name="departement" defaultValue={value} />
      <span className={`w-pick o-t-button${value ? " is-set" : ""}`}>
        <button
          type="button"
          aria-haspopup="dialog"
          data-testid="pick-departement"
          onClick={() => dialog.current?.showModal()}
        >
          {value || L.events.allDepartments}
        </button>
        <Icon name="down" size={16} />
      </span>
      <dialog ref={dialog} className="w-dialog" aria-label={L.events.pickDepartment} data-testid="department-sheet">
        <div className="w-dialog__head">
          <h2 className="o-t-poster-s">{L.events.pickDepartment}</h2>
          <Button variant="close" label={L.events.close} icon="close" onClick={() => dialog.current?.close()} />
        </div>
        <p className="o-t-caption">{L.events.departmentHint}</p>
        <FranceMap selected={value ? [value] : []} favorite={value || null} onToggle={choose} />
        <FranceMapCredit />
        <ul className="w-dialog__list">
          <li>
            <button type="button" aria-pressed={!value} onClick={() => choose("")}>
              {L.events.clearDepartment}
            </button>
          </li>
          {departmentChoices.map((d) => (
            <li key={d.code}>
              <button type="button" aria-pressed={d.code === value} onClick={() => choose(d.code)}>
                {departmentLabel(d)}
              </button>
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}

export function PhraseFilter({ values }: { values: PhraseValues }) {
  return (
    <Form method="get" className="w w-phrase" data-testid="events-filters" aria-label="Filtres">
      <span>{L.events.iSearch}</span>
      <Pick
        label="Format"
        name="format"
        value={values.format}
        set={Boolean(values.format)}
        options={[
          { value: "", label: L.events.allFormats },
          ...eventFormats.map((f) => ({ value: f, label: eventFormatLabels[f] })),
        ]}
      />
      <span>{L.events.inThe}</span>
      <DepartmentPick value={values.department} />
      <span>{L.events.around}</span>
      <Pick
        label="Ville"
        name="ville"
        value={values.city}
        set={Boolean(values.city)}
        options={[
          { value: "", label: L.events.anywhere },
          ...filterCities.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />
      {values.city && (
        <Pick
          label="Rayon"
          name="rayon"
          value={String(values.radius)}
          set
          options={filterRadii.map((r) => ({ value: String(r), label: `${r} km` }))}
        />
      )}
      <Pick
        label="Dates"
        name="quand"
        value={values.when}
        set={Boolean(values.when)}
        options={[
          { value: "", label: L.events.allDates },
          { value: "weekend", label: L.events.weekend },
          { value: "month", label: L.events.thisMonth },
          { value: "next", label: L.events.nextMonth },
        ]}
      />
      <input type="hidden" name="vue" value={values.view} />
      <label className="o-visually-hidden" htmlFor="events-q">
        {L.events.search}
      </label>
      <input
        id="events-q"
        className="w-search o-t-meta"
        type="search"
        name="q"
        defaultValue={values.q}
        placeholder={L.events.searchPlaceholder}
        maxLength={80}
      />
      <Button type="submit" variant="secondary" icon="search">
        {L.events.apply}
      </Button>
    </Form>
  );
}
