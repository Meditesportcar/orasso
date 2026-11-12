// L'onglet « Mentions · N » d'une page, sur le site (lot R8g, maquette R8.6 `menRow` et R9.3) : ce que les autres publient en
// citant la page. Lu dans le navigateur (`GET /authors/:key/mentions`, cookie de session), page par page. Ces publications **restent
// chez leur auteur** : une ligne ouvre la publication, le nom de la personne ouvre son profil. Pour un responsable de la page :
// « … » → « Masquer de la page » / « Remettre sur la page » (l'API revérifie les droits, second facteur compris). Une panne n'est
// jamais « Personne n'a encore cité cette page. ».
import { Button, Icon, OLoader } from "@orasso/design-system/web";
import { pagesLabels as L, type MentionItem, type MentionsPage, mentionLine, publicationPath } from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import "../../styles/pages.css";
import { apiFetch } from "../../lib/api.client";

type State = { items: MentionItem[]; next: string | null; loading: boolean; loaded: boolean; error: boolean };

const merge = (list: MentionItem[], page: MentionItem[]): MentionItem[] => {
  const seen = new Set(list.map((i) => i.post.id));
  return [...list, ...page.filter((i) => !seen.has(i.post.id))];
};

const pathOf = (key: string, cursor: string | null, hidden: boolean) => {
  const q = new URLSearchParams();
  if (cursor) q.set("cursor", cursor);
  if (hidden) q.set("hidden", "1");
  const qs = q.toString();
  return `/authors/${encodeURIComponent(key)}/mentions${qs ? `?${qs}` : ""}`;
};

/** La liste, page par page ; `manage` : un responsable (la liste rend les masquées, `hidden=1` ; un 403 ramène à la liste ordinaire). */
function useMentions(pageKey: string, manage: boolean) {
  const [state, setState] = useState<State>({ items: [], next: null, loading: true, loaded: false, error: false });
  const [seeHidden, setSeeHidden] = useState(false);
  const mode = useRef(false);
  const cursor = useRef<string | null>(null);
  const seq = useRef(0);

  const read = useCallback(
    async (first: boolean) => {
      const mine = first ? ++seq.current : seq.current;
      setState((s) => ({ ...s, loading: true, error: false }));
      let res = await apiFetch<MentionsPage>(
        pathOf(pageKey, first ? null : cursor.current, first ? manage : mode.current),
      );
      if (first) {
        mode.current = manage;
        if (!res.ok && manage && res.status === 403) {
          mode.current = false;
          res = await apiFetch<MentionsPage>(pathOf(pageKey, null, false));
        }
      }
      if (mine !== seq.current) return;
      if (!res.ok) return setState((s) => ({ ...s, loading: false, error: true }));
      if (first) setSeeHidden(mode.current);
      cursor.current = res.data.nextCursor;
      setState((s) => ({
        items: first ? res.data.items : merge(s.items, res.data.items),
        next: res.data.nextCursor,
        loading: false,
        loaded: true,
        error: false,
      }));
    },
    [pageKey, manage],
  );

  useEffect(() => {
    cursor.current = null;
    setState({ items: [], next: null, loading: true, loaded: false, error: false });
    void read(true);
    return () => {
      seq.current++;
    };
  }, [read]);

  const setHidden = (postId: string, hidden: boolean) =>
    setState((s) => ({
      ...s,
      items: mode.current
        ? s.items.map((i) => (i.post.id === postId ? { ...i, hidden } : i))
        : s.items.filter((i) => i.post.id !== postId),
    }));

  return { ...state, reload: () => read(true), more: () => read(false), setHidden, seeHidden };
}

