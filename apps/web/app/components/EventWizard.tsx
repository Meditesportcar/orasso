// Création et modification d'un événement par étapes (docs/02 « Espace organisateur » : format, véhicules, places,
// prestataires, public, admission, critères, avant-première, règlement, infos, zones, billetterie). Écran non
// prototypé : composé avec le système de design, choix consignés dans docs/JOURNAL-DES-CHOIX.md (lot 13).
import { Button, CheckboxField, Chip, ChipRow, SelectField, TextField } from "@orasso/design-system/web";
import {
  type Category,
  defaultEventRules,
  type EventAdmission,
  type EventFormat,
  type EventOrganizer,
  type EventPublicAccess,
  eventAdmissionLabels,
  eventFormatLabels,
  eventFormats,
  eventPublicAccessLabels,
  ON_SITE_PAYMENT_LABEL,
  type VehicleMake,
  type VehicleType,
  vehicleTypeLabels,
  vehicleTypes,
  vendorTypeSuggestions,
} from "@orasso/shared";
import { useState } from "react";

import { apiFetch } from "../lib/api.client";
import { fromInput, toInput } from "../lib/datetime";
import { FileField, TextAreaField } from "./Fields";

type StepId =
  | "format"
  | "vehicules"
  | "places"
  | "prestataires"
  | "public"
  | "admission"
  | "criteres"
  | "avant-premiere"
  | "reglement"
  | "infos"
  | "zones"
  | "billetterie";

const STEPS: { id: StepId; label: string }[] = [
  { id: "format", label: "Format" },
  { id: "vehicules", label: "Véhicules" },
  { id: "places", label: "Places" },
  { id: "prestataires", label: "Prestataires" },
  { id: "public", label: "Public" },
  { id: "admission", label: "Admission" },
  { id: "criteres", label: "Critères" },
  { id: "avant-premiere", label: "Avant-première" },
  { id: "reglement", label: "Règlement" },
  { id: "infos", label: "Infos" },
  { id: "zones", label: "Zones" },
  { id: "billetterie", label: "Billetterie" },
];

const COUNTRIES = [
  ["FR", "France"],
  ["DE", "Allemagne"],
  ["IT", "Italie"],
  ["GB", "Royaume-Uni"],
  ["JP", "Japon"],
  ["US", "États-Unis"],
  ["SE", "Suède"],
  ["ES", "Espagne"],
] as const;

type ZoneDraft = { id?: string; code: string; name: string; capacity: string };

type Draft = {
  format: EventFormat;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  addressLine: string;
  postalCode: string;
  city: string;
  lat: number | null;
  lng: number | null;
  vehicleTypes: VehicleType[];
  maxVehiclesPerUser: string;
  unlimited: boolean;
  capacity: string;
  vendorTypes: string[];
  publicAccess: EventPublicAccess;
  externalTicketUrl: string;
  /** Entrée payante hors Orasso : lien de billetterie ou paiement sur place (lot 21). */
  paymentMode: "link" | "on_site";
  admission: EventAdmission;
  categoryIds: string[];
  makeIds: string[];
  countries: string[];
  criteriaText: string;
  registrationsOpenAt: string;
  previewHours: string;
  lockOffsetMinutes: string;
  rulesText: string;
  instructions: string;
  zones: ZoneDraft[];
};

