// L'onglet « Événements » de la page d'une structure, sur le site (lot R8g) : les événements à venir puis passés d'aujourd'hui, et
// dessous ce que la page montrait : « À propos » (la présentation en entier, la note des avis, site et réseaux), les pros
// partenaires, le lien d'invitation (aux organisateurs de la structure). Rendu côté serveur.
import { Button, Plate } from "@orasso/design-system/web";
import {
  type EventCard,
  pagesLabels as L,
  type ProCard,
  type StructurePublic,
  structureKindLabels,
} from "@orasso/shared";

import { useRevalidator } from "react-router";

import { EventTile } from "../EventTile";
import { ProTile } from "../ProTile";
import { ShareButtons } from "../ShareButtons";
import { Stars } from "../Stars";

/** Une lecture qui a échoué : le message et « Réessayer » (relit la page), jamais une absence. */
function ReadError({ text, testId }: { text: string; testId: string }) {
  const revalidator = useRevalidator();
  return (
    <div className="s-stack s-stack--tight" role="alert" data-testid={testId}>
      <p className="s-notice">{text}</p>
      <div>
        <Button
          variant="secondary"
          icon="undo"
          disabled={revalidator.state !== "idle"}
          onClick={() => void revalidator.revalidate()}
          data-testid={`${testId}-retry`}
        >
          {L.readRetry}
        </Button>
      </div>
    </div>
  );
}

export function StructureEvents({
  structure,
  upcoming,
  past,
  partners,
  inviteToken,
  inviteFailed,
  origin,
}: {
  structure: StructurePublic;
  upcoming: EventCard[] | null;
  past: EventCard[] | null;
  partners: ProCard[] | null;
  inviteToken: string | null;
  inviteFailed: boolean;
  origin: string;
}) {
  const where = [structure.postalCode, structure.city].filter(Boolean).join(" ");
  const socials = Object.entries(structure.socials).filter(([, url]) => Boolean(url)) as [string, string][];
  const average = structure.rating.average?.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  return (
    <div className="s-stack" data-testid="structure-events">
      <section className="s-stack" aria-labelledby="so-next">
        <h2 id="so-next" className="s-h2 s-head">
          Prochains événements
        </h2>
        {upcoming === null ? (
          <ReadError text={L.eventsReadError} testId="structure-events-error" />
        ) : upcoming.length === 0 ? (
          <p className="s-notice">Aucun événement à venir pour l'instant. Suis la structure pour être prévenu.</p>
        ) : (
          <div className="w-cards" data-testid="structure-upcoming">
            {upcoming.map((event) => (
              <EventTile key={event.id} event={event} showStructure={false} />
            ))}
          </div>
        )}
      </section>

      {past === null ? (
        <section className="s-stack" aria-labelledby="so-past">
          <h2 id="so-past" className="s-h2 s-head">
            Événements passés
          </h2>
          <ReadError text={L.pastReadError} testId="structure-past-error" />
        </section>
      ) : past.length > 0 ? (
        <section className="s-stack" aria-labelledby="so-past">
          <h2 id="so-past" className="s-h2 s-head">
            Événements passés
          </h2>
          <div className="w-cards" data-testid="structure-past">
            {past.map((event) => (
              <EventTile key={event.id} event={event} showStructure={false} />
            ))}
          </div>
        </section>
      ) : null}

      <Plate as="section" aria-labelledby="so-about" data-testid="structure-about">
        <h2 id="so-about" className="s-h2">
          {L.eventsAbout}
        </h2>
        <p className="o-t-meta s-tile__muted">
          {[structureKindLabels[structure.kind], where].filter(Boolean).join(" · ")}
        </p>
        <div className="o-t-meta" data-testid="structure-rating">
          {average ? (
            <>
              <Stars rating={Math.round(structure.rating.average ?? 0)} />{" "}
              <strong className="o-t-number">{average}</strong> / 3 · {structure.rating.count} avis
            </>
          ) : (
            <span className="s-tile__muted">
              {structure.rating.count > 0
                ? `${structure.rating.count} avis · la note s'affiche à partir de 3 avis`
                : "Pas encore d'avis"}
            </span>
          )}
        </div>
        {structure.description && <p className="s-prewrap">{structure.description}</p>}
        {(structure.website || socials.length > 0) && (
          <div className="s-row">
            {structure.website && (
              <a href={structure.website} rel="noopener nofollow" target="_blank">
                Site web
              </a>
            )}
            {socials.map(([name, url]) => (
              <a key={name} href={url} rel="noopener nofollow" target="_blank">
                {name.charAt(0).toUpperCase() + name.slice(1)}
              </a>
            ))}
          </div>
        )}
      </Plate>

      {partners === null ? (
        <section className="s-stack" aria-labelledby="so-partners">
          <h2 id="so-partners" className="s-h2 s-head">
            {L.eventsPartners}
          </h2>
          <ReadError text={L.partnersReadError} testId="structure-partners-error" />
        </section>
      ) : null}
      {partners !== null && partners.length > 0 && (
        <section className="s-stack" aria-labelledby="so-partners" data-testid="structure-partners">
          <h2 id="so-partners" className="s-h2 s-head">
            {L.eventsPartners}
          </h2>
          <div className="s-grid">
            {partners.map((pro) => (
              <ProTile key={pro.slug} pro={pro} />
            ))}
          </div>
        </section>
      )}

      {inviteFailed ? <ReadError text={L.inviteReadError} testId="structure-invite-error" /> : null}
      {inviteToken && (
        <Plate as="section" aria-labelledby="so-invite">
          <h2 id="so-invite" className="s-h2">
            {L.eventsInvite}
          </h2>
          <p className="s-entry__text">{L.eventsInviteText(structure.name)}</p>
          <ShareButtons url={`${origin}/invitation/${inviteToken}`} title={`Rejoins ${structure.name} sur Orasso`} />
        </Plate>
      )}
    </div>
  );
}
