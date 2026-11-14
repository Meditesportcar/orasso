// Les identifications de la visionneuse d'un album (lot R9f, maquette R9.6 `identH`), dans l'emplacement `actions` de la galerie : sous la
// photo ouverte, la ligne « qui je suis », « Voitures identifiées · N » (une ligne par identification, croix quand je peux la retirer),
// le bouton « Identifier une voiture » (média, organisateur) ou « C'est ma voiture » (passionné), le bandeau après la pose, puis le plateau
// à choisir (`TagPicker`). Les droits sont ceux de l'API : le site n'affiche que ce qu'elle rend (`tags[].canRemove`, `removeAs`). Sans
// session, l'API ne sert aucune identification : la page ne montre rien.
import { Button, Icon } from "@orasso/design-system/web";
import {
  type AlbumTagView,
  type AlbumView,
  type AlbumViewerRole,
  albumTagLabels as L,
  taggedByText,
  whoLabelOf,
} from "@orasso/shared";
import { useState } from "react";
import { useRevalidator } from "react-router";

import { apiFetch } from "../../lib/api.client";
import { PersonAvatar } from "../People";
import { type PickResult, TagPicker } from "./TagPicker";
import "../../styles/albums.css";

type Done = { name: string | null; self: boolean };

export function TagActions({
  album,
  photoId,
  role,
}: {
  album: AlbumView;
  /** La photo affichée par la visionneuse. */
  photoId: string;
  role: AlbumViewerRole;
}) {
  const revalidator = useRevalidator();
  const photo = album.photos.find((p) => p.id === photoId);
  const tags = photo?.tags ?? [];
  const [picking, setPicking] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const who = whoLabelOf(role);
  const canPose = role === "media" || role === "organizer" || role === "tagged";

  async function pose(pick: PickResult) {
    const res = await apiFetch(`/album-photos/${encodeURIComponent(photoId)}/tags`, {
      method: "POST",
      json: pick.target,
    });
    if (!res.ok) throw new Error(res.error.message);
    setPicking(false);
    // Une identification de soi-même ne prévient personne (T40) ; sinon le propriétaire est prévenu (une notification pour l'album).
    setDone({ name: pick.pseudo, self: pick.self });
    revalidator.revalidate();
  }
  async function remove(tag: AlbumTagView) {
    const gesture = tag.removeAs === "not_mine" ? L.notMyCar : tag.removeAs === "withdraw" ? L.withdrawMine : null;
    const text =
      tag.removeAs === "not_mine"
        ? L.isNotifiedDeclined(album.media.name)
        : tag.removeAs === "withdraw"
          ? L.photoStaysWith(album.media.name)
          : null;
    // Même confirmation que l'appli pour les gestes de l'intéressé (« Ce n'est pas ma voiture » ne se reprend pas).
    if (gesture && text && !window.confirm(`${gesture}\n${text}`)) return;
    setBusy(tag.id);
    setError(null);
    const res =
      tag.removeAs === "tagger"
        ? await apiFetch(`/album-photos/${encodeURIComponent(photoId)}/tags/${encodeURIComponent(tag.id)}`, {
            method: "DELETE",
          })
        : await apiFetch(`/me/album-tags/${encodeURIComponent(tag.id)}`, { method: "DELETE", json: {} });
    setBusy(null);
    if (!res.ok) return setError(res.error.message);
    setDone(null);
    revalidator.revalidate();
  }

  return (
    <div className="tag-box" data-testid="tag-box">
      {who && (
        <p className="tag-who o-t-caption" data-testid="tag-who">
          <Icon name="check" size={16} />
          {who}
        </p>
      )}
      <h3 className="o-t-label tag-box__title" data-testid="tag-list-title">
        {tags.length > 0 ? L.screens.carsIdentifiedCount(tags.length) : L.noCarIdentified}
      </h3>
      {tags.length === 0 ? (
        <p className="s-muted o-t-caption" data-testid="tag-empty">
          {role === "tagged" ? L.sayIfYours : canPose ? L.pickInLineup : L.nobodyYet}
        </p>
      ) : (
        <ul className="tag-list" data-testid="tag-list">
          {tags.map((tag) => (
            <li key={tag.id} className={`tag-line${tag.mine ? " is-mine" : ""}`} data-testid="tag-line">
              {tag.kind === "user" ? (
                <PersonAvatar url={tag.user?.avatarUrl ?? null} pseudo={tag.user?.pseudo ?? "?"} size={40} />
              ) : (
                <span className="tag-line__thumb" aria-hidden="true">
                  <Icon name="vehicle" size={20} />
                </span>
              )}
              <span className="tag-line__text">
                {/* Nom entier, jamais coupé. */}
                <strong className="o-never-truncate" data-testid="tag-line-name">
                  {tag.kind === "vehicle"
                    ? [tag.vehicle?.label, tag.user?.pseudo].filter(Boolean).join(" · ")
                    : (tag.user?.pseudo ?? "")}
                </strong>
                <span className="o-t-caption s-muted" data-testid="tag-line-by">
                  {taggedByText(tag, role, album.media.name)}
                </span>
              </span>
              {tag.canRemove && (
                <button
                  type="button"
                  className="tag-line__remove"
                  disabled={busy === tag.id}
                  aria-label={
                    tag.removeAs === "not_mine"
                      ? L.notMyCar
                      : tag.removeAs === "withdraw"
                        ? L.withdrawMine
                        : L.screens.removeTag
                  }
                  onClick={() => void remove(tag)}
                  data-testid="tag-line-remove"
                >
                  <Icon name="close" size={18} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {done && (
        <div className="tag-done" role="status" data-testid="tag-done">
          <strong>{L.carIdentified}</strong>
          <span className="o-t-caption">{L.canRemoveAnytime}</span>
          {!done.self && <span className="o-t-caption">{L.isNotified(done.name ?? L.screens.ownerName)}</span>}
        </div>
      )}
      {error && (
        <p role="alert" className="s-error" data-testid="tag-error">
          {error}
        </p>
      )}
      <p className="o-t-caption s-muted" data-testid="tag-not-a-face">
        {L.notAFace}
      </p>
      {canPose && (
        <>
          <Button
            type="button"
            icon={role === "tagged" ? "check" : "vehicle"}
            onClick={() => {
              setDone(null);
              setError(null);
              setPicking(true);
            }}
            data-testid="tag-open-picker"
          >
            {role === "tagged" ? L.itsMyCar : L.identifyCar}
          </Button>
          <TagPicker open={picking} albumId={album.id} onClose={() => setPicking(false)} onPick={pose} />
        </>
      )}
    </div>
  );
}
