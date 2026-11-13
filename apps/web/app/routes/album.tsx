// L'album ouvert (lot R9e, maquette R9.5 pg ; `/albums/:id`) : couverture en mosaïque, titre, tags (« N photos », « Photos : <média> »,
// « Album officiel »), « présent au <événement> » (ouvre la fiche), **un emplacement vide pour R9f** (« Identifier les voitures »), la grille de
// photos et la visionneuse (crédit « Photos : <média> » en surimpression, emplacement `actions` vide pour R9f et R9g). Lecture : tout membre
// connecté (les photos viennent d'une route protégée). Média : modifier le titre, autoriser l'enregistrement, supprimer ; autre membre :
// signaler. Aucun nom de véhicule ni pseudo en R9e.
import { Button, Chip } from "@orasso/design-system/web";
import { type AlbumView, type EventPublic, albumLabels as L } from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { AlbumCover } from "../components/albums/AlbumCover";
import { OrganizerActions } from "../components/albums/OrganizerActions";
import { FicheBar, ficheHandle } from "../components/FicheBar";
import { PhotoGallery } from "../components/PhotoGallery";
import { ReportDialog } from "../components/ReportDialog";
import { api, apiOrThrow, requireMe, safeReturn } from "../lib/api.server";
import "../styles/albums.css";
import "../styles/media.css";
import type { Route } from "./+types/album";

export const handle = ficheHandle;

