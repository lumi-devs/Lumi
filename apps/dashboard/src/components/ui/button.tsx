"use client";

import { Slot } from "radix-ui";
import type { ButtonHTMLAttributes } from "react";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "./button-variants";
import { cn } from "#/lib/utils";

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "ref">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

// Radix `Slot` for `asChild` (render as a Link/anchor while keeping button
// styling). Press feedback is a CSS active-scale so this primitive ships
// zero animation runtime.
export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: ButtonProps) {
  if (asChild) {
    // `asChild` merges styling onto a single child element (e.g. a `Link`).
    return (
      <Slot.Root
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
  return (
    <button
      className={cn(
        buttonVariants({ variant, size }),
        "transition-transform duration-100 active:scale-[0.97]",
        className,
      )}
      {...props}
    />
  );
}

export { buttonVariants } from "./button-variants";
