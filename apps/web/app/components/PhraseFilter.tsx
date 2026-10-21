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
import { type Category, eventFormatLabels, eventFormats, siteLabels as L } from "@orasso/shared";
import { useRef, useState } from "react";
import { Form, useLocation, useSubmit } from "react-router";

import { categoryOptions, filterCities, filterRadii } from "../lib/events-filter";

export type PhraseValues = {
  format: string;
  categoryId: string;
  categories: Category[];
  /** Le référentiel des catégories n'a pas répondu : la catégorie active reste affichée, avec un avis. */
  categoriesFailed: boolean;
  from: string;
  to: string;
  department: string;
  city: string;
  radius: number;
  when: string;
  q: string;
  view: string;
};

/**
 * Valeur d'un champ qui suit les critères du loader : saisie locale, mais remise aux critères dès qu'ils changent
 * (Retour / Suivant du navigateur, lien partagé), pour que les champs ne contredisent jamais les résultats.
 */
function useSynced(value: string): [string, (next: string) => void] {
  const navigationKey = useLocation().key;
  const [state, setState] = useState(value);
  const [seen, setSeen] = useState({ value, navigationKey });
  // Remise aux critères à chaque navigation validée (clé d'historique), même si la valeur du serveur est identique :
  // un Retour pendant la requête ne laisse pas une saisie locale contredire les résultats.
  if (seen.value !== value || seen.navigationKey !== navigationKey) {
    setSeen({ value, navigationKey });
    setState(value);
  }
  return [state, setState];
}

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
  const [current, setCurrent] = useSynced(value);
  return (
    <label className={`w-pick o-t-button${set ? " is-set" : ""}`}>
      <span className="o-visually-hidden">{label}</span>
      <select
        name={name}
        value={current}
        onChange={(e) => {
          setCurrent(e.currentTarget.value);
          submit(e.currentTarget.form, { method: "get" });
        }}
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
      <input ref={hidden} type="hidden" name="departement" key={value} defaultValue={value} />
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

/**
 * Les critères hors phrase, toujours visibles : catégorie et dates libres (« du / au »). Un lien partagé qui les porte
 * les montre donc, et le formulaire les garde. Une fenêtre « quand » remplace les dates libres : elles se masquent.
 */
function MoreFilters({ values }: { values: PhraseValues }) {
  const submit = useSubmit();
  const [from, setFrom] = useSynced(values.from);
  const [to, setTo] = useSynced(values.to);
  const onChange = (e: { currentTarget: { form: HTMLFormElement | null } }) =>
    submit(e.currentTarget.form, { method: "get" });
  const options = categoryOptions(values.categories, values.categoryId, values.categoriesFailed, {
    all: L.events.allCategories,
    unlisted: L.events.categoryUnlisted,
    unavailable: L.events.categoryUnavailable,
  });
  return (
    <div className="w-more" data-testid="more-filters">
      <span className="o-t-label">{L.events.moreFilters}</span>
      {options.length > 1 && (
        <Pick
          label={L.events.category}
          name="categorie"
          value={values.categoryId}
          set={Boolean(values.categoryId)}
          options={options}
        />
      )}
      {values.categoriesFailed && (
        <span className="o-t-caption" role="status" data-testid="categories-failed">
          {L.events.categoriesFailed}
        </span>
      )}
      {!values.when && (
        <>
          <label className="w-date o-t-meta">
            <span>{L.events.dateFrom}</span>
            <input
              type="date"
              name="du"
              value={from}
              max={to || undefined}
              onChange={(e) => {
                setFrom(e.currentTarget.value);
                onChange(e);
              }}
            />
          </label>
          <label className="w-date o-t-meta">
            <span>{L.events.dateTo}</span>
            <input
              type="date"
              name="au"
              value={to}
              min={from || undefined}
              onChange={(e) => {
                setTo(e.currentTarget.value);
                onChange(e);
              }}
            />
          </label>
        </>
      )}
    </div>
  );
}

export function PhraseFilter({ values }: { values: PhraseValues }) {
  const [q, setQ] = useSynced(values.q);
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
        value={q}
        onChange={(e) => setQ(e.currentTarget.value)}
        placeholder={L.events.searchPlaceholder}
        maxLength={80}
      />
      <Button type="submit" variant="secondary" icon="search">
        {L.events.apply}
      </Button>
      <MoreFilters values={values} />
    </Form>
  );
}
