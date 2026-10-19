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
  draftStart,
  type EventDraft,
  type EventFormat,
  type EventOrganizer,
  initialEventDraft,
  eventEditorLabels as L,
  type VehicleMake,
  vendorTypeLabels,
  withCopyOpening,
  wizardEndLabels,
} from "@orasso/shared";
import { useNavigation, useRouter } from "expo-router";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { now } from "@/lib/clock";
import { appStepProblem, draftWorthKeeping, moveStep, progressOf, type StoredDraft } from "@/lib/eventDraft";
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
  const [poster, setPosterState] = useState<PickedPhoto | null>(null);
  // Affiche gardée avec le brouillon d'une création (lot 34) : copie faite à part, écrite avec le brouillon.
  const [keptPoster, setKeptPoster] = useState<PickedPhoto | null>(null);
  const [quitting, setQuitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null);
  // Création : le brouillon gardé est relu une fois avant d'écrire quoi que ce soit (sinon on l'écraserait).
  const [loaded, setLoaded] = useState(editing);
  const [resumed, setResumed] = useState<StoredDraft | null>(null);
  const pristine = useRef(JSON.stringify(d));
  // Garde avant de quitter (lot 36) : enregistrement réussi, sortie confirmée, action de navigation retenue.
  const saved = useRef(false);
  const leaving = useRef(false);
  const pendingLeave = useRef<(() => void) | null>(null);

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

  // Chaque saisie d'une création est gardée sur le téléphone (un court délai pour ne pas écrire à chaque lettre ; la
  // dernière saisie est écrite aussi quand l'écran se ferme).
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (editing || !loaded || !draftWorthKeeping(d)) return;
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
  }, [editing, loaded, d, index, createdId, structureId, keptPoster]);

  const setPoster = useCallback(
    (photo: PickedPhoto | null) => {
      setPosterState(photo);
      if (editing) return;
      void keepEventDraftPoster(structureId, photo).then(setKeptPoster);
    },
    [editing, structureId],
  );
  useEffect(() => () => pending.current?.(), []);

  // Lot 36 : copie d'un événement encore en brouillon : l'ouverture des candidatures suit le début.
  const isCopy = Boolean(event?.parentEventId) && event?.status === "draft";
  // Brouillon (création ou modification) : Publier, Garder en brouillon, Aperçu ; un événement publié s'enregistre.
  const isDraft = !event || event.status === "draft";
  const set = useCallback(<K extends keyof EventDraft>(key: K, value: EventDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);
  // Quand le début d'une copie change (un jour ou plusieurs), l'ouverture garde le délai de l'original.
  const copyLead = isCopy && event ? Date.parse(event.startsAt) - Date.parse(event.registrationsOpenAt) : null;
  const start = draftStart(d);
  const lastStart = useRef(start);
  useEffect(() => {
    if (copyLead === null || start === lastStart.current) return;
    lastStart.current = start;
    setDraft((prev) => withCopyOpening(prev, copyLead, now()));
  }, [copyLead, start]);
  const setD = useCallback((update: (prev: EventDraft) => EventDraft) => setDraft(update), []);

  const step = appWizardSteps[index] ?? "format";
  const last = index === appWizardSteps.length - 1;
  const progress = progressOf(index, d);
  // Lot 33 : formats et types de prestataires proposés par l'administration (repli sur les constantes partagées) ;
  // le format d'un événement existant reste proposé, comme sur le site.
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
    return router.canGoBack() ? router.back() : router.replace(event ? `/evenement/${event.id}` : "/evenements");
  };
  const dirty = JSON.stringify(d) !== pristine.current;
  const close = () => (dirty || (!editing && draftWorthKeeping(d)) ? setQuitting(true) : leave());

  // Lot 36 : une modification non enregistrée n'est plus perdue en quittant l'écran par un autre chemin (retour Android,
  // geste, lien) : la même confirmation que « Fermer ». (Une création est déjà gardée sur le téléphone.)
  const navigation = useNavigation();
  useEffect(() => {
    if (!editing || !dirty) return;
    return navigation.addListener("beforeRemove", (e) => {
      if (leaving.current || saved.current) return;
      e.preventDefault();
      pendingLeave.current = () => navigation.dispatch(e.data.action);
      setQuitting(true);
    });
  }, [navigation, editing, dirty]);

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

  /**
   * Lot 36 : fin de l'assistant d'un brouillon, trois choix. `draft` : enregistrer et garder en brouillon ;
   * `publish` : enregistrer puis publier ; `preview` : enregistrer puis ouvrir la page publique en lecture.
   */
  async function save(mode: "draft" | "publish" | "preview" = "draft") {
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
      if (!editing) {
        pending.current = null;
        await clearEventDraft(structureId);
      }
      pristine.current = JSON.stringify(d);
      saved.current = true;
      const warnings = [...res.warnings];
      let fait = editing ? "modifie" : "cree";
      if (mode === "preview") {
        router.replace({ pathname: "/e/[slug]", params: { slug: res.event.slug } });
        return;
      }
      if (mode === "publish") {
        try {
          await api.publishEvent(res.event.id);
          fait = "publie";
        } catch (e) {
          warnings.push(errorMessage(e));
        }
      }
      router.replace({
        pathname: "/evenement/[id]",
        params: { id: res.event.id, fait, ...(warnings.length ? { avert: warnings.join(" ") } : {}) },
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
    vendorSuggestions,
    poster,
    setPoster,
    openStructure: () => router.push("/(orga)/structure"),
  };
  const Screen = SCREENS[step];

  return (
    <FlowScreen
      title={editing ? L.editTitle : L.newTitle}
      facts={event?.title}
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
          {/* Dernière étape : le libellé « Enregistrer le brouillon » prend toute la largeur, « Retour » dessous. */}
          <View style={last ? styles.actionsLast : styles.actions}>
            {index > 0 ? (
              <Button
                variant="secondary"
                icon="back"
                onPress={() => go(-1)}
                style={last ? undefined : styles.grow}
                testID="wizard-back"
              >
                {L.back}
              </Button>
            ) : (
              <Button variant="secondary" icon="close" onPress={close} style={styles.grow} testID="wizard-cancel">
                {L.cancel}
              </Button>
            )}
            {last && isDraft ? (
              <>
                <Button
                  variant="secondary"
                  icon="eye"
                  disabled={busy || !loaded}
                  onPress={() => void save("preview")}
                  testID="wizard-preview"
                >
                  {wizardEndLabels.preview}
                </Button>
                <Button
                  variant="secondary"
                  icon="calendar"
                  disabled={busy || !loaded}
                  onPress={() => void save("draft")}
                  testID="wizard-save"
                >
                  {wizardEndLabels.keepDraft}
                </Button>
                <Button
                  icon="check"
                  loading={busy}
                  disabled={busy || !loaded || !(structure.data?.verified ?? false)}
                  onPress={() => void save("publish")}
                  testID="wizard-publish"
                >
                  {wizardEndLabels.publish}
                </Button>
              </>
            ) : last ? (
              <Button
                icon="check"
                loading={busy}
                disabled={busy || !loaded}
                onPress={() => void save()}
                testID="wizard-save"
              >
                {L.saveChanges}
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
          onClose={() => {
            pendingLeave.current = null;
            setQuitting(false);
          }}
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
      {isCopy && step === "dates" ? <Notice testID="wizard-copy">{wizardEndLabels.copyNotice}</Notice> : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: "row", gap: space1 },
  segment: { flex: 1, height: 4 },
  actions: { flexDirection: "row", gap: space2 },
  actionsLast: { flexDirection: "column-reverse", gap: space2 },
  grow: { flex: 1 },
  resume: { gap: space2 },
});
