import {
  followByInviteSchema,
  followByQrSchema,
  followingListQuery,
  networkListQuery,
  pageQuery,
  peopleSearchQuery,
  peopleSuggestionsQuery,
} from "@orasso/shared";
import { Hono } from "hono";

import { rateLimit } from "../../lib/rateLimit";
import { type AppEnv, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
import { twoFactorOk } from "../messaging/core";
import { inboxService } from "../messaging/inbox";
import { accountQrFollow } from "./account-qr";
import { followsService } from "./follows";
import { outingsCount, socialProfile } from "./profile";
import { peopleSearch } from "./search";

// Lot R6b (D37) : plus de routes d'amitié (`/friends/...`, `/me/friends...`) : un seul lien, « Suivre ».
export const socialRoutes = new Hono<AppEnv>()
  // Recherche de personnes : déclarée avant `/users/:pseudo`.
  .get("/users/search", async (c) => {
    const v = await requireUser(c);
    rateLimit("peopleSearch", v.user.id);
    return c.json(await peopleSearch.search(v, query(c, peopleSearchQuery)));
  })
  // Lot R2 : suggestions de Personnes et crews (comptes publics seulement) ; déclarée avant `/users/:pseudo`.
  .get("/users/suggestions", async (c) => {
    const v = await requireUser(c);
    rateLimit("peopleSearch", v.user.id);
    const q = query(c, peopleSuggestionsQuery);
    const departments = [...(q.departments ?? []), ...(q.department ? [q.department] : [])];
    return c.json(await peopleSearch.suggestions(v, departments));
  })
  .get("/users/:pseudo", async (c) => {
    const v = await requireUser(c);
    return c.json(await socialProfile.view(v, c.req.param("pseudo")));
  })
  // Fiche d'un véhicule d'un autre : complète (compte public ou abonné accepté) ou réduite (compte privé, lot R4b :
  // `privateVehicleFields`). Jamais la plaque.
  .get("/vehicles/:id", async (c) => {
    const v = await requireUser(c);
    return c.json(await socialProfile.vehicleOf(v, uuidParam(c, "id")));
  })
  .get("/vehicles/:id/owners-nearby", async (c) => {
    const v = await requireUser(c);
    rateLimit("peopleSearch", v.user.id);
    return c.json(await peopleSearch.ownersNearby(v, uuidParam(c, "id"), query(c, pageQuery)));
  })
  // Lot R4c, R6b : suivre (compte public) ou demander à suivre (compte privé) ; ne plus suivre ou annuler la demande.
  .post("/users/:pseudo/follow", async (c) => {
    const v = await requireUser(c);
    return c.json(await followsService.follow(v, c.req.param("pseudo")));
  })
  .delete("/users/:pseudo/follow", async (c) => {
    const v = await requireUser(c);
    return c.json(await followsService.unfollow(v, c.req.param("pseudo")));
  })
  // Lot R6b : le QR de compte et le lien de profil (`/ami/:jeton`) servent à suivre la personne.
  .post("/follows/by-qr", async (c) => {
    const v = await requireUser(c);
    const { payload } = await body(c, followByQrSchema);
    return c.json(await accountQrFollow.byQr(v, payload));
  })
  .post("/follows/by-invite", async (c) => {
    const v = await requireUser(c);
    const { token } = await body(c, followByInviteSchema);
    return c.json(await accountQrFollow.byInvite(v, token));
  })
  // Lot R4c, R6b : le réseau, visible par soi seul (aucune route ne donne les listes d'un autre).
  .get("/me/network", async (c) => {
    const v = await requireUser(c);
    return c.json(await followsService.network(v, await outingsCount(v.user.id)));
  })
  .get("/me/followers", async (c) => {
    const v = await requireUser(c);
    const q = query(c, networkListQuery);
    return c.json(await followsService.followers(v, q.q, q.cursor));
  })
  .get("/me/following", async (c) => {
    const v = await requireUser(c);
    const q = query(c, followingListQuery);
    return c.json(await followsService.following(v, q.kind, q.q, q.cursor));
  })
  .get("/me/follow-requests", async (c) => {
    const v = await requireUser(c);
    const q = query(c, networkListQuery);
    return c.json(await followsService.requests(v, q.q, q.cursor));
  })
  .post("/me/follow-requests/:userId/accept", async (c) => {
    const v = await requireUser(c);
    return c.json(await followsService.acceptRequest(v, c.req.param("userId")));
  })
  .post("/me/follow-requests/:userId/decline", async (c) => {
    const v = await requireUser(c);
    await followsService.declineRequest(v, c.req.param("userId"));
    return c.body(null, 204);
  })
  // `GET /me/inbox/summary` : compté par la messagerie (lot 18), qui réunit messages et demandes de toutes sortes.
  .get("/me/inbox/summary", async (c) => {
    const v = await requireUser(c);
    return c.json(await inboxService.summary(v.user.id, { includeStructure: twoFactorOk(v.session?.secondFactor) }));
  });
