// Assistant de création et de modification d'un événement dans l'appli (lot 35b, D20 ; lot 53 : les huit temps de
// `s-create`, comme le site) : type, lieu avec épingle, arrivées, critères, avant-première, règlement, affiche, « Tout
// est prêt » (Publier / Brouillon / Aperçu). Barre de progression, « Continuer » en bouton principal collant.
// Un brouillon est enregistré à chaque temps dès que l'adresse est connue (l'API l'exige) ; avant, la saisie est gardée
// sur le téléphone et reprise au retour (« Recommencer » l'efface). Un événement publié s'enregistre à la fin.
// L'API garde ses règles (structure suspendue, double authentification, 423 après le début, 409 `day_in_use`).
import { Button, tokens, useTheme } from "@orasso/design-system/native";
import {
  type CategoryOption,
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
  initialEventDraft,
  eventEditorLabels as L,
  needsFromSaved,
  posterTexts,
  recurrenceRuleOf,
  type VehicleMake,
  vendorTypeLabels,
  wizardV2Labels as W,
  withCopyOpening,
  wizardEndLabels,
} from "@orasso/shared";
import { useNavigation, useRouter } from "expo-router";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { now } from "@/lib/clock";
import { draftWorthKeeping, type StoredDraft } from "@/lib/eventDraft";
import { clearEventDraft, keepEventDraftPoster, loadEventDraft, saveEventDraft } from "@/lib/eventDraftStore";
import { saveEvent } from "@/lib/eventSave";
import { formatStamp } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { useEventFormats, useVendorTypes } from "@/lib/lists";
import type { PickedPhoto } from "@/lib/photos";
import { imageForm } from "@/lib/structureFiles";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { ConfirmSheet } from "../ConfirmSheet";
import { OrgaFailure, useOrga } from "../OrgaGate";
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

const { space1, space2 } = tokens.spacing;

const SCREENS: Record<EventWizardStep, (ctx: StepContext) => ReactNode> = {
  type: TypeTemps,
  lieu: LieuTemps,
  arrivees: ArriveesTemps,
  criteres: CriteresTemps,
  "avant-premiere": AvantTemps,
  reglement: ReglementTemps,
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
  affiche: [W.posterTitle, posterTexts.intro],
  publier: [W.readyTitle, W.readyIntro],
};

