// Création et modification d'un événement par étapes (docs/02 « Espace organisateur » : format, véhicules, places,
// prestataires, public, admission, critères, avant-première, règlement, infos, zones, billetterie). Écran non
// prototypé : composé avec le système de design, choix consignés dans docs/JOURNAL-DES-CHOIX.md (lot 13).

import { Button, CheckboxField, Chip, ChipRow, SelectField, TextField } from "@orasso/design-system/web";
import {
  type Category,
  criteriaCountries,
  dayAccesses,
  dayAccessLabels,
  defaultEventRules,
  draftStart,
  type EventDraft,
  type EventOrganizer,
  eventAdmissionLabels,
  eventDaysLabels,
  eventDaysPayload,
  eventEditorLabels,
  eventFormatLabels,
  eventPayload,
  eventPublicAccessLabels,
  eventStepProblem,
  eventStepSkipped,
  eventWizardSteps,
  firstEventProblem,
  type Grade,
  gradeLabels,
  grades,
  highGradePreviewOptions,
  highGradesText,
  initialEventDraft,
  invitationLabels,
  lockOffsetOptions,
  ON_SITE_PAYMENT_LABEL,
  previewHourOptions,
  shopLabels,
  sortedDraftDays,
  type VehicleMake,
  vehicleTypeLabels,
  vehicleTypes,
  vendorTypeLabels,
  withAddedDay,
  withCopyOpening,
  withMultiDay,
  wizardEndLabels,
  zoneChanges,
} from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router";
import { apiFetch } from "../lib/api.client";
import { now as clockNow } from "../lib/clock";
import { formatDateTime } from "../lib/format";
import { useEventFormats, useVendorTypes } from "../lib/lists";
import { FileField, TextAreaField } from "./Fields";

const STEPS = eventWizardSteps.map((id) => ({ id, label: eventEditorLabels.steps[id] }));

type Props = {
  structureId: string;
  structureSlug: string;
  verified: boolean;
  categories: Category[];
  makes: VehicleMake[];
  event?: EventOrganizer;
};

