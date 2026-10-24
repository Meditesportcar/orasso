// Casquette Pro, modifier la fiche (lot 35c) : mêmes champs que « Fiche publique » de l'espace pro du site (nom,
// activités, présentation, adresse et zone d'intervention, contact, réseaux, horaires). Le logo, les photos, les remises
// et le SIRET sont des blocs de la fiche. Un nouveau nom demande un nouveau contrôle du SIRET (règle de l'API).
// Création (lot 34, parité D20) : le même formulaire, vide, depuis Moi > Mes casquettes ; la casquette Pro s'ouvre ensuite.
// Lot 54 (DA v2) : les activités se cochent en tuiles (« touche pour cocher »), chaque champ montre un exemple de format,
// et les champs sont un composant à part (`ProFicheFields`) que l'onglet Ma fiche pose dans son segment « Modifier ».
// Lot C4b (artefact `s-pro`, `data-pp="edit"`) : champs à plat, dans l'ordre de l'artefact (activités en `.acts-g.edit`,
// SIRET, adresse, téléphone, Instagram, site web, présentation) ; les champs que l'artefact n'a pas viennent dessous.
import { Button, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  proAppLabels as L,
  type ProActivity,
  type ProCreate,
  proActivities,
  proActivityLabels,
  proAddressLabels,
  proV2Labels,
  weekdayLabels,
  weekdays,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { usePersona } from "@/lib/persona";
import { emptyProForm, formOfPro, type ProFicheForm, proBody, socialNetworks, toggleActivity } from "@/lib/proForm";
import { proActivityIcons } from "@/lib/proPresta";
import { useSession } from "@/lib/session";
import { type ApiState, useApi } from "@/lib/useApi";
import { useRun } from "@/lib/useRun";
import { Feedback } from "@/ui/Feedback";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";
import { ActGrid } from "./kit";
import type { SiretPending } from "./ProBlocks";

const { space2 } = tokens.spacing;
/** `.field` de l'artefact : 14 px entre deux champs du segment Modifier. */
const FIELD_GAP = 14;

/**
 * Lot 36 : vérification de l'adresse par le géocodeur, comme pour une structure ou un événement. L'API géocode aussi à
 * l'enregistrement ; le bouton dit tout de suite si l'adresse sera placée sur la carte.
 */
function AddressCheck({ query, located }: { query: string; located: boolean }) {
  const [status, setStatus] = useState<string | null>(located ? null : proAddressLabels.notLocated);
  const [busy, setBusy] = useState(false);
  async function check() {
    if (query.trim().length < 3) return setStatus(proAddressLabels.tooShort);
    setBusy(true);
    setStatus(proAddressLabels.searching);
    try {
      const { match } = await api.geocode(query);
      setStatus(match ? proAddressLabels.found(match.label) : proAddressLabels.notFound);
    } catch (e) {
      setStatus(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="plate" icon="place" loading={busy} onPress={() => void check()} testID="pro-address-check">
        {proAddressLabels.check}
      </Button>
      {status ? (
        <Muted variant="caption" testID="pro-address-status">
          {status}
        </Muted>
      ) : null}
    </>
  );
}

/** La fiche telle que l'écran parent la charge : une seule source, pour que l'en-tête suive l'enregistrement. */
export type MyProState = Pick<ApiState<Awaited<ReturnType<typeof api.myPro>>>, "data" | "loading" | "reload">;

/**
 * Les champs de la fiche : modification (onglet Ma fiche, qui passe sa propre `state`) ou création (depuis Créer).
 * Sans `state`, le composant charge la fiche lui-même (création : pour savoir si elle existe déjà).
 */
export function ProFicheFields({
  create = false,
  state,
  siret,
  siretPending,
}: {
  create?: boolean;
  state?: MyProState;
  /** Bloc SIRET de la fiche existante, posé après les activités comme dans l'artefact (absent à la création). */
  siret?: ReactNode;
  /** Le contrôle du SIRET changé, joué après l'enregistrement de la fiche (lot C7). */
  siretPending?: SiretPending;
}) {
  const { t } = useTheme();
  const { refreshMe } = useSession();
  const { choose } = usePersona();
  const own = useApi(() => api.myPro(), [], { cacheKey: state ? undefined : "my-pro", enabled: !state });
  const myPro = state ?? own;
  const pro = myPro.data;
  const [form, setForm] = useState<ProFicheForm | null>(() => (create ? emptyProForm() : null));
  const dirty = useRef(false);
  const { busy, error, notice, run, setError, setNotice } = useRun();

  // Les champs reprennent la fiche de l'API, sauf pendant une saisie non enregistrée.
  useEffect(() => {
    if (pro && !create && !dirty.current) setForm(formOfPro(pro));
  }, [pro, create]);

  const edit = (patch: Partial<ProFicheForm>) => {
    dirty.current = true;
    setNotice(null);
    setForm((f) => (f ? { ...f, ...patch } : f));
  };

  async function save() {
    if (!form) return;
    const parsed = proBody(form);
    if ("error" in parsed) return setError(parsed.error);
    if (create) {
      const body = parsed.body as ProCreate;
      const ok = await run("save", async () => {
        const created = await api.createPro(body);
        dirty.current = false;
        await refreshMe();
        await myPro.reload();
        // Lot 40 : la nouvelle casquette s'ouvre sur Ma fiche (pas sur son Accueil), avec le mot de confirmation.
        choose({ kind: "pro", proProfileId: created.id }, "/(pro)/fiche?fait=creee");
      });
      if (!ok) dirty.current = true;
      return;
    }
    if (!pro) return;
    const ok = await run(
      "save",
      async () => {
        await api.updatePro(pro.id, parsed.body);
        dirty.current = false;
        await myPro.reload();
        await siretPending?.current?.();
      },
      L.ficheSaved,
    );
    if (!ok) dirty.current = true;
  }

  return (
    <>
      {create && pro ? <Notice>{L.createExists}</Notice> : null}
      {!create && !pro ? myPro.loading ? null : <Notice>{L.noPro}</Notice> : null}
      {form && (create ? !pro : pro) ? (
        <View style={styles.fields} testID="pro-form">
          <TextField
            label={L.name}
            value={form.name}
            onChangeText={(name) => edit({ name })}
            maxLength={80}
            placeholder={proV2Labels.placeholders.name}
          />
          <Text variant="label" color={t.color.inkMuted}>
            {proV2Labels.activitiesEdit}
          </Text>
          <ActGrid
            testID="pro-activities"
            items={proActivities.map((a) => ({
              key: a,
              label: proActivityLabels[a],
              icon: proActivityIcons[a],
              checked: form.activities.includes(a),
            }))}
            onToggle={(a) => edit({ activities: toggleActivity(form.activities, a as ProActivity) })}
          />
          {siret}
          <TextField
            label={L.address}
            value={form.addressLine}
            onChangeText={(addressLine) => edit({ addressLine })}
            maxLength={200}
            placeholder={proV2Labels.placeholders.address}
          />
          <View style={styles.pair}>
            <View style={styles.postal}>
              <TextField
                label={L.postalCode}
                value={form.postalCode}
                onChangeText={(postalCode) => edit({ postalCode })}
                keyboardType="number-pad"
                maxLength={10}
                placeholder={proV2Labels.placeholders.postalCode}
              />
            </View>
            <View style={styles.grow}>
              <TextField
                label={L.city}
                value={form.city}
                onChangeText={(city) => edit({ city })}
                maxLength={80}
                placeholder={proV2Labels.placeholders.city}
              />
            </View>
          </View>
          <AddressCheck
            query={[form.addressLine, form.postalCode, form.city].filter(Boolean).join(" ")}
            located={!pro?.city || pro.lat !== null}
          />
          <TextField
            label={L.phone}
            value={form.phone}
            onChangeText={(phone) => edit({ phone })}
            keyboardType="phone-pad"
            placeholder={proV2Labels.placeholders.phone}
          />
          <TextField
            label={L.instagram}
            value={form.socials.instagram}
            onChangeText={(value) => edit({ socials: { ...form.socials, instagram: value } })}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={proV2Labels.placeholders.instagram}
          />
          <TextField
            label={L.website}
            value={form.website}
            onChangeText={(website) => edit({ website })}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={proV2Labels.placeholders.website}
          />
          <TextField
            label={L.description}
            value={form.description}
            onChangeText={(description) => edit({ description })}
            multiline
            maxLength={2000}
            style={{ minHeight: 110 }}
            placeholder={proV2Labels.placeholders.description}
          />

          {/* Champs de la fiche absents de l'artefact (site et API les ont) : sous ceux de l'artefact, sans plaque. */}
          <SectionTitle>{proV2Labels.moreDetails}</SectionTitle>
          <TextField
            label={L.email}
            value={form.email}
            onChangeText={(email) => edit({ email })}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={proV2Labels.placeholders.email}
          />
          <TextField
            label={L.zone}
            help={L.zoneHelp}
            value={form.zone}
            onChangeText={(zone) => edit({ zone })}
            autoCapitalize="characters"
            placeholder={proV2Labels.placeholders.zone}
          />
          {socialNetworks
            .filter((n) => n !== "instagram")
            .map((n) => (
              <TextField
                key={n}
                label={L[n]}
                value={form.socials[n]}
                onChangeText={(value) => edit({ socials: { ...form.socials, [n]: value } })}
                autoCapitalize="none"
                autoCorrect={false}
              />
            ))}
          <SectionTitle>{L.hours}</SectionTitle>
          {weekdays.map((d) => (
            <TextField
              key={d}
              label={weekdayLabels[d]}
              value={form.hours[d]}
              onChangeText={(value) => edit({ hours: { ...form.hours, [d]: value } })}
              placeholder={L.hoursHint}
              maxLength={60}
            />
          ))}

          <Feedback error={error} notice={notice} onPlate={false} testID="pro-form-notice" />
          <Button
            variant="primary"
            icon="check"
            loading={busy === "save"}
            onPress={() => void save()}
            fullWidth
            testID="pro-form-save"
          >
            {create ? L.createSave : L.saveFiche}
          </Button>
        </View>
      ) : null}
    </>
  );
}

/**
 * Création de la fiche depuis Créer (lot 34) : le même formulaire, vide. Lot M7 : c'est un parcours hors des onglets,
 * donc en mode B (en-tête de fiche, ✕ pour revenir).
 */
export function FicheForm({ create = false }: { create?: boolean } = {}) {
  const router = useRouter();
  return (
    <FlowScreen
      title={create ? L.createTitle : L.editTitle}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/profil"))}
    >
      {create ? <Muted variant="body">{L.createIntro}</Muted> : null}
      <ProFicheFields create={create} />
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  fields: { gap: FIELD_GAP },
  pair: { flexDirection: "row", gap: space2 },
  postal: { width: "36%" },
  grow: { flex: 1, minWidth: 0 },
});
