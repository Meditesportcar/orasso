// La feuille des commentaires d'une publication, sur le site (lot R8k2, maquette R8.3 `CMSHEET`) : un dialogue (plein écran à 390 px)
// avec la liste du plus ancien au plus récent (« Voir plus »), les réponses repliées sous leur commentaire, un champ de 300 caractères,
// « @ » qui propose des pseudos, les menus (Supprimer, Signaler, Couper les commentaires). Aucune règle ici : l'API les tient.
// Elle prend `post` et `onChange(post)` et ne suppose pas le Fil.
import { Icon } from "@orasso/design-system/web";
import {
  commentCounter,
  commentIssue,
  commentsTitle,
  type FeedCommentView,
  type FeedPostView,
  feedAgo,
  insertMention,
  feedCommentScreenLabels as L,
  type MentionDraft,
  mentionParts,
  mentionQuery,
  type PendingComment,
  repliesLine,
} from "@orasso/shared";
import { useEffect, useId, useRef, useState } from "react";

import { PersonAvatar } from "../People";
import { ReportDialog } from "../ReportDialog";
import { onAccountChange } from "./commentsLive";
import { useComments, useMentionSuggestions } from "./useComments";
import "../../styles/fil-comments.css";

type Props = {
  post: FeedPostView;
  open: boolean;
  /** Le bouton « Commenter » a ouvert la feuille : le champ prend la main. */
  focus: boolean;
  onClose: () => void;
  onChange: (post: FeedPostView) => void;
};

function CommentText({ c }: { c: FeedCommentView }) {
  return (
    <p className="fil-cm__text">
      {mentionParts(c.text, c.mentions).map((part, i) =>
        part.mention ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: morceaux d'un texte, sans identité.
          <span key={i} className="fil-mention">
            {part.text}
          </span>
        ) : (
          part.text
        ),
      )}
    </p>
  );
}

