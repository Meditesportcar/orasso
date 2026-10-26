// Administration (lot R5a, maquette R5.3) : l'onglet « Styles » de la base véhicules. Un onglet par type, les styles
// rangés par famille dans l'ordre d'affichage (glisser une ligne change l'ordre ; flèches au clavier et au doigt) ;
// ajouter, modifier (nom, masculin, famille, icône de la liste fermée, âge minimal), mettre en pause. À droite, la file
// « Styles proposés » regroupée par nom normalisé : ajouter au catalogue, rattacher à un style existant, refuser.
// Même contenu que la casquette Administration de l'appli. Les règles sont dans l'API (droits, transaction, 409, journal).
import { Button, Chip, Icon, type IconName, SelectField, TextField } from "@orasso/design-system/web";
import {
  type AdminCategory,
  type AdminStyleProposalGroup,
  categoryFamilyLabels,
  categoryIconLabels,
  categoryIcons,
  styleLabels as S,
  STYLE_NAME_MAX,
  styleFamilies,
  styleFitsType,
  type VehicleType,
  vehicleTypes,
} from "@orasso/shared";
import { useState } from "react";
import { data, Form, redirect, useNavigation, useSubmit } from "react-router";

import { requireSuperAdmin } from "../../lib/admin.server";
import { api, apiOrThrow } from "../../lib/api.server";
import type { Route } from "./+types/vehicules-styles";

