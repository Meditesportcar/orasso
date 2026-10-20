// Profil média (lot 55, ARCHITECTURE-DA-V2 § 3.8) : nom, ce que le média produit, présentation, liens, logo, et la zone
// couverte (toute la France, ou des départements sur la carte). Sert à la création (depuis « Créer ») et à la
// modification (ligne de la casquette dans Mon profil). Pas de numéro de carte de presse (D26) : l'administration vérifie
// le profil lui-même, la pastille « Profil vérifié » s'affiche ensuite.
import { Button, Chip, ChipRow, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  mediaAppLabels as L,
  type MediaFormat,
  type MediaProfileView,
  mediaFormatLabels,
  mediaFormats,
} from "@orasso/shared";
import { useState } from "react";
import { Image, Platform, StyleSheet, View } from "react-native";

import { DepartmentPicker } from "@/features/arrivee/DepartmentPicker";
import { toggleDepartment } from "@/features/arrivee/model";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { CROP_SQUARE, type PickedPhoto, pickPhotos } from "@/lib/photos";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { normalizeUrl } from "./model";

const { space2, space3 } = tokens.spacing;

/** Un lien de profil : « https:// » ajouté, vide = aucun. */
const link = (value: string) => normalizeUrl(value);

export function MediaProfileForm({
  profile,
  submitLabel,
  onSaved,
}: {
  profile: MediaProfileView | null;
  submitLabel: string;
  onSaved: (saved: MediaProfileView) => void;
}) {
  const { t } = useTheme();
  const [name, setName] = useState(profile?.name ?? "");
  const [formats, setFormats] = useState<MediaFormat[]>(profile?.formats ?? []);
  const [description, setDescription] = useState(profile?.description ?? "");
  const [website, setWebsite] = useState(profile?.website ?? "");
  const [instagram, setInstagram] = useState(profile?.instagram ?? "");
  const [youtube, setYoutube] = useState(profile?.youtube ?? "");
  const [departments, setDepartments] = useState<string[]>(profile?.departments ?? []);
  const [someDepartments, setSomeDepartments] = useState((profile?.departments.length ?? 0) > 0);
  const [logo, setLogo] = useState<PickedPhoto | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleFormat = (f: MediaFormat) =>
    setFormats((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  async function pickLogo() {
    const [photo] = await pickPhotos(1, CROP_SQUARE);
    if (photo) {
      setLogo(photo);
      setLogoRemoved(false);
    }
  }

  async function uploadLogo(photo: PickedPhoto): Promise<string> {
    const form = new FormData();
    form.append("purpose", "media_logo");
    if (Platform.OS === "web") {
      const blob = await (await fetch(photo.uri)).blob();
      form.append("file", new File([blob], "logo.jpg", { type: "image/jpeg" }));
    } else {
      form.append("file", { uri: photo.uri, name: "logo.jpg", type: "image/jpeg" } as unknown as Blob);
    }
    return (await api.upload(form)).key;
  }

  async function submit() {
    setError(null);
    if (name.trim().length < 2) return setError("Indique le nom de ton média.");
    if (formats.length === 0) return setError("Choisis au moins un format.");
    setBusy(true);
    try {
      let saved = await api.saveMediaProfile({
        name: name.trim(),
        formats,
        description: description.trim() || null,
        website: link(website),
        instagram: instagram.trim() || null,
        youtube: link(youtube),
        departments: someDepartments ? departments : [],
      });
      if (logo) saved = await api.setMediaLogo(await uploadLogo(logo));
      else if (logoRemoved && saved.logoUrl) saved = await api.removeMediaLogo();
      onSaved(saved);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const shownLogo = logo?.uri ?? (logoRemoved ? null : (profile?.logoUrl ?? null));

  return (
    <View style={styles.form}>
      <Plate style={styles.plate}>
        <TextField label={L.profileName} value={name} onChangeText={setName} maxLength={60} testID="media-name" />
        <Muted variant="label">{L.profileFormats}</Muted>
        <ChipRow>
          {mediaFormats.map((f) => (
            <Chip key={f} surface="plate" selected={formats.includes(f)} onPress={() => toggleFormat(f)}>
              {mediaFormatLabels[f]}
            </Chip>
          ))}
        </ChipRow>
        <TextField
          label={L.profileDescription}
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={800}
          tall
        />
      </Plate>

      <Plate style={styles.plate}>
        <TextField
          label={L.profileWebsite}
          value={website}
          onChangeText={setWebsite}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="sudcars.fr"
          testID="media-website"
        />
        <TextField
          label={L.profileInstagram}
          value={instagram}
          onChangeText={setInstagram}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="@sudcars"
        />
        <TextField
          label={L.profileYoutube}
          value={youtube}
          onChangeText={setYoutube}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="youtube.com/@sudcars"
          help={L.profileLinkHelp}
        />
      </Plate>

      <Plate style={styles.plate}>
        <Muted variant="label">{L.profileLogo}</Muted>
        <View style={styles.logoRow}>
          {shownLogo ? (
            <Image
              source={{ uri: shownLogo }}
              style={[styles.logo, { borderColor: t.color.plateLine }]}
              accessibilityIgnoresInvertColors
              accessibilityLabel={L.profileLogo}
            />
          ) : null}
          <View style={styles.logoActions}>
            <Button variant="plate" icon="gallery" onPress={() => void pickLogo()} disabled={busy}>
              {shownLogo ? L.profileLogoChange : L.profileLogoPick}
            </Button>
            {shownLogo ? (
              <Button
                variant="plate"
                tone="dashed"
                icon="close"
                disabled={busy}
                onPress={() => {
                  setLogo(null);
                  setLogoRemoved(true);
                }}
              >
                {L.profileLogoRemove}
              </Button>
            ) : null}
          </View>
        </View>
      </Plate>

      <Plate style={styles.plate}>
        <Muted variant="label">{L.profileCover}</Muted>
        <ChipRow>
          <Chip surface="plate" selected={!someDepartments} onPress={() => setSomeDepartments(false)}>
            {L.profileCoverAll}
          </Chip>
          <Chip surface="plate" selected={someDepartments} onPress={() => setSomeDepartments(true)}>
            {L.profileCoverSome}
          </Chip>
        </ChipRow>
        <Text variant="caption" color={t.color.plateMuted}>
          {someDepartments ? L.profileCoverCount(departments.length) : L.profileCoverHelp}
        </Text>
        {someDepartments ? (
          <DepartmentPicker
            selected={departments}
            surface="plate"
            onToggle={(code) => setDepartments((cur) => toggleDepartment(cur, code))}
          />
        ) : null}
      </Plate>

      <Notice>{L.profileVerifyNote}</Notice>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        variant="primary"
        icon="check"
        loading={busy}
        disabled={busy}
        fullWidth
        onPress={() => void submit()}
        testID="media-profile-submit"
      >
        {submitLabel}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space3 },
  plate: { gap: space2, padding: space3 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: space3 },
  logo: { width: 72, height: 72, borderRadius: tokens.radius.radiusSm, borderWidth: 1.5 },
  logoActions: { flex: 1, gap: space2 },
});
