// Mon profil, le hub (lot 40, prototype `s-me` ; lot C2b ; lot M5 : maquette 7.2 « Mon profil désencombré »). Pas de
// grand titre : l'en-tête compact en tient lieu (avatar, pseudo, grade, département, « Mon QR de compte » en icône ;
// « Ma fiche » pour le pro). Puis « Ma saison » (points et passeport en un seul bloc), le crew en une ligne, « Changer de
// casquette » (une phrase claire, chaque casquette avec son icône, son nom simple et ce qu'elle ouvre, l'active marquée ;
// le staff n'y est que si la personne a des missions), « Devenir organisateur ou pro », « Rejoindre une équipe staff »,
// puis les réglages en lignes groupées : Compte (e-mail, mot de passe, sanctions), Notifications, Confidentialité
// (profil public, export des données, suppression), Tes préférences (lot M6 : coin, distance, types, centres
// d'intérêt), Apparence (thème, animations), Mon profil public, crews, Aide, Se déconnecter.
// Plus d'accès flottant ici (retour 31).
// Lot R7b1 (D38, maquette R7.12) : le Profil porte le Garage. En-tête : photo dans son anneau (`AvatarRing`, sans story pour
// l'instant), pseudo, grade, département, QR de compte et roue dentée ; les trois nombres ; la ligne « Partenaires »
// (réservée au lot R7m1) ; « Profil public » ; puis deux onglets internes, Garage (par défaut, partout) et Sorties (ma saison,
// le passeport). Les casquettes et les accès « Devenir… » restent en bas de l'écran.
// Lot R8b1 (D40, maquette R8.1 `pr-profil`, option A « Compact ») : le haut du Profil passe d'environ 400 px à environ 214 px avant le
// contenu. Une grille de trois colonnes (photo de 72 px ; pseudo, grade et département, bio sur une ligne avec « plus » ; QR et
// Réglages en icônes empilées), puis la bande de compteurs (abonnés, abonnements, sorties, et « partenaires » en 4e compteur
// quand il y en a). « Profil public » sort de l'en-tête : c'est la première ligne de Réglages. Les onglets deviennent
// soulignés et collants (« Garage · N », « Sorties ») ; un profil sans véhicule (casquette visiteur) n'a pas « Garage » et
// s'ouvre sur « Sorties ». Les en-têtes des autres casquettes (pro, prestataire, média…) ne changent pas.
// Lot R4c (maquette R4.6) : l'en-tête devient une carte (`.r4me`) avec trois compteurs (abonnés, abonnements, sorties),
// les deux premiers ouvrent leur liste (`/reseau`), les sorties l'onglet Sorties, puis « Mon profil public » et le crew côte à côte ; ces deux accès quittent les
// réglages.
import { AvatarRing, Button, Icon, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  authorKeyOf,
  capLabels,
  explicitProfileTab,
  fitWideWordSize,
  gradeLabels,
  type ProfileTab,
  profileTabsLabels as PT,
  passportScreenTexts,
  profileOpenTab,
  profilePhotoLabels,
  profileTabFromParam,
  profileTabItems,
  settingsHubLabels,
  type UserProfileView,
  visibleProfileTab,
  type WithPublications,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { AccountQrSheet } from "@/features/AccountQrSheet";
import { PendingCard } from "@/features/arrivee/PendingCard";
import { GarageScreen } from "@/features/garage/GarageScreen";
import { EmailBanner } from "@/features/moi/EmailBanner";
import { StaffRequestSheet } from "@/features/moi/StaffRequestSheet";
import { TagWin } from "@/features/passionne/kit";
import { PassportPanel } from "@/features/passport/PassportScreen";
import { PublicationsTab } from "@/features/publications/PublicationsTab";
import { api } from "@/lib/api";
import { mediaSource } from "@/lib/media";
import { usePersona } from "@/lib/persona";
import { isBaseKind, personaKindLabels } from "@/lib/personaModel";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { StickyHeader, TabScreen } from "@/ui/Screens";
import { SecHead } from "@/ui/SecHead";
import { NetworkCounters } from "./network";
import { PartnersHost } from "./PartnersLine";
import { PhotoSheet } from "./PhotoSheet";
import { ProfileHead, SideIcon } from "./ProfileHead";
import { ProfileTabs } from "./ProfileTabs";
import { CapRows, CreateSheet, HeadAvatar, LinkRow, SeasonBlock } from "./parts";

const { space1, space2, space3, space4 } = tokens.spacing;

export function ProfilScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const { me, refreshMe } = useSession();
  const { persona, active, entries } = usePersona();
  const [sheet, setSheet] = useState<"qr" | "create" | "staff" | "photo" | null>(null);
  const [headW, setHeadW] = useState(0);
  const { fontScale } = useWindowDimensions();
  // Lot R7b1 : l'onglet interne s'ouvre par `?onglet=garage|sorties` (Garage par défaut, partout) ; un toucher le change.
  const { onglet } = useLocalSearchParams<{ onglet?: string }>();
  // Lot R8b2 : sans demande de l'adresse, mon profil s'ouvre sur « Publications » (par défaut sur tous les profils, le mien compris).
  const [tab, setTab] = useState<ProfileTab>(
    explicitProfileTab(onglet) ?? profileOpenTab({ mine: true, hasGarage: true, publications: undefined }),
  );
  // Le paramètre s’applique à chaque navigation, même avec la même valeur qu’avant : une fois lu, on le retire.
  useEffect(() => {
    if (onglet === undefined) return;
    setTab(profileTabFromParam(onglet));
    router.setParams({ onglet: undefined });
  }, [onglet, router]);
  // Change à chaque « tirer pour actualiser » : le garage et le passeport se relisent aussi.
  const [round, setRound] = useState(0);
  const close = () => setSheet(null);
  const base = isBaseKind(persona.kind);

  const points = useApi(() => api.points(), [], { cacheKey: "points" });
  const staff = useApi(() => api.staffEvents(), [], { cacheKey: "staff-events" });
  // Lot 50 : le passeport compte ses tampons (la saison en cours).
  const passport = useApi(() => api.passport(), [], { cacheKey: "passport.now", enabled: base });
  // Lot R4c : les trois compteurs du réseau (abonnés, abonnements, sorties ; lot R6b).
  const network = useApi(() => api.network(), [], { cacheKey: "network", enabled: base });
  // Lot R8b1 : mes véhicules, lus ici (le nombre de l'onglet « Garage · N ») et donnés au panneau Garage : une seule lecture.
  const vehicles = useApi(() => api.vehicles(), [], { cacheKey: "vehicles", enabled: base });
  // Lot R8b2 : mon nombre de publications (la ligne « N publications » de l'onglet) : mon profil public le porte.
  const selfCount = useApi(
    async () => (await api.userProfile(me?.profile.pseudo ?? "")) as WithPublications<UserProfileView>,
    [me?.profile.pseudo],
    {
      cacheKey: "profile.self.publications",
      enabled: base && Boolean(me?.profile.pseudo),
    },
  );
  const garageCount = vehicles.data ? vehicles.data.filter((v) => v.status === "active").length : null;
  // Un profil sans véhicule (casquette visiteur) n'a pas « Garage » et s'ouvre sur « Sorties » ; l'ajout d'un premier véhicule
  // reste possible par `casquette-quick-vehicle` (« Mes casquettes »). Tour 2 : sauf s'il a des véhicules archivés (le dernier
  // archivé rend visiteur) : « Garage » garde alors le seul lien vers « Véhicules archivés ».
  const hasArchived = vehicles.data?.some((v) => v.status !== "active") ?? false;
  const hasGarage = persona.kind !== "visitor" || hasArchived;
  // Visiteur dont les véhicules ne sont pas encore lus : on ne sait pas s'il a l'onglet « Garage » (véhicules archivés) ; le panneau
  // attend la lecture au lieu d'ouvrir « Sorties » puis de basculer sur « Garage ».
  // Seul l'onglet « Garage » attend : « Sorties » (saison, passeport) ne dépend pas des véhicules et s'ouvre tout de suite.
  const garageUnknown =
    persona.kind === "visitor" && base && vehicles.data === null && !vehicles.error && tab === "garage";
  const shownTab = visibleProfileTab(tab, hasGarage);

  const profile = me?.profile;
  const department = profile?.departments[0];
  const qrLabel = persona.kind === "pro" ? "Ma fiche" : "Mon QR de compte";
  const pseudoSize = fitWideWordSize(profile?.pseudo ?? "", headW / Math.max(1, fontScale), 22, 9);

  // Les deux boutons de l'en-tête des autres casquettes : QR de compte (Ma fiche pour le pro) et roue dentée (Réglages), l'un sur l'autre.
  const headButtons = (
    <View style={styles.headBtns}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={qrLabel}
        onPress={() => (persona.kind === "pro" ? router.navigate("/(pro)/fiche") : setSheet("qr"))}
        testID="profil-account-qr"
        hitSlop={6}
        style={({ pressed }) => [
          styles.qrb,
          base
            ? { backgroundColor: t.color.surfaceRaised }
            : { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard },
          pressed && styles.pressed,
        ]}
      >
        <Icon name={persona.kind === "pro" ? "briefcase" : "qr"} size={22} color={t.color.ink} />
      </Pressable>
      {/* Lot R5b (remarque 6 de Damien) : la roue dentée, à côté du QR, ouvre l'écran « Réglages ». */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={settingsHubLabels.open}
        onPress={() => router.push("/reglages")}
        testID="profil-gear"
        hitSlop={6}
        style={({ pressed }) => [
          styles.qrb,
          base
            ? { backgroundColor: t.color.surfaceRaised }
            : { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard },
          pressed && styles.pressed,
        ]}
      >
        <Icon name="gear" size={22} color={t.color.ink} />
      </Pressable>
    </View>
  );

  const headText = (
    <View style={styles.headText} onLayout={(e) => setHeadW(e.nativeEvent.layout.width)}>
      <Text
        variant="posterL"
        color={t.color.ink}
        // Lot R4c : un pseudo long rapetisse au lieu de se couper. Tour 2 : la taille tient compte de la police du système
        // (`fontScale`) et peut descendre à 9 ; une seule ligne, jamais de mot coupé (`adjustsFontSizeToFit` en dernier recours).
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[styles.pseudo, { fontSize: pseudoSize, lineHeight: pseudoSize + 1 }]}
        testID="profil-pseudo"
      >
        {profile?.pseudo ?? ""}
      </Text>
      <View style={styles.headTags}>
        <Tag tone="line">{personaKindLabels[persona.kind]}</Tag>
        <Text variant="caption" color={t.color.inkMuted} style={styles.headCaption}>
          {active.label}
        </Text>
      </View>
    </View>
  );

  return (
    <TabScreen
      onRefresh={async () => {
        setRound((r) => r + 1);
        await Promise.all([
          refreshMe(),
          points.reload(),
          staff.reload(),
          passport.reload(),
          network.reload(),
          vehicles.reload(),
          selfCount.reload(),
        ]);
      }}
      overlays={
        <>
          <AccountQrSheet visible={sheet === "qr"} onClose={close} />
          <CreateSheet visible={sheet === "create"} onClose={close} />
          <StaffRequestSheet visible={sheet === "staff"} onClose={close} />
          <PhotoSheet visible={sheet === "photo"} onClose={close} />
        </>
      }
    >
      <EmailBanner />
      <PendingCard where="profil" />

      {base ? (
        <>
          {/* Le haut compact (maquette R8.1, option A) : la grille d'identité puis la bande de compteurs. */}
          <View style={styles.top}>
            <ProfileHead
              testID="profil-head"
              avatar={
                // Lot R5b (maquette R5.4) : toucher sa photo ouvre « Ta photo de profil » ; le petit appareil photo le dit.
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={profilePhotoLabels.change}
                  onPress={() => setSheet("photo")}
                  hitSlop={4}
                  testID="profil-avatar"
                  style={({ pressed }) => [styles.avatarBtn, pressed && styles.pressed]}
                >
                  <AvatarRing
                    ring={null}
                    size="profile"
                    source={mediaSource(profile?.avatarUrl)}
                    name={profile?.pseudo ?? "?"}
                  />
                  <View style={[styles.cam, { backgroundColor: t.color.accent, borderColor: t.color.ground }]}>
                    <Icon name="camera" size={11} color={t.color.accentInk} />
                  </View>
                </Pressable>
              }
              pseudo={profile?.pseudo ?? ""}
              pseudoTestID="profil-pseudo"
              line={
                <>
                  {profile ? <TagWin>{gradeLabels[profile.grade]}</TagWin> : null}
                  {department ? (
                    <View style={styles.dept} testID="profil-department">
                      <Icon name="place" size={14} color={t.color.inkMuted} />
                      <Text variant="bodyStrong" color={t.color.inkMuted} style={styles.deptText}>
                        {department}
                      </Text>
                    </View>
                  ) : null}
                </>
              }
              bio={profile?.bio}
              bioTestID="profil-bio"
              side={
                <>
                  <SideIcon icon="qr" label={PT.qrOpen} onPress={() => setSheet("qr")} testID="profil-account-qr" />
                  <SideIcon
                    icon="gear"
                    label={PT.settingsOpen}
                    onPress={() => router.push("/reglages")}
                    testID="profil-gear"
                  />
                </>
              }
            />
            <PartnersHost mine reloadKey={round}>
              {(cell) => (
                <NetworkCounters
                  counts={network.data}
                  partners={cell}
                  onOpen={(target) =>
                    target === "sorties"
                      ? setTab("sorties")
                      : router.push({ pathname: "/reseau", params: { liste: target } })
                  }
                />
              )}
            </PartnersHost>
          </View>

          {/* Onglets soulignés, collants sous la barre du haut (`StickyHeader`, repéré par la page). */}
          <StickyHeader style={[styles.tabsBar, { backgroundColor: t.color.ground }]}>
            <ProfileTabs
              value={shownTab}
              onChange={setTab}
              items={profileTabItems({ hasGarage, restricted: false })}
              garageCount={garageCount}
            />
          </StickyHeader>
          {garageUnknown ? (
            <View style={styles.panel} testID="profil-tab-pending">
              <Text variant="caption" color={t.color.inkMuted}>
                {PT.garageLoading}
              </Text>
            </View>
          ) : shownTab === "publications" ? (
            <PublicationsTab
              key={round}
              authorKey={authorKeyOf("user", me?.user.id ?? "")}
              pseudo={profile?.pseudo ?? ""}
              mine
              total={selfCount.data?.publications?.count ?? null}
            />
          ) : shownTab === "garage" ? (
            <GarageScreen vehicles={vehicles} round={round} />
          ) : (
            <View style={styles.panel} testID="profil-sorties-panel">
              {/* « Ma saison » : points et tampons en un seul bloc (maquette 7.2), puis le passeport lui-même. */}
              {profile ? (
                <SeasonBlock
                  points={profile.pointsSeason}
                  grade={gradeLabels[profile.grade]}
                  data={points.data ?? null}
                  // Sans tampon, l'état vide du passeport (dessous) le dit seul : « Ton premier tampon t'attend » une fois.
                  stamps={
                    passport.data && passport.data.total > 0
                      ? passportScreenTexts.tile(passport.data.total, passport.data.rare)
                      : null
                  }
                  onHistory={() => router.push("/reglages/points")}
                />
              ) : null}
              <PassportPanel reloadKey={round} />
              <Button
                variant="secondary"
                icon="ticket"
                fullWidth
                onPress={() => router.push("/sorties")}
                testID="profil-places"
              >
                {PT.seePlaces}
              </Button>
            </View>
          )}
        </>
      ) : (
        <View style={styles.head} testID="profil-head">
          <HeadAvatar url={active.logoUrl} name={active.label ?? "?"} />
          {headText}
          {headButtons}
        </View>
      )}

      <SecHead title={capLabels.title} />
      <Text variant="body" color={t.color.inkMuted} style={styles.capsay} testID="casquettes-intro">
        {capLabels.intro(
          entries.map((e) => e.kind),
          persona.kind,
        )}
      </Text>
      <CapRows staffEvents={staff.data ?? []} />
      <View style={styles.links}>
        <LinkRow icon="add" label={capLabels.become} onPress={() => setSheet("create")} testID="profil-create" />
        <LinkRow
          icon="staff"
          label={capLabels.joinTeam}
          onPress={() => setSheet("staff")}
          testID="casquette-staff-request"
        />
      </View>

      {/* Lot R5b (remarque 6 de Damien) : les réglages ont quitté l'onglet ; la roue dentée de l'en-tête les ouvre. */}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space3 },
  top: { gap: space2 },
  // Les onglets collants couvrent toute la largeur (le contenu a 16 px de marge) sur le fond de l'écran.
  tabsBar: { marginHorizontal: -space4, paddingHorizontal: space4 },
  dept: { flexDirection: "row", alignItems: "center", gap: 4 },
  deptText: { fontSize: 13, lineHeight: 16 },
  headText: { flex: 1, minWidth: 0, gap: space1 + 1 },
  pseudo: { fontSize: 22, lineHeight: 23 },
  headTags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space1 + 2 },
  headCaption: { flexShrink: 1 },
  qrb: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  headBtns: { gap: space1 + 4 },
  pressed: { opacity: 0.8 },
  panel: { gap: space3 },
  // Lot R5b : l'avatar touchable et son petit appareil photo (`.r5cam` de la maquette : rond moutarde en bas à droite).
  avatarBtn: { position: "relative" },
  cam: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: tokens.radius.radiusChip,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  capsay: { fontSize: 13.5, lineHeight: 19 },
  links: { gap: 0 },
});
