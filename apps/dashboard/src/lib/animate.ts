"use client";

import { useEffect, useRef, useState } from "react";
import { animate, createTimeline, stagger, type JSAnimation } from "animejs";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Animates a list/grid/table-body's items in with a real stagger, in place
 * of the fixed per-element `--rise-delay` used for single, static page
 * sections. Attach the returned ref directly to the existing container
 * (a `<ul>`, `<TBody>`, a grid `<div>`) - no extra wrapper element, so it
 * works inside a `<table>` where a wrapping `<div>` would be invalid HTML.
 */
export function useStaggerIn<T extends HTMLElement>(
  itemSelector: string,
  opts?: {
    delay?: number;
    resetKey?: unknown;
    /** [cols, rows] - a real 2D stagger (origin center, radiating outward) for grid-shaped layouts (module toggle grids, stat tiles) instead of the linear list order, so a grid doesn't animate like a list wearing a grid's clothes. */
    grid?: [number, number];
  },
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const items = el.querySelectorAll(itemSelector);
    if (items.length === 0) return;

    const grid = opts?.grid;
    animate(items, {
      opacity: [0, 1],
      translateY: grid ? [10, 0] : [8, 0],
      ...(grid ? { scale: [0.96, 1] } : {}),
      duration: grid ? 520 : 420,
      delay: stagger(opts?.delay ?? 40, grid ? { grid, from: "center" } : undefined),
      ease: "outQuint",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.resetKey]);

  return ref;
}

/**
 * A one-shot elastic "pop" on a single element whenever `watch` changes -
 * for a value that just flipped (a badge count, a status pill, a toggled
 * switch's label) rather than a page-load entrance. Distinct physics
 * (outElastic, not outQuint) so a live value change reads differently from
 * a list appearing.
 */
export function usePopIn<T extends HTMLElement>(watch: unknown) {
  const ref = useRef<T>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    animate(el, {
      scale: [0.85, 1],
      duration: 480,
      ease: "outElastic(1, .6)",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch]);

  return ref;
}

/**
 * Counts a number up from its previous value to `value` (anime.js animating
 * a plain JS object property, not a DOM node). Use for real stats that just
 * became available over RPC - a static number appearing on load doesn't
 * earn this, but a count that ticks up when the page actually knows the
 * real total is a genuine "alive" moment, not decoration.
 */
export function useCountUp(value: number, opts?: { duration?: number }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(value);
      prevRef.current = value;
      return;
    }
    const from = { v: prevRef.current };
    const anim = animate(from, {
      v: value,
      duration: opts?.duration ?? 900,
      ease: "outExpo",
      onUpdate: () => setDisplay(Math.round(from.v)),
    });
    prevRef.current = value;
    return () => {
      anim.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return display;
}

/**
 * Full orchestrated entrance for the handful of "showcase" screens that
 * deserve one (guild overview, system panel) - chains header -> stat strip
 * -> first panel via anime.js timeline position offsets instead of hand-typed
 * `--rise-delay` ms values. Everywhere else keeps the lighter `.rise` CSS
 * class; this is the one place per session that spends the extra motion
 * budget (see the frontend-design principle: one orchestrated moment, not
 * every page doing the maximal version).
 */
export function usePageTimeline(refs: {
  header: React.RefObject<HTMLElement | null>;
  stats?: React.RefObject<HTMLElement | null>;
  panel: React.RefObject<HTMLElement | null>;
}) {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const { header, stats, panel } = refs;
    if (!header.current || !panel.current) return;

    const tl = createTimeline({ defaults: { duration: 420, ease: "outQuint" } });
    tl.add(header.current, { opacity: [0, 1], translateY: [8, 0] });
    if (stats?.current) {
      tl.add(
        stats.current,
        { opacity: [0, 1], translateY: [8, 0] },
        "-=280",
      );
    }
    tl.add(panel.current, { opacity: [0, 1], translateY: [8, 0] }, "-=280");

    return () => {
      tl.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export type { JSAnimation };
