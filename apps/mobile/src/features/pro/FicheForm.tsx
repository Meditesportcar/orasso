// Casquette Pro, modifier la fiche (lot 35c) : mêmes champs que « Fiche publique » de l'espace pro du site (nom,
// activités, présentation, adresse et zone d'intervention, contact, réseaux, horaires). Le logo, les photos, les remises
// et le SIRET sont des blocs de la fiche. Un nouveau nom demande un nouveau contrôle du SIRET (règle de l'API).
// Création (lot 34, parité D20) : le même formulaire, vide, depuis Moi > Mes casquettes ; la casquette Pro s'ouvre ensuite.
import { Button, Chip, ChipRow, Plate, TextField, tokens } from "@orasso/design-system/native";
import {
  proAppLabels as L,
  type ProCreate,
  proActivities,
  proActivityLabels,
  proAddressLabels,
  weekdayLabels,
  weekdays,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { usePersona } from "@/lib/persona";
import { emptyProForm, formOfPro, type ProFicheForm, proBody, socialNetworks, toggleActivity } from "@/lib/proForm";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useRun } from "@/lib/useRun";
import { Feedback } from "@/ui/Feedback";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle, TabScreen } from "@/ui/Screens";

const { space2, space3 } = tokens.spacing;

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

export function FicheForm({ create = false }: { create?: boolean } = {}) {
  const router = useRouter();
  const { refreshMe } = useSession();
  const { choose } = usePersona();
  const myPro = useApi(() => api.myPro(), [], { cacheKey: "my-pro" });
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
        choose({ kind: "pro", proProfileId: created.id });
        router.replace({ pathname: "/fiche", params: { fait: "creee" } });
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
      },
      L.ficheSaved,
    );
    if (!ok) dirty.current = true;
  }

  return (
    <TabScreen title={create ? L.createTitle : L.editTitle} facts={create ? undefined : pro?.name}>
      {create ? (
        <Muted variant="body">{L.createIntro}</Muted>
      ) : (
        <Button variant="plate" icon="back" onPress={() => router.replace("/fiche")} fullWidth>
          {L.editBack}
        </Button>
      )}
      {create && pro ? <Notice>{L.createExists}</Notice> : null}
      {!create && !pro ? myPro.loading ? null : <Notice>{L.noPro}</Notice> : null}
      {form && (create ? !pro : pro) ? (
        <>
          <Plate style={styles.block} testID="pro-form">
            <TextField label={L.name} value={form.name} onChangeText={(name) => edit({ name })} maxLength={80} />
            <Muted variant="label">{L.activities}</Muted>
            <ChipRow>
              {proActivities.map((a) => (
                <Chip
                  key={a}
                  surface="plate"
                  selected={form.activities.includes(a)}
                  onPress={() => edit({ activities: toggleActivity(form.activities, a) })}
                >
                  {proActivityLabels[a]}
                </Chip>
              ))}
            </ChipRow>
            <TextField
              label={L.description}
              value={form.description}
              onChangeText={(description) => edit({ description })}
              multiline
              maxLength={2000}
              style={{ minHeight: 96 }}
            />
          </Plate>

          <SectionTitle>{L.where}</SectionTitle>
          <Plate style={styles.block}>
            <TextField
              label={L.address}
              value={form.addressLine}
              onChangeText={(addressLine) => edit({ addressLine })}
              maxLength={200}
            />
            <TextField
              label={L.postalCode}
              value={form.postalCode}
              onChangeText={(postalCode) => edit({ postalCode })}
              keyboardType="number-pad"
              maxLength={10}
            />
            <TextField label={L.city} value={form.city} onChangeText={(city) => edit({ city })} maxLength={80} />
            <AddressCheck
              query={[form.addressLine, form.postalCode, form.city].filter(Boolean).join(" ")}
              located={!pro?.city || pro.lat !== null}
            />
            <TextField
              label={L.zone}
              help={L.zoneHelp}
              value={form.zone}
              onChangeText={(zone) => edit({ zone })}
              autoCapitalize="characters"
            />
          </Plate>

          <SectionTitle>{L.contact}</SectionTitle>
          <Plate style={styles.block}>
            <TextField
              label={L.phone}
              value={form.phone}
              onChangeText={(phone) => edit({ phone })}
              keyboardType="phone-pad"
            />
            <TextField
              label={L.email}
              value={form.email}
              onChangeText={(email) => edit({ email })}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextField
              label={L.website}
              value={form.website}
              onChangeText={(website) => edit({ website })}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {socialNetworks.map((n) => (
              <TextField
                key={n}
                label={L[n]}
                value={form.socials[n]}
                onChangeText={(value) => edit({ socials: { ...form.socials, [n]: value } })}
                autoCapitalize="none"
                autoCorrect={false}
              />
            ))}
          </Plate>

          <SectionTitle>{L.hours}</SectionTitle>
          <Plate style={styles.block}>
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
          </Plate>

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
        </>
      ) : null}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
});
