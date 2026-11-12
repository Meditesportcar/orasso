// Casquette Pro, Publier : le compteur du mois (limite mensuelle), « Publier une offre » et « Publier » (qui ouvrent l'écran « Publier »
// réglé sur la fiche), les offres en cours puis « Anciennes offres » (les « offres et actualités » d'avant, modifiables et
// supprimables). Lot R9c : le formulaire de texte (titre + texte) a disparu, une offre est une publication avec l'étiquette « Offre ».
// Lot M7 : page masquée du groupe ouverte depuis Ma fiche, c'est un parcours : mode B (en-tête de fiche, ✕ revient à Ma
// fiche), sans barre d'onglets.
import { Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { authorKeyOf, proOffersLabels as O } from "@orasso/shared";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { OfferRows, useOffers } from "@/features/pages/PageOffers";
import { Posts } from "@/features/pro/Posts";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";
import { useCloseTo } from "@/ui/useCloseTo";

const { space2, space3 } = tokens.spacing;

export default function ProPublier() {
  const { t } = useTheme();
  const router = useRouter();
  // Lot M7, tour 2 : le ✕ revient à Ma fiche (le retour des onglets Pro mènerait au Scanner).
  const close = useCloseTo("/(pro)/fiche");
  const myPro = useApi(() => api.myPro(), [], { cacheKey: "my-pro" });
  const pro = myPro.data;
  const offers = useOffers(pro ? authorKeyOf("pro", pro.id) : null);

  // Au retour de « Publier » (une offre vient d'être publiée) : le compteur et les offres se relisent.
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      void myPro.reload();
      void offers.reload();
    }, [myPro.reload, offers.reload]),
  );

  // Pourquoi les boutons sont inertes (jamais un bouton principal grisé sans sa ligne) : fiche non publiée, limite atteinte.
  const blocked = !pro
    ? null
    : !pro.published
      ? O.blockedUnpublishedApp
      : pro.postsRemaining === 0
        ? "Limite du mois atteinte. Le compteur repart au 1er du mois prochain."
        : null;
  const open = (offer: boolean) =>
    pro &&
    router.push({ pathname: "/fil/publier", params: { fiche: pro.id, ...(offer ? { etiquette: "offre" } : {}) } });

  return (
    <FlowScreen
      title="Publier"
      facts={pro ? `${pro.postsUsed} / ${pro.postsLimit} ce mois-ci` : undefined}
      onClose={close}
    >
      {!pro ? (
        myPro.loading ? null : (
          <Notice>Tu n'as pas encore de fiche pro. Crée-la sur le site Orasso.</Notice>
        )
      ) : (
        <>
          {pro.published ? (
            <Plate style={styles.block}>
              <Text variant="label" color={t.color.plateMuted}>
                Publications ce mois-ci
              </Text>
              <Text variant="posterL" color={t.color.plateInk} testID="pro-posts-counter">
                {pro.postsUsed} / {pro.postsLimit}
              </Text>
              <Text variant="caption" color={t.color.plateMuted}>
                {O.followersLine(pro.followersCount)}
              </Text>
            </Plate>
          ) : null}
          {blocked ? <Notice>{blocked}</Notice> : null}
          <View style={styles.buttons}>
            <SmButton
              kind="p"
              big
              wide
              icon="ticket"
              disabled={blocked !== null}
              onPress={() => open(true)}
              testID="pro-publish-offer"
            >
              {O.publishOffer}
            </SmButton>
            <SmButton
              kind="s"
              big
              wide
              icon="gallery"
              disabled={blocked !== null}
              onPress={() => open(false)}
              testID="pro-publish"
            >
              Publier
            </SmButton>
          </View>
          <Muted variant="caption">{O.visibility}</Muted>
          <SectionTitle>{O.currentTitle}</SectionTitle>
          <OfferRows list={offers} />
          <Posts pro={pro} reload={myPro.reload} />
        </>
      )}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  buttons: { gap: space2 },
});
