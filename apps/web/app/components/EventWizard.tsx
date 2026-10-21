// Création et modification d'un événement en huit temps (lot 53, prototype DA v2 `s-create`, V13) : type, lieu,
// arrivées, critères, avant-première, règlement, affiche, « Tout est prêt ». Les douze étapes d'avant sont regroupées
// dans ces temps sans rien perdre (voir `eventWizardSteps` dans `@orasso/shared`). Un brouillon est enregistré à chaque
// temps dès que l'adresse est connue (l'API l'exige) ; un événement publié s'enregistre à la fin, comme avant.
// Après chaque enregistrement, la saisie est réconciliée avec l'état relu du serveur, champ par champ
// (`reconcileDraft`) : rien n'est marqué enregistré qui ne l'est pas. Dès que le brouillon existe, l'adresse devient
// celle de sa modification (`/orga/<structure>/e/<id>/modifier?temps=…`) : recharger la page ne crée pas de doublon.
// La saisie non enregistrée reste gardée dans le navigateur (lot 36), et une garde demande avant de quitter.
// Le navigateur retient aussi, par événement, le temps le plus avancé atteint et la récurrence choisie (`WizardMemo`).
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
  eventPublishProblem,
  eventResumeStep,
  eventStepLabels,
  eventStepProblem,
  eventWizardSteps,
  firstEventProblem,
  hasRefusals,
  initialEventDraft,
  needChanges,
  needsFromSaved,
  noRefusals,
  parseWizardMemo,
  posterTexts,
  reconcileDraft,
  recurrenceRuleOf,
  refusalMessage,
  sameDraft,
  serializeWizardMemo,
  serverDraft,
  storedStepIndex,
  type VehicleMake,
  vendorTypeLabels,
  wizardV2Labels as W,
  type WizardMemo,
  withArrivalsInHours,
  withCopyOpening,
  withDefaultPoster,
  wizardEndLabels,
  zoneChanges,
} from "@orasso/shared";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useBlocker, useLocation, useNavigate } from "react-router";
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
  /** `?temps=` donné : il prime sur le temps gardé dans le navigateur. */
  stepWanted?: boolean;
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

/** Saisie gardée dans le navigateur (`steps` : découpage avec lequel `index` a été écrit). */
type StoredWizard = { v?: number; steps?: number; draft: EventDraft; index: number; savedAt: string };

const localKey = (structureId: string, eventId: string | null) => `orasso-wizard:${structureId}:${eventId ?? "new"}`;
const memoKey = (eventId: string) => `orasso-wizard-memo:${eventId}`;

/** Résultat d'un enregistrement : `failure`, le message affiché quand quelque chose a été refusé. */
type Saved = { event: EventOrganizer | null; created: string | null; failure: string | null };

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // Stockage indisponible (navigation privée) : l'assistant marche sans.
  }
}
function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Stockage plein ou refusé : sans conséquence.
  }
}
const storedWizard = (draft: EventDraft, index: number): string =>
  JSON.stringify({
    v: 2,
    steps: eventWizardSteps.length,
    draft,
    index,
    savedAt: new Date().toISOString(),
  } satisfies StoredWizard);

