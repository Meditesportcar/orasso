// Styles d'un véhicule sur le site (lot R5a, maquette R5.2, mêmes règles et mêmes mots que l'appli) : les styles du
// type rangés par famille (Époque, Genre, Préparation, Pratique) avec l'icône du catalogue, grisés avec leur raison ;
// un style en pause de la fiche reste affiché « en pause ». Et « Il manque un style ? Propose-le » : un nom, le type ;
// en modification, le véhicule part avec la proposition ; à l'ajout, la proposition lui est rattachée à sa création
// (champ caché `styleProposalIds`).
import { Button, Icon, type IconName, TextField } from "@orasso/design-system/web";
import {
  type CategoryFamily,
  type CategoryOption,
  type CategoryProposalResult,
  type CategoryRef,
  categoryFamilyLabels,
  cleanStyleName,
  groupByFamily,
  styleLabels as S,
  STYLE_NAME_MAX,
  type VehicleType,
  vehicleTypeLabels,
} from "@orasso/shared";
import { useState } from "react";

import { apiFetch } from "../lib/api.client";

type Item = {
  id: string;
  label: string;
  icon: string | undefined;
  family: CategoryFamily;
  eligible: boolean;
  reason: string | null;
  paused: boolean;
};

/** Les styles montrés (`visible` : ceux du type et des marques admises), plus les styles en pause de la fiche. */
export function styleItems(visible: readonly CategoryOption[], paused: readonly CategoryRef[] = []): Item[] {
  return [
    ...visible.map((c) => ({
      id: c.id,
      label: c.label,
      icon: c.icon,
      family: c.family ?? "genre",
      eligible: c.eligible,
      reason: c.reason,
      paused: false,
    })),
    ...paused
      .filter((p) => !visible.some((c) => c.id === p.id))
      .map((p) => ({
        id: p.id,
        label: p.label,
        icon: p.icon,
        family: p.family ?? "genre",
        eligible: true,
        reason: null,
        paused: true,
      })),
  ];
}

export function StylePicker({
  items,
  chosen,
  onToggle,
}: {
  items: readonly Item[];
  chosen: readonly string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="s-stack" data-testid="categories">
      {groupByFamily(items).map((g) => (
        <fieldset key={g.family} className="g-pills" data-testid={`family-${g.family}`}>
          <legend className="o-field__label o-t-label">
            {categoryFamilyLabels[g.family]}
            {g.family === "genre" ? <small className="g-fam-hint"> · {S.manyHint}</small> : null}
          </legend>
          {g.rows.map((c) => {
            const on = c.eligible && chosen.includes(c.id);
            return (
              <label
                key={c.id}
                className={!c.eligible ? "g-opt g-pill is-off" : on ? "g-opt g-pill is-on" : "g-opt g-pill"}
                title={c.paused ? S.pausedHint : c.eligible ? undefined : (c.reason ?? undefined)}
              >
                <input
                  type="checkbox"
                  name="categoryIds"
                  value={c.id}
                  checked={on}
                  disabled={!c.eligible}
                  data-testid={c.paused ? "add-style-paused" : c.eligible ? "add-style" : "add-style-off"}
                  onChange={() => onToggle(c.id)}
                />
                <Icon name={(c.icon ?? "star") as IconName} size={16} />
                <span className="o-t-body">{c.paused ? `${c.label} · ${S.paused}` : c.label}</span>
              </label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

/** « Il manque un style ? Propose-le » (`.r5prop`), puis le formulaire « Proposer un style ». */
export function StyleProposal({
  vehicleType,
  vehicleId,
  vehicleName,
  onSent,
}: {
  vehicleType: VehicleType;
  vehicleId?: string;
  vehicleName: string | null;
  onSent?: (result: CategoryProposalResult) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  async function send() {
    const label = cleanStyleName(name);
    if (!label) {
      setError(S.nameIssue);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await apiFetch<CategoryProposalResult>("/categories/proposals", {
      method: "POST",
      json: { label, vehicleType, ...(vehicleId ? { vehicleId } : {}) },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setName("");
    setSent(S.toast(res.data.label));
    onSent?.(res.data);
  }
  return (
    <details className="g-propose" data-testid="style-propose">
      <summary className="g-propose__row">
        <Icon name="add" size={20} />
        <span className="s-stack s-stack--tight g-propose__text">
          <span className="o-t-body-strong">{S.proposeTitle}</span>
          <span className="o-t-caption">{S.proposeText}</span>
        </span>
        <Icon name="next" size={16} />
      </summary>
      <div className="s-stack g-propose__form">
        <h3 className="s-h3">{S.sheetTitle}</h3>
        <TextField
          label={S.nameField}
          value={name}
          onChange={(e) => setName(e.currentTarget.value.slice(0, STYLE_NAME_MAX))}
          maxLength={STYLE_NAME_MAX}
          data-testid="style-propose-name"
          // Entrée dans ce champ : la proposition part, pas le formulaire du véhicule.
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void send();
            }
          }}
        />
        <p className="o-t-caption">
          {S.forType} <strong>{vehicleTypeLabels[vehicleType]}</strong> {S.familyByTeam}
        </p>
        <p className="o-t-caption s-muted">{S.sheetNote(vehicleName, vehicleType)}</p>
        {error ? (
          <p className="s-error" role="alert" data-testid="style-propose-error">
            {error}
          </p>
        ) : null}
        {sent ? (
          <p className="s-notice s-notice--ok" role="status" data-testid="style-propose-done">
            {sent}
          </p>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          icon="send"
          loading={busy}
          onClick={() => void send()}
          data-testid="style-propose-send"
        >
          {S.send}
        </Button>
      </div>
    </details>
  );
}
