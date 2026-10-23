// Mes billets (docs/02 : les billets vivent dans « Accès », à côté des candidatures) : QR de billet, rendre un billet
// gratuit. Billets payants : paiement de démonstration (Stripe en mode test), rien n'est débité.
import { Button, Chip } from "@orasso/design-system/web";
import type { MyTicket } from "@orasso/shared";
import { data, Form, useNavigation } from "react-router";
import { FicheBar, ficheHandle } from "../components/FicheBar";
import { Qr } from "../components/Qr";
import { api, apiOrThrow } from "../lib/api.server";
import { formatPrice, formatWhen } from "../lib/format";
import type { Route } from "./+types/billets";

// Lot M7 : fiche ou parcours, mode B (en-tête de fiche, sans bande ni barre d'onglets).
export const handle = ficheHandle;

export function meta() {
  return [{ title: "Mes billets · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const tickets = await apiOrThrow<MyTicket[]>(request, "/me/tickets");
  const url = new URL(request.url);
  return {
    tickets,
    reserved: url.searchParams.get("reserve") === "ok",
    paid: url.searchParams.get("paiement") === "ok",
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const id = String(form.get("ticketId") ?? "");
  const res = await api(request, `/tickets/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) return data({ error: res.error.message }, { status: res.status });
  return data({ ok: "Billet rendu : la place est libérée." });
}

function Ticket({ ticket }: { ticket: MyTicket }) {
  const busy = useNavigation().state !== "idle";
  const used = ticket.status === "used";
  const onConfirm = (e: React.FormEvent<HTMLFormElement>) => {
    if (!window.confirm("Rendre ce billet ? La place sera libérée pour quelqu'un d'autre.")) e.preventDefault();
  };
  return (
    <article className="s-card acc" data-testid="ticket" data-status={ticket.status}>
      <div className="acc__head">
        <div className="s-stack s-stack--tight">
          <div className="s-label o-t-label">{ticket.name}</div>
          <h2 className="s-h2">
            <a href={`/e/${ticket.event.slug}`}>{ticket.event.title}</a>
          </h2>
          <div className="o-t-meta s-muted">
            {formatWhen(ticket.event.startsAt, ticket.event.endsAt)}
            {ticket.event.city ? ` · ${ticket.event.city}` : ""}
          </div>
          <div className="o-t-caption s-muted">{ticket.event.structureName}</div>
        </div>
        <Chip variant={used ? undefined : "accent"}>{used ? "Utilisé" : "Valable"}</Chip>
      </div>
      <div className="acc__qr" data-testid="ticket-qr">
        <Qr payload={ticket.payload} label={`QR du billet : ${ticket.event.title}`} />
      </div>
      <p className="o-t-caption s-muted s-center">
        {used ? "Entrée enregistrée." : "Présente ce QR à l'entrée."}
        {ticket.priceCents != null
          ? ` ${formatPrice(ticket.priceCents)}${ticket.testMode ? " · paiement de démonstration, rien n'a été débité" : ""}.`
          : " Billet gratuit."}
      </p>
      {!used && ticket.priceCents == null && (
        <Form method="post" className="acc__actions" onSubmit={onConfirm}>
          <input type="hidden" name="ticketId" value={ticket.id} />
          <Button type="submit" variant="secondary" icon="undo" loading={busy}>
            Rendre ce billet
          </Button>
        </Form>
      )}
    </article>
  );
}

export default function Billets({ loaderData, actionData }: Route.ComponentProps) {
  const { tickets, reserved, paid } = loaderData;
  const result = actionData as { error?: string; ok?: string } | undefined;
  return (
    <div className="s-stack">
      <FicheBar title="Mes billets" back="/app/sorties" />
      {reserved && (
        <p className="s-notice s-notice--ok" role="status" data-testid="reserved-notice">
          Réservation confirmée : ton billet et son QR sont ci-dessous.
        </p>
      )}
      {paid && (
        <p className="s-notice s-notice--ok" role="status" data-testid="paid-notice">
          Paiement de démonstration reçu : ton billet arrive dès que Stripe confirme (quelques secondes). Recharge la
          page s'il n'apparaît pas.
        </p>
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
      {tickets.length === 0 ? (
        <p className="s-notice" data-testid="no-tickets">
          Aucun billet pour l'instant. Les billets de visiteurs se réservent depuis la page d'un événement.{" "}
          <a href="/evenements">Voir les événements</a>.
        </p>
      ) : (
        <div className="s-stack">
          {tickets.map((t) => (
            <Ticket key={t.id} ticket={t} />
          ))}
        </div>
      )}
    </div>
  );
}
