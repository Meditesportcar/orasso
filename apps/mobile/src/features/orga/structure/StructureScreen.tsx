// Casquette Organisateur, onglet Structure (DA v2, lot 52, prototype `s-ostruct`) : l'en-tête (logo rond, nom, « Structure
// validée » = sceau qui tourne et pastille au O ; sinon un message clair à la place du badge), trois chiffres, puis des
// tuiles qui ouvrent chacune son volet sous la grille : Fiche publique, Logo, Abonnés, Partenaires, Bannis, Paiements
// (propriétaire), Vérification et badge, Lien d'invitation, Demander l'aide d'Orasso. Mêmes champs et mêmes routes que
// la page Structure du site (lot 35a) ; tout le contenu des volets vient de ce lot-là.
import {
  Button,
  Chip,
  ChipRow,
  Counters,
  Icon,
  type IconName,
  Plate,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import { orgaManageLabels as L, orgaV2Labels as L2, structureKindLabels, ticketingAppLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, Share, StyleSheet, View } from "react-native";

import { siteUrl } from "@/api";
import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { isTwoFactorError } from "@/lib/orga";
import { CROP_SQUARE } from "@/lib/photos";
import { useSession } from "@/lib/session";
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
import { isStructureOwner } from "@/lib/ticketing";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { AssistancePanel } from "../../admin/Assistance";
import { OrgaFailure, useOrga } from "../OrgaGate";
import { failWith } from "../team/fail";
import { PartnersPanel } from "./PartnersPanel";
import { SealedLogo } from "./Seal";
import { VerificationPanel } from "./VerificationPanel";

const { space1, space2, space3 } = tokens.spacing;

type Tile = "card" | "logo" | "followers" | "partners" | "payments" | "verification" | "invite" | "help";

function TileButton({
  icon,
  title,
  hint,
  active,
  disabled,
  onPress,
  testID,
}: {
  icon: IconName;
  title: string;
  hint: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(active), disabled: Boolean(disabled) }}
      accessibilityLabel={`${title}. ${hint}`}
      testID={testID}
      style={styles.tile}
    >
      <Plate style={[styles.tilePlate, active ? { borderColor: c.accent } : null, disabled ? styles.disabled : null]}>
        <Icon name={icon} size={20} color={c.plateInk} />
        <Text variant="bodyStrong" color={c.plateInk}>
          {title}
        </Text>
        <Text variant="caption" color={c.plateMuted}>
          {hint}
        </Text>
      </Plate>
    </Pressable>
  );
}

