// Administration (lot 33) : fiche d'un utilisateur (profil, structures, véhicules, points, sanctions, signalements,
// appareils, sessions) et actions de l'équipe : ajuster les points, sanctionner, réinitialiser la double authentification
// (A5), rôle de modérateur, anonymiser. Chaque action demande un motif et s'écrit au journal d'administration.
import { Button, Chip, SelectField, TextField } from "@orasso/design-system/web";
import {
  type AdminUserDetail,
  adminTexts,
  gradeLabels,
  type PointKind,
  personReportReasons,
  platformRoleLabels,
  pointKindLabels,
  reportReasonLabels,
  type SanctionKind,
  sanctionKindLabels,
  sanctionKinds,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { TextAreaField } from "../../components/Fields";
import { requireSuperAdmin } from "../../lib/admin.server";
import { api, apiOrThrow } from "../../lib/api.server";
import { formatDateTime, formatDay } from "../../lib/format";
import type { Route } from "./+types/utilisateur";

export function meta() {
  return [{ title: "Utilisateur · Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await requireSuperAdmin(request);
  const user = await apiOrThrow<AdminUserDetail>(request, `/admin/users/${encodeURIComponent(params.id)}`);
  return { user, self: me.user.id === user.id, done: new URL(request.url).searchParams.get("fait") };
}

type Section = "points" | "sanction" | "twofactor" | "role" | "anonymize";

export async function action({ request, params }: Route.ActionArgs) {
  await requireSuperAdmin(request);
  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const intent = text("intent") as Section;
  const base = `/admin/users/${encodeURIComponent(params.id)}`;
  const calls: Record<Section, () => Promise<{ ok: boolean; status: number; error?: { message: string } }>> = {
    points: () =>
      api(request, `${base}/points-adjust`, {
        method: "POST",
        json: { points: Number(text("points")), note: text("reason") },
      }),
    sanction: () =>
      api(request, `${base}/sanction`, {
        method: "POST",
        json: { kind: text("kind"), reason: text("motive"), note: text("reason") },
      }),
    twofactor: () => api(request, `${base}/reset-two-factor`, { method: "POST", json: { reason: text("reason") } }),
    role: () => api(request, `${base}/role`, { method: "POST", json: { role: text("role"), reason: text("reason") } }),
    anonymize: () => api(request, `${base}/anonymize`, { method: "POST", json: { reason: text("reason") } }),
  };
  const call = calls[intent];
  if (!call) return data({ section: "points" as Section, error: "Action inconnue." }, { status: 400 });
  const res = await call();
  if (!res.ok) {
    return data({ section: intent, error: res.error?.message ?? "Erreur inattendue." }, { status: res.status });
  }
  return redirect(`/admin/utilisateurs/${params.id}?fait=${intent}`);
}

function ActionForm({
  intent,
  title,
  hint,
  children,
  button,
  icon,
  variant = "secondary",
  error,
}: {
  intent: Section;
  title: string;
  hint?: string;
  children?: React.ReactNode;
  button: string;
  icon: "check" | "undo" | "flag" | "grade" | "staff" | "close";
  variant?: "secondary" | "alert";
  error?: string;
}) {
  const busy = useNavigation().state !== "idle";
  return (
    <Form method="post" className="orga__panel s-stack" data-testid={`action-${intent}`}>
      <input type="hidden" name="intent" value={intent} />
      <h2 className="s-h2">{title}</h2>
      {hint && <p className="s-muted">{hint}</p>}
      {children}
      <TextAreaField label={adminTexts.reasonLabel} name="reason" rows={2} required minLength={5} />
      {error && (
        <p className="s-error" role="alert">
          {error}
        </p>
      )}
      <div className="s-row">
        <Button type="submit" variant={variant} icon={icon} loading={busy}>
          {button}
        </Button>
      </div>
    </Form>
  );
}

export default function AdminUser({ loaderData, actionData }: Route.ComponentProps) {
  const { user: u, self, done } = loaderData;
  const err = (s: Section) => (actionData && actionData.section === s ? actionData.error : undefined);
  const deleted = Boolean(u.deletedAt);
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">
            <a href="/admin/utilisateurs">Utilisateurs</a>
          </div>
          <h1 className="s-title o-never-truncate">{u.pseudo}</h1>
          <p className="s-muted">
            {platformRoleLabels[u.platformRole]} · {gradeLabels[u.grade]} · {u.pointsSeason} points · inscrit le{" "}
            {formatDay(u.createdAt)}
          </p>
        </div>
        <div className="s-row">
          {deleted && <Chip>Supprimé</Chip>}
          {u.bannedAt && <Chip>Banni</Chip>}
          {!u.bannedAt && u.suspendedUntil && new Date(u.suspendedUntil) > new Date() && (
            <Chip>Suspendu jusqu'au {formatDay(u.suspendedUntil)}</Chip>
          )}
        </div>
      </div>
      {done && (
        <p className="s-notice s-notice--ok" role="status" data-testid="user-done">
          C'est fait. L'action est écrite au journal d'administration.
        </p>
      )}

      <div className="adm-grid">
        <section className="orga__panel s-stack" aria-labelledby="who">
          <h2 id="who" className="s-h2">
            Compte
          </h2>
          <dl className="adm-kv">
            <dt>Adresse</dt>
            <dd>
              {u.email} {u.emailVerified ? "(confirmée)" : "(non confirmée)"}
            </dd>
            <dt>Nom</dt>
            <dd>{[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}</dd>
            <dt>Téléphone</dt>
            <dd>{u.phone ?? "—"}</dd>
            <dt>Secteur</dt>
            <dd>{u.departments.join(", ") || "—"}</dd>
            <dt>Newsletter</dt>
            <dd>{u.newsletterOptIn ? "Acceptée" : "Non"}</dd>
            <dt>Double authentification</dt>
            <dd data-testid="user-2fa">
              {u.twoFactor.totp ? "Application d'authentification" : "Pas d'application"} · {u.twoFactor.passkeys} clé
              {u.twoFactor.passkeys > 1 ? "s" : ""} d'accès
            </dd>
            <dt>Fiche pro</dt>
            <dd>{u.pro ? <a href={`/p/${u.pro.slug}`}>{u.pro.name}</a> : "—"}</dd>
          </dl>
        </section>

        <section className="orga__panel s-stack" aria-labelledby="structures">
          <h2 id="structures" className="s-h2">
            Structures et véhicules
          </h2>
          {u.structures.length === 0 ? (
            <p className="s-muted">Aucune structure.</p>
          ) : (
            <ul>
              {u.structures.map((s) => (
                <li key={s.id}>
                  <a href={`/admin/structures/${s.id}`}>{s.name}</a> · {s.role} · {s.status}
                </li>
              ))}
            </ul>
          )}
          {u.vehicles.length === 0 ? (
            <p className="s-muted">Aucun véhicule.</p>
          ) : (
            <ul>
              {u.vehicles.map((v) => (
                <li key={v.id} className="o-never-truncate">
                  {v.label}
                  {v.year ? ` · ${v.year}` : ""} · {v.status}
                  {v.certified ? " · Certifié" : ""}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="orga__panel s-stack" aria-labelledby="moderation">
          <h2 id="moderation" className="s-h2">
            Points et modération
          </h2>
          <ul>
            {u.points.slice(0, 8).map((p) => (
              <li key={p.id}>
                {p.points > 0 ? `+${p.points}` : p.points} · {pointKindLabels[p.kind as PointKind] ?? p.kind} ·{" "}
                {formatDay(p.at)}
              </li>
            ))}
          </ul>
          <p>
            Signalements émis : {u.reports.emitted} · reçus : {u.reports.received}
          </p>
          {u.sanctions.map((s) => (
            <p key={s.id}>
              {sanctionKindLabels[s.kind as SanctionKind]} ·{" "}
              {reportReasonLabels[s.reason as keyof typeof reportReasonLabels]} · {formatDay(s.startsAt)}
              {s.liftedAt ? " · levée" : ""}
            </p>
          ))}
        </section>

        <section className="orga__panel s-stack" aria-labelledby="devices">
          <h2 id="devices" className="s-h2">
            Appareils et sessions
          </h2>
          {u.devices.map((d) => (
            <p key={d.id}>
              Téléphone {d.platform} · {d.lastSeenAt ? `vu le ${formatDateTime(d.lastSeenAt)}` : "jamais vu"}
              {d.revoked ? " · retiré" : ""}
            </p>
          ))}
          {u.sessions.length === 0 ? (
            <p className="s-muted" data-testid="user-sessions-empty">
              Aucune session ouverte.
            </p>
          ) : (
            u.sessions.map((s) => (
              <p key={s.id}>
                {s.device} · depuis le {formatDateTime(s.createdAt)}
              </p>
            ))
          )}
        </section>
      </div>

      {!deleted && !self && (
        <div className="adm-grid">
          <ActionForm
            intent="points"
            title={adminTexts.adjustPoints}
            button="Ajuster"
            icon="grade"
            error={err("points")}
          >
            <TextField label="Points (négatif pour retirer)" name="points" type="number" required />
          </ActionForm>
          {u.platformRole !== "super_admin" && (
            <ActionForm
              intent="sanction"
              title={adminTexts.sanction}
              button="Sanctionner"
              icon="flag"
              error={err("sanction")}
            >
              <SelectField
                label="Sanction"
                name="kind"
                options={sanctionKinds.map((k) => ({ value: k, label: sanctionKindLabels[k] }))}
              />
              <SelectField
                label="Motif"
                name="motive"
                options={personReportReasons.map((r) => ({ value: r, label: reportReasonLabels[r] }))}
              />
            </ActionForm>
          )}
          <ActionForm
            intent="twofactor"
            title={adminTexts.resetTwoFactor}
            hint={adminTexts.resetTwoFactorHint}
            button="Réinitialiser"
            icon="undo"
            error={err("twofactor")}
          />
          {u.platformRole !== "super_admin" && (
            <ActionForm
              intent="role"
              title={u.platformRole === "moderator" ? "Retirer le rôle de modérateur" : "Donner le rôle de modérateur"}
              button={u.platformRole === "moderator" ? "Retirer le rôle" : "Donner le rôle"}
              icon="staff"
              error={err("role")}
            >
              <input type="hidden" name="role" value={u.platformRole === "moderator" ? "user" : "moderator"} />
            </ActionForm>
          )}
          {u.platformRole === "user" && (
            <ActionForm
              intent="anonymize"
              title={adminTexts.anonymize}
              hint={adminTexts.anonymizeHint}
              button="Anonymiser"
              icon="close"
              variant="alert"
              error={err("anonymize")}
            />
          )}
        </div>
      )}
      {self && <p className="s-notice">{adminTexts.selfForbidden}</p>}
    </>
  );
}
