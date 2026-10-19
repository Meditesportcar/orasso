// Inscription ordinaire du site (lot 41) : les trois blocs du flux d'arrivée de l'appli, dans le même formulaire — le profil
// (six tuiles), les départements (carte de France, crédit CC BY 4.0, liste des 101 départements) et le prénom et le nom
// (obligatoires, privés). Tout est de vrais champs de formulaire : l'inscription marche sans JavaScript (tuiles = boutons
// radio, liste = cases à cocher). Avec JavaScript, la carte et la liste se suivent et gardent l'ordre du choix
// (`departmentOrder`) : le premier département est le favori.
import { Chip, DepartmentChecklist, FranceMap, FranceMapCredit, Icon, TextField } from "@orasso/design-system/web";
import {
  arriveeLabels,
  departmentFirstTag,
  departmentHint,
  departmentWhy,
  MAX_DEPARTMENTS,
  type MainProfile,
  mainProfiles,
  mainProfileTiles,
  namePrivacy,
} from "@orasso/shared";
import { type ReactNode, useState } from "react";
import "../styles/arrivee.css";

export type ArriveeValues = { mainProfile?: string; departments?: string[]; firstName?: string; lastName?: string };
export type ArriveeErrors = { mainProfile?: string; departments?: string; firstName?: string; lastName?: string };

const tileIcon = {
  exhibitor: "vehicle",
  visitor: "eye",
  pro: "plate",
  organizer: "flag",
  provider: "briefcase",
  media: "press",
} as const;

export function ArriveeFields({
  values,
  errors,
  children,
}: {
  values?: ArriveeValues;
  errors?: ArriveeErrors;
  /** Le champ pseudo, en tête du bloc « Qui es-tu ? » (avant le prénom et le nom). */
  children?: ReactNode;
}) {
  const initial = (mainProfiles as readonly string[]).includes(values?.mainProfile ?? "")
    ? (values?.mainProfile as MainProfile)
    : "exhibitor";
  const [profile, setProfile] = useState<MainProfile>(initial);
  const [departments, setDepartments] = useState<string[]>(values?.departments ?? []);
  const [limit, setLimit] = useState(false);
  const toggle = (code: string) => {
    if (!departments.includes(code) && departments.length >= MAX_DEPARTMENTS) {
      setLimit(true);
      return;
    }
    setLimit(false);
    setDepartments((list) => (list.includes(code) ? list.filter((c) => c !== code) : [...list, code]));
  };
  const [first, ...others] = departments;

  return (
    <>
      <fieldset className="s-stack s-stack--tight" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="o-t-poster-m">{arriveeLabels.profile.title}</legend>
        <p className="o-t-caption s-muted">{arriveeLabels.profile.text}</p>
        <div className="arr-profile">
          {mainProfiles.map((p) => (
            <label key={p} className="arr-tile" data-testid={`profile-${p}`}>
              <input
                type="radio"
                name="mainProfile"
                value={p}
                className="arr-tile__input"
                checked={profile === p}
                onChange={() => setProfile(p)}
              />
              <span className="arr-tile__tick">
                <Icon name="check" size={12} strokeWidth={2.4} />
              </span>
              <Icon name={tileIcon[p]} size={26} strokeWidth={1.8} />
              <b className="o-t-body-strong">{mainProfileTiles[p].title}</b>
              <span className="o-t-caption arr-tile__sub">{mainProfileTiles[p].subtitle}</span>
            </label>
          ))}
        </div>
        {errors?.mainProfile ? (
          <p className="s-error" role="alert">
            {errors.mainProfile}
          </p>
        ) : null}
      </fieldset>

      <section className="arr-dept" aria-labelledby="arr-dept-title">
        <h2 id="arr-dept-title" className="o-t-poster-m">
          {arriveeLabels.department.title}
        </h2>
        <p className="o-t-caption s-muted" data-testid="dept-why">
          {departmentWhy[profile]}
        </p>
        <div className="arr-dept__map">
          <FranceMap selected={departments} favorite={first ?? null} onToggle={toggle} />
          <FranceMapCredit />
        </div>
        <div className="arr-dept__chips" aria-live="polite" data-testid="dept-summary">
          {first ? (
            <>
              <Chip variant="accent" selected>{`${first} · ${departmentFirstTag[profile]}`}</Chip>
              {others.length > 0 ? <Chip>{`+${others.length}`}</Chip> : null}
            </>
          ) : (
            <span className="o-t-caption s-muted">{arriveeLabels.department.empty}</span>
          )}
        </div>
        <DepartmentChecklist selected={departments} onToggle={toggle} summary={arriveeLabels.list.open} />
        <p
          className="o-t-caption s-muted"
          data-testid="dept-hint"
        >{`${departmentHint[profile]} ${arriveeLabels.department.hint}`}</p>
        {limit ? (
          <p className="s-error" role="alert" data-testid="dept-limit">
            {arriveeLabels.errors.tooMany}
          </p>
        ) : null}
        {errors?.departments ? (
          <p className="s-error" role="alert">
            {errors.departments}
          </p>
        ) : null}
      </section>

      <section className="s-stack s-stack--tight" aria-labelledby="arr-name-title">
        <h2 id="arr-name-title" className="o-t-poster-m">
          {arriveeLabels.identity.title}
        </h2>
        <p className="o-t-caption s-muted">{arriveeLabels.identity.text}</p>
        {children}
        <div className="arr-names">
          <TextField
            label={arriveeLabels.identity.firstName}
            name="firstName"
            autoComplete="given-name"
            defaultValue={values?.firstName}
            error={errors?.firstName}
            maxLength={60}
            required
          />
          <TextField
            label={arriveeLabels.identity.lastName}
            name="lastName"
            autoComplete="family-name"
            defaultValue={values?.lastName}
            error={errors?.lastName}
            maxLength={60}
            required
          />
        </div>
        <div className="arr-privacy" data-testid="name-privacy">
          <Icon name="profile" size={20} />
          <p className="o-t-caption">
            <b>{arriveeLabels.identity.privacyTitle}</b> {arriveeLabels.identity.privacyShared} {namePrivacy[profile]}{" "}
            {arriveeLabels.identity.privacyEnd}
          </p>
        </div>
      </section>
    </>
  );
}

