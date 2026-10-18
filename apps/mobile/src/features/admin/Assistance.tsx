// Mode assistance (lot 33 côté API et site, lot 35d côté appli, S41). Trois morceaux :
//  - la file « Demandes d'aide » de l'Administration, avec « Survoler l'espace » (lecture seule) et la fermeture ;
//  - le bandeau de la casquette Organisateur quand un super admin survole une structure (« Lecture seule » ou
//    « Intervention en cours (demande du …) »), avec la sortie vers l'Administration ;
//  - côté organisateur, « Demander l'aide d'Orasso » : la demande, son état et sa fermeture (écran Ma structure).
// Les droits sont ceux de l'API : sans demande ouverte, une écriture d'un super admin est refusée et l'appli affiche le
// message tel quel.
import { Button, Chip, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  type AssistanceRequestView,
  adminTexts,
  assistanceCloseReasonLabels,
  assistanceStatusLabels,
  assistanceTexts,
  adminAppLabels as L,
} from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { type AssistedStructure, assistanceMessageIssue } from "@/lib/adminModel";
import { api } from "@/lib/api";
import { formatDay, formatDayHour } from "@/lib/format";
import { usePersona } from "@/lib/persona";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle } from "@/ui/Screens";
import { AdminFailure, AdminGate, AdminPage, EmptyOrLoading, Filters, useGesture } from "./kit";

const { space2, space3, space4 } = tokens.spacing;

/** « Survoler l'espace » : ouvre la casquette Organisateur de la structure, en lecture seule, après confirmation. */
export function SurveyButton({ structure }: { structure: AssistedStructure }) {
  const { survey } = usePersona();
  const [ask, setAsk] = useState(false);
  return (
    <>
      <Button variant="plate" icon="eye" onPress={() => setAsk(true)} fullWidth testID="admin-survey">
        {assistanceTexts.survey}
      </Button>
      {/* Lot 36 : déclarée dans une carte de la liste, la feuille s'ouvre dans son propre Modal (plein écran) : avant,
          elle remplissait la carte, contenu coupé et rien de sélectionnable. */}
      <ConfirmSheet
        modal
        visible={ask}
        title={L.assistanceSurveyTitle}
        body={L.assistanceSurveyBody}
        confirmLabel={L.assistanceSurveyConfirm}
        confirmIcon="eye"
        onConfirm={() => {
          setAsk(false);
          survey(structure);
        }}
        onClose={() => setAsk(false)}
      />
    </>
  );
}

// --- File des demandes d'aide -----------------------------------------------------------------------------------------

function RequestCard({
  request,
  onClose,
}: {
  request: AssistanceRequestView;
  onClose: (request: AssistanceRequestView) => void;
}) {
  const { t } = useTheme();
  return (
    <Plate style={styles.block} testID="assistance-row">
      <Text variant="title" color={t.color.plateInk}>
        {request.structure.name}
      </Text>
      <Chip surface="plate" variant={request.status === "open" ? "accent" : "default"}>
        {request.closeReason
          ? assistanceCloseReasonLabels[request.closeReason]
          : assistanceStatusLabels[request.status]}
      </Chip>
      <Text variant="body" color={t.color.plateInk}>
        {request.message}
      </Text>
      <Text variant="caption" color={t.color.plateMuted}>
        {L.assistanceCurrentLine(
          request.requestedBy?.pseudo ?? "—",
          formatDayHour(request.createdAt),
          formatDay(request.expiresAt),
          request.interventions,
        )}
      </Text>
      <View style={styles.stack}>
        <SurveyButton
          structure={{ id: request.structure.id, name: request.structure.name, slug: request.structure.slug }}
        />
        {request.status === "open" ? (
          <Button variant="plate" icon="close" onPress={() => onClose(request)} fullWidth testID="assistance-close">
            {assistanceTexts.close}
          </Button>
        ) : null}
      </View>
    </Plate>
  );
}

