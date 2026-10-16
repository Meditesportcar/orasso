// Moi, derrière l'avatar (docs/02, ARCHITECTURE-SUITE § 1.6) : profil (photo, pseudo, description, aperçu « ce que voient
// les autres »), points et grade, mes casquettes et « devenir staff », paramètres (notifications par type, compte
// public ou privé, secteur, centres d'intérêt, rayon), sécurité (mot de passe, double authentification, appareils, QR de
// compte, clés d'accès), thème, déconnexion et suppression du compte. Les sections sont dans `features/moi/`.

import { Button, Chip, ChipRow, Text, type ThemePreference, useTheme } from "@orasso/design-system/native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useState } from "react";

import { CasquettesSection } from "@/features/moi/CasquettesSection";
import { ChangePasswordSheet } from "@/features/moi/ChangePasswordSheet";
import { DeleteAccountSheet } from "@/features/moi/DeleteAccountSheet";
import { EmailBanner } from "@/features/moi/EmailBanner";
import { NotificationsSection } from "@/features/moi/NotificationsSection";
import { PointsSection } from "@/features/moi/PointsSection";
import { ProfileSection } from "@/features/moi/ProfileSection";
import { QrSecretSheet } from "@/features/moi/QrSecretSheet";
import { SectorSection } from "@/features/moi/SectorSection";
import { SecuritySection, type SecuritySheet } from "@/features/moi/SecuritySection";
import { SessionsSheet } from "@/features/moi/SessionsSheet";
import { StaffRequestSheet } from "@/features/moi/StaffRequestSheet";
import { TwoFactorSheet } from "@/features/moi/TwoFactorSheet";
import { useSettings } from "@/features/moi/useSettings";
import { VisibilitySection } from "@/features/moi/VisibilitySection";
import { useSession } from "@/lib/session";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";

const themeChoices: { value: ThemePreference; label: string }[] = [
  { value: "beton", label: "Béton" },
  { value: "sable", label: "Sable" },
  { value: "auto", label: "Selon l'appareil" },
];

type Sheet = SecuritySheet | "staff" | "delete" | null;

export default function Moi() {
  const { t, preference, setPreference } = useTheme();
  const router = useRouter();
  const { signOut, refreshMe } = useSession();
  const settings = useSettings();
  const [sheet, setSheet] = useState<Sheet>(null);
  const close = () => setSheet(null);

  return (
    <FlowScreen
      title="Moi"
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onRefresh={async () => {
        await Promise.all([refreshMe(), settings.reload()]);
      }}
      overlays={
        <>
          <ChangePasswordSheet visible={sheet === "password"} onClose={close} />
          <TwoFactorSheet visible={sheet === "two-factor"} onClose={close} />
          <SessionsSheet visible={sheet === "sessions"} onClose={close} />
          <QrSecretSheet visible={sheet === "qr-secret"} onClose={close} />
          <StaffRequestSheet visible={sheet === "staff"} onClose={close} />
          <DeleteAccountSheet visible={sheet === "delete"} onClose={close} />
        </>
      }
    >
      <EmailBanner />
      {settings.error ? <Notice tone="error">{settings.error}</Notice> : null}
      <ProfileSection />
      <PointsSection />
      <CasquettesSection onStaff={() => setSheet("staff")} />
      <NotificationsSection settings={settings.settings} save={settings.save} />
      <VisibilitySection settings={settings.settings} save={settings.save} />
      <SectorSection settings={settings.settings} save={settings.save} />
      <SecuritySection onOpen={setSheet} />

      <SectionTitle>Thème</SectionTitle>
      <ChipRow>
        {themeChoices.map((choice) => (
          <Chip key={choice.value} selected={preference === choice.value} onPress={() => setPreference(choice.value)}>
            {choice.label}
          </Chip>
        ))}
      </ChipRow>
      <Muted variant="caption">
        Sable est fait pour le plein soleil. « Selon l'appareil » suit le mode clair ou sombre du téléphone.
      </Muted>

      <SectionTitle>Compte</SectionTitle>
      <Button
        variant="plate"
        icon="back"
        onPress={async () => {
          await signOut();
          router.replace("/auth");
        }}
        fullWidth
      >
        Me déconnecter
      </Button>
      <Button variant="plate" icon="close" onPress={() => setSheet("delete")} fullWidth>
        Supprimer mon compte
      </Button>
      <Text variant="caption" color={t.color.inkFaint}>
        Orasso {Constants.expoConfig?.version ?? ""}
      </Text>
    </FlowScreen>
  );
}
