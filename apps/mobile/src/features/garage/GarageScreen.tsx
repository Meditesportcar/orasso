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
import { Button, EmptyState, Icon, Monogram, Text, tokens, useTheme } from "@orasso/design-system/native";
import { vehicleWizardLabels as L, mainVehicleLabels as M, type VehicleFull } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { SmButton } from "@/features/passionne/kit";
import { SetList, SetRow } from "@/features/profil/parts";
import { ArchiveSheet } from "@/features/vehicle/ArchiveSheet";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { SecHead } from "@/ui/SecHead";
import { GarageCard } from "./GarageCard";
import { VehiclePros } from "./VehiclePros";

const { space1, space3 } = tokens.spacing;

export function GarageScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const vehicles = useApi(() => api.vehicles(), [], { cacheKey: "vehicles" });
  const active = vehicles.data?.filter((v) => v.status === "active") ?? [];
  const archived = vehicles.data?.filter((v) => v.status !== "active") ?? [];
  const add = () => router.push("/vehicule/nouveau");
  const [round, setRound] = useState(0);
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

  return (
    <TabScreen
      title={L.garageTitle}
      facts={vehicles.data ? L.garageCount(active.length) : undefined}
      onRefresh={async () => {
        await vehicles.reload();
        // Tour 2 : la certification et « Pour ta … » se relisent aussi.
        setRound((r) => r + 1);
      }}
      overlays={
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
      }
    >
      {vehicles.offline ? <Notice>Hors ligne : ton garage tel que ton téléphone l'a gardé.</Notice> : null}

      {active.length === 0 && !vehicles.loading ? (
        <EmptyState
          title={L.emptyTitle}
          text={L.emptyText}
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

      {active.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${L.addVehicle}. ${L.addVehicleHint}`}
          onPress={add}
          testID="garage-add"
          style={[styles.add, { borderColor: t.color.line }]}
        >
          <Monogram size={56} />
          <View style={styles.addText}>
            <Text variant="bodyStrong" color={t.color.ink} style={styles.addTitle}>
              {L.addVehicle}
            </Text>
            <Text variant="caption" color={t.color.inkMuted}>
              {L.addVehicleHint}
            </Text>
          </View>
          <Icon name="add" size={20} color={t.color.ink} />
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
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  add: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3 + 2,
    padding: space3 + 2,
    borderRadius: 20,
    borderWidth: 2,
    borderStyle: "dashed",
  },
  addTitle: { fontFamily: "Archivo-ExtraBold" },
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
  addText: { flex: 1, gap: space1 },
});