function AssistanceQueueBody() {
  const [status, setStatus] = useState<"open" | "closed">("open");
  const rows = useApi(() => api.adminAssistance(status), [status]);
  const gesture = useGesture();
  const [closing, setClosing] = useState<AssistanceRequestView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <AdminPage
      title="Demandes d'aide"
      onRefresh={rows.reload}
      overlays={
        <ConfirmSheet
          visible={closing !== null}
          title={L.assistanceCloseTitle}
          body={L.assistanceCloseBody}
          confirmLabel={assistanceTexts.close}
          confirmIcon="close"
          danger
          busy={gesture.busy}
          error={gesture.error}
          onConfirm={() =>
            void (async () => {
              if (closing && (await gesture.run(() => api.closeAssistanceAsAdmin(closing.id)))) {
                setClosing(null);
                setNotice(L.assistanceClosed);
                await rows.reload();
              }
            })()
          }
          onClose={() => {
            setClosing(null);
            gesture.setError(null);
          }}
        />
      }
    >
      <AdminFailure error={rows.error} />
      <Muted variant="caption">{assistanceTexts.askHint}</Muted>
      <Filters
        value={status}
        options={[
          { id: "open", label: assistanceStatusLabels.open },
          { id: "closed", label: assistanceStatusLabels.closed },
        ]}
        onChange={setStatus}
      />
      {notice ? <Notice>{notice}</Notice> : null}
      {!rows.data ? (
        <EmptyOrLoading loading={rows.loading} empty={adminTexts.overviewEmpty} />
      ) : rows.data.length === 0 ? (
        <Notice>{adminTexts.overviewEmpty}</Notice>
      ) : null}
      {(rows.data ?? []).map((r) => (
        <RequestCard
          key={r.id}
          request={r}
          onClose={(request) => {
            gesture.setError(null);
            setNotice(null);
            setClosing(request);
          }}
        />
      ))}
    </AdminPage>
  );
}

export function AssistanceQueueScreen() {
  return (
    <AdminGate title="Demandes d'aide">
      <AssistanceQueueBody />
    </AdminGate>
  );
}

// --- Bandeau du survol ------------------------------------------------------------------------------------------------

/**
 * Bandeau de la casquette Organisateur quand un super admin survole l'espace d'une structure : « Lecture seule » sans
 * demande ouverte, « Intervention en cours (demande du …) » avec une demande ouverte. Posé au-dessus de l'écran, dans le
 * flux (rien n'est recouvert).
 */
export function AssistanceBanner() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { persona, active, leaveSurvey } = usePersona();
  const structureId = persona.kind === "organizer" && active.assisted ? persona.structureId : null;
  const state = useApi(() => api.assistanceState(structureId ?? ""), [structureId], {
    enabled: structureId !== null,
    refreshMs: 20_000,
  });
  if (!structureId) return null;
  const current = state.data?.current ?? null;
  const intervening = state.data?.mode === "intervention" && current;
  return (
    <View style={[styles.banner, { paddingTop: insets.top + space2 }]} testID="assistance-banner">
      <Plate kind="note" style={styles.bannerPlate}>
        <Text variant="bodyStrong" color={t.color.plateInk}>
          {intervening && current
            ? L.assistanceBannerIntervention(formatDay(current.createdAt))
            : L.assistanceBannerReadOnly}
        </Text>
        <Button variant="plate" icon="back" onPress={leaveSurvey} fullWidth testID="assistance-leave">
          {L.assistanceLeave}
        </Button>
      </Plate>
    </View>
  );
}

// --- « Demander l'aide d'Orasso » (organisateur) ----------------------------------------------------------------------

