// Lien de vérification de l'e-mail ouvert dans l'appli (lot 36, Android App Links : `intentFilters` de `app.json` et
// `/.well-known/assetlinks.json` du site). Même règle que la page du site : l'API confirme l'adresse sans ouvrir de
// session (elle contournerait la double authentification) ; on continue vers l'appli, connecté ou non.
import { Button } from "@orasso/design-system/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";

import { request } from "@/lib/http";
import { useSession } from "@/lib/session";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

export default function VerificationEmail() {
  const router = useRouter();
  const { status, refreshMe } = useSession();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [state, setState] = useState<"checking" | "ok" | "expired">("checking");

  // Un jeton ne sert qu'une fois : l'appel part une seule fois, même si la session change entre-temps.
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    if (!token) {
      setState("expired");
      return;
    }
    request(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => {
        setState("ok");
        void refreshMe().catch(() => null);
      })
      .catch(() => setState("expired"));
  }, [token, refreshMe]);

  const next = () => router.replace(status === "in" ? "/" : { pathname: "/auth", params: { mode: "signin" } });
  return (
    <FlowScreen title="Adresse e-mail" onClose={next}>
      {state === "checking" ? (
        <Muted variant="body">Vérification…</Muted>
      ) : state === "ok" ? (
        <Notice testID="email-verified">Merci : ton adresse e-mail est confirmée.</Notice>
      ) : (
        <Notice tone="error">
          Ce lien n'est plus valable. Connecte-toi : tu pourras demander un nouvel e-mail depuis Moi.
        </Notice>
      )}
      {state !== "checking" ? (
        <Button icon={status === "in" ? "home" : "entry"} onPress={next} fullWidth>
          {status === "in" ? "Continuer" : "Se connecter"}
        </Button>
      ) : null}
    </FlowScreen>
  );
}
