// Routes des abonnements d'une casquette (vague R9, lot R9a). `PUT|DELETE /me/page-follows/:targetKey` : l'acteur est lu
// par `writeActor` (en-tête `X-Orasso-Actor`, second facteur d'une structure compris) ; sans en-tête, c'est moi, et la cible
// ne peut être qu'un prestataire (`v:`) ou un média (`m:`) ; pour une personne, une structure ou un pro, ce sont les routes
// existantes. Réponse `{ following, followersCount }`.
import { Hono } from "hono";

import { noStore, writeActor } from "../../lib/actor";
import { type AppEnv, requireUser } from "../../lib/session";
import { pageFollowsService } from "./pageFollows";

export const pageFollowsRoutes = new Hono<AppEnv>()
  .put("/me/page-follows/:targetKey", async (c) => {
    const v = await requireUser(c);
    const actor = await writeActor(c, v);
    noStore(c);
    return c.json(await pageFollowsService.follow(v, actor, c.req.param("targetKey")));
  })
  .delete("/me/page-follows/:targetKey", async (c) => {
    const v = await requireUser(c);
    const actor = await writeActor(c, v);
    noStore(c);
    return c.json(await pageFollowsService.unfollow(v, actor, c.req.param("targetKey")));
  });