export function meta({ loaderData: d }: Route.MetaArgs) {
  return [{ title: `${d?.album.title ?? L.albums} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const back = safeReturn(new URL(request.url).searchParams.get("retour"), "/app");
  const me = await requireMe(request);
  const album = await apiOrThrow<AlbumView>(request, `/albums/${encodeURIComponent(params.id)}`);
  // Lot R9g : l'organisateur de l'événement (une de ses structures) a les actions « Reprendre dans le journal » et « officiel ».
  const event =
    album.mine || album.status !== "published"
      ? null
      : await api<EventPublic>(request, `/events/by-slug/${encodeURIComponent(album.event.slug)}`);
  const organizer = Boolean(
    event?.ok && me.personas?.some((p) => p.kind === "organizer" && p.id === event.data.structure.id),
  );
  return { back, album, organizer };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireMe(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const id = encodeURIComponent(params.id);
  if (intent === "photo-delete") {
    // Retirer une photo (le titulaire) : la dernière photo d'un album publié ne part pas (l'API le dit, 409).
    const res = await api(request, `/me/albums/${id}/photos/${encodeURIComponent(String(form.get("photoId") ?? ""))}`, {
      method: "DELETE",
    });
    const photoId = String(form.get("photoId") ?? "");
    return res.ok
      ? data({ error: null, intent, photoId })
      : data({ error: res.error.message, intent, photoId }, { status: res.status });
  }
  if (intent === "delete") {
    const res = await api(request, `/me/albums/${id}`, { method: "DELETE" });
    if (res.ok) throw redirect("/app/media");
    return data({ error: res.error.message }, { status: res.status });
  }
  const json =
    intent === "title"
      ? { title: String(form.get("title") ?? "").trim() }
      : intent === "save"
        ? { allowSave: String(form.get("allowSave")) === "1" }
        : null;
  if (!json) return data({ error: "Action inconnue" }, { status: 400 });
  const res = await api(request, `/me/albums/${id}`, { method: "PATCH", json });
  return res.ok ? data({ error: null }) : data({ error: res.error.message }, { status: res.status });
}

export default function AlbumPage({ loaderData, actionData: rawAction }: Route.ComponentProps) {
  // Les retraits de photo disent leur `intent` et leur `photoId` : l'erreur ne s'affiche que sous la photo concernée.
  const actionData = rawAction as { error: string | null; intent?: string; photoId?: string } | undefined;
  const a = loaderData.album;
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const photos = a.photos.map((p) => ({ key: p.id, url: p.url }));
  return (
    <>
      <FicheBar heading={false} title={a.media.name} back={loaderData.back} />
      <div className="s-narrow s-stack" data-testid="album-open">
        <a className="s-row" href={`/m/${a.media.key.slice(2)}`} data-testid="album-media-link">
          {a.media.logoUrl && <img className="md-logo" src={a.media.logoUrl} alt="" />}
          <strong className="o-never-truncate">{a.media.name}</strong>
        </a>
        <AlbumCover photos={a.cover} label={L.coverAlt(a.title)} />
        <h1 className="s-title o-never-truncate" data-testid="album-open-title">
          {a.title}
        </h1>
        <ul className="alb-tags">
          <li className="alb-tag o-t-caption" data-testid="album-tag-count">
            {L.photosCount(a.photosCount)}
          </li>
          <li className="alb-tag o-t-caption" data-testid="album-tag-credit">
            {L.creditLine(a.media.name)}
          </li>
          {a.official && (
            <li className="alb-tag alb-tag--accent o-t-caption" data-testid="album-tag-official">
              {L.officialAlbum}
            </li>
          )}
          {a.status === "draft" && (
            <li className="alb-tag o-t-caption" data-testid="album-tag-draft">
              {L.draft}
            </li>
          )}
        </ul>
        <a className="alb-at o-t-caption" href={`/e/${a.event.slug}`} data-testid="album-event-link">
          {L.presentAt(a.event.title)}
        </a>
        {/* Emplacement de R9f : « Identifier les voitures » (pas de contenu en R9e). */}
        <div data-testid="album-identify-slot" />
        {a.mine && a.status === "draft" && (
          <Button icon="next" href={`/app/media/albums/nouveau?album=${a.id}`} data-testid="album-resume">
            {L.resume}
          </Button>
        )}
        {a.photos.length === 0 ? (
          <p className="s-muted">{L.empty}</p>
        ) : (
          <PhotoGallery
            photos={photos}
            title={a.title}
            // Les vues comptent à l'ouverture d'une photo (comme avant par la galerie), une fois par page, reprise après un échec.
            contentId={a.id}
            credit={L.creditLine(a.media.name)}
            // Les actions de la photo **affichée** : « Signaler » vise celle-ci (jamais la première), « Retirer » pour le titulaire.
            // R9f et R9g y posent les leurs.
            actions={(photo) =>
              a.mine ? (
                <>
                  {/* Même confirmation que l'appli : retirer une photo d'un album publié l'enlève pour tout le monde. */}
                  <Form
                    method="post"
                    data-testid="album-photo-remove-form"
                    onSubmit={(e) => {
                      if (!window.confirm(`${L.photoRemove}\n${L.photoRemoveConfirm}`)) e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="intent" value="photo-delete" />
                    <input type="hidden" name="photoId" value={photo.key} />
                    <Button
                      type="submit"
                      variant="secondary"
                      icon="trash"
                      disabled={busy}
                      data-testid="album-photo-remove"
                    >
                      {L.photoRemove}
                    </Button>
                  </Form>
                  {/* Le refus de l'API (409 : dernière photo d'un album publié) s'affiche ici, dans la fenêtre, pas derrière elle. */}
                  {/* Seulement pour la photo affichée : l'erreur d'un retrait refusé ne suit pas les autres photos. */}
                  {actionData?.error && actionData.intent === "photo-delete" && actionData.photoId === photo.key && (
                    <p role="alert" className="s-error" data-testid="album-photo-remove-error">
                      {actionData.error}
                    </p>
                  )}
                </>
              ) : (
                <>
                  {/* Lot R9g : l'organisateur de l'événement reprend la photo dans son journal, ou choisit l'album « officiel ». */}
                  {loaderData.organizer && <OrganizerActions key={`org-${photo.key}`} album={a} photo={photo} />}
                  {/* Une clé par photo : le formulaire (et son « Signalement envoyé ») repart à zéro à chaque photo affichée. */}
                  <ReportDialog key={photo.key} targetType="album_photo" targetId={photo.key} />
                </>
              )
            }
          />
        )}
        {actionData?.error && actionData.intent !== "photo-delete" && (
          <p role="alert" className="s-error">
            {actionData.error}
          </p>
        )}
        {a.mine ? (
          <div className="s-stack s-stack--tight" data-testid="album-owner">
            <Form method="post" className="s-stack s-stack--tight">
              <input type="hidden" name="intent" value="title" />
              <label className="o-t-label" htmlFor="album-title-input">
                {L.titleField}
              </label>
              <input id="album-title-input" name="title" defaultValue={a.title} maxLength={80} className="s-input" />
              <Button type="submit" variant="secondary" icon="check" disabled={busy} data-testid="album-title-save">
                {L.editTitle}
              </Button>
            </Form>
            <Form method="post">
              <input type="hidden" name="intent" value="save" />
              <input type="hidden" name="allowSave" value={a.allowSave ? "0" : "1"} />
              <Button type="submit" variant="secondary" icon="check" disabled={busy} data-testid="album-toggle-save">
                {a.allowSave ? L.forbidSaveAction : L.allowSaveAction}
              </Button>
              {a.allowSave && <Chip>{L.allowSave}</Chip>}
            </Form>
            <Form
              method="post"
              onSubmit={(e) => {
                if (!window.confirm(L.deleteConfirm)) e.preventDefault();
              }}
            >
              <input type="hidden" name="intent" value="delete" />
              <Button type="submit" variant="secondary" icon="trash" disabled={busy} data-testid="album-delete">
                {L.deleteAlbum}
              </Button>
            </Form>
          </div>
        ) : null}
      </div>
    </>
  );
}
