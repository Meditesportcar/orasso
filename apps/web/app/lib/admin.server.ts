import { requireMe } from "./api.server";

/** Toute page de `/admin` : super admin seulement (le layout et chaque route enfant l'appellent, leurs loaders tournent en parallèle). */
export async function requireSuperAdmin(request: Request) {
  const me = await requireMe(request);
  if (me.profile.platformRole !== "super_admin") {
    throw new Response("Réservé à l'administration d'Orasso.", { status: 403 });
  }
  return me;
}
