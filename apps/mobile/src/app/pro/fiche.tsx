// Casquette Pro, Fiche : l'état de ma fiche (publiée ou non, badge « pro vérifié »), mes remises par grade, mes
// partenaires et l'état de l'abonnement (« gratuit jusqu'au 21 juin 2027 »). Pas de prix ni de bouton de paiement dans
// l'appli : la fiche et l'abonnement se gèrent sur le site Orasso (espace pro).
import { Chip, ChipRow, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { gradeLabels, grades, proActivityLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/endpoints";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

export default function ProFiche() {
  const { t } = useTheme();
  const router = useRouter();
  const myPro = useApi(() => api.myPro(), [], { cacheKey: "my-pro" });
  const pro = myPro.data;
  const where = pro ? [pro.addressLine, [pro.postalCode, pro.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
  return (
    <FlowScreen
      title="Fiche"
      facts={pro?.name}
      onClose={() => router.replace("/accueil")}
      onRefresh={async () => {
        await myPro.reload();
      }}
    >
      {!pro ? (
        myPro.loading ? null : (
          <Notice>Tu n'as pas encore de fiche pro. Crée-la sur le site Orasso (menu Professionnels).</Notice>
        )
      ) : (
        <>
          <Plate style={styles.block}>
            <ChipRow>
              <Chip selected={pro.published}>{pro.published ? "Publiée" : "Brouillon"}</Chip>
              {pro.verifiedAt ? <Chip selected>Pro vérifié</Chip> : <Chip>SIRET à vérifier</Chip>}
            </ChipRow>
            <Text variant="posterL" color={t.color.plateInk}>
              {pro.name}
            </Text>
            <Text variant="meta" color={t.color.plateMuted}>
              {pro.activities.map((a) => proActivityLabels[a]).join(" · ")}
            </Text>
            <Text variant="body" color={t.color.plateInk}>
              {where || (pro.interventionDepartments.length ? `Intervient : ${pro.interventionDepartments.join(", ")}` : "Adresse à compléter")}
            </Text>
            <Text variant="caption" color={t.color.plateMuted}>
              {pro.followersCount} abonné{pro.followersCount > 1 ? "s" : ""}
            </Text>
          </Plate>

          <SectionTitle>Remises par grade</SectionTitle>
          <Plate style={styles.block}>
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
          </Plate>

          {pro.partners.length > 0 ? (
            <>
              <SectionTitle>Organisateurs partenaires</SectionTitle>
              <ChipRow>
                {pro.partners.map((s) => (
                  <Chip key={s.slug}>{s.name}</Chip>
                ))}
              </ChipRow>
            </>
          ) : null}

          <SectionTitle>Abonnement</SectionTitle>
          <Plate style={styles.block}>
            <Text variant="bodyStrong" color={t.color.plateInk} testID="pro-subscription">
              {pro.subscription.label}
            </Text>
            <Text variant="caption" color={t.color.plateMuted}>
              Aucun paiement dans l'appli. L'abonnement se gère sur le site Orasso, dans l'espace pro.
            </Text>
          </Plate>
          <Muted variant="caption">
            Pour modifier ta fiche, tes photos, tes remises ou ton SIRET, ouvre ton espace pro sur le site Orasso.
          </Muted>
        </>
      )}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: space1 },
});
