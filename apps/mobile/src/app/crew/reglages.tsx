// Réglages du crew (lot R5c2, maquette R5.7 : la longue liste « Modifier le crew » quitte la page) : nom, description,
// Instagram ; logo et bannière ; « Les membres peuvent proposer une sortie » (oui par défaut, décision de Damien du
// 26/10) ; retirer un membre ; dissoudre. Chef seulement. Mode B (en-tête de fiche). Paramètre : `crew` (son adresse).
import { Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  CREW_DESCRIPTION_MAX,
  CREW_NAME_MAX,
  type CrewView,
  crewErrors,
  crewLabels,
  crewPageLabels as L,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Platform, StyleSheet, View } from "react-native";

import { CrewBannerSheet } from "@/features/crews/page/CrewBannerSheet";
import { CrewSecHead, MemberRow, memberCaption } from "@/features/crews/page/parts";
import { api } from "@/lib/api";
import { pickAvatar } from "@/lib/avatar";
import { errorMessage } from "@/lib/http";
import { type PickedPhoto, pickPhotos } from "@/lib/photos";
import { useApi } from "@/lib/useApi";
import { SmButton } from "@/ui/Kit";
import { SegBlock } from "@/ui/KitTz";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

const { space2, space3 } = tokens.spacing;

function ask(message: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(message));
  return new Promise((resolve) =>
    Alert.alert(crewLabels.crew, message, [
      { text: "Annuler", style: "cancel", onPress: () => resolve(false) },
      { text: "Confirmer", style: "destructive", onPress: () => resolve(true) },
    ]),
  );
}

