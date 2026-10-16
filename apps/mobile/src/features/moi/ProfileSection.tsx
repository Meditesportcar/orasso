// Moi, profil : photo, pseudo (disponibilité vérifiée pendant la saisie), description, et l'aperçu « ce que voient les
// autres » (`GET /me/public-preview` : le profil tel que le voit un autre utilisateur connecté).
import { Button, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { gradeLabels, pseudoSchema } from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api, authApi } from "@/lib/api";
import { avatarForm, pickAvatar } from "@/lib/avatar";
import { errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Avatar } from "@/ui/Avatar";
import { SectionTitle } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

type PseudoState = "same" | "checking" | "free" | "taken" | "invalid";

export function ProfileSection() {
  const { t } = useTheme();
  const { me, refreshMe } = useSession();
  const profile = me?.profile;
  const preview = useApi(() => api.publicPreview(), []);
  const [pseudo, setPseudo] = useState("");
  const [bio, setBio] = useState("");
  const [pseudoState, setPseudoState] = useState<PseudoState>("same");
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const filled = useRef(false);

  // Les champs prennent la valeur du compte une fois, quand elle arrive (puis on ne l'écrase plus pendant la saisie).
  useEffect(() => {
    if (!profile || filled.current) return;
    filled.current = true;
    setPseudo(profile.pseudo);
    setBio(profile.bio ?? "");
  }, [profile]);

  // Disponibilité du pseudo pendant la saisie ; garder le sien n'est pas « pris ».
  useEffect(() => {
    if (!profile) return;
    if (pseudo.toLowerCase() === profile.pseudo.toLowerCase()) {
      setPseudoState("same");
      return;
    }
    if (!pseudoSchema.safeParse(pseudo).success) {
      setPseudoState("invalid");
      return;
    }
    setPseudoState("checking");
    let cancelled = false;
    const timer = setTimeout(() => {
      authApi
        .pseudoAvailable(pseudo)
        .then((r) => !cancelled && setPseudoState(r.available ? "free" : "taken"))
        .catch(() => !cancelled && setPseudoState("free"));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pseudo, profile]);

  const changed = profile ? pseudo !== profile.pseudo || bio !== (profile.bio ?? "") : false;
  const canSave = changed && pseudoState !== "taken" && pseudoState !== "invalid" && pseudoState !== "checking";
  const pseudoError =
    pseudoState === "taken"
      ? "Ce pseudo est déjà pris."
      : pseudoState === "invalid"
        ? "3 à 24 caractères : lettres, chiffres, « _ » ou « . »."
        : undefined;
  const pseudoHelp =
    pseudoState === "checking" ? "Vérification…" : pseudoState === "free" ? "Ce pseudo est libre." : undefined;

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await api.updateProfile({ pseudo, bio });
      await Promise.all([refreshMe(), preview.reload()]);
      setMessage({ tone: "ok", text: "Profil enregistré." });
    } catch (e) {
      setMessage({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function changePhoto() {
    setMessage(null);
    setPhotoBusy(true);
    try {
      const picked = await pickAvatar();
      if (!picked) return;
      await api.uploadAvatar(await avatarForm(picked));
      await Promise.all([refreshMe(), preview.reload()]);
      setMessage({ tone: "ok", text: "Photo enregistrée." });
    } catch (e) {
      setMessage({ tone: "error", text: errorMessage(e) });
    } finally {
      setPhotoBusy(false);
    }
  }

  const p = preview.data;
  return (
    <>
      <SectionTitle>Profil</SectionTitle>
      <Plate style={styles.block} testID="moi-profile">
        <View style={styles.head}>
          <Avatar url={profile?.avatarUrl} pseudo={profile?.pseudo} size={72} />
          <View style={styles.headText}>
            <Text variant="posterL" color={t.color.plateInk}>
              {profile?.pseudo}
            </Text>
            <Text variant="meta" color={t.color.plateMuted}>
              {me?.user.email}
            </Text>
          </View>
        </View>
        <Button variant="plate" icon="add" loading={photoBusy} onPress={() => void changePhoto()} fullWidth>
          Changer la photo
        </Button>
        <TextField
          label="Pseudo"
          value={pseudo}
          onChangeText={setPseudo}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          maxLength={24}
          help={pseudoHelp}
          error={pseudoError}
        />
        <TextField
          label="Description"
          value={bio}
          onChangeText={setBio}
          multiline
          maxLength={500}
          help="500 caractères au plus. Visible par les autres si ton compte est public."
          style={{ minHeight: 96 }}
        />
        {message ? (
          <Text
            variant="caption"
            color={message.tone === "error" ? t.color.winText : t.color.plateInk}
            accessibilityRole={message.tone === "error" ? "alert" : "text"}
            testID="moi-profile-message"
          >
            {message.text}
          </Text>
        ) : null}
        <Button
          variant="secondary"
          icon="check"
          loading={busy}
          disabled={!canSave}
          onPress={() => void save()}
          fullWidth
        >
          Enregistrer le profil
        </Button>
      </Plate>

      <Plate kind="note" style={styles.preview} testID="moi-public-preview">
        <Text variant="label" color={t.color.plateMuted}>
          Ce que voient les autres
        </Text>
        {p ? (
          <>
            <Text variant="bodyStrong" color={t.color.plateInk}>
              {p.pseudo} · {gradeLabels[p.grade]}
            </Text>
            {p.bio ? (
              <Text variant="body" color={t.color.plateInk}>
                {p.bio}
              </Text>
            ) : null}
            {p.departments && p.departments.length > 0 ? (
              <Text variant="caption" color={t.color.plateMuted}>
                Secteur : {p.departments.join(", ")}
              </Text>
            ) : null}
            {p.vehicles.length > 0 ? (
              p.vehicles.map((v) => (
                <Text key={v.id} variant="body" color={t.color.plateInk}>
                  {v.label}
                </Text>
              ))
            ) : (
              <Text variant="caption" color={t.color.plateMuted}>
                Aucun véhicule.
              </Text>
            )}
          </>
        ) : (
          <Text variant="caption" color={t.color.plateMuted}>
            {preview.error ? "Aperçu indisponible hors ligne." : "Chargement…"}
          </Text>
        )}
      </Plate>
    </>
  );
}

const styles = StyleSheet.create({
  block: { gap: space3, padding: space3 },
  head: { flexDirection: "row", alignItems: "center", gap: space3 },
  headText: { flex: 1, gap: space1 },
  preview: { gap: space2 },
});
