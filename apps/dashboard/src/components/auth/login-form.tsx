"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { Button } from "#/components/ui/button";
import { ActionError } from "#/components/action-error";
import { SpringSnappy, SpringSoft } from "#/lib/animate";

export interface LoginActionState {
  error: string | null;
}

export function LoginForm({
  action,
}: {
  action: (state: LoginActionState, formData: FormData) => Promise<LoginActionState>;
}) {
  const [state, formAction, isPending] = useActionState<LoginActionState, FormData>(action, {
    error: null,
  });
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, SpringSoft);
  const springY = useSpring(y, SpringSoft);

  function onMouseMove(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - (rect.left + rect.width / 2);
    const relY = e.clientY - (rect.top + rect.height / 2);
    x.set(Math.max(-6, Math.min(6, relX * 0.25)));
    y.set(Math.max(-6, Math.min(6, relY * 0.25)));
  }

  function onMouseLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.form
      action={formAction}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        disabled={isPending}
        style={reduce ? undefined : { x: springX, y: springY }}
        onMouseMove={reduce ? undefined : onMouseMove}
        onMouseLeave={reduce ? undefined : onMouseLeave}
      >
        {isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 127.14 96.36"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.5-5c.88-.65,1.72-1.34,2.51-2a75.58,75.58,0,0,0,73,0c.79.71,1.63,1.4,2.51,2a68.43,68.43,0,0,1-10.5,5,77.7,77.7,0,0,0,6.63,10.85,105.73,105.73,0,0,0,31-18.83C129.87,48.12,123.86,25.29,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z" />
          </svg>
        )}
        {isPending ? "Redirecting to Discord…" : "Continue with Discord"}
      </Button>
      <AnimatePresence>
        {state.error ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, scale: 0.95 }}
            transition={SpringSnappy}
          >
            <ActionError error={state.error} className="mt-3" />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.form>
  );
}
