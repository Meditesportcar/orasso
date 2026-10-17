// Casquette Organisateur, « Ma structure » (lot 35a, décision D20) : tout ce que la page Structure du site permet, sauf
// le compte Stripe (billetterie : lot 35c) et les notes (écran à part) : vérification et badge, fiche publique (mêmes
// champs que le site), logo, pros partenaires, lien d'invitation. Ouvert depuis l'onglet Staff (Équipe).
import { Button, Chip, ChipRow, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { orgaManageLabels as L, structureKindLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Share, StyleSheet, View } from "react-native";

import { siteUrl } from "@/api";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { isTwoFactorError } from "@/lib/orga";
import { addDepartment, normalizeDepartment } from "@/lib/settingsPatch";
import { imageForm, pickOneImage } from "@/lib/structureFiles";
import {
  formOfStructure,
  isSuspended,
  type StructureForm,
  structureFormChanged,
  structureFormIssue,
  structureUpdateBody,
} from "@/lib/teamModel";
import { useApi } from "@/lib/useApi";
import { Avatar } from "@/ui/Avatar";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";
import { AssistancePanel } from "../../admin/Assistance";
import { OrgaFailure, useOrga } from "../OrgaGate";
import { failWith } from "../team/fail";
import { PartnersPanel } from "./PartnersPanel";
import { VerificationPanel } from "./VerificationPanel";

const { space2, space3 } = tokens.spacing;

export function StructureScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const { structureId } = useOrga();
  const structure = useApi(() => api.orgStructure(structureId), [structureId]);
  const verification = useApi(() => api.verification(structureId), [structureId]);
  const partners = useApi(() => api.partners(structureId), [structureId]);

  const [form, setForm] = useState<StructureForm | null>(null);
  const [saved, setSaved] = useState<StructureForm | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | undefined>();
  const [busy, setBusy] = useState<"save" | "logo" | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // La fiche se remplit une fois : la saisie en cours n'est jamais écrasée par un rechargement.
  useEffect(() => {
    if (structure.data && form === null) {
      const initial = formOfStructure(structure.data);
      setForm(initial);
      setSaved(initial);
    }
  }, [structure.data, form]);

  const s = structure.data;
  const close = () => (router.canGoBack() ? router.back() : router.replace("/staff"));
  const set = <K extends keyof StructureForm>(key: K, value: StructureForm[K]) =>
    setForm((cur) => (cur ? { ...cur, [key]: value } : cur));
  const changed = form && saved ? structureFormChanged(form, saved) : false;

  const reloadAll = async () => {
    await Promise.all([structure.reload(), verification.reload(), partners.reload()]);
  };
  const changedOnServer = (message: string) => {
    setError(null);
    setNotice(message);
    void reloadAll();
  };
  const bubble = (e: unknown) => setError(e);

  function addCode() {
    const normalized = normalizeDepartment(code);
    if (!normalized) {
      setCodeError("Département inconnu : saisis son numéro (ex. 66, 2A, 974).");
      return;
    }
    setCodeError(undefined);
    setCode("");
    setForm((cur) => (cur ? { ...cur, departments: addDepartment(cur.departments, normalized) } : cur));
  }

  async function save() {
    if (!form) return;
    const issue = structureFormIssue(form);
    if (issue) {
      setFieldError(issue);
      return;
    }
    setFieldError(null);
    setBusy("save");
    setNotice(null);
    try {
      await api.updateStructure(structureId, structureUpdateBody(form));
      setSaved(form);
      setError(null);
      setNotice(L.structureSaved);
      void structure.reload();
    } catch (e) {
      failWith(e, setFieldError, bubble);
    } finally {
      setBusy(null);
    }
  }

  async function changeLogo() {
    setBusy("logo");
    setNotice(null);
    try {
      const photo = await pickOneImage();
      if (!photo) return;
      await api.uploadLogo(structureId, await imageForm(photo, "logo", "logo.jpg"));
      setError(null);
      setNotice(L.logoSaved);
      void structure.reload();
    } catch (e) {
      if (isTwoFactorError(e)) setError(e);
      else setFieldError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function shareInvite() {
    if (!s) return;
    const url = siteUrl(`/invitation/${s.inviteToken}`);
    try {
      await Share.share({ message: `${L.inviteLinkMessage(s.name)} : ${url}`, url, title: s.name });
    } catch {
      // Navigateur de recette : pas de feuille de partage, le lien reste affiché à l'écran.
    }
  }

  const inviteUrl = s ? siteUrl(`/invitation/${s.inviteToken}`) : null;

  return (
    <FlowScreen
      title={L.structureTitle}
      facts={s ? `${s.name} · ${structureKindLabels[s.kind]}` : undefined}
      onClose={close}
      onRefresh={reloadAll}
    >
      <OrgaFailure error={error ?? structure.error ?? verification.error} />
      {isSuspended(s) ? <Notice tone="error">{L.structureSuspended}</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}

      {s && verification.data ? (
        <VerificationPanel
          key={`${verification.data.verification}-${verification.data.documents.length}`}
          structure={s}
          view={verification.data}
          onChanged={changedOnServer}
          onTwoFactor={bubble}
        />
      ) : null}

      {s && form ? (
        <>
          <SectionTitle>{L.structureCardTitle}</SectionTitle>
          <Plate style={styles.logoBlock} testID="orga-logo">
            <Avatar url={s.logoUrl} pseudo={s.name} size={72} />
            <View style={styles.grow}>
              <Text variant="bodyStrong" color={t.color.plateInk}>
                {L.logoTitle}
              </Text>
              {!s.logoUrl ? (
                <Text variant="caption" color={t.color.plateMuted}>
                  {L.logoNone}
                </Text>
              ) : null}
            </View>
          </Plate>
          <Button
            variant="plate"
            icon="add"
            loading={busy === "logo"}
            disabled={busy !== null}
            onPress={() => void changeLogo()}
            fullWidth
            testID="orga-logo-change"
          >
            {L.logoChange}
          </Button>

          <Plate style={styles.block}>
            <TextField
              label={L.structureName}
              value={form.name}
              onChangeText={(v) => set("name", v)}
              maxLength={80}
              testID="orga-structure-name"
            />
            <TextField
              label={L.structureDescription}
              value={form.description}
              onChangeText={(v) => set("description", v)}
              multiline
              maxLength={2000}
              testID="orga-structure-description"
            />
            <TextField
              label={L.structureAddress}
              value={form.addressLine}
              onChangeText={(v) => set("addressLine", v)}
              maxLength={200}
            />
            <TextField
              label={L.structurePostalCode}
              value={form.postalCode}
              onChangeText={(v) => set("postalCode", v)}
              maxLength={10}
            />
            <TextField label={L.structureCity} value={form.city} onChangeText={(v) => set("city", v)} maxLength={80} />
          </Plate>

          <Plate style={styles.block}>
            <Text variant="label" color={t.color.plateMuted}>
              {L.structureDepartments}
            </Text>
            {form.departments.length > 0 ? (
              <ChipRow>
                {form.departments.map((d) => (
                  <Chip
                    key={d}
                    surface="plate"
                    selected
                    accessibilityLabel={`Retirer le département ${d}`}
                    onPress={() =>
                      set(
                        "departments",
                        form.departments.filter((x) => x !== d),
                      )
                    }
                  >
                    {`${d} ✕`}
                  </Chip>
                ))}
              </ChipRow>
            ) : null}
            <TextField
              label="Ajouter un département"
              value={code}
              onChangeText={(v) => {
                setCode(v);
                setCodeError(undefined);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={3}
              onSubmitEditing={addCode}
              help={L.structureDepartmentsHelp}
              error={codeError}
            />
            <Button variant="plate" icon="add" disabled={code.trim() === ""} onPress={addCode} fullWidth>
              Ajouter ce département
            </Button>
          </Plate>

          <Plate style={styles.block}>
            <TextField
              label={L.structureWebsite}
              value={form.website}
              onChangeText={(v) => set("website", v)}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextField
              label={L.structureInstagram}
              value={form.instagram}
              onChangeText={(v) => set("instagram", v)}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextField
              label={L.structureFacebook}
              value={form.facebook}
              onChangeText={(v) => set("facebook", v)}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextField
              label={L.structureTiktok}
              value={form.tiktok}
              onChangeText={(v) => set("tiktok", v)}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextField
              label={L.structureYoutube}
              value={form.youtube}
              onChangeText={(v) => set("youtube", v)}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Plate>
          {fieldError ? <Notice tone="error">{fieldError}</Notice> : null}
          <Button
            variant="secondary"
            icon="check"
            loading={busy === "save"}
            disabled={!changed || busy !== null}
            onPress={() => void save()}
            fullWidth
            testID="orga-structure-save"
          >
            {L.structureSave}
          </Button>
          <Button variant="plate" icon="share" onPress={() => void Linking.openURL(siteUrl(`/o/${s.slug}`))} fullWidth>
            {L.structurePublicPage}
          </Button>
        </>
      ) : null}

      {s && partners.data ? (
        <PartnersPanel
          structureId={structureId}
          structureName={s.name}
          partners={partners.data}
          onChanged={changedOnServer}
          onTwoFactor={bubble}
        />
      ) : null}

      {s && inviteUrl ? (
        <>
          <SectionTitle>{L.inviteLinkTitle}</SectionTitle>
          <Muted variant="caption">{L.inviteLinkIntro(s.name)}</Muted>
          <Plate kind="note">
            <Text variant="caption" color={t.color.plateInk} selectable testID="orga-invite-link">
              {inviteUrl}
            </Text>
          </Plate>
          <Button variant="plate" icon="share" onPress={() => void shareInvite()} fullWidth testID="orga-invite-share">
            {L.inviteLinkShare}
          </Button>
        </>
      ) : null}

      {/* Lot 35d : « Demander l'aide d'Orasso », l'état de la demande et sa clôture (mode assistance, S41). */}
      <AssistancePanel structureId={structureId} />
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  logoBlock: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3 },
  grow: { flex: 1, gap: 2 },
});
