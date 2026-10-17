// Vérification et badge de la structure (lot 35a, décision D20) : mêmes étapes que la page Structure du site. 1. Le
// numéro SIRET ou RNA est contrôlé dans les registres publics ; 2. un justificatif (photo ou PDF, lot 34)
// que l'équipe Orasso valide à la main ; puis l'envoi. Le badge dit son échéance et pourquoi une structure est suspendue.
import { Button, Chip, Plate, SelectField, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  afterEventLabels,
  orgaManageLabels as L,
  type StructureOrganizer,
  type StructureVerificationView,
  structureVerificationLabels,
  suspensionReasonLabels,
  type VerificationDocument,
  type VerificationDocumentKind,
  verificationDocumentKindLabels,
  verificationDocumentKinds,
} from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { imageForm, pdfForm, pickOneImage, pickOnePdf } from "@/lib/structureFiles";
import {
  badgeDaysLeft,
  canAddDocument,
  canRemoveDocuments,
  canShowSubmit,
  showVerificationSteps,
} from "@/lib/teamModel";
import { useNow } from "@/lib/useNow";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle } from "@/ui/Screens";
import { ConfirmSheet } from "../ConfirmSheet";
import { failWith } from "../team/fail";

const { space2, space3 } = tokens.spacing;

const registryLabel = {
  matched: L.verifMatched,
  closed: L.verifClosed,
  not_found: L.verifNotFound,
  unavailable: L.verifUnavailable,
} as const;

