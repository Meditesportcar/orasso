// Moi, sécurité : mot de passe, double authentification (TOTP), appareils et sessions, QR de compte, clés d'accès
// (renvoi vers le site : pas de module WebAuthn natif en V1, S2). Chaque action ouvre une feuille de Moi.
import { Button, Chip, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { Linking, StyleSheet, View } from "react-native";

import { siteUrl } from "@/api";
import { useSession } from "@/lib/session";
import { SectionTitle } from "@/ui/Screens";

const { space2, space3 } = tokens.spacing;

export type SecuritySheet = "password" | "two-factor" | "sessions" | "qr-secret";

export function SecuritySection({ onOpen }: { onOpen: (sheet: SecuritySheet) => void }) {
  const { t } = useTheme();
  const { me } = useSession();
  const twoFactor = Boolean(me?.user.twoFactorEnabled);
  return (
    <>
      <SectionTitle>Sécurité</SectionTitle>
      <Plate style={styles.block} testID="moi-security">
        <Text variant="bodyStrong" color={t.color.plateInk}>
          Mot de passe
        </Text>
        <Button variant="plate" icon="plate" onPress={() => onOpen("password")} fullWidth>
          Changer le mot de passe
        </Button>
      </Plate>

      <Plate style={styles.block}>
        <View style={styles.head}>
          <Text variant="bodyStrong" color={t.color.plateInk} style={styles.title}>
            Double authentification
          </Text>
          <Chip surface="plate" selected={twoFactor}>
            {twoFactor ? "Activée" : "Désactivée"}
          </Chip>
        </View>
        <Text variant="caption" color={t.color.plateMuted}>
          Un code à 6 chiffres en plus du mot de passe. Obligatoire pour organiser des événements.
        </Text>
        <Button variant="plate" icon="qr" onPress={() => onOpen("two-factor")} fullWidth>
          {twoFactor ? "Gérer la double authentification" : "Activer la double authentification"}
        </Button>
      </Plate>

      <Plate style={styles.block}>
        <Text variant="bodyStrong" color={t.color.plateInk}>
          Appareils et sessions
        </Text>
        <Text variant="caption" color={t.color.plateMuted}>
          Les appareils connectés à ton compte, à déconnecter un par un.
        </Text>
        <Button variant="plate" icon="phone" onPress={() => onOpen("sessions")} fullWidth>
          Voir mes appareils
        </Button>
      </Plate>

      <Plate style={styles.block}>
        <Text variant="bodyStrong" color={t.color.plateInk}>
          QR de compte
        </Text>
        <Text variant="caption" color={t.color.plateMuted}>
          Si quelqu'un a pu copier ton QR, régénère son secret : les anciens codes ne passent plus.
        </Text>
        <Button variant="plate" icon="undo" onPress={() => onOpen("qr-secret")} fullWidth>
          Régénérer le secret du QR
        </Button>
      </Plate>

      <Plate style={styles.block}>
        <Text variant="bodyStrong" color={t.color.plateInk}>
          Clés d'accès
        </Text>
        <Text variant="caption" color={t.color.plateMuted}>
          Se connecter avec Face ID ou l'empreinte, sans mot de passe. Les clés d'accès se créent sur le site Orasso
          (dans le navigateur de ce téléphone aussi), dans Sécurité.
        </Text>
        <Button
          variant="plate"
          icon="export"
          onPress={() => void Linking.openURL(siteUrl("/app/securite")).catch(() => undefined)}
          fullWidth
        >
          Gérer mes clés d'accès sur le site
        </Button>
      </Plate>
    </>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  head: { flexDirection: "row", alignItems: "center", gap: space2 },
  title: { flex: 1 },
});
