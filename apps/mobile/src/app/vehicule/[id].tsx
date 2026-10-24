// Page d'un de mes véhicules (lot 31, docs/02 « page véhicule ») : photos (plein écran), fiche avec poids et pays de la
// marque, préparation, description, historique des événements. La plaque n'est montrée qu'ici, à son propriétaire.
// Lot C2b : l'artefact n'a pas d'écran véhicule ; la page reprend la carte `.veh` du Garage (`s-garage`) en écran à
// affiche (photo de couverture pleine largeur, étiquettes inclinées, nom, trois chiffres étroits) et range ses actions
// comme le demande l'audit (§ 5.2) : un seul crayon (l'assistant prérempli), le partage reste au Garage, et le reste
// (modifier la fiche, certification, vendu / souvenir / accidenté, supprimer) passe dans le menu « … ».
import { Chip, ChipRow, Photo, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  applicationStatusLabels,
  certificationLine,
  certificationLineLabels,
  countryLabel,
  garageAppLabels,
  photoLabels,
  plateTransferLabels,
  vehicleStatusLabels,
  vehicleTypeLabels,
  vehicleWizardLabels,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { PosterFlow } from "@/features/event/PosterFlow";
import { CertificationSheet } from "@/features/garage/CertificationSheet";
import { trimLine } from "@/features/garage/GarageCard";
import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { Card, Num, SmButton, TagWin } from "@/features/passionne/kit";
import { HubRow, RowIcon } from "@/features/profil/parts";
import { ArchiveSheet } from "@/features/vehicle/ArchiveSheet";
import { BlurSheet, type BlurTarget } from "@/features/vehicle/add/BlurSheet";
import { EditSheet } from "@/features/vehicle/EditSheet";
import { PhotoViewer } from "@/features/vehicle/PhotoViewer";
import { api } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { CROP_VEHICLE, MAX_PHOTOS, pickPhotos } from "@/lib/photos";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { PhotoGrid } from "@/ui/PhotoGrid";
import { FlowScreen } from "@/ui/Screens";
import { SecHead } from "@/ui/SecHead";

const { space1, space2, space3, space4 } = tokens.spacing;

/** « 1 495 » : espace fine insécable des milliers, comme le prototype. */
const narrowNumber = (n: number) => n.toLocaleString("fr-FR").replace(/\s/g, " ");

export default function VehiculeFiche() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicle = useApi(() => api.vehicle(id), [id]);
  const history = useApi(() => api.vehicleHistory(id), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [certOpen, setCertOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  // Lot 35c : modifier la fiche, supprimer le véhicule.
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Lot 51 : floutage de la plaque d'une photo déjà en ligne (définitif).
  const [blurring, setBlurring] = useState<BlurTarget>(null);
  const v = vehicle.data;

  const close = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/garage"));

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

  // Lot 36 : une photo à la fois, recadrée au format de la carte (4:3). Relecture du lot 51 : avant l'envoi, la photo
  // passe par l'éditeur du cadre de plaque (détection ou à la main, ou « aucune plaque visible ») ; l'API la floute.
  const add = async () => {
    if (!v) return;
    setError(null);
    try {
      const [picked] = await pickPhotos(MAX_PHOTOS - v.photos.length, CROP_VEHICLE);
      if (picked) setBlurring({ kind: "local", photo: picked });
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const makeCover = (index: number) =>
    run(photoLabels.cover, async () => {
      if (!v) return;
      const ids = v.photos.map((p) => p.id);
      const [chosen] = ids.splice(index, 1);
      if (chosen) await api.reorderVehiclePhotos(v.id, [chosen, ...ids]);
    });

  if (!v?.certification) {
    return (
      <FlowScreen title="Mon véhicule" onClose={close}>
        <Muted variant="body">{vehicle.error ? vehicle.error.message : "Chargement…"}</Muted>
      </FlowScreen>
    );
  }

  const cert = v.certification;
  const archived = v.status !== "active";
  const country = countryLabel(v.country);
  const trim = trimLine(v);
  const events = history.data ? history.data.filter((h) => h.attended).length : null;
  const specs: [string, string][] = [
    [v.powerHp ? narrowNumber(v.powerHp) : "—", "ch"],
    [v.weightKg ? narrowNumber(v.weightKg) : "—", "kg"],
    [events !== null ? narrowNumber(events) : "—", vehicleWizardLabels.events],
  ];
  const facts: [string, string | null][] = [
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
  ];
  const openFrom = (open: () => void) => () => {
    setMenu(false);
    open();
  };

  const overlays = (
    <>
      <PhotoViewer photos={v.photos} start={viewer} onClose={() => setViewer(null)} />
      <BlurSheet
        vehicleId={v.id}
        target={blurring}
        onClose={() => setBlurring(null)}
        onDone={async () => {
          await vehicle.reload();
        }}
      />
      {/* Le menu « … » : ce qui n'est pas le geste principal de la page. */}
      <AppSheet visible={menu} onClose={() => setMenu(false)} accessibilityLabel="Plus d'actions">
        <Text variant="posterM" color={c.ink} style={styles.sheetTitle}>
          {v.label}
        </Text>
        <HubRow
          lead={<RowIcon name="list" />}
          title={garageAppLabels.edit}
          caption="Plaque, préparation, description"
          onPress={openFrom(() => {
            setNotice(null);
            setEditOpen(true);
          })}
          testID="vehicle-edit-open"
        />
        {/* Relecture C2b : l'affiche à partager de chaque véhicule, pas seulement du premier du Garage. */}
        <HubRow
          lead={<RowIcon name="share" />}
          title="Partager son affiche"
          caption="Format story, signée Orasso"
          onPress={openFrom(() => router.push(`/vehicule/${v.id}/partager`))}
          testID="vehicle-share-open"
        />
        <HubRow
          lead={<RowIcon name="badge" />}
          title="Certification"
          // Lot M5 : la ligne d'état (ce qui manque en premier ; ancien véhicule : impossible).
          caption={certificationLineLabels.headline(certificationLine(cert, v.photos.length))}
          onPress={openFrom(() => setCertOpen(true))}
          testID="vehicle-cert-open"
        />
        {archived ? (
          <HubRow
            lead={<RowIcon name="undo" />}
            title="Remettre dans le garage actif"
            caption={v.statusNote ?? vehicleStatusLabels[v.status]}
            onPress={openFrom(() => void run("Retour au garage…", () => api.setVehicleStatus(v.id, "active")))}
            testID="vehicle-unarchive"
          />
        ) : (
          <HubRow
            lead={<RowIcon name="entry" />}
            title="Vendu, souvenir, accidenté"
            caption="Le véhicule quitte le garage actif"
            onPress={openFrom(() => setArchiveOpen(true))}
            testID="vehicle-archive-open"
          />
        )}
        <HubRow
          lead={<RowIcon name="close" />}
          title={garageAppLabels.delete}
          caption="Définitif"
          onPress={openFrom(() => setDeleteOpen(true))}
          testID="vehicle-delete"
        />
      </AppSheet>
      <CertificationSheet
        visible={certOpen}
        onClose={() => setCertOpen(false)}
        vehicleId={v.id}
        photoCount={v.photos.length}
        cert={cert}
        onChanged={() => vehicle.reload()}
      />
      <ArchiveSheet
        visible={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={async (status, note) => {
          await api.setVehicleStatus(v.id, status, note);
          setArchiveOpen(false);
          await vehicle.reload();
        }}
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
            .then(() => router.replace("/(tabs)/garage"))
            .catch((e) => setDeleteError(errorMessage(e)))
            .finally(() => setDeleting(false));
        }}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteError(null);
        }}
      />
    </>
  );

  return (
    <PosterFlow
      onClose={close}
      onRefresh={async () => {
        await Promise.all([vehicle.reload(), history.reload()]);
      }}
      overlays={overlays}
      testID="vehicle-page"
      hero={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Photo de couverture en plein écran"
          disabled={v.photos.length === 0}
          onPress={() => setViewer(0)}
          style={styles.hero}
        >
          <Photo
            source={mediaSource(v.photos[0]?.url)}
            placeholder={`linear-gradient(135deg, ${c.surfaceRaised} 0%, ${c.night} 100%)`}
            style={StyleSheet.absoluteFill}
          />
        </Pressable>
      }
    >
      {/* `.veh .vb` : étiquettes, nom entier, sous-ligne, trois chiffres, le crayon et « … ». */}
      <View style={styles.tags}>
        {v.certified ? <Tag tone="acc">Certifié</Tag> : null}
        {archived ? <TagWin>{vehicleStatusLabels[v.status]}</TagWin> : null}
        {v.plateTransfer ? <Tag tone="acc">{plateTransferLabels.pending}</Tag> : null}
        {/* Lot R4a : nom tapé, en attente de la liste Orasso (le propriétaire seul le voit). */}
        {v.proposedMake || v.proposedModel ? <Tag tone="line">{vehicleWizardLabels.toBeListed}</Tag> : null}
        {v.categories.map((cat, i) => (
          <Tag key={cat.id} tone={i === 0 ? "ink" : "line"}>
            {cat.label}
          </Tag>
        ))}
      </View>
      <View>
        <Text variant="posterL" color={c.ink} accessibilityRole="header" style={styles.name}>
          {v.label}
        </Text>
        {trim ? (
          <Text variant="meta" color={c.inkMuted} style={styles.trim}>
            {trim}
          </Text>
        ) : null}
      </View>
      <View style={[styles.specs, { borderColor: c.line }]}>
        {specs.map(([value, unit], i) => (
          <View key={unit} style={[styles.spec, i > 0 && [styles.specSep, { borderColor: c.line }]]}>
            <Num size={28}>{value}</Num>
            <Text variant="caption" color={c.inkMuted} style={styles.specUnit}>
              {unit}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.actions}>
        <SmButton
          kind="s"
          big
          icon="edit"
          style={styles.grow}
          onPress={() => router.push(`/vehicule/${v.id}/modifier`)}
          testID="vehicle-wizard-open"
        >
          {vehicleWizardLabels.editVehicle}
        </SmButton>
        <SmButton
          kind="s"
          big
          icon="more"
          onPress={() => setMenu(true)}
          accessibilityLabel="Plus d'actions"
          testID="vehicle-menu"
        />
      </View>
      {notice ? <Notice>{notice}</Notice> : null}

      {v.plateTransfer ? (
        <Notice>
          {`${plateTransferLabels.pending} : cette plaque est déjà sur le véhicule d'un autre membre, qui a été prévenu. ${
            v.plateTransfer.status === "arbitrated"
              ? "L'équipe Orasso va trancher."
              : "Sans réponse en 7 jours, l'équipe Orasso tranchera."
          } En attendant, tu ne peux pas candidater avec ce véhicule.`}
        </Notice>
      ) : null}

      <SecHead title="Photos" hint={`${v.photos.length} / ${MAX_PHOTOS}`} />
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
      {/* Lot 51 : chaque photo dit si sa plaque est floutée ; sinon, le cadre se pose à la main. */}
      {v.photos.length > 0 ? (
        <ChipRow>
          {v.photos.map((p, i) => (
            <Chip
              key={p.id}
              selected={p.plateBlurred}
              onPress={() => setBlurring({ kind: "remote", photo: p })}
              accessibilityLabel={`Photo ${i + 1} : ${p.plateBlurred ? vehicleWizardLabels.plateBlurred : vehicleWizardLabels.blurAction}`}
            >
              {`${i + 1} · ${p.plateBlurred ? vehicleWizardLabels.plateBlurred : vehicleWizardLabels.blurAction}`}
            </Chip>
          ))}
        </ChipRow>
      ) : null}
      {v.photos.length < MAX_PHOTOS ? (
        <SmButton kind="s" big wide icon="add" disabled={busy !== null} onPress={() => void add()}>
          {photoLabels.addOne}
        </SmButton>
      ) : null}
      {busy ? <Muted variant="meta">{busy}</Muted> : null}
      {error && !certOpen ? <Notice tone="error">{error}</Notice> : null}

      <SecHead title="Fiche" />
      <Card style={styles.factsCard}>
        {facts
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <View key={label} style={styles.fact}>
              <Text variant="label" color={c.inkMuted}>
                {label}
              </Text>
              <Text variant="bodyStrong" color={c.ink} style={styles.factValue}>
                {value}
              </Text>
            </View>
          ))}
        <Text variant="caption" color={c.inkMuted}>
          La plaque est visible par toi et par l'équipe organisatrice d'un événement où tu candidates.
        </Text>
      </Card>
      {v.preparation ? (
        <>
          <SecHead title="Préparation" />
          <Text variant="body" color={c.inkMuted}>
            {v.preparation}
          </Text>
        </>
      ) : null}
      {v.description ? (
        <>
          <SecHead title="Description" />
          <Text variant="body" color={c.inkMuted}>
            {v.description}
          </Text>
        </>
      ) : null}

      <SecHead title="Historique" />
      {history.data && history.data.length > 0 ? (
        history.data.map((h) => (
          <Pressable
            key={h.applicationId}
            accessibilityRole="link"
            accessibilityLabel={h.eventTitle}
            onPress={() => router.push(`/e/${h.eventSlug}`)}
            style={[styles.history, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
            testID="vehicle-history-row"
          >
            <View style={styles.grow}>
              <Text variant="bodyStrong" color={c.ink}>
                {h.eventTitle}
              </Text>
              <Text variant="caption" color={c.inkMuted}>
                {formatDay(h.startsAt)}
              </Text>
            </View>
            <Tag tone={h.attended ? "acc" : "line"}>
              {h.attended
                ? "Présent"
                : (applicationStatusLabels[h.status as keyof typeof applicationStatusLabels] ?? h.status)}
            </Tag>
          </Pressable>
        ))
      ) : (
        <Muted variant="body">Ce véhicule n'a pas encore participé à un événement.</Muted>
      )}
    </PosterFlow>
  );
}

const styles = StyleSheet.create({
  hero: { height: 260, width: "100%" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space1 + 2 },
  name: { fontSize: 22, lineHeight: 21 },
  trim: { fontSize: 13, textTransform: "uppercase" },
  specs: { flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderStyle: "dashed" },
  spec: { flex: 1, paddingVertical: space2 + 2, gap: 2 },
  specSep: { borderLeftWidth: 1, borderStyle: "dashed", paddingLeft: space3 },
  specUnit: { fontSize: 11.5, lineHeight: 14 },
  actions: { flexDirection: "row", gap: space2 + 2, alignItems: "stretch" },
  grow: { flex: 1, minWidth: 0 },
  sheetTitle: { fontSize: 18, lineHeight: 19 },
  factsCard: { gap: space2 },
  fact: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: space3 },
  factValue: { flex: 1, textAlign: "right" },
  history: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space3,
    paddingHorizontal: space4 - 4,
    borderRadius: 14,
  },
});
