// Temps 2 (`s-create` data-cs 1) : « Où ça se passe ? » — adresse obligatoire, recherche (`GET /geocode`), carte
// stylée avec épingle déplaçable, précision pour l'entrée ; volet « Sur place » : zones, prestataires attendus, missions
// (`event_needs`, enregistrées avec le brouillon).
import { Button, CheckboxField, Icon, SelectField, TextField } from "@orasso/design-system/web";
import {
  eventEditorLabels as E,
  type NeedDraft,
  providerPowerLabels,
  providerPowers,
  providerSelectableTypes,
  vendorTypeLabels,
  wizardV2Labels as W,
} from "@orasso/shared";
import { useState } from "react";
import { apiFetch } from "../../lib/api.client";
import { EventMap } from "../EventMap";
import { type StepProps, toggle } from "./types";

type Match = { lat: number; lng: number; label: string; postalCode: string | null; city: string | null };

const newNeed = (): NeedDraft => ({
  trade: "food_truck",
  quantity: "1",
  power: "none",
  water: false,
  frontageM: "",
  installTime: "",
});

export function PlaceStep({ d, set, setD, vendorSuggestions }: StepProps & { vendorSuggestions: readonly string[] }) {
  const [match, setMatch] = useState<Match | null | "none" | "busy">(null);
  const [customVendor, setCustomVendor] = useState("");

  async function search() {
    const query = [d.addressLine, d.postalCode, d.city].filter(Boolean).join(" ");
    if (query.trim().length < 3) return setMatch("none");
    setMatch("busy");
    const res = await apiFetch<{ match: Match | null }>(`/geocode?q=${encodeURIComponent(query)}`);
    setMatch(res.ok && res.data.match ? res.data.match : "none");
  }
  // L'adresse change sans nouvelle suggestion : l'ancienne position ne vaut plus (l'API regéocode une adresse sans
  // coordonnées ; sinon l'adresse et l'itinéraire désigneraient deux lieux). L'épingle se repose ensuite à la main.
  const editAddress = (key: "addressLine" | "postalCode" | "city", value: string) => {
    setMatch(null);
    setD((p) => ({ ...p, [key]: value, lat: null, lng: null }));
  };
  const setNeed = (i: number, patch: Partial<NeedDraft>) =>
    setD((p) => ({ ...p, needs: (p.needs ?? []).map((n, j) => (j === i ? { ...n, ...patch } : n)) }));

  return (
    <>
      <div className="wz-search">
        <TextField
          label={W.search}
          name="addressLine"
          value={d.addressLine}
          placeholder={W.searchPlaceholder}
          onChange={(e) => editAddress("addressLine", e.currentTarget.value)}
        />
        <Button
          variant="secondary"
          icon="search"
          onClick={search}
          loading={match === "busy"}
          data-testid="wizard-geocode"
        >
          {W.searchButton}
        </Button>
      </div>
      <div className="s-two">
        <TextField
          label={E.postalCode}
          name="postalCode"
          value={d.postalCode}
          onChange={(e) => editAddress("postalCode", e.currentTarget.value)}
        />
        <TextField
          label={E.city}
          name="city"
          value={d.city}
          onChange={(e) => editAddress("city", e.currentTarget.value)}
        />
      </div>
      {match === "none" ? <p className="s-muted">{W.suggestionsNone}</p> : null}
      {match && typeof match === "object" ? (
        <div className="wz-sugg">
          <button
            type="button"
            className="wz-sugg__item"
            data-testid="wizard-suggestion"
            onClick={() => {
              setD((p) => ({
                ...p,
                lat: match.lat,
                lng: match.lng,
                postalCode: match.postalCode ?? p.postalCode,
                city: match.city ?? p.city,
              }));
              setMatch(null);
            }}
          >
            <Icon name="place" />
            <span>
              <b>{d.addressLine || match.label}</b>
              <span className="o-t-caption s-muted">{match.label}</span>
            </span>
          </button>
        </div>
      ) : null}

      <div className="wz-mapbox">
        <EventMap
          lat={d.lat}
          lng={d.lng}
          label={d.addressLine || W.search}
          draggablePin
          onPinMove={(lat, lng) => setD((p) => ({ ...p, lat, lng }))}
        />
        <span className="wz-maphint" data-testid="wizard-coords">
          {d.lat !== null && d.lng !== null ? W.coords(d.lat, d.lng) : W.pinMissing}
        </span>
      </div>
      <TextField
        label={W.entrance}
        name="entranceNote"
        maxLength={160}
        value={d.entranceNote ?? ""}
        placeholder={W.entrancePlaceholder}
        onChange={(e) => set("entranceNote", e.currentTarget.value)}
      />

      <details className="wz-panel" data-testid="wizard-panel-onsite">
        <summary>
          <Icon name="place" />
          <span>
            <b>{W.onSitePanel}</b>
            <span className="o-t-caption s-muted">{W.onSitePanelHint}</span>
          </span>
        </summary>
        <div className="s-stack">
          <p className="s-muted">{E.zonesIntro}</p>
          {d.zones.map((z, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: lignes de saisie sans identifiant stable avant l'enregistrement
            <div key={i} className="s-zone-row" data-testid="zone-row">
              <TextField
                label={E.zoneCode}
                name={`zone-code-${i}`}
                value={z.code}
                maxLength={4}
                onChange={(e) => {
                  const value = e.currentTarget.value.toUpperCase();
                  setD((p) => ({ ...p, zones: p.zones.map((x, j) => (j === i ? { ...x, code: value } : x)) }));
                }}
              />
              <TextField
                label={E.zoneName}
                name={`zone-name-${i}`}
                value={z.name}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setD((p) => ({ ...p, zones: p.zones.map((x, j) => (j === i ? { ...x, name: value } : x)) }));
                }}
              />
              <TextField
                label={E.zoneCapacity}
                name={`zone-capacity-${i}`}
                type="number"
                min={1}
                value={z.capacity}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setD((p) => ({ ...p, zones: p.zones.map((x, j) => (j === i ? { ...x, capacity: value } : x)) }));
                }}
              />
              <Button
                variant="secondary"
                icon="close"
                onClick={() => setD((p) => ({ ...p, zones: p.zones.filter((_, j) => j !== i) }))}
              >
                {E.zoneRemove}
              </Button>
            </div>
          ))}
          <div>
            <Button
              variant="secondary"
              icon="add"
              onClick={() => setD((p) => ({ ...p, zones: [...p.zones, { code: "", name: "", capacity: "" }] }))}
            >
              {E.zoneAdd}
            </Button>
          </div>

          <fieldset className="s-fieldset s-stack s-stack--tight">
            <legend className="o-t-label s-label">{E.vendorsTitle}</legend>
            <p className="s-muted">{E.vendorsIntro}</p>
            {[...vendorSuggestions, ...d.vendorTypes.filter((v) => !vendorSuggestions.includes(v))].map((v) => (
              <CheckboxField
                key={v}
                label={v}
                checked={d.vendorTypes.includes(v)}
                onChange={() => set("vendorTypes", toggle(d.vendorTypes, v))}
              />
            ))}
            <div className="s-plate-in">
              <TextField
                label={E.customVendor}
                name="customVendor"
                value={customVendor}
                maxLength={40}
                onChange={(e) => setCustomVendor(e.currentTarget.value)}
              />
              <Button
                variant="secondary"
                icon="add"
                onClick={() => {
                  const v = customVendor.trim();
                  if (v && !d.vendorTypes.includes(v)) set("vendorTypes", [...d.vendorTypes, v]);
                  setCustomVendor("");
                }}
              >
                {E.add}
              </Button>
            </div>
          </fieldset>

          <fieldset className="s-fieldset s-stack s-stack--tight" data-testid="wizard-missions">
            <legend className="o-t-label s-label">{W.missionsTitle}</legend>
            <p className="s-muted">{W.missionsIntro}</p>
            {(d.needs ?? []).map((n, i) => (
              <div
                key={n.id ?? `new-${i.toString()}`}
                className="wz-box s-stack s-stack--tight"
                data-testid="mission-row"
              >
                <b>{W.mission(i + 1)}</b>
                <div className="s-two">
                  <SelectField
                    label={W.missionTrade}
                    name={`need-${i}-trade`}
                    value={n.trade}
                    onChange={(e) => setNeed(i, { trade: e.currentTarget.value as NeedDraft["trade"] })}
                    options={providerSelectableTypes.map((t) => ({ value: t, label: vendorTypeLabels[t] }))}
                  />
                  <TextField
                    label={W.missionQuantity}
                    name={`need-${i}-quantity`}
                    type="number"
                    min={1}
                    max={9}
                    value={n.quantity}
                    onChange={(e) => setNeed(i, { quantity: e.currentTarget.value })}
                  />
                  <SelectField
                    label={W.missionPower}
                    name={`need-${i}-power`}
                    value={n.power}
                    onChange={(e) => setNeed(i, { power: e.currentTarget.value as NeedDraft["power"] })}
                    options={providerPowers.map((p) => ({ value: p, label: providerPowerLabels[p] }))}
                  />
                  <TextField
                    label={W.missionFrontage}
                    name={`need-${i}-frontage`}
                    type="number"
                    min={1}
                    max={30}
                    value={n.frontageM}
                    onChange={(e) => setNeed(i, { frontageM: e.currentTarget.value })}
                  />
                  <TextField
                    label={W.missionInstall}
                    name={`need-${i}-install`}
                    type="time"
                    value={n.installTime}
                    onChange={(e) => setNeed(i, { installTime: e.currentTarget.value })}
                    help={n.installDay && n.installTime ? W.missionDay(n.installDay) : undefined}
                  />
                </div>
                <CheckboxField
                  label={W.missionWater}
                  checked={n.water}
                  onChange={() => setNeed(i, { water: !n.water })}
                />
                <div className="s-row">
                  <Button
                    variant="secondary"
                    icon="close"
                    onClick={() => setD((p) => ({ ...p, needs: (p.needs ?? []).filter((_, j) => j !== i) }))}
                  >
                    {W.missionRemove}
                  </Button>
                </div>
              </div>
            ))}
            <div>
              <Button
                variant="secondary"
                icon="add"
                onClick={() => setD((p) => ({ ...p, needs: [...(p.needs ?? []), newNeed()] }))}
                data-testid="wizard-mission-add"
              >
                {W.missionAdd}
              </Button>
            </div>
          </fieldset>
        </div>
      </details>
    </>
  );
}
