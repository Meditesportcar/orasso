// Candidature reçue (lot R9d, T27) : prévient les responsables de la structure de l'événement, dans la transaction de la
// création. Une ligne `application_received` par responsable, rangée dans l'Activité de la structure (« À trier »), sans push.
// Véhicules : regroupées par événement (24 h, un compteur). Média et prestataire : une ligne par demande, avec le nom.
import { structureNotificationTexts as T } from "@orasso/shared";
import type { Executor } from "../../lib/tx";
import { notifyStructure } from "../notifications/structure";

type EventFacts = { id: string; title: string; structureId: string; startsAt: Date; endsAt: Date };

export async function notifyApplicationReceived(
  tx: Executor,
  after: (cb: () => unknown) => void,
  event: EventFacts,
  /** `authorId` : la personne dont la candidature arrive (jamais prévenue, même si elle est responsable de la structure). */
  application: { id: string; kind: "vehicle" | "media" | "provider"; applicantName?: string; authorId: string },
): Promise<void> {
  const { kind } = application;
  const name = application.applicantName ?? "";
  const title =
    kind === "media"
      ? T.applicationMedia(name, event.title)
      : kind === "provider"
        ? T.applicationProvider(name, event.title)
        : T.applicationVehicle(1, event.title);
  await notifyStructure(
    tx,
    event.structureId,
    "application_received",
    {
      title,
      body: title,
      data: { eventId: event.id, kind, eventName: event.title, applicationId: application.id, screen: "triage" },
      eventId: event.id,
      eventStartsAt: event.startsAt,
      eventEndsAt: event.endsAt,
      groupKey:
        kind === "vehicle" ? `applications:${event.id}:vehicle` : `applications:${event.id}:${kind}:${application.id}`,
      after,
    },
    { exclude: [application.authorId] },
  );
}