export function VerificationPanel({
  structure,
  view,
  onChanged,
  onTwoFactor,
}: {
  structure: StructureOrganizer;
  view: StructureVerificationView;
  /** Une écriture a réussi : l'écran relit la vérification (et la fiche). */
  onChanged: (message: string) => void;
  onTwoFactor: (error: unknown) => void;
}) {
  const { t } = useTheme();
  const at = useNow(60_000);
  const structureId = structure.id;
  const [number, setNumber] = useState(view.siret ?? view.rna ?? "");
  const [kind, setKind] = useState<VerificationDocumentKind>("statutes");
  const [busy, setBusy] = useState<"check" | "add" | "pdf" | "remove" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<VerificationDocument | null>(null);

  const check = view.registryCheck;
  const state = view.verification;
  const days = badgeDaysLeft(view.badgeExpiresAt, at);

  async function run(step: NonNullable<typeof busy>, work: () => Promise<string | null>) {
    setBusy(step);
    setError(null);
    try {
      const message = await work();
      if (message) onChanged(message);
    } catch (e) {
      failWith(e, setError, onTwoFactor);
    } finally {
      setBusy(null);
    }
  }

  const addDocument = () =>
    run("add", async () => {
      const photo = await pickOneImage();
      if (!photo) return null;
      await api.addVerificationDocument(structureId, await imageForm(photo, "file", "justificatif.jpg", { kind }));
      return L.verifDocumentAdded;
    });

  const addPdf = () =>
    run("pdf", async () => {
      const pdf = await pickOnePdf();
      if (!pdf) return null;
      await api.addVerificationDocument(structureId, await pdfForm(pdf, { kind }));
      return L.verifDocumentAdded;
    });

  return (
    <>
      <SectionTitle>{L.verifTitle}</SectionTitle>
      <Plate style={styles.block} testID="orga-verification">
        <View style={styles.head}>
          <Text variant="bodyStrong" color={t.color.plateInk} style={styles.grow}>
            {L.badgeTitle}
          </Text>
          <View testID="orga-verification-state">
            <Chip surface="plate" variant={state === "verified" ? "verified" : "default"}>
              {structureVerificationLabels[state]}
            </Chip>
          </View>
        </View>
        {state === "verified" ? (
          <Text variant="body" color={t.color.plateInk}>
            {L.verifBadgeOk(view.badgeExpiresAt ? formatDay(view.badgeExpiresAt) : null)}
          </Text>
        ) : state === "pending" ? (
          <Text variant="body" color={t.color.plateInk} testID="orga-verification-pending">
            {L.verifPending}
          </Text>
        ) : (
          <Text variant="body" color={t.color.plateMuted}>
            {L.verifIntro}
          </Text>
        )}
        {state === "verified" && days !== null && view.badgeExpiresAt ? (
          <Text variant="caption" color={t.color.plateMuted}>
            {L.badgeUntil(formatDay(view.badgeExpiresAt))}
            {days <= 30 ? ` · ${afterEventLabels.badgeExpiring(days)} ${afterEventLabels.badgeExpiringHint}` : ""}
          </Text>
        ) : null}
        {state === "suspended" ? (
          <Text variant="caption" color={t.color.plateMuted} testID="orga-badge-suspended">
            {structure.suspendedReason
              ? `${suspensionReasonLabels[structure.suspendedReason]}. ${
                  structure.suspendedReason === "badge_expired"
                    ? afterEventLabels.badgeSuspendedExpired
                    : afterEventLabels.badgeSuspendedModeration
                }`
              : afterEventLabels.badgeSuspended}
          </Text>
        ) : null}
      </Plate>

      {showVerificationSteps(view) ? (
        <>
          <Plate style={styles.block}>
            <Text variant="label" color={t.color.plateMuted}>
              {L.verifStepNumber}
            </Text>
            <TextField
              label={L.verifNumberLabel}
              value={number}
              onChangeText={setNumber}
              autoCapitalize="characters"
              autoCorrect={false}
              testID="orga-verification-number"
            />
            <Button
              variant="plate"
              icon="search"
              loading={busy === "check"}
              disabled={busy !== null || number.trim().length < 9}
              onPress={() =>
                void run("check", async () => {
                  await api.checkRegistry(structureId, number.trim());
                  return L.verifChecked;
                })
              }
              fullWidth
              testID="orga-verification-check"
            >
              {L.verifCheck}
            </Button>
            {check ? (
              <View style={styles.result} testID="orga-registry-result">
                <View style={styles.row}>
                  <Chip surface="plate" variant={check.status === "matched" ? "accent" : "default"}>
                    {registryLabel[check.status]}
                  </Chip>
                </View>
                {check.name ? (
                  <Text variant="bodyStrong" color={t.color.plateInk}>
                    {check.name}
                    {check.address ? ` · ${check.address}` : ""}
                  </Text>
                ) : null}
                {check.status === "matched" && structure.kind === "association" && !check.isAssociation ? (
                  <Text variant="caption" color={t.color.plateMuted}>
                    {L.verifNotAssociation}
                  </Text>
                ) : null}
                {check.status === "not_found" ? (
                  <Text variant="caption" color={t.color.plateMuted}>
                    {L.verifNotFoundHelp}
                  </Text>
                ) : null}
                {check.status === "unavailable" ? (
                  <Text variant="caption" color={t.color.plateMuted}>
                    {L.verifUnavailableHelp}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </Plate>

          <Plate style={styles.block}>
            <Text variant="label" color={t.color.plateMuted}>
              {L.verifStepDocument}
            </Text>
            <Text variant="caption" color={t.color.plateMuted}>
              {L.verifDocumentHelp}
            </Text>
            {view.documents.length === 0 ? (
              <Text variant="body" color={t.color.plateMuted}>
                {L.verifDocumentsNone}
              </Text>
            ) : (
              view.documents.map((d) => (
                <View key={d.id} style={styles.docRow} testID="orga-verification-document">
                  <Text variant="body" color={t.color.plateInk} style={styles.grow}>
                    {verificationDocumentKindLabels[d.kind]} · {d.fileName}
                  </Text>
                  {canRemoveDocuments(view) ? (
                    <Button
                      variant="plate"
                      icon="close"
                      disabled={busy !== null}
                      onPress={() => {
                        setError(null);
                        setRemoving(d);
                      }}
                      testID="orga-verification-document-remove"
                    >
                      {L.verifDocumentRemove}
                    </Button>
                  ) : null}
                </View>
              ))
            )}
            {canAddDocument(view) ? (
              <>
                <SelectField
                  label={L.verifDocumentKind}
                  value={kind}
                  onValueChange={(v) => setKind(v as VerificationDocumentKind)}
                  options={verificationDocumentKinds.map((k) => ({
                    value: k,
                    label: verificationDocumentKindLabels[k],
                  }))}
                />
                <Button
                  variant="plate"
                  icon="add"
                  loading={busy === "add"}
                  disabled={busy !== null}
                  onPress={() => void addDocument()}
                  fullWidth
                  testID="orga-verification-add"
                >
                  {L.verifDocumentAdd}
                </Button>
                <Button
                  variant="plate"
                  icon="add"
                  loading={busy === "pdf"}
                  disabled={busy !== null}
                  onPress={() => void addPdf()}
                  fullWidth
                  testID="orga-verification-add-pdf"
                >
                  {L.verifDocumentAddPdf}
                </Button>
              </>
            ) : null}
          </Plate>

          {canShowSubmit(view) ? (
            <>
              {view.submitBlockedReason ? <Muted variant="caption">{view.submitBlockedReason}</Muted> : null}
              <Button
                variant="primary"
                icon="check"
                loading={busy === "submit"}
                disabled={!view.canSubmit || busy !== null}
                onPress={() =>
                  void run("submit", async () => {
                    await api.submitVerification(structureId);
                    return L.verifSubmitted;
                  })
                }
                fullWidth
                testID="orga-verification-submit"
              >
                {L.verifSubmit}
              </Button>
            </>
          ) : null}
        </>
      ) : null}
      {error && !removing ? <Notice tone="error">{error}</Notice> : null}

      <ConfirmSheet
        visible={removing !== null}
        title={L.verifDocumentRemoveTitle}
        body={L.verifDocumentRemoveBody}
        confirmLabel={L.verifDocumentRemove}
        confirmIcon="close"
        danger
        busy={busy === "remove"}
        error={error}
        onConfirm={() => {
          const doc = removing;
          if (!doc) return;
          void run("remove", async () => {
            await api.removeVerificationDocument(structureId, doc.id);
            setRemoving(null);
            return L.verifDocumentRemoved;
          });
        }}
        onClose={() => {
          setRemoving(null);
          setError(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  head: { flexDirection: "row", alignItems: "center", gap: space2 },
  row: { flexDirection: "row", gap: space2 },
  grow: { flex: 1 },
  result: { gap: space2 },
  docRow: { flexDirection: "row", alignItems: "center", gap: space2 },
});
