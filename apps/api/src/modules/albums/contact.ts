// « Contacter <média> » depuis « Tes photos » (lot R9f, partie 2) : la conversation s'ouvre avec le titulaire de la page du média, **sans que
// le compte derrière la page soit jamais servi** (l'album ne porte que la clé `m:<id>` du média). Mêmes règles que n'importe quel message
// direct (`messagingService.openDirect`) : conversation déjà ouverte, ou la personne me suit ; sinon `409 not_friends` (le titulaire ne
// reçoit pas de message d'un inconnu : la demande de contact demanderait son pseudo, qu'on ne donne pas).
import type { OpenConversationResult } from "@orasso/shared";

import { db } from "../../db/client";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { messagingService } from "../messaging/service";
import { visibleAlbum } from "./tag-visibility";

export const albumContact = {
  async openWithMedia(v: Viewer, albumId: string): Promise<OpenConversationResult> {
    rateLimit("conversationOpen", v.user.id);
    const join = await visibleAlbum(db, v, albumId);
    return messagingService.openDirect(v, join.m.userId);
  },
};
