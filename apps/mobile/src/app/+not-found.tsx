// Route inconnue (lien ancien, faute de frappe) : jamais l'écran « Unmatched route » d'Expo Router ; un mot et le
// retour à l'écran d'ouverture de la casquette active (lot 40).
import { Button, Text, useTheme } from "@orasso/design-system/native";
import { useRouter } from "expo-router";

import { usePersona } from "@/lib/persona";
import { landingOf } from "@/lib/personaModel";
import { useSession } from "@/lib/session";
import { FlowScreen } from "@/ui/Screens";

export default function NotFound() {
  const { t } = useTheme();
  const router = useRouter();
  const { status } = useSession();
  const { persona } = usePersona();
  const home = () => router.replace((status === "in" ? landingOf(persona) : "/auth") as never);
  return (
    <FlowScreen title="Page introuvable" onClose={home}>
      <Text variant="body" color={t.color.ink}>
        Cette page n'existe pas ou plus dans l'appli.
      </Text>
      <Button variant="primary" icon="home" onPress={home} fullWidth testID="not-found-home">
        Revenir à l'accueil
      </Button>
    </FlowScreen>
  );
}
