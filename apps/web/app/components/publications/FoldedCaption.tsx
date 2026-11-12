// La légende d'une publication posée dans une liste « Une par une » : repliée après trois lignes (« plus » la déroule, « moins »
// la replie ; règle `captionFold`). Hors d'une liste qui la demande (`FoldCaptions`), la légende reste entière : la carte du Fil
// ne change pas. Le pli est du CSS (`line-clamp`) ; la mesure compte les lignes du texte entier.
import { CAPTION_FOLD_LINES, captionFold, publicationsLabels as L } from "@orasso/shared";
import { createContext, type ReactNode, useContext, useLayoutEffect, useRef, useState } from "react";

const FoldContext = createContext(false);

/** Les cartes posées dessous replient leur légende. */
export function FoldCaptions({ children }: { children: ReactNode }) {
  return <FoldContext.Provider value={true}>{children}</FoldContext.Provider>;
}

export function FoldedCaption({ text, testId }: { text: string; testId?: string }) {
  const fold = useContext(FoldContext);
  const ref = useRef<HTMLParagraphElement>(null);
  const [lines, setLines] = useState(0);
  const [expanded, setExpanded] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: la mesure suit le texte.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!fold || !el) return;
    const measure = () => {
      const line = Number.parseFloat(getComputedStyle(el).lineHeight) || 20;
      // Hauteur du texte entier : le pli est levé le temps de la mesure.
      const clamp = el.style.getPropertyValue("-webkit-line-clamp");
      el.style.setProperty("-webkit-line-clamp", "unset");
      const n = Math.round(el.scrollHeight / line);
      if (clamp) el.style.setProperty("-webkit-line-clamp", clamp);
      else el.style.removeProperty("-webkit-line-clamp");
      setLines(n);
    };
    measure();
    const obs = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    obs?.observe(el);
    return () => obs?.disconnect();
  }, [fold, text]);
  if (!fold) {
    return (
      <p className="o-t-body" data-testid={testId}>
        {text}
      </p>
    );
  }
  const state = captionFold({ lines, expanded });
  return (
    <>
      <p
        ref={ref}
        className={state.clamp || lines === 0 ? "o-t-body pub-caption pub-caption--clamp" : "o-t-body pub-caption"}
        style={{ ["--pub-lines" as string]: CAPTION_FOLD_LINES }}
        data-testid={testId}
      >
        {text}
      </p>
      {state.toggle ? (
        <button
          type="button"
          className="pub-caption__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((on) => !on)}
          data-testid="publication-caption-toggle"
        >
          {state.toggle === "more" ? L.captionMore : L.captionLess}
        </button>
      ) : null}
    </>
  );
}
