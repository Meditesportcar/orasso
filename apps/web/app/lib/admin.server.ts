import { requireMe } from "./api.server";

/** Toute page de `/admin` : super admin seulement (le layout et chaque route enfant l'appellent, leurs loaders tournent en parallèle). */
export async function requireSuperAdmin(request: Request) {
  const me = await requireMe(request);
  if (me.profile.platformRole !== "super_admin") {
    throw new Response("Réservé à l'administration d'Orasso.", { status: 403 });
  }
  return me;
}

/** File des signalements (lot 32) : modérateur ou super admin (docs/02 : « le modérateur voit uniquement la file »). */
export async function requireModeration(request: Request) {
  const me = await requireMe(request);
  if (me.profile.platformRole === "user") {
    throw new Response("Réservé à l'équipe de modération d'Orasso.", { status: 403 });
  }
  return me;
}
