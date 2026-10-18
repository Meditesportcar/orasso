// Page d'un de mes véhicules (lot 31, docs/02 « page véhicule ») : photos (plein écran), fiche avec poids et pays de la
// marque, préparation, description, historique des événements, statut (feuille Vendu / Souvenir / Accidenté),
// « Partager sur Instagram » et « Demander la certification ». La plaque n'est montrée qu'ici, à son propriétaire.
import { Button, Chip, ChipRow, Icon, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  applicationStatusLabels,
  certificationConditions,
  certificationLostLabels,
  certificationMissingLabels,
  certificationStatusLabels,
  countryLabel,
  garageAppLabels,
  photoLabels,
  plateTransferLabels,
  vehicleStatusLabels,
  vehicleTypeLabels,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { ArchiveSheet } from "@/features/vehicle/ArchiveSheet";
import { EditSheet } from "@/features/vehicle/EditSheet";
import { PhotoViewer } from "@/features/vehicle/PhotoViewer";
import { ShareSheet } from "@/features/vehicle/ShareSheet";
import { api } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { CROP_VEHICLE, MAX_PHOTOS, photoForm, pickPhotos } from "@/lib/photos";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { PhotoGrid, UploadProgress } from "@/ui/PhotoGrid";
import { FlowScreen, SectionTitle } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

export default function VehiculeFiche() {
  const { t } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicle = useApi(() => api.vehicle(id), [id]);
  const history = useApi(() => api.vehicleHistory(id), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Lot 35c : modifier la fiche, supprimer le véhicule.
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [certMessage, setCertMessage] = useState("");
  const v = vehicle.data;

  const close = () => (router.canGoBack() ? router.back() : router.replace("/garage"));

  async function run(label: string, work: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await work();
      await vehicle.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  // Lot 36 : une photo à la fois, recadrée au format de la carte (4:3), avec l'avancement de l'envoi.
  const add = () =>
    run(photoLabels.uploadingOne, async () => {
      if (!v) return;
      const picked = await pickPhotos(MAX_PHOTOS - v.photos.length, CROP_VEHICLE);
      for (let i = 0; i < picked.length; i++) {
        setUpload({ current: i + 1, total: picked.length });
        await api.uploadVehiclePhoto(v.id, await photoForm(picked[i] as (typeof picked)[number], i));
      }
    }).finally(() => setUpload(null));
  const makeCover = (index: number) =>
    run(photoLabels.cover, async () => {
      if (!v) return;
      const ids = v.photos.map((p) => p.id);
      const [chosen] = ids.splice(index, 1);
      if (chosen) await api.reorderVehiclePhotos(v.id, [chosen, ...ids]);
    });

  const cert = v?.certification;
  const missing = new Set(cert?.missing ?? []);
  const archived = v ? v.status !== "active" : false;
  const country = v ? countryLabel(v.country) : null;
  const facts: [string, string | null][] = v
    ? [
        ["Type", vehicleTypeLabels[v.vehicleType]],
        ["Marque", country ? `${v.makeName} · ${country}` : v.makeName],
        ["Modèle", v.modelName],
        ["Génération", v.generationName],
        ["Année", v.year ? String(v.year) : null],
        ["Moteur", v.engine],
        ["Puissance", v.powerHp ? `${v.powerHp} ch` : null],
        ["Poids", v.weightKg ? `${v.weightKg} kg` : null],
        ["Couleur", v.color],
        ["Plaque", v.unregistered ? "Non immatriculé" : (v.plate ?? "—")],
      ]
    : [];

  return (
    <FlowScreen
      title="Mon véhicule"
      onClose={close}
      onRefresh={async () => {
        await Promise.all([vehicle.reload(), history.reload()]);
      }}
      overlays={
        v ? (
          <>
            <PhotoViewer photos={v.photos} start={viewer} onClose={() => setViewer(null)} />
            <ArchiveSheet
              visible={archiveOpen}
              onClose={() => setArchiveOpen(false)}
              onConfirm={async (status, note) => {
                await api.setVehicleStatus(v.id, status, note);
                setArchiveOpen(false);
                await vehicle.reload();
              }}
            />
            <ShareSheet
              vehicleId={v.id}
              version={v.shareVersion}
              visible={shareOpen}
              onClose={() => setShareOpen(false)}
            />
            <EditSheet
              vehicle={v}
              certified={v.certified}
              visible={editOpen}
              onClose={() => setEditOpen(false)}
              onSaved={async (message) => {
                setNotice(message);
                await vehicle.reload();
              }}
            />
            <ConfirmSheet
              visible={deleteOpen}
              title={garageAppLabels.deleteTitle}
              body={`${v.label} : ${garageAppLabels.deleteBody}`}
              confirmLabel={garageAppLabels.delete}
              confirmIcon="close"
              danger
              busy={deleting}
              error={deleteError}
              onConfirm={() => {
                setDeleting(true);
                setDeleteError(null);
                api
                  .deleteVehicle(v.id)
                  .then(() => router.replace("/garage"))
                  .catch((e) => setDeleteError(errorMessage(e)))
                  .finally(() => setDeleting(false));
              }}
              onClose={() => {
                setDeleteOpen(false);
                setDeleteError(null);
              }}
            />
          </>
        ) : null
      }
    >
      {!v || !cert ? (
        <Muted variant="body">{vehicle.error ? vehicle.error.message : "Chargement…"}</Muted>
      ) : (
        <>
          <Text variant="posterL" color={t.color.ink} accessibilityRole="header">
            {v.label}
          </Text>
          <ChipRow>
            {v.certified ? <Chip variant="verified">Certifié</Chip> : null}
            {archived ? <Chip>{vehicleStatusLabels[v.status]}</Chip> : null}
            {v.plateTransfer ? <Chip variant="accent">{plateTransferLabels.pending}</Chip> : null}
            {v.categories.map((c) => (
              <Chip key={c.id}>{c.label}</Chip>
            ))}
          </ChipRow>

          {v.plateTransfer ? (
            <Notice>
              {`${plateTransferLabels.pending} : cette plaque est déjà sur le véhicule d'un autre membre, qui a été prévenu. ${
                v.plateTransfer.status === "arbitrated"
                  ? "L'équipe Orasso va trancher."
                  : "Sans réponse en 7 jours, l'équipe Orasso tranchera."
              } En attendant, tu ne peux pas candidater avec ce véhicule.`}
            </Notice>
          ) : null}

          <SectionTitle>{`Photos · ${v.photos.length} / ${MAX_PHOTOS}`}</SectionTitle>
          {v.photos.length === 0 ? (
            <Notice>Ajoute au moins une photo : il en faut une pour candidater à un événement.</Notice>
          ) : (
            <PhotoGrid
              photos={v.photos.map((p, i) => ({
                key: p.id,
                source: mediaSource(p.url),
                label: `Photo ${i + 1} en plein écran`,
              }))}
              onOpen={setViewer}
              onRemove={(i) => {
                const p = v.photos[i];
                return p ? run("Suppression…", () => api.deleteVehiclePhoto(v.id, p.id)) : undefined;
              }}
              onCover={makeCover}
              disabled={busy !== null}
              testID="vehicle-photos"
            />
          )}
          {v.photos.length > 1 ? <Muted variant="caption">{photoLabels.coverHint}</Muted> : null}
          {upload ? <UploadProgress current={upload.current} total={upload.total} /> : null}
          <Muted variant="body">Évite de montrer la plaque : tes photos sont visibles de tous les inscrits.</Muted>
          {v.photos.length < MAX_PHOTOS ? (
            <Button variant="secondary" icon="add" loading={busy !== null} onPress={() => void add()} fullWidth>
              {photoLabels.addOne}
            </Button>
          ) : null}
          {busy && !upload ? <Muted variant="meta">{busy}</Muted> : null}
          {error ? <Notice tone="error">{error}</Notice> : null}

          <SectionTitle>Fiche</SectionTitle>
          <Plate style={styles.plate}>
            {facts
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <View key={label} style={styles.fact}>
                  <Text variant="meta" color={t.color.plateMuted}>
                    {label}
                  </Text>
                  <Text variant="bodyStrong" color={t.color.plateInk} style={styles.factValue}>
                    {value}
                  </Text>
                </View>
              ))}
            <Text variant="caption" color={t.color.plateMuted}>
              La plaque est visible par toi et par l'équipe organisatrice d'un événement où tu candidates.
            </Text>
          </Plate>
          {notice ? <Notice>{notice}</Notice> : null}
          <Button
            variant="secondary"
            icon="profile"
            onPress={() => {
              setNotice(null);
              setEditOpen(true);
            }}
            fullWidth
            testID="vehicle-edit-open"
          >
            {garageAppLabels.edit}
          </Button>
          {v.preparation ? (
            <>
              <SectionTitle>Préparation</SectionTitle>
              <Muted variant="body">{v.preparation}</Muted>
            </>
          ) : null}
          {v.description ? (
            <>
              <SectionTitle>Description</SectionTitle>
              <Muted variant="body">{v.description}</Muted>
            </>
          ) : null}

          <SectionTitle>Certification</SectionTitle>
          <Plate style={styles.plate}>
            {cert.certified ? (
              <>
                <Chip variant="verified" surface="plate">
                  Certifié
                </Chip>
                <Text variant="body" color={t.color.plateInk}>
                  {`Certifié depuis le ${cert.certifiedAt ? formatDay(cert.certifiedAt) : ""}. Elle se perd si la fiche technique est modifiée, ou après six mois sans événement.`}
                </Text>
              </>
            ) : (
              <>
                {cert.lostReason ? (
                  <Text variant="body" color={t.color.winText}>
                    {`Certification perdue : ${certificationLostLabels[cert.lostReason].toLowerCase()}.`}
                  </Text>
                ) : null}
                {cert.request?.status === "pending" ? (
                  <Text variant="bodyStrong" color={t.color.plateInk}>
                    {`${certificationStatusLabels.pending}. L'équipe Orasso valide à la main.`}
                  </Text>
                ) : null}
                {cert.request?.status === "refused" ? (
                  <Text variant="body" color={t.color.winText}>
                    {`${certificationStatusLabels.refused}${cert.request.note ? ` : ${cert.request.note}` : "."}`}
                  </Text>
                ) : null}
                {certificationConditions.map((c) => (
                  <View key={c.key} style={styles.condition}>
                    <Icon
                      name={missing.has(c.key) ? "close" : "check"}
                      size={18}
                      color={missing.has(c.key) ? t.color.plateMuted : t.color.accent}
                    />
                    <Text variant="body" color={missing.has(c.key) ? t.color.plateMuted : t.color.plateInk}>
                      {c.label}
                    </Text>
                  </View>
                ))}
                {cert.missing.some((m) => m === "plate" || m === "pending") ? (
                  <Text variant="caption" color={t.color.plateMuted}>
                    {cert.missing
                      .filter((m) => m === "plate" || m === "pending")
                      .map((m) => certificationMissingLabels[m])
                      .join(" · ")}
                  </Text>
                ) : null}
                {cert.eligible ? (
                  <>
                    <TextField
                      label="Message pour l'équipe (facultatif)"
                      value={certMessage}
                      onChangeText={setCertMessage}
                      multiline
                      maxLength={500}
                      testID="certification-message"
                    />
                    <Button
                      variant="primary"
                      icon="check"
                      loading={busy !== null}
                      onPress={() =>
                        void run("Envoi de la demande…", () =>
                          api.requestCertification(v.id, certMessage.trim() || null),
                        )
                      }
                      fullWidth
                      testID="certification-request"
                    >
                      Demander la certification
                    </Button>
                  </>
                ) : null}
              </>
            )}
          </Plate>

          <SectionTitle>Partager</SectionTitle>
          <Button variant="secondary" icon="instagram" onPress={() => setShareOpen(true)} fullWidth>
            Partager sur Instagram
          </Button>

          <SectionTitle>Historique</SectionTitle>
          {history.data && history.data.length > 0 ? (
            history.data.map((h) => (
              <Pressable
                key={h.applicationId}
                accessibilityRole="link"
                accessibilityLabel={h.eventTitle}
                onPress={() => router.push(`/e/${h.eventSlug}`)}
                testID="vehicle-history-row"
              >
                <Plate style={styles.history}>
                  <Text variant="bodyStrong" color={t.color.plateInk}>
                    {h.eventTitle}
                  </Text>
                  <Text variant="meta" color={t.color.plateMuted}>
                    {`${formatDay(h.startsAt)} · ${
                      h.attended
                        ? "Présent"
                        : (applicationStatusLabels[h.status as keyof typeof applicationStatusLabels] ?? h.status)
                    }`}
                  </Text>
                </Plate>
              </Pressable>
            ))
          ) : (
            <Muted variant="body">Ce véhicule n'a pas encore participé à un événement.</Muted>
          )}

          <SectionTitle>Statut</SectionTitle>
          {archived ? (
            <Button
              variant="secondary"
              icon="undo"
              loading={busy !== null}
              onPress={() => void run("Retour au garage…", () => api.setVehicleStatus(v.id, "active"))}
              fullWidth
            >
              Remettre dans le garage actif
            </Button>
          ) : (
            <Button variant="plate" icon="entry" onPress={() => setArchiveOpen(true)} fullWidth>
              Vendu, souvenir, accidenté
            </Button>
          )}
          {archived && v.statusNote ? <Muted variant="meta">{v.statusNote}</Muted> : null}

          <SectionTitle>{garageAppLabels.delete}</SectionTitle>
          <Button
            variant="plate"
            tone="dashed"
            icon="close"
            onPress={() => setDeleteOpen(true)}
            fullWidth
            testID="vehicle-delete"
          >
            {garageAppLabels.delete}
          </Button>
        </>
      )}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  plate: { gap: space2, padding: space3 },
  fact: { flexDirection: "row", justifyContent: "space-between", gap: space3 },
  factValue: { flex: 1, textAlign: "right" },
  condition: { flexDirection: "row", alignItems: "center", gap: space2 },
  history: { gap: space1, padding: space3 },
});
