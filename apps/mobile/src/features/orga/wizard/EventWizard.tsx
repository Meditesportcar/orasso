// Assistant de création et de modification d'un événement dans l'appli (lot 35b, décision D20 : tout se gère depuis
// l'appli). Mêmes étapes, champs, valeurs par défaut et validations que le site (`apps/web/.../EventWizard.tsx`, modèle
// commun `@orasso/shared` `eventWizard.ts`), une étape par écran : barre de progression, « Suivant » en bouton
// principal, « Retour » à côté. La première étape du site (format, dates, lieu) tient en trois écrans.
// Création : le brouillon est gardé sur le téléphone à chaque saisie et repris au retour (« Recommencer » l'efface).
// Modification : préremplie depuis l'événement ; l'API garde ses règles (structure suspendue, double authentification,
// 423 après le début, 409 `day_in_use`) et l'appli affiche son message.
import { Button, tokens, useTheme } from "@orasso/design-system/native";
import {
  appWizardSteps,
  type CategoryOption,
  type EventDraft,
  type EventFormat,
  type EventOrganizer,
  eventFormats,
  initialEventDraft,
  eventEditorLabels as L,
  type VehicleMake,
  vendorTypeSuggestions,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { now } from "@/lib/clock";
import { appStepProblem, draftWorthKeeping, moveStep, progressOf, type StoredDraft } from "@/lib/eventDraft";
import { clearEventDraft, loadEventDraft, saveEventDraft } from "@/lib/eventDraftStore";
import { saveEvent } from "@/lib/eventSave";
import { formatStamp } from "@/lib/format";
import type { PickedPhoto } from "@/lib/photos";
import { imageForm } from "@/lib/structureFiles";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { ConfirmSheet } from "../ConfirmSheet";
import { OrgaFailure, useOrga } from "../OrgaGate";
import { InfoStep, PreviewStep, RulesStep, TicketingStep, ZonesStep } from "./StepsHow";
import { DatesStep, FormatStep, PlaceStep } from "./StepsWhat";
import { AdmissionStep, CriteriaStep, PlacesStep, PublicStep, VehiclesStep, VendorsStep } from "./StepsWho";
import type { StepContext } from "./types";

const { space1, space2 } = tokens.spacing;

const SCREENS: Record<(typeof appWizardSteps)[number], (ctx: StepContext) => ReactNode> = {
  format: FormatStep,
  dates: DatesStep,
  lieu: PlaceStep,
  vehicules: VehiclesStep,
  places: PlacesStep,
  prestataires: VendorsStep,
  public: PublicStep,
  admission: AdmissionStep,
  criteres: CriteriaStep,
  "avant-premiere": PreviewStep,
  reglement: RulesStep,
  infos: InfoStep,
  zones: ZonesStep,
  billetterie: TicketingStep,
};

export function EventWizard({ event, notice: initialNotice }: { event?: EventOrganizer; notice?: string | null }) {
  const { t } = useTheme();
  const router = useRouter();
  const { structureId } = useOrga();
  const editing = Boolean(event);
  const [d, setDraft] = useState<EventDraft>(() => initialEventDraft(now(), event));
  const [index, setIndex] = useState(0);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [poster, setPoster] = useState<PickedPhoto | null>(null);
  const [quitting, setQuitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null);
  // Création : le brouillon gardé est relu une fois avant d'écrire quoi que ce soit (sinon on l'écraserait).
  const [loaded, setLoaded] = useState(editing);
  const [resumed, setResumed] = useState<StoredDraft | null>(null);
  const pristine = useRef(JSON.stringify(d));

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

  useEffect(() => {
    if (editing) return;
    let alive = true;
    void loadEventDraft(structureId).then((stored) => {
      if (!alive) return;
      if (stored) {
        setDraft(stored.draft);
        setIndex(stored.step);
        setCreatedId(stored.createdId);
        setResumed(stored);
      }
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [editing, structureId]);

  // Chaque saisie d'une création est gardée sur le téléphone (un court délai pour ne pas écrire à chaque lettre).
  useEffect(() => {
    if (editing || !loaded || !draftWorthKeeping(d)) return;
    const timer = setTimeout(() => {
      void saveEventDraft(structureId, { draft: d, step: index, createdId, savedAt: now().toISOString() });
    }, 400);
    return () => clearTimeout(timer);
  }, [editing, loaded, d, index, createdId, structureId]);

  const set = useCallback(<K extends keyof EventDraft>(key: K, value: EventDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);
  const setD = useCallback((update: (prev: EventDraft) => EventDraft) => setDraft(update), []);

  const step = appWizardSteps[index] ?? "format";
  const last = index === appWizardSteps.length - 1;
  const progress = progressOf(index, d);
  const formats = useMemo<EventFormat[]>(
    () => (eventFormats.includes(d.format) ? [...eventFormats] : [...eventFormats, d.format]),
    [d.format],
  );

  const leave = () =>
    router.canGoBack() ? router.back() : router.replace(event ? `/evenement/${event.id}` : "/evenements");
  const dirty = JSON.stringify(d) !== pristine.current;
  const close = () => (dirty || (!editing && draftWorthKeeping(d)) ? setQuitting(true) : leave());

  function go(delta: 1 | -1) {
    if (delta === 1) {
      const problem = appStepProblem(step, d);
      if (problem) return setError(problem);
    }
    setError(null);
    setNotice(null);
    setIndex((i) => moveStep(i, delta, d));
  }

  async function restart() {
    await clearEventDraft(structureId);
    const fresh = initialEventDraft(now());
    pristine.current = JSON.stringify(fresh);
    setDraft(fresh);
    setIndex(0);
    setCreatedId(null);
    setPoster(null);
    setResumed(null);
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const form = poster ? await imageForm(poster, "poster", "affiche.jpg") : null;
      const res = await saveEvent(api, { structureId, draft: d, event, createdId, poster: form });
      if (!res.ok) {
        setIndex(res.index);
        setError(res.error);
        if (res.createdId) setCreatedId(res.createdId);
        return;
      }
      if (!editing) await clearEventDraft(structureId);
      pristine.current = JSON.stringify(d);
      router.replace({
        pathname: "/evenement/[id]",
        params: {
          id: res.event.id,
          fait: editing ? "modifie" : "cree",
          ...(res.warnings.length ? { avert: res.warnings.join(" ") } : {}),
        },
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
    event,
    verified: structure.data?.verified ?? true,
    categories: refs.data?.categories ?? [],
    makes: refs.data?.makes ?? [],
    formats,
    vendorSuggestions: vendorTypeSuggestions,
    poster,
    setPoster,
    openStructure: () => router.push("/ma-structure"),
  };
  const Screen = SCREENS[step];

  return (
    <FlowScreen
      title={editing ? L.editTitle : L.newTitle}
      facts={L.stepOf(progress.n, progress.total, L.steps[step])}
      onClose={close}
      footer={
        <>
          <View style={styles.progress} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {Array.from({ length: progress.total }, (_, i) => (
              <View
                key={`p${i.toString()}`}
                style={[styles.segment, { backgroundColor: i < progress.n ? t.color.accent : t.color.line }]}
              />
            ))}
          </View>
          <View style={styles.actions}>
            {index > 0 ? (
              <Button variant="secondary" icon="back" onPress={() => go(-1)} style={styles.grow} testID="wizard-back">
                {L.back}
              </Button>
            ) : (
              <Button variant="secondary" icon="close" onPress={close} style={styles.grow} testID="wizard-cancel">
                {L.cancel}
              </Button>
            )}
            {last ? (
              <Button
                icon="check"
                loading={busy}
                disabled={busy || !loaded}
                onPress={() => void save()}
                style={styles.grow}
                testID="wizard-save"
              >
                {editing ? L.saveChanges : L.saveDraft}
              </Button>
            ) : (
              <Button icon="next" disabled={!loaded} onPress={() => go(1)} style={styles.grow} testID="wizard-next">
                {L.next}
              </Button>
            )}
          </View>
        </>
      }
      overlays={
        <ConfirmSheet
          visible={quitting}
          title={L.quitTitle}
          body={editing ? L.quitEditBody : L.quitBody}
          confirmLabel={L.quitConfirm}
          confirmIcon="back"
          cancelLabel={L.quitKeep}
          onConfirm={() => {
            setQuitting(false);
            leave();
          }}
          onClose={() => setQuitting(false)}
        />
      }
    >
      <Muted variant="label" testID="wizard-step">
        {L.stepOf(progress.n, progress.total, L.steps[step])}
      </Muted>
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
      {typeof error === "string" ? <Notice tone="error">{error}</Notice> : <OrgaFailure error={error} />}
      {!editing && step === "format" && !resumed ? <Muted variant="caption">{L.draftKept}</Muted> : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: "row", gap: space1 },
  segment: { flex: 1, height: 4 },
  actions: { flexDirection: "row", gap: space2 },
  grow: { flex: 1 },
  resume: { gap: space2 },
});
