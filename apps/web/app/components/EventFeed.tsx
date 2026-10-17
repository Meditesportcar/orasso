// Fil de l'événement (lot 20) : annonces, consignes envoyées, changements de statut. Le texte est rendu comme du texte
// (React échappe tout : aucune balise n'est interprétée). Lecture seule pour le public (S19 : pas de commentaires).
import { Chip } from "@orasso/design-system/web";
import { type AnnouncementView, announcementKindLabels, communicationLabels } from "@orasso/shared";
import type { ReactNode } from "react";

import { formatDateTime } from "../lib/format";
import { ReportDialog } from "./ReportDialog";
import "../styles/communication.css";

export function FeedItem({ item, actions }: { item: AnnouncementView; actions?: ReactNode }) {
  return (
    <li className={`s-card comm__item${item.pinned ? " comm__item--pinned" : ""}`} data-testid="feed-item">
      <div className="s-row s-row--between">
        <span className="o-t-label s-muted">
          {announcementKindLabels[item.kind]} · {formatDateTime(item.publishedAt)}
          {item.audience === "participants" ? " · Inscrits retenus" : ""}
        </span>
        {item.pinned && <Chip>{communicationLabels.feedPinned}</Chip>}
      </div>
      <p className="s-prewrap comm__body">{item.body}</p>
      {item.image && (
        <img
          className="comm__img"
          src={item.image.url}
          alt=""
          width={item.image.width ?? undefined}
          height={item.image.height ?? undefined}
          loading="lazy"
        />
      )}
      <span className="o-t-caption s-muted">
        {communicationLabels.byStructure(item.structureName)}
        {item.authorPseudo ? ` · ${item.authorPseudo}` : ""}
      </span>
      {actions}
    </li>
  );
}

/** Section « Fil de l'événement » de la page publique (`#fil`). `connected` : « Signaler » sous chaque annonce (lot 32). */
export function EventFeed({ items, connected = false }: { items: AnnouncementView[]; connected?: boolean }) {
  return (
    <section className="s-section" id="fil" aria-labelledby="fil-titre" data-testid="event-feed">
      <h2 className="s-h2" id="fil-titre">
        {communicationLabels.feed}
      </h2>
      {items.length === 0 ? (
        <p className="s-muted">{communicationLabels.feedEmpty}</p>
      ) : (
        <ul className="comm__feed">
          {items.map((item) => (
            <FeedItem
              key={item.id}
              item={item}
              actions={
                connected && (item.kind === "announcement" || item.kind === "instructions") ? (
                  <ReportDialog look="link" targetType="announcement" targetId={item.id} />
                ) : undefined
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}