export function CommentsDialog({ post, open, focus, onClose, onChange }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const ctl = useComments(post, open, onChange);
  const { sheet } = ctl;
  const text = ctl.draft.text;
  const replyTo = ctl.draft.replyTo;
  const setText = (value: string) => ctl.setDraft({ text: value });
  const setReplyTo = (value: { id: string; pseudo: string } | null) => ctl.setDraft({ replyTo: value });
  const [caret, setCaret] = useState(0);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [postMenu, setPostMenu] = useState(false);

  // Un autre compte (ou aucun) : ni le brouillon, ni la réponse en cours, ni les menus ne passent au suivant.
  useEffect(
    () =>
      onAccountChange(() => {
        setCaret(0);
        setMenuFor(null);
        setPostMenu(false);
      }),
    [],
  );
  const lastSent = useRef<{ text: string; at: number } | null>(null);

  const draft: MentionDraft | null = open && !post.commentsOff ? mentionQuery(text, caret) : null;
  const suggestions = useMentionSuggestions(post.id, draft);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) return;
    setMenuFor(null);
    setPostMenu(false);
    if (!focus || post.commentsOff) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [open, focus, post.commentsOff]);

  function reply(target: FeedCommentView) {
    const prefix = `@${target.author.pseudo} `;
    setReplyTo({ id: target.id, pseudo: target.author.pseudo });
    setText(prefix);
    setCaret(prefix.length);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(prefix.length, prefix.length);
    });
  }

  function pick(pseudo: string) {
    const next = insertMention(text, caret, pseudo);
    if (!next) return;
    setText(next.text);
    setCaret(next.caret);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.caret, next.caret);
    });
  }

  function submit(event?: React.FormEvent) {
    event?.preventDefault();
    if (commentIssue(text) !== null || post.commentsOff) return;
    // Un double clic très rapide n'envoie qu'un commentaire.
    const now = Date.now();
    // Le même texte renvoyé dans la foulée (double toucher avant que le champ vidé soit rendu) ne part qu'une fois.
    if (lastSent.current && lastSent.current.text === text && now - lastSent.current.at < 600) return;
    lastSent.current = { text, at: now };
    ctl.send(text, replyTo?.id ?? null);
    ctl.setDraft({ text: "", replyTo: null });
    setCaret(0);
  }

  const issue = commentIssue(text);
  const counter = commentCounter(text);
  const pendingTop = sheet.pending.filter((p) => p.parentId === null);
  const empty = sheet.loaded && sheet.items.length === 0 && pendingTop.length === 0 && !post.commentsOff;

  const menu = (c: FeedCommentView) => (
    <div className="fil-cm__menu" role="menu" data-testid="feed-comment-menu">
      {c.mine || c.canDelete ? (
        <button
          type="button"
          role="menuitem"
          className="fil-cm__menurow is-out"
          onClick={() => {
            setMenuFor(null);
            void ctl.remove(c);
          }}
          data-testid="feed-comment-delete"
        >
          <Icon name="trash" size={16} /> {L.deleteComment}
        </button>
      ) : null}
      {c.mine ? null : (
        <span className="fil-cm__menurow" data-testid="feed-comment-report">
          <ReportDialog targetType="feed_comment" targetId={c.id} look="link" label={L.reportComment} />
        </span>
      )}
    </div>
  );

  const row = (c: FeedCommentView, isReply: boolean) => (
    <div key={c.id} className={isReply ? "fil-cm is-sub" : "fil-cm"} data-testid="feed-comment">
      <PersonAvatar url={c.author.avatarUrl} pseudo={c.author.pseudo} size={28} />
      <div className="fil-cm__body">
        <p className="fil-cm__head">
          <b>{c.author.pseudo}</b>
          <small>{feedAgo(c.createdAt, new Date())}</small>
        </p>
        <CommentText c={c} />
        <div className="fil-cm__acts">
          <button
            type="button"
            className={c.reactedByMe ? "fil-fire is-sm is-on" : "fil-fire is-sm"}
            aria-pressed={c.reactedByMe}
            aria-label={L.fireOnComment}
            onClick={() => ctl.fire(c)}
            data-testid="feed-comment-fire"
          >
            <Icon name="fire" size={15} />
            <span data-testid="feed-comment-fire-count">{c.reactionsCount}</span>
          </button>
          {isReply ? null : (
            <button
              type="button"
              className="fil-rep"
              aria-label={L.replyToLabel(c.author.pseudo)}
              onClick={() => reply(c)}
              data-testid="feed-comment-reply"
            >
              <Icon name="chat" size={15} />
              {L.reply}
            </button>
          )}
        </div>
        {menuFor === c.id ? menu(c) : null}
      </div>
      <button
        type="button"
        className="fil-cm__dots"
        aria-label={L.more}
        aria-expanded={menuFor === c.id}
        onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}
        data-testid="feed-comment-more"
      >
        <Icon name="more" size={20} />
      </button>
    </div>
  );

  const pendingRow = (p: PendingComment) => (
    <div
      key={p.clientId}
      className={p.status === "sending" ? "fil-cm__pending is-sending" : "fil-cm__pending"}
      data-testid="feed-comment-pending"
    >
      <p className="fil-cm__text">{p.text}</p>
      {p.status === "failed" ? (
        <p className="fil-cm__failed">
          <Icon name="alert" size={15} />
          <span role="alert" data-testid="feed-comment-notsent">
            {L.notSent}
          </span>
          <button
            type="button"
            className="fil-rep"
            aria-label={L.retryLabel}
            onClick={() => ctl.retry(p.clientId)}
            data-testid="feed-comment-retry"
          >
            <Icon name="undo" size={15} />
            {L.retry}
          </button>
        </p>
      ) : (
        <small className="fil-cm__sending">{L.sending}</small>
      )}
    </div>
  );

  return (
    <dialog
      ref={ref}
      className="fil-cm-sheet"
      aria-labelledby={titleId}
      onClose={onClose}
      data-testid="feed-comments-sheet"
    >
      <div className="fil-cm-sheet__head">
        <h2 id={titleId} className="s-h2" data-testid="feed-comments-title">
          {commentsTitle(post.commentsCount)}
        </h2>
        {post.mine ? (
          <button
            type="button"
            className="fil-cm-sheet__btn"
            aria-label={L.more}
            aria-expanded={postMenu}
            onClick={() => setPostMenu((v) => !v)}
            data-testid="feed-comments-menu"
          >
            <Icon name="more" size={20} />
          </button>
        ) : null}
        <button
          type="button"
          className="fil-cm-sheet__btn"
          aria-label={L.close}
          onClick={() => ref.current?.close()}
          data-testid="feed-comments-close"
        >
          <Icon name="close" size={20} />
        </button>
      </div>
      {postMenu ? (
        <div className="fil-cm__menu is-head" role="menu">
          <button
            type="button"
            role="menuitem"
            className={post.commentsOff ? "fil-cm__menurow" : "fil-cm__menurow is-out"}
            onClick={() => {
              setPostMenu(false);
              void ctl.setOff(!post.commentsOff);
            }}
            data-testid="feed-comments-toggle-off"
          >
            <Icon name={post.commentsOff ? "undo" : "close"} size={16} />
            <span>
              {post.commentsOff ? L.commentsOn : L.commentsOff}
              <small>{post.commentsOff ? L.commentsOnHint : L.commentsOffHint}</small>
            </span>
          </button>
        </div>
      ) : null}
      <div className="fil-cm-sheet__list" data-testid="feed-comments-list">
        {ctl.gone ? (
          <p className="s-error" role="alert" data-testid="feed-comments-gone">
            {L.goneNotice}
          </p>
        ) : ctl.loadError && !sheet.loaded ? (
          <div className="s-stack">
            <p className="s-error" role="alert">
              {ctl.loadError}
            </p>
            <button type="button" className="fil-rep" onClick={ctl.retryLoad} data-testid="feed-comments-retry">
              <Icon name="undo" size={15} />
              {L.retry}
            </button>
          </div>
        ) : !sheet.loaded ? (
          <p className="s-muted" data-testid="feed-comments-waiting">
            …
          </p>
        ) : empty ? (
          <p className="s-muted" data-testid="feed-comments-empty">
            {L.empty}
          </p>
        ) : null}
        {sheet.items.map((m) => {
          const r = sheet.replies[m.id];
          const pendingReplies = sheet.pending.filter((p) => p.parentId === m.id);
          return (
            <div key={m.id} className="fil-cm__item">
              {row(m, false)}
              {m.repliesCount > 0 || pendingReplies.length > 0 ? (
                <div className="fil-cm__repwrap">
                  {m.repliesCount > 0 ? (
                    <button
                      type="button"
                      className="fil-more"
                      aria-expanded={Boolean(r?.open)}
                      onClick={() => ctl.toggleReplies(m.id)}
                      data-testid="feed-comment-replies-toggle"
                    >
                      {r?.open ? L.hideReplies : repliesLine(m.repliesCount)}
                      <Icon name={r?.open ? "up" : "down"} size={14} />
                    </button>
                  ) : null}
                  {r?.open ? (
                    <div className="fil-cm__replies" data-testid="feed-comment-replies">
                      {r.items.map((x) => row(x, true))}
                      {r.cursor ? (
                        <button
                          type="button"
                          className="fil-more"
                          aria-label={L.loadMoreReplies}
                          onClick={() => ctl.loadMoreReplies(m.id)}
                          data-testid="feed-comment-replies-more"
                        >
                          {L.loadMore}
                        </button>
                      ) : null}
                      {pendingReplies.map(pendingRow)}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
        {sheet.cursor ? (
          <button
            type="button"
            className="fil-more"
            aria-label={L.loadMoreComments}
            onClick={ctl.loadMore}
            data-testid="feed-comments-more"
          >
            {L.loadMore}
            <Icon name="down" size={14} />
          </button>
        ) : null}
        {ctl.loadError && sheet.loaded ? (
          <p className="s-error" role="alert">
            {ctl.loadError}
          </p>
        ) : null}
        {pendingTop.map(pendingRow)}
        {ctl.actionError ? (
          <p className="s-error" role="alert">
            {ctl.actionError}
          </p>
        ) : null}
      </div>
      {ctl.gone ? null : post.commentsOff ? (
        <p className="s-muted fil-cm-sheet__off" data-testid="feed-comments-off">
          {L.off}
        </p>
      ) : (
        <form className="fil-cm-sheet__composer" onSubmit={submit}>
          {suggestions.length > 0 ? (
            <ul className="fil-sugg" aria-label={L.mentionList} data-testid="feed-mention-suggestions">
              {suggestions.map((s) => (
                <li key={s.pseudo}>
                  <button
                    type="button"
                    onClick={() => pick(s.pseudo)}
                    aria-label={`${s.pseudo}, ${L.mentionWhy[s.why]}`}
                    data-testid="feed-mention-suggestion"
                  >
                    <PersonAvatar url={s.avatarUrl} pseudo={s.pseudo} size={28} />
                    <span>
                      <b>{s.pseudo}</b>
                      <small>{L.mentionWhy[s.why]}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {replyTo ? (
            <div className="fil-repto" data-testid="feed-comment-replyto">
              <Icon name="chat" size={15} />
              <span>{L.replyingTo(replyTo.pseudo)}</span>
              <button
                type="button"
                aria-label={L.cancelReply}
                onClick={() => {
                  setReplyTo(null);
                  setText("");
                }}
                data-testid="feed-comment-replyto-cancel"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ) : null}
          <div className="fil-cmin">
            <input
              ref={inputRef}
              type="text"
              value={text}
              maxLength={300}
              placeholder={replyTo ? L.replyPlaceholder : L.placeholder}
              aria-label={L.inputLabel}
              autoComplete="off"
              onChange={(e) => {
                setText(e.target.value);
                setCaret(e.target.selectionStart ?? e.target.value.length);
              }}
              onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
              data-testid="feed-comment-input"
            />
            <button
              type="submit"
              className="fil-cmin__send"
              aria-label={L.send}
              disabled={issue !== null}
              data-testid="feed-comment-send"
            >
              <Icon name="send" size={18} />
            </button>
          </div>
          {counter.shown ? (
            <small className="fil-cmin__counter" data-testid="feed-comment-counter">
              {L.counter(counter.length, counter.max)}
            </small>
          ) : null}
        </form>
      )}
    </dialog>
  );
}
