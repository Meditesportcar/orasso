// Casquette Pro, Fiche : l'état de ma fiche et tout ce qui se règle (lot 35c, D20) : modification de la fiche, publication,
// SIRET, remises par grade, logo et photos, organisateurs partenaires. L'abonnement et les emplacements sponsorisés se
// consultent seulement : aucun prix ni bouton de paiement dans l'appli, la souscription se fait sur le site Orasso.
import { Button, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { proAppLabels as L, proActivityLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { StyleSheet } from "react-native";

import {
  DiscountsBlock,
  MediaBlock,
  PartnersBlock,
  ProChips,
  PublicationBlock,
  SiretBlock,
  SubscriptionBlock,
} from "@/features/pro/ProBlocks";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";

const { space2, space3 } = tokens.spacing;

export default function ProFiche() {
  const { t } = useTheme();
  const router = useRouter();
  const myPro = useApi(() => api.myPro(), [], { cacheKey: "my-pro" });
  const pro = myPro.data;
  const reload = () => myPro.reload();
  const where = pro
    ? [pro.addressLine, [pro.postalCode, pro.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : "";
  return (
    <TabScreen
      title="Fiche"
      facts={pro?.name}
      onRefresh={async () => {
        await myPro.reload();
      }}
    >
      {!pro ? (
        myPro.loading ? null : (
          <Notice>{L.noPro}</Notice>
        )
      ) : (
        <>
          {/* Copie en cache d'avant le lot 21 : pas de `visibility`. */}
          {pro.visibility?.banner ? <Notice>{pro.visibility.banner}</Notice> : null}
          <Plate style={styles.block}>
            <ProChips pro={pro} />
            <Text variant="posterL" color={t.color.plateInk}>
              {pro.name}
            </Text>
            <Text variant="meta" color={t.color.plateMuted}>
              {pro.activities.map((a) => proActivityLabels[a]).join(" · ")}
            </Text>
            <Text variant="body" color={t.color.plateInk}>
              {where ||
                (pro.interventionDepartments.length
                  ? `Intervient : ${pro.interventionDepartments.join(", ")}`
                  : "Adresse à compléter")}
            </Text>
            <Text variant="caption" color={t.color.plateMuted}>
              {pro.followersCount} abonné{pro.followersCount > 1 ? "s" : ""}
            </Text>
          </Plate>
          <Button variant="primary" icon="profile" onPress={() => router.push("/modifier")} fullWidth testID="pro-edit">
            {L.editFiche}
          </Button>

          <PublicationBlock pro={pro} reload={reload} />
          <SiretBlock pro={pro} reload={reload} />
          <DiscountsBlock pro={pro} reload={reload} />
          <MediaBlock pro={pro} reload={reload} />
          <PartnersBlock pro={pro} reload={reload} />
          <SubscriptionBlock pro={pro} />
        </>
      )}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
});