function initial(event?: EventOrganizer): Draft {
  if (!event) {
    return {
      format: "gathering",
      title: "",
      description: "",
      startsAt: "",
      endsAt: "",
      addressLine: "",
      postalCode: "",
      city: "",
      lat: null,
      lng: null,
      vehicleTypes: ["car"],
      maxVehiclesPerUser: "1",
      unlimited: true,
      capacity: "",
      vendorTypes: [],
      publicAccess: "free",
      externalTicketUrl: "",
      paymentMode: "link",
      admission: "filtered",
      categoryIds: [],
      makeIds: [],
      countries: [],
      criteriaText: "",
      registrationsOpenAt: toInput(new Date()),
      previewHours: "24",
      lockOffsetMinutes: "120",
      rulesText: defaultEventRules,
      instructions: "",
      zones: [],
    };
  }
  return {
    format: event.format,
    title: event.title,
    description: event.description ?? "",
    startsAt: toInput(event.startsAt),
    endsAt: toInput(event.endsAt),
    addressLine: event.addressLine ?? "",
    postalCode: event.postalCode ?? "",
    city: event.city ?? "",
    lat: event.lat,
    lng: event.lng,
    vehicleTypes: event.admittedVehicleTypes,
    maxVehiclesPerUser: String(event.maxVehiclesPerUser),
    unlimited: event.capacity === null,
    capacity: event.capacity === null ? "" : String(event.capacity),
    vendorTypes: event.vendorTypes,
    publicAccess: event.publicAccess,
    externalTicketUrl: event.externalTicketUrl ?? "",
    paymentMode: event.publicAccess === "paid_external" && !event.externalTicketUrl ? "on_site" : "link",
    admission: event.admission,
    categoryIds: event.criteria?.categoryIds ?? [],
    makeIds: event.criteria?.makeIds ?? [],
    countries: event.criteria?.countries ?? [],
    criteriaText: event.criteria?.text ?? "",
    registrationsOpenAt: toInput(event.registrationsOpenAt),
    previewHours: String(event.previewHours),
    lockOffsetMinutes: String(
      event.lockAt ? Math.round((new Date(event.startsAt).getTime() - new Date(event.lockAt).getTime()) / 60_000) : 120,
    ),
    rulesText: event.rulesText ?? "",
    instructions: event.instructions ?? "",
    zones: event.zones.map((z) => ({
      id: z.id,
      code: z.code,
      name: z.name,
      capacity: z.capacity ? String(z.capacity) : "",
    })),
  };
}

function validate(step: StepId, d: Draft): string | null {
  switch (step) {
    case "format": {
      if (d.title.trim().length < 3) return "Donne un titre d'au moins 3 caractères.";
      const start = fromInput(d.startsAt);
      const end = fromInput(d.endsAt);
      if (!start || !end) return "Indique le début et la fin.";
      if (new Date(end) <= new Date(start)) return "La fin doit suivre le début.";
      return null;
    }
    case "vehicules":
      return d.vehicleTypes.length === 0 ? "Coche au moins un type de véhicule." : null;
    case "places":
      return !d.unlimited && !(Number(d.capacity) > 0) ? "Indique un nombre de places supérieur à zéro." : null;
    case "public":
      return d.publicAccess === "paid_external" &&
        d.paymentMode === "link" &&
        !/^https?:\/\//i.test(d.externalTicketUrl)
        ? "Indique l'adresse de ta billetterie (https://…)."
        : null;
    case "avant-premiere":
      return fromInput(d.registrationsOpenAt) ? null : "Indique l'ouverture des inscriptions.";
    case "zones": {
      const codes = d.zones.map((z) => z.code.trim().toUpperCase());
      if (d.zones.some((z) => !/^[A-Z0-9]{1,4}$/.test(z.code.trim().toUpperCase()) || !z.name.trim())) {
        return "Chaque zone a un code de 1 à 4 lettres ou chiffres et un nom.";
      }
      return new Set(codes).size === codes.length ? null : "Deux zones ont le même code.";
    }
    default:
      return null;
  }
}

function payloadOf(d: Draft) {
  return {
    title: d.title.trim(),
    description: d.description.trim() || null,
    format: d.format,
    startsAt: fromInput(d.startsAt),
    endsAt: fromInput(d.endsAt),
    addressLine: d.addressLine.trim() || null,
    postalCode: d.postalCode.trim() || null,
    city: d.city.trim() || null,
    ...(d.lat !== null && d.lng !== null ? { lat: d.lat, lng: d.lng } : {}),
    admittedVehicleTypes: d.vehicleTypes,
    capacity: d.unlimited ? null : Number(d.capacity),
    maxVehiclesPerUser: Math.max(1, Number(d.maxVehiclesPerUser) || 1),
    admission: d.admission,
    criteria:
      d.admission === "filtered"
        ? {
            categoryIds: d.categoryIds,
            makeIds: d.makeIds,
            countries: d.countries,
            text: d.criteriaText.trim() || null,
          }
        : null,
    publicAccess: d.publicAccess,
    externalTicketUrl:
      d.publicAccess === "paid_external" && d.paymentMode === "link" ? d.externalTicketUrl.trim() : null,
    registrationsOpenAt: fromInput(d.registrationsOpenAt),
    previewHours: Number(d.previewHours),
    lockOffsetMinutes: Number(d.lockOffsetMinutes),
    rulesText: d.rulesText.trim() || null,
    instructions: d.instructions.trim() || null,
    vendorTypes: d.vendorTypes,
  };
}

