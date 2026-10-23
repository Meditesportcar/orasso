// Casquette Administration, files de décision simples (lot 35d) : structures à vérifier, certifications de véhicules et
// transferts de plaque. Mêmes données, mêmes règles que les pages du site : une note est obligatoire pour refuser une
// structure ou une certification (elle est envoyée à la personne) ; chaque décision passe par une feuille de confirmation.
import { Button, Chip, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type AdminCertificationRequest,
  type AdminPlateTransfer,
  type AdminStructureRow,
  type CertificationStatus,
  certificationStatusLabels,
  gradeLabels,
  adminAppLabels as L,
  plateTransferLabels,
  structureKindLabels,
  structureVerificationLabels,
  verificationDocumentKindLabels,
} from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { PrivateImage } from "@/features/boite/PrivateImage";
import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { AdminFailure, AdminGate, AdminPage, EmptyOrLoading, Fact, Filters, ReasonSheet, useGesture } from "./kit";

const { space2, space3 } = tokens.spacing;

/** Un justificatif de la structure : son nom, et l'image à la demande (un PDF s'ouvre depuis le site). */
function DocumentLine({ id, name, kind }: { id: string; name: string; kind: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.stack}>
      <Fact label={kind}>{name}</Fact>
      <Button variant="plate" icon="eye" onPress={() => setOpen((v) => !v)} fullWidth testID="admin-document-open">
        {L.documentOpen}
      </Button>
      {open ? (
        <PrivateImage url={`/api/admin/verification-documents/${id}`} style={styles.doc} accessibilityLabel={name} />
      ) : null}
    </View>
  );
}

// --- Structures à vérifier --------------------------------------------------------------------------------------------

