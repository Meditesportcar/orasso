import { Button } from "@orasso/design-system/web";
import { type ActivityItem, storyShareLabels as L } from "@orasso/shared";
import { useState } from "react";

import { apiFetch } from "../../lib/api.client";

// Les boutons de la ligne « X t'a identifié dans sa story » (lot R7h, maquette R7.2) : pour moi, « Repartager » (la story
// rejoint la mienne, l'auteur est crédité) et « Retirer » (l'identification tombe, la story reste) ; pour ma structure,
// « Ajouter à ma story » (au nom de la structure). L'API décide de tout.
type Done = "untagged" | "reshared" | "added" | "gone" | null;

export function StoryMentionActions({
  item,
  organizerIds = [],
}: {
  item: ActivityItem;
  organizerIds?: readonly string[];
}) {
  const storyId = typeof item.data.storyId === "string" ? item.data.storyId : null;
  const structureId = typeof item.data.structureId === "string" ? item.data.structureId : null;
  const target = item.data.target;
  const [done, setDone] = useState<Done>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!storyId) return null;

  const run = async (kind: "untag" | "reshare" | "add") => {
    setBusy(true);
    setError(null);
    const res =
      kind === "untag"
        ? await apiFetch(`/me/story-tags/${storyId}/remove`, { method: "POST" })
        : await apiFetch(`/stories/${storyId}/share-to-mine`, {
            method: "POST",
            json: kind === "add" && structureId ? { asStructureId: structureId } : {},
          });
    setBusy(false);
    if (res.ok) setDone(kind === "untag" ? "untagged" : kind === "add" ? "added" : "reshared");
    else if (res.status === 404) setDone("gone");
    else setError(res.error.message);
  };

  if (target === "user") {
    return (
      <div className="act-row__actions" data-testid="story-mention-actions">
        {done ? (
          <p className="o-t-caption s-muted" role="status" data-testid="story-mention-done">
            {done === "untagged" ? L.untagged : done === "reshared" ? L.reshared : done === "added" ? L.added : L.gone}
          </p>
        ) : (
          <>
            <Button
              variant="secondary"
              icon="add"
              disabled={busy}
              onClick={() => void run("reshare")}
              data-testid="story-mention-reshare"
            >
              {L.reshare}
            </Button>
            <Button
              variant="secondary"
              icon="close"
              disabled={busy}
              onClick={() => void run("untag")}
              data-testid="story-mention-untag"
            >
              {L.untag}
            </Button>
          </>
        )}
        {error ? (
          <p className="o-t-caption s-muted" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }
  // Seulement pour une structure que je gère : sans ce droit, le bouton n'apparaît pas (l'API le refuserait de toute façon).
  if (target === "structure" && structureId && organizerIds.includes(structureId)) {
    return (
      <div className="act-row__actions" data-testid="story-mention-actions">
        {done ? (
          <p className="o-t-caption s-muted" role="status" data-testid="story-mention-done">
            {done === "added" ? L.added : L.gone}
          </p>
        ) : (
          <Button
            variant="secondary"
            icon="add"
            disabled={busy}
            onClick={() => void run("add")}
            data-testid="story-mention-add"
          >
            {L.add}
          </Button>
        )}
        {error ? (
          <p className="o-t-caption s-muted" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }
  return null;
}
