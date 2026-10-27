// Lot R6b (D37, maquette R6.1 et R6.2) : le bouton unique « Suivre » de l'appli, à la place de l'amitié. Selon
// `followButtonKind` : Suivre / Suivre en retour / Demander à suivre (principal sur le profil), Abonné / Demandé
// (secondaire ; toucher demande une confirmation avant « Ne plus suivre » ou « Annuler la demande »).
// `full` : le bouton pleine largeur du profil (confirmation en place). `small` : le bouton compact d'une ligne de liste
// (confirmation dans une feuille, posée dans la zone des feuilles de l'écran).
import { Button, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type FollowButtonKind,
  type FollowState,
  followButtonKind,
  networkLabels as N,
  type PersonCard,
  type ProfileVisibility,
} from "@orasso/shared";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";
import { SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { Overlay } from "@/ui/Overlay";

const { space2, space3 } = tokens.spacing;
const { radiusMd } = tokens.radius;

const SMALL_TEST_ID: Record<FollowButtonKind, string> = {
  follow: "net-follow",
  follow_back: "net-follow-back",
  request: "net-follow",
  following: "net-followed",
  requested: "net-requested",
};

const LABEL: Record<FollowButtonKind, string> = {
  follow: N.follow,
  follow_back: N.followBack,
  request: N.request,
  following: N.followed,
  requested: N.requested,
};

/** Principal pour s'abonner, secondaire pour un état déjà posé. */
const isAction = (k: FollowButtonKind) => k === "follow" || k === "follow_back" || k === "request";

/** « Ne plus suivre X ? » / « Annuler ta demande à X ? » : les deux boutons et, pour un compte privé, la précision. */
function ConfirmContent({
  pseudo,
  cancel,
  privateAccount,
  busy,
  error,
  onConfirm,
  onKeep,
}: {
  pseudo: string;
  /** Vrai : on annule une demande (sinon on ne suit plus). */
  cancel: boolean;
  privateAccount: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onKeep: () => void;
}) {
  const { t } = useTheme();
  return (
    <View style={styles.confirmBody}>
      <Text variant="bodyStrong" color={t.color.ink}>
        {cancel ? N.cancelRequestConfirm(pseudo) : N.unfollowConfirm(pseudo)}
      </Text>
      {!cancel && privateAccount ? <Muted variant="caption">{N.unfollowPrivateHint}</Muted> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button variant="alert" icon="close" loading={busy} onPress={onConfirm} fullWidth testID="follow-confirm-yes">
        {cancel ? N.cancelRequest : N.unfollow}
      </Button>
      <Button variant="secondary" icon="back" onPress={onKeep} fullWidth testID="follow-confirm-keep">
        {N.keep}
      </Button>
    </View>
  );
}

/**
 * Une carte de personne (recherche, propriétaires près de chez moi) ne dit pas si le compte est privé : ses départements
 * sont absents d'un compte privé dont on n'est pas abonné accepté. Sert seulement à choisir « Suivre » ou « Demander à
 * suivre » ; l'API tranche.
 */
export function cardVisibility(person: Pick<PersonCard, "departments" | "follow">): ProfileVisibility {
  return person.departments === null && person.follow.mine !== "accepted" ? "private" : "public";
}

export function FollowButton({
  pseudo,
  mine,
  followsMe,
  canFollow,
  visibility,
  size = "full",
  inert = false,
  onChanged,
  testIDFor,
}: {
  pseudo: string;
  mine: FollowState;
  followsMe: boolean;
  canFollow: boolean;
  visibility: ProfileVisibility;
  size?: "full" | "small";
  /** Aperçu : le bouton ne fait rien. */
  inert?: boolean;
  /** Après suivre, demander, ne plus suivre, annuler : mon nouvel état. */
  onChanged?: (mine: FollowState) => void;
  /** Surcharge des identifiants de test d'une liste (`small`). */
  testIDFor?: (kind: FollowButtonKind) => string;
}) {
  const { t } = useTheme();
  const [state, setState] = useState<FollowState>(mine);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // La lecture suivante (retour sur l'écran, rechargement) reprend la main sur l'état local.
  useEffect(() => setState(mine), [mine]);

  const kind = followButtonKind({ canFollow, mine: state, followsMe, visibility });
  if (!kind) return null;

  async function run(action: () => Promise<{ mine: FollowState }>) {
    setBusy(true);
    setError(null);
    try {
      const res = await action();
      setState(res.mine);
      setConfirming(false);
      onChanged?.(res.mine);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const onPress = () => {
    if (inert) return;
    if (isAction(kind)) void run(() => api.follow(pseudo));
    else setConfirming(true);
  };
  const cancel = kind === "requested";
  const confirm = (
    <ConfirmContent
      pseudo={pseudo}
      cancel={cancel}
      privateAccount={visibility === "private"}
      busy={busy}
      error={error}
      onConfirm={() => void run(() => api.unfollow(pseudo))}
      onKeep={() => {
        setConfirming(false);
        setError(null);
      }}
    />
  );

  if (size === "small") {
    return (
      <>
        <SmButton
          kind="s"
          icon={kind === "requested" ? "wait" : isAction(kind) ? "add" : "check"}
          disabled={busy}
          accessibilityLabel={`${LABEL[kind]} ${pseudo}`}
          testID={(testIDFor ?? ((k) => SMALL_TEST_ID[k]))(kind)}
          onPress={onPress}
        >
          {LABEL[kind]}
        </SmButton>
        {confirming ? (
          <Overlay>
            <AppSheet
              visible
              onClose={() => setConfirming(false)}
              accessibilityLabel={cancel ? N.cancelRequestConfirm(pseudo) : N.unfollowConfirm(pseudo)}
            >
              <View testID="follow-confirm">{confirm}</View>
            </AppSheet>
          </Overlay>
        ) : null}
        {!confirming && error ? <Notice tone="error">{error}</Notice> : null}
      </>
    );
  }

  return (
    <View style={styles.full}>
      {confirming ? (
        <View style={[styles.confirm, { backgroundColor: t.color.surface }]} testID="follow-confirm">
          {confirm}
        </View>
      ) : (
        <Button
          variant={isAction(kind) ? "primary" : "secondary"}
          icon={kind === "requested" ? "wait" : isAction(kind) ? "add" : "check"}
          loading={busy}
          fullWidth
          accessibilityLabel={`${LABEL[kind]} ${pseudo}`}
          onPress={onPress}
          testID="follow-button"
        >
          {LABEL[kind]}
        </Button>
      )}
      {!confirming && error ? <Notice tone="error">{error}</Notice> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  full: { gap: space2 },
  confirm: { borderRadius: radiusMd, padding: space3 },
  confirmBody: { gap: space2 },
});
