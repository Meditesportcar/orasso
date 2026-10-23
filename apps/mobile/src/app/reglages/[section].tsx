// Réglages, ouverts par les tuiles de Mon profil (lot 40, prototype `s-me` : « réglages en tuiles ») : chaque tuile a
// son écran de flux, fait des sections de l'ancien écran Moi (`features/moi/`, inchangées). Notifications ;
// Apparence (clé de route `preferences`, thème Béton / Sable / Automatique, « Réduire les animations » ; l'entrée « Tes
// préférences » en tête mène à l'écran de ce qu'on veut voir : coin, distance, types, centres d'intérêt) ;
// Sécurité ; Confidentialité (compte public ou privé, mes données, supprimer le compte) ; Mon profil public (photo,
// pseudo, description, aperçu) ; Aide (sanctions, version).
import { Button, Chip, ChipRow, Text, type ThemePreference, useTheme } from "@orasso/design-system/native";
import { moderationLabels, preferencesLabels, tutoLabels, tutoProfileNames } from "@orasso/shared";
import Constants from "expo-constants";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ChangePasswordSheet } from "@/features/moi/ChangePasswordSheet";
import { DataSection } from "@/features/moi/DataSection";
import { DeleteAccountSheet } from "@/features/moi/DeleteAccountSheet";
import { EmailBanner } from "@/features/moi/EmailBanner";
import { NotificationsSection } from "@/features/moi/NotificationsSection";
import { PasskeysSheet } from "@/features/moi/PasskeysSheet";
import { PointsSection } from "@/features/moi/PointsSection";
import { ProfileSection } from "@/features/moi/ProfileSection";
import { QrSecretSheet } from "@/features/moi/QrSecretSheet";
import { SecuritySection, type SecuritySheet } from "@/features/moi/SecuritySection";
import { SessionsSheet } from "@/features/moi/SessionsSheet";
import { TwoFactorSheet } from "@/features/moi/TwoFactorSheet";
import { useSettings } from "@/features/moi/useSettings";
import { VisibilitySection } from "@/features/moi/VisibilitySection";
import { replayProfiles } from "@/features/tuto/model";
import { useMotionPref } from "@/lib/motionPref";
import { useSession } from "@/lib/session";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";

const SECTIONS = {
  notifications: "Notifications",
  preferences: "Apparence",
  securite: "Sécurité",
  confidentialite: "Confidentialité",
  profil: "Mon profil public",
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

  return (
    <FlowScreen
      title={SECTIONS[section]}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/moi"))}
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

      {section === "securite" ? (
        <>
          <EmailBanner />
          <SecuritySection onOpen={setSheet} />
        </>
      ) : null}

      {section === "confidentialite" ? (
        <>
          <VisibilitySection settings={settings.settings} save={settings.save} />
          <DataSection />
          <SectionTitle>Compte</SectionTitle>
          <Button variant="plate" icon="close" onPress={() => setSheet("delete")} fullWidth>
            Supprimer mon compte
          </Button>
        </>
      ) : null}

      {section === "profil" ? (
        <>
          <ProfileSection />
          {me ? (
            <Button
              variant="plate"
              icon="eye"
              next
              fullWidth
              onPress={() => router.push(`/u/${encodeURIComponent(me.profile.pseudo)}`)}
            >
              Voir ma page publique
            </Button>
          ) : null}
        </>
      ) : null}

      {section === "aide" ? (
        <>
          {/* Lot 32 : sanctions de la modération et contestation. */}
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
          {/* Lot 42 : « Revoir le tuto », un bouton par profil de la personne (profil choisi à l'arrivée, puis ses casquettes). */}
          <SectionTitle>{tutoLabels.replay}</SectionTitle>
          <Muted variant="body">{tutoLabels.replayHint}</Muted>
          {replayProfiles(
            (me?.personas ?? []).map((p) => p.kind),
            me?.profile.mainProfile ?? null,
          ).map((p) => (
            <Button
              key={p}
              variant="plate"
              icon="live"
              fullWidth
              onPress={() => router.push(`/tuto/${p}` as never)}
              testID={`replay-tuto-${p}`}
            >
              {tutoProfileNames[p]}
            </Button>
          ))}
          <SectionTitle>Nous écrire</SectionTitle>
          <Muted variant="body">Une question, un souci : contact@orasso.fr</Muted>
          <Text variant="caption" color={t.color.inkFaint}>
            Orasso {Constants.expoConfig?.version ?? ""}
          </Text>
        </>
      ) : null}
    </FlowScreen>
  );
}
