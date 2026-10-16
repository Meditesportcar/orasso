// Compte protégé par une clé d'accès seulement, connecté dans l'appli par mot de passe (`twoFactorHint:
// "passkey_sign_in"`) : l'appli n'a pas de clé d'accès (S2), l'action se fait sur le site, connecté avec la clé.
import { Button, Text, useTheme } from "@orasso/design-system/native";
import { passkeyOnlyButton, passkeyOnlyMessage } from "@orasso/shared";
import { Linking } from "react-native";

import { siteUrl } from "@/api";

export function PasskeyOnlyNotice({ onClose }: { onClose: () => void }) {
  const { t } = useTheme();
  return (
    <>
      <Text variant="body" color={t.color.ink} testID="passkey-only">
        {passkeyOnlyMessage}
      </Text>
      <Button
        variant="secondary"
        icon="export"
        onPress={() => void Linking.openURL(siteUrl("/app/securite")).catch(() => undefined)}
        fullWidth
      >
        {passkeyOnlyButton}
      </Button>
      <Button variant="plate" icon="back" onPress={onClose} fullWidth>
        Fermer
      </Button>
    </>
  );
}
