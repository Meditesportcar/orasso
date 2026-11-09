// Le canevas 9:16 d'une story sur le site (lot R7f3, maquettes R7.22 et R7.8) : la photo posée au centre sur un fond = la même
// image floutée (`filter: blur`) et assombrie, cadrée par `frame` (le même `Frame` que l'appli et que le serveur : zoom
// relatif à « tenir en entier », décalage en pixels du canevas 1080 × 1920). Tout est en pourcentages du canevas : aucune
// mesure, le rendu suit la largeur. `onFrame` : on déplace à la souris ou au doigt (Pointer Events, un doigt qui glisse, deux
// qui pincent) et on zoome à la molette. `plateRects` : la plaque floutée est simulée par un cadre plein (le vrai flou est
// celui du serveur : aucun floutage local). Les rectangles sont dans la photo d'origine ; `mapRect` les place dans le canevas.
import {
  type Frame,
  frameToCanvas,
  storyPublishLabels as L,
  mapRect,
  moveFrame,
  type PlateRect,
  STORY_H,
  STORY_W,
} from "@orasso/shared";
import { type ReactNode, type PointerEvent as ReactPointerEvent, useEffect, useRef } from "react";

import "../../styles/stories.css";

type Gesture = {
  frame: Frame;
  pointers: Map<number, { x: number; y: number }>;
  /** Écartement et milieu des deux doigts au début du pincement. */
  pinch: { distance: number; mid: { x: number; y: number } } | null;
  origin: { x: number; y: number } | null;
};

export function Canvas({
  src,
  width,
  height,
  frame,
  onFrame,
  plateRects,
  children,
  testId,
}: {
  src: string;
  /** La photo, en pixels. */
  width: number;
  height: number;
  frame: Frame;
  onFrame?: (next: Frame) => void;
  plateRects?: readonly PlateRect[];
  children?: ReactNode;
  testId?: string;
}) {
  const box = frameToCanvas(frame, width, height);
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const latest = useRef({ frame, onFrame, width, height });
  latest.current = { frame, onFrame, width, height };

  // La molette zoome ; l'écouteur n'est pas passif (la page ne défile pas pendant qu'on zoome).
  useEffect(() => {
    const el = root.current;
    if (!el || !onFrame) return;
    const wheel = (e: WheelEvent) => {
      const { frame: f, onFrame: apply, width: w, height: h } = latest.current;
      if (!apply) return;
      e.preventDefault();
      apply(moveFrame(f, Math.exp(-e.deltaY * 0.0015), 0, 0, w, h));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [onFrame]);

  const cpv = () => {
    const r = root.current?.getBoundingClientRect();
    return r && r.width > 0 ? STORY_W / r.width : 1;
  };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!onFrame) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const g = gesture.current ?? { frame, pointers: new Map(), pinch: null, origin: null };
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    g.frame = latest.current.frame;
    g.origin = { x: e.clientX, y: e.clientY };
    g.pinch = null;
    gesture.current = g;
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    const { onFrame: apply, width: w, height: h } = latest.current;
    if (!g || !apply || !g.pointers.has(e.pointerId)) return;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const k = cpv();
    const [a, b] = [...g.pointers.values()];
    if (a && b) {
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (!g.pinch) {
        g.pinch = { distance, mid };
        g.frame = latest.current.frame;
      }
      apply(
        moveFrame(g.frame, distance / g.pinch.distance, (mid.x - g.pinch.mid.x) * k, (mid.y - g.pinch.mid.y) * k, w, h),
      );
      return;
    }
    if (g.pinch) {
      // Un doigt levé : on repart de là, sans saut.
      g.pinch = null;
      g.frame = latest.current.frame;
      g.origin = { x: e.clientX, y: e.clientY };
    }
    const from = g.origin ?? { x: e.clientX, y: e.clientY };
    apply(moveFrame(g.frame, 1, (e.clientX - from.x) * k, (e.clientY - from.y) * k, w, h));
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    g.pointers.delete(e.pointerId);
    g.pinch = null;
    g.frame = latest.current.frame;
    g.origin = g.pointers.size ? ([...g.pointers.values()][0] ?? null) : null;
    if (!g.pointers.size) gesture.current = null;
  };

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    // biome-ignore lint/a11y/useSemanticElements: une surface de glissement (pointeur et molette), pas un groupe de champs.
    <div
      ref={root}
      className={onFrame ? "story-canvas story-canvas--live" : "story-canvas"}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      data-testid={testId}
      role="group"
      aria-label={onFrame ? L.fitHintMouse : L.previewTitle}
    >
      <img className="story-canvas__back" src={src} alt="" draggable={false} />
      <div className="story-canvas__dim" />
      <img
        className="story-canvas__front"
        src={src}
        alt=""
        draggable={false}
        style={{
          left: pct(box.left, STORY_W),
          top: pct(box.top, STORY_H),
          width: pct(box.width, STORY_W),
          height: pct(box.height, STORY_H),
        }}
      />
      {plateRects?.map((r, i) => {
        const m = mapRect(r, frame, { width, height });
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: les cadres n'ont pas d'identifiant ; l'ordre est stable.
            key={i}
            className="story-canvas__plate"
            data-testid="story-plate-mask"
            style={{
              left: `${m.x * 100}%`,
              top: `${m.y * 100}%`,
              width: `${m.w * 100}%`,
              height: `${m.h * 100}%`,
              transform: m.angle ? `rotate(${m.angle}deg)` : undefined,
            }}
          />
        );
      })}
      {children}
    </div>
  );
}
