// Assistant de création et de modification d'un événement dans l'appli (lot 35b, D20 ; lot 53 : les temps de
// `s-create`, comme le site ; lot R7l2 : neuf avec « Votes du public ») : type, lieu avec épingle, arrivées, critères,
// avant-première, règlement, votes, affiche, « Tout est prêt » (Publier / Brouillon / Aperçu). Barre de progression, « Continuer » en bouton principal collant.
// Un brouillon est enregistré à chaque temps dès que l'adresse est connue (l'API l'exige) ; un événement publié
// s'enregistre à la fin. Après chaque enregistrement, la saisie est réconciliée avec l'état relu du serveur, champ par
// champ (`reconcileDraft`) : rien n'est marqué enregistré qui ne l'est pas. Dès que le brouillon existe, l'écran devient
// celui de sa modification (`/evenement/<id>/modifier?temps=…`).
// La saisie d'un brouillon reste sur le téléphone tant qu'elle n'est pas synchronisée (une par création, puis une par
// événement), et reprise au retour (« Recommencer » l'efface) ; le téléphone retient aussi, par brouillon, le temps le
// plus avancé atteint et la récurrence choisie (`WizardMemo`). Hors réseau, l'assistant reste sur son temps.
// L'API garde ses règles (structure suspendue, double authentification, 423 après le début, 409 `day_in_use`).
import { Button, tokens } from "@orasso/design-system/native";
import {
  afterNeedWrites,
  afterZoneWrites,
  type CategoryOption,
  cancelIsAnnounced,
  decideClick,
  draftStart,
  type EventDraft,
  type EventFormat,
  type EventNeedView,
  type EventOrganizer,
  type EventWizardStep,
  eventResumeStep,
  eventStepLabels,
  eventStepProblem,
  eventWizardSteps,
  hasRefusals,
  initialEventDraft,
  eventEditorLabels as L,
  type NeedDraft,
  needsFromSaved,
  newTicket,
  nextEpoch,
  notifyChanged,
  notifyFieldsOfDraft,
  notifySavedCode,
  notifyStart,
  notifyTiming,
  notifyTimingLine,
  notifyTimingOfSave,
  posterTexts,
  reconcileDraft,
  recurrenceRuleOf,
  refusalMessage,
  sameDraft,
  serverDraft,
  settleWait,
  type VehicleMake,
  vendorTypeLabels,
  voteOrgaLabels,
  wizardV2Labels as W,
  type WaitedAction,
  type WaitTicket,
  type WizardMemo,
  waitCancelReason,
  waitIsStale,
  withArrivalsInHours,
  withCopyOpening,
  withDefaultPoster,
  withLoadedNeeds,
  withNeedKeys,
  withServerNeeds,
  wizardEndLabels,
} from "@orasso/shared";
import { randomUUID } from "expo-crypto";
import { useNavigation, useRouter } from "expo-router";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { now } from "@/lib/clock";
import { draftWorthKeeping, type StoredDraft } from "@/lib/eventDraft";
import { eventDraftStoreForAccount } from "@/lib/eventDraftStore";
import { saveEvent } from "@/lib/eventSave";
import { formatStamp } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { useEventFormats, useVendorTypes } from "@/lib/lists";
import type { PickedPhoto } from "@/lib/photos";
import { useSession } from "@/lib/session";
import { imageForm } from "@/lib/structureFiles";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { RecipientsBanner } from "../../event/NotifyPrefsSheet";
import { ConfirmSheet } from "../ConfirmSheet";
import { OrgaFailure, useOrga } from "../OrgaGate";
import { BackSquare, StepRail } from "./StepRail";
import {
  AfficheTemps,
  ArriveesTemps,
  AvantTemps,
  CriteresTemps,
  LieuTemps,
  PretTemps,
  ReglementTemps,
  TypeTemps,
} from "./Temps";
import type { StepContext } from "./types";
import { VotesTemps } from "./VotesTemps";

const { space1, space2, space3 } = tokens.spacing;

const SCREENS: Record<EventWizardStep, (ctx: StepContext) => ReactNode> = {
  type: TypeTemps,
  lieu: LieuTemps,
  arrivees: ArriveesTemps,
  criteres: CriteresTemps,
  "avant-premiere": AvantTemps,
  reglement: ReglementTemps,
  votes: VotesTemps,
  affiche: AfficheTemps,
  publier: PretTemps,
};

const HEADS: Record<EventWizardStep, [string, string]> = {
  type: [W.typeTitle, W.typeIntro],
  lieu: [W.placeTitle, W.placeIntro],
  arrivees: [W.arrivalsTitle, W.arrivalsIntro],
  criteres: [W.criteriaTitle, W.criteriaIntro],
  "avant-premiere": [W.previewTitle, W.previewIntro],
  reglement: [W.rulesTitle, W.rulesIntro],
  votes: [voteOrgaLabels.stepTitle, voteOrgaLabels.stepIntro],
  affiche: [W.posterTitle, posterTexts.intro],
  publier: [W.readyTitle, W.readyIntro],
};

