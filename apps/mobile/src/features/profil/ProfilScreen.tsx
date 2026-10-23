// Mon profil, le hub (lot 40, prototype `s-me` ; lot C2b ; lot M5 : maquette 7.2 « Mon profil désencombré »). Pas de
// grand titre : l'en-tête compact en tient lieu (avatar, pseudo, grade, département, « Mon QR de compte » en icône ;
// « Ma fiche » pour le pro). Puis « Ma saison » (points et passeport en un seul bloc), le crew en une ligne, « Changer de
// casquette » (une phrase claire, chaque casquette avec son icône, son nom simple et ce qu'elle ouvre, l'active marquée ;
// le staff n'y est que si la personne a des missions), « Devenir organisateur ou pro », « Rejoindre une équipe staff »,
// puis les réglages en lignes groupées : Compte (e-mail, mot de passe, sanctions), Notifications, Confidentialité
// (profil public, export des données, suppression), Préférences, Mon profil public, Amis et crews, Aide, Se déconnecter.
// Plus d'accès flottant ici (retour 31).
import { Icon, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import { capLabels, gradeLabels, passportScreenTexts } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AccountQrSheet } from "@/features/AccountQrSheet";
import { PendingCard } from "@/features/arrivee/PendingCard";
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

import {
  CapRows,
  CreateSheet,
  CrewLine,
  HeadAvatar,
  HubRow,
  LinkRow,
  RowIcon,
  SeasonBlock,
  SetList,
  SetRow,
} from "./parts";

const { space1, space3 } = tokens.spacing;

const visibilityCaption = { public: "Profil public", private: "Profil privé" } as const;

export function ProfilScreen() {
  const { t, preference } = useTheme();
  const router = useRouter();
  const { me, refreshMe, signOut } = useSession();
  const { persona, active, entries } = usePersona();
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
  const theme = preference === "sable" ? "Sable" : preference === "auto" ? "Automatique" : "Béton";
  const preferencesCaption = [
    `Thème ${theme}`,
    department ? `${department} favori` : null,
    profile ? `${profile.radiusKm} km` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const qrLabel = persona.kind === "pro" ? "Ma fiche" : "Mon QR de compte";

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

      {/* En-tête compact `.mh` : avatar, pseudo, grade et département ; le QR de compte (Ma fiche pour le pro) en icône. */}
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
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={qrLabel}
          onPress={() => (persona.kind === "pro" ? router.navigate("/(pro)/fiche") : setSheet("qr"))}
          testID="profil-account-qr"
          hitSlop={6}
          style={({ pressed }) => [
            styles.qrb,
            { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard },
            pressed && styles.pressed,
          ]}
        >
          <Icon name={persona.kind === "pro" ? "briefcase" : "qr"} size={22} color={t.color.ink} />
        </Pressable>
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

      {/* Le crew en une ligne. */}
      {base ? (
        <CrewLine
          crew={crew ? { name: crew.name, membersCount: crew.membersCount } : null}
          onPress={() => router.push(crew ? `/crew/${crew.slug}` : "/crew/nouveau")}
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

      <SecHead title="Réglages" />
      <SetList>
        <SetRow
          first
          icon="profile"
          title="Compte"
          caption="E-mail, mot de passe, appareils, mes sanctions"
          onPress={() => router.push("/reglages/compte")}
          testID="reglage-compte"
        />
        <SetRow
          icon="bell"
          title="Notifications"
          caption="Candidatures, jour J, messages"
          onPress={() => router.push("/reglages/notifications")}
          testID="reglage-notifications"
        />
        <SetRow
          icon="lock"
          title="Confidentialité"
          caption={`${profile ? visibilityCaption[profile.visibility] : "Profil public"}, export de mes données, suppression`}
          onPress={() => router.push("/reglages/confidentialite")}
          testID="reglage-confidentialite"
        />
        <SetRow
          icon="gear"
          title="Préférences"
          caption={preferencesCaption}
          onPress={() => router.push("/reglages/preferences")}
          testID="reglage-preferences"
        />
        <SetRow
          icon="eye"
          title="Mon profil public"
          caption="Photo, pseudo, description : ce que voient les autres"
          onPress={() => router.push("/reglages/profil")}
          testID="reglage-profil"
        />
        <SetRow
          icon="staff"
          title="Amis et crews"
          caption={crew ? `Amis, crew ${crew.name}` : "Tes amis et tes crews"}
          onPress={() => router.push("/amis")}
          testID="reglage-amis"
        />
        <SetRow
          icon="help"
          title="Aide"
          caption="Tutos, questions fréquentes, nous écrire"
          onPress={() => router.push("/reglages/aide")}
          testID="profil-help"
        />
        <SetRow
          icon="logout"
          title="Se déconnecter"
          tone="out"
          onPress={async () => {
            await signOut();
            router.replace("/auth");
          }}
          testID="profil-sign-out"
        />
      </SetList>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space3 },
  headText: { flex: 1, minWidth: 0, gap: space1 + 1 },
  pseudo: { fontSize: 22, lineHeight: 23 },
  headTags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space1 + 2 },
  headCaption: { flexShrink: 1 },
  qrb: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.8 },
  capsay: { fontSize: 13.5, lineHeight: 19 },
  links: { gap: 0 },
});