export function EventWizard({
  event,
  notice: initialNotice,
  initialStep,
}: {
  event?: EventOrganizer;
  notice?: string | null;
  /** Lot 53 : temps où ouvrir (`?temps=`) ; sans lui, un brouillon rouvre au premier temps incomplet. */
  initialStep?: EventWizardStep | null;
}) {
  const { t } = useTheme();
  const router = useRouter();
  const { structureId } = useOrga();
  const editing = Boolean(event);
  const [saved, setSaved] = useState<EventOrganizer | undefined>(event);
  const [savedNeeds, setSavedNeeds] = useState<EventNeedView[]>([]);
  const [d, setDraft] = useState<EventDraft>(() => initialEventDraft(now(), event));
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
  const [quitting, setQuitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null);
  // Création : le brouillon gardé est relu une fois avant d'écrire quoi que ce soit (sinon on l'écraserait).
  const [loaded, setLoaded] = useState(editing);
  const [resumed, setResumed] = useState<StoredDraft | null>(null);
  const pristine = useRef(JSON.stringify(d));
  const done = useRef(false);
  const leaving = useRef(false);
  const pendingLeave = useRef<(() => void) | null>(null);
  // Le téléphone garde la saisie tant que rien n'est enregistré côté serveur (création avant l'adresse).
  const keepOnDevice = !saved;

  const structure = useApi(() => api.orgStructure(structureId), [structureId]);
  const refs = useApi<{ categories: CategoryOption[]; makes: VehicleMake[] }>(
    async () => {
      const [categories, makes] = await Promise.allSettled([api.categories(), api.makes()]);
      return {
        categories: categories.status === "fulfilled" ? categories.value : [],
        makes: makes.status === "fulfilled" ? makes.value : [],
      };
    },
    [],
    { cacheKey: "wizard-references" },
  );

  // Missions enregistrées (lot 46) : chargées pour le volet « Sur place ».
  useEffect(() => {
    if (!event) return;
    let alive = true;
    void api
      .eventNeeds(event.id)
      .then((list) => {
        if (!alive) return;
        setSavedNeeds(list);
        setDraft((p) => {
          const next = { ...p, needs: needsFromSaved(list) };
          if (JSON.stringify(p) === pristine.current) pristine.current = JSON.stringify(next);
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [event]);

  useEffect(() => {
    if (editing) return;
    let alive = true;
    void loadEventDraft(structureId).then((stored) => {
      if (!alive) return;
      if (stored) {
        setDraft(stored.draft);
        setIndex(Math.min(stored.step, eventWizardSteps.length - 1));
        setCreatedId(stored.createdId);
        setPosterState(stored.poster ?? null);
        setKeptPoster(stored.poster ?? null);
        setResumed(stored);
      }
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [editing, structureId]);

  const pending = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!keepOnDevice || !loaded || !draftWorthKeeping(d)) return;
    const write = () => {
      pending.current = null;
      void saveEventDraft(structureId, {
        draft: d,
        step: index,
        createdId,
        savedAt: now().toISOString(),
        poster: keptPoster,
      });
    };
    pending.current = write;
    const timer = setTimeout(write, 400);
    return () => clearTimeout(timer);
  }, [keepOnDevice, loaded, d, index, createdId, structureId, keptPoster]);
  useEffect(() => () => pending.current?.(), []);

  const setPoster = useCallback(
    (photo: PickedPhoto | null) => {
      setPosterState(photo);
      if (editing) return;
      void keepEventDraftPoster(structureId, photo).then(setKeptPoster);
    },
    [editing, structureId],
  );

  // Lot 36 : copie d'un événement encore en brouillon : l'ouverture des candidatures suit le début.
  const isCopy = Boolean(event?.parentEventId) && event?.status === "draft";
  const isDraft = !saved || saved.status === "draft";
  const set = useCallback(<K extends keyof EventDraft>(key: K, value: EventDraft[K]) => {
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
  const setD = useCallback((update: (prev: EventDraft) => EventDraft) => setDraft(update), []);

  const step = eventWizardSteps[index] ?? "type";
  const last = index === eventWizardSteps.length - 1;
  const formatsOn = useEventFormats();
  const formats = useMemo<EventFormat[]>(
    () => (formatsOn.includes(d.format) ? formatsOn : [...formatsOn, d.format]),
    [formatsOn, d.format],
  );
  const vendorTypes = useVendorTypes();
  const vendorSuggestions = useMemo(() => vendorTypes.map((c) => vendorTypeLabels[c]), [vendorTypes]);

  const leave = () => {
    leaving.current = true;
    const pendingAction = pendingLeave.current;
    pendingLeave.current = null;
    if (pendingAction) return pendingAction();
    return router.canGoBack() ? router.back() : router.replace(saved ? `/evenement/${saved.id}` : "/evenements");
  };
  const dirty = JSON.stringify(d) !== pristine.current;
  const close = () => (dirty || (keepOnDevice && draftWorthKeeping(d)) ? setQuitting(true) : leave());

  // Lot 36 : une modification non enregistrée n'est plus perdue en quittant l'écran par un autre chemin.
  const navigation = useNavigation();
  useEffect(() => {
    if (keepOnDevice || !dirty) return;
    return navigation.addListener("beforeRemove", (e) => {
      if (leaving.current || done.current) return;
      e.preventDefault();
      pendingLeave.current = () => navigation.dispatch(e.data.action);
      setQuitting(true);
    });
  }, [navigation, keepOnDevice, dirty]);

  /** Enregistre le brouillon ; garde les identifiants des zones et des missions créées. */
  async function persist(validate: boolean): Promise<EventOrganizer | null> {
    const form = poster ? await imageForm(poster, "poster", "affiche.jpg") : null;
    const res = await saveEvent(api, {
      structureId,
      draft: d,
      event: saved,
      savedNeeds,
      createdId,
      poster: form,
      validate,
    });
    if (!res.ok) {
      setIndex(eventWizardSteps.indexOf(res.step));
      setError(res.error);
      if (res.createdId) setCreatedId(res.createdId);
      return null;
    }
    if (!saved) {
      pending.current = null;
      await clearEventDraft(structureId);
      setResumed(null);
    }
    setSaved(res.event);
    setSavedNeeds(res.needs);
    if (poster) setPosterState(null);
    const next: EventDraft = {
      ...d,
      zones: res.event.zones.map((z) => ({
        id: z.id,
        code: z.code,
        name: z.name,
        capacity: z.capacity ? String(z.capacity) : "",
      })),
      needs: needsFromSaved(res.needs),
    };
    setDraft(next);
    pristine.current = JSON.stringify(next);
    if (res.warnings.length) setNotice(res.warnings.join(" "));
    return res.event;
  }

  async function go(delta: 1 | -1) {
    setError(null);
    setNotice(null);
    if (delta === -1) return setIndex((i) => Math.max(0, i - 1));
    const problem = eventStepProblem(step, d);
    if (problem) return setError(problem);
    if (isDraft && (saved || step !== "type")) {
      setBusy(true);
      try {
        if (!(await persist(false))) return;
      } finally {
        setBusy(false);
      }
    }
    setIndex((i) => Math.min(i + 1, eventWizardSteps.length - 1));
  }

  async function restart() {
    pending.current = null;
    await clearEventDraft(structureId);
    const fresh = initialEventDraft(now());
    pristine.current = JSON.stringify(fresh);
    setDraft(fresh);
    setIndex(0);
    setCreatedId(null);
    setPosterState(null);
    setKeptPoster(null);
    setResumed(null);
    setError(null);
  }

  /** Fin de l'assistant : Publier, Brouillon, Aperçu (brouillon) ou « Enregistrer les modifications » (publié). */
  async function finish(mode: "draft" | "publish" | "preview" | "save") {
    setBusy(true);
    setError(null);
    try {
      const s = await persist(true);
      if (!s) return;
      const warnings: string[] = [];
      // Récurrent : la série naît une seule fois, en brouillons, à partir de l'événement complet.
      if (d.recurrence && !s.recurrenceRule && !s.parentEventId) {
        try {
          await api.createRecurrence(s.id, recurrenceRuleOf(d.recurrence));
        } catch (e) {
          warnings.push(errorMessage(e));
        }
      }
      done.current = true;
      if (mode === "preview") {
        router.replace({ pathname: "/e/[slug]", params: { slug: s.slug } });
        return;
      }
      let fait = editing ? "modifie" : "cree";
      if (mode === "publish") {
        try {
          await api.publishEvent(s.id);
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
        <>
          <View style={styles.progress} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {eventWizardSteps.map((s, i) => (
              <View key={s} style={[styles.segment, { backgroundColor: i <= index ? t.color.accent : t.color.line }]} />
            ))}
          </View>
          {last && isDraft ? (
            <View style={styles.end}>
              <Button
                icon="send"
                loading={busy}
                disabled={busy || !loaded || !canPublish}
                onPress={() => void finish("publish")}
                testID="wizard-publish"
              >
                {W.publish}
              </Button>
              <View style={styles.actions}>
                <Button
                  variant="secondary"
                  icon="back"
                  onPress={() => void go(-1)}
                  accessibilityLabel={W.previous}
                  testID="wizard-back"
                >
                  {L.back}
                </Button>
                <Button
                  variant="secondary"
                  icon="calendar"
                  disabled={busy || !loaded}
                  onPress={() => void finish("draft")}
                  style={styles.grow}
                  testID="wizard-save"
                >
                  {W.draft}
                </Button>
                <Button
                  variant="secondary"
                  icon="eye"
                  disabled={busy || !loaded}
                  onPress={() => void finish("preview")}
                  testID="wizard-preview"
                >
                  {W.preview}
                </Button>
              </View>
            </View>
          ) : (
            <View style={styles.actions}>
              {index > 0 ? (
                <Button variant="secondary" icon="back" onPress={() => void go(-1)} testID="wizard-back">
                  {L.back}
                </Button>
              ) : (
                <Button variant="secondary" icon="close" onPress={close} testID="wizard-cancel">
                  {L.cancel}
                </Button>
              )}
              {last ? (
                <Button
                  icon="check"
                  loading={busy}
                  disabled={busy || !loaded}
                  onPress={() => void finish("save")}
                  style={styles.grow}
                  testID="wizard-save"
                >
                  {L.saveChanges}
                </Button>
              ) : (
                <Button
                  icon="next"
                  loading={busy}
                  disabled={busy || !loaded}
                  onPress={() => void go(1)}
                  style={styles.grow}
                  testID="wizard-next"
                >
                  {W.continue}
                </Button>
              )}
            </View>
          )}
        </>
      }
      overlays={
        <ConfirmSheet
          visible={quitting}
          title={L.quitTitle}
          body={keepOnDevice ? L.quitBody : L.quitEditBody}
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
      <Muted variant="label" testID="wizard-step">
        {L.stepOf(index + 1, eventWizardSteps.length, eventStepLabels[step])}
      </Muted>
      <View style={styles.head}>
        <Muted variant="title" testID="wizard-title-head">
          {title}
        </Muted>
        <Muted variant="body">{intro}</Muted>
      </View>
      {notice ? <Notice>{notice}</Notice> : null}
      {resumed && index === resumed.step ? (
        <View style={styles.resume} testID="wizard-resumed">
          <Notice>{L.draftResume(resumed.draft.title, formatStamp(resumed.savedAt))}</Notice>
          <Button variant="plate" icon="undo" onPress={() => void restart()} testID="wizard-restart">
            {L.draftResumeNo}
          </Button>
        </View>
      ) : null}
      <Screen {...ctx} />
      {typeof error === "string" ? (
        <Notice tone="error" testID="wizard-error">
          {error}
        </Notice>
      ) : (
        <OrgaFailure error={error} />
      )}
      {keepOnDevice && step === "type" && !resumed ? <Muted variant="caption">{L.draftKept}</Muted> : null}
      {isCopy && step === "type" ? <Notice testID="wizard-copy">{wizardEndLabels.copyNotice}</Notice> : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: "row", gap: space1 },
  segment: { flex: 1, height: 4 },
  actions: { flexDirection: "row", gap: space2, flexWrap: "wrap" },
  end: { gap: space2 },
  grow: { flex: 1 },
  resume: { gap: space2 },
  head: { gap: space1 },
});
