// L'onglet « Page » en attendant la vraie Page (lot R9n, T21 ; R9b remplace le corps) : l'écran d'aujourd'hui de la casquette
// (Structure, Ma fiche, Vitrine, Contenus), rien ne se perd, plus la ligne « Mes casquettes » en bas. L'organisateur y trouve
// aussi l'Équipe, qui n'a plus d'onglet. Le pied est posé dans l'écran par `PageFooterProvider` : l'écran d'aujourd'hui n'est pas
// modifié, il montre le pied sous son contenu (`usePageFooter`, lu par `TabScreen`).
import { casquettesLabels as L, mediaAppLabels, orgaManageLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { ContentsScreen } from "@/features/media/ContentsScreen";
import { OrgaGate } from "@/features/orga/OrgaGate";
import { StructureScreen } from "@/features/orga/structure/StructureScreen";
import { FicheScreen } from "@/features/pro/FicheScreen";
import { HubRow, RowIcon } from "@/features/profil/parts";
import { VitrineScreen } from "@/features/provider/VitrineScreen";
import { PageFooterProvider } from "@/ui/pageFooter";
import { openCasquettes } from "./sheetStore";

type Kind = "organizer" | "pro" | "provider" | "media";

function Footer({ kind }: { kind: Kind }) {
  const router = useRouter();
  return (
    <View style={styles.footer} testID="page-footer">
      {kind === "organizer" ? (
        <HubRow
          lead={<RowIcon name="staff" />}
          title={L.pageTeamRow}
          caption={L.pageTeamCaption}
          onPress={() => router.navigate("/(orga)/equipe" as never)}
          testID="page-row-team"
        />
      ) : null}
      {kind === "media" ? (
        // Lot R9n : le profil média ne se modifiait que depuis la ligne rapide de l'ancien Profil de la casquette.
        <HubRow
          lead={<RowIcon name="profile" />}
          title={mediaAppLabels.casquetteEdit}
          caption={mediaAppLabels.casquetteEditCaption(null)}
          onPress={() => router.push("/media/modifier" as never)}
          testID="page-row-media-profile"
        />
      ) : null}
      <HubRow
        lead={<RowIcon name="profile" />}
        title={L.pageRow}
        caption={L.pageRowCaption}
        onPress={openCasquettes}
        testID="page-row-casquettes"
      />
    </View>
  );
}

function Body({ kind }: { kind: Kind }): ReactNode {
  switch (kind) {
    case "organizer":
      return (
        <OrgaGate title={orgaManageLabels.structureTitle}>
          <StructureScreen />
        </OrgaGate>
      );
    case "pro":
      return <FicheScreen />;
    case "provider":
      return <VitrineScreen />;
    case "media":
      return <ContentsScreen />;
  }
}

export function PageProvisoire({ kind }: { kind: Kind }) {
  return (
    <PageFooterProvider footer={<Footer kind={kind} />}>
      <Body kind={kind} />
    </PageFooterProvider>
  );
}

const styles = StyleSheet.create({ footer: { gap: 10, marginTop: 8 } });