type Props = {
  structureId: string;
  structureSlug: string;
  verified: boolean;
  categories: Category[];
  makes: VehicleMake[];
  event?: EventOrganizer;
};

export function EventWizard({ structureId, structureSlug, verified, categories, makes, event }: Props) {
  const editing = Boolean(event);
  const [d, setD] = useState<Draft>(() => initial(event));
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [customVendor, setCustomVendor] = useState("");
  const [poster, setPoster] = useState<File | null>(null);
  const step = STEPS[index] as (typeof STEPS)[number];
  const last = index === STEPS.length - 1;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((prev) => ({ ...prev, [key]: value }));
  const toggle = <T extends string>(list: T[], value: T) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  function go(delta: 1 | -1) {
    if (delta === 1) {
      const problem = validate(step.id, d);
      if (problem) return setError(problem);
    }
    setError(null);
    let next = index + delta;
    // Pas de critères hors filtration.
    if (STEPS[next]?.id === "criteres" && d.admission !== "filtered") next += delta;
    setIndex(Math.min(Math.max(next, 0), STEPS.length - 1));
  }

  async function checkAddress() {
    const query = [d.addressLine, d.postalCode, d.city].filter(Boolean).join(" ");
    if (query.trim().length < 3) return setAddress("Saisis d'abord une adresse.");
    setAddress("Recherche…");
    const res = await apiFetch<{
      match: { lat: number; lng: number; label: string; postalCode: string | null; city: string | null } | null;
    }>(`/geocode?q=${encodeURIComponent(query)}`);
    if (!res.ok) return setAddress(res.error.message);
    const match = res.data.match;
    if (!match) {
      set("lat", null);
      set("lng", null);
      return setAddress("Adresse introuvable : l'événement ne s'affichera pas sur la carte.");
    }
    setD((prev) => ({
      ...prev,
      lat: match.lat,
      lng: match.lng,
      postalCode: prev.postalCode || match.postalCode || "",
      city: prev.city || match.city || "",
    }));
    setAddress(`Trouvée : ${match.label}`);
  }

  async function save() {
    for (const s of STEPS) {
      if (s.id === "criteres" && d.admission !== "filtered") continue;
      const problem = validate(s.id, d);
      if (problem) {
        setIndex(STEPS.findIndex((x) => x.id === s.id));
        return setError(problem);
      }
    }
    setBusy(true);
    setError(null);
    const body = payloadOf(d);
    const res = editing
      ? await apiFetch<EventOrganizer>(`/events/${event?.id}`, { method: "PATCH", json: body })
      : await apiFetch<EventOrganizer>(`/structures/${structureId}/events`, { method: "POST", json: body });
    if (!res.ok) {
      setBusy(false);
      const fields = res.error.details?.fields as Record<string, string> | undefined;
      return setError(fields ? `${res.error.message} : ${Object.values(fields).join(" ")}` : res.error.message);
    }
    const saved = res.data;
    // Zones : création, modification, retrait par rapport à l'état enregistré.
    const kept = new Set(d.zones.map((z) => z.id).filter(Boolean));
    for (const z of event?.zones ?? []) {
      if (!kept.has(z.id)) await apiFetch(`/events/${saved.id}/zones/${z.id}`, { method: "DELETE" });
    }
    for (const [position, z] of d.zones.entries()) {
      const zone = {
        code: z.code.trim().toUpperCase(),
        name: z.name.trim(),
        capacity: Number(z.capacity) > 0 ? Number(z.capacity) : null,
        position,
      };
      if (z.id) await apiFetch(`/events/${saved.id}/zones/${z.id}`, { method: "PATCH", json: zone });
      else await apiFetch(`/events/${saved.id}/zones`, { method: "POST", json: zone });
    }
    if (poster) {
      const form = new FormData();
      form.set("poster", poster);
      await fetch(`/api/events/${saved.id}/poster`, { method: "POST", body: form, credentials: "same-origin" });
    }
    window.location.assign(`/orga/${structureSlug}/e/${saved.id}${editing ? "" : "?creee=1"}`);
  }

  return (
    <div className="s-stack" data-testid="event-wizard">
      <div className="s-stack s-stack--tight">
        <div className="s-steps" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s.id} className={i <= index ? "s-steps__step is-done" : "s-steps__step"} />
          ))}
        </div>
        <div className="o-t-label s-label" data-testid="wizard-step">
          Étape {index + 1} sur {STEPS.length} · {step.label}
        </div>
      </div>

      <section className="orga__panel s-stack" aria-labelledby="step-title">
        <h2 id="step-title" className="s-h2">
          {step.label}
        </h2>

        {step.id === "format" && (
          <>
            <fieldset className="s-fieldset s-stack s-stack--tight">
              <legend className="o-t-label s-label">Format</legend>
              <ChipRow className="s-chips-wrap">
                {eventFormats.map((f) => (
                  <Chip key={f} selected={d.format === f} onClick={() => set("format", f)}>
                    {eventFormatLabels[f]}
                  </Chip>
                ))}
              </ChipRow>
            </fieldset>
            <TextField
              label="Titre"
              name="title"
              value={d.title}
              onChange={(e) => set("title", e.currentTarget.value)}
            />
            <TextAreaField
              label="Description et programme"
              name="description"
              value={d.description}
              onChange={(e) => set("description", e.currentTarget.value)}
            />
            <div className="s-two">
              <TextField
                label="Début"
                name="startsAt"
                type="datetime-local"
                value={d.startsAt}
                onChange={(e) => set("startsAt", e.currentTarget.value)}
              />
              <TextField
                label="Fin"
                name="endsAt"
                type="datetime-local"
                value={d.endsAt}
                onChange={(e) => set("endsAt", e.currentTarget.value)}
              />
            </div>
            <TextField
              label="Adresse"
              name="addressLine"
              value={d.addressLine}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setD((p) => ({ ...p, addressLine: value, lat: null, lng: null }));
              }}
            />
            <div className="s-two">
              <TextField
                label="Code postal"
                name="postalCode"
                value={d.postalCode}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setD((p) => ({ ...p, postalCode: value, lat: null, lng: null }));
                }}
              />
              <TextField
                label="Ville"
                name="city"
                value={d.city}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setD((p) => ({ ...p, city: value, lat: null, lng: null }));
                }}
              />
            </div>
            <div className="s-row">
              <Button variant="secondary" icon="place" onClick={checkAddress}>
                Vérifier l'adresse
              </Button>
              <span className="o-t-caption s-muted" role="status" data-testid="address-status">
                {address ??
                  (d.lat !== null ? "Position enregistrée." : "L'adresse est publique et placée sur la carte.")}
              </span>
            </div>
          </>
        )}

        {step.id === "vehicules" && (
          <>
            <fieldset className="s-fieldset s-stack s-stack--tight">
              <legend className="o-t-label s-label">Véhicules admis</legend>
              {vehicleTypes.map((t) => (
                <CheckboxField
                  key={t}
                  label={vehicleTypeLabels[t]}
                  checked={d.vehicleTypes.includes(t)}
                  onChange={() => set("vehicleTypes", toggle(d.vehicleTypes, t))}
                />
              ))}
            </fieldset>
            <TextField
              label="Véhicules par personne, au plus"
              name="maxVehiclesPerUser"
              type="number"
              min={1}
              max={10}
              value={d.maxVehiclesPerUser}
              onChange={(e) => set("maxVehiclesPerUser", e.currentTarget.value)}
              help="Une même personne peut inscrire plusieurs véhicules ; chacun reçoit sa propre décision."
            />
          </>
        )}

        {step.id === "places" && (
          <>
            <fieldset className="s-fieldset s-stack s-stack--tight">
              <legend className="o-t-label s-label">Nombre de places</legend>
              <ChipRow>
                <Chip selected={d.unlimited} onClick={() => set("unlimited", true)}>
                  Sans limite
                </Chip>
                <Chip selected={!d.unlimited} onClick={() => set("unlimited", false)}>
                  Avec une limite
                </Chip>
              </ChipRow>
            </fieldset>
            {!d.unlimited && (
              <TextField
                label="Nombre de places"
                name="capacity"
                type="number"
                min={1}
                value={d.capacity}
                onChange={(e) => set("capacity", e.currentTarget.value)}
              />
            )}
            <p className="s-muted">
              Même sans limite, tu vois le nombre d'inscrits en temps réel. La liste d'attente automatique ne joue que
              quand il y a une limite.
            </p>
          </>
        )}

        {step.id === "prestataires" && (
          <>
            <p className="s-muted">
              Coche les types de prestataires que tu accueilles : seuls ceux-là peuvent candidater, et tu les tries dans
              l'onglet « Prestataires » des candidatures, hors places. « Autres » accepte aussi les types que tu ajoutes
              avec « Un autre type ».
            </p>
            <fieldset className="s-fieldset s-stack s-stack--tight">
              <legend className="o-t-label s-label">Prestataires attendus</legend>
              {[
                ...vendorTypeSuggestions,
                ...d.vendorTypes.filter((v) => !(vendorTypeSuggestions as readonly string[]).includes(v)),
              ].map((v) => (
                <CheckboxField
                  key={v}
                  label={v}
                  checked={d.vendorTypes.includes(v)}
                  onChange={() => set("vendorTypes", toggle(d.vendorTypes, v))}
                />
              ))}
            </fieldset>
            <div className="s-plate-in">
              <TextField
                label="Un autre type"
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
                Ajouter
              </Button>
            </div>
          </>
        )}

        {step.id === "public" && (
          <>
            <fieldset className="s-fieldset s-stack s-stack--tight">
              <legend className="o-t-label s-label">Entrée du public</legend>
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
                  <legend className="o-t-label s-label">Paiement de l'entrée</legend>
                  <ChipRow className="s-chips-wrap">
                    <Chip selected={d.paymentMode === "link"} onClick={() => set("paymentMode", "link")}>
                      Lien de billetterie
                    </Chip>
                    <Chip selected={d.paymentMode === "on_site"} onClick={() => set("paymentMode", "on_site")}>
                      Paiement sur place
                    </Chip>
                  </ChipRow>
                </fieldset>
                {d.paymentMode === "link" ? (
                  <TextField
                    label="Adresse de ta billetterie"
                    name="externalTicketUrl"
                    inputMode="url"
                    value={d.externalTicketUrl}
                    onChange={(e) => set("externalTicketUrl", e.currentTarget.value)}
                    placeholder="https://"
                  />
                ) : (
                  <p className="s-muted" data-testid="on-site-hint">
                    Pas de billetterie en ligne : la page affichera « {ON_SITE_PAYMENT_LABEL} ».
                  </p>
                )}
              </>
            )}
            {(d.publicAccess === "free_reservation" || d.publicAccess === "paid_orasso") && (
              <p className="s-muted" data-testid="ticketing-hint">
                {d.publicAccess === "free_reservation"
                  ? "Chaque visiteur réserve un billet gratuit avec son QR, contrôlé à l'entrée. "
                  : "Billetterie payante en mode présentation : le paiement se fait avec Stripe en mode test, aucun encaissement réel avant le 21 juin 2027. "}
                Tu règles les places{d.publicAccess === "paid_orasso" ? ", le prix" : ""} et l'ouverture de la
                billetterie sur la page de l'événement, une fois le brouillon enregistré.
              </p>
            )}
          </>
        )}

        {step.id === "admission" && (
          <>
            <fieldset className="s-fieldset s-stack s-stack--tight">
              <legend className="o-t-label s-label">Mode d'admission</legend>
              <ChipRow className="s-chips-wrap">
                {(["open", "filtered"] as const).map((a) => (
                  <Chip key={a} selected={d.admission === a} onClick={() => set("admission", a)}>
                    {eventAdmissionLabels[a]}
                  </Chip>
                ))}
              </ChipRow>
            </fieldset>
            <p className="s-muted">
              {d.admission === "open"
                ? "Tout le monde est retenu d'office, dans la limite des places."
                : "Tu trieras les candidatures une à une ou en liste, avec ton équipe de filtration."}{" "}
              « Sur invitation » (événement privé) arrive avec les invitations nominatives.
            </p>
          </>
        )}

        {step.id === "criteres" && (
          <>
            <p className="s-muted">
              Les critères sont affichés aux candidats et t'aident à trier : ils ne refusent personne automatiquement.
            </p>
            <fieldset className="s-fieldset s-stack s-stack--tight">
              <legend className="o-t-label s-label">Catégories recherchées</legend>
              <ChipRow className="s-chips-wrap">
                {categories.map((c) => (
                  <Chip
                    key={c.id}
                    selected={d.categoryIds.includes(c.id)}
                    onClick={() => set("categoryIds", toggle(d.categoryIds, c.id))}
                  >
                    {c.label}
                  </Chip>
                ))}
              </ChipRow>
            </fieldset>
            <fieldset className="s-fieldset s-stack s-stack--tight">
              <legend className="o-t-label s-label">Origine</legend>
              <ChipRow className="s-chips-wrap">
                {COUNTRIES.map(([code, label]) => (
                  <Chip
                    key={code}
                    selected={d.countries.includes(code)}
                    onClick={() => set("countries", toggle(d.countries, code))}
                  >
                    {label}
                  </Chip>
                ))}
              </ChipRow>
            </fieldset>
            <fieldset className="s-fieldset s-stack s-stack--tight">
              <legend className="o-t-label s-label">Marques</legend>
              <div className="s-checklist">
                {makes
                  .filter((m) => m.name !== "Autre")
                  .map((m) => (
                    <CheckboxField
                      key={m.id}
                      label={m.name}
                      checked={d.makeIds.includes(m.id)}
                      onChange={() => set("makeIds", toggle(d.makeIds, m.id))}
                    />
                  ))}
              </div>
            </fieldset>
            <TextAreaField
              label="Précisions"
              name="criteriaText"
              value={d.criteriaText}
              onChange={(e) => set("criteriaText", e.currentTarget.value)}
              help="Par exemple : « véhicules d'avant 2000, préparations sobres »."
            />
          </>
        )}

        {step.id === "avant-premiere" && (
          <>
            <TextField
              label="Ouverture des inscriptions"
              name="registrationsOpenAt"
              type="datetime-local"
              value={d.registrationsOpenAt}
              onChange={(e) => set("registrationsOpenAt", e.currentTarget.value)}
            />
            <SelectField
              label="Avant-première des abonnés"
              name="previewHours"
              value={d.previewHours}
              onChange={(e) => set("previewHours", e.currentTarget.value)}
              options={[
                { value: "0", label: "Aucune" },
                { value: "24", label: "24 h avant (par défaut)" },
                { value: "48", label: "48 h avant" },
                { value: "72", label: "72 h avant" },
              ]}
              help="Les abonnés de ta structure peuvent candidater avant l'ouverture publique."
            />
            <SelectField
              label="Verrouillage des inscriptions"
              name="lockOffsetMinutes"
              value={d.lockOffsetMinutes}
              onChange={(e) => set("lockOffsetMinutes", e.currentTarget.value)}
              options={[
                { value: "0", label: "Au début de l'événement" },
                { value: "60", label: "1 h avant" },
                { value: "120", label: "2 h avant (par défaut)" },
                { value: "180", label: "3 h avant" },
                { value: "360", label: "6 h avant" },
                { value: "1440", label: "24 h avant" },
              ]}
              help="À ce moment, le staff synchronise la liste d'accès et les désistements deviennent des absences."
            />
          </>
        )}

        {step.id === "reglement" && (
          <>
            <div className="s-row">
              <Button variant="secondary" icon="undo" onClick={() => set("rulesText", defaultEventRules)}>
                Utiliser le modèle Orasso
              </Button>
            </div>
            <TextAreaField
              label="Règlement"
              name="rulesText"
              rows={12}
              value={d.rulesText}
              onChange={(e) => set("rulesText", e.currentTarget.value)}
              help="Le modèle d'Orasso est un point de départ ; tu peux le modifier ou écrire ton propre texte. Les candidats l'acceptent en candidatant."
            />
          </>
        )}

        {step.id === "infos" && (
          <>
            <TextAreaField
              label="Consignes aux retenus"
              name="instructions"
              value={d.instructions}
              onChange={(e) => set("instructions", e.currentTarget.value)}
              help="Réservées aux participants retenus : accès, horaires d'arrivée, ce qu'il faut apporter."
            />
            <FileField
              label="Affiche"
              name="poster"
              accept="image/*"
              onChange={(e) => setPoster(e.currentTarget.files?.[0] ?? null)}
              help={editing ? "Choisis un fichier pour remplacer l'affiche actuelle." : "JPEG, PNG ou WebP."}
            />
          </>
        )}

        {step.id === "zones" && (
          <>
            <p className="s-muted">
              Les zones (A, JDM…) s'affichent en grand au scan et guident le placement. Tu peux n'en créer aucune.
            </p>
            {d.zones.map((z, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: lignes de saisie sans identifiant stable avant l'enregistrement
              <div key={i} className="s-zone-row" data-testid="zone-row">
                <TextField
                  label="Code"
                  name={`zone-code-${i}`}
                  value={z.code}
                  maxLength={4}
                  onChange={(e) => {
                    const value = e.currentTarget.value.toUpperCase();
                    setD((p) => ({ ...p, zones: p.zones.map((x, j) => (j === i ? { ...x, code: value } : x)) }));
                  }}
                />
                <TextField
                  label="Nom"
                  name={`zone-name-${i}`}
                  value={z.name}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    setD((p) => ({ ...p, zones: p.zones.map((x, j) => (j === i ? { ...x, name: value } : x)) }));
                  }}
                />
                <TextField
                  label="Places"
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
                  Retirer
                </Button>
              </div>
            ))}
            <div>
              <Button
                variant="secondary"
                icon="add"
                onClick={() => setD((p) => ({ ...p, zones: [...p.zones, { code: "", name: "", capacity: "" }] }))}
              >
                Ajouter une zone
              </Button>
            </div>
          </>
        )}

        {step.id === "billetterie" && (
          <>
            <p className="s-notice">
              {d.publicAccess === "free_reservation" || d.publicAccess === "paid_orasso"
                ? "Une fois le brouillon enregistré, ouvre la billetterie des visiteurs (places, prix, interrupteur) depuis la page de l'événement."
                : "La billetterie Orasso (billets gratuits sur réservation, billets payants en mode présentation) se choisit à l'étape « Public »."}
            </p>
            <Recap d={d} />
            {!verified && (
              <p className="s-notice" data-testid="not-verified-note">
                Ta structure n'est pas encore vérifiée : tu peux enregistrer ce brouillon, mais pas le publier.{" "}
                <a href={`/orga/${structureSlug}/structure`}>Faire vérifier la structure</a>
              </p>
            )}
            {editing && event?.status === "published" && (
              <p className="s-notice s-notice--alert">
                Cet événement est publié : si tu changes la date ou l'adresse, tous les inscrits sont prévenus.
              </p>
            )}
          </>
        )}

        {error && (
          <p className="s-error" role="alert" data-testid="wizard-error">
            {error}
          </p>
        )}

        <div className="s-actions">
          {index > 0 ? (
            <Button variant="secondary" icon="back" onClick={() => go(-1)}>
              Retour
            </Button>
          ) : (
            <Button variant="secondary" icon="close" href={`/orga/${structureSlug}`}>
              Annuler
            </Button>
          )}
          {last ? (
            <Button icon="check" onClick={save} loading={busy}>
              {editing ? "Enregistrer les modifications" : "Enregistrer le brouillon"}
            </Button>
          ) : (
            <Button icon="next" onClick={() => go(1)}>
              Suivant
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

function Recap({ d }: { d: Draft }) {
  const rows: [string, string][] = [
    ["Format", eventFormatLabels[d.format]],
    ["Titre", d.title || "—"],
    ["Début", d.startsAt ? d.startsAt.replace("T", " ") : "—"],
    ["Adresse", [d.addressLine, d.postalCode, d.city].filter(Boolean).join(" ") || "—"],
    ["Véhicules", d.vehicleTypes.map((t) => vehicleTypeLabels[t]).join(", ")],
    ["Places", d.unlimited ? "Sans limite" : d.capacity],
    ["Public", eventPublicAccessLabels[d.publicAccess]],
    ["Admission", eventAdmissionLabels[d.admission]],
    ["Zones", d.zones.map((z) => z.code).join(", ") || "Aucune"],
  ];
  return (
    <dl className="s-recap" data-testid="wizard-recap">
      {rows.map(([k, v]) => (
        <div key={k} className="tri__kv">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