export function EventWizard(props: Props) {
  const { structureId, structureSlug, structureName, followers, verified, categories, makes, event } = props;
  const navigate = useNavigate();
  const location = useLocation();
  const [saved, setSaved] = useState<EventOrganizer | null>(event ?? null);
  const [savedNeeds, setSavedNeeds] = useState<EventNeedView[]>([]);
  const [d, setD] = useState<EventDraft>(() => initialEventDraft(clockNow(), event));
  // Toujours la dernière saisie (rendue), y compris celle tapée pendant un enregistrement.
  const latest = useRef(d);
  latest.current = d;
  const vendorSuggestions: readonly string[] = useVendorTypes().map((c) => vendorTypeLabels[c]);
  const formatsOn = useEventFormats();
  const formats = formatsOn.includes(d.format) ? formatsOn : [...formatsOn, d.format];
  const [index, setIndex] = useState(() => Math.max(0, eventWizardSteps.indexOf(props.initialStep ?? "type")));
  // Erreur passée par l'enregistrement qui a créé le brouillon, juste avant de rouvrir sa modification.
  const [error, setError] = useState<string | null>(
    () => (location.state as { wizardError?: string } | null)?.wizardError ?? null,
  );
  const [notice, setNotice] = useState<string | null>(null);
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

  // Ce qui est vraiment enregistré : la saisie en diffère tant que quelque chose reste à envoyer.
  const pristine = useRef<EventDraft>(d);
  const dirty = !sameDraft(d, pristine.current);

  // Missions enregistrées (lot 46) : chargées pour le volet « Sur place », avant de reprendre une saisie gardée.
  const [needsReady, setNeedsReady] = useState(!event);
  useEffect(() => {
    if (!event) return;
    void apiFetch<EventNeedView[]>(`/events/${event.id}/needs`).then((res) => {
      if (res.ok) {
        setSavedNeeds(res.data);
        // Hors de la fonction de mise à jour (React peut l'appeler deux fois) : elle reste sans effet de bord.
        const before = pristine.current;
        const next = { ...before, needs: needsFromSaved(res.data, event.startsAt) };
        pristine.current = next;
        setD((p) => (sameDraft(p, before) ? next : p));
      }
      setNeedsReady(true);
    });
  }, [event]);

  // Mémoire du brouillon (temps atteint, récurrence) : relue à l'ouverture, écrite à chaque temps.
  const memo = useRef<WizardMemo>({ reached: -1, recurrence: null });
  const memoLoaded = useRef(false);
  useEffect(() => {
    memoLoaded.current = true;
    if (event?.status !== "draft") return;
    const stored = parseWizardMemo(readStorage(memoKey(event.id)));
    if (!stored) return;
    memo.current = stored;
    if (stored.recurrence && !event.recurrenceRule && !event.parentEventId) {
      const recurrence = stored.recurrence;
      // Gardée sur l'appareil, elle compte comme enregistrée (`reconcileDraft` fait de même).
      pristine.current = { ...pristine.current, recurrence };
      setD((p) => (p.recurrence ? p : { ...p, recurrence }));
    }
    if (!props.stepWanted && stored.reached >= 0) {
      const resume = eventResumeStep(initialEventDraft(clockNow(), event), true, null, stored.reached);
      setIndex(eventWizardSteps.indexOf(resume));
    }
  }, [event, props.stepWanted]);
  useEffect(() => {
    if (saved?.status !== "draft" || !memoLoaded.current) return;
    const next: WizardMemo = {
      reached: Math.max(memo.current.reached, index),
      recurrence: saved.recurrenceRule ? null : (d.recurrence ?? null),
    };
    if (
      next.reached === memo.current.reached &&
      JSON.stringify(next.recurrence) === JSON.stringify(memo.current.recurrence)
    )
      return;
    memo.current = next;
    writeStorage(memoKey(saved.id), serializeWizardMemo(next));
  }, [saved, index, d.recurrence]);

  // Lot 36 : la saisie non enregistrée est gardée dans le navigateur ; effacée dès qu'elle est enregistrée.
  const storageKey = localKey(structureId, saved?.id ?? null);
  const [restored, setRestored] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const leaving = useRef(false);
  useEffect(() => {
    if (!needsReady) return;
    const raw = readStorage(storageKey);
    if (!raw) return;
    try {
      const stored = JSON.parse(raw) as StoredWizard;
      if (sameDraft(stored.draft, pristine.current)) return;
      setD(stored.draft);
      // `?temps=` prime ; un index écrit avec l'ancien découpage (douze étapes) est ignoré.
      const kept = storedStepIndex(stored.steps, stored.index);
      if (!props.stepWanted && kept !== null) setIndex(kept);
      setRestored(stored.savedAt);
    } catch {
      // Saisie gardée abîmée : ignorée.
    }
  }, [storageKey, props.stepWanted, needsReady]);
  useEffect(() => {
    if (saving || !needsReady) return;
    const timer = setTimeout(() => writeStorage(storageKey, dirty ? storedWizard(d, index) : null), 300);
    return () => clearTimeout(timer);
  }, [d, index, dirty, saving, storageKey, needsReady]);
  useEffect(() => {
    if (!dirty || saving) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (!leaving.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !saving && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  );
  const discardLocal = () => {
    writeStorage(storageKey, null);
    setD(pristine.current);
    setRestored(null);
  };

  /**
   * Enregistre `sent` : l'événement (POST la première fois, PATCH ensuite ; l'affiche générée est rendue par l'API avec
   * ses réglages), ses jours, ses zones, ses missions, l'affiche perso ; relit l'événement et ses missions, puis
   * réconcilie la saisie (`reconcileDraft`). `event` : l'événement enregistré, ou `null` si quelque chose a été refusé
   * (erreur affichée, saisie refusée gardée) ; `created` : identifiant d'un brouillon créé par cet appel.
   */
  async function persist(sent: EventDraft): Promise<Saved> {
    const fail = (failure: string, created: string | null): Saved => {
      setError(failure);
      return { event: null, created, failure };
    };
    const wasMultiDay = (saved?.days.length ?? 0) > 1;
    if (saved && wasMultiDay && !sent.multiDay) {
      const back = await apiFetch(`/events/${saved.id}/days`, { method: "PUT", json: eventDaysPayload(sent) });
      if (!back.ok) return fail(back.error.message, null);
    }
    const body = eventPayload(sent, Boolean(saved) && sent.multiDay);
    const res = saved
      ? await apiFetch<EventOrganizer>(`/events/${saved.id}`, { method: "PATCH", json: body })
      : await apiFetch<EventOrganizer>(`/structures/${structureId}/events`, { method: "POST", json: body });
    if (!res.ok) return fail(errorText(res.error), null);
    const id = res.data.id;
    const created = saved ? null : id;
    if (created) {
      writeStorage(localKey(structureId, null), null);
      setSaved(res.data);
    }
    if (sent.multiDay) {
      const days = await apiFetch(`/events/${id}/days`, { method: "PUT", json: eventDaysPayload(sent) });
      if (!days.ok) {
        setIndex(0);
        return fail(days.error.message, created);
      }
    }
    const refused = noRefusals();
    const zones = zoneChanges(saved?.zones ?? [], sent.zones);
    for (const z of zones.remove) {
      if (!(await apiFetch(`/events/${id}/zones/${z}`, { method: "DELETE" })).ok) refused.removals += 1;
    }
    for (const z of zones.update) {
      const r = await apiFetch(`/events/${id}/zones/${z.id}`, { method: "PATCH", json: z.zone });
      if (!r.ok) refused.zones.push(z.zone.position);
    }
    for (const zone of zones.create) {
      if (!(await apiFetch(`/events/${id}/zones`, { method: "POST", json: zone })).ok)
        refused.zones.push(zone.position);
    }
    const needs = needChanges(savedNeeds, sent);
    for (const n of needs.remove) {
      if (!(await apiFetch(`/events/${id}/needs/${n}`, { method: "DELETE" })).ok) refused.removals += 1;
    }
    for (const n of needs.update) {
      const r = await apiFetch(`/events/${id}/needs/${n.id}`, { method: "PATCH", json: n.need });
      if (!r.ok) refused.needs.push(n.need.position);
    }
    for (const need of needs.create) {
      if (!(await apiFetch(`/events/${id}/needs`, { method: "POST", json: need })).ok)
        refused.needs.push(need.position);
    }
    if (ownPoster) {
      const form = new FormData();
      form.set("poster", ownPoster);
      const sentPoster = await fetch(`/api/events/${id}/poster`, {
        method: "POST",
        body: form,
        credentials: "same-origin",
      }).catch(() => null);
      // Refusée : l'affiche choisie reste, elle repart au prochain enregistrement.
      if (sentPoster?.ok) setOwnPoster(null);
      else refused.poster = true;
    }
    const [fresh, freshNeeds] = await Promise.all([
      apiFetch<EventOrganizer>(`/events/${id}`),
      apiFetch<EventNeedView[]>(`/events/${id}/needs`),
    ]);
    if (!fresh.ok || !freshNeeds.ok) {
      setSaved(res.data);
      // Relecture impossible : rien n'est marqué enregistré, la saisie reste à renvoyer.
      return fail(!fresh.ok ? fresh.error.message : !freshNeeds.ok ? freshNeeds.error.message : "", created);
    }
    setSaved(fresh.data);
    setSavedNeeds(freshNeeds.data);
    const { draft, pristine: kept } = reconcileDraft({
      sent,
      current: latest.current,
      server: serverDraft(fresh.data, freshNeeds.data),
      refused,
    });
    pristine.current = kept;
    latest.current = draft;
    setD(draft);
    if (hasRefusals(refused)) return fail(refusalMessage(sent, refused), created);
    return { event: fresh.data, created, failure: null };
  }

  /** Le brouillon vient d'être créé : la page devient celle de sa modification (recharger ne le recrée pas). */
  function handOff(id: string, at: EventWizardStep, failure: string | null) {
    const draft = latest.current;
    if (!sameDraft(draft, pristine.current)) writeStorage(localKey(structureId, id), storedWizard(draft, index));
    writeStorage(
      memoKey(id),
      serializeWizardMemo({
        reached: Math.max(memo.current.reached, eventWizardSteps.indexOf(at)),
        recurrence: draft.recurrence ?? null,
      }),
    );
    leaving.current = true;
    navigate(`/orga/${structureSlug}/e/${id}/modifier?temps=${at}`, {
      replace: true,
      state: failure ? { wizardError: failure } : null,
    });
  }

  async function go(delta: 1 | -1) {
    if (busy) return;
    setError(null);
    setNotice(null);
    if (delta === -1) return setIndex((i) => Math.max(0, i - 1));
    let sent = d;
    const problem = eventStepProblem(step, sent);
    if (problem) return setError(problem);
    // Quitter « Ton affiche » sans y avoir touché pose ses réglages par défaut (jamais au seul affichage du temps).
    if (step === "affiche" && !sent.poster) {
      sent = withDefaultPoster(sent);
      setD(sent);
      latest.current = sent;
    }
    // Horaires changés avant « Les arrivées » : un créneau devenu hors horaires ferait tout refuser.
    if (step !== "arrivees") {
      const fixed = withArrivalsInHours(sent);
      if (fixed.cleared.length) {
        sent = fixed.draft;
        setD(sent);
        latest.current = sent;
        setNotice(W.arrivalsCleared(fixed.cleared.map((w) => W.arrivalsClearedWho[w]).join(" et ")));
      }
    }
    const nextStep = eventWizardSteps[Math.min(index + 1, eventWizardSteps.length - 1)] ?? "publier";
    // Enregistré à chaque temps dès que l'adresse est connue (temps 2) ; un événement publié attend la fin.
    if (isDraft && (saved || step !== "type")) {
      setBusy(true);
      const out = await persist(sent);
      setBusy(false);
      if (out.created) {
        return handOff(out.created, out.event ? nextStep : step, out.failure);
      }
      if (!out.event) return;
    }
    setIndex((i) => Math.min(i + 1, eventWizardSteps.length - 1));
    window.scrollTo({ top: 0 });
  }

  async function finish(mode: "draft" | "publish" | "preview" | "save") {
    if (busy) return;
    // Publier exige aussi l'affiche ; « Brouillon », « Aperçu » et un événement publié, non.
    const invalid = mode === "publish" ? eventPublishProblem(d) : firstEventProblem(d);
    if (invalid) {
      setIndex(eventWizardSteps.indexOf(invalid.step));
      return setError(invalid.problem);
    }
    setBusy(true);
    setError(null);
    const { event: s } = await persist(d);
    if (!s) return setBusy(false);
    // Récurrent : la série naît une seule fois, en brouillons, à partir de l'événement complet.
    if (d.recurrence && !s.recurrenceRule && !s.parentEventId) {
      const rec = await apiFetch(`/events/${s.id}/recurrence`, {
        method: "POST",
        json: { rule: recurrenceRuleOf(d.recurrence) },
      });
      if (!rec.ok) {
        // Arrêt : rien n'est publié ; la règle reste (mémoire du brouillon) ; l'état du serveur est relu.
        const again = await apiFetch<EventOrganizer>(`/events/${s.id}`);
        if (again.ok) setSaved(again.data);
        setBusy(false);
        return setError(W.seriesFailed(rec.error.message));
      }
    }
    leaving.current = true;
    setSaving(true);
    writeStorage(localKey(structureId, s.id), null);
    if (mode === "preview") return window.location.assign(`/e/${s.slug}?apercu=1`);
    if (mode === "publish") {
      const published = await apiFetch(`/events/${s.id}/publish`, { method: "POST" });
      if (published.ok) writeStorage(memoKey(s.id), null);
      return window.location.assign(
        published.ok
          ? `/orga/${structureSlug}/e/${s.id}?publie=1`
          : `/orga/${structureSlug}/e/${s.id}?erreur=${encodeURIComponent(published.error.message)}`,
      );
    }
    window.location.assign(`/orga/${structureSlug}/e/${s.id}${mode === "draft" ? "?creee=1" : ""}`);
  }

  const [title, intro] = HEADS[step];
  let body: ReactNode = null;
  const stepProps = { d, set, setD };
  if (step === "type")
    body = (
      <TypeStep
        {...stepProps}
        formats={formats}
        recurrenceLocked={Boolean(saved?.recurrenceRule || saved?.parentEventId || !isDraft)}
        seriesExists={Boolean(saved?.recurrenceRule)}
        draftOnly={!isDraft}
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
        {notice ? (
          <p className="s-notice" role="status" data-testid="wizard-notice">
            {notice}
          </p>
        ) : null}
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
              <Button
                variant="secondary"
                icon="back"
                onClick={() => void go(-1)}
                disabled={busy}
                aria-label={W.previous}
              >
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
              <Button
                variant="secondary"
                icon="back"
                onClick={() => void go(-1)}
                disabled={busy}
                data-testid="wizard-back"
              >
                Retour
              </Button>
            ) : (
              <Button variant="secondary" icon="close" href={`/orga/${structureSlug}`} disabled={busy}>
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