export function StructureScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const { me } = useSession();
  const { structureId } = useOrga();
  const structure = useApi(() => api.orgStructure(structureId), [structureId]);
  const verification = useApi(() => api.verification(structureId), [structureId]);
  const partners = useApi(() => api.partners(structureId), [structureId]);
  const events = useApi(() => api.structureEvents(structureId), [structureId], {
    cacheKey: `orga-events-${structureId}`,
  });
  const bans = useApi(() => api.bans(structureId), [structureId]);
  const owner = isStructureOwner(me?.memberships, structureId);
  const stripe = useApi(() => api.stripeAccount(structureId), [structureId], { enabled: owner });

  const [open, setOpen] = useState<Tile | null>(null);
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
  const set = <K extends keyof StructureForm>(key: K, value: StructureForm[K]) =>
    setForm((cur) => (cur ? { ...cur, [key]: value } : cur));
  const changed = form && saved ? structureFormChanged(form, saved) : false;
  const state = verification.data?.verification ?? s?.verification ?? "unverified";
  const verified = state === "verified";
  const published = (events.data ?? []).filter((e) => e.status === "published");
  const partnerCount = (partners.data ?? []).filter((p) => p.status === "accepted").length;
  const toggle = (tile: Tile) => setOpen((cur) => (cur === tile ? null : tile));

  const reloadAll = async () => {
    await Promise.all([structure.reload(), verification.reload(), partners.reload(), events.reload(), bans.reload()]);
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
      const photo = await pickOneImage(CROP_SQUARE);
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
  const rating = s?.rating.average;
  const stripeText = !stripe.data
    ? null
    : !stripe.data.configured
      ? ticketingAppLabels.stripeSoon
      : stripe.data.connected
        ? `${ticketingAppLabels.stripeConnected} ${stripe.data.accountHint ?? ""}`.trim()
        : ticketingAppLabels.stripeNotConnected;

  return (
    <TabScreen
      title={L.structureTitle}
      facts={s ? `${s.name} · ${structureKindLabels[s.kind]}` : undefined}
      onRefresh={reloadAll}
    >
      <OrgaFailure error={error ?? structure.error ?? verification.error} />
      {isSuspended(s) ? <Notice tone="error">{L.structureSuspended}</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}

      {s ? (
        <>
          <View style={styles.head} testID="structure-head">
            <SealedLogo url={s.logoUrl} name={s.name} verified={verified} />
            <View style={styles.grow}>
              <Text variant="posterM" color={t.color.ink}>
                {s.name}
              </Text>
              {verified ? (
                <Text variant="label" color={t.color.accentText} testID="structure-validated">
                  {L2.structVerified}
                </Text>
              ) : null}
            </View>
          </View>
          {state === "pending" ? (
            <Plate kind="note" style={styles.block} testID="structure-pending">
              <Text variant="bodyStrong" color={t.color.plateInk}>
                {L2.structPending}
              </Text>
              <Text variant="body" color={t.color.plateMuted}>
                {L2.structPendingBody}
              </Text>
            </Plate>
          ) : null}
          {state === "unverified" ? (
            <Plate kind="note" style={styles.block} testID="structure-unverified">
              <Text variant="bodyStrong" color={t.color.plateInk}>
                {L2.structUnverified}
              </Text>
              <Text variant="body" color={t.color.plateMuted}>
                {L2.structUnverifiedBody}
              </Text>
            </Plate>
          ) : null}
          <Counters
            items={[
              { value: s.followersCount, label: L2.structFollowers },
              { value: published.length, label: L2.structEvents },
              {
                value: rating !== null && rating !== undefined ? String(rating).replace(".", ",") : L2.structRatingNone,
                label: L2.structRating,
              },
            ]}
          />
        </>
      ) : (
        <Muted variant="body">{structure.loading ? "Chargement…" : null}</Muted>
      )}

      {s ? (
        <View style={styles.grid}>
          <TileButton
            icon="place"
            title={L2.tileCard}
            hint={L2.tileCardHint}
            active={open === "card"}
            onPress={() => toggle("card")}
            testID="tile-card"
          />
          <TileButton
            icon="gallery"
            title={L2.tileLogo}
            hint={L2.tileLogoHint}
            active={open === "logo"}
            onPress={() => toggle("logo")}
            testID="tile-logo"
          />
          <TileButton
            icon="heart"
            title={L2.tileFollowers}
            hint={L2.tileFollowersHint(s.followersCount)}
            active={open === "followers"}
            onPress={() => toggle("followers")}
            testID="tile-followers"
          />
          <TileButton
            icon="briefcase"
            title={L2.tilePartners}
            hint={L2.tilePartnersHint(partnerCount)}
            active={open === "partners"}
            onPress={() => toggle("partners")}
            testID="tile-partners"
          />
          <TileButton
            icon="flag"
            title={L2.tileBans}
            hint={L2.tileBansHint(bans.data ? bans.data.length : null)}
            onPress={() => router.push("/bannis")}
            testID="tile-bans"
          />
          <TileButton
            icon="ticket"
            title={L2.tilePayments}
            hint={owner ? L2.tilePaymentsHint : L2.tilePaymentsOwner}
            active={open === "payments"}
            disabled={!owner}
            onPress={() => toggle("payments")}
            testID="tile-payments"
          />
          <TileButton
            icon="badge"
            title={L2.tileVerification}
            hint={L2.tileVerificationHint}
            active={open === "verification"}
            onPress={() => toggle("verification")}
            testID="tile-verification"
          />
          <TileButton
            icon="share"
            title={L2.tileInvite}
            hint={L2.tileInviteHint}
            active={open === "invite"}
            onPress={() => toggle("invite")}
            testID="tile-invite"
          />
          <TileButton
            icon="chat"
            title={L2.tileHelp}
            hint={L2.tileHelpHint}
            active={open === "help"}
            onPress={() => toggle("help")}
            testID="tile-help"
          />
        </View>
      ) : null}

      {s && open === "card" && form ? (
        <View style={styles.panel} testID="panel-card">
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
            variant="plate"
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
        </View>
      ) : null}

      {s && open === "logo" ? (
        <View style={styles.panel} testID="panel-logo">
          <Plate style={styles.logoBlock} testID="orga-logo">
            <Text variant="bodyStrong" color={t.color.plateInk} style={styles.grow}>
              {s.logoUrl ? L.logoTitle : L.logoNone}
            </Text>
          </Plate>
          {fieldError ? <Notice tone="error">{fieldError}</Notice> : null}
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
          <Muted variant="caption">{L2.tileLogoHint}</Muted>
        </View>
      ) : null}

      {s && open === "followers" ? (
        <View style={styles.panel} testID="panel-followers">
          <Plate style={styles.block}>
            <Text variant="posterM" color={t.color.plateInk}>
              {L2.tileFollowersHint(s.followersCount)}
            </Text>
            <Text variant="body" color={t.color.plateMuted}>
              {L2.followersIntro}
            </Text>
          </Plate>
        </View>
      ) : null}

      {s && open === "partners" && partners.data ? (
        <View style={styles.panel} testID="panel-partners">
          <PartnersPanel
            structureId={structureId}
            structureName={s.name}
            partners={partners.data}
            onChanged={changedOnServer}
            onTwoFactor={bubble}
          />
        </View>
      ) : null}

      {s && open === "payments" && owner ? (
        <View style={styles.panel} testID="panel-payments">
          <Plate style={styles.block}>
            <Text variant="bodyStrong" color={t.color.plateInk}>
              {L2.tilePaymentsHint}
            </Text>
            {stripeText ? (
              <Text variant="body" color={t.color.plateMuted} testID="panel-payments-state">
                {stripeText}
              </Text>
            ) : null}
          </Plate>
          {published.length === 0 ? (
            <Muted variant="body">{L2.eventsNoneInProgress}</Muted>
          ) : (
            published.slice(0, 6).map((e) => (
              <Button
                key={e.id}
                variant="plate"
                icon="ticket"
                next
                onPress={() => router.push(`/evenement/${e.id}/billetterie`)}
                fullWidth
              >
                {`${e.title} · ${formatDayHour(e.startsAt)}`}
              </Button>
            ))
          )}
        </View>
      ) : null}

      {s && open === "verification" && verification.data ? (
        <View style={styles.panel} testID="panel-verification">
          <VerificationPanel
            key={`${verification.data.verification}-${verification.data.documents.length}`}
            structure={s}
            view={verification.data}
            onChanged={changedOnServer}
            onTwoFactor={bubble}
          />
        </View>
      ) : null}

      {s && open === "invite" && inviteUrl ? (
        <View style={styles.panel} testID="panel-invite">
          <Muted variant="caption">{L.inviteLinkIntro(s.name)}</Muted>
          <Plate kind="note">
            <Text variant="caption" color={t.color.plateInk} selectable testID="orga-invite-link">
              {inviteUrl}
            </Text>
          </Plate>
          <Button variant="plate" icon="share" onPress={() => void shareInvite()} fullWidth testID="orga-invite-share">
            {L.inviteLinkShare}
          </Button>
        </View>
      ) : null}

      {/* Lot 35d : « Demander l'aide d'Orasso », l'état de la demande et sa clôture (mode assistance, S41). */}
      {open === "help" ? (
        <View style={styles.panel} testID="panel-help">
          <AssistancePanel structureId={structureId} />
        </View>
      ) : null}

      {open !== null ? (
        <Button variant="plate" icon="up" onPress={() => setOpen(null)} fullWidth testID="tile-close">
          {L2.tileClose}
        </Button>
      ) : null}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space3 },
  grow: { flex: 1, gap: space1 },
  block: { gap: space2, padding: space3 },
  logoBlock: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  tile: { width: "48%", flexGrow: 1 },
  tilePlate: { gap: space1, padding: space3, minHeight: 104 },
  disabled: { opacity: 0.55 },
  panel: { gap: space2 },
});
