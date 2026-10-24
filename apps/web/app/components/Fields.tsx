// Deux champs du site qui complètent le système de design : zone de texte et envoi de fichier, avec la même
// étiquette, la même aide et le même message d'erreur que `TextField` (classes `o-field*` du système de design).
import { CheckboxField } from "@orasso/design-system/web";
import { expressLabels } from "@orasso/shared";
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { useId } from "react";

type Shell = { label: string; help?: ReactNode; error?: ReactNode };

export function TextAreaField({
  label,
  help,
  error,
  id: idProp,
  ...area
}: Shell & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <div className={error ? "o-field has-error" : "o-field"}>
      <label className="o-field__label o-t-label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="s-textarea o-t-body"
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : help ? `${id}-help` : undefined}
        {...area}
      />
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

export function FileField({
  label,
  help,
  error,
  id: idProp,
  ...input
}: Shell & Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type">) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <div className={error ? "o-field has-error" : "o-field"}>
      <label className="o-field__label o-t-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} type="file" className="s-file o-t-body" aria-invalid={error ? true : undefined} {...input} />
      {help && !error && <span className="o-field__help o-t-caption">{help}</span>}
      {error && (
        <span className="o-field__error o-t-caption" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/** L'ordre des champs de l'inscription du site et des invitations (profil, coin, identité, compte). */
export const signupFieldOrder = [
  "mainProfile",
  "departments",
  "pseudo",
  "firstName",
  "lastName",
  "email",
  "password",
  "terms",
] as const;

/**
 * Lot R3d (retour réel du 24/10) : sous le bouton d'envoi d'une inscription refusée, une ligne redit la première chose
 * qui manque, dans l'ordre du formulaire (sur téléphone, le champ en cause est souvent plus haut, hors de l'écran).
 */
export function FirstMissing({
  errors,
  order,
}: {
  errors: Partial<Record<string, string | undefined>>;
  order: readonly string[];
}) {
  const first = order.map((key) => errors[key]).find(Boolean);
  if (!first) return null;
  return (
    <p className="o-t-caption s-muted s-center" role="status" data-testid="signup-missing">
      {first}
    </p>
  );
}

/**
 * Lot 36 : case « conditions générales », obligatoire et tracée, la même pour l'inscription, les invitations et
 * l'inscription express. Le serveur refuse sans elle (message sous la case).
 */
export function TermsField({ error, defaultChecked }: { error?: string; defaultChecked?: boolean }) {
  return (
    <div className="s-stack s-stack--tight" data-testid="terms-field">
      <CheckboxField name="terms" label={expressLabels.terms} defaultChecked={defaultChecked} />
      <p className="o-t-caption s-muted">
        <a href="/conditions" target="_blank" rel="noopener">
          {expressLabels.termsLink}
        </a>
      </p>
      {error ? (
        <p className="s-error" role="alert" data-testid="terms-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
