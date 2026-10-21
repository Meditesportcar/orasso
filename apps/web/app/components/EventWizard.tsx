// Création et modification d'un événement en huit temps (lot 53, prototype DA v2 `s-create`, V13) : type, lieu,
// arrivées, critères, avant-première, règlement, affiche, « Tout est prêt ». Les douze étapes d'avant sont regroupées
// dans ces temps sans rien perdre (voir `eventWizardSteps` dans `@orasso/shared`). Un brouillon est enregistré à chaque
// temps dès que l'adresse est connue (l'API l'exige) ; un événement publié s'enregistre à la fin, comme avant.
// La saisie reste aussi gardée dans le navigateur (lot 36), et une garde demande avant de quitter sans enregistrer.
import "../styles/wizard.css";
import { Button } from "@orasso/design-system/web";
import {
  type Category,
  draftStart,
  type EventDraft,
  type EventNeedView,
  type EventOrganizer,
  type EventWizardStep,
  eventDaysPayload,
  eventPayload,
  eventStepLabels,
  eventStepProblem,
  eventWizardSteps,
  firstEventProblem,
  initialEventDraft,
  needChanges,
  needsFromSaved,
  posterTexts,
  recurrenceRuleOf,
  type VehicleMake,
  vendorTypeLabels,
  wizardV2Labels as W,
  withCopyOpening,
  wizardEndLabels,
  zoneChanges,
} from "@orasso/shared";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router";
import { apiFetch } from "../lib/api.client";
import { now as clockNow } from "../lib/clock";
import { formatDateTime } from "../lib/format";
import { useEventFormats, useVendorTypes } from "../lib/lists";
import { ArrivalsStep } from "./wizard/ArrivalsStep";
import { CriteriaStep } from "./wizard/CriteriaStep";
import { PlaceStep } from "./wizard/PlaceStep";
import { PosterStep } from "./wizard/PosterStep";
import { PreviewStep } from "./wizard/PreviewStep";
import { ReadyStep } from "./wizard/ReadyStep";
import { RulesStep } from "./wizard/RulesStep";
import { TypeStep } from "./wizard/TypeStep";

type Props = {
  structureId: string;
  structureSlug: string;
  structureName: string;
  followers: number | null;
  verified: boolean;
  categories: Category[];
  makes: VehicleMake[];
  event?: EventOrganizer;
  /** Temps où ouvrir (`?temps=`, ou celui d'un brouillon : `eventResumeStep`). */
  initialStep?: EventWizardStep;
};

const HEADS: Record<EventWizardStep, [string, string]> = {
  type: [W.typeTitle, W.typeIntro],
  lieu: [W.placeTitle, W.placeIntro],
  arrivees: [W.arrivalsTitle, W.arrivalsIntro],
  criteres: [W.criteriaTitle, W.criteriaIntro],
  "avant-premiere": [W.previewTitle, W.previewIntro],
  reglement: [W.rulesTitle, W.rulesIntro],
  affiche: [W.posterTitle, posterTexts.intro],
  publier: [W.readyTitle, W.readyIntro],
};

const errorText = (e: { message: string; details?: Record<string, unknown> }) => {
  const fields = e.details?.fields as Record<string, string> | undefined;
  return fields ? `${e.message} : ${Object.values(fields).join(" ")}` : e.message;
};