export function EventWizard({ structureId, structureSlug, verified, categories, makes, event }: Props) {
  // Lot 26 : un événement créé dont l'enregistrement des jours a échoué passe en modification (pas de second POST).
  const [createdId, setCreatedId] = useState<string | null>(null);
  const targetId = event?.id ?? createdId;
  const editing = Boolean(event);
  const [d, setD] = useState<EventDraft>(() => initialEventDraft(clockNow(), event));
  // Lot 33 : types de prestataires proposés par l'administration (repli sur les constantes partagées).
  const vendorTypeSuggestions: readonly string[] = useVendorTypes().map((c) => vendorTypeLabels[c]);
  // Formats proposés par l'administration ; celui d'un événement existant reste proposé.
  const formatsOn = useEventFormats();
  const offeredFormats = formatsOn.includes(d.format) ? formatsOn : [...formatsOn, d.format];
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [customVendor, setCustomVendor] = useState("");
  const [poster, setPoster] = useState<File | null>(null);
  const step = STEPS[index] as (typeof STEPS)[number];
  const last = index === STEPS.length - 1;
  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => setD((prev) => ({ ...prev, [key]: value }));
  // Lot 36 : copie d'un événement (duplication) encore en brouillon : l'ouverture des candidatures suit le début.
  const isCopy = Boolean(event?.parentEventId) && event?.status === "draft";
  const setStartsAt = (value: string) => set("startsAt", value);
  // Quand le début d'une copie change (un jour ou plusieurs), l'ouverture garde le délai de l'original.
  const copyLead = isCopy && event ? Date.parse(event.startsAt) - Date.parse(event.registrationsOpenAt) : null;
  const start = draftStart(d);
  const lastStart = useRef(start);
  useEffect(() => {
    if (copyLead === null || start === lastStart.current) return;
    lastStart.current = start;
    setD((prev) => withCopyOpening(prev, copyLead, clockNow()));
  }, [copyLead, start]);
  // Brouillon : trois choix en fin d'assistant (Publier, Garder en brouillon, Aperçu) ; un événement publié s'enregistre.
  const isDraft = !event || event.status === "draft";

  // Lot 36 : la saisie est gardée dans le navigateur (aucun lien ne la fait perdre) et une garde demande avant de
  // quitter l'assistant avec une saisie non enregistrée. Effacée après un enregistrement réussi.
  const storageKey = `orasso-wizard:${structureId}:${event?.id ?? "new"}`;
  const pristine = useRef(JSON.stringify(d));
  const [restored, setRestored] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Enregistré : la page part (rechargement complet) sans demander de confirmation.
  const leaving = useRef(false);
  const dirty = JSON.stringify(d) !== pristine.current;
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const stored = JSON.parse(raw) as { draft: EventDraft; index: number; savedAt: string };
      if (JSON.stringify(stored.draft) === pristine.current) return;
      setD(stored.draft);
      setIndex(Math.min(Math.max(stored.index, 0), STEPS.length - 1));
      setRestored(stored.savedAt);
    } catch {
      // Stockage indisponible (navigation privée) : l'assistant marche sans.
    }
  }, [storageKey]);
  useEffect(() => {
    if (!dirty || saving) return;
    const timer = setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify({ draft: d, index, savedAt: new Date().toISOString() }));
      } catch {
        // Stockage plein ou refusé : sans conséquence.
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [d, index, dirty, saving, storageKey]);
  useEffect(() => {
    if (!dirty || saving) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (!leaving.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && !saving && currentLocation.pathname !== nextLocation.pathname,
  );
  const forgetLocal = () => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Rien à faire.
    }
  };
  const discardLocal = () => {
    forgetLocal();
    setD(JSON.parse(pristine.current) as EventDraft);
    setIndex(0);
    setRestored(null);
  };
  const toggle = <T extends string>(list: T[], value: T) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  function go(delta: 1 | -1) {
    if (delta === 1) {
      const problem = eventStepProblem(step.id, d);
      if (problem) return setError(problem);
    }
    setError(null);
    let next = index + delta;
    // Pas de critères hors filtration.
    const target = STEPS[next];
    if (target && eventStepSkipped(target.id, d)) next += delta;
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

  async function save(mode: "draft" | "publish" | "preview" = "draft") {
    const invalid = firstEventProblem(d);
    if (invalid) {
      setIndex(STEPS.findIndex((x) => x.id === invalid.step));
      return setError(invalid.problem);
    }
    setBusy(true);
    setError(null);
    const wasMultiDay = (event?.days.length ?? 0) > 1;
    // Lot 26 : retour à un seul jour d'un événement qui en avait plusieurs : les jours d'abord (les dates suivent).
    if (editing && wasMultiDay && !d.multiDay) {
      const back = await apiFetch(`/events/${targetId}/days`, { method: "PUT", json: eventDaysPayload(d) });
      if (!back.ok) {
        setBusy(false);
        return setError(back.error.message);
      }
    }
    // Plusieurs jours, événement existant : pas de dates dans le PATCH (les jours fixent les bornes, et une seule
    // notification « Événement modifié » part, celle des jours).
    const body = eventPayload(d, Boolean(targetId) && d.multiDay);
    const res = targetId
      ? await apiFetch<EventOrganizer>(`/events/${targetId}`, { method: "PATCH", json: body })
      : await apiFetch<EventOrganizer>(`/structures/${structureId}/events`, { method: "POST", json: body });
    if (!res.ok) {
      setBusy(false);
      const fields = res.error.details?.fields as Record<string, string> | undefined;
      return setError(fields ? `${res.error.message} : ${Object.values(fields).join(" ")}` : res.error.message);
    }
    const saved = res.data;
    // Lot 26 : plusieurs jours (liste complète) ; les dates de l'événement deviennent les bornes.
    if (d.multiDay) {
      const days = await apiFetch(`/events/${saved.id}/days`, { method: "PUT", json: eventDaysPayload(d) });
      if (!days.ok) {
        if (!event) setCreatedId(saved.id);
        setBusy(false);
        setIndex(0);
        return setError(days.error.message);
      }
    }
    // Zones : création, modification, retrait par rapport à l'état enregistré.
    const zones = zoneChanges(event?.zones ?? [], d.zones);
    for (const id of zones.remove) await apiFetch(`/events/${saved.id}/zones/${id}`, { method: "DELETE" });
    for (const z of zones.update) {
      await apiFetch(`/events/${saved.id}/zones/${z.id}`, { method: "PATCH", json: z.zone });
    }
    for (const zone of zones.create) await apiFetch(`/events/${saved.id}/zones`, { method: "POST", json: zone });
    if (poster) {
      const form = new FormData();
      form.set("poster", poster);
      await fetch(`/api/events/${saved.id}/poster`, { method: "POST", body: form, credentials: "same-origin" });
    }
    leaving.current = true;
    setSaving(true);
    forgetLocal();
    if (mode === "preview") return window.location.assign(`/e/${saved.slug}?apercu=1`);
    if (mode === "publish") {
      const published = await apiFetch(`/events/${saved.id}/publish`, { method: "POST" });
      return window.location.assign(
        published.ok
          ? `/orga/${structureSlug}/e/${saved.id}?publie=1`
          : `/orga/${structureSlug}/e/${saved.id}?erreur=${encodeURIComponent(published.error.message)}`,
      );
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

      {restored && (
        <div className="s-notice s-stack s-stack--tight" role="status" data-testid="wizard-restored">
          <span>{wizardEndLabels.resumeLocal(formatDateTime(restored))}</span>
          <div className="s-row">
            <Button variant="secondary" icon="undo" onClick={discardLocal}>
              {wizardEndLabels.resumeLocalDiscard}
            </Button>
          </div>
        </div>
      )}
      {isCopy && index === 0 && (
        <p className="s-notice" data-testid="wizard-copy">
          {wizardEndLabels.copyNotice}
        </p>
      )}
      {blocker.state === "blocked" && (
        <div className="s-notice s-notice--alert s-stack s-stack--tight" role="alertdialog" data-testid="wizard-leave">
          <strong>{wizardEndLabels.leaveTitle}</strong>
          <span>{wizardEndLabels.leaveBodyKept}</span>
          <div className="s-row">
            <Button variant="secondary" icon="back" onClick={() => blocker.proceed()}>
              {wizardEndLabels.leaveConfirm}
            </Button>
            <Button variant="secondary" icon="check" onClick={() => blocker.reset()}>
              {wizardEndLabels.leaveKeep}
            </Button>
          </div>
        </div>
      )}

      <section className="orga__panel s-stack" aria-labelledby="step-title">
        <h2 id="step-title" className="s-h2">
          {step.label}
        </h2>

        {step.id === "format" && (
          <>
            <fieldset className="s-fieldset s-stack s-stack--tight">
              <legend className="o-t-label s-label">Format</legend>
              <ChipRow className="s-chips-wrap">
                {offeredFormats.map((f) => (
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
            <CheckboxField
              label={eventDaysLabels.multiDay}
              name="multiDay"
              checked={d.multiDay}
              onChange={(e) => {
                const multiDay = e.currentTarget.checked;
                setD((p) => withMultiDay(p, multiDay, clockNow()));
              }}
            />
            {d.multiDay ? (
              <div className="s-stack s-stack--tight" data-testid="wizard-days">
                {d.days.map((day, i) => (
                  <fieldset key={`day-${i.toString()}`} className="s-fieldset s-stack s-stack--tight">
                    <legend className="o-t-label s-label">
                      {eventDaysLabels.day} {i + 1}
                    </legend>
                    <div className="s-two">
                      <TextField
                        label="Date"
                        name={`day-${i}-date`}
                        type="date"
                        value={day.date}
                        onChange={(e) => {
                          const value = e.currentTarget.value;
                          setD((p) => ({ ...p, days: p.days.map((x, j) => (j === i ? { ...x, date: value } : x)) }));
                        }}
                      />
                      <TextField
                        label="Début"
                        name={`day-${i}-start`}
                        type="time"
                        value={day.startTime}
                        onChange={(e) => {
                          const value = e.currentTarget.value;
                          setD((p) => ({
                            ...p,
                            days: p.days.map((x, j) => (j === i ? { ...x, startTime: value } : x)),
                          }));
                        }}
                      />
                      <TextField
                        label="Fin"
                        name={`day-${i}-end`}
                        type="time"
                        value={day.endTime}
                        onChange={(e) => {
                          const value = e.currentTarget.value;
                          setD((p) => ({ ...p, days: p.days.map((x, j) => (j === i ? { ...x, endTime: value } : x)) }));
                        }}
                      />
                      <TextField
                        label={eventDaysLabels.dayCapacity}
                        name={`day-${i}-capacity`}
                        inputMode="numeric"
                        value={day.capacity}
                        placeholder={eventDaysLabels.dayCapacityHint}
                        onChange={(e) => {
                          const value = e.currentTarget.value;
                          setD((p) => ({
                            ...p,
                            days: p.days.map((x, j) => (j === i ? { ...x, capacity: value } : x)),
                          }));
                        }}
                      />
                    </div>
                    {d.days.length > 2 ? (
                      <div className="s-row">
                        <Button
                          variant="secondary"
                          icon="close"
                          onClick={() => setD((p) => ({ ...p, days: p.days.filter((_, j) => j !== i) }))}
                        >
                          {eventDaysLabels.removeDay}
                        </Button>
                      </div>
                    ) : null}
                  </fieldset>
                ))}
                <div className="s-row">
                  <Button variant="secondary" icon="add" onClick={() => setD((p) => withAddedDay(p, clockNow()))}>
                    {eventDaysLabels.addDay}
                  </Button>
                </div>
                <fieldset className="s-fieldset s-stack s-stack--tight">
                  <legend className="o-t-label s-label">{eventDaysLabels.dayAccess}</legend>
                  <ChipRow className="s-chips-wrap">
                    {dayAccesses.map((a) => (
                      <Chip key={a} selected={d.dayAccess === a} onClick={() => set("dayAccess", a)}>
                        {dayAccessLabels[a]}
                      </Chip>
                    ))}
                  </ChipRow>
                </fieldset>
              </div>
            ) : (
              <div className="s-two">
                <TextField
                  label="Début"
                  name="startsAt"
                  type="datetime-local"
                  value={d.startsAt}
                  onChange={(e) => setStartsAt(e.currentTarget.value)}
                />
                <TextField
                  label="Fin"
                  name="endsAt"
                  type="datetime-local"
                  value={d.endsAt}
                  onChange={(e) => set("endsAt", e.currentTarget.value)}
                />
              </div>
            )}
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
                {(["open", "filtered", "invite_only"] as const).map((a) => (
                  <Chip key={a} selected={d.admission === a} onClick={() => set("admission", a)}>
                    {eventAdmissionLabels[a]}
                  </Chip>
                ))}
              </ChipRow>
            </fieldset>
            <p className="s-muted">
              {d.admission === "open"
                ? "Tout le monde est retenu d'office, dans la limite des places."
                : d.admission === "invite_only"
                  ? "Événement privé : il n'apparaît nulle part et seuls tes invités le voient. Tu invites des personnes, des véhicules ou des adresses e-mail depuis la page de l'événement, une fois publié."
                  : "Tu trieras les candidatures une à une ou en liste, avec ton équipe de filtration."}
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
                {criteriaCountries.map(([code, label]) => (
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
              options={[...previewHourOptions]}
              help="Les abonnés de ta structure peuvent candidater avant l'ouverture publique."
            />
            <fieldset className="s-fieldset s-stack s-stack--tight" data-testid="wizard-high-grades">
              <legend className="o-t-label s-label">{invitationLabels.highGradeTitle}</legend>
              <CheckboxField
                name="highGradePriority"
                label={invitationLabels.highGradePriority}
                checked={d.highGradePriority}
                onChange={(e) => set("highGradePriority", e.currentTarget.checked)}
              />
              <p className="o-t-caption s-muted">{invitationLabels.highGradePriorityHint}</p>
              <SelectField
                label={invitationLabels.highGradePreview}
                name="highGradePreviewHours"
                value={d.highGradePreviewHours}
                onChange={(e) => set("highGradePreviewHours", e.currentTarget.value)}
                options={[...highGradePreviewOptions]}
                help={invitationLabels.highGradePreviewHint}
              />
              <SelectField
                label={invitationLabels.highGradeMin}
                name="highGradeMin"
                value={d.highGradeMin}
                onChange={(e) => set("highGradeMin", e.currentTarget.value as Grade)}
                options={grades.filter((g) => g !== "rodage").map((g) => ({ value: g, label: gradeLabels[g] }))}
                help={`Concerne : ${highGradesText(d.highGradeMin)}.`}
              />
            </fieldset>
            <SelectField
              label="Verrouillage des inscriptions"
              name="lockOffsetMinutes"
              value={d.lockOffsetMinutes}
              onChange={(e) => set("lockOffsetMinutes", e.currentTarget.value)}
              options={[...lockOffsetOptions]}
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
            <fieldset className="s-fieldset s-stack s-stack--tight" data-testid="shop-setting">
              <legend className="o-t-label s-label">Staff de l'événement</legend>
              <CheckboxField
                label={shopLabels.wizardCheckbox}
                checked={d.shopEnabled}
                onChange={() => set("shopEnabled", !d.shopEnabled)}
              />
              <p className="s-muted">{shopLabels.wizardHint}</p>
            </fieldset>
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
          {last && isDraft ? (
            <>
              <Button
                icon="check"
                onClick={() => save("publish")}
                loading={busy}
                disabled={!verified}
                data-testid="wizard-publish"
              >
                {wizardEndLabels.publish}
              </Button>
              <Button variant="secondary" icon="calendar" onClick={() => save("draft")} data-testid="wizard-keep-draft">
                {wizardEndLabels.keepDraft}
              </Button>
              <Button variant="secondary" icon="eye" onClick={() => save("preview")} data-testid="wizard-preview">
                {wizardEndLabels.preview}
              </Button>
            </>
          ) : last ? (
            <Button icon="check" onClick={() => save()} loading={busy}>
              Enregistrer les modifications
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

function Recap({ d }: { d: EventDraft }) {
  const rows: [string, string][] = [
    ["Format", eventFormatLabels[d.format]],
    ["Titre", d.title || "—"],
    d.multiDay
      ? [
          eventDaysLabels.days,
          `${sortedDraftDays(d)
            .map((x) => `${x.date} ${x.startTime}–${x.endTime}`)
            .join(", ")} · ${dayAccessLabels[d.dayAccess]}`,
        ]
      : ["Début", d.startsAt ? d.startsAt.replace("T", " ") : "—"],
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
