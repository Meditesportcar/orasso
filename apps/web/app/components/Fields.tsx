// Deux champs du site qui complètent le système de design : zone de texte et envoi de fichier, avec la même
// étiquette, la même aide et le même message d'erreur que `TextField` (classes `o-field*` du système de design).
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
