// Casquette Pro, fiche (lot 35c, D20) : publication, SIRET, remises, logo et photos, partenaires, et la consultation de
// l'abonnement. Mêmes routes et mêmes phrases que l'espace pro du site. Aucun paiement dans l'appli : l'abonnement et les
// emplacements sponsorisés se consultent ici, ils se souscrivent sur le site (règles des stores : voir
// docs/JOURNAL-DES-CHOIX.md, « À revoir avec Damien »).
import {
  Button,
  Chip,
  ChipRow,
  Photo,
  Plate,
  SelectField,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import {
  gradeLabels,
  grades,
  proAppLabels as L,
  PRO_DISCOUNT_MAX_PERCENT,
  PRO_MAX_PHOTOS,
  type ProOwner,
} from "@orasso/shared";
import { useEffect, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { siteUrl } from "@/api";
import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { api } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { mediaSource } from "@/lib/media";
import { photoForm, pickPhotos } from "@/lib/photos";
import { type DiscountTexts, discountsBody, discountTexts, partnerChoices, siretDigits } from "@/lib/proForm";
import { useApi } from "@/lib/useApi";
import { useRun } from "@/lib/useRun";
import { AppSheet } from "@/ui/AppSheet";
import { Feedback } from "@/ui/Feedback";
import { Muted } from "@/ui/Muted";
import { Overlay } from "@/ui/Overlay";
import { SectionTitle } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

type BlockProps = { pro: ProOwner; reload: () => Promise<unknown> };

// --- Publication -------------------------------------------------------------------------------------------------

export function PublicationBlock({ pro, reload }: BlockProps) {
  const { t } = useTheme();
  const { busy, error, notice, run, clear } = useRun();
  const [confirm, setConfirm] = useState(false);

  const set = (published: boolean) =>
    run(
      "publish",
      async () => {
        await api.setProPublished(pro.id, published);
        await reload();
      },
      published ? L.nowPublished : L.nowDraft,
    );

  return (
    <>
      <SectionTitle>{L.publicationTitle}</SectionTitle>
      <Plate style={styles.block} testID="pro-publish">
        <Text variant="body" color={t.color.plateInk}>
          {pro.published ? L.publishedText : (pro.publishBlockedReason ?? L.draftText)}
        </Text>
        <Feedback error={confirm ? null : error} notice={notice} testID="pro-publish-notice" />
        {pro.published ? (
          <Button
            variant="plate"
            icon="undo"
            disabled={busy !== null}
            onPress={() => {
              clear();
              setConfirm(true);
            }}
            fullWidth
            testID="pro-unpublish"
          >
            {L.unpublish}
          </Button>
        ) : (
          <Button
            variant="secondary"
            icon="check"
            loading={busy === "publish"}
            disabled={!pro.canPublish}
            onPress={() => void set(true)}
            fullWidth
            testID="pro-publish-button"
          >
            {L.publish}
          </Button>
        )}
      </Plate>
      <Overlay>
        <ConfirmSheet
          visible={confirm}
          title={L.unpublishTitle}
          body={L.unpublishBody}
          confirmLabel={L.unpublish}
          confirmIcon="undo"
          busy={busy === "publish"}
          error={confirm ? error : null}
          onConfirm={() => void set(false).then((ok) => ok && setConfirm(false))}
          onClose={() => {
            setConfirm(false);
            clear();
          }}
        />
      </Overlay>
    </>
  );
}

// --- SIRET -------------------------------------------------------------------------------------------------------

export function SiretBlock({ pro, reload }: BlockProps) {
  const { t } = useTheme();
  const { busy, error, notice, run, setNotice } = useRun();
  const [number, setNumber] = useState(pro.siret ?? "");
  const check = pro.registryCheck;

  async function checkSiret() {
    let verified = false;
    const ok = await run("siret", async () => {
      const fresh = await api.checkProSiret(pro.id, siretDigits(number));
      verified = Boolean(fresh.verifiedAt);
      await reload();
    });
    // Vérifié : le badge apparaît ; sinon c'est le résultat du registre (introuvable, fermé…) qui s'affiche dessous.
    if (ok) setNotice(verified ? L.siretDone : null);
  }

  const registryText =
    check && !pro.verifiedAt
      ? check.status === "closed"
        ? L.siretClosed
        : check.status === "not_found"
          ? L.siretNotFound
          : check.status === "unavailable"
            ? L.siretUnavailable
            : L.siretChecked
      : null;

  return (
    <>
      <SectionTitle>{L.siretTitle}</SectionTitle>
      <Plate style={styles.block} testID="pro-siret">
        {pro.verifiedAt ? (
          <Text variant="body" color={t.color.plateInk}>
            {L.siretVerified(pro.siret ?? "", formatDay(pro.verifiedAt))}
          </Text>
        ) : (
          <Text variant="caption" color={t.color.plateMuted}>
            {L.siretHelp}
          </Text>
        )}
        <TextField
          label={L.siretLabel}
          value={number}
          onChangeText={setNumber}
          keyboardType="number-pad"
          maxLength={20}
          testID="pro-siret-field"
        />
        <Feedback error={error} notice={notice} testID="pro-siret-notice" />
        {registryText && !notice ? (
          <Text variant="caption" color={t.color.plateMuted} testID="pro-siret-result">
            {registryText}
          </Text>
        ) : null}
        <Button
          variant="plate"
          icon="check"
          loading={busy === "siret"}
          disabled={siretDigits(number).length < 9}
          onPress={() => void checkSiret()}
          fullWidth
          testID="pro-siret-check"
        >
          {pro.verifiedAt ? L.siretRecheck : L.siretCheck}
        </Button>
      </Plate>
    </>
  );
}

// --- Remises par grade -------------------------------------------------------------------------------------------

export function DiscountsBlock({ pro, reload }: BlockProps) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);
  const [texts, setTexts] = useState<DiscountTexts>(() => discountTexts(pro.discounts));
  const { busy, error, notice, run, setError, clear } = useRun();

  useEffect(() => {
    if (!open) setTexts(discountTexts(pro.discounts));
  }, [open, pro.discounts]);

  async function save() {
    const parsed = discountsBody(texts);
    if ("error" in parsed) return setError(parsed.error);
    const ok = await run(
      "discounts",
      async () => {
        await api.setProDiscounts(pro.id, parsed.body);
        await reload();
      },
      L.discountsSaved,
    );
    if (ok) setOpen(false);
  }

  return (
    <>
      <SectionTitle>{L.discountsTitle}</SectionTitle>
      <Plate style={styles.block} testID="pro-discounts">
        {grades.map((g) => (
          <View key={g} style={styles.row}>
            <Text variant="body" color={t.color.plateInk}>
              {gradeLabels[g]}
            </Text>
            <Text variant="bodyStrong" color={t.color.plateInk}>
              {pro.discounts[g] ? `−${pro.discounts[g]} %` : "—"}
            </Text>
          </View>
        ))}
        <Feedback notice={open ? null : notice} testID="pro-discounts-notice" />
        <Button
          variant="plate"
          icon="grade"
          onPress={() => {
            clear();
            setOpen(true);
          }}
          fullWidth
          testID="pro-discounts-edit"
        >
          {L.discountsEdit}
        </Button>
      </Plate>
      <Overlay>
        <AppSheet visible={open} onClose={() => setOpen(false)} accessibilityLabel={L.discountsTitle}>
          <Text variant="title" color={t.color.ink}>
            {L.discountsTitle}
          </Text>
          <Text variant="body" color={t.color.ink}>
            {L.discountsHelp(PRO_DISCOUNT_MAX_PERCENT)}
          </Text>
          {grades.map((g) => (
            <TextField
              key={g}
              label={L.discountField(gradeLabels[g])}
              value={texts[g]}
              onChangeText={(value) => setTexts((x) => ({ ...x, [g]: value }))}
              keyboardType="number-pad"
              placeholder={L.none}
              maxLength={3}
            />
          ))}
          <Feedback error={error} onPlate={false} />
          <Button
            variant="secondary"
            icon="check"
            loading={busy === "discounts"}
            onPress={() => void save()}
            fullWidth
            testID="pro-discounts-save"
          >
            {L.discountsSave}
          </Button>
          <Button variant="plate" icon="close" onPress={() => setOpen(false)} fullWidth>
            Annuler
          </Button>
        </AppSheet>
      </Overlay>
    </>
  );
}