function Row({
  item,
  pageName,
  manage,
  busy,
  onToggle,
}: {
  item: MentionItem;
  pageName: string;
  manage: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const { post } = item;
  const line = mentionLine(item, pageName);
  const photo = post.photos[0];
  const person = post.author.kind === "user";
  return (
    <li className="pg-men" data-testid="mention-row">
      <a
        className="pg-men__thumb"
        href={publicationPath(post.id, { web: true })}
        aria-label={`${L.mentionOpen} : ${post.author.name}`}
        data-testid="mention-open"
      >
        {photo ? <img src={photo.url} alt="" loading="lazy" decoding="async" /> : null}
      </a>
      <div className="pg-men__text">
        {person ? (
          <a
            className="pg-men__author"
            href={`/u/${encodeURIComponent(post.author.pseudo)}`}
            aria-label={L.mentionAuthor(post.author.name)}
            data-testid="mention-author"
          >
            {post.author.avatarUrl ? (
              <img src={post.author.avatarUrl} alt="" />
            ) : (
              <i aria-hidden="true">{post.author.name.charAt(0)}</i>
            )}
            <b>{post.author.name}</b>
          </a>
        ) : (
          <span className="pg-men__author" data-testid="mention-author">
            {post.author.avatarUrl ? (
              <img src={post.author.avatarUrl} alt="" />
            ) : (
              <i aria-hidden="true">{post.author.name.charAt(0)}</i>
            )}
            <b>{post.author.name}</b>
          </span>
        )}
        {line.text ? <small data-testid="mention-line">{line.text}</small> : null}
        {line.commercial ? (
          <span className="pg-men__tag" data-testid="mention-commercial">
            <Icon name="share" size={13} />
            {L.commercialTag}
          </span>
        ) : null}
        {item.hidden ? (
          <span className="pg-men__tag pg-men__tag--on" data-testid="mention-hidden">
            {L.hiddenTag}
          </span>
        ) : null}
      </div>
      {manage ? (
        <details className="pt-more pg-men__more">
          <summary className="pt-side__btn" aria-label={L.moreTitle} title={L.moreTitle} data-testid="mention-more">
            <Icon name="more" size={20} />
          </summary>
          <div className="pt-more__sheet">
            <button
              type="button"
              className="pg-men__hide"
              disabled={busy}
              onClick={(e) => {
                // Le menu se referme une fois l'action lancée.
                e.currentTarget.closest("details")?.removeAttribute("open");
                onToggle();
              }}
              data-testid="mention-hide"
            >
              <Icon name={item.hidden ? "eye" : "eyeOff"} size={16} />
              {item.hidden ? L.unhide : L.hide}
            </button>
          </div>
        </details>
      ) : null}
    </li>
  );
}

export function PageMentions({
  pageKey,
  pageName,
  manage,
  onHiddenChange,
}: {
  /** La clé de la page : `s:<structure>` ou `p:<fiche pro>` (aussi la cible de « Masquer »). */
  pageKey: string;
  pageName: string;
  /** Le regard est celui d'un responsable de la page (l'API revérifie). */
  manage: boolean;
  /** Une mention masquée (`-1`) ou remise (`+1`) : le nombre de l'onglet suit. */
  onHiddenChange?: (delta: number) => void;
}) {
  const list = useMentions(pageKey, manage);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = manage && list.seeHidden;

  async function toggle(item: MentionItem) {
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/mentions/${encodeURIComponent(pageKey)}/${encodeURIComponent(item.post.id)}/hidden`, {
      method: item.hidden ? "DELETE" : "PUT",
    });
    setBusy(false);
    if (!res.ok) return setError(res.error.message || L.hideError);
    list.setHidden(item.post.id, !item.hidden);
    onHiddenChange?.(item.hidden ? 1 : -1);
  }

  if (list.loading && !list.loaded)
    return (
      <div className="pub-state pub-state--wait" role="status">
        <OLoader size={64} label={L.mentionsLoading} />
      </div>
    );
  if (list.error && !list.loaded)
    return (
      <div className="pub-state" role="alert" data-testid="load-error">
        <p className="o-t-body">{L.mentionsError}</p>
        <Button variant="secondary" icon="undo" onClick={() => void list.reload()}>
          {L.mentionsRetry}
        </Button>
      </div>
    );
  if (list.items.length === 0)
    return (
      <p className="s-notice" data-testid="mentions-empty">
        {L.mentionsEmpty}
      </p>
    );
  return (
    <div className="pg-mentions" data-testid="page-mentions">
      {error ? (
        <p className="s-error" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="pg-men-list">
        {list.items.map((item) => (
          <Row
            key={item.post.id}
            item={item}
            pageName={pageName}
            manage={canManage}
            busy={busy}
            onToggle={() => void toggle(item)}
          />
        ))}
      </ul>
      {list.error ? (
        <p className="s-error" role="alert">
          {L.mentionsError}
        </p>
      ) : null}
      {list.next ? (
        <Button
          variant="secondary"
          icon="down"
          disabled={list.loading}
          onClick={() => void list.more()}
          data-testid={list.error ? "mentions-retry" : "mentions-more"}
        >
          {list.error ? L.mentionsRetry : L.mentionsMore}
        </Button>
      ) : null}
    </div>
  );
}