/** Bloc de l'écran Ma structure : la demande d'aide en cours (ou le formulaire pour en faire une) et l'historique. */
export function AssistancePanel({ structureId }: { structureId: string }) {
  const { t } = useTheme();
  const state = useApi(() => api.assistanceState(structureId), [structureId]);
  const gesture = useGesture();
  const [message, setMessage] = useState("");
  const [issue, setIssue] = useState<string | undefined>();
  const [asking, setAsking] = useState(false);
  const [closing, setClosing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const current = state.data?.current ?? null;
  const history = state.data?.history ?? [];

  return (
    <>
      <SectionTitle>{L.assistanceOrgaTitle}</SectionTitle>
      <AdminFailure error={state.error && state.error.status !== 403 ? state.error : null} />
      {notice ? <Notice>{notice}</Notice> : null}
      <Plate style={styles.block} testID="assistance-panel">
        {current ? (
          <>
            <Chip surface="plate" variant="accent">
              {assistanceTexts.current}
            </Chip>
            <Text variant="body" color={t.color.plateInk}>
              {current.message}
            </Text>
            <Text variant="caption" color={t.color.plateMuted}>
              {L.assistanceCurrentLine(
                current.requestedBy?.pseudo ?? "—",
                formatDay(current.createdAt),
                formatDay(current.expiresAt),
                current.interventions,
              )}
            </Text>
            <Button
              variant="plate"
              icon="close"
              onPress={() => {
                gesture.setError(null);
                setNotice(null);
                setClosing(true);
              }}
              fullWidth
              testID="assistance-own-close"
            >
              {assistanceTexts.close}
            </Button>
          </>
        ) : (
          <>
            <Text variant="caption" color={t.color.plateMuted}>
              {assistanceTexts.askHint}
            </Text>
            <TextField
              label={assistanceTexts.messageLabel}
              value={message}
              onChangeText={(v) => {
                setMessage(v);
                setIssue(undefined);
              }}
              multiline
              maxLength={1000}
              error={issue}
              testID="assistance-message"
            />
            <Button
              variant="plate"
              icon="chat"
              onPress={() => {
                const problem = assistanceMessageIssue(message);
                if (problem) {
                  setIssue(problem);
                  return;
                }
                gesture.setError(null);
                setNotice(null);
                setAsking(true);
              }}
              fullWidth
              testID="assistance-ask"
            >
              {assistanceTexts.ask}
            </Button>
          </>
        )}
      </Plate>
      {history.length > 0 ? (
        <>
          <Muted variant="label">{assistanceTexts.history}</Muted>
          {history.map((h) => (
            <Plate key={h.id} style={styles.block}>
              <Text variant="caption" color={t.color.plateMuted}>
                {formatDay(h.createdAt)} ·{" "}
                {h.closeReason ? assistanceCloseReasonLabels[h.closeReason] : assistanceStatusLabels[h.status]}
                {` · ${h.interventions} intervention${h.interventions > 1 ? "s" : ""}`}
              </Text>
              <Text variant="body" color={t.color.plateInk}>
                {h.message}
              </Text>
            </Plate>
          ))}
        </>
      ) : null}

      <ConfirmSheet
        visible={asking}
        title={L.assistanceRequestTitle}
        body={L.assistanceRequestBody}
        confirmLabel={L.assistanceSend}
        confirmIcon="chat"
        busy={gesture.busy}
        error={gesture.error}
        onConfirm={() =>
          void (async () => {
            if (await gesture.run(() => api.requestAssistance(structureId, message.trim()))) {
              setAsking(false);
              setMessage("");
              setNotice(L.assistanceSent);
              await state.reload();
            }
          })()
        }
        onClose={() => {
          setAsking(false);
          gesture.setError(null);
        }}
      />
      <ConfirmSheet
        visible={closing}
        title={L.assistanceCloseTitle}
        body={L.assistanceCloseOwnBody}
        confirmLabel={assistanceTexts.close}
        confirmIcon="close"
        busy={gesture.busy}
        error={gesture.error}
        onConfirm={() =>
          void (async () => {
            if (current && (await gesture.run(() => api.closeAssistance(current.id)))) {
              setClosing(false);
              setNotice(L.assistanceClosed);
              await state.reload();
            }
          })()
        }
        onClose={() => {
          setClosing(false);
          gesture.setError(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  stack: { gap: space2 },
  banner: { paddingHorizontal: space4, paddingBottom: space2 },
  bannerPlate: { gap: space2, padding: space2 },
});