export function EventWizard(props: Props) {
  const { structureId, structureSlug, structureName, followers, verified, categories, makes, event } = props;
  const [saved, setSaved] = useState<EventOrganizer | null>(event ?? null);
  const [savedNeeds, setSavedNeeds] = useState<EventNeedView[]>([]);
  const [d, setD] = useState<EventDraft>(() => initialEventDraft(clockNow(), event));
  const vendorSuggestions: readonly string[] = useVendorTypes().map((c) => vendorTypeLabels[c]);
  const formatsOn = useEventFormats();
  const formats = formatsOn.includes(d.format) ? formatsOn : [...formatsOn, d.format];
  const [index, setIndex] = useState(() => Math.max(0, eventWizardSteps.indexOf(props.initialStep ?? "type")));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ownPoster, setOwnPoster] = useState<File | null>(null);
  const step = eventWizardSteps[index] ?? "type";
  const last = index === eventWizardSteps.length - 1;
  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => setD((prev) => ({ ...prev, [key]: value }));
  // Brouillon (création ou brouillon rouvert) : enregistré à chaque temps ; publié : à la fin seulement.
  const isDraft = !saved || saved.status === "draft";

  // Lot 36 : copie d'un événement (duplication) encore en brouillon : l'ouverture des candidatures suit le début.
  const isCopy = Boolean(event?.parentEventId) && event?.status === "draft";
  const copyLead = isCopy && event ? Date.parse(event.startsAt) - Date.parse(event.registrationsOpenAt) : null;
  const start = draftStart(d);
  const lastStart = useRef(start);
  useEffect(() => {
    if (copyLead === null || start === lastStart.current) return;
    lastStart.current = start;
    setD((prev) => withCopyOpening(prev, copyLead, clockNow()));
  }, [copyLead, start]);

  // Missions enregistrées (lot 46) : chargées pour le volet « Sur place ».
  const pristine = useRef(JSON.stringify(d));
  useEffect(() => {
    if (!event) return;
    void apiFetch<EventNeedView[]>(`/events/${event.id}/needs`).then((res) => {
      if (!res.ok) return;
      setSavedNeeds(res.data);
      const needs = needsFromSaved(res.data);
      setD((p) => {
        const next = { ...p, needs };
        if (JSON.stringify(p) === pristine.current) pristine.current = JSON.stringify(next);
        return next;
      });
    });
  }, [event]);

  // Lot 36 : la saisie est gardée dans le navigateur ; effacée après un enregistrement réussi.
  const storageKey = `orasso-wizard:${structureId}:${saved?.id ?? "new"}`;
  const [restored, setRestored] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const leaving = useRef(false);
  const dirty = JSON.stringify(d) !== pristine.current;
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const stored = JSON.parse(raw) as { draft: EventDraft; index: number; savedAt: string };
      if (JSON.stringify(stored.draft) === pristine.current) return;
      setD(stored.draft);
      setIndex(Math.min(Math.max(stored.index, 0), eventWizardSteps.length - 1));
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
  const forget = (key: string) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Rien à faire.
    }
  };
  const discardLocal = () => {
    forget(storageKey);
    setD(JSON.parse(pristine.current) as EventDraft);
    setRestored(null);
  };

  /**
   * Enregistre le brouillon : l'événement (POST la première fois, PATCH ensuite ; l'affiche générée est rendue par
   * l'API avec ses réglages), ses jours, ses zones, ses missions, l'affiche perso ; puis relit l'événement pour garder
   * les identifiants des zones et des missions. Renvoie l'événement enregistré, ou `null` (erreur affichée).
   */
  async function persist(): Promise<EventOrganizer | null> {
    const wasMultiDay = (saved?.days.length ?? 0) > 1;
    if (saved && wasMultiDay && !d.multiDay) {
      const back = await apiFetch(`/events/${saved.id}/days`, { method: "PUT", json: eventDaysPayload(d) });
      if (!back.ok) return setError(back.error.message), null;
    }
    const body = eventPayload(d, Boolean(saved) && d.multiDay);
    const res = saved
      ? await apiFetch<EventOrganizer>(`/events/${saved.id}`, { method: "PATCH", json: body })
      : await apiFetch<EventOrganizer>(`/structures/${structureId}/events`, { method: "POST", json: body });
    if (!res.ok) return setError(errorText(res.error)), null;
    const id = res.data.id;
    if (!saved) {
      forget(storageKey);
      setSaved(res.data);
    }
    if (d.multiDay) {
      const days = await apiFetch(`/events/${id}/days`, { method: "PUT", json: eventDaysPayload(d) });
      if (!days.ok) {
        setIndex(0);
        return setError(days.error.message), null;
      }
    }
    const zones = zoneChanges(saved?.zones ?? [], d.zones);
    for (const z of zones.remove) await apiFetch(`/events/${id}/zones/${z}`, { method: "DELETE" });
    for (const z of zones.update) await apiFetch(`/events/${id}/zones/${z.id}`, { method: "PATCH", json: z.zone });
    for (const zone of zones.create) await apiFetch(`/events/${id}/zones`, { method: "POST", json: zone });
    const needs = needChanges(savedNeeds, d);
    for (const n of needs.remove) await apiFetch(`/events/${id}/needs/${n}`, { method: "DELETE" });
    for (const n of needs.update) await apiFetch(`/events/${id}/needs/${n.id}`, { method: "PATCH", json: n.need });
    for (const need of needs.create) await apiFetch(`/events/${id}/needs`, { method: "POST", json: need });
    if (ownPoster) {
      const form = new FormData();
      form.set("poster", ownPoster);
      await fetch(`/api/events/${id}/poster`, { method: "POST", body: form, credentials: "same-origin" });
      setOwnPoster(null);
    }
    const [fresh, freshNeeds] = await Promise.all([
      apiFetch<EventOrganizer>(`/events/${id}`),
      apiFetch<EventNeedView[]>(`/events/${id}/needs`),
    ]);
    const current = fresh.ok ? fresh.data : res.data;
    setSaved(current);
    const nextNeeds = freshNeeds.ok ? freshNeeds.data : savedNeeds;
    setSavedNeeds(nextNeeds);
    const next: EventDraft = {
      ...d,
      zones: current.zones.map((z) => ({
        id: z.id,
        code: z.code,
        name: z.name,
        capacity: z.capacity ? String(z.capacity) : "",
      })),
      needs: needsFromSaved(nextNeeds),
    };
    setD(next);
    pristine.current = JSON.stringify(next);
    forget(`orasso-wizard:${structureId}:${id}`);
    return current;
  }

  async function go(delta: 1 | -1) {
    setError(null);
    if (delta === -1) return setIndex((i) => Math.max(0, i - 1));
    const problem = eventStepProblem(step, d);
    if (problem) return setError(problem);
    // Enregistré à chaque temps dès que l'adresse est connue (temps 2) ; un événement publié attend la fin.
    if (isDraft && (saved || step !== "type")) {
      setBusy(true);
      const ok = await persist();
      setBusy(false);
      if (!ok) return;
    }
    setIndex((i) => Math.min(i + 1, eventWizardSteps.length - 1));
    window.scrollTo({ top: 0 });
  }

  async function finish(mode: "draft" | "publish" | "preview" | "save") {
    const invalid = firstEventProblem(d);
    if (invalid) {
      setIndex(eventWizardSteps.indexOf(invalid.step));
      return setError(invalid.problem);
    }
    setBusy(true);
    setError(null);
    const s = await persist();
    if (!s) return setBusy(false);
    // Récurrent : la série naît une seule fois, en brouillons, à partir de l'événement complet.
    if (d.recurrence && !s.recurrenceRule && !s.parentEventId) {
      const rec = await apiFetch(`/events/${s.id}/recurrence`, {
        method: "POST",
        json: { rule: recurrenceRuleOf(d.recurrence) },
      });
      if (!rec.ok) {
        setBusy(false);
        return setError(rec.error.message);
      }
    }
    leaving.current = true;
    setSaving(true);
    if (mode === "preview") return window.location.assign(`/e/${s.slug}?apercu=1`);
    if (mode === "publish") {
      const published = await apiFetch(`/events/${s.id}/publish`, { method: "POST" });
      return window.location.assign(
        published.ok
          ? `/orga/${structureSlug}/e/${s.id}?publie=1`
          : `/orga/${structureSlug}/e/${s.id}?erreur=${encodeURIComponent(published.error.message)}`,
      );
    }
    window.location.assign(`/orga/${structureSlug}/e/${s.id}${event ? "" : "?creee=1"}`);
  }

  const [title, intro] = HEADS[step];
  let body: ReactNode = null;
  const stepProps = { d, set, setD };
  if (step === "type")
    body = (
      <TypeStep
        {...stepProps}
        formats={formats}
        recurrenceLocked={Boolean(saved?.recurrenceRule || saved?.parentEventId)}
      />
    );
  else if (step === "lieu") body = <PlaceStep {...stepProps} vendorSuggestions={vendorSuggestions} />;
  else if (step === "arrivees") body = <ArrivalsStep {...stepProps} />;
  else if (step === "criteres") body = <CriteriaStep {...stepProps} categories={categories} makes={makes} />;
  else if (step === "avant-premiere")
    body = <PreviewStep {...stepProps} followers={followers} structureName={structureName} />;
  else if (step === "reglement")
    body = <RulesStep {...stepProps} structureId={structureId} eventId={saved?.id ?? null} />;
  else if (step === "affiche")
    body = (
      <PosterStep
        {...stepProps}
        structureId={structureId}
        structureName={structureName}
        photoUrl={saved?.posterSettings?.photoUrl ?? null}
        ownPoster={ownPoster}
        setOwnPoster={setOwnPoster}
      />
    );
  else body = <ReadyStep d={d} posterUrl={saved?.posterUrl ?? null} />;

  return (
    <div className="wz s-stack" data-testid="event-wizard">
      <div className="s-stack s-stack--tight">
        <span className="o-t-caption s-muted">{W.flowSub(structureName)}</span>
        <div className="wz-steps" aria-hidden="true">
          {eventWizardSteps.map((s, i) => (
            <span key={s} className={i < index ? "is-done" : i === index ? "is-on" : undefined} />
          ))}
        </div>
        <div className="o-t-label s-label" data-testid="wizard-step">
          Étape {index + 1} sur {eventWizardSteps.length} · {eventStepLabels[step]}
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

      <section className="wz-step s-stack" aria-labelledby="step-title" data-step={step}>
        <header className="wz-head">
          <h2 id="step-title" className="wz-title">
            {title}
          </h2>
          <p className="s-muted">{intro}</p>
        </header>
        {body}
        {last && !verified && isDraft && (
          <p className="s-notice" data-testid="not-verified-note">
            Ta structure n'est pas encore vérifiée : tu peux enregistrer ce brouillon, mais pas le publier.{" "}
            <a href={`/orga/${structureSlug}/structure`}>Faire vérifier la structure</a>
          </p>
        )}
        {last && !isDraft && (
          <p className="s-notice s-notice--alert">
            Cet événement est publié : si tu changes la date ou l'adresse, tous les inscrits sont prévenus.
          </p>
        )}
        {error && (
          <p className="s-error" role="alert" data-testid="wizard-error">
            {error}
          </p>
        )}
      </section>

      <div className={last ? "wz-cta wz-cta--end" : "wz-cta"}>
        {last && isDraft ? (
          <>
            <Button
              icon="send"
              onClick={() => void finish("publish")}
              loading={busy}
              disabled={!verified || busy}
              data-testid="wizard-publish"
              fullWidth
            >
              {W.publish}
            </Button>
            <div className="wz-cta__row">
              <Button variant="secondary" icon="back" onClick={() => void go(-1)} aria-label={W.previous}>
                {eventStepLabels[eventWizardSteps[index - 1] ?? "type"]}
              </Button>
              <Button
                variant="secondary"
                icon="calendar"
                onClick={() => void finish("draft")}
                disabled={busy}
                data-testid="wizard-keep-draft"
              >
                {W.draft}
              </Button>
              <Button
                variant="secondary"
                icon="eye"
                onClick={() => void finish("preview")}
                disabled={busy}
                data-testid="wizard-preview"
              >
                {W.preview}
              </Button>
            </div>
          </>
        ) : (
          <>
            {index > 0 ? (
              <Button variant="secondary" icon="back" onClick={() => void go(-1)} data-testid="wizard-back">
                Retour
              </Button>
            ) : (
              <Button variant="secondary" icon="close" href={`/orga/${structureSlug}`}>
                Annuler
              </Button>
            )}
            {last ? (
              <Button icon="check" onClick={() => void finish("save")} loading={busy} data-testid="wizard-save">
                Enregistrer les modifications
              </Button>
            ) : (
              <Button
                icon="next"
                onClick={() => void go(1)}
                loading={busy}
                data-testid="wizard-next"
                className="s-grow"
              >
                {W.continue}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
