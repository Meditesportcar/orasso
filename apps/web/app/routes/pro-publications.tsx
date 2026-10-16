// Espace pro, publications (`/pro/<slug>/publications`) : offres et actualités visibles par les abonnés, avec une
// limite par mois (docs/01 « Professionnels »).
import { Button, Chip, Counters, Plate, TextField } from "@orasso/design-system/web";
import type { ProOwner } from "@orasso/shared";
import { data, Form, useNavigation } from "react-router";

import { TextAreaField } from "../components/Fields";
import { api, apiOrThrow } from "../lib/api.server";
import { formatDateTime } from "../lib/format";
import type { Route } from "./+types/pro-publications";

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
  if (text("intent") === "delete") {
    const res = await api(request, `/pros/${pro.id}/posts/${encodeURIComponent(text("postId"))}`, {
      method: "DELETE",
    });
    if (!res.ok) return data({ error: res.error.message }, { status: res.status });
    return data({ ok: "Publication supprimée (elle compte toujours dans la limite du mois)." });
  }
  const res = await api(request, `/pros/${pro.id}/posts`, {
    method: "POST",
    json: { title: text("title"), body: text("body") },
  });
  if (!res.ok) return data({ error: res.error.message }, { status: res.status });
  return data({ ok: "Publié : tes abonnés la voient sur ta fiche." });
}

export default function ProPublications({ loaderData, actionData }: Route.ComponentProps) {
  const { pro, posts } = loaderData;
  const busy = useNavigation().state !== "idle";
  const result = actionData as { error?: string; ok?: string } | undefined;
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
          { value: pro.followersCount, label: "abonnés qui les voient" },
        ]}
      />

      <section className="orga__panel s-stack" aria-labelledby="new-post">
        <h2 id="new-post" className="s-h2">
          Nouvelle publication
        </h2>
        {!pro.published ? (
          <p className="s-notice">Publie d'abord ta fiche dans l'annuaire pour pouvoir écrire à tes abonnés.</p>
        ) : pro.postsRemaining === 0 ? (
          <p className="s-notice" data-testid="posts-limit">
            Limite atteinte : {pro.postsLimit} publications par mois. Le compteur repart au 1er du mois prochain.
          </p>
        ) : (
          <Form method="post" className="s-form" data-testid="post-form">
            <TextField label="Titre" name="title" maxLength={80} required />
            <TextAreaField label="Texte" name="body" maxLength={1000} required />
            <div>
              <Button type="submit" icon="chat" loading={busy}>
                Publier
              </Button>
            </div>
          </Form>
        )}
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

      <section className="orga__panel s-stack" aria-labelledby="past-posts">
        <h2 id="past-posts" className="s-h2">
          Tes publications
        </h2>
        {posts.length === 0 ? (
          <p className="s-muted">Aucune publication pour l'instant.</p>
        ) : (
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
        )}
      </section>

      <Plate as="section" kind="note">
        <p className="s-muted">
          Les publications sont visibles par tes abonnés sur ta fiche publique. Limite : {pro.postsLimit} par mois.
        </p>
      </Plate>
    </>
  );
}