export function meta() {
  return [
    { title: "Styles · Base véhicules · Administration · Orasso" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

const typeOf = (raw: string | null): VehicleType =>
  vehicleTypes.includes(raw as VehicleType) ? (raw as VehicleType) : "car";

export async function loader({ request }: Route.LoaderArgs) {
  await requireSuperAdmin(request);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("propositions");
  const [styles, queue] = await Promise.all([
    apiOrThrow<AdminCategory[]>(request, "/admin/categories"),
    apiOrThrow<{ items: AdminStyleProposalGroup[]; total: number; nextCursor: string | null }>(
      request,
      `/admin/category-proposals${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  ]);
  return { styles, queue, type: typeOf(url.searchParams.get("type")), done: url.searchParams.get("fait") };
}

export async function action({ request }: Route.ActionArgs) {
  await requireSuperAdmin(request);
  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const type = typeOf(text("type"));
  const age = text("minVehicleAge") ? Number(text("minVehicleAge")) : null;
  const fields = () => ({
    label: text("label"),
    labelM: text("labelM") || null,
    family: text("family"),
    icon: text("icon"),
    minVehicleAge: age,
  });
  const key = encodeURIComponent(text("key"));
  let res: Awaited<ReturnType<typeof api<unknown>>>;
  switch (text("intent")) {
    case "create":
      res = await api(request, "/admin/categories", { method: "POST", json: { ...fields(), vehicleType: type } });
      break;
    case "update": {
      const { family, ...rest } = fields();
      res = await api(request, `/admin/categories/${encodeURIComponent(text("id"))}`, {
        method: "PATCH",
        json: text("country") ? rest : { ...rest, family },
      });
      break;
    }
    case "pause":
    case "resume":
      res = await api(request, `/admin/categories/${encodeURIComponent(text("id"))}`, {
        method: "PATCH",
        json: { active: text("intent") === "resume" },
      });
      break;
    case "order":
      res = await api(request, "/admin/categories/order", {
        method: "PATCH",
        json: { vehicleType: type, ids: text("ids").split(",").filter(Boolean) },
      });
      break;
    case "accept":
      res = await api(request, `/admin/category-proposals/${key}/accept`, {
        method: "POST",
        json: { version: text("version"), ...fields() },
      });
      break;
    case "merge":
      res = await api(request, `/admin/category-proposals/${key}/merge`, {
        method: "POST",
        json: { version: text("version"), categoryId: text("categoryId") },
      });
      break;
    case "decline":
      res = await api(request, `/admin/category-proposals/${key}/decline`, {
        method: "POST",
        json: { version: text("version") },
      });
      break;
    default:
      return data({ error: "Action inconnue." }, { status: 400 });
  }
  if (res.ok) return redirect(`/admin/vehicules/styles?type=${type}&fait=1`);
  return data({ error: res.error.message }, { status: res.status });
}

const typesOf = (s: Pick<AdminCategory, "allowedVehicleTypes">) =>
  vehicleTypes.filter((t) => styleFitsType(s.allowedVehicleTypes, t));

/** Les champs d'un style (création, modification, ajout depuis la file). */
function StyleFields({ style, label, country = false }: { style?: AdminCategory; label?: string; country?: boolean }) {
  return (
    <>
      <TextField
        label={S.fieldLabel}
        name="label"
        required
        maxLength={STYLE_NAME_MAX}
        defaultValue={style?.label ?? label}
      />
      <TextField label={S.fieldLabelM} name="labelM" maxLength={STYLE_NAME_MAX} defaultValue={style?.labelM ?? ""} />
      {country ? (
        <input type="hidden" name="country" value="1" />
      ) : (
        <SelectField
          label={S.fieldFamily}
          name="family"
          defaultValue={style && style.family !== "pays" ? style.family : "genre"}
          options={styleFamilies.map((f) => ({ value: f, label: categoryFamilyLabels[f] }))}
        />
      )}
      <SelectField
        label={S.fieldIcon}
        name="icon"
        defaultValue={style?.icon ?? "star"}
        options={categoryIcons.map((i) => ({ value: i, label: categoryIconLabels[i] ?? i }))}
      />
      <TextField
        label={S.fieldAge}
        name="minVehicleAge"
        type="number"
        min={1}
        max={100}
        defaultValue={style?.minVehicleAge ?? ""}
      />
    </>
  );
}

export default function AdminStyles({ loaderData, actionData }: Route.ComponentProps) {
  const { styles, queue, type, done } = loaderData;
  const busy = useNavigation().state !== "idle";
  const submit = useSubmit();
  const [dragged, setDragged] = useState<string | null>(null);
  const ofType = styles.filter((s) => s.family !== "pays" && styleFitsType(s.allowedVehicleTypes, type));
  const active = ofType.filter((s) => s.active);
  const paused = ofType.filter((s) => !s.active);
  const countries = styles.filter((s) => s.family === "pays");
  const count = (t: VehicleType) =>
    styles.filter((s) => s.family !== "pays" && s.active && styleFitsType(s.allowedVehicleTypes, t)).length;
  const order = (ids: string[]) => submit({ intent: "order", type, ids: ids.join(",") }, { method: "post" });
  /** Déplace `id` à la place de `over` (même famille) : l'ordre de tout le type part à l'API. */
  const moveTo = (id: string, over: string) => {
    if (id === over) return;
    const ids = ofType.map((s) => s.id).filter((x) => x !== id);
    const at = ids.indexOf(over);
    const before = ofType.findIndex((s) => s.id === id) > ofType.findIndex((s) => s.id === over);
    ids.splice(before ? at : at + 1, 0, id);
    order(ids);
  };

  const row = (s: AdminCategory, i: number, family: AdminCategory[]) => {
    const movable = s.active && s.family !== "pays";
    const rule =
      s.makeMode === "whitelist" ? S.makesRule : s.allowedCountries ? S.countriesRule : S.ageRule(s.minVehicleAge);
    return (
      <tr
        key={s.id}
        className={s.active ? undefined : "is-paused"}
        draggable={movable}
        onDragStart={() => setDragged(s.id)}
        onDragOver={(e) => {
          if (dragged && family.some((f) => f.id === dragged)) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragged) moveTo(dragged, s.id);
          setDragged(null);
        }}
        data-testid="style-row"
      >
        <td className="adm-styles__grip" aria-hidden="true">
          {movable ? <Icon name="move" size={16} /> : null}
        </td>
        <td>
          <span className="adm-styles__name">
            <Icon name={s.icon as IconName} size={18} />
            <span>{s.label}</span>
          </span>
          {s.labelM ? <span className="o-t-caption s-muted adm-styles__m">({s.labelM})</span> : null}
        </td>
        <td className="o-t-caption">{rule}</td>
        <td className="o-t-caption">{S.vehicles(s.vehicles[type])}</td>
        <td className="adm-styles__act">
          {s.active ? null : <Chip>{S.pausedState}</Chip>}
          {movable ? (
            <>
              <button
                type="button"
                className="adm-styles__arrow"
                aria-label={`${S.up} ${s.label}`}
                disabled={i === 0 || busy}
                onClick={() => {
                  const prev = family[i - 1];
                  if (prev) moveTo(s.id, prev.id);
                }}
              >
                <Icon name="up" size={16} />
              </button>
              <button
                type="button"
                className="adm-styles__arrow"
                aria-label={`${S.down} ${s.label}`}
                disabled={i === family.length - 1 || busy}
                onClick={() => {
                  const next = family[i + 1];
                  if (next) moveTo(s.id, next.id);
                }}
              >
                <Icon name="down" size={16} />
              </button>
            </>
          ) : null}
          <details className="adm-styles__edit">
            <summary>
              <Icon name="edit" size={16} /> {S.edit}
            </summary>
            <Form method="post" className="s-stack" data-testid="style-edit">
              <input type="hidden" name="intent" value="update" />
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="id" value={s.id} />
              <p className="o-t-caption s-muted">{S.sharedWith(S.typesList(typesOf(s)))}</p>
              <StyleFields style={s} country={s.family === "pays"} />
              <Button type="submit" variant="secondary" icon="check" loading={busy}>
                {S.save}
              </Button>
            </Form>
            <Form method="post">
              <input type="hidden" name="intent" value={s.active ? "pause" : "resume"} />
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="id" value={s.id} />
              <Button type="submit" variant="secondary" icon={s.active ? "wait" : "undo"} loading={busy}>
                {s.active ? S.pause : S.resume}
              </Button>
            </Form>
          </details>
        </td>
      </tr>
    );
  };

  const table = (title: string, rows: AdminCategory[], testId: string) =>
    rows.length ? (
      <div key={testId} className="s-stack s-stack--tight" data-testid={testId}>
        <div className="adm-styles__fh">
          <h3 className="s-h3">{title}</h3>
          <span className="o-t-caption s-muted">{S.styleCount(rows.length)}</span>
        </div>
        <table className="adm-styles__table">
          <tbody>{rows.map((s, i) => row(s, i, rows))}</tbody>
        </table>
      </div>
    ) : null;

  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Administration</div>
          <h1 className="s-title">Base véhicules</h1>
        </div>
      </div>
      <nav className="s-tabs" aria-label="Base véhicules" data-testid="vehicle-base-tabs">
        <a href="/admin/vehicules">
          <Chip>{S.baseTab}</Chip>
        </a>
        <a href={`/admin/vehicules/styles?type=${type}`} aria-current="page">
          <Chip selected>{S.adminTabCount(queue.total)}</Chip>
        </a>
      </nav>
      {done && (
        <p className="s-notice s-notice--ok" role="status" data-testid="styles-done">
          {S.done}
        </p>
      )}
      {actionData?.error && (
        <p className="s-error" role="alert" data-testid="styles-error">
          {actionData.error}
        </p>
      )}
      <div className="adm-styles">
        <section className="orga__panel s-stack" aria-labelledby="styles-title" data-testid="styles-catalog">
          <h2 id="styles-title" className="s-h2">
            {S.adminTab}
          </h2>
          <nav className="s-tabs" aria-label="Type de véhicule" data-testid="styles-types">
            {vehicleTypes.map((t) => (
              <a key={t} href={`/admin/vehicules/styles?type=${t}`} aria-current={t === type ? "page" : undefined}>
                <Chip selected={t === type}>{S.typeTab(t, count(t))}</Chip>
              </a>
            ))}
          </nav>
          <p className="o-t-caption s-muted">{S.adminIntro}</p>
          <details className="adm-styles__add" data-testid="style-create">
            <summary>
              <Icon name="add" size={18} /> {S.addStyleTo(type)}
            </summary>
            <Form method="post" className="s-stack">
              <input type="hidden" name="intent" value="create" />
              <input type="hidden" name="type" value={type} />
              <StyleFields />
              <Button type="submit" variant="secondary" icon="add" loading={busy}>
                {S.addStyle}
              </Button>
            </Form>
          </details>
          {styleFamilies.map((f) =>
            table(
              categoryFamilyLabels[f],
              active.filter((s) => s.family === f),
              `styles-family-${f}`,
            ),
          )}
          {table(S.pausedFamily, paused, "styles-family-paused")}
          {table(S.countriesFamily, countries, "styles-family-pays")}
        </section>

        <aside className="orga__panel s-stack" aria-labelledby="styles-queue" data-testid="style-proposals">
          <div className="adm-styles__fh">
            <h2 id="styles-queue" className="s-h2">
              {S.queueTitle}
            </h2>
            <span className="o-t-caption s-muted">{S.queueCount(queue.total)}</span>
          </div>
          {queue.items.length === 0 ? (
            <p className="s-notice" data-testid="style-proposals-empty">
              {S.queueEmpty}
            </p>
          ) : (
            queue.items.map((g, i) => (
              <ProposalGroup key={g.key} group={g} open={i === 0} styles={styles} type={type} busy={busy} />
            ))
          )}
          {queue.nextCursor ? (
            <a className="o-t-body" href={`/admin/vehicules/styles?type=${type}&propositions=${queue.nextCursor}`}>
              {S.queueTitle} suivants
            </a>
          ) : null}
        </aside>
      </div>
    </>
  );
}

const DAY_MS = 86_400_000;

/** Un groupe de « Styles proposés » (`.r4grp`) : variantes, proposants, les trois gestes. */
function ProposalGroup({
  group: g,
  open,
  styles,
  type,
  busy,
}: {
  group: AdminStyleProposalGroup;
  open: boolean;
  styles: AdminCategory[];
  type: VehicleType;
  busy: boolean;
}) {
  const since = S.sinceDays(Math.floor((Date.now() - new Date(g.since).getTime()) / DAY_MS));
  const variants = g.variants.map((v) => `« ${v.text} » (${v.count})`).join(", ");
  const hidden = (intent: string) => (
    <>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="key" value={g.key} />
      <input type="hidden" name="version" value={g.version} />
    </>
  );
  return (
    <details className="adm-proposal" open={open} data-testid="style-proposal">
      <summary className="adm-proposal__head">
        <span className="adm-proposal__n" aria-hidden="true">
          {g.count}
        </span>
        <span className="s-stack s-stack--tight">
          <strong className="o-never-truncate">{g.label}</strong>
          <span className="o-t-caption s-muted">{S.queueGroup(S.typesList(g.vehicleTypes), variants, since)}</span>
        </span>
        <span className="o-t-label adm-proposal__count">{S.open}</span>
      </summary>
      <p className="o-t-caption">{g.authors.join(", ")}</p>
      {g.existing ? <p className="o-t-caption s-muted">{S.queueExisting(g.existing.label)}</p> : null}
      <Form method="post" className="adm-proposal__act" data-testid="style-proposal-accept">
        {hidden("accept")}
        <StyleFields label={g.label} />
        <Button type="submit" icon="check" loading={busy}>
          {S.accept}
        </Button>
      </Form>
      <Form method="post" className="adm-proposal__act" data-testid="style-proposal-merge">
        {hidden("merge")}
        <SelectField
          label={S.mergeTo}
          name="categoryId"
          required
          defaultValue={g.existing?.id ?? ""}
          placeholder={S.mergeTo}
          options={styles
            .filter((s) => s.active && s.family !== "pays")
            .map((s) => ({ value: s.id, label: `${s.label} · ${S.typesList(typesOf(s))}` }))}
        />
        <Button type="submit" variant="secondary" icon="layers" loading={busy}>
          {S.merge}
        </Button>
      </Form>
      <Form method="post" className="adm-proposal__act" data-testid="style-proposal-decline">
        {hidden("decline")}
        <Button type="submit" variant="secondary" icon="close" loading={busy}>
          {S.decline}
        </Button>
      </Form>
      <p className="o-t-caption s-muted">{S.queueWithVehicle(g.withVehicle)}</p>
    </details>
  );
}
