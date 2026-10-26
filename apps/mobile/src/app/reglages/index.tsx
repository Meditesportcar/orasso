// Lot R5b (remarque 6 de Damien, validation de la maquette R5) : l'écran « Réglages », en plein écran, ouvert par la
// roue dentée de la carte du profil. Il réunit, dans cet ordre, ce qui était en bas de l'onglet Profil : Modifier mon
// profil (photo, pseudo, description, réseaux), Compte, Notifications, Confidentialité, Tes préférences, Apparence,
// Aide, Se déconnecter. Chaque ligne ouvre l'écran qu'elle ouvrait déjà ; plus de doublon dans l'onglet.
import { useTheme } from "@orasso/design-system/native";
import { settingsHubLabels as L, preferencesLabels } from "@orasso/shared";
import { useRouter } from "expo-router";

import { SetList, SetRow } from "@/features/profil/parts";
import { useSession } from "@/lib/session";
import { FlowScreen } from "@/ui/Screens";

export default function ReglagesHub() {
  const router = useRouter();
  const { preference } = useTheme();
  const { me, refreshMe, signOut } = useSession();
  const profile = me?.profile;
  const department = profile?.departments[0];
  const theme = preference === "sable" ? "Sable" : preference === "auto" ? "Automatique" : "Béton";
  return (
    <FlowScreen
      title={L.title}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/profil"))}
      closeLabel="Retour au profil"
      onRefresh={refreshMe}
    >
      <SetList>
        <SetRow
          first
          icon="edit"
          title={L.editProfile}
          caption={L.editProfileCaption}
          onPress={() => router.push("/reglages/profil")}
          testID="reglage-profil"
        />
        <SetRow
          icon="profile"
          title={L.account}
          caption={L.accountCaption}
          onPress={() => router.push("/reglages/compte")}
          testID="reglage-compte"
        />
        <SetRow
          icon="bell"
          title={L.notifications}
          caption={L.notificationsCaption}
          onPress={() => router.push("/reglages/notifications")}
          testID="reglage-notifications"
        />
        <SetRow
          icon="lock"
          title={L.privacy}
          caption={L.privacyCaption(profile?.visibility === "private")}
          onPress={() => router.push("/reglages/confidentialite")}
          testID="reglage-confidentialite"
        />
        <SetRow
          icon="explore"
          title={preferencesLabels.settingsRow}
          caption={
            department
              ? `${department} favori, distance, types, centres d'intérêt`
              : preferencesLabels.settingsRowCaption
          }
          onPress={() => router.push("/preferences")}
          testID="reglage-tes-preferences-tuile"
        />
        <SetRow
          icon="gear"
          title={L.appearance}
          caption={`Thème ${theme}`}
          onPress={() => router.push("/reglages/preferences")}
          testID="reglage-preferences"
        />
        <SetRow
          icon="help"
          title={L.help}
          caption={L.helpCaption}
          onPress={() => router.push("/reglages/aide")}
          testID="profil-help"
        />
        <SetRow
          icon="logout"
          title={L.signOut}
          tone="out"
          onPress={async () => {
            await signOut();
            router.replace("/auth");
          }}
          testID="profil-sign-out"
        />
      </SetList>
    </FlowScreen>
  );
}
