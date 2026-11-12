// Espace pro, publications (`/pro/<slug>/publications`) : le compteur du mois (limite mensuelle, docs/01 « Professionnels »),
// « Publier une offre » et « Publier » (qui ouvrent « Publier » réglé sur la fiche), les offres en cours puis « Anciennes offres »
// (les « offres et actualités » d'avant, supprimables). Lot R9c : le formulaire de texte a disparu, une offre est une publication
// avec l'étiquette « Offre ».
import { Button, Chip, Counters, Plate } from "@orasso/design-system/web";
import { authorKeyOf, proOffersLabels as O, type ProOwner, pluralFr } from "@orasso/shared";
import { data, Form } from "react-router";

import { CurrentOffers } from "../components/pages/PageOffers";
import { api, apiOrThrow } from "../lib/api.server";
import { formatDateTime } from "../lib/format";
import type { Route } from "./+types/pro-publications";

import "../styles/pro-offers.css";

export function meta() {
  return [{ title: "Publications · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const pro = await apiOrThrow<ProOwner>(request, "/me/pro");
  return { pro, posts: pro.posts ?? [] };
}

export async function action({ request }: Route.ActionArgs) {
  const pro = await apiOrThrow<ProOwner>(request, "/me/pro");
  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? "").trim();
  // Seule la suppression d'une ancienne offre reste ici : les nouvelles offres passent par « Publier ».
  if (text("intent") === "delete") {
    const res = await api(request, `/pros/${pro.id}/posts/${encodeURIComponent(text("postId"))}`, {
      method: "DELETE",
    });
    if (!res.ok) return data({ error: res.error.message }, { status: res.status });
    return data({ ok: "Publication supprimée (elle compte toujours dans la limite du mois)." });
  }
  return data({ error: "Action inconnue." }, { status: 400 });
}

export default function ProPublications({ loaderData, actionData }: Route.ComponentProps) {
  const { pro, posts } = loaderData;
  const result = actionData as { error?: string; ok?: string } | undefined;
  // Pourquoi les boutons sont inertes (jamais un bouton principal grisé sans sa ligne) : fiche non publiée, limite atteinte.
  const blocked = !pro.published
    ? O.blockedUnpublishedSite
    : pro.postsRemaining === 0
      ? O.blockedLimit(pro.postsLimit)
      : null;
  const publishHref = `/app/fil/publier?fiche=${encodeURIComponent(pro.id)}`;
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Espace pro</div>
          <h1 className="s-title">Publications</h1>
        </div>
        <Chip data-testid="posts-counter">
          {pro.postsUsed} / {pro.postsLimit} ce mois-ci
        </Chip>
      </div>

      <Counters
        variant="surface"
        size="site"
        items={[
          { value: pro.postsRemaining, label: "publications restantes ce mois-ci" },
          {
            value: pro.followersCount,
            label: pluralFr(pro.followersCount, "abonné suit ta fiche", "abonnés suivent ta fiche"),
          },
        ]}
      />

      <section className="orga__panel s-stack" aria-labelledby="new-post">
        <h2 id="new-post" className="s-h2">
          Nouvelle publication
        </h2>
        {blocked ? (
          <p className="s-notice" data-testid="posts-limit">
            {blocked}
          </p>
        ) : null}
        <div className="po-space__buttons">
          {blocked ? (
            <Button type="button" icon="ticket" disabled data-testid="pro-publish-offer">
              {O.publishOffer}
            </Button>
          ) : (
            <Button icon="ticket" href={`${publishHref}&etiquette=offre`} data-testid="pro-publish-offer">
              {O.publishOffer}
            </Button>
          )}
          {blocked ? (
            <Button type="button" variant="secondary" icon="gallery" disabled data-testid="pro-publish">
              Publier
            </Button>
          ) : (
            <Button variant="secondary" icon="gallery" href={publishHref} data-testid="pro-publish">
              Publier
            </Button>
          )}
        </div>
        {result?.error && (
          <p className="s-error" role="alert">
            {result.error}
          </p>
        )}
        {result?.ok && (
          <p className="s-notice s-notice--ok" role="status">
            {result.ok}
          </p>
        )}
      </section>

      <section className="orga__panel s-stack" aria-labelledby="current-offers" data-testid="current-offers">
        <h2 id="current-offers" className="s-h2">
          {O.currentTitle}
        </h2>
        <CurrentOffers authorKey={authorKeyOf("pro", pro.id)} />
      </section>

      {posts.length > 0 ? (
        <section className="orga__panel s-stack" aria-labelledby="past-posts" data-testid="old-offers">
          <h2 id="past-posts" className="s-h2">
            {O.oldTitle}
          </h2>
          <ul className="s-reviews">
            {posts.map((post) => (
              <li key={post.id} className="s-card" data-testid="post">
                <div className="s-row s-row--between">
                  <strong>{post.title}</strong>
                  <Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="postId" value={post.id} />
                    <Button type="submit" variant="secondary" icon="close">
                      Supprimer
                    </Button>
                  </Form>
                </div>
                <p className="s-prewrap">{post.body}</p>
                <span className="o-t-caption s-muted">{formatDateTime(post.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Plate as="section" kind="note">
        <p className="s-muted">
          {O.visibility} Limite : {pro.postsLimit} par mois.
        </p>
      </Plate>
    </>
  );
}