export default function CrewSettings() {
  const { t } = useTheme();
  const router = useRouter();
  const { crew: slug } = useLocalSearchParams<{ crew: string }>();
  const crew = useApi(() => api.crewBySlug(slug), [slug]);
  const v = crew.data;
  const leader = v?.viewerState === "leader" && !v.archived;
  const members = useApi(() => api.crewMembers(v?.id ?? ""), [v?.id, leader], { enabled: Boolean(v && leader) });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instagram, setInstagram] = useState("");
  const filled = useRef(false);
  const [banner, setBanner] = useState<PickedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const close = () => (router.canGoBack() ? router.back() : router.replace(`/crew/${slug}`));

  useEffect(() => {
    if (!v || filled.current) return;
    filled.current = true;
    setName(v.name);
    setDescription(v.description ?? "");
    setInstagram(v.instagram ? `@${v.instagram}` : "");
  }, [v]);

  async function run(action: () => Promise<CrewView | unknown>, done?: string) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const next = await action();
      if (next && typeof next === "object" && "viewerState" in next) crew.setData(next as CrewView);
      else await crew.reload();
      await members.reload();
      if (done) setOk(done);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!v || !leader) {
    return (
      <FlowScreen title={L.settingsTitle} onClose={close}>
        {crew.error ? (
          <Notice tone="error">{crew.error.message}</Notice>
        ) : v ? (
          <Notice tone="error">{crewErrors.leaderOnly}</Notice>
        ) : (
          <Muted variant="body">Chargement…</Muted>
        )}
      </FlowScreen>
    );
  }

  const others = (members.data ?? []).filter((m) => m.role !== "leader");

  return (
    <FlowScreen
      title={L.settingsTitle}
      facts={v.name}
      onClose={close}
      overlays={
        <CrewBannerSheet
          crewId={v.id}
          photo={banner}
          onClose={() => setBanner(null)}
          onDone={(next) => {
            setBanner(null);
            crew.setData(next);
            setOk(crewLabels.saved);
          }}
        />
      }
      footer={
        <View style={styles.footer}>
          {name.trim().length < 3 ? (
            <Muted variant="caption" testID="crew-settings-missing">
              {L.nameTooShort}
            </Muted>
          ) : null}
          <SmButton
            kind="p"
            big
            wide
            icon="check"
            disabled={busy || name.trim().length < 3}
            onPress={() =>
              void run(async () => {
                const next = await api.updateCrewSettings(v.id, {
                  name: name.trim(),
                  description: description.trim() || null,
                  instagram: instagram.trim() || null,
                });
                setInstagram(next.instagram ? `@${next.instagram}` : "");
                if (next.slug !== v.slug) router.setParams({ crew: next.slug });
                return next;
              }, L.saved)
            }
            testID="crew-settings-save"
          >
            {crewLabels.save}
          </SmButton>
        </View>
      }
    >
      {error ? <Notice tone="error">{error}</Notice> : null}
      {ok ? <Notice testID="crew-settings-ok">{ok}</Notice> : null}

      <CrewSecHead title={L.identityTitle} />
      <TextField
        label={crewLabels.name}
        value={name}
        onChangeText={setName}
        maxLength={CREW_NAME_MAX}
        testID="crew-settings-name"
      />
      <TextField
        label={crewLabels.description}
        value={description}
        onChangeText={setDescription}
        maxLength={CREW_DESCRIPTION_MAX}
        placeholder={crewLabels.descriptionPlaceholder}
        multiline
        testID="crew-settings-description"
      />
      <TextField
        label={L.instagram}
        value={instagram}
        onChangeText={setInstagram}
        placeholder={L.instagramPlaceholder}
        help={L.instagramHint}
        autoCapitalize="none"
        autoCorrect={false}
        testID="crew-settings-instagram"
      />

      <CrewSecHead title={L.imagesTitle} />
      <View style={styles.row}>
        <SmButton
          icon="gallery"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              const picked = await pickAvatar();
              if (!picked) return null;
              const form = new FormData();
              form.append("purpose", "crew_logo");
              if (Platform.OS === "web") {
                const blob = await (await fetch(picked.uri)).blob();
                form.append("file", new File([blob], "logo.jpg", { type: "image/jpeg" }));
              } else {
                form.append("file", { uri: picked.uri, name: "logo.jpg", type: "image/jpeg" } as unknown as Blob);
              }
              const { key } = await api.upload(form);
              return api.setCrewLogo(v.id, key);
            }, crewLabels.saved)
          }
        >
          {crewLabels.changeLogo}
        </SmButton>
        {v.logoUrl ? (
          <SmButton kind="g" icon="close" disabled={busy} onPress={() => void run(() => api.setCrewLogo(v.id, null))}>
            {crewLabels.removeLogo}
          </SmButton>
        ) : null}
      </View>
      <Text variant="caption" color={t.color.inkMuted}>
        {L.bannerHint}
      </Text>
      {v.bannerHiddenOutside ? <Notice tone="error">{L.bannerHidden}</Notice> : null}
      <View style={styles.row}>
        <SmButton
          icon="camera"
          disabled={busy}
          onPress={() =>
            void (async () => {
              const [picked] = await pickPhotos(1, [16, 9]);
              if (picked) setBanner(picked);
            })()
          }
          testID="crew-banner-change"
        >
          {L.changeBanner}
        </SmButton>
        {v.bannerUrl ? (
          <SmButton kind="g" icon="close" disabled={busy} onPress={() => void run(() => api.removeCrewBanner(v.id))}>
            {L.removeBanner}
          </SmButton>
        ) : null}
      </View>

      <CrewSecHead title={L.tabOutings} />
      <Text variant="bodyStrong" color={t.color.ink}>
        {L.outingsRight}
      </Text>
      <SegBlock<"yes" | "no">
        items={[
          { id: "yes", label: L.yes, testID: "crew-outings-right-yes" },
          { id: "no", label: L.no, testID: "crew-outings-right-no" },
        ]}
        value={v.space?.membersCanProposeOutings === false ? "no" : "yes"}
        onChange={(x) =>
          void run(() => api.updateCrewSettings(v.id, { membersCanProposeOutings: x === "yes" }), L.saved)
        }
        testID="crew-outings-right"
      />
      <Muted variant="caption">{L.outingsRightHint}</Muted>

      <CrewSecHead title={L.removeTitle} />
      {others.length === 0 ? <Muted variant="body">{L.removeEmpty}</Muted> : null}
      {others.map((m) => (
        <MemberRow
          key={m.userId}
          pseudo={m.pseudo}
          avatarUrl={m.avatarUrl}
          caption={memberCaption(m)}
          leader={false}
          testID="crew-settings-member"
          trailing={
            <SmButton
              kind="g"
              icon="close"
              disabled={busy}
              accessibilityLabel={L.removeMemberA11y(m.pseudo)}
              onPress={async () => {
                if (await ask(crewLabels.removeConfirm(m.pseudo))) void run(() => api.removeCrewMember(v.id, m.userId));
              }}
              testID="crew-settings-remove"
            />
          }
        />
      ))}

      <CrewSecHead title={L.dangerTitle} />
      <SmButton
        kind="s"
        icon="trash"
        disabled={busy}
        onPress={async () => {
          if (!(await ask(crewLabels.archiveConfirm))) return;
          void run(async () => {
            await api.archiveCrew(v.id);
            router.replace("/(tabs)/profil");
          });
        }}
        testID="crew-archive"
      >
        {crewLabels.archive}
      </SmButton>
      <Muted variant="caption">{crewLabels.leaderCannotLeave}</Muted>
      <View style={styles.end} />
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  end: { height: space3 },
  footer: { gap: space2 },
});
