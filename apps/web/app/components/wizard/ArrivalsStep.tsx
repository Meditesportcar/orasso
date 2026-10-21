// Temps 3 (`s-create` data-cs 2) : « Les arrivées » — un créneau exposants, un créneau public (strict ou recommandé),
// ce que voit l'exposant ; volet « Public » : entrée du public, paiement, billetterie visiteurs, contrôle des billets.
import { Button, CheckboxField, Chip, ChipRow, Icon, type IconName, TextField } from "@orasso/design-system/web";
import {
  arrivalTexts as A,
  type ArrivalSlot,
  arrivalLabel,
  defaultArrivalSlot,
  eventEditorLabels as E,
  eventPublicAccessLabels,
  ON_SITE_PAYMENT_LABEL,
  shopLabels,
  wizardV2Labels as W,
  withArrivalSlot,
} from "@orasso/shared";
import type { StepProps } from "./types";

function SlotCard({
  which,
  title,
  icon,
  slot,
  onChange,
}: {
  which: "exhibitors" | "public";
  title: string;
  icon: IconName;
  slot: ArrivalSlot | null;
  onChange: (slot: ArrivalSlot | null) => void;
}) {
  return (
    <div className="wz-box s-stack s-stack--tight" data-testid={`arrival-${which}`}>
      <h3 className="wz-h3">
        <Icon name={icon} />
        {title}
      </h3>
      {slot ? (
        <>
          <div className="wz-timepair">
            <TextField
              label={A.from}
              name={`${which}-from`}
              type="time"
              value={slot.from}
              onChange={(e) => onChange({ ...slot, from: e.currentTarget.value })}
            />
            <Icon name="next" />
            <TextField
              label={A.to}
              name={`${which}-to`}
              type="time"
              value={slot.to ?? ""}
              onChange={(e) => onChange({ ...slot, to: e.currentTarget.value || null })}
            />
          </div>
          <ChipRow aria-label={title}>
            <Chip selected={slot.strict} onClick={() => onChange({ ...slot, strict: true })}>
              {A.strict}
            </Chip>
            <Chip selected={!slot.strict} onClick={() => onChange({ ...slot, strict: false })}>
              {A.advised}
            </Chip>
          </ChipRow>
          <p className="o-t-caption s-muted">{slot.strict ? A.strictHint : W.advisedHint}</p>
          <div>
            <Button variant="secondary" icon="close" onClick={() => onChange(null)}>
              {W.arrivalsNone}
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button
            variant="secondary"
            icon="add"
            onClick={() => onChange(defaultArrivalSlot(which))}
            data-testid={`arrival-${which}-set`}
          >
            {W.arrivalsSet}
          </Button>
        </div>
      )}
    </div>
  );
}

export function ArrivalsStep({ d, set, setD }: StepProps) {
  const ex = d.arrivals?.exhibitors ?? null;
  const ticketing = d.publicAccess === "free_reservation" || d.publicAccess === "paid_orasso";
  return (
    <>
      <SlotCard
        which="exhibitors"
        title={A.exhibitors}
        icon="vehicle"
        slot={ex}
        onChange={(slot) => setD((p) => withArrivalSlot(p, "exhibitors", slot))}
      />
      <SlotCard
        which="public"
        title={A.public}
        icon="profile"
        slot={d.arrivals?.public ?? null}
        onChange={(slot) => setD((p) => withArrivalSlot(p, "public", slot))}
      />
      <div className="wz-preview" data-testid="wizard-exhibitor-sees">
        <span className="o-t-label s-label">{W.exhibitorSees}</span>
        {ex ? (
          <span>
            <b>{arrivalLabel(ex)}.</b> {W.exhibitorSeesBody}
          </span>
        ) : (
          <span>{W.exhibitorSeesNone}</span>
        )}
      </div>

      <details className="wz-panel" data-testid="wizard-panel-public">
        <summary>
          <Icon name="ticket" />
          <span>
            <b>{W.publicPanel}</b>
            <span className="o-t-caption s-muted">{W.publicPanelHint}</span>
          </span>
        </summary>
        <div className="s-stack">
          <fieldset className="s-fieldset s-stack s-stack--tight">
            <legend className="o-t-label s-label">{E.publicTitle}</legend>
            <ChipRow className="s-chips-wrap">
              {(["free", "free_reservation", "paid_orasso", "paid_external", "closed"] as const).map((p) => (
                <Chip key={p} selected={d.publicAccess === p} onClick={() => set("publicAccess", p)}>
                  {eventPublicAccessLabels[p]}
                </Chip>
              ))}
            </ChipRow>
          </fieldset>
          {d.publicAccess === "paid_external" && (
            <>
              <fieldset className="s-fieldset s-stack s-stack--tight">
                <legend className="o-t-label s-label">{E.paymentTitle}</legend>
                <ChipRow className="s-chips-wrap">
                  <Chip selected={d.paymentMode === "link"} onClick={() => set("paymentMode", "link")}>
                    {E.paymentLink}
                  </Chip>
                  <Chip selected={d.paymentMode === "on_site"} onClick={() => set("paymentMode", "on_site")}>
                    {E.paymentOnSite}
                  </Chip>
                </ChipRow>
              </fieldset>
              {d.paymentMode === "link" ? (
                <TextField
                  label={E.ticketUrl}
                  name="externalTicketUrl"
                  inputMode="url"
                  value={d.externalTicketUrl}
                  onChange={(e) => set("externalTicketUrl", e.currentTarget.value)}
                  placeholder="https://"
                />
              ) : (
                <p className="s-muted" data-testid="on-site-hint">
                  {E.onSiteHint(ON_SITE_PAYMENT_LABEL)}
                </p>
              )}
            </>
          )}
          {ticketing && (
            <div className="s-stack s-stack--tight" data-testid="ticketing-hint">
              <span className="o-t-label s-label">{W.ticketsTitle}</span>
              <p className="s-muted">
                {d.publicAccess === "free_reservation" ? E.freeReservationHint : E.paidOrassoHint}
                {E.ticketingLater(d.publicAccess === "paid_orasso")}
              </p>
            </div>
          )}
          <fieldset className="s-fieldset s-stack s-stack--tight" data-testid="shop-setting">
            <legend className="o-t-label s-label">{E.staffTitle}</legend>
            <CheckboxField
              label={shopLabels.wizardCheckbox}
              checked={d.shopEnabled}
              onChange={() => set("shopEnabled", !d.shopEnabled)}
            />
            <p className="s-muted">{shopLabels.wizardHint}</p>
          </fieldset>
        </div>
      </details>
    </>
  );
}
