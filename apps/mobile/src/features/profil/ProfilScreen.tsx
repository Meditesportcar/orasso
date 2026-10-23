// Mon profil, le hub (lot 40, prototype `s-me` ; reproduit fidèlement au lot C2b) : pas de grand titre, l'en-tête
// `.me-head` en tient lieu (avatar incliné, pseudo, grade en étiquette, Mon QR de compte), la carte de saison (qui ouvre
// l'historique des points), les invitations Mon passeport (trois tampons) et Mon crew, Mes casquettes en lignes `.cap`,
// Créer, puis les réglages en tuiles (chacune ouvre `reglages/<section>`), Aide et Se déconnecter.
// Retirés (audit § 5.2) : la ligne « Historique des points » (= toucher la carte de saison), « Mes véhicules archivés »
// (Garage seulement), l'aide « Appui long sur le logo », « Devenir staff » (= ligne « Où je suis staff » sans mission) et
// le bouton « Mon profil de base » (= la ligne de casquette).
import { initialsOf, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import { gradeLabels, passportScreenTexts, preferencesLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { AccountQrSheet } from "@/features/AccountQrSheet";
import { PendingCard } from "@/features/arrivee/PendingCard";
import { EmailBanner } from "@/features/moi/EmailBanner";
import { StaffRequestSheet } from "@/features/moi/StaffRequestSheet";
import { CrewDot, Nudge, SmButton, TagWin } from "@/features/passionne/kit";
import { Stamp } from "@/features/passport/Stamp";
import { api } from "@/lib/api";
import { usePersona } from "@/lib/persona";
import { isBaseKind, personaKindLabels, tabHref } from "@/lib/personaModel";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { TabScreen } from "@/ui/Screens";
import { SecHead } from "@/ui/SecHead";

import { CreateSheet, HeadAvatar, HubRow, PersonaRows, RowIcon, SeasonCard, SettingTile } from "./parts";

const { space1, space2, space3 } = tokens.spacing;

const visibilityCaption = { public: "Profil public, nom privé", private: "Profil privé, nom privé" } as const;

export function ProfilScreen() {
  const { t, preference } = useTheme();
  const router = useRouter();
  const { me, refreshMe, signOut } = useSession();
  const { persona, active } = usePersona();
  const [sheet, setSheet] = useState<"qr" | "create" | "staff" | null>(null);
  const close = () => setSheet(null);
  const base = isBaseKind(persona.kind);

  const points = useApi(() => api.points(), [], { cacheKey: "points" });
  const crews = useApi(() => api.myCrews(), [], { cacheKey: "my-crews", enabled: base });
  const staff = useApi(() => api.staffEvents(), [], { cacheKey: "staff-events" });
  // Lot 50 : le passeport compte ses tampons (la saison en cours).
  const passport = useApi(() => api.passport(), [], { cacheKey: "passport.now", enabled: base });
  // Relecture C2b : sans véhicule actif (casquette visiteur, pas d'onglet Garage), les archives restent joignables ici.
  const vehicles = useApi(() => api.vehicles(), [], { cacheKey: "vehicles", enabled: base });
  const archived = vehicles.data?.filter((v) => v.status !== "active").length ?? 0;

  const profile = me?.profile;
  const department = profile?.departments[0];
  const crew = crews.data?.[0];
  const lastStamps = (passport.data?.pages.flatMap((p) => p.stamps) ?? []).slice(-3);
  const theme = preference === "sable" ? "Sable" : preference === "auto" ? "Automatique" : "Béton";
  const preferencesCaption = `Thème ${theme}`;

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
        ]);
      }}
      overlays={
        <>
          <AccountQrSheet visible={sheet === "qr"} onClose={close} />
          <CreateSheet visible={sheet === "create"} onClose={close} />
          <StaffRequestSheet visible={sheet === "staff"} onClose={close} />
        </>
      }
    >
      <EmailBanner />
      <PendingCard where="profil" />

      {/* En-tête `.me-head` : avatar incliné, pseudo, grade en étiquette, puis Mon QR de compte (Ma fiche pour le pro). */}
      <View style={styles.head} testID="profil-head">
        <HeadAvatar
          url={base ? profile?.avatarUrl : active.logoUrl}
          name={(base ? profile?.pseudo : active.label) ?? "?"}
        />
        <View style={styles.headText}>
          <Text variant="posterL" color={t.color.ink} style={styles.pseudo}>
            {profile?.pseudo ?? ""}
          </Text>
          <View style={styles.headTags}>
            {base && profile ? (
              <TagWin>{gradeLabels[profile.grade]}</TagWin>
            ) : (
              <Tag tone="line">{personaKindLabels[persona.kind]}</Tag>
            )}
            <Text variant="caption" color={t.color.inkMuted} style={styles.headCaption}>
              {base ? (department ? `Département ${department}` : "Passionné") : active.label}
            </Text>
          </View>
          {persona.kind === "pro" ? (
            <SmButton kind="s" icon="briefcase" onPress={() => router.navigate("/(pro)/fiche")}>
              Ma fiche
            </SmButton>
          ) : (
            <SmButton kind="s" icon="qr" onPress={() => setSheet("qr")} testID="profil-account-qr">
              Mon QR de compte
            </SmButton>
          )}
        </View>
      </View>

      {base && profile ? (
        <SeasonCard
          points={profile.pointsSeason}
          grade={gradeLabels[profile.grade]}
          data={points.data ?? null}
          onPress={() => router.push("/reglages/points")}
        />
      ) : null}

      {/* `.nudge` Mon passeport : le compte des tampons et les trois derniers, qui se chevauchent. */}
      {base ? (
        <Nudge
          onPress={() => router.navigate((tabHref(persona.kind, "passeport") ?? "/mon-passeport") as never)}
          testID="profil-passport"
          accessibilityLabel={passportScreenTexts.tileTitle}
          trailing={
            lastStamps.length > 0 ? (
              <View style={styles.stamps}>
                {lastStamps.map((s, i) => (
                  <View key={s.id} style={i > 0 ? styles.stampOver : null}>
                    <Stamp stamp={s} size={58} />
                  </View>
                ))}
              </View>
            ) : undefined
          }
        >
          <Text variant="label" color={t.color.inkMuted}>
            {passportScreenTexts.tileTitle}
          </Text>
          <Text variant="bodyStrong" color={t.color.ink} style={styles.nudgeStrong}>
            {passport.data
              ? passportScreenTexts.tile(passport.data.total, passport.data.rare)
              : "Tes tampons d'événements"}
          </Text>
        </Nudge>
      ) : null}

      {/* `.nudge` Mon crew : rond moutarde aux initiales, nom et membres. */}
      {base ? (
        <Nudge
          onPress={() => router.push(crew ? `/crew/${crew.slug}` : "/crew/nouveau")}
          testID="profil-crew"
          accessibilityLabel={crew ? `Mon crew, ${crew.name}` : "Mon crew, crée ou rejoins un crew"}
        >
          <View style={styles.crewRow}>
            <CrewDot initials={crew ? initialsOf(crew.name).slice(0, 2) : "+"} size={46} />
            <View style={styles.crewText}>
              <Text variant="label" color={t.color.inkMuted}>
                Mon crew
              </Text>
              <Text variant="bodyStrong" color={t.color.ink} style={styles.nudgeStrong}>
                {crew
                  ? `${crew.name} · ${crew.membersCount} membre${crew.membersCount > 1 ? "s" : ""}`
                  : "Crée ou rejoins un crew"}
              </Text>
            </View>
          </View>
        </Nudge>
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

      <SecHead title="Mes casquettes" hint="Une barre d'onglets par casquette" />
      <PersonaRows staffEvents={staff.data ?? []} onStaffRequest={() => setSheet("staff")} />
      <SmButton kind="k" big wide icon="add" onPress={() => setSheet("create")} testID="profil-create">
        Créer
      </SmButton>

      <SecHead title="Réglages" />
      <View style={styles.tiles}>
        <SettingTile
          icon="bell"
          title="Notifications"
          caption="Candidatures, jour J, messages"
          onPress={() => router.push("/reglages/notifications")}
          testID="reglage-notifications"
        />
        <SettingTile
          icon="explore"
          title={preferencesLabels.settingsRow}
          caption={department ? `${department} favori, distance, types` : "Ton coin, distance, types"}
          onPress={() => router.push("/preferences")}
          testID="reglage-tes-preferences-tuile"
        />
        <SettingTile
          icon="gear"
          title="Apparence"
          caption={preferencesCaption}
          onPress={() => router.push("/reglages/preferences")}
          testID="reglage-preferences"
        />
        <SettingTile
          icon="shield"
          title="Sécurité"
          caption="Mot de passe, appareils"
          onPress={() => router.push("/reglages/securite")}
          testID="reglage-securite"
        />
        <SettingTile
          icon="lock"
          title="Confidentialité"
          caption={profile ? visibilityCaption[profile.visibility] : "Profil public, nom privé"}
          onPress={() => router.push("/reglages/confidentialite")}
          testID="reglage-confidentialite"
        />
        <SettingTile
          icon="staff"
          title="Amis et crews"
          caption={crew ? `Amis, crew ${crew.name}` : "Tes amis et tes crews"}
          onPress={() => router.push("/amis")}
          testID="reglage-amis"
        />
        <SettingTile
          icon="profile"
          title="Mon profil public"
          caption="Ce que voient les autres"
          onPress={() => router.push("/reglages/profil")}
          testID="reglage-profil"
        />
      </View>
      {/* « Revoir le tuto » est dans l'Aide (lot 42). */}
      <View style={styles.footerRow}>
        <SmButton kind="g" icon="help" onPress={() => router.push("/reglages/aide")} testID="profil-help">
          Aide
        </SmButton>
        <SmButton
          kind="g"
          icon="logout"
          onPress={async () => {
            await signOut();
            router.replace("/auth");
          }}
          testID="profil-sign-out"
        >
          Se déconnecter
        </SmButton>
      </View>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space3 + 2 },
  headText: { flex: 1, gap: space1 + 2, alignItems: "flex-start" },
  pseudo: { fontSize: 26, lineHeight: 25 },
  headTags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space1 + 2 },
  headCaption: { flexShrink: 1 },
  nudgeStrong: { marginTop: space1 },
  stamps: { flexDirection: "row", paddingLeft: space3 + 2 },
  stampOver: { marginLeft: -14 },
  crewRow: { flexDirection: "row", alignItems: "center", gap: space3 },
  crewText: { flex: 1, minWidth: 0 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  footerRow: { flexDirection: "row", justifyContent: "space-between", gap: space2 },
});
