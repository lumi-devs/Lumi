"use client";

import { motion, useReducedMotion } from "motion/react";

// Distinct from `.pulse-live` (that means "genuinely online right now").
// `icon` must be a rendered element, not a component reference - passing the
// bare Lucide component from a Server Component parent crashes the RSC
// boundary.
export function PulseIcon({ icon }: { icon: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <span className="relative flex size-14 items-center justify-center">
      {reduce ? null : (
        <>
          <motion.span
            className="absolute inset-0 rounded-full bg-accent-soft"
            animate={{ scale: [1, 1.7], opacity: [0.55, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
          />
          <motion.span
            className="absolute inset-0 rounded-full bg-accent-soft"
            animate={{ scale: [1, 1.7], opacity: [0.55, 0] }}
            transition={{
              duration: 2.2,
              repeat: Infinity,
              ease: "easeOut",
              delay: 1.1,
            }}
          />
        </>
      )}
      <span className="relative flex size-11 items-center justify-center rounded-control border border-border bg-accent-soft text-accent-fg">
        {icon}
      </span>
    </span>
  );
}
