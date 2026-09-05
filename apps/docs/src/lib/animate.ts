"use client";

import { useEffect, useRef } from "react";
import { animate, stagger } from "animejs";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Staggers a container's children in on mount — for the hero's feature/track
 * card grid and similar landing-page groupings. Attach the returned ref to
 * the existing container; no extra wrapper element required. Respects
 * `prefers-reduced-motion` by skipping the animation entirely (elements are
 * already in their final visible position, so nothing needs a fallback).
 */
export function useStaggerIn<T extends HTMLElement>(
  itemSelector: string,
  opts?: { delay?: number },
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const selector = itemSelector.trimStart().startsWith(">")
      ? `:scope ${itemSelector.trimStart()}`
      : itemSelector;
    const items = el.querySelectorAll(selector);
    if (items.length === 0) return;

    animate(items, {
      opacity: [0, 1],
      translateY: [10, 0],
      duration: 480,
      delay: stagger(opts?.delay ?? 70),
      ease: "outQuint",
    });
  }, []);

  return ref;
}

/**
 * Shared spring feel for `motion/react` interactions (the magnetic CTA) so
 * hover physics stay consistent with the dashboard's SOFT spring rather than
 * each component picking its own stiffness/damping.
 */
export const SpringSoft = { type: "spring", stiffness: 260, damping: 26 } as const;

/**
 * Cursor-tracked glow for the `.spotlight` utility (globals.css) — sets the
 * CSS custom properties the radial-gradient reads, directly on the event
 * target, so there's no re-render per mousemove frame.
 */
export function spotlightHandler(e: React.MouseEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
}
