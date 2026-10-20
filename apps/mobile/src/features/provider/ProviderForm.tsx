// Vitrine du prestataire (lot 21 ; DA v2, lot 54, prototype `s-vitrine` « Modifier ma vitrine ») : métiers à cocher (tuiles),
// nom, spécialité, équipe, présentation, menu (une ligne par plat, avec son prix : chaque ligne illisible a son erreur),
// besoins sur place (électricité, façade, eau), rayon, départements d'intervention (carte de France du lot 41), contact.
// Sert à la création (depuis Créer) et à l'onglet Vitrine. Pas de SIRET : un amateur sans structure peut candidater.
import { Button, CheckboxField, Chip, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  PROVIDER_DEFAULT_RADIUS_KM,
  PROVIDER_MENU_MAX_LINES,
  type ProviderPower,
  type ProviderProfileView,
  parseMenuLines,
  proV2Labels,
  providerPowerLabels,
  providerSelectableTypes,
  type VendorTypeCode,
  vendorTypeLabels,
  vitrineTexts,
} from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { DepartmentPicker } from "@/features/arrivee/DepartmentPicker";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useVendorTypes } from "@/lib/lists";
import { tradeIcons } from "@/lib/proPresta";
import { IconTiles } from "@/ui/IconTiles";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";

const { space2, space3 } = tokens.spacing;

/** Électricité d'une vitrine : les trois choix du prototype (« Aucune · 16 A · 32 A »). */
const POWER_CHOICES: readonly ProviderPower[] = ["none", "a16", "a32"];

const link = (value: string): string | null => {
  const v = value.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
};

