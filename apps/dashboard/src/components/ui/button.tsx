"use client";

import { Slot } from "radix-ui";
import { motion, type HTMLMotionProps } from "motion/react";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "./button-variants";
import { cn } from "#/lib/utils";

export interface ButtonProps
  extends Omit<HTMLMotionProps<"button">, "ref">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

// Radix `Slot` for `asChild` (render as a Link/anchor while keeping button
// styling), `motion.button` for the press-scale — the one bit of tactile
// feedback every clickable surface in the app shares.
export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: ButtonProps) {
  if (asChild) {
    // `asChild` merges styling onto a single child element (e.g. a `Link`),
    // which never receives the motion-only props below — safe to widen.
    return (
      <Slot.Root
        className={cn(buttonVariants({ variant, size }), className)}
        {...(props as React.HTMLAttributes<HTMLElement>)}
      />
    );
  }
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants } from "./button-variants";
