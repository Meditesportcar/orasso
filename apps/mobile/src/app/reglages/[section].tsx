// Réglages, ouverts par les tuiles de Mon profil (lot 40, prototype `s-me` : « réglages en tuiles ») : chaque tuile a
// son écran de flux, fait des sections de l'ancien écran Moi (`features/moi/`, inchangées). Notifications ;
// Apparence (clé de route `preferences` : thème Béton / Sable / Automatique, « Réduire les animations » ; l'entrée « Tes
// préférences » en tête mène à l'écran de ce qu'on veut voir : coin, distance, types, centres d'intérêt, lot M6) ;
// Compte (lot M5 : e-mail, mot de passe et appareils, mes sanctions ; `securite` y mène aussi) ; Confidentialité
// (compte public ou privé, export de mes données, supprimer le compte) ; Mon profil public (photo, pseudo, description,
// aperçu) ; Aide (lot M5, maquette 7.3 : tutos par casquette, questions fréquentes, nous écrire, version).
import {
  Button,
  Chip,
  ChipRow,
  Plate,
  Text,
  type ThemePreference,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import { helpLabels, moderationLabels, preferencesLabels } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet } from "react-native";
import { LeftCrewsSection } from "@/features/crews/feed/LeftCrewsSection"; // R5c1, tour 2
import { ChangePasswordSheet } from "@/features/moi/ChangePasswordSheet";
import { DataSection } from "@/features/moi/DataSection";
import { DeleteAccountSheet } from "@/features/moi/DeleteAccountSheet";
import { EmailBanner } from "@/features/moi/EmailBanner";
import { HelpSection } from "@/features/moi/HelpSection";
import { NotificationsSection } from "@/features/moi/NotificationsSection";
import { PasskeysSheet } from "@/features/moi/PasskeysSheet";
import { PointsSection } from "@/features/moi/PointsSection";
import { EditProfileScreen } from "@/features/moi/ProfileSection";
import { QrSecretSheet } from "@/features/moi/QrSecretSheet";
import { SecuritySection, type SecuritySheet } from "@/features/moi/SecuritySection";
import { SessionsSheet } from "@/features/moi/SessionsSheet";
import { TwoFactorSheet } from "@/features/moi/TwoFactorSheet";
import { useSettings } from "@/features/moi/useSettings";
import { VisibilitySection } from "@/features/moi/VisibilitySection";
import { useMotionPref } from "@/lib/motionPref";
import { useSession } from "@/lib/session";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";

const SECTIONS = {
  notifications: "Notifications",
  preferences: "Apparence",
  compte: "Compte",
  // Ancien chemin (lot 40) : même écran que Compte.
  securite: "Compte",
  confidentialite: "Confidentialité",
  // Lot R5b : « Modifier mon profil » (son propre écran, `EditProfileScreen`).
  profil: "Modifier mon profil",
  aide: "Aide",
  points: "Mes points",
} as const;
type Section = keyof typeof SECTIONS;

const themeChoices: { value: ThemePreference; label: string }[] = [
  { value: "beton", label: "Béton" },
  { value: "sable", label: "Sable" },
  { value: "auto", label: "Automatique" },
];

type Sheet = SecuritySheet | "delete" | null;

