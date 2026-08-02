import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "#/lib/utils";

// Small copy-in primitives styled off the Tailwind tokens generated from
// dashboard.md §7's CSS custom properties — same "own the source, don't
// depend on a component npm package" model shadcn/ui popularized (see
// docs/DASHBOARD_RESEARCH_NOTES.md). No Radix dependency: these are plain
// native elements, kept intentionally minimal for this rewrite's scope.

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-accent-cyan text-[#04060c] hover:brightness-110 shadow-[0_4px_16px_rgba(56,189,248,0.25)]",
        ghost:
          "bg-transparent text-white border border-border hover:bg-white/5",
        danger:
          "bg-danger/90 text-white hover:bg-danger shadow-[0_4px_16px_rgba(244,63,94,0.25)]",
        outline: "border border-border bg-transparent hover:bg-white/5 text-white",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-xs",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
