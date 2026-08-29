"use client";

import { useRef } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { Card } from "#/components/ui/card";
import { spotlightHandler, SPRING_SOFT } from "#/lib/animate";
import { cn } from "#/lib/utils";

/** Word-by-word hero headline reveal, one block-level span per line. */
export function HeroHeadline({ lines }: { lines: string[] }) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <>
        {lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </>
    );
  }

  return (
    <motion.span
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.06 } } }}
    >
      {lines.map((line) => (
        <span key={line} className="block">
          {line.split(" ").map((word, wi, words) => (
            <motion.span
              key={word}
              // A trailing space *inside* an inline-block gets collapsed by
              // CSS whitespace rules (it's "end of line" within the box's own
              // formatting context) - margin is what actually separates the
              // words here, the space character does nothing.
              className={cn("inline-block", wi < words.length - 1 && "mr-[0.28em]")}
              variants={{
                hidden: { opacity: 0, y: 24 },
                show: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
                },
              }}
            >
              {word}
            </motion.span>
          ))}
        </span>
      ))}
    </motion.span>
  );
}

/** Primary CTA that nudges toward the cursor, capped to a small radius. */
export function MagneticCta({
  href,
  target,
  rel,
  className,
  children,
}: {
  href: string;
  target?: string;
  rel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLAnchorElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, SPRING_SOFT);
  const springY = useSpring(y, SPRING_SOFT);

  if (reduce) {
    return (
      <a href={href} target={target} rel={rel} className={className}>
        {children}
      </a>
    );
  }

  function onMouseMove(e: React.MouseEvent<HTMLAnchorElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = e.clientX - (rect.left + rect.width / 2);
    const relY = e.clientY - (rect.top + rect.height / 2);
    x.set(Math.max(-8, Math.min(8, relX * 0.3)));
    y.set(Math.max(-8, Math.min(8, relY * 0.3)));
  }

  function onMouseLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.a
      ref={ref}
      href={href}
      target={target}
      rel={rel}
      className={className}
      style={{ x: springX, y: springY }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </motion.a>
  );
}

/** `Card` with the cursor-tracked `.spotlight` glow wired up. */
export function SpotlightCard(props: React.ComponentProps<typeof Card>) {
  const { className, ...rest } = props;
  return (
    <Card
      className={cn("spotlight", className)}
      onMouseMove={spotlightHandler}
      {...rest}
    />
  );
}

/** Plain spotlight surface for non-`Card` pitch rows (feature list items). */
export function SpotlightBox({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("spotlight", className)}
      onMouseMove={spotlightHandler}
      {...props}
    >
      {children}
    </div>
  );
}
