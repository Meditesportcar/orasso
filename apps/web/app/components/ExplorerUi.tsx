// Éléments de l'Explorer du site (lot R2, parité avec l'appli : `ExplorerHead.tsx` et `ExplorerSheets.tsx`) : les
// pastilles qui montrent leur valeur, les feuilles (fenêtres `<dialog>`, sans dépendance), « Où chercher ? » et ses
// curseur et position, les choix qui s'appliquent au clic, les groupes de puces des formulaires de filtres.
// Les formulaires sont de simples formulaires GET vers l'Explorer : ils marchent aussi sans JavaScript, sauf l'ouverture
// des fenêtres et la lecture de la position (faite au clic, arrondie à 10 km, jamais enregistrée).

import type { IconName } from "@orasso/design-system/web";
import {
  Button,
  departmentChoices,
  departmentLabel,
  FranceMap,
  franceMapCredit,
  franceMapLicenseUrl,
  Icon,
} from "@orasso/design-system/web";
import {
  coarsePosition,
  DEPARTMENT_MATCHES_SHOWN,
  matchDepartments,
  explorerR2Labels as R,
  roadTime,
  WHERE_KM,
} from "@orasso/shared";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

/** Les réglages à garder tels quels dans un formulaire (champs cachés). */
export function Hidden({ entries }: { entries: readonly (readonly [string, string])[] }) {
  return (
    <>
      {entries.map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

/**
 * Une pastille de réglage qui ouvre sa feuille. Contour : le réglage habituel ; plein (encre) : une valeur choisie ;
 * nombre moutarde : le nombre de filtres actifs.
 */
export function PillSheet({
  icon,
  k,
  value,
  set = false,
  count,
  title,
  testId,
  sheetId,
  children,
}: {
  icon: IconName;
  /** Le nom du réglage devant sa valeur (« Métier : Tous »). */
  k?: string;
  value: string;
  set?: boolean;
  count?: number;
  title: string;
  testId: string;
  sheetId: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const close = () => ref.current?.close();
  return (
    <>
      {/* Sans JavaScript la fenêtre ne s'ouvre pas : le réglage s'ouvre à la place dans un bloc repliable (formulaire GET). */}
      <noscript>
        <style>{`[data-testid="${testId}"]{display:none}.ex-pills{flex-wrap:wrap;overflow:visible}`}</style>
        <details className="ex-nojs">
          <summary className="ex-pill">
            <Icon name={icon} size={18} />
            <span className="ex-pill__text">
              {k ? <span className="ex-pill__k">{k} : </span> : null}
              <strong className="ex-pill__v">{value}</strong>
            </span>
          </summary>
          <div className="ex-nojs__in">
            <h2 className="s-h2">{title}</h2>
            {children}
          </div>
        </details>
      </noscript>
      <button
        type="button"
        className="ex-pill"
        data-set={set ? "true" : undefined}
        aria-haspopup="dialog"
        onClick={() => ref.current?.showModal()}
        data-testid={testId}
      >
        <Icon name={icon} size={18} />
        <span className="ex-pill__text">
          {k ? <span className="ex-pill__k">{k} : </span> : null}
          <strong className="ex-pill__v">{value}</strong>
        </span>
        {count ? (
          <span
            className="ex-pill__n"
            role="img"
            aria-label={`${count} filtre${count > 1 ? "s" : ""} actif${count > 1 ? "s" : ""}`}
          >
            {count}
          </span>
        ) : null}
        <Icon name="down" size={16} />
      </button>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Échap ferme déjà la fenêtre (natif) ; le clic sur le fond est un confort */}
      <dialog
        ref={ref}
        className="ex-sheet"
        aria-labelledby={titleId}
        data-testid={sheetId}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="ex-sheet__in">
          <div className="ex-sheet__head">
            <h2 id={titleId} className="s-h2">
              {title}
            </h2>
            <Button variant="close" label="Fermer" onClick={close} data-testid={`${sheetId}-close`} />
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}

export type Choice = {
  id: string;
  label: string;
  hint?: string;
  icon?: IconName;
  href?: string;
  selected: boolean;
  /** Grisé (ni lien ni choix) : par exemple un métier sans pro. */
  disabled?: boolean;
  /** Un nombre à droite (« 3 pros »). */
  meta?: string;
  testId: string;
};

/** Une feuille à un seul choix : un lien par option, appliqué au clic (la page se recharge sur le nouveau réglage). */
export function ChoiceList({ choices, grid = false, label }: { choices: Choice[]; grid?: boolean; label: string }) {
  return (
    <ul className={grid ? "ex-choices ex-choices--grid" : "ex-choices"} aria-label={label}>
      {choices.map((c) => {
        const body = (
          <>
            {c.icon ? (
              <span className="ex-opt__icon" aria-hidden="true">
                <Icon name={c.icon} size={20} />
              </span>
            ) : null}
            <span className="ex-opt__main">
              <span className="ex-opt__title">{c.label}</span>
              {c.hint ? <span className="ex-opt__hint">{c.hint}</span> : null}
            </span>
            {c.meta ? <span className="ex-opt__meta">{c.meta}</span> : null}
          </>
        );
        return (
          <li key={c.id}>
            {c.disabled || !c.href ? (
              <span
                className="ex-opt"
                aria-disabled="true"
                data-testid={c.testId}
                data-selected={c.selected || undefined}
              >
                {body}
              </span>
            ) : (
              <a
                className="ex-opt"
                href={c.href}
                aria-current={c.selected ? "true" : undefined}
                data-testid={c.testId}
                data-selected={c.selected || undefined}
              >
                {body}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Un groupe de puces à choix unique (radio) ou multiple (cases) dans un formulaire GET. */
export function ChipGroup({
  label,
  name,
  kind = "radio",
  options,
  value,
  testId,
}: {
  label: string;
  name: string;
  kind?: "radio" | "checkbox";
  options: { value: string; label: string; testId?: string; name?: string; checked?: boolean }[];
  /** Radio : la valeur choisie ; cases : les valeurs cochées. */
  value: string | readonly string[];
  testId?: string;
}) {
  const checked = (v: string) => (Array.isArray(value) ? value.includes(v) : value === v);
  return (
    <fieldset className="ex-group" data-testid={testId}>
      <legend className="o-t-label ex-group__legend">{label}</legend>
      <div className="ex-group__chips">
        {options.map((o) => (
          <label key={o.value} className="ex-chip" data-testid={o.testId}>
            <input type={kind} name={o.name ?? name} value={o.value} defaultChecked={o.checked ?? checked(o.value)} />
            <span className="o-t-meta">{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type Mode = "moi" | "coin" | "ailleurs" | "partout";

/** Le nom d'un département : « Aude ». */
const nameOf = (code: string) => departmentChoices.find((d) => d.code === code)?.name ?? code;

/**
 * « Ailleurs » (lot R4d, maquette R4.2, comme l'appli) : la recherche et sa liste déroulante (5 départements au plus,
 * parcourue au clavier : flèches, Entrée, Échap), les 3 derniers départements choisis (cookie de l'Explorer, par
 * compte), la carte de « Ton coin » (un clic choisit ; Mon coin en pointillé ; l'outre-mer par la recherche). Le
 * département choisi part dans `ailleurs` (champ caché). Sans JavaScript, le texte part dans `dq` et le serveur prend
 * le premier département qui correspond.
 */
function AwayField({
  value,
  on,
  onPick,
  recent,
  coin,
}: {
  value: string;
  /** « Ailleurs » est coché : sinon le département ne part pas avec le formulaire. */
  on: boolean;
  onPick: (code: string) => void;
  recent: readonly string[];
  coin: readonly string[];
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [find, setFind] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Après l'hydratation, un champ vide ne part plus avec le formulaire (pas de « dq= » dans l'adresse).
  const [js, setJs] = useState(false);
  useEffect(() => setJs(true), []);
  const typed = find.trim();
  const matches = matchDepartments(departmentChoices, find);
  const shown = matches.slice(0, DEPARTMENT_MATCHES_SHOWN);
  const listOpen = open && typed.length > 0;
  const choose = (code: string) => {
    setFind("");
    setOpen(false);
    setActive(-1);
    onPick(code);
  };
  function keyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!shown.length) return;
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i < 0 ? (step > 0 ? 0 : shown.length - 1) : (i + step + shown.length) % shown.length));
    } else if (event.key === "Enter") {
      // Entrée choisit (la ligne active, sinon la première) au lieu d'envoyer le formulaire.
      if (!typed) return;
      event.preventDefault();
      const pick = shown[active] ?? shown[0];
      if (pick) choose(pick.code);
    } else if (event.key === "Escape" && listOpen) {
      // Échap ferme la liste, pas la feuille.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActive(-1);
    }
  }
  const optionId = (code: string) => `${id}-o-${code}`;
  const [credit, licence] = franceMapCredit.split(", ");
  return (
    <div className="ex-away" data-testid="around-departments">
      <input type="hidden" name="ailleurs" value={value} disabled={!on || !value} />
      <div className="ex-away__q">
        <div className="ex-search__field ex-away__field">
          <Icon name="search" size={18} />
          <input
            type="text"
            name={!js || find ? "dq" : undefined}
            value={find}
            onChange={(event) => {
              setFind(event.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={keyDown}
            placeholder={R.whereAwayPlaceholder}
            aria-label={R.whereAwayFind}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={listOpen}
            aria-controls={listId}
            aria-activedescendant={listOpen && shown[active] ? optionId(shown[active].code) : undefined}
            autoComplete="off"
            spellCheck={false}
            data-testid="around-find"
          />
          {find ? (
            <button
              type="button"
              className="ex-search__btn"
              aria-label={R.whereAwayClear}
              onClick={() => {
                setFind("");
                setActive(-1);
              }}
              data-testid="around-find-clear"
            >
              <Icon name="close" size={16} />
            </button>
          ) : null}
        </div>
        <div className="ex-away__ddl" hidden={!listOpen} data-testid="around-results">
          <div id={listId} role="listbox" aria-label={R.whereAwayList} className="ex-away__list">
            {shown.map((d, i) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: le clavier passe par le champ (flèches, Entrée, Échap)
              <div
                key={d.code}
                id={optionId(d.code)}
                role="option"
                tabIndex={-1}
                aria-selected={i === active}
                aria-label={departmentLabel(d)}
                className="ex-away__opt"
                data-active={i === active || undefined}
                data-chosen={value === d.code || undefined}
                // Avant la perte du focus du champ : sinon la liste se ferme avant le clic.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(d.code)}
                data-testid={`around-result-${d.code}`}
              >
                <b className="ex-away__num">{d.code}</b>
                <span className="ex-away__name">{d.name}</span>
                {value === d.code ? <Icon name="check" size={16} /> : null}
              </div>
            ))}
          </div>
          {matches.length > shown.length ? (
            <p className="ex-away__more">{R.whereAwayMore(matches.length - shown.length)}</p>
          ) : null}
          {typed && matches.length === 0 ? (
            <p className="ex-away__more" data-testid="around-none">
              {R.whereAwayNone(typed)}
            </p>
          ) : null}
        </div>
      </div>
      {recent.length ? (
        <div className="ex-away__recent" data-testid="around-recent">
          <span className="o-t-label s-muted">{R.whereAwayRecent}</span>
          <div className="ex-group__chips">
            {recent.map((code) => (
              <button
                key={code}
                type="button"
                className="ex-away__chip"
                aria-pressed={value === code}
                aria-label={`${R.whereAwayRecent} : ${departmentLabel({ code, name: nameOf(code) })}`}
                onClick={() => choose(code)}
                data-testid={`around-recent-${code}`}
              >
                <span className="o-t-meta">{departmentLabel({ code, name: nameOf(code) })}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="ex-away__map" data-testid="around-map">
        <FranceMap land selected={value ? [value] : []} favorite={null} onToggle={choose} dashed={coin} />
      </div>
      <p className="o-france__credit o-t-credit ex-away__credit" data-testid="france-credit">
        {credit},{" "}
        <a href={franceMapLicenseUrl} target="_blank" rel="noreferrer">
          {licence}
        </a>
        {` · ${R.whereAwayOverseas}`}
      </p>
    </div>
  );
}

/**
 * « Où chercher ? » (maquette R2.2) : le lieu, commun aux Événements et aux Pros (`people` : Personnes et crews, des
 * départements seulement, jamais de position ni de distance). Autour de moi : le curseur (10 à 200 km) et le temps de
 * route indicatif ; la position est lue au clic sur le bouton, ramenée au dixième de degré, mise dans l'adresse de cette
 * recherche seulement et jamais enregistrée.
 */
export function WhereForm({
  field,
  hidden,
  mode: mode0,
  km: km0,
  dept: dept0,
  coin,
  hasPosition,
  position = null,
  seeLabel,
  people = false,
  recent = [],
}: {
  /** Le nom du réglage dans l'adresse : `autour` (événements, pros) ou `lieu` (personnes et crews). */
  field: "autour" | "lieu";
  hidden: readonly (readonly [string, string])[];
  mode: Mode;
  km: number;
  dept: string;
  coin: readonly string[];
  /** La position de l'appareil est déjà dans l'adresse. */
  hasPosition: boolean;
  /** La position déjà dans l'adresse (arrondie) : elle repart avec le formulaire quand on change seulement le rayon. */
  position?: { lat: string; lng: string } | null;
  seeLabel: string;
  people?: boolean;
  /** Lot R4d : les 3 derniers départements choisis par « Ailleurs » (cookie de l'Explorer, par compte). */
  recent?: readonly string[];
}) {
  const [mode, setMode] = useState<Mode>(mode0);
  const [dept, setDept] = useState(dept0);
  const [km, setKm] = useState(km0);
  const [denied, setDenied] = useState(false);
  const [reading, setReading] = useState(false);
  const coinText = coin.join(", ");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    if (mode !== "moi" || hasPosition) return;
    const form = event.currentTarget;
    event.preventDefault();
    if (!("geolocation" in navigator)) {
      setDenied(true);
      return;
    }
    setReading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { lat, lng } = coarsePosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        for (const [name, value] of [
          ["lat", lat],
          ["lng", lng],
        ] as const) {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = name;
          input.value = String(value);
          form.appendChild(input);
        }
        form.submit();
      },
      () => {
        setReading(false);
        setDenied(true);
      },
      { maximumAge: 300_000, timeout: 10_000 },
    );
  }

  const option = (id: Mode, icon: IconName, title: string, hint: string, testId: string, disabled = false) => (
    <label className="ex-opt ex-opt--radio" data-testid={testId} data-disabled={disabled || undefined}>
      <input
        type="radio"
        name={field}
        value={id}
        checked={mode === id}
        disabled={disabled}
        onChange={() => {
          setMode(id);
          setDenied(false);
        }}
      />
      <span className="ex-opt__icon" aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
      <span className="ex-opt__main">
        <span className="ex-opt__title">{title}</span>
        <span className="ex-opt__hint">{hint}</span>
      </span>
      <span className="ex-opt__dot" aria-hidden="true" />
    </label>
  );

  return (
    <form method="get" action="/app/explorer" className="ex-where" onSubmit={submit} data-testid="around-sheet">
      <Hidden entries={hidden} />
      {!people && mode === "moi" && hasPosition && position ? (
        <>
          <input type="hidden" name="lat" value={position.lat} />
          <input type="hidden" name="lng" value={position.lng} />
        </>
      ) : null}
      {people ? <p className="o-t-caption s-muted">{R.wherePeopleHint}</p> : null}
      {people ? null : option("moi", "place", R.whereMe, denied ? R.whereMeDenied : R.whereMeHint, "around-me")}
      {!people && mode === "moi" ? (
        <div className="ex-km">
          <div className="ex-km__top">
            <span className="o-t-label">Distance</span>
            <span className="ex-km__value" data-testid="where-km">
              {km} {R.km}
            </span>
          </div>
          <input
            type="range"
            name="rayon"
            min={WHERE_KM.min}
            max={WHERE_KM.max}
            step={WHERE_KM.step}
            value={km}
            onChange={(event) => setKm(Number(event.target.value))}
            aria-label="Distance"
            aria-valuetext={`${km} ${R.km}`}
            data-testid="where-range"
          />
          <p className="o-t-caption s-muted" data-testid="where-road">
            {roadTime(km)}
          </p>
        </div>
      ) : null}
      {option("coin", "home", R.whereMine, R.whereMineHint(coinText), "around-mine", coin.length === 0)}
      {option(
        "ailleurs",
        "map",
        R.whereAway,
        dept ? R.whereAwayChosen(R.pillDept(nameOf(dept), dept)) : R.whereAwayHint,
        "around-elsewhere",
      )}
      {/* Toujours rendu (sans JavaScript aussi) ; montré seulement quand « Ailleurs » est coché (CSS). */}
      <AwayField
        value={dept}
        on={mode === "ailleurs"}
        onPick={(code) => {
          setDept(code);
          setMode("ailleurs");
        }}
        recent={recent}
        coin={coin}
      />
      {option("partout", "explore", R.whereAll, R.whereAllHint, "around-all")}
      <p className="o-t-caption s-muted">{R.whereKeep}</p>
      <Button
        type="submit"
        icon="check"
        fullWidth
        loading={reading}
        disabled={mode === "ailleurs" && !dept}
        data-testid="where-apply"
      >
        {seeLabel}
      </Button>
    </form>
  );
}

/** « Pyrénées-Orientales (66) ». */
export function deptLong(code: string): string {
  const name = departmentChoices.find((d) => d.code === code)?.name ?? code;
  return R.pillDept(name, code);
}