// --- Logo et photos ----------------------------------------------------------------------------------------------

export function MediaBlock({ pro, reload }: BlockProps) {
  const { busy, error, notice, run } = useRun();

  const changeLogo = () =>
    run(
      "logo",
      async () => {
        const [picked] = await pickPhotos(1);
        if (!picked) return;
        await api.uploadProLogo(pro.id, await photoForm(picked, 0, "logo"));
        await reload();
      },
      L.logoSaved,
    );

  const addPhotos = () =>
    run(
      "photo",
      async () => {
        const picked = await pickPhotos(PRO_MAX_PHOTOS - pro.photos.length);
        for (const [i, photo] of picked.entries()) await api.addProPhoto(pro.id, await photoForm(photo, i));
        await reload();
      },
      L.photoAdded,
    );

  return (
    <>
      <SectionTitle>{L.logoTitle}</SectionTitle>
      <Plate style={styles.block} testID="pro-logo">
        <View style={styles.logoRow}>
          {pro.logoUrl ? (
            <Photo source={mediaSource(pro.logoUrl)} style={styles.logo} accessibilityLabel="Logo" />
          ) : null}
          <Button
            variant="plate"
            icon="add"
            loading={busy === "logo"}
            disabled={busy !== null}
            onPress={() => void changeLogo()}
            testID="pro-logo-change"
          >
            {L.logoChange}
          </Button>
        </View>
      </Plate>

      <SectionTitle>{`${L.photosTitle} · ${pro.photos.length} / ${PRO_MAX_PHOTOS}`}</SectionTitle>
      {pro.photos.length > 0 ? (
        <View style={styles.photos} testID="pro-photos">
          {pro.photos.map((p, i) => (
            <View key={p.id}>
              <Photo source={mediaSource(p.url)} style={styles.photo} accessibilityLabel={`Réalisation ${i + 1}`} />
              <View style={styles.remove}>
                <Button
                  variant="close"
                  label={L.photoRemove}
                  onPhoto
                  disabled={busy !== null}
                  onPress={() =>
                    void run(
                      "remove",
                      async () => {
                        await api.removeProPhoto(pro.id, p.id);
                        await reload();
                      },
                      L.photoRemoved,
                    )
                  }
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}
      {pro.photos.length < PRO_MAX_PHOTOS ? (
        <Button
          variant="secondary"
          icon="add"
          loading={busy === "photo"}
          disabled={busy !== null}
          onPress={() => void addPhotos()}
          fullWidth
          testID="pro-photo-add"
        >
          {L.photoAdd}
        </Button>
      ) : (
        <Muted variant="caption">{L.photosMax(PRO_MAX_PHOTOS)}</Muted>
      )}
      <Feedback error={error} notice={notice} onPlate={false} testID="pro-media-notice" />
    </>
  );
}

// --- Partenaires -------------------------------------------------------------------------------------------------

export function PartnersBlock({ pro, reload }: BlockProps) {
  const { t } = useTheme();
  const { busy, error, notice, run, clear } = useRun();
  const structures = useApi(() => api.verifiedStructures(), [], { cacheKey: "structures.verified" });
  const [slug, setSlug] = useState<string | undefined>();
  const [removing, setRemoving] = useState<{ slug: string; name: string } | null>(null);
  const choices = partnerChoices(
    structures.data?.items ?? [],
    pro.partnerLinks.map((l) => l.structureSlug),
  );

  return (
    <>
      <SectionTitle>{L.partnersTitle}</SectionTitle>
      <Plate style={styles.block} testID="pro-partners">
        <Text variant="caption" color={t.color.plateMuted}>
          {L.partnersHelp}
        </Text>
        {pro.partnerLinks.map((l) => (
          <View key={l.structureSlug} style={styles.partner}>
            <View style={styles.partnerName}>
              <Text variant="bodyStrong" color={t.color.plateInk}>
                {l.structureName}
              </Text>
              <Text variant="meta" color={t.color.plateMuted}>
                {l.status === "accepted" ? L.partnerPartner : L.partnerPending}
              </Text>
            </View>
            <Button
              variant="plate"
              tone="dashed"
              icon="close"
              disabled={busy !== null}
              onPress={() => {
                clear();
                setRemoving({ slug: l.structureSlug, name: l.structureName });
              }}
              testID={`pro-partner-remove-${l.structureSlug}`}
            >
              {L.partnerRemove}
            </Button>
          </View>
        ))}
        {choices.length > 0 ? (
          <>
            <SelectField
              label={L.partnerChoose}
              options={choices.map((s) => ({ value: s.slug, label: s.name }))}
              value={slug}
              onValueChange={setSlug}
              placeholder="—"
            />
            <Button
              variant="plate"
              icon="add"
              loading={busy === "propose"}
              disabled={!slug || busy !== null}
              onPress={() =>
                slug &&
                void run(
                  "propose",
                  async () => {
                    await api.requestProPartner(pro.id, slug);
                    setSlug(undefined);
                    await reload();
                  },
                  L.partnerSent,
                )
              }
              fullWidth
              testID="pro-partner-propose"
            >
              {L.partnerPropose}
            </Button>
          </>
        ) : null}
        <Feedback error={removing ? null : error} notice={notice} testID="pro-partners-notice" />
      </Plate>
      <Overlay>
        <ConfirmSheet
          visible={removing !== null}
          title={L.partnerRemoveTitle}
          body={removing ? `${removing.name} : ${L.partnerRemoveBody}` : L.partnerRemoveBody}
          confirmLabel={L.partnerRemove}
          confirmIcon="close"
          danger
          busy={busy === "remove"}
          error={removing ? error : null}
          onConfirm={() =>
            removing &&
            void run(
              "remove",
              async () => {
                await api.removeProPartner(pro.id, removing.slug);
                await reload();
              },
              L.partnerRemoved,
            ).then((ok) => ok && setRemoving(null))
          }
          onClose={() => {
            setRemoving(null);
            clear();
          }}
        />
      </Overlay>
    </>
  );
}

// --- Abonnement et emplacements sponsorisés : consultation -------------------------------------------------------

export function SubscriptionBlock({ pro }: { pro: ProOwner }) {
  const { t } = useTheme();
  return (
    <>
      <SectionTitle>{L.subscriptionTitle}</SectionTitle>
      <Plate style={styles.block}>
        <Text variant="bodyStrong" color={t.color.plateInk} testID="pro-subscription">
          {pro.subscription.label}
        </Text>
        <Text variant="caption" color={t.color.plateMuted}>
          {L.subscriptionNoPayment}
        </Text>
        <Button
          variant="plate"
          icon="export"
          onPress={() => void Linking.openURL(siteUrl(`/pro/${pro.slug}/abonnement`)).catch(() => undefined)}
          fullWidth
          testID="pro-subscription-site"
        >
          {L.subscriptionOpen}
        </Button>
      </Plate>
      <SectionTitle>{L.sponsoredTitle}</SectionTitle>
      <Plate style={styles.block} testID="pro-sponsored">
        <Text variant="caption" color={t.color.plateMuted}>
          {L.sponsoredText}
        </Text>
      </Plate>
      <Button
        variant="plate"
        icon="export"
        onPress={() => void Linking.openURL(siteUrl(`/pro/${pro.slug}`)).catch(() => undefined)}
        fullWidth
        testID="pro-open-site"
      >
        {L.openSite}
      </Button>
    </>
  );
}

/** Pastille d'état de la fiche (publiée ou brouillon, badge de vérification). */
export function ProChips({ pro }: { pro: ProOwner }) {
  return (
    <ChipRow>
      <Chip selected={pro.published}>{pro.published ? L.published : L.draft}</Chip>
      {pro.verifiedAt ? <Chip selected>{L.verified}</Chip> : <Chip>{L.toVerify}</Chip>}
    </ChipRow>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: space1 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: space3 },
  logo: { width: 72, height: 72, borderRadius: tokens.radius.radiusSm },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  photo: { width: 160, height: 120, borderRadius: tokens.radius.radiusSm },
  remove: { position: "absolute", top: space1, right: space1 },
  partner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space2 },
  partnerName: { flex: 1, gap: 2 },
});
