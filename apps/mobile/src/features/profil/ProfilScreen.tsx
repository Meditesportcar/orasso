// Mon profil, le hub (lot 40, prototype `s-me` ; lot C2b ; lot M5 : maquette 7.2 « Mon profil désencombré »). Pas de
// grand titre : l'en-tête compact en tient lieu (avatar, pseudo, grade, département, « Mon QR de compte » en icône ;
// « Ma fiche » pour le pro). Puis « Ma saison » (points et passeport en un seul bloc), le crew en une ligne, « Changer de
// casquette » (une phrase claire, chaque casquette avec son icône, son nom simple et ce qu'elle ouvre, l'active marquée ;
// le staff n'y est que si la personne a des missions), « Devenir organisateur ou pro », « Rejoindre une équipe staff »,
// puis les réglages en lignes groupées : Compte (e-mail, mot de passe, sanctions), Notifications, Confidentialité
// (profil public, export des données, suppression), Tes préférences (lot M6 : coin, distance, types, centres
// d'intérêt), Apparence (thème, animations), Mon profil public, Amis et crews, Aide, Se déconnecter.
// Plus d'accès flottant ici (retour 31).
// Lot R4c (maquette R4.6) : l'en-tête devient une carte (`.r4me`) avec trois compteurs (abonnés, abonnements, amis),
// chacun ouvre sa liste (`/reseau`), puis « Mon profil public » et le crew côte à côte ; ces deux accès quittent les
// réglages (avec « Amis et crews »).
import { Icon, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import { capLabels, gradeLabels, passportScreenTexts, profilePhotoLabels, settingsHubLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AccountQrSheet } from "@/features/AccountQrSheet";
import { PendingCard } from "@/features/arrivee/PendingCard";
import { fitWordSize, WIDE_EM } from "@/features/home/fit";
import { EmailBanner } from "@/features/moi/EmailBanner";
import { StaffRequestSheet } from "@/features/moi/StaffRequestSheet";
import { TagWin } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { usePersona } from "@/lib/persona";
import { isBaseKind, personaKindLabels, tabHref } from "@/lib/personaModel";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { TabScreen } from "@/ui/Screens";
import { SecHead } from "@/ui/SecHead";
import { departmentCaption, NetworkCounters, ProfileLinks } from "./network";
import { PhotoSheet } from "./PhotoSheet";
import { CapRows, CreateSheet, HeadAvatar, HubRow, LinkRow, RowIcon, SeasonBlock } from "./parts";

const { space1, space3 } = tokens.spacing;

export function ProfilScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const { me, refreshMe } = useSession();
  const { persona, active, entries } = usePersona();
  const [sheet, setSheet] = useState<"qr" | "create" | "staff" | "photo" | null>(null);
  const [headW, setHeadW] = useState(0);
  const close = () => setSheet(null);
  const base = isBaseKind(persona.kind);

  const points = useApi(() => api.points(), [], { cacheKey: "points" });
  const crews = useApi(() => api.myCrews(), [], { cacheKey: "my-crews", enabled: base });
  const staff = useApi(() => api.staffEvents(), [], { cacheKey: "staff-events" });
  // Lot 50 : le passeport compte ses tampons (la saison en cours).
  const passport = useApi(() => api.passport(), [], { cacheKey: "passport.now", enabled: base });
  // Relecture C2b : sans véhicule actif (casquette visiteur, pas d'onglet Garage), les archives restent joignables ici.
  const vehicles = useApi(() => api.vehicles(), [], { cacheKey: "vehicles", enabled: base });
  // Lot R4c : les trois compteurs du réseau (abonnés, abonnements, amis).
  const network = useApi(() => api.network(), [], { cacheKey: "network", enabled: base });
  const archived = vehicles.data?.filter((v) => v.status !== "active").length ?? 0;

  const profile = me?.profile;
  const department = profile?.departments[0];
  const crew = crews.data?.[0];
  const qrLabel = persona.kind === "pro" ? "Ma fiche" : "Mon QR de compte";
  const pseudoSize = fitWordSize(profile?.pseudo ?? "", headW, 22, 14, WIDE_EM);

  return (
    <TabScreen
      onRefresh={async () => {
        await Promise.all([
          refreshMe(),
          points.reload(),
          crews.reload(),
          staff.reload(),
          passport.reload(),
          vehicles.reload(),
          network.reload(),
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

      {/* En-tête compact `.mh` : avatar, pseudo, grade et département ; le QR de compte (Ma fiche pour le pro) en icône.
          Lot R4c : pour le passionné, une carte `.r4me` avec les compteurs et les deux accès. */}
      <View
        style={base ? [styles.me, { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard }] : undefined}
        testID="profil-card"
      >
        <View style={styles.head} testID="profil-head">
          {base ? (
            // Lot R5b (maquette R5.4) : toucher sa photo ouvre « Ta photo de profil » ; le petit appareil photo le dit.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={profilePhotoLabels.change}
              onPress={() => setSheet("photo")}
              hitSlop={4}
              testID="profil-avatar"
              style={({ pressed }) => [styles.avatarBtn, pressed && styles.pressed]}
            >
              <HeadAvatar url={profile?.avatarUrl} name={profile?.pseudo ?? "?"} />
              <View style={[styles.cam, { backgroundColor: t.color.accent, borderColor: t.color.surface }]}>
                <Icon name="camera" size={13} color={t.color.accentInk} />
              </View>
            </Pressable>
          ) : (
            <HeadAvatar url={active.logoUrl} name={active.label ?? "?"} />
          )}
          <View style={styles.headText} onLayout={(e) => setHeadW(e.nativeEvent.layout.width)}>
            <Text
              variant="posterL"
              color={t.color.ink}
              // Lot R4c : l'en-tête est une carte, plus étroite ; un pseudo long rapetisse au lieu de se couper.
              style={[styles.pseudo, { fontSize: pseudoSize, lineHeight: pseudoSize + 1 }]}
            >
              {profile?.pseudo ?? ""}
            </Text>
            <View style={styles.headTags}>
              {base && profile ? (
                <TagWin>{gradeLabels[profile.grade]}</TagWin>
              ) : (
                <Tag tone="line">{personaKindLabels[persona.kind]}</Tag>
              )}
              <Text variant="caption" color={t.color.inkMuted} style={styles.headCaption}>
                {base ? (departmentCaption(department) ?? "Passionné") : active.label}
              </Text>
            </View>
          </View>
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
        {base && profile?.bio ? (
          <Text variant="body" color={t.color.inkMuted} numberOfLines={2} style={styles.bio} testID="profil-bio">
            {profile.bio}
          </Text>
        ) : null}
        {base ? (
          <>
            <NetworkCounters
              counts={network.data}
              onOpen={(tab) => router.push({ pathname: "/reseau", params: { tab } })}
            />
            <ProfileLinks
              crew={
                crew
                  ? {
                      name: crew.name,
                      caption: `Ton crew · ${crew.membersCount} membre${crew.membersCount > 1 ? "s" : ""}`,
                    }
                  : null
              }
              onPublic={() => router.push("/profil-public")}
              // Lot R3b (retour 16) : sans crew, d'abord rejoindre (« Créer un crew » vient en second).
              onCrew={() => router.push(crew ? `/crew/${crew.slug}` : "/rejoindre-crew")}
            />
          </>
        ) : null}
      </View>

      {/* « Ma saison » : points et passeport en un seul bloc (maquette 7.2). */}
      {base && profile ? (
        <SeasonBlock
          points={profile.pointsSeason}
          grade={gradeLabels[profile.grade]}
          data={points.data ?? null}
          stamps={passport.data ? passportScreenTexts.tile(passport.data.total, passport.data.rare) : null}
          onPassport={() => router.navigate((tabHref(persona.kind, "passeport") ?? "/mon-passeport") as never)}
          onHistory={() => router.push("/reglages/points")}
        />
      ) : null}

      {base && archived > 0 ? (
        <HubRow
          lead={<RowIcon name="vehicle" />}
          title="Mes véhicules archivés"
          caption={`${archived} · vendus, souvenirs, accidentés`}
          onPress={() => router.push("/vehicules-archives")}
          testID="profil-archived"
        />
      ) : null}

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

      {/* Lot R5b (remarque 6 de Damien) : les réglages ont quitté l'onglet ; la roue dentée de la carte les ouvre. */}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  me: { gap: space3, padding: space3 + 2, borderRadius: 20 },
  head: { flexDirection: "row", alignItems: "center", gap: space3 },
  headText: { flex: 1, minWidth: 0, gap: space1 + 1 },
  pseudo: { fontSize: 22, lineHeight: 23 },
  headTags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space1 + 2 },
  headCaption: { flexShrink: 1 },
  qrb: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.8 },
  // Lot R5b : l'avatar touchable et son petit appareil photo (`.r5cam` de la maquette : rond moutarde en bas à droite).
  avatarBtn: { position: "relative" },
  cam: {
    position: "absolute",
    right: -6,
    bottom: -6,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  bio: { fontSize: 13.5, lineHeight: 19 },
  capsay: { fontSize: 13.5, lineHeight: 19 },
  links: { gap: 0 },
});
