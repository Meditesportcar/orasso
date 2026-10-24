import {
  followingListQuery,
  friendRequestByInviteSchema,
  friendRequestByQrSchema,
  friendRequestCreateSchema,
  friendsListQuery,
  networkListQuery,
  pageQuery,
  peopleSearchQuery,
  peopleSuggestionsQuery,
} from "@orasso/shared";
import { Hono } from "hono";

import { rateLimit } from "../../lib/rateLimit";
import { type AppEnv, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
import { followsService } from "./follows";
import { friendsService } from "./friends";
import { socialProfile } from "./profile";
import { peopleSearch } from "./search";

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
  // Fiche d'un véhicule d'un autre : complète (compte public ou ami) ou marque + modèle (compte privé). Jamais la plaque.
  .get("/vehicles/:id", async (c) => {
    const v = await requireUser(c);
    return c.json(await socialProfile.vehicleOf(v, uuidParam(c, "id")));
  })
  .get("/vehicles/:id/owners-nearby", async (c) => {
    const v = await requireUser(c);
    rateLimit("peopleSearch", v.user.id);
    return c.json(await peopleSearch.ownersNearby(v, uuidParam(c, "id"), query(c, pageQuery)));
  })
  // Lot R4c : suivre une personne (compte public seulement), sans acceptation.
  .post("/users/:pseudo/follow", async (c) => {
    const v = await requireUser(c);
    return c.json(await followsService.follow(v, c.req.param("pseudo")));
  })
  .delete("/users/:pseudo/follow", async (c) => {
    const v = await requireUser(c);
    return c.json(await followsService.unfollow(v, c.req.param("pseudo")));
  })
  // Lot R4c : le réseau, visible par soi seul (aucune route ne donne les listes d'un autre).
  .get("/me/network", async (c) => c.json(await followsService.network(await requireUser(c))))
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
  .get("/me/friends", async (c) => {
    const v = await requireUser(c);
    return c.json(await friendsService.list(v, query(c, networkListQuery).q));
  })
  .get("/me/friends/requests", async (c) => {
    const v = await requireUser(c);
    return c.json(await friendsService.requests(v, query(c, friendsListQuery).direction));
  })
  .get("/me/inbox/summary", async (c) => c.json(await friendsService.inboxSummary(await requireUser(c))))
  .post("/friends/requests", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, friendRequestCreateSchema);
    return c.json(await friendsService.requestByPseudo(v, input), 201);
  })
  .post("/friends/requests/by-qr", async (c) => {
    const v = await requireUser(c);
    const { payload } = await body(c, friendRequestByQrSchema);
    return c.json(await friendsService.requestByQr(v, payload), 201);
  })
  .post("/friends/requests/by-invite", async (c) => {
    const v = await requireUser(c);
    const { token } = await body(c, friendRequestByInviteSchema);
    return c.json(await friendsService.requestByInvite(v, token), 201);
  })
  .post("/friends/requests/:id/accept", async (c) => {
    const v = await requireUser(c);
    return c.json(await friendsService.acceptRequest(v, uuidParam(c, "id")));
  })
  .post("/friends/requests/:id/decline", async (c) => {
    const v = await requireUser(c);
    await friendsService.declineRequest(v, uuidParam(c, "id"));
    return c.body(null, 204);
  })
  .delete("/friends/:userId", async (c) => {
    const v = await requireUser(c);
    await friendsService.remove(v, c.req.param("userId"));
    return c.body(null, 204);
  });
