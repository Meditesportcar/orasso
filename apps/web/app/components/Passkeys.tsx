// Clés d'accès (lot 15, S2) : WebAuthn dans le navigateur (Face ID, empreinte, Windows Hello, clé de sécurité).
// Création et connexion passent directement par `/api/auth/passkey/*` (même origine) ; renommer et supprimer
// passent par l'action de la page (formulaires).
import { Button, TextField } from "@orasso/design-system/web";
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useEffect, useState } from "react";
import { useRevalidator } from "react-router";

import { apiFetch } from "../lib/api.client";

function useWebAuthn() {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => setSupported(browserSupportsWebAuthn()), []);
  return supported;
}

const cancelled = (e: unknown) => e instanceof Error && (e.name === "NotAllowedError" || e.name === "AbortError");

/** Ajouter une clé : options du serveur → navigateur → vérification par le serveur. */
export function AddPasskey({ busy }: { busy: boolean }) {
  const supported = useWebAuthn();
  const revalidator = useRevalidator();
  const [name, setName] = useState("");
  const [state, setState] = useState<{ pending: boolean; error: string | null; done: boolean }>({
    pending: false,
    error: null,
    done: false,
  });

  async function create() {
    setState({ pending: true, error: null, done: false });
    const label = name.trim() || "Clé d'accès";
    const options = await apiFetch<Parameters<typeof startRegistration>[0]["optionsJSON"]>(
      `/auth/passkey/generate-register-options?name=${encodeURIComponent(label)}`,
    );
    if (!options.ok) {
      return setState({
        pending: false,
        done: false,
        error:
          options.status === 403 || options.status === 401
            ? "Reconnecte-toi d'abord (connexion récente exigée), puis recommence."
            : "Impossible de préparer la clé. Réessaie.",
      });
    }
    try {
      const response = await startRegistration({ optionsJSON: options.data });
      const verified = await apiFetch("/auth/passkey/verify-registration", {
        method: "POST",
        json: { response, name: label },
      });
      if (!verified.ok) return setState({ pending: false, done: false, error: "La clé n'a pas été acceptée." });
      setName("");
      setState({ pending: false, error: null, done: true });
      revalidator.revalidate();
    } catch (e) {
      setState({
        pending: false,
        done: false,
        error: cancelled(e) ? "Création annulée." : "Ce navigateur n'a pas pu créer la clé.",
      });
    }
  }

  if (supported === false) {
    return <p className="s-notice">Ce navigateur ne gère pas les clés d'accès. Essaie depuis ton téléphone.</p>;
  }
  return (
    <div className="s-form" data-testid="passkey-add">
      <TextField
        label="Nom de la clé"
        name="passkeyName"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        help="Par exemple « iPhone de Damien » ou « Ordinateur du club »"
        maxLength={60}
      />
      {state.error && (
        <p className="s-error" role="alert">
          {state.error}
        </p>
      )}
      {state.done && (
        <p className="s-notice s-notice--ok" role="status">
          Clé d'accès ajoutée.
        </p>
      )}
      <Button
        type="button"
        variant="secondary"
        icon="add"
        loading={state.pending || busy}
        disabled={supported === null}
        onClick={create}
      >
        Ajouter une clé d'accès
      </Button>
    </div>
  );
}

/** Connexion par clé d'accès (page de connexion) : la session est posée par l'API, puis on va au retour. */
export function PasskeySignIn({ retour }: { retour: string }) {
  const supported = useWebAuthn();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!supported) return null;

  async function signIn() {
    setPending(true);
    setError(null);
    const options = await apiFetch<Parameters<typeof startAuthentication>[0]["optionsJSON"]>(
      "/auth/passkey/generate-authenticate-options",
    );
    if (!options.ok) {
      setPending(false);
      return setError("Connexion par clé indisponible. Réessaie.");
    }
    try {
      const response = await startAuthentication({ optionsJSON: options.data });
      const verified = await apiFetch("/auth/passkey/verify-authentication", { method: "POST", json: { response } });
      if (!verified.ok) {
        setPending(false);
        return setError("Clé non reconnue.");
      }
      window.location.assign(retour);
    } catch (e) {
      setPending(false);
      setError(cancelled(e) ? "Connexion annulée." : "Ce navigateur n'a pas pu utiliser la clé.");
    }
  }

  return (
    <div className="s-stack s-stack--tight">
      <Button type="button" variant="secondary" icon="entry" loading={pending} onClick={signIn} fullWidth>
        Se connecter avec une clé d'accès
      </Button>
      {error && (
        <p className="s-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
