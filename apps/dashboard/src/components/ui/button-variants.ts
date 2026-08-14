import { cva } from "class-variance-authority";

//   primary     — the single committing action on a screen (Save, Install)
//   secondary   — bordered neutral; the default for everything else
//   ghost       — borderless neutral; toolbar / inline / repeated actions
//   danger      — solid destructive; irreversible, confirmed actions only
//   dangerGhost — destructive but low-emphasis (Uninstall, Remove in a row)
//   link        — inline text action

export const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap",
    "font-display tracking-[0.01em] font-semibold",
    "rounded-control transition-[background-color,border-color,color,transform,box-shadow] duration-150 cursor-pointer",
    "active:scale-[0.97]",
    "disabled:pointer-events-none disabled:opacity-45 disabled:active:scale-100",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-fg-on-accent hover:bg-accent-hover shadow-accent",
        secondary:
          "border border-border bg-surface text-fg hover:bg-surface-hover hover:border-border-strong",
        ghost: "text-fg-muted hover:bg-surface-hover hover:text-fg",
        danger: "bg-danger text-white hover:brightness-110",
        dangerGhost:
          "border border-transparent text-danger hover:bg-danger-soft hover:border-danger/25",
        link: "text-accent-fg underline-offset-4 hover:underline px-0",
      },
      size: {
        sm: "h-8 gap-1 px-2.5 text-[13px] [&_svg]:size-3.5",
        md: "h-9 px-3 text-[14px] [&_svg]:size-4",
        lg: "h-10 px-4 text-[15px] [&_svg]:size-[18px]",
        icon: "size-9 [&_svg]:size-4",
        iconSm: "size-8 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);
