// Profil prestataire (lot 21) : type, nom, présentation, contact, Instagram, portfolio, départements. Sert à la création
// (depuis « Mes casquettes ») et à l'onglet Profil. Pas de SIRET : un amateur sans structure peut candidater.
import { Button, Chip, ChipRow, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { departmentSchema, type ProviderProfileView, providerSelectableTypes, vendorTypeLabels } from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useVendorTypes } from "@/lib/lists";
import { Notice } from "@/ui/Notice";

const { space3 } = tokens.spacing;

const link = (value: string): string | null => {
  const v = value.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
};

export function ProviderForm({
  profile,
  submitLabel,
  onSaved,
  secondary,
}: {
  profile: ProviderProfileView | null;
  submitLabel: string;
  onSaved: (saved: ProviderProfileView) => void;
  /** L'écran porte déjà son bouton principal : celui du formulaire devient secondaire. */
  secondary?: boolean;
}) {
  const { t } = useTheme();
  const stand = profile?.type === "stand";
  const [type, setType] = useState(profile?.type ?? "food_truck");
  // Lot 33 : types proposés par l'administration ; le type déjà choisi reste dans la liste.
  const offered = useVendorTypes();
  const selectable = providerSelectableTypes.filter((c) => offered.includes(c) || c === profile?.type);
  const [customType, setCustomType] = useState(profile?.customType ?? "");
  const [name, setName] = useState(profile?.name ?? "");
  const [description, setDescription] = useState(profile?.description ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [instagram, setInstagram] = useState(profile?.instagram ?? "");
  const [portfolio, setPortfolio] = useState(profile?.portfolioUrl ?? "");
  const [website, setWebsite] = useState(profile?.website ?? "");
  const [zone, setZone] = useState(profile?.departments.join(", ") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit() {
    setError(null);
    setSaved(false);
    const departments = zone.split(/[\s,;]+/).filter(Boolean);
    if (departments.some((d) => !departmentSchema.safeParse(d).success)) {
      return setError("Zone d'intervention : codes de département séparés par des virgules (ex. 66, 11).");
    }
    if (name.trim().length < 2) return setError("Indique le nom de ton activité.");
    setBusy(true);
    try {
      const result = await api.saveProviderProfile({
        type: stand ? "stand" : type,
        customType: type === "other" ? customType.trim() || null : null,
        name: name.trim(),
        description: description.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        website: link(website),
        instagram: instagram.trim() || null,
        portfolioUrl: link(portfolio),
        departments,
      });
      setSaved(true);
      onSaved(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.form}>
      {stand ? (
        <Notice>Stand lié à ta fiche pro : {vendorTypeLabels.stand}.</Notice>
      ) : (
        <>
          <Text variant="label" color={t.color.ink}>
            Mon activité
          </Text>
          <ChipRow>
            {selectable.map((code) => (
              <Chip key={code} selected={type === code} onPress={() => setType(code)}>
                {vendorTypeLabels[code]}
              </Chip>
            ))}
          </ChipRow>
        </>
      )}
      <Plate style={styles.plate}>
        {!stand && type === "other" ? (
          <TextField
            label="Précise ton activité"
            value={customType}
            onChangeText={setCustomType}
            maxLength={40}
            placeholder="Glacier, DJ, vente de goodies…"
          />
        ) : null}
        <TextField label="Nom affiché" value={name} onChangeText={setName} maxLength={60} />
        <TextField
          label="Présentation"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={800}
          tall
        />
      </Plate>
      <Plate style={styles.plate}>
        <TextField label="Téléphone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <TextField
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextField
          label="Instagram"
          value={instagram}
          onChangeText={setInstagram}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="@pseudo"
          help="Montré sur la fiche de l'événement pour les photographes."
        />
        <TextField
          label="Portfolio"
          value={portfolio}
          onChangeText={setPortfolio}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <TextField
          label="Site web"
          value={website}
          onChangeText={setWebsite}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <TextField
          label="Zone d'intervention"
          value={zone}
          onChangeText={setZone}
          placeholder="66, 11"
          help="Les départements où tu te déplaces."
        />
      </Plate>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {saved ? <Notice>Profil enregistré.</Notice> : null}
      <Button
        variant={secondary ? "secondary" : "primary"}
        icon="check"
        loading={busy}
        disabled={busy}
        onPress={() => void submit()}
        fullWidth
      >
        {submitLabel}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space3 },
  plate: { gap: space3, padding: space3 },
});
