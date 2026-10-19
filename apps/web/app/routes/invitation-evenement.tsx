// Lien d'une invitation nominative envoyée par e-mail (lot 25, `/invitation-evenement/:jeton`) : l'événement et qui
// invite ; sans compte, inscription (ou connexion) avec l'adresse invitée ; connecté, l'invitation est rattachée au
// compte puis acceptée avec le véhicule choisi (ou refusée).
import { Button, Icon, TextField } from "@orasso/design-system/web";
import {
  eventFormatLabels,
  type InvitationLinkView,
  invitationLabels,
  invitationStatusLabels,
  passwordHint,
  pseudoSchema,
  type ReceivedInvitation,
} from "@orasso/shared";
import { useState } from "react";
import { data, Form, redirect, useNavigation } from "react-router";

import { ArriveeFields } from "../components/ArriveeFields";
import { TermsField } from "../components/Fields";
import { ReceivedInvitationCard } from "../components/Invitations";
import { apiFetch } from "../lib/api.client";
import { api, apiOrThrow, getMe, withCookies } from "../lib/api.server";
import { formatWhen } from "../lib/format";
import { invitationAction, isInvitationIntent, myActiveVehicles } from "../lib/invitations.server";
import { signUpFromForm } from "../lib/signup.server";
import type { Route } from "./+types/invitation-evenement";

const L = invitationLabels;

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.link.event.title;
  return [
    { title: title ? `Invitation · ${title} · Orasso` : "Invitation · Orasso" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const token = encodeURIComponent(params.jeton);
  const link = await apiOrThrow<InvitationLinkView>(request, `/invitation-evenement/${token}`);
  const me = await getMe(request);
  let invitation: ReceivedInvitation | null = null;
  let notMine = false;
  if (me && link.status === "pending") {
    // Connecté : l'invitation par e-mail est rattachée au compte qui a la même adresse.
    const claimed = await api<ReceivedInvitation>(request, `/invitation-evenement/${token}/claim`, { method: "POST" });
    if (claimed.ok) invitation = claimed.data;
    else notMine = claimed.status === 403;
  }
  const vehicles = invitation && !invitation.vehicle ? await myActiveVehicles(request) : [];
  return { link, connected: Boolean(me), invitation, notMine, vehicles, token: params.jeton };
}

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (isInvitationIntent(intent)) {
    const res = await invitationAction(request, form);
    if (res.error)
      return data(
        {
          error: res.error,
          errors: {},
          values: { pseudo: "", email: "", mainProfile: "", departments: [], firstName: "", lastName: "" },
        },
        { status: res.status },
      );
    return redirect(`/app/acces${intent === "invitation_accept" ? "" : "?invitation=refusee"}`);
  }
  // Inscription depuis le lien : le compte est créé, puis l'invitation lui est rattachée (même adresse e-mail).
  const result = await signUpFromForm(request, form);
  if (!result.ok) return data({ error: null, errors: result.errors, values: result.values }, { status: result.status });
  await api(request, `/invitation-evenement/${encodeURIComponent(params.jeton)}/claim`, {
    method: "POST",
    cookie: result.cookie,
  });
  return redirect(`/invitation-evenement/${encodeURIComponent(params.jeton)}`, {
    headers: withCookies(result.headers),
  });
}

export default function InvitationEvenement({ loaderData, actionData }: Route.ComponentProps) {
  const { link, connected, invitation, notMine, vehicles, token } = loaderData;
  const busy = useNavigation().state !== "idle";
  const errors: Record<string, string | undefined> = actionData?.errors ?? {};
  const [pseudoHint, setPseudoHint] = useState<string | undefined>();
  const retour = encodeURIComponent(`/invitation-evenement/${token}`);

  async function checkPseudo(value: string) {
    if (!value) return setPseudoHint(undefined);
    const parsed = pseudoSchema.safeParse(value.trim());
    if (!parsed.success) return setPseudoHint(parsed.error.issues[0]?.message);
    const res = await apiFetch<{ available: boolean }>(`/pseudo-available?pseudo=${encodeURIComponent(value.trim())}`);
    setPseudoHint(res.ok && !res.data.available ? "Ce pseudo est déjà pris." : undefined);
  }

  return (
    <div className="s-narrow s-stack" data-testid="invitation-link">
      <div className="o-t-label s-label">
        {L.invitedBy(link.invitedBy)}
        {link.event.privateEvent ? ` · ${L.privateBadge}` : ""}
      </div>
      <h1 className="s-title">{L.linkTitle}</h1>
      {!invitation && (
        <div className="inv-card">
          <div className="inv-card__head">
            <span className="inv-card__poster" aria-hidden="true">
              {link.event.posterUrl ? <img src={link.event.posterUrl} alt="" /> : <Icon name="entry" size={24} />}
            </span>
            <div className="inv-card__text">
              <h2 className="s-h2">{link.event.title}</h2>
              <div className="o-t-meta s-muted">
                {eventFormatLabels[link.event.format]} · {formatWhen(link.event.startsAt, link.event.endsAt)}
                {link.event.city ? ` · ${link.event.city}` : ""}
              </div>
              {link.vehicle && <div className="o-never-truncate">{L.invitedVehicle(link.vehicle.label)}</div>}
            </div>
          </div>
        </div>
      )}
      {actionData?.error && (
        <p className="s-error" role="alert">
          {actionData.error}
        </p>
      )}

      {link.status !== "pending" ? (
        <p className="s-notice" data-testid="invitation-gone">
          {invitationStatusLabels[link.status]}. {link.status === "accepted" ? "" : L.linkGone}
        </p>
      ) : invitation ? (
        <ReceivedInvitationCard inv={invitation} vehicles={vehicles} busy={busy} />
      ) : notMine ? (
        <p className="s-notice" data-testid="invitation-not-mine">
          {L.linkNotMine}
        </p>
      ) : connected ? (
        <p className="s-notice">{L.linkGone}</p>
      ) : (
        <>
          <p className="s-muted">{L.mailHow}</p>
          <Form method="post" className="s-form">
            <input type="hidden" name="intent" value="signup" />
            <ArriveeFields values={actionData?.values} errors={errors}>
              <TextField
                label="Pseudo"
                name="pseudo"
                autoComplete="username"
                defaultValue={actionData?.values.pseudo}
                help="3 à 24 caractères : lettres, chiffres, « _ » ou « . »"
                error={errors.pseudo ?? pseudoHint}
                onBlur={(e) => checkPseudo(e.currentTarget.value)}
                required
              />
            </ArriveeFields>
            <TextField
              label="E-mail"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={actionData?.values.email}
              help="L'adresse qui a reçu l'invitation"
              error={errors.email}
              required
            />
            <TextField
              label="Mot de passe"
              name="password"
              type="password"
              autoComplete="new-password"
              revealable
              help={passwordHint}
              error={errors.password}
              required
            />
            <TermsField error={errors.terms} />
            {errors.form && (
              <p className="s-error" role="alert">
                {errors.form}
              </p>
            )}
            <Button type="submit" icon="add" loading={busy} fullWidth>
              {L.linkSignUp}
            </Button>
          </Form>
          <Button variant="secondary" icon="profile" href={`/connexion?retour=${retour}`} fullWidth>
            {L.linkSignIn}
          </Button>
        </>
      )}
    </div>
  );
}
