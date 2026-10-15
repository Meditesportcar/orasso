import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useId, useState } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";

type FieldShellProps = {
  label: string;
  /** Aide sous le champ (`caption`). */
  help?: ReactNode;
  /** Message d'erreur : sous le champ, jamais une icône seule. */
  error?: ReactNode;
  /** Champ de 56 px (inscription express sur place) au lieu de 48 px. */
  tall?: boolean;
  className?: string;
};

function Shell({
  id,
  label,
  help,
  error,
  className,
  children,
}: Pick<FieldShellProps, "label" | "help" | "error" | "className"> & { id: string; children: ReactNode }) {
  return (
    <div className={cx("o-field", error && "has-error", className)}>
      <label className="o-field__label o-t-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {help && !error && (
        <span className="o-field__help o-t-caption" id={`${id}-help`}>
          {help}
        </span>
      )}
      {error && (
        <span className="o-field__error o-t-caption" id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

const describedBy = (id: string, help: ReactNode, error: ReactNode) =>
  error ? `${id}-error` : help ? `${id}-help` : undefined;

export type TextFieldProps = FieldShellProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "id"> & {
    id?: string;
    /** Mot de passe : l'œil pour afficher ou masquer la saisie. */
    revealable?: boolean;
  };

/** Champ de saisie : étiquette étroite au-dessus, champ de 48 px, aide en dessous. */
export function TextField({
  label,
  help,
  error,
  tall,
  className,
  id: idProp,
  revealable,
  type = "text",
  ...input
}: TextFieldProps) {
  const auto = useId();
  const id = idProp ?? auto;
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  return (
    <Shell id={id} label={label} help={help} error={error} className={className}>
      <div className="o-field__control">
        <input
          id={id}
          className={cx("o-field__input o-t-body", tall && "is-tall", isPassword && revealable && "has-toggle")}
          type={isPassword && revealed ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, help, error)}
          {...input}
        />
        {isPassword && revealable && (
          <button
            type="button"
            className="o-field__reveal"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            aria-pressed={revealed}
          >
            <Icon name={revealed ? "eyeOff" : "eye"} size={20} />
          </button>
        )}
      </div>
    </Shell>
  );
}

export type SelectOption = { value: string; label: string };

export type SelectFieldProps = FieldShellProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "id" | "children"> & {
    id?: string;
    /** Sélection fermée (marque, modèle, génération, catégories) : « Autre » toujours en dernier, aucune saisie libre. */
    options: readonly SelectOption[];
    placeholder?: string;
  };

/** Sélection fermée : même forme que le champ de saisie. L'option « Autre » est toujours la dernière. */
export function SelectField({
  label,
  help,
  error,
  tall,
  className,
  id: idProp,
  options,
  placeholder,
  ...select
}: SelectFieldProps) {
  const auto = useId();
  const id = idProp ?? auto;
  const ordered = [...options].sort((a, b) => Number(a.label === "Autre") - Number(b.label === "Autre"));
  return (
    <Shell id={id} label={label} help={help} error={error} className={className}>
      <div className="o-field__control">
        <select
          id={id}
          className={cx("o-field__input o-field__select o-t-body", tall && "is-tall")}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, help, error)}
          {...select}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {ordered.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </Shell>
  );
}

export type CheckboxFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type" | "children"> & {
  /** La phrase complète à côté de la case (« Suivre MéditeSportCar — … »), pas un libellé d'un mot. */
  label: ReactNode;
  className?: string;
};

/** Case à cocher : 24 px, `radius-sm`, cochée en moutarde. La zone cliquable est toute la ligne. */
export function CheckboxField({ label, className, ...input }: CheckboxFieldProps) {
  return (
    <label className={cx("o-check", className)}>
      <input type="checkbox" className="o-check__input" {...input} />
      <span className="o-check__box" aria-hidden="true">
        <Icon name="check" size={16} strokeWidth={3} />
      </span>
      <span className="o-check__label o-t-body">{label}</span>
    </label>
  );
}