const parseDepartments = (text: string) => [
  ...new Set(
    text
      .split(/[\s,;]+/)
      .map((d) => d.trim().toUpperCase())
      .filter(Boolean),
  ),
];

/**
 * Mon secteur (/app/moi) : la carte de France et le champ de numéros restent synchronisés (l'outre-mer, absent de la
 * carte, se saisit par son numéro). Le premier département est le favori.
 */
export function DepartmentsField({ initial }: { initial: string[] }) {
  const [text, setText] = useState(initial.join(", "));
  const [limit, setLimit] = useState(false);
  const list = parseDepartments(text);
  const toggle = (code: string) => {
    const current = parseDepartments(text);
    if (!current.includes(code) && current.length >= MAX_DEPARTMENTS) {
      setLimit(true);
      return;
    }
    setLimit(false);
    setText((current.includes(code) ? current.filter((c) => c !== code) : [...current, code]).join(", "));
  };
  return (
    <div className="arr-dept">
      <div className="arr-dept__map">
        <FranceMap selected={list} favorite={list[0] ?? null} onToggle={toggle} />
        <FranceMapCredit />
      </div>
      <DepartmentChecklist selected={list} onToggle={toggle} name="departmentBox" summary={arriveeLabels.list.open} />
      {limit ? (
        <p className="s-error" role="alert">
          {arriveeLabels.errors.tooMany}
        </p>
      ) : null}
      <TextField
        label="Départements"
        name="departments"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        help="Touche la carte, choisis dans la liste ou saisis les numéros séparés par des virgules (ex. 66, 11, 974). Le premier sert à mesurer la distance."
      />
    </div>
  );
}
