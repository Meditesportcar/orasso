// Garage v2 (lot 51, prototype `s-garage` ; reproduit fidèlement au lot C2b ; lot M5 : maquette 7.1) : grand titre « Mon
// garage · N véhicules », la mini-fiche du premier véhicule (elle ne prend plus tout l'écran : correction de Damien),
// les autres en cartes horizontales à vignette carrée, « Ajouter un véhicule · Marque, photos, plaque floutée : deux
// minutes. » en pointillés, « Pour ta … » (pros partenaires, sponsorisé lié au véhicule) et une ligne « Archivés » en
// bas. Pas d'accès flottant ici (lot M5 : il n'a rien à faire au Garage). Retirés (audit § 5.2) : les
// crews (Mon profil › Mon crew), les demandes de transfert de plaque (Boîte › Demandes). « Partager sa carte » ouvre
// l'écran de flux `/vehicule/<id>/partager`. Un garage vide montre l'état vide du O.
// Lot R4c (maquette R4.5) : le véhicule principal en mini-fiche (l'API renvoie le garage trié, principal d'abord), les
// autres en lignes compactes sous « Tes autres véhicules » ; menu « ⋯ » de chaque véhicule : « Mettre en avant »,
// Modifier, Partager son affiche, Retirer du garage (archiver) ; un bandeau confirme le nouveau principal ; « Pour ta … »
// suit le principal.
// Lot R7b1 (D38) : le Garage n'est plus un écran : c'est le panneau « Garage » du Profil (sans en-tête ni grand titre ; ses
// feuilles passent par `<Overlay>`) ; « Ajouter un véhicule » devient le bouton principal du panneau.
// Lot R8b1 (D40, maquette R8.1) : la ligne « N véhicules » disparaît (le nombre est dans l'onglet « Garage · N ») ; « Ajouter un
// véhicule » devient une ligne en fin de liste (`.r8addrow`, un contour d'un trait) ; le bouton principal n'existe que si le
// garage est vide, dans l'état vide. La lecture des véhicules est celle du Profil (il en a besoin pour le nombre de l'onglet).
import { Button, EmptyState, Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  vehicleWizardLabels as L,
  mainVehicleLabels as M,
  profileTabsLabels as PT,
  type VehicleFull,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { SmButton } from "@/features/passionne/kit";
import { SetList, SetRow } from "@/features/profil/parts";
import { ArchiveSheet } from "@/features/vehicle/ArchiveSheet";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";
import type { ApiState } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { Notice } from "@/ui/Notice";
import { Overlay } from "@/ui/Overlay";
import { SecHead } from "@/ui/SecHead";
import { GarageCard } from "./GarageCard";
import { VehiclePros } from "./VehiclePros";

const { space3 } = tokens.spacing;

export function GarageScreen({
  vehicles,
  reloadKey = 0,
}: {
  /** La lecture de mes véhicules, faite par le Profil (cache « vehicles »). */
  vehicles: ApiState<VehicleFull[]>;
  /** Change à chaque « tirer pour actualiser » du Profil. */ reloadKey?: number;
}) {
  const { t } = useTheme();
  const router = useRouter();
  const active = vehicles.data?.filter((v) => v.status === "active") ?? [];
  const archived = vehicles.data?.filter((v) => v.status !== "active") ?? [];
  const add = () => router.push("/vehicule/nouveau");
  // Tour 2 : la certification et « Pour ta … » se relisent au « tirer pour actualiser » du Profil.
  const round = reloadKey;
  const { refreshMe } = useSession();
  const [menuFor, setMenuFor] = useState<VehicleFull | null>(null);
  const [archiveFor, setArchiveFor] = useState<VehicleFull | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isMain = (v: VehicleFull | null) => Boolean(v && active[0]?.id === v.id);

  // Le bandeau de confirmation s'efface seul (4,5 s, comme la maquette).
  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 4500);
    return () => clearTimeout(id);
  }, [banner]);

  const feature = async (v: VehicleFull) => {
    setMenuFor(null);
    setError(null);
    try {
      await api.setMainVehicle(v.id);
      await Promise.all([vehicles.reload(), refreshMe()]);
      setBanner(M.confirmed(v.label));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  // Le Profil relit tout au « tirer pour actualiser » : le garage aussi.
  const reload = vehicles.reload;
  useEffect(() => {
    if (reloadKey > 0) void reload();
  }, [reloadKey, reload]);

  return (
    <View style={styles.panel} testID="garage-panel">
      <Overlay>
        <>
          <AppSheet
            visible={menuFor !== null}
            onClose={() => setMenuFor(null)}
            accessibilityLabel={menuFor ? M.menu(menuFor.label) : "Menu du véhicule"}
          >
            <Text variant="title" color={t.color.ink} style={styles.menuTitle}>
              {menuFor?.label ?? ""}
            </Text>
            <View testID="garage-menu-sheet">
              <SetList>
                {menuFor && !isMain(menuFor) ? (
                  <SetRow
                    first
                    icon="star"
                    title={M.feature}
                    caption={M.featureHint}
                    onPress={() => void feature(menuFor)}
                    testID="garage-feature"
                  />
                ) : null}
                <SetRow
                  first={isMain(menuFor)}
                  icon="edit"
                  title={M.edit}
                  caption={M.editHint}
                  onPress={() => {
                    const v = menuFor;
                    setMenuFor(null);
                    if (v) router.push(`/vehicule/${v.id}/modifier`);
                  }}
                  testID="garage-menu-edit"
                />
                <SetRow
                  icon="share"
                  title={M.share}
                  onPress={() => {
                    const v = menuFor;
                    setMenuFor(null);
                    if (v) router.push(`/vehicule/${v.id}/partager`);
                  }}
                  testID="garage-menu-share"
                />
                <SetRow
                  icon="trash"
                  title={M.remove}
                  tone="out"
                  onPress={() => {
                    setArchiveFor(menuFor);
                    setMenuFor(null);
                  }}
                  testID="garage-menu-remove"
                />
              </SetList>
            </View>
          </AppSheet>
          <ArchiveSheet
            visible={archiveFor !== null}
            onClose={() => setArchiveFor(null)}
            onConfirm={async (status, note) => {
              if (!archiveFor) return;
              await api.setVehicleStatus(archiveFor.id, status, note);
              setArchiveFor(null);
              // Un principal archivé cède sa place au plus ancien suivant, sans question (API).
              await Promise.all([vehicles.reload(), refreshMe()]);
            }}
          />
        </>
      </Overlay>
      {vehicles.offline ? <Notice>Hors ligne : ton garage tel que ton téléphone l'a gardé.</Notice> : null}

      {active.length === 0 && !vehicles.loading ? (
        <EmptyState
          title={PT.garageEmptyTitle}
          text={PT.garageEmptyText}
          action={
            <Button variant="primary" icon="add" onPress={add} testID="garage-empty-add">
              {L.addVehicle}
            </Button>
          }
        />
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {/* Tour 2 : le bandeau se pose au-dessus de la mini-fiche, dans la page : il ne couvre plus le principal. */}
      {banner ? (
        <View
          style={[
            styles.banner,
            { backgroundColor: t.color.bar, boxShadow: `0 0 0 2px ${t.color.accent}, ${t.shadow.shadowPoster}` },
          ]}
          accessibilityLiveRegion="polite"
          testID="garage-main-banner"
        >
          <View style={[styles.bannerIcon, { backgroundColor: t.color.accent }]}>
            <Icon name="star" size={18} color={t.color.accentInk} />
          </View>
          <Text variant="body" color={t.color.barInk} style={styles.bannerText}>
            {banner}
          </Text>
        </View>
      ) : null}
      {active[0] ? (
        <GarageCard
          key={`main-${active[0].id}`}
          vehicle={active[0]}
          first
          round={round}
          onShare={(v) => router.push(`/vehicule/${v.id}/partager`)}
          onMenu={setMenuFor}
        />
      ) : null}
      {active.length > 1 ? <SecHead title={M.others} /> : null}
      {active.slice(1).map((v) => (
        <GarageCard
          key={v.id}
          vehicle={v}
          first={false}
          round={round}
          onShare={(x) => router.push(`/vehicule/${x.id}/partager`)}
          onMenu={setMenuFor}
        />
      ))}

      {/* « Ajouter un véhicule » : une ligne en fin de liste, pas un bouton principal (celui de l'état vide est le seul). */}
      {active.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={L.addVehicle}
          onPress={add}
          testID="garage-add"
          style={({ pressed }) => [
            styles.addRow,
            { boxShadow: `inset 0 0 0 1.5px ${t.color.line}` },
            pressed && styles.pressed,
          ]}
        >
          <Icon name="add" size={18} color={t.color.ink} />
          <Text variant="bodyStrong" color={t.color.ink} style={styles.addText}>
            {L.addVehicle}
          </Text>
        </Pressable>
      ) : null}

      {/* Une section par véhicule (clé) : jamais les pros d'un autre véhicule, même le temps d'une réponse. */}
      {active[0] ? (
        <VehiclePros key={active[0].id} vehicleId={active[0].id} modelName={active[0].modelName} round={round} />
      ) : null}

      {/* Archivés : une ligne en bas du Garage (audit § 5.2), la liste vit dans « Mes véhicules archivés ». */}
      {archived.length > 0 ? (
        <SmButton kind="g" icon="list" onPress={() => router.push("/vehicules-archives")} testID="garage-archived">
          {L.archived(archived.length)}
        </SmButton>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space3 },
  menuTitle: { marginBottom: space3 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    paddingVertical: space3,
    paddingHorizontal: space3 + 2,
    borderRadius: 16,
  },
  bannerIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18 },
  // `.r8addrow` : un contour d'un trait, 44 px, icône « plus » et libellé centrés.
  addRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space3 - 4,
    paddingHorizontal: space3,
    borderRadius: 14,
  },
  addText: { fontSize: 13.5, lineHeight: 17, flexShrink: 1, textAlign: "center" },
  pressed: { opacity: 0.8 },
});
