// « Modifier mon profil » (lot R5b, maquette R5.5 ; avant : « Mon profil public », section `profil` des réglages) :
// photo (« Changer la photo » ouvre la feuille « Ta photo de profil », « Retirer »), pseudo (disponibilité vérifiée pendant
// la saisie), description, et « Mes réseaux » : Instagram, TikTok, YouTube, Facebook, Snapchat. On tape son pseudo ; un
// lien de profil collé est ramené au pseudo, un lien de publication ou d'un autre site est refusé avec une ligne qui dit
// quoi faire (`socialHandle`, la même règle que l'API). Plus d'e-mail ici (il est dans Compte). Un seul bouton
// principal, « Enregistrer », en bas, et « Voir mon profil public » à côté.

import type { IconName } from "@orasso/design-system/native";
import { Button, Icon, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  editProfileLabels as L,
  profilePhotoLabels,
  pseudoSchema,
  type SocialNetwork,
  socialHandle,
  socialLabel,
  socialNetworks,
  socialPrefix,
  socialsLabels,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { PhotoSheet } from "@/features/profil/PhotoSheet";
import { HeadAvatar } from "@/features/profil/parts";
import { api, authApi } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";
import { SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";
import { FlowScreen } from "@/ui/Screens";
import { SecHead } from "@/ui/SecHead";

const { space1, space2, space3 } = tokens.spacing;

type PseudoState = "same" | "checking" | "free" | "taken" | "invalid";
type Socials = Record<SocialNetwork, string>;

const NETWORK_ICON: Record<SocialNetwork, IconName> = {
  instagram: "instagram",
  tiktok: "tiktok",
  youtube: "youtube",
  facebook: "facebook",
  snapchat: "snapchat",
};

const emptySocials = (): Socials => ({ instagram: "", tiktok: "", youtube: "", facebook: "", snapchat: "" });

/** Une ligne « Mes réseaux » (`.r5sf` de la maquette) : icône, nom, préfixe, saisie, coche quand le pseudo est bon. */
function SocialField({
  network,
  value,
  onChange,
  error,
}: {
  network: SocialNetwork;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
}) {
  const { t } = useTheme();
  const c = t.color;
  const [focused, setFocused] = useState(false);
  const ok = !error && value.trim().length > 0;
  return (
    <View style={styles.socialBlock}>
      <View
        style={[
          styles.social,
          {
            backgroundColor: c.surfaceField,
            borderColor: error ? c.winText : focused ? c.accentText : c.line,
          },
        ]}
      >
        <Icon name={NETWORK_ICON[network]} size={18} color={c.ink} />
        <Text variant="caption" color={c.inkMuted} style={styles.socialName}>
          {socialLabel(network)}
        </Text>
        <Text variant="bodyStrong" color={c.inkMuted}>
          {socialPrefix(network)}
        </Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={socialsLabels.placeholder[network]}
          placeholderTextColor={c.inkFaint}
          selectionColor={c.accent}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          inputMode="url"
          maxLength={300}
          accessibilityLabel={socialsLabels.field(network)}
          testID={`social-${network}`}
          style={[styles.socialInput, { color: c.ink }]}
        />
        {ok ? <Icon name="check" size={16} color={c.accentText} /> : null}
      </View>
      {error ? (
        <View style={styles.socialError}>
          <Icon name="info" size={14} color={c.winText} />
          <Text
            variant="caption"
            color={c.winText}
            accessibilityRole="alert"
            style={styles.socialErrorText}
            testID={`social-error-${network}`}
          >
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function EditProfileScreen() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { me, refreshMe } = useSession();
  const profile = me?.profile;
  const [pseudo, setPseudo] = useState("");
  const [bio, setBio] = useState("");
  const [socials, setSocials] = useState<Socials>(emptySocials);
  const [pseudoState, setPseudoState] = useState<PseudoState>("same");
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const filled = useRef(false);

  // Les champs prennent la valeur du compte une fois, quand elle arrive (puis on ne l'écrase plus pendant la saisie).
  useEffect(() => {
    if (!profile || filled.current) return;
    filled.current = true;
    setPseudo(profile.pseudo);
    setBio(profile.bio ?? "");
    setSocials({ ...emptySocials(), ...(profile.socials ?? {}) });
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

  const checked = Object.fromEntries(socialNetworks.map((n) => [n, socialHandle(n, socials[n])])) as Record<
    SocialNetwork,
    ReturnType<typeof socialHandle>
  >;
  const socialErrors = socialNetworks.filter((n) => !checked[n].ok);
  const socialsChanged = profile
    ? socialNetworks.some((n) => {
        const r = checked[n];
        return r.ok && (r.handle ?? null) !== (profile.socials?.[n] ?? null);
      })
    : false;
  const changed = profile ? pseudo !== profile.pseudo || bio !== (profile.bio ?? "") || socialsChanged : false;
  const pseudoBlocked = pseudoState === "taken" || pseudoState === "invalid" || pseudoState === "checking";
  const canSave = changed && !pseudoBlocked && socialErrors.length === 0;
  const pseudoError =
    pseudoState === "taken"
      ? "Ce pseudo est déjà pris."
      : pseudoState === "invalid"
        ? "3 à 24 caractères : lettres, chiffres, « _ » ou « . »."
        : undefined;
  const pseudoHelp =
    pseudoState === "checking" ? "Vérification…" : pseudoState === "free" ? "Ce pseudo est libre." : L.pseudoHelp;
  // Jamais de bouton principal grisé sans la ligne qui dit ce qui manque.
  const missing = canSave ? null : !changed ? L.nothingChanged : L.fixErrors;

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await api.updateProfile({ pseudo, bio, socials });
      await refreshMe();
      filled.current = false;
      setMessage({ tone: "ok", text: L.saved });
    } catch (e) {
      setMessage({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    setPhotoBusy(true);
    setMessage(null);
    try {
      await api.removeAvatar();
      await refreshMe();
      setMessage({ tone: "ok", text: profilePhotoLabels.removed });
    } catch (e) {
      setMessage({ tone: "error", text: errorMessage(e) });
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <FlowScreen
      title={L.title}
      facts={L.subtitle}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/reglages"))}
      closeLabel="Retour"
      onRefresh={refreshMe}
      overlays={
        <PhotoSheet
          visible={sheet}
          onClose={() => setSheet(false)}
          onDone={(text) => setMessage({ tone: "ok", text })}
        />
      }
      footer={
        <View style={styles.footer}>
          {missing ? (
            <Muted variant="caption" testID="edit-profile-missing">
              {missing}
            </Muted>
          ) : null}
          <View style={styles.cta}>
            <SmButton
              kind="s"
              icon="eye"
              big
              accessibilityLabel={L.seePublic}
              onPress={() => router.push("/profil-public")}
              testID="edit-profile-public"
            />
            <View style={styles.grow}>
              <Button
                variant="primary"
                icon="check"
                loading={busy}
                disabled={!canSave}
                onPress={() => void save()}
                fullWidth
                testID="edit-profile-save"
              >
                {L.save}
              </Button>
            </View>
          </View>
        </View>
      }
    >
      <View style={styles.form} testID="moi-profile">
        <View style={styles.photo}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={profilePhotoLabels.change}
            onPress={() => setSheet(true)}
            testID="edit-profile-avatar"
          >
            <HeadAvatar url={profile?.avatarUrl} name={profile?.pseudo ?? "?"} size={88} />
          </Pressable>
          <View style={styles.photoButtons}>
            <SmButton kind="s" icon="camera" onPress={() => setSheet(true)} testID="edit-profile-photo">
              {profilePhotoLabels.changeButton}
            </SmButton>
            {profile?.avatarUrl ? (
              <SmButton
                kind="g"
                icon="trash"
                disabled={photoBusy}
                onPress={() => void removePhoto()}
                testID="edit-profile-photo-remove"
              >
                {profilePhotoLabels.removeButton}
              </SmButton>
            ) : null}
          </View>
        </View>
        <TextField
          label={L.pseudo}
          value={pseudo}
          onChangeText={setPseudo}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          maxLength={24}
          help={pseudoHelp}
          error={pseudoError}
        />
        <TextField label={L.description} value={bio} onChangeText={setBio} multiline maxLength={500} />

        <SecHead title={socialsLabels.title} hint={socialsLabels.optional} />
        <Muted variant="caption">{socialsLabels.hint}</Muted>
        <View style={styles.socials} testID="edit-profile-socials">
          {socialNetworks.map((n) => {
            const r = checked[n];
            return (
              <SocialField
                key={n}
                network={n}
                value={socials[n]}
                onChange={(v) => setSocials((s) => ({ ...s, [n]: v }))}
                error={r.ok ? null : r.reason}
              />
            );
          })}
        </View>
        <View style={[styles.note, { backgroundColor: c.surface }]}>
          <Icon name="lock" size={16} color={c.inkMuted} />
          <Text variant="caption" color={c.inkMuted} style={styles.noteText}>
            <Text variant="caption" color={c.ink} style={styles.noteStrong}>
              {socialsLabels.visibilityStrong}
            </Text>
            {socialsLabels.visibilityRest}
          </Text>
        </View>
        {message ? (
          <Text
            variant="caption"
            color={message.tone === "error" ? c.winText : c.ink}
            accessibilityRole={message.tone === "error" ? "alert" : "text"}
            testID="moi-profile-message"
          >
            {message.text}
          </Text>
        ) : null}
      </View>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: space3 },
  photo: { flexDirection: "row", alignItems: "center", gap: space3 + 4, paddingVertical: space1 },
  photoButtons: { flex: 1, gap: space2, alignItems: "flex-start" },
  socials: { gap: space2 },
  socialBlock: { gap: space1 },
  social: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    minHeight: 50,
    paddingHorizontal: space3,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  socialName: { width: 72, fontSize: 12.5 },
  socialInput: { flex: 1, minWidth: 0, minHeight: 44, fontSize: 15, fontWeight: "700", paddingVertical: 0 },
  socialError: { flexDirection: "row", alignItems: "flex-start", gap: space1 + 2 },
  socialErrorText: { flex: 1, fontSize: 12.5, lineHeight: 17 },
  note: { flexDirection: "row", gap: space2, alignItems: "flex-start", padding: space3, borderRadius: 14 },
  noteText: { flex: 1, fontSize: 12.5, lineHeight: 17 },
  noteStrong: { fontSize: 12.5, lineHeight: 17, fontWeight: "800" },
  footer: { gap: space2 },
  cta: { flexDirection: "row", alignItems: "center", gap: space2 },
  grow: { flex: 1 },
});