export default function Reglages() {
  const { section: raw } = useLocalSearchParams<{ section: string }>();
  const section: Section = raw && raw in SECTIONS ? (raw as Section) : "preferences";
  const { t, preference, setPreference } = useTheme();
  const { reduceMotion, setReduceMotion } = useMotionPref();
  const router = useRouter();
  const { refreshMe, me } = useSession();
  const settings = useSettings();
  const [sheet, setSheet] = useState<Sheet>(null);
  const close = () => setSheet(null);

  // Lot R5b (maquette R5.5) : « Modifier mon profil » a son écran, avec « Enregistrer » fixé en bas.
  if (section === "profil") return <EditProfileScreen />;

  return (
    <FlowScreen
      title={SECTIONS[section]}
      facts={section === "aide" ? helpLabels.subtitle : undefined}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/reglages"))}
      onRefresh={async () => {
        await Promise.all([refreshMe(), settings.reload()]);
      }}
      overlays={
        <>
          <ChangePasswordSheet visible={sheet === "password"} onClose={close} />
          <TwoFactorSheet visible={sheet === "two-factor"} onClose={close} />
          <SessionsSheet visible={sheet === "sessions"} onClose={close} />
          <QrSecretSheet visible={sheet === "qr-secret"} onClose={close} />
          <PasskeysSheet visible={sheet === "passkeys"} onClose={close} />
          <DeleteAccountSheet visible={sheet === "delete"} onClose={close} />
        </>
      }
    >
      {settings.error ? <Notice tone="error">{settings.error}</Notice> : null}

      {section === "notifications" ? <NotificationsSection settings={settings.settings} save={settings.save} /> : null}

      {/* Lot 40 : historique des points de la saison (ex-écran Moi), ouvert depuis la carte de saison. */}
      {section === "points" ? <PointsSection /> : null}

      {section === "preferences" ? (
        <>
          {/* Lot M6 : « Tes préférences » (ton coin, distance, types d'événements, centres d'intérêt, interrupteur), la page de l'arrivée. */}
          <Button
            variant="secondary"
            icon="explore"
            fullWidth
            onPress={() => router.push("/preferences")}
            testID="reglage-tes-preferences"
          >
            {preferencesLabels.settingsRow}
          </Button>
          <SectionTitle>Thème</SectionTitle>
          <ChipRow accessibilityRole="radiogroup" accessibilityLabel="Thème">
            {themeChoices.map((choice) => (
              <Chip
                accessibilityRole="radio"
                key={choice.value}
                selected={preference === choice.value}
                onPress={() => setPreference(choice.value)}
              >
                {choice.label}
              </Chip>
            ))}
          </ChipRow>
          <Muted variant="caption">
            Sable est fait pour le plein soleil. Automatique : Sable le jour, Béton après le coucher du soleil.
          </Muted>
          <SectionTitle>Animations</SectionTitle>
          <ChipRow accessibilityRole="radiogroup" accessibilityLabel="Animations">
            <Chip accessibilityRole="radio" selected={!reduceMotion} onPress={() => setReduceMotion(false)}>
              Normales
            </Chip>
            <Chip accessibilityRole="radio" selected={reduceMotion} onPress={() => setReduceMotion(true)}>
              Réduire les animations
            </Chip>
          </ChipRow>
          <Muted variant="caption">
            Réduites : tout apparaît en fondu, sans glissement. Le réglage du téléphone s'applique aussi.
          </Muted>
        </>
      ) : null}

      {section === "compte" || section === "securite" ? (
        <>
          <EmailBanner />
          {me ? (
            <Plate style={styles.email} testID="compte-email">
              <Text variant="label" color={t.color.plateMuted}>
                E-mail
              </Text>
              <Text variant="bodyStrong" color={t.color.plateInk}>
                {me.user.email}
              </Text>
            </Plate>
          ) : null}
          <SecuritySection onOpen={setSheet} />
          {/* Lot 32 : sanctions de la modération et contestation (lot M5 : ici, plus dans l'Aide). */}
          <SectionTitle>{moderationLabels.mySanctions}</SectionTitle>
          {me?.suspension ? <Notice>{moderationLabels.suspendedTitle}</Notice> : null}
          <Button
            variant="secondary"
            icon="list"
            fullWidth
            onPress={() => router.push("/suspendu")}
            testID="my-sanctions"
          >
            {me?.suspension?.canContest ? moderationLabels.contest : moderationLabels.mySanctions}
          </Button>
        </>
      ) : null}

      {section === "confidentialite" ? (
        <>
          <VisibilitySection settings={settings.settings} save={settings.save} />
          <DataSection />
          {/* R5c1, tour 2 : retirer mes publications des crews que j'ai quittés. */}
          <LeftCrewsSection />
          <SectionTitle>Compte</SectionTitle>
          <Button variant="plate" icon="close" onPress={() => setSheet("delete")} fullWidth>
            Supprimer mon compte
          </Button>
        </>
      ) : null}

      {section === "aide" ? <HelpSection /> : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  email: { gap: tokens.spacing.space1, padding: tokens.spacing.space3 },
});
