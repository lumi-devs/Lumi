"use client";

import { useRef } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";

/**
 * Mouse-driven 3D tilt for hero-weight cards (module cards, guild tiles,
 * feature rows) — not for list rows or anything dense, where a dozen tilting
 * siblings reads as broken rather than premium. Falls back to a plain `div`
 * under `prefers-reduced-motion`.
 */
export function TiltCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(py, [0, 1], [7, -7]), {
    stiffness: 300,
    damping: 30,
  });
  const rotateY = useSpring(useTransform(px, [0, 1], [-7, 7]), {
    stiffness: 300,
    damping: 30,
  });

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    px.set((e.clientX - rect.left) / rect.width);
    py.set((e.clientY - rect.top) / rect.height);
  }

  function onMouseLeave() {
    px.set(0.5);
    py.set(0.5);
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ rotateX, rotateY, transformPerspective: 700 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
