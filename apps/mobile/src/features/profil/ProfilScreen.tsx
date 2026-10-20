// Mon profil, le hub (lot 40, prototype `s-me` ; « la bulle en haut à droite disparaît, ce qu'elle contenait vit ici ») :
// en-tête (avatar, pseudo, grade, département, Mon QR de compte), carte de saison, Mon passeport, Mon crew, Mes
// casquettes avec leurs accès rapides et un seul bouton Créer, puis les réglages en tuiles (chacune ouvre
// `reglages/<section>`), Aide et Se déconnecter. Partagé par l'onglet Profil des cinq casquettes qui en ont un.
// Zones marquées pour les lots suivants : tuto (42), passeport (50), profil média (55).
import { Button, Chip, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { gradeLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { AccountQrSheet } from "@/features/AccountQrSheet";
import { PendingCard } from "@/features/arrivee/PendingCard";
import { EmailBanner } from "@/features/moi/EmailBanner";
import { StaffRequestSheet } from "@/features/moi/StaffRequestSheet";
import { api } from "@/lib/api";
import { usePersona } from "@/lib/persona";
import { isBaseKind, tabHref } from "@/lib/personaModel";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Avatar } from "@/ui/Avatar";
import { SectionTitle, TabScreen } from "@/ui/Screens";

import { CreateSheet, HubRow, PersonaRows, RowIcon, SeasonCard, SettingTile } from "./parts";

const { space2, space3 } = tokens.spacing;

const visibilityCaption = { public: "Profil public, nom privé", private: "Profil privé, nom privé" } as const;

export function ProfilScreen() {
  const { t, preference } = useTheme();
  const router = useRouter();
  const { me, refreshMe, signOut } = useSession();
  const { persona, active, choose, base: basePersona } = usePersona();
  const [sheet, setSheet] = useState<"qr" | "create" | "staff" | null>(null);
  const close = () => setSheet(null);
  const base = isBaseKind(persona.kind);

  const points = useApi(() => api.points(), [], { cacheKey: "points" });
  const crews = useApi(() => api.myCrews(), [], { cacheKey: "my-crews", enabled: base });
  // Lot 40 : les véhicules archivés (vendus, souvenirs, accidentés) restent joignables sans onglet Garage.
  const vehicles = useApi(() => api.vehicles(), [], { cacheKey: "vehicles", enabled: base });
  const archived = vehicles.data?.filter((v) => v.status !== "active").length ?? 0;
  const staff = useApi(() => api.staffEvents(), [], { cacheKey: "staff-events" });

  const profile = me?.profile;
  const department = profile?.departments[0];
  const crew = crews.data?.[0];
  const theme = preference === "sable" ? "Sable" : preference === "auto" ? "Automatique" : "Béton";
  const preferencesCaption = [
    `Thème ${theme}`,
    department ? `${department} favori` : null,
    profile ? `rayon ${profile.radiusKm} km` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <TabScreen
      title="Mon profil"
      onRefresh={async () => {
        await Promise.all([refreshMe(), points.reload(), crews.reload(), staff.reload(), vehicles.reload()]);
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

      {/* En-tête : avatar, pseudo, grade, département ; QR de compte (ou Ma fiche pour le pro). */}
      <View style={styles.head} testID="profil-head">
        <Avatar
          url={base ? profile?.avatarUrl : active.logoUrl}
          pseudo={base ? profile?.pseudo : active.label}
          size={72}
        />
        <View style={styles.headText}>
          <Text variant="posterM" color={t.color.ink}>
            {profile?.pseudo ?? ""}
          </Text>
          <View style={styles.headTags}>
            {profile ? <Chip selected>{gradeLabels[profile.grade]}</Chip> : null}
            {!base ? <Chip>{active.label}</Chip> : null}
            {department ? (
              <Text variant="meta" color={t.color.inkMuted}>
                {`Département ${department}`}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
      {persona.kind === "pro" ? (
        <Button variant="secondary" icon="plate" onPress={() => router.navigate("/(pro)/fiche")} fullWidth>
          Ma fiche
        </Button>
      ) : (
        <Button variant="secondary" icon="qr" onPress={() => setSheet("qr")} fullWidth testID="profil-account-qr">
          Mon QR de compte
        </Button>
      )}

      {base && profile ? (
        <>
          <SeasonCard points={profile.pointsSeason} grade={gradeLabels[profile.grade]} data={points.data ?? null} />
          {/* L'historique des points (ex-écran Moi) : dernières lignes, malus et pointages en attente. */}
          <HubRow
            lead={<RowIcon name="grade" />}
            title="Historique des points"
            caption={
              points.data?.entries[0]
                ? `Dernière ligne : ${points.data.entries[0].event?.title ?? "points"} · ${
                    points.data.entries[0].points > 0 ? "+" : ""
                  }${points.data.entries[0].points}`.replace("-", "−")
                : "Pointages, bonus et malus de la saison"
            }
            onPress={() => router.push("/reglages/points")}
            testID="profil-points"
          />
        </>
      ) : null}

      {/* lot 50 : la tuile ouvre le passeport et compte les tampons. */}
      {base ? (
        <HubRow
          lead={<RowIcon name="stamp" />}
          title="Mon passeport"
          caption="Bientôt : tes tampons d'événements"
          testID="profil-passport"
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

      {base ? (
        <HubRow
          lead={<RowIcon name="staff" />}
          title={crew ? `Mon crew · ${crew.name}` : "Mon crew"}
          caption={crew ? `${crew.membersCount} membre${crew.membersCount > 1 ? "s" : ""}` : "Crée ou rejoins un crew"}
          onPress={() => router.push(crew ? `/crew/${crew.slug}` : "/crew/nouveau")}
          testID="profil-crew"
        />
      ) : null}

      <SectionTitle>Mes casquettes</SectionTitle>
      <Text variant="caption" color={t.color.inkMuted}>
        Une barre d'onglets par casquette. Appui long sur le logo Orasso : retour à ton profil de base.
      </Text>
      <PersonaRows staffEvents={staff.data ?? []} onStaffRequest={() => setSheet("staff")} />
      <Button variant="secondary" icon="add" fullWidth onPress={() => setSheet("create")} testID="profil-create">
        Créer
      </Button>

      <SectionTitle>Réglages</SectionTitle>
      <View style={styles.tiles}>
        <SettingTile
          icon="bell"
          title="Notifications"
          caption="Candidatures, jour J, messages"
          onPress={() => router.push("/reglages/notifications")}
          testID="reglage-notifications"
        />
        <SettingTile
          icon="list"
          title="Préférences"
          caption={preferencesCaption}
          onPress={() => router.push("/reglages/preferences")}
          testID="reglage-preferences"
        />
        <SettingTile
          icon="eyeOff"
          title="Sécurité"
          caption="Mot de passe, appareils"
          onPress={() => router.push("/reglages/securite")}
          testID="reglage-securite"
        />
        <SettingTile
          icon="eye"
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
        <Button variant="plate" icon="chat" onPress={() => router.push("/reglages/aide")} testID="profil-help">
          Aide
        </Button>
        <Button
          variant="plate"
          icon="back"
          onPress={async () => {
            await signOut();
            router.replace("/auth");
          }}
          testID="profil-sign-out"
        >
          Se déconnecter
        </Button>
      </View>
      {!base ? (
        <Plate kind="note">
          <Text variant="caption" color={t.color.plateMuted}>
            {`Tu es dans ta casquette ${active.label}. Ton passeport, ta saison et ton crew sont dans ton profil de base.`}
          </Text>
          <Button
            variant="plate"
            icon="profile"
            onPress={() => choose(basePersona, tabHref(basePersona.kind, "profil") ?? undefined)}
          >
            Mon profil de base
          </Button>
        </Plate>
      ) : null}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space3 },
  headText: { flex: 1, gap: space2, alignItems: "flex-start" },
  headTags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space2 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  footerRow: { flexDirection: "row", justifyContent: "space-between", gap: space2 },
});