function VerificationBody() {
  const { t } = useTheme();
  const [all, setAll] = useState(false);
  const rows = useApi(() => api.adminPendingStructures(all), [all]);
  const gesture = useGesture();
  const [target, setTarget] = useState<{ row: AdminStructureRow; verified: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function decide(note: string) {
    if (!target) return;
    const ok = await gesture.run(() => api.verifyStructure(target.row.id, target.verified, note || null));
    if (!ok) return;
    setTarget(null);
    setNotice(target.verified ? "Structure validée." : "Structure refusée : le motif est envoyé au propriétaire.");
    await rows.reload();
  }

  return (
    <AdminPage
      title="Structures à vérifier"
      onRefresh={rows.reload}
      overlays={
        <ReasonSheet
          visible={target !== null}
          title={target?.verified ? L.verifyTitle : L.refuseTitle}
          body={target?.verified ? L.verifyBody : L.refuseBody}
          confirmLabel={target?.verified ? L.verify : L.refuse}
          confirmIcon={target?.verified ? "check" : "close"}
          danger={target ? !target.verified : false}
          reasonLabel="Note (obligatoire pour un refus, envoyée au propriétaire)"
          minLength={target?.verified ? 0 : 1}
          requiredMessage={L.noteRequiredRefuse}
          busy={gesture.busy}
          error={gesture.error}
          onConfirm={(note) => void decide(note)}
          onClose={() => {
            setTarget(null);
            gesture.setError(null);
          }}
        />
      }
    >
      <AdminFailure error={rows.error} />
      <Filters
        value={all ? "all" : "pending"}
        options={[
          { id: "pending", label: L.filterPending },
          { id: "all", label: L.filterAll },
        ]}
        onChange={(id) => setAll(id === "all")}
      />
      {notice ? <Notice>{notice}</Notice> : null}
      {rows.data && rows.data.length === 0 ? <Notice>Aucune structure en attente de vérification.</Notice> : null}
      {!rows.data ? (
        <EmptyOrLoading loading={rows.loading} empty="Aucune structure en attente de vérification." />
      ) : null}
      {(rows.data ?? []).map((s) => {
        const check = s.registryCheck;
        return (
          <Plate key={s.id} style={styles.block} testID="admin-structure">
            <Muted variant="label">
              {structureKindLabels[s.kind]} · créée le {formatDayHour(s.createdAt)}
            </Muted>
            <Text variant="title" color={t.color.plateInk}>
              {s.name}
            </Text>
            <Text variant="caption" color={t.color.plateMuted}>
              {[s.city, s.department].filter(Boolean).join(" · ")}
              {s.owner ? ` · propriétaire ${s.owner.pseudo} (${s.owner.email})` : ""}
            </Text>
            <Chip surface="plate" variant={s.verification === "verified" ? "accent" : "default"}>
              {structureVerificationLabels[s.verification]}
            </Chip>
            <Fact label="Contrôle du registre">
              {check
                ? `${check.status === "matched" ? "Trouvé et actif" : check.status === "closed" ? "Établissement fermé" : check.status === "not_found" ? "Introuvable" : "Registre indisponible"}${check.name ? ` · ${check.name}` : ""}${check.address ? ` · ${check.address}` : ""} · ${check.source === "siret" ? "SIRET" : "RNA"} ${s.siret ?? s.rna ?? check.query}`
                : "Aucun numéro contrôlé (club non déclaré ?)."}
            </Fact>
            {check?.status === "matched" && s.kind === "association" && !check.isAssociation ? (
              <Notice>Le numéro n'est pas celui d'une association.</Notice>
            ) : null}
            {s.documents.length === 0 ? (
              <Fact label="Justificatifs">Aucun justificatif.</Fact>
            ) : (
              s.documents.map((d) => (
                <DocumentLine key={d.id} id={d.id} name={d.fileName} kind={verificationDocumentKindLabels[d.kind]} />
              ))
            )}
            {s.verification === "pending" ? (
              <View style={styles.stack}>
                <Button
                  variant="plate"
                  icon="check"
                  onPress={() => {
                    gesture.setError(null);
                    setNotice(null);
                    setTarget({ row: s, verified: true });
                  }}
                  fullWidth
                  testID="admin-structure-verify"
                >
                  {L.verify}
                </Button>
                <Button
                  variant="plate"
                  icon="close"
                  onPress={() => {
                    gesture.setError(null);
                    setNotice(null);
                    setTarget({ row: s, verified: false });
                  }}
                  fullWidth
                  testID="admin-structure-refuse"
                >
                  {L.refuse}
                </Button>
              </View>
            ) : null}
          </Plate>
        );
      })}
    </AdminPage>
  );
}

export function VerificationScreen() {
  return (
    <AdminGate page title="Structures à vérifier">
      <VerificationBody />
    </AdminGate>
  );
}

// --- Certifications ---------------------------------------------------------------------------------------------------

function CertificationsBody() {
  const { t } = useTheme();
  const [all, setAll] = useState(false);
  const rows = useApi(() => api.adminCertifications(all), [all]);
  const gesture = useGesture();
  const [target, setTarget] = useState<{ row: AdminCertificationRequest; accept: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function decide(note: string) {
    if (!target) return;
    const ok = await gesture.run(() =>
      api.decideCertification(target.row.id, target.accept ? "accept" : "refuse", note || null),
    );
    if (!ok) return;
    setTarget(null);
    setNotice(target.accept ? "Véhicule certifié." : "Certification refusée : le motif est envoyé au membre.");
    await rows.reload();
  }

  return (
    <AdminPage
      title="Certifications"
      onRefresh={rows.reload}
      overlays={
        <ReasonSheet
          visible={target !== null}
          title={target?.accept ? L.certifyTitle : L.certifyRefuseTitle}
          body={target?.accept ? L.certifyBody : L.certifyRefuseBody}
          confirmLabel={target?.accept ? L.certify : L.refuse}
          confirmIcon={target?.accept ? "check" : "close"}
          danger={target ? !target.accept : false}
          reasonLabel="Note (obligatoire pour un refus, envoyée au membre)"
          minLength={target?.accept ? 0 : 1}
          requiredMessage={L.noteRequiredRefuse}
          busy={gesture.busy}
          error={gesture.error}
          onConfirm={(note) => void decide(note)}
          onClose={() => {
            setTarget(null);
            gesture.setError(null);
          }}
        />
      }
    >
      <AdminFailure error={rows.error} />
      <Filters
        value={all ? "all" : "pending"}
        options={[
          { id: "pending", label: "À examiner" },
          { id: "all", label: L.filterAll },
        ]}
        onChange={(id) => setAll(id === "all")}
      />
      {notice ? <Notice>{notice}</Notice> : null}
      {!rows.data ? (
        <EmptyOrLoading loading={rows.loading} empty="Aucune demande de certification à examiner." />
      ) : rows.data.length === 0 ? (
        <Notice>Aucune demande de certification à examiner.</Notice>
      ) : null}
      {(rows.data ?? []).map((r) => {
        const facts = [
          r.snapshot.year,
          r.snapshot.engine,
          r.snapshot.powerHp ? `${r.snapshot.powerHp} ch` : null,
          r.snapshot.weightKg ? `${r.snapshot.weightKg} kg` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <Plate key={r.id} style={styles.block} testID="certification-request">
            <Muted variant="label">
              Demandée le {formatDayHour(r.createdAt)} · {r.pseudo} · grade {gradeLabels[r.grade]}
            </Muted>
            <Text variant="title" color={t.color.plateInk}>
              {r.vehicleLabel}
            </Text>
            <Chip surface="plate" variant={r.status === "accepted" ? "verified" : "default"}>
              {certificationStatusLabels[r.status as CertificationStatus]}
            </Chip>
            <Fact label="Fiche examinée">{facts || "Fiche technique non renseignée"}</Fact>
            <Fact label="Catégories">{r.snapshot.categories.join(", ") || "aucune"}</Fact>
            {r.snapshot.preparation ? <Fact label="Préparation">{r.snapshot.preparation}</Fact> : null}
            {r.snapshot.description ? <Fact label="Description">{r.snapshot.description}</Fact> : null}
            {r.message ? <Fact label="Message">{r.message}</Fact> : null}
            {r.snapshot.photoUrls.length > 0 ? (
              <Muted variant="caption">{`${r.snapshot.photoUrls.length} photo${r.snapshot.photoUrls.length > 1 ? "s" : ""} jointe${r.snapshot.photoUrls.length > 1 ? "s" : ""}`}</Muted>
            ) : null}
            {r.status === "pending" ? (
              <View style={styles.stack}>
                <Button
                  variant="plate"
                  icon="check"
                  onPress={() => {
                    gesture.setError(null);
                    setNotice(null);
                    setTarget({ row: r, accept: true });
                  }}
                  fullWidth
                  testID="admin-certification-accept"
                >
                  {L.certify}
                </Button>
                <Button
                  variant="plate"
                  icon="close"
                  onPress={() => {
                    gesture.setError(null);
                    setNotice(null);
                    setTarget({ row: r, accept: false });
                  }}
                  fullWidth
                  testID="admin-certification-refuse"
                >
                  {L.refuse}
                </Button>
              </View>
            ) : (
              <Text variant="caption" color={t.color.plateMuted}>
                Décidée le {r.decidedAt ? formatDayHour(r.decidedAt) : "—"}
                {r.note ? ` · ${r.note}` : ""}
              </Text>
            )}
          </Plate>
        );
      })}
    </AdminPage>
  );
}

export function CertificationsScreen() {
  return (
    <AdminGate page title="Certifications">
      <CertificationsBody />
    </AdminGate>
  );
}

// --- Transferts de plaque ---------------------------------------------------------------------------------------------

function TransfersBody() {
  const { t } = useTheme();
  const rows = useApi(() => api.adminPlateTransfers(), []);
  const gesture = useGesture();
  const [target, setTarget] = useState<{ row: AdminPlateTransfer; accept: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function decide(note: string) {
    if (!target) return;
    const ok = await gesture.run(() =>
      api.decidePlateTransfer(target.row.id, target.accept ? "accept" : "refuse", note || null),
    );
    if (!ok) return;
    setTarget(null);
    setNotice(target.accept ? "La plaque a changé de main." : "Transfert refusé.");
    await rows.reload();
  }

  return (
    <AdminPage
      title="Transferts de plaque"
      onRefresh={rows.reload}
      overlays={
        <ReasonSheet
          visible={target !== null}
          title={target?.accept ? L.transferAcceptTitle : L.transferRefuseTitle}
          body={target?.accept ? L.transferAcceptBody : L.transferRefuseBody}
          confirmLabel={target?.accept ? L.transferAccept : L.transferRefuse}
          confirmIcon={target?.accept ? "check" : "close"}
          danger={target ? !target.accept : false}
          reasonLabel="Note (envoyée au demandeur)"
          minLength={0}
          busy={gesture.busy}
          error={gesture.error}
          onConfirm={(note) => void decide(note)}
          onClose={() => {
            setTarget(null);
            gesture.setError(null);
          }}
        />
      }
    >
      <AdminFailure error={rows.error} />
      {notice ? <Notice>{notice}</Notice> : null}
      {!rows.data ? (
        <EmptyOrLoading loading={rows.loading} empty="Aucun transfert de plaque à arbitrer." />
      ) : rows.data.length === 0 ? (
        <Notice>Aucun transfert de plaque à arbitrer.</Notice>
      ) : null}
      {(rows.data ?? []).map((tr) => (
        <Plate key={tr.id} style={styles.block} testID="plate-transfer">
          <Muted variant="label">Demandé le {formatDayHour(tr.createdAt)}</Muted>
          <Text variant="title" color={t.color.plateInk}>
            Plaque {tr.plate ?? "—"}
          </Text>
          <Chip surface="plate" variant={tr.status === "arbitrated" ? "accent" : "default"}>
            {tr.status === "arbitrated" ? plateTransferLabels.arbitrated : "En attente de l'ancien propriétaire"}
          </Chip>
          <Fact label="Porte aujourd'hui la plaque">{`${tr.holderPseudo}, ${tr.holderVehicleLabel}`}</Fact>
          <Fact label="La réclame">
            {tr.requesterVehicleLabel ? `${tr.requesterPseudo}, ${tr.requesterVehicleLabel}` : tr.requesterPseudo}
          </Fact>
          {tr.note ? (
            <Text variant="caption" color={t.color.plateMuted}>
              {tr.note}
            </Text>
          ) : null}
          <View style={styles.stack}>
            <Button
              variant="plate"
              icon="check"
              onPress={() => {
                gesture.setError(null);
                setNotice(null);
                setTarget({ row: tr, accept: true });
              }}
              fullWidth
              testID="admin-transfer-accept"
            >
              {L.transferAccept}
            </Button>
            <Button
              variant="plate"
              icon="close"
              onPress={() => {
                gesture.setError(null);
                setNotice(null);
                setTarget({ row: tr, accept: false });
              }}
              fullWidth
              testID="admin-transfer-refuse"
            >
              {L.transferRefuse}
            </Button>
          </View>
        </Plate>
      ))}
    </AdminPage>
  );
}

export function TransfersScreen() {
  return (
    <AdminGate page title="Transferts de plaque">
      <TransfersBody />
    </AdminGate>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  stack: { gap: space2 },
  doc: { width: "100%", height: 220 },
});