/** Résultat d'un enregistrement : `created`, un brouillon créé par cet appel ; `failure`, ce qui a été refusé. */
type Saved = { event: EventOrganizer | null; created: string | null; failure: unknown };

export function EventWizard({
  event,
  notice: initialNotice,
  initialStep,
}: {
  event?: EventOrganizer;
  notice?: string | null;
  /** Lot 53 : temps où ouvrir (`?temps=`, prime sur tout) ; sans lui, un brouillon rouvre où on l'a laissé. */
  initialStep?: EventWizardStep | null;
}) {
  const router = useRouter();
  const { structureId } = useOrga();
  const { clearEventDraft, keepEventDraftPoster, loadEventDraft, loadWizardMemo, saveEventDraft, saveWizardMemo } =
    useRef(eventDraftStoreForAccount()).current;
  const editing = Boolean(event);
  const [saved, setSaved] = useState<EventOrganizer | undefined>(event);
  const [savedNeeds, setSavedNeeds] = useState<EventNeedView[]>([]);
  const [d, setDraft] = useState<EventDraft>(() => initialEventDraft(now(), event));
  // Toujours la dernière saisie (rendue), y compris celle tapée pendant un enregistrement.
  const latest = useRef(d);
  latest.current = d;
  const [index, setIndex] = useState(() =>
    eventWizardSteps.indexOf(
      event ? eventResumeStep(initialEventDraft(now(), event), event.status === "draft", initialStep) : "type",
    ),
  );
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [poster, setPosterState] = useState<PickedPhoto | null>(null);
  const [keptPoster, setKeptPoster] = useState<PickedPhoto | null>(null);
  // Envoi de la photo de l'affiche (temps 7), tenu ici (correctif 53c) : on ne poursuit pas avant sa fin.
  const [photoSending, setPhotoSending] = useState<number | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const halted = busy || photoSending !== null;
  const [quitting, setQuitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null);
  // La saisie gardée est relue une fois avant d'écrire quoi que ce soit (sinon on l'écraserait).
  const [loaded, setLoaded] = useState(false);
  const [resumed, setResumed] = useState<StoredDraft | null>(null);
  const [showResume, setShowResume] = useState(false);
  // Ce qui est vraiment enregistré : la saisie en diffère tant que quelque chose reste à envoyer.
  const pristine = useRef<EventDraft>(d);
  const done = useRef(false);
  const leaving = useRef(false);
  const pendingLeave = useRef<(() => void) | null>(null);
  const memo = useRef<WizardMemo>({ reached: -1, recurrence: null });
  const isDraft = !saved || saved.status === "draft";
  // Un brouillon (création ou brouillon rouvert) garde sa saisie sur le téléphone ; un événement publié, non.
  const keepOnDevice = isDraft;
  const dirty = !sameDraft(d, pristine.current);

  const structure = useApi(() => api.orgStructure(structureId), [structureId]);
  const refs = useApi<{ categories: CategoryOption[]; makes: VehicleMake[] }>(
    async () => {
      // Lot R5a, tour 2 : avec les styles en pause, pour garder ceux déjà choisis dans les critères.
      const [categories, makes] = await Promise.allSettled([api.categories({ paused: "1" }), api.makes()]);
      return {
        categories: categories.status === "fulfilled" ? categories.value : [],
        makes: makes.status === "fulfilled" ? makes.value : [],
      };
    },
    [],
    { cacheKey: "wizard-references-all" },
  );

  // À l'ouverture : missions enregistrées (lot 46), mémoire du brouillon, puis saisie gardée sur le téléphone.
  // Correctif 53c : les missions rejoignent la saisie quels que soient les autres champs (`withLoadedNeeds` : une
  // mission inconnue de la saisie est ajoutée, une mission déjà dans la saisie garde ses modifications), y compris une
  // saisie gardée restaurée. Tant qu'elles ne sont pas chargées, rien ne s'enregistre sur le serveur ; la saisie reste
  // gardée sur le téléphone. Échec : message et « Recharger les missions », qui ne relance que ce chargement.
  const [needsState, setNeedsState] = useState<"loading" | "ok" | "failed">(event ? "loading" : "ok");
  const needsFailed = needsState === "failed";
  // Enregistrer sur le serveur : ouverture faite et missions chargées avec succès (tour 3 : pas pendant un rechargement).
  const canSave = loaded && needsState === "ok";
  // R9-assistant (parité avec le site, D20) : un clic donné avant la fin de l'ouverture ou pendant le chargement des
  // missions est mis en attente (`waiting`), puis exécuté un rendu plus tard (`due`, la saisie restaurée est alors à
  // jour). Panne de lecture, changement d'étape ou sortie l'annulent ; un seul clic à la fois.
  // Tour 2 : l'attente est liée à l'étape, à la saisie (`epoch`) et au compte vus au clic ; tout changement de l'un
  // d'eux, ou la fenêtre « Quitter », l'annule (`waiting` et `due`).
  const [waiting, setWaiting] = useState<WaitTicket | null>(null);
  const [due, setDue] = useState<WaitTicket | null>(null);
  const queued = (waiting ?? due)?.action ?? null;
  // Tour 4 : pendant l'attente l'étape est figée (champs, frise, boutons) ; seul « Annuler » rend la main.
  const frozen = queued !== null;
  const queuedRef = useRef(false);
  queuedRef.current = frozen;
  // L'écran perd le focus (écran ouvert par-dessus, onglet changé) : l'attente est annulée.
  const [blurred, setBlurred] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const { me } = useSession();
  const account = me?.user.id ?? null;
  const waitCtx = useMemo(
    () => ({ step: index, epoch, account, leaving: quitting || blurred }),
    [index, epoch, account, quitting, blurred],
  );
  const clickState = needsFailed ? "failed" : canSave ? "ok" : "loading";
  // Chaque chargement a son tour : la réponse d'un chargement dépassé (ou d'un écran quitté) est ignorée.
  const needsTurn = useRef(0);
  const fetchNeeds = useCallback(async (ev: EventOrganizer): Promise<NeedDraft[] | null | undefined> => {
    const turn = ++needsTurn.current;
    setNeedsState("loading");
    const list = await api.eventNeeds(ev.id).catch(() => null);
    if (turn !== needsTurn.current) return undefined;
    if (!list) {
      setNeedsState("failed");
      return null;
    }
    const loadedNeeds = needsFromSaved(list, ev.startsAt);
    setSavedNeeds(list);
    pristine.current = withServerNeeds(pristine.current, loadedNeeds);
    setDraft((p) => withLoadedNeeds(p, loadedNeeds));
    setNeedsState("ok");
    return loadedNeeds;
  }, []);
  useEffect(
    () => () => {
      needsTurn.current += 1;
    },
    [],
  );
  async function reloadNeeds() {
    if (event) await fetchNeeds(event);
  }
  useEffect(() => {
    let alive = true;
    void (async () => {
      let loadedNeeds: NeedDraft[] | null = null;
      if (event) {
        loadedNeeds = (await fetchNeeds(event)) ?? null;
        if (!alive) return;
        if (event.status === "draft") {
          const stored = await loadWizardMemo(event.id);
          if (!alive) return;
          if (stored) {
            memo.current = stored;
            if (stored.recurrence && !event.recurrenceRule && !event.parentEventId) {
              const recurrence = stored.recurrence;
              pristine.current = { ...pristine.current, recurrence };
              setDraft((p) => (p.recurrence ? p : { ...p, recurrence }));
            }
            if (!initialStep && stored.reached >= 0) {
              setIndex(eventWizardSteps.indexOf(eventResumeStep(pristine.current, true, null, stored.reached)));
            }
          }
        }
      }
      if (!event || event.status === "draft") {
        const stored = await loadEventDraft(structureId, event?.id);
        if (!alive) return;
        // Missions chargées fusionnées : une saisie gardée ne supprime jamais une mission qu'elle ne connaissait pas.
        const restored = stored && loadedNeeds ? withLoadedNeeds(stored.draft, loadedNeeds) : stored?.draft;
        if (stored && restored && !sameDraft(restored, pristine.current)) {
          setDraft(restored);
          if (!initialStep) {
            setIndex(stored.step ?? eventWizardSteps.indexOf(eventResumeStep(stored.draft, true, null, null)));
          }
          setCreatedId(stored.createdId);
          setPosterState(stored.poster ?? null);
          setKeptPoster(stored.poster ?? null);
          setResumed(stored);
          setEpoch((e) => e + 1);
          // Tour 4 : le bandeau « saisie reprise » s'affiche aussi sur un autre temps si CETTE restauration annule une attente.
          if (queuedRef.current) setShowResume(true);
        }
      }
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [event, structureId, initialStep, fetchNeeds, loadEventDraft, loadWizardMemo]);

  // Saisie gardée sur le téléphone : une création dès qu'elle vaut la peine, un brouillon tant qu'il n'est pas
  // synchronisé (effacée quand la saisie est enregistrée).
  const pending = useRef<(() => void) | null>(null);
  const eventId = saved?.id ?? null;
  useEffect(() => {
    if (!keepOnDevice || !loaded) return;
    const keep = eventId ? dirty || Boolean(keptPoster) : draftWorthKeeping(d);
    const write = () => {
      pending.current = null;
      if (!keep) {
        if (eventId) void clearEventDraft(structureId, eventId);
        return;
      }
      void saveEventDraft(
        structureId,
        { draft: d, step: index, createdId, savedAt: now().toISOString(), poster: keptPoster },
        eventId,
      );
    };
    pending.current = write;
    const timer = setTimeout(write, 400);
    return () => clearTimeout(timer);
  }, [
    keepOnDevice,
    loaded,
    d,
    dirty,
    index,
    createdId,
    structureId,
    keptPoster,
    eventId,
    clearEventDraft,
    saveEventDraft,
  ]);
  useEffect(() => () => pending.current?.(), []);

  // Mémoire du brouillon : temps le plus avancé atteint, récurrence (jusqu'à la création de la série).
  useEffect(() => {
    if (saved?.status !== "draft" || !loaded) return;
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
    void saveWizardMemo(saved.id, next);
  }, [saved, loaded, index, d.recurrence, saveWizardMemo]);

  const setPoster = useCallback(
    (photo: PickedPhoto | null) => {
      setPosterState(photo);
      if (!keepOnDevice) return;
      void keepEventDraftPoster(structureId, photo, eventId).then(setKeptPoster);
    },
    [keepOnDevice, structureId, eventId, keepEventDraftPoster],
  );

  // Lot 36 : copie d'un événement encore en brouillon : l'ouverture des candidatures suit le début.
  const isCopy = Boolean(event?.parentEventId) && event?.status === "draft";
  const set = useCallback(<K extends keyof EventDraft>(key: K, value: EventDraft[K]) => {
    // Tour 3 : une modification PAR LA PERSONNE (un champ) change `epoch` et annule le clic en attente ; les fusions
    // automatiques (missions, valeurs calculées) passent par `setDraft` et ne l'annulent pas. Tour 5 : seulement si la
    // valeur change vraiment (un `onBlur` qui rappelle `onChange` sans changement n'annule rien).
    const next = { ...latest.current, [key]: value };
    setEpoch((e) => nextEpoch(e, !sameDraft(next, latest.current)));
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);
  const copyLead = isCopy && event ? Date.parse(event.startsAt) - Date.parse(event.registrationsOpenAt) : null;
  const start = draftStart(d);
  const lastStart = useRef(start);
  useEffect(() => {
    if (copyLead === null || start === lastStart.current) return;
    lastStart.current = start;
    setDraft((prev) => withCopyOpening(prev, copyLead, now()));
  }, [copyLead, start]);
  const setD = useCallback((update: (prev: EventDraft) => EventDraft) => {
    setEpoch((e) => nextEpoch(e, !sameDraft(update(latest.current), latest.current)));
    setDraft(update);
  }, []);

  const step = eventWizardSteps[index] ?? "type";
  const last = index === eventWizardSteps.length - 1;
  // Lot R8n2 (R8.11) : sur un événement publié, un changement d'heure ou de lieu prévient tout seul ; la confirmation le
  // dit avant « Enregistrer les modifications » (nombre lu par `notify-preview`, moment selon l'heure et le départ).
  const savedFields = useMemo(() => (saved ? notifyFieldsOfDraft(initialEventDraft(now(), saved)) : null), [saved]);
  const notifies =
    savedFields !== null && saved?.status === "published" && last && notifyChanged(savedFields, notifyFieldsOfDraft(d));
  const preview = useApi(() => api.notifyPreview(saved?.id ?? ""), [saved?.id, notifies], { enabled: notifies });
  const previewCount = preview.data ? preview.data.recipients : null;
  const notifyShown = notifies && (preview.data !== null || preview.error !== null) && previewCount !== 0;
  // L'heure se rafraîchit pendant que la confirmation est affichée (21 h 58 puis 22 h 01 : « à 8 h »).
  const [, setNotifyTick] = useState(0);
  useEffect(() => {
    if (!notifyShown) return;
    const timer = setInterval(() => setNotifyTick((n) => n + 1), 20_000);
    return () => clearInterval(timer);
  }, [notifyShown]);
  const notifyClock = now();
  const notifyWhen = notifyTiming({
    now: notifyClock,
    startsAt: notifyStart(saved?.startsAt ?? null, draftStart(d)),
    endsAt: notifyFieldsOfDraft(d).endsAt ?? saved?.endsAt ?? null,
  });
  const formatsOn = useEventFormats();
  const formats = useMemo<EventFormat[]>(
    () => (formatsOn.includes(d.format) ? formatsOn : [...formatsOn, d.format]),
    [formatsOn, d.format],
  );
  const vendorTypes = useVendorTypes();
  const vendorSuggestions = useMemo(() => vendorTypes.map((c) => vendorTypeLabels[c]), [vendorTypes]);

  const leave = () => {
    leaving.current = true;
    setWaiting(null);
    setDue(null);
    const pendingAction = pendingLeave.current;
    pendingLeave.current = null;
    if (pendingAction) return pendingAction();
    return router.canGoBack() ? router.back() : router.replace(saved ? `/evenement/${saved.id}` : "/evenements");
  };
  const close = () => (dirty || (keepOnDevice && draftWorthKeeping(d)) ? setQuitting(true) : leave());

  // Lot 36 : une modification non enregistrée n'est plus perdue en quittant l'écran par un autre chemin.
  const navigation = useNavigation();
  useEffect(() => {
    const off = [
      navigation.addListener("blur", () => setBlurred(true)),
      navigation.addListener("focus", () => setBlurred(false)),
    ];
    return () => {
      for (const o of off) o();
    };
  }, [navigation]);
  useEffect(() => {
    return navigation.addListener("beforeRemove", (e) => {
      if (leaving.current || done.current) return;
      if (keepOnDevice || !dirty) {
        // Sortie sans fenêtre « Quitter » (tour 3) : elle annule quand même le clic en attente.
        leaving.current = true;
        setWaiting(null);
        setDue(null);
        return;
      }
      e.preventDefault();
      pendingLeave.current = () => navigation.dispatch(e.data.action);
      setQuitting(true);
    });
  }, [navigation, keepOnDevice, dirty]);

  /**
   * Enregistre `sent` (voir `saveEvent`), puis réconcilie la saisie avec l'état relu du serveur. `event` : l'événement
   * enregistré, ou `null` si quelque chose a été refusé (erreur affichée, saisie refusée gardée).
   */
  async function persist(input: EventDraft, validate: boolean | "publish"): Promise<Saved> {
    // Missions pas encore chargées : l'enregistrement ne peut pas les comparer (correctif 53c).
    if (!canSave) {
      const failure = needsFailed ? W.needsFailed : W.needsLoading;
      setError(failure);
      return { event: null, created: null, failure };
    }
    // Chaque nouvelle mission reçoit sa clé de création avant de partir (création idempotente, correctif 53c).
    const sent = withNeedKeys(input, randomUUID);
    if (sent !== input) {
      latest.current = sent;
      setDraft(sent);
    }
    const form = poster ? await imageForm(poster, "poster", "affiche.jpg") : null;
    const res = await saveEvent(api, {
      structureId,
      draft: sent,
      event: saved,
      savedNeeds,
      createdId,
      poster: form,
      validate,
    });
    if (!res.ok) {
      // Missions écrites avant la panne : identifiants repris, suppressions faites retirées (correctif 53c).
      if (res.needWrites) {
        const after = afterNeedWrites({ savedNeeds, sent, current: latest.current, writes: res.needWrites });
        setSavedNeeds(after.savedNeeds);
        latest.current = after.draft;
        setDraft(after.draft);
      }
      // Zones créées avant la panne : identifiants repris, le nouvel essai les met à jour (tour 3).
      if (res.zoneWrites?.created.length) {
        const draft = afterZoneWrites(sent, latest.current, res.zoneWrites);
        latest.current = draft;
        setDraft(draft);
      }
      // Temps invalide ou jours refusés : on y retourne ; une panne (réseau…) laisse sur le temps courant.
      if (res.step) setIndex(eventWizardSteps.indexOf(res.step));
      setError(res.error);
      if (res.createdId) setCreatedId(res.createdId);
      return { event: null, created: saved ? null : res.createdId, failure: res.error };
    }
    const created = saved ? null : res.event.id;
    setSaved(res.event);
    setSavedNeeds(res.needs);
    if (poster && !res.refused.poster) {
      setPosterState(null);
      setKeptPoster(null);
    }
    const reconciled = reconcileDraft({
      sent,
      current: latest.current,
      server: serverDraft(res.event, res.needs),
      refused: res.refused,
    });
    pristine.current = reconciled.pristine;
    latest.current = reconciled.draft;
    setDraft(reconciled.draft);
    if (hasRefusals(reconciled.refused)) {
      const failure = refusalMessage(sent, reconciled.refused);
      setError(failure);
      return { event: null, created, failure };
    }
    return { event: res.event, created, failure: null };
  }

  /** Le brouillon vient d'être créé : l'écran devient celui de sa modification (sa saisie gardée sous son identifiant). */
  async function handOff(id: string, at: EventWizardStep, failure: unknown) {
    pending.current = null;
    const draft = latest.current;
    const photo = keptPoster ? await keepEventDraftPoster(structureId, keptPoster, id) : null;
    if (!sameDraft(draft, pristine.current) || photo) {
      await saveEventDraft(
        structureId,
        { draft, step: eventWizardSteps.indexOf(at), createdId: null, savedAt: now().toISOString(), poster: photo },
        id,
      );
    }
    await clearEventDraft(structureId);
    await saveWizardMemo(id, {
      reached: Math.max(memo.current.reached, eventWizardSteps.indexOf(at)),
      recurrence: draft.recurrence ?? null,
    });
    done.current = true;
    leaving.current = true;
    router.replace({
      pathname: "/evenement/[id]/modifier",
      params: { id, temps: at, ...(failure ? { avert: errorMessage(failure) } : {}) },
    });
  }

  /** `resumed` : le clic vient de l'attente (il ne se compte pas lui-même comme un second clic). */
  async function go(delta: 1 | -1, resumed = false) {
    if (busy) return;
    if (photoSending !== null) return setError(W.posterStillSending);
    setError(null);
    setNotice(null);
    if (delta === -1) return setIndex((i) => Math.max(0, i - 1));
    const click = decideClick(clickState, resumed ? null : queued, true);
    if (click === "ignore") return;
    if (click === "wait") return setWaiting(newTicket("next", waitCtx));
    if (click === "refuse") return setError(W.needsFailed);
    let sent = d;
    const problem = eventStepProblem(step, sent);
    if (problem) return setError(problem);
    // Quitter « Ton affiche » sans y avoir touché pose ses réglages par défaut (jamais au seul affichage du temps).
    if (step === "affiche" && !sent.poster) {
      sent = withDefaultPoster(sent);
      latest.current = sent;
      setDraft(sent);
    }
    // Horaires changés avant « Les arrivées » : un créneau devenu hors horaires ferait tout refuser.
    if (step !== "arrivees") {
      const fixed = withArrivalsInHours(sent);
      if (fixed.cleared.length) {
        sent = fixed.draft;
        latest.current = sent;
        setDraft(sent);
        setNotice(W.arrivalsCleared(fixed.cleared.map((w) => W.arrivalsClearedWho[w]).join(" et ")));
      }
    }
    const nextStep = eventWizardSteps[Math.min(index + 1, eventWizardSteps.length - 1)] ?? "publier";
    if (isDraft && (saved || step !== "type")) {
      setBusy(true);
      try {
        const out = await persist(sent, false);
        if (out.created) return void (await handOff(out.created, out.event ? nextStep : step, out.failure));
        if (!out.event) return;
      } finally {
        setBusy(false);
      }
    }
    setIndex((i) => Math.min(i + 1, eventWizardSteps.length - 1));
  }

  async function restart() {
    // Tour 3 : « Recommencer » annule l'attente tout de suite, avant l'effacement (asynchrone) de la saisie gardée.
    setWaiting(null);
    setDue(null);
    setEpoch((e) => e + 1);
    setShowResume(false);
    pending.current = null;
    await clearEventDraft(structureId, eventId);
    const fresh = eventId ? pristine.current : initialEventDraft(now());
    pristine.current = fresh;
    setDraft(fresh);
    if (!eventId) setIndex(0);
    setCreatedId(null);
    setPosterState(null);
    setKeptPoster(null);
    setResumed(null);
    setEpoch((e) => e + 1);
    setError(null);
  }

  /** Fin de l'assistant : Publier, Brouillon, Aperçu (brouillon) ou « Enregistrer les modifications » (publié). */
  async function finish(mode: "draft" | "publish" | "preview" | "save", resumed = false) {
    if (busy) return;
    if (photoSending !== null) return setError(W.posterStillSending);
    const click = decideClick(clickState, resumed ? null : queued, true);
    if (click === "ignore") return;
    if (click === "wait") {
      setError(null);
      return setWaiting(newTicket(mode, waitCtx));
    }
    if (click === "refuse") return setError(W.needsFailed);
    const notifiedBefore = saved?.lastNotify?.createdAt ?? null;
    setBusy(true);
    setError(null);
    try {
      // Publier exige aussi l'affiche ; « Brouillon », « Aperçu » et un événement publié, non.
      const { event: s } = await persist(d, mode === "publish" ? "publish" : true);
      if (!s) return;
      // Récurrent : la série naît une seule fois, en brouillons, à partir de l'événement complet. Si elle échoue, on
      // s'arrête (rien n'est publié), la règle reste gardée et l'état du serveur est relu : « Publier » la retente.
      if (d.recurrence && !s.recurrenceRule && !s.parentEventId) {
        try {
          await api.createRecurrence(s.id, recurrenceRuleOf(d.recurrence));
        } catch (e) {
          const again = await api.orgEvent(s.id).catch(() => null);
          if (again) setSaved(again);
          setError(W.seriesFailed(errorMessage(e)));
          return;
        }
      }
      done.current = true;
      pending.current = null;
      await clearEventDraft(structureId, s.id);
      if (mode === "preview") {
        router.replace({ pathname: "/e/[slug]", params: { slug: s.slug } });
        return;
      }
      // « Brouillon » : « Brouillon enregistré. » (le brouillon a déjà un identifiant depuis le temps 2).
      let fait = mode === "draft" ? "cree" : "modifie";
      // Lot R8n2 : « Enregistré : 148 inscrits prévenus », lue sur l'événement (EventPage) avec le même code.
      if (mode === "save" && notifyShown) {
        // Le moment décidé par l'API (pas un calcul local) : une échéance franchie pendant l'enregistrement ne trompe pas.
        const when = notifyTimingOfSave(notifiedBefore, s.lastNotify);
        if (when) fait = `prevenus:${notifySavedCode(previewCount, when)}`;
      }
      const warnings: string[] = [];
      if (mode === "publish") {
        try {
          await api.publishEvent(s.id);
          await saveWizardMemo(s.id, null);
          fait = "publie";
        } catch (e) {
          warnings.push(errorMessage(e));
        }
      }
      router.replace({
        pathname: "/evenement/[id]",
        params: { id: s.id, fait, ...(warnings.length ? { avert: warnings.join(" ") } : {}) },
      });
    } finally {
      setBusy(false);
    }
  }

  // Le clic en attente part dès que l'ouverture et les missions sont prêtes (ou tombe si leur lecture a échoué).
  const runWaited = useRef<(action: WaitedAction) => void>(() => undefined);
  runWaited.current = (action) => void (action === "next" ? go(1, true) : finish(action, true));
  useEffect(() => {
    const out = settleWait(waiting?.action ?? null, clickState);
    if (out === "run" && waiting) {
      if (!waitIsStale(waiting, waitCtx)) setDue(waiting);
      setWaiting(null);
    } else if (out === "fail") {
      setWaiting(null);
      setError(W.needsFailed);
    }
  }, [waiting, clickState, waitCtx]);
  useEffect(() => {
    if (!due) return;
    setDue(null);
    // Étape, saisie ou compte changés depuis le clic, ou fenêtre « Quitter » ouverte : l'action ne part pas.
    if (!waitIsStale(due, waitCtx) && !leaving.current && !done.current) runWaited.current(due.action);
  }, [due, waitCtx]);
  // Étape, saisie ou compte changés, ou fenêtre « Quitter l'assistant ? » ouverte : l'attente est annulée (reclic voulu).
  useEffect(() => {
    const gone = leaving.current || done.current;
    for (const t of [waiting, due]) {
      // Tour 5 : une modification (ou une restauration) qui annule le clic le dit, plus d'annulation silencieuse.
      if (t && !gone && cancelIsAnnounced(waitCancelReason(t, waitCtx))) setNotice(W.needsWaitChanged);
    }
    if (waiting && (gone || waitIsStale(waiting, waitCtx))) setWaiting(null);
    if (due && (gone || waitIsStale(due, waitCtx))) setDue(null);
  }, [waiting, due, waitCtx]);

  const ctx: StepContext = {
    d,
    set,
    setD,
    editing,
    event: saved,
    verified: structure.data?.verified ?? true,
    structureId,
    structureName: structure.data?.name ?? "",
    followers: structure.data?.followersCount ?? null,
    categories: refs.data?.categories ?? [],
    makes: refs.data?.makes ?? [],
    formats,
    vendorSuggestions,
    poster,
    setPoster,
    photoSending,
    setPhotoSending,
    photoError,
    setPhotoError,
    openStructure: () => router.push("/(orga)/structure"),
  };
  const Screen = SCREENS[step];
  const [title, intro] = HEADS[step];
  const canPublish = structure.data?.verified ?? false;

  return (
    <FlowScreen
      title={editing ? L.editTitle : L.newTitle}
      facts={structure.data?.name ?? event?.title}
      onClose={close}
      footer={
        last && isDraft ? (
          <View style={styles.end}>
            <Button
              icon="send"
              loading={halted || queued === "publish"}
              disabled={halted || needsFailed || !canPublish || (queued !== null && queued !== "publish")}
              onPress={() => void finish("publish")}
              testID="wizard-publish"
            >
              {queued === "publish" ? W.needsWaiting : W.publish}
            </Button>
            <View style={styles.actions}>
              <BackSquare
                disabled={halted || frozen}
                onPress={() => void go(-1)}
                label={W.previous}
                testID="wizard-back"
              />
              <Button
                variant="secondary"
                icon="calendar"
                loading={queued === "draft"}
                disabled={halted || needsFailed || (queued !== null && queued !== "draft")}
                onPress={() => void finish("draft")}
                style={styles.grow}
                testID="wizard-save"
              >
                {queued === "draft" ? W.needsWaiting : W.draft}
              </Button>
              <Button
                variant="secondary"
                icon="eye"
                loading={queued === "preview"}
                disabled={halted || needsFailed || (queued !== null && queued !== "preview")}
                onPress={() => void finish("preview")}
                testID="wizard-preview"
              >
                {queued === "preview" ? W.needsWaiting : W.preview}
              </Button>
            </View>
          </View>
        ) : (
          <View style={styles.actions}>
            {index > 0 ? (
              <BackSquare
                disabled={halted || frozen}
                onPress={() => void go(-1)}
                label={W.previous}
                testID="wizard-back"
              />
            ) : (
              <Button
                variant="secondary"
                icon="close"
                disabled={halted || frozen}
                onPress={close}
                testID="wizard-cancel"
              >
                {L.cancel}
              </Button>
            )}
            {last ? (
              <Button
                icon="check"
                loading={halted || queued === "save"}
                disabled={halted || needsFailed || queued === "save"}
                onPress={() => void finish("save")}
                style={styles.grow}
                testID="wizard-save"
              >
                {queued === "save" ? W.needsWaiting : L.saveChanges}
              </Button>
            ) : (
              <Button
                icon="next"
                loading={halted || queued === "next"}
                disabled={halted || needsFailed || queued === "next"}
                onPress={() => void go(1)}
                style={styles.grow}
                testID="wizard-next"
              >
                {queued === "next" ? W.needsWaiting : W.continue}
              </Button>
            )}
          </View>
        )
      }
      overlays={
        <ConfirmSheet
          visible={quitting}
          title={L.quitTitle}
          body={keepOnDevice ? (eventId ? W.quitDraftBody : L.quitBody) : L.quitEditBody}
          confirmLabel={L.quitConfirm}
          confirmIcon="back"
          cancelLabel={L.quitKeep}
          onConfirm={() => {
            setQuitting(false);
            leave();
          }}
          onClose={() => {
            pendingLeave.current = null;
            setQuitting(false);
          }}
        />
      }
    >
      {/* Lot C4a : frise cliquable de l'artefact (.csteps) à la place de « Étape N sur 8 » et des tirets du bas. */}
      <StepRail
        labels={eventWizardSteps.map((s) => eventStepLabels[s])}
        index={index}
        disabled={halted || busy || photoSending !== null || frozen}
        onPick={(i) => {
          setError(null);
          setNotice(null);
          setIndex(i);
        }}
        stepLabel={L.stepOf(index + 1, eventWizardSteps.length, eventStepLabels[step])}
      />
      <View style={styles.head}>
        <Muted variant="title" testID="wizard-title-head">
          {title}
        </Muted>
        <Muted variant="body">{intro}</Muted>
      </View>
      {needsFailed ? (
        <View style={styles.resume} testID="wizard-needs-failed">
          <Notice tone="error">{W.needsFailed}</Notice>
          <Button variant="plate" icon="undo" onPress={() => void reloadNeeds()}>
            {W.needsRetry}
          </Button>
        </View>
      ) : null}
      {notice ? <Notice testID="wizard-notice">{notice}</Notice> : null}
      {frozen ? (
        <View style={styles.resume} testID="wizard-wait">
          <Notice>{W.needsWaitingNote}</Notice>
          <Button
            variant="plate"
            icon="close"
            onPress={() => {
              setWaiting(null);
              setDue(null);
            }}
            testID="wizard-wait-cancel"
          >
            {W.needsWaitCancel}
          </Button>
        </View>
      ) : null}
      {resumed && (showResume || index === (resumed.step ?? index)) ? (
        <View style={styles.resume} testID="wizard-resumed">
          <Notice>{L.draftResume(resumed.draft.title, formatStamp(resumed.savedAt))}</Notice>
          <Button variant="plate" icon="undo" onPress={() => void restart()} testID="wizard-restart">
            {L.draftResumeNo}
          </Button>
        </View>
      ) : null}
      <View
        style={styles.step}
        pointerEvents={frozen ? "none" : "auto"}
        importantForAccessibility={frozen ? "no-hide-descendants" : "auto"}
        accessibilityElementsHidden={frozen}
      >
        <Screen {...ctx} />
      </View>
      {notifyShown ? (
        <RecipientsBanner count={previewCount} timing={notifyTimingLine(notifyWhen, { now: notifyClock })} />
      ) : null}
      {typeof error === "string" ? (
        <Notice tone="error" testID="wizard-error">
          {error}
        </Notice>
      ) : (
        <OrgaFailure error={error} />
      )}
      {keepOnDevice && !eventId && step === "type" && !resumed ? <Muted variant="caption">{L.draftKept}</Muted> : null}
      {isCopy && step === "type" ? <Notice testID="wizard-copy">{wizardEndLabels.copyNotice}</Notice> : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: space2, flexWrap: "wrap" },
  end: { gap: space2 },
  grow: { flex: 1 },
  // Même écart que le corps de `FlowScreen` (`Body`, `gap: space3`) : ce conteneur porte le gel et ne doit rien changer à la mise en page.
  step: { gap: space3 },
  resume: { gap: space2 },
  head: { gap: space1 },
});
