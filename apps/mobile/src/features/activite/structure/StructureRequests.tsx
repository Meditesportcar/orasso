// Les demandes de la structure (lot R9d), sous la ligne « Demandes · N » de son Activité : les demandes pour rejoindre le staff
// (« Accepter » / « Refuser » : `/structures/:id/members/:userId/accept|decline`) et les invitations à publier adressées à la
// structure (la carte de collaboration du registre `requests/*`, qui répond par `/me/feed-coauthor-requests/:postId/…`).
import type { RequestItem } from "@orasso/shared";
import { orgaLabels, structureActivityLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";

import { RequestCard } from "../RequestCard";
import { requestCards } from "../requests";
import { fromOf } from "../requests/types";

function StaffAskCard({ structureId, item, onDone }: { structureId: string; item: RequestItem; onDone: () => void }) {
  const router = useRouter();
  const { name, imageUrl } = fromOf(item);
  return (
    <RequestCard
      testID="structure-request-staff"
      avatarUrl={imageUrl}
      pseudo={name}
      title={`${orgaLabels.staffRequestsTitle} · ${name}`}
      detail={structureActivityLabels.staffAsks}
      onOpenProfile={() => router.push(`/u/${encodeURIComponent(name)}`)}
      onAccept={async () => {
        await api.acceptStaffRequest(structureId, item.id);
        onDone();
      }}
      onDecline={async () => {
        await api.declineStaffRequest(structureId, item.id);
        onDone();
      }}
    />
  );
}

export function StructureRequests({
  structureId,
  items,
  onDone,
}: {
  structureId: string;
  items: RequestItem[];
  onDone: () => void;
}) {
  return (
    <View style={styles.list} testID="structure-requests">
      {items.map((item) => {
        if (item.kind === "staff") {
          return <StaffAskCard key={`staff:${item.id}`} structureId={structureId} item={item} onDone={onDone} />;
        }
        const Card = requestCards[item.kind];
        // Une sorte sans carte n'est pas affichée (jamais d'écran cassé).
        return Card ? <Card key={`${item.kind}:${item.id}`} item={item} onDone={onDone} /> : null;
      })}
    </View>
  );
}

const styles = StyleSheet.create({ list: { gap: 12 } });