/** Entier saisi (« 6 », « 80 km ») ou `null` quand le champ est vide ou illisible. */
const wholeNumber = (value: string): number | null => {
  const digits = value.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
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
  // Lot 33 : types proposés par l'administration ; le type déjà choisi reste dans la liste.
  const offered = useVendorTypes();
  const selectable = providerSelectableTypes.filter(
    (c) => offered.includes(c) || (profile?.trades ?? []).includes(c) || c === profile?.type,
  );
  const [trades, setTrades] = useState<VendorTypeCode[]>(() =>
    profile ? (profile.trades.length ? profile.trades : [profile.type]) : ["food_truck"],
  );
  const [customType, setCustomType] = useState(profile?.customType ?? "");
  const [name, setName] = useState(profile?.name ?? "");
  const [tagline, setTagline] = useState(profile?.tagline ?? "");
  const [team, setTeam] = useState(profile?.teamSize ? String(profile.teamSize) : "");
  const [description, setDescription] = useState(profile?.description ?? "");
  const [menu, setMenu] = useState(profile?.menuText ?? "");
  const [power, setPower] = useState<ProviderPower | null>(profile?.powerNeed ?? null);
  const [frontage, setFrontage] = useState(profile?.frontageM ? String(profile.frontageM) : "");
  const [water, setWater] = useState(profile?.waterNeed ?? false);
  const [radius, setRadius] = useState(String(profile?.radiusKm ?? PROVIDER_DEFAULT_RADIUS_KM));
  const [departments, setDepartments] = useState<string[]>(profile?.departments ?? []);
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [instagram, setInstagram] = useState(profile?.instagram ?? "");
  const [portfolio, setPortfolio] = useState(profile?.portfolioUrl ?? "");
  const [website, setWebsite] = useState(profile?.website ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Le menu est relu à chaque frappe : une erreur par ligne illisible, avec son numéro.
  const menuErrors = menu.trim() ? parseMenuLines(menu).errors : [];
  const menuError = menuErrors.length ? menuErrors.map((e) => e.message).join("\n") : undefined;

  const toggleTrade = (code: string) => {
    setSaved(false);
    setTrades((current) =>
      current.includes(code as VendorTypeCode)
        ? current.filter((c) => c !== code)
        : [...current, code as VendorTypeCode],
    );
  };

  async function submit() {
    setError(null);
    setSaved(false);
    if (name.trim().length < 2) return setError(proV2Labels.nameMissing);
    if (!stand && trades.length === 0) return setError("Coche au moins un métier.");
    if (menuErrors.length) return setError("Corrige les lignes du menu avant d'enregistrer.");
    const radiusKm = wholeNumber(radius) ?? PROVIDER_DEFAULT_RADIUS_KM;
    if (radiusKm < 5 || radiusKm > 500) return setError(proV2Labels.radiusLimits(5, 500));
    // Le métier principal reste celui d'avant tant qu'il est coché, sinon le premier coché.
    const main: VendorTypeCode = stand
      ? "stand"
      : profile && trades.includes(profile.type)
        ? profile.type
        : (trades[0] ?? "food_truck");
    setBusy(true);
    try {
      const result = await api.saveProviderProfile({
        type: main,
        customType: main === "other" ? customType.trim() || null : null,
        name: name.trim(),
        description: description.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        website: link(website),
        instagram: instagram.trim() || null,
        portfolioUrl: link(portfolio),
        departments,
        trades: stand ? undefined : trades,
        tagline: tagline.trim() || null,
        teamSize: wholeNumber(team),
        menu: menu.trim() || null,
        powerNeed: power,
        frontageM: wholeNumber(frontage),
        waterNeed: water,
        radiusKm,
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
          <Muted variant="label">{vitrineTexts.tradesField}</Muted>
          <IconTiles
            testID="vitrine-trades"
            items={selectable.map((code) => ({
              key: code,
              label: vendorTypeLabels[code],
              icon: tradeIcons[code],
              checked: trades.includes(code),
            }))}
            onToggle={toggleTrade}
          />
        </>
      )}
      <Plate style={styles.plate}>
        {!stand && trades.includes("other") ? (
          <TextField
            label="Précise ton activité"
            value={customType}
            onChangeText={setCustomType}
            maxLength={40}
            placeholder="Glacier, DJ, vente de goodies…"
          />
        ) : null}
        <TextField
          label={vitrineTexts.nameField}
          value={name}
          onChangeText={setName}
          maxLength={60}
          placeholder="ex. La Brasa"
        />
        <TextField
          label={vitrineTexts.taglineField}
          value={tagline}
          onChangeText={setTagline}
          maxLength={80}
          placeholder="ex. Grillades catalanes"
        />
        <TextField
          label={vitrineTexts.teamField}
          value={team}
          onChangeText={setTeam}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="ex. 2"
          help="Le nombre de personnes sur le stand."
        />
        <TextField
          label="Présentation"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={800}
          tall
          placeholder="ex. Grillades au feu de bois, bocatas, frites maison."
        />
      </Plate>

      <Plate style={styles.plate}>
        <TextField
          label={vitrineTexts.menuField}
          value={menu}
          onChangeText={setMenu}
          multiline
          tall
          maxLength={4000}
          placeholder={`${vitrineTexts.menuPlaceholder}\nFrites maison · 4 €`}
          help={`${vitrineTexts.menuHelp} ${PROVIDER_MENU_MAX_LINES} plats au plus.`}
          error={menuError}
          testID="vitrine-menu"
        />
      </Plate>

      <Plate style={styles.plate}>
        <Text variant="label" color={t.color.plateMuted}>
          {vitrineTexts.needsTitle}
        </Text>
        <Text variant="label" color={t.color.plateMuted}>
          {vitrineTexts.powerField}
        </Text>
        <View style={styles.row} testID="vitrine-power">
          {POWER_CHOICES.map((p) => (
            <Chip key={p} surface="plate" selected={power === p} onPress={() => setPower(p)}>
              {providerPowerLabels[p]}
            </Chip>
          ))}
        </View>
        <TextField
          label={vitrineTexts.frontageField}
          value={frontage}
          onChangeText={setFrontage}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="ex. 6"
        />
        <CheckboxField label={vitrineTexts.waterField} checked={water} onChange={setWater} />
      </Plate>

      <Plate style={styles.plate}>
        <TextField
          label={vitrineTexts.radiusField}
          value={radius}
          onChangeText={setRadius}
          keyboardType="number-pad"
          maxLength={3}
          placeholder="ex. 80"
          help={`En kilomètres. ${proV2Labels.radiusLimits(5, 500)}.`}
          testID="vitrine-radius"
        />
        <Text variant="label" color={t.color.plateMuted}>
          {vitrineTexts.zoneTitle} · {proV2Labels.zoneDepartments}
        </Text>
        <DepartmentPicker
          surface="plate"
          selected={departments}
          onToggle={(code) => {
            setSaved(false);
            setDepartments((d) => (d.includes(code) ? d.filter((x) => x !== code) : [...d, code]));
          }}
        />
      </Plate>

      <Plate style={styles.plate}>
        <TextField
          label="Téléphone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="ex. 06 22 33 44 55"
        />
        <TextField
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="ex. contact@labrasa.fr"
        />
        <TextField
          label="Instagram"
          value={instagram}
          onChangeText={setInstagram}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="ex. @labrasa.66"
          help="Montré sur la fiche de l'événement pour les photographes."
        />
        <TextField
          label="Portfolio"
          value={portfolio}
          onChangeText={setPortfolio}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="ex. labrasa.fr/portfolio"
        />
        <TextField
          label="Site web"
          value={website}
          onChangeText={setWebsite}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="ex. labrasa.fr"
        />
      </Plate>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {saved ? <Notice>{proV2Labels.saved}</Notice> : null}
      <Button
        variant={secondary ? "secondary" : "primary"}
        icon="check"
        loading={busy}
        disabled={busy}
        onPress={() => void submit()}
        fullWidth
        testID="vitrine-save"
      >
        {submitLabel}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space3 },
  plate: { gap: space3, padding: space3 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
});
