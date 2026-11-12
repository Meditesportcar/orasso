// Le bloc « Étiquette · facultatif » de « Publier », sur le site (lot R9c, maquette R9.2b `n-publier`) : « Aucune | Offre », puis, pour
// « Offre », le titre, la ligne des dates (« Du 10 nov. au 30 nov. · dates de l'offre » avec « modifier »), deux champs de date
// (début facultatif, fin obligatoire) et une phrase d'aide. Seulement pour la casquette fiche pro et une publication. Les règles
// sont celles de `rules/proOffers.ts` ; l'API les revérifie. Mêmes mots que l'appli.
import { Button, Icon } from "@orasso/design-system/web";
import { OFFER_TITLE_MAX, type OfferForm, offerEditorLabel, proOffersLabels as T } from "@orasso/shared";
import { useState } from "react";

import "../../styles/fil.css";
import "../../styles/pro-offers.css";

export function OfferBlock({
  value,
  onChange,
  disabled,
}: {
  value: OfferForm;
  onChange: (next: OfferForm) => void;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const patch = (p: Partial<OfferForm>) => onChange({ ...value, ...p });
  return (
    <section className="s-stack s-stack--tight" data-testid="fil-publish-offer">
      <div className="o-t-label">{T.tagTitle}</div>
      <div className="fil-filters" role="tablist" aria-label={T.tagGroup} data-testid="fil-publish-offer-seg">
        <button
          type="button"
          role="tab"
          aria-selected={!value.on}
          className={value.on ? undefined : "is-on"}
          disabled={disabled}
          onClick={() => patch({ on: false })}
          data-testid="fil-publish-offer-none"
        >
          {T.tagNone}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={value.on}
          className={value.on ? "is-on" : undefined}
          disabled={disabled}
          onClick={() => patch({ on: true })}
          data-testid="fil-publish-offer-on"
        >
          <Icon name="ticket" size={14} /> {T.tagOffer}
        </button>
      </div>
      {value.on ? (
        <div className="po-form">
          <label className="s-field">
            <span className="o-t-label">{T.titleLabel}</span>
            <input
              type="text"
              value={value.title}
              maxLength={OFFER_TITLE_MAX}
              placeholder={T.titlePlaceholder}
              disabled={disabled}
              onChange={(e) => patch({ title: e.currentTarget.value })}
              data-testid="fil-publish-offer-title"
            />
          </label>
          <div className="po-form__dates">
            <Icon name="calendar" size={18} />
            <span data-testid="fil-publish-offer-dates">
              <b>{offerEditorLabel(value)}</b> · {T.datesSuffix}
            </span>
            <button
              type="button"
              className="po-form__edit"
              disabled={disabled}
              aria-expanded={editing}
              onClick={() => setEditing((e) => !e)}
              data-testid="fil-publish-offer-edit"
            >
              {T.datesEdit}
            </button>
          </div>
          {editing ? (
            <div className="po-form__grid">
              <label className="s-field">
                <span className="o-t-label">{T.startLabel}</span>
                <input
                  type="date"
                  value={value.startsOn}
                  disabled={disabled}
                  onChange={(e) => patch({ startsOn: e.currentTarget.value })}
                  data-testid="fil-publish-offer-start"
                />
              </label>
              <label className="s-field">
                <span className="o-t-label">{T.endLabel}</span>
                <input
                  type="date"
                  value={value.endsOn}
                  min={value.startsOn || undefined}
                  disabled={disabled}
                  onChange={(e) => patch({ endsOn: e.currentTarget.value })}
                  data-testid="fil-publish-offer-end"
                />
              </label>
              {value.startsOn ? (
                <Button
                  type="button"
                  variant="secondary"
                  icon="close"
                  disabled={disabled}
                  onClick={() => patch({ startsOn: "" })}
                  data-testid="fil-publish-offer-start-clear"
                >
                  {T.startClear}
                </Button>
              ) : null}
            </div>
          ) : null}
          <p className="fp-note" data-testid="fil-publish-offer-help">
            <Icon name="info" size={16} />
            <span>{T.help}</span>
          </p>
        </div>
      ) : null}
    </section>
  );
}
