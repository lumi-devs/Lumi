# Lumi Dashboard Design System

## Overview

The Lumi dashboard uses a **"Midnight Sapphire"** design aesthetic — a premium admin console bridging Discord heritage with modern SaaS refinement. Deep navy canvas with electric sapphire accent, glass chrome on nav/overlays, and soft diffused elevation.

This is the source of truth for all visual and interactive design in the dashboard.

### Design Principles

- **Calm by default**: Motion and depth clarify state, not decorate.
- **Semantic tokens only**: Nothing references raw colors or `white/40`-style alpha values.
- **Responsive at core**: Desktop-first design that scales intelligently to mobile.
- **Accessibility-first**: WCAG 2.2 AA compliance throughout; keyboard navigation built in.
- **Light and dark are equal citizens**: Both themes carry the same glass chrome, accent, and shadow language — not an afterthought.
- **Fewer visual layers**: Clearer hierarchy through restraint, not decoration.

---

## Color Palette

### Semantic Colors

All components should reference **semantic tokens** (`bg-surface`, `text-fg-muted`, etc.), never raw hex values.

#### Surfaces & Backgrounds

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--bg` | #f4f5f8 | #090B14 | Page background |
| `--bg-subtle` | #ebedf2 | #0D1018 | Subtle background, sidebar |
| `--surface` | #ffffff | #0F1219 | Card, panel, popover background |
| `--surface-hover` | #f5f6fa | #161B26 | Hover state for surfaces |
| `--surface-active` | #eaedf3 | #1C2231 | Active/selected surface state |

#### Borders

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--border` | #e1e4ea | #1E2433 | Primary border, dividers |
| `--border-soft` | #ebedf2 | #161B26 | Subtle borders, rails |
| `--border-strong` | #c7cdd9 | #2D3548 | Emphasized borders, focus state |

#### Text

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--fg` | #14161c | #F0F2F8 | Primary text |
| `--fg-muted` | #5a6270 | #8B95B7 | Secondary text, descriptions |
| `--fg-subtle` | #8b93a3 | #5F6A85 | Tertiary text, hints, placeholders |
| `--fg-on-accent` | #ffffff | #FFFFFF | Text on accent backgrounds |

#### Accent & Status

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--accent` | #3B5BDB | #4C6EF5 | Primary action, active route |
| `--accent-hover` | #2B4BC6 | #3B5BDB | Hover state for accent |
| `--accent-soft` | rgba(59, 91, 219, 0.09) | rgba(76, 110, 245, 0.12) | Soft accent backgrounds |
| `--accent-fg` | #2B4BC6 | #6D8DF7 | Accent text (links) |
| `--accent-glow` | #4C6EF5 | #4C6EF5 | Glow/halo effects |
| `--success` | #12805A | #12B886 | Success state |
| `--success-soft` | rgba(18, 128, 90, 0.1) | rgba(18, 184, 134, 0.12) | Soft success |
| `--warning` | #92600A | #F59F00 | Warning state |
| `--warning-soft` | rgba(146, 96, 10, 0.1) | rgba(245, 159, 0, 0.12) | Soft warning |
| `--danger` | #C7333F | #FA5252 | Destructive/error state |
| `--danger-soft` | rgba(199, 51, 63, 0.09) | rgba(250, 82, 82, 0.12) | Soft danger |

#### Overlays & Focus

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--overlay` | rgba(10, 12, 18, 0.45) | rgba(0, 0, 0, 0.55) | Modal scrim (dark in both themes) |
| `--ring` | rgba(41, 83, 216, 0.38) | rgba(76, 110, 245, 0.42) | Focus ring color |

---

## Elevation & Shadows

Shadows use cool-tinted, soft elevation — never pure black.

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--shadow-sm` | `0 1px 2px rgba(20, 22, 30, 0.05)` | `0 1px 2px rgba(0, 0, 0, 0.35)` | Subtle lift |
| `--shadow-md` | `0 1px 2px rgba(20, 22, 30, 0.04), 0 10px 30px -10px rgba(20, 22, 30, 0.12)` | `0 1px 2px rgba(0, 0, 0, 0.4), 0 10px 30px -10px rgba(0, 0, 0, 0.55)` | Medium elevation |
| `--shadow-lg` | `0 2px 4px rgba(20, 22, 30, 0.05), 0 24px 60px -16px rgba(20, 22, 30, 0.18)` | `0 2px 4px rgba(0, 0, 0, 0.45), 0 26px 64px -16px rgba(0, 0, 0, 0.7)` | High elevation |
| `--shadow-accent` | `0 1px 2px rgba(20, 22, 30, 0.06), 0 10px 28px -8px rgba(41, 83, 216, 0.28)` | `0 1px 2px rgba(0, 0, 0, 0.4), 0 10px 28px -8px rgba(76, 110, 245, 0.35)` | Primary button, active nav pill |
| `--shadow-glow-accent` | `0 1px 2px rgba(20, 22, 30, 0.05), 0 16px 40px -12px rgba(76, 125, 255, 0.22)` | `0 1px 2px rgba(0, 0, 0, 0.4), 0 18px 44px -12px rgba(76, 110, 245, 0.25)` | Hover-elevated cards |

---

## Glass Chrome

Translucent tint over backdrop-blur, with hairline highlight for physical edge refraction. Used on nav, dropdowns, dialogs, sheets.

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--glass-bg` | rgba(255, 255, 255, 0.68) | rgba(15, 18, 25, 0.68) | Glass background |
| `--glass-border` | rgba(255, 255, 255, 0.6) | rgba(255, 255, 255, 0.08) | Glass border (inset highlight) |
| `--glass-blur-sm` | 10px | 10px | Small blur for chrome |
| `--glass-blur-md` | 20px | 20px | Medium blur for overlays |
| `--glass-blur-lg` | 40px | 40px | Large blur for deep layering |

Apply with `.glass` utility class (defined in globals.css).

---

## Typography

### Font Stack

| Token | Stack | Usage |
|-------|-------|-------|
| `--font-display` | Geist (or OS system font) | Headings, call-to-action |
| `--font-sans` | System font stack | Body text, UI |
| `--font-mono` | JetBrains Mono (or monospace fallback) | Code, identifiers |

### Font Sizes

| Context | Size | Example |
|---------|------|---------|
| Heading (h1/h2) | Inherit browser default or CSS | Display weight, tracked |
| Heading (h3/h4) | 16px | Semibold, 600 weight, 0.01em tracking |
| Label | 14px | Semibold display font, 0.02em tracking |
| Body | 15px / 16px | Regular, 1.5 line-height |
| Small | 13px / 14px | Muted text, 1.4 line-height |
| Code | 14px | Monospace, tabular nums |

### Font Weights

- **400** — Regular body text
- **500** — Medium (occasionally for labels)
- **600** — Semibold for headings, labels, buttons
- **700** — Bold (rarely; use semibold instead)

All headings use `font-display` with `font-weight: 600` and `tracking: 0.01em`.

---

## Spacing & Layout

### Spacing Scale (relative to 4px base)

| Token | Pixels | Usage |
|-------|--------|-------|
| Tight | 4px–8px | Tight grouping, icon spacing |
| Normal | 12px–16px | Standard component padding, gaps |
| Relaxed | 20px–24px | Section padding, card spacing |
| Loose | 32px–40px | Major section breaks |

Use Tailwind's native spacing: `p-2`, `gap-3`, `mb-4`, etc.

### Border Radius

| Token | Size | Usage |
|-------|------|-------|
| `--radius-control` | 12px | Buttons, inputs, small rounded surfaces |
| `--radius-panel` | 20px | Cards, panels, major surfaces |
| `--radius` | 10px (0.625rem) | Default for shadcn/ui (calculated) |

---

## Motion & Animation

All motion uses settled iOS-style easing (`cubic-bezier(0.22, 1, 0.36, 1)`) — no overshoot.

| Token | Duration | Usage |
|-------|----------|-------|
| `--motion-instant` | 75ms | Immediate responses (tooltips) |
| `--motion-fast` | 150ms | Quick feedback (button press) |
| `--motion-normal` | 300ms | Standard transitions |
| `--motion-slow` | 600ms | Entrance animations, complex transitions |

### Built-in Animations

#### Page Load Choreography (`.rise`)

Quiet staggered entrance for full pages:
- Header → Instrument → Panels on 70ms beat
- 8px translate, opacity fade
- 320ms total, never repeats on reload
- Respects `prefers-reduced-motion`

```html
<div class="rise" style="--rise-delay: 0ms">Header</div>
<div class="rise" style="--rise-delay: 70ms">Panel 1</div>
<div class="rise" style="--rise-delay: 140ms">Panel 2</div>
```

#### Skeleton Loading (`.skeleton`)

Subtle pulse for content placeholders:
```html
<div class="skeleton h-12 rounded-control w-full"></div>
```

#### Live Status Pulse (`.pulse-live`)

Breathing glow for genuinely live indicators (bot online, shard reporting):
```html
<div class="size-2 rounded-full bg-success pulse-live"></div>
```

#### Theme Transition Wave

Circular reveal from top-right (where toggle lives) using View Transitions API. Automatic via `theme-provider.tsx`.

---

## Component Patterns

### Button Variants

All buttons use `font-display` with `font-weight: 600` and respond to `--motion-fast`.

| Variant | Use | States |
|---------|-----|--------|
| **primary** | Single committing action (Save, Install) | Solid accent background, hover darker, shadow-accent |
| **secondary** | Default for everything else | Bordered neutral, hover lift |
| **ghost** | Toolbar, inline, repeated actions | Borderless, hover lift |
| **danger** | Irreversible, confirmed actions only | Solid danger background |
| **dangerGhost** | Destructive but low-emphasis (Uninstall, Remove) | Bordered danger, hover soft background |
| **link** | Inline text action | Underline on hover, accent color |

### Input States

| State | Styling |
|-------|---------|
| Idle | `border-border`, `bg-bg-subtle` |
| Hover | `border-border-strong` |
| Focus | `border-accent`, `bg-surface`, focus ring |
| Disabled | 50% opacity, `cursor-not-allowed` |

Consistent across `<input>`, `<textarea>`, `<select>`.

### Card Patterns

#### Card (Container)

```tsx
<Card>
  <CardHeader>
    <CardTitle>Module Config</CardTitle>
    <CardDescription>Optional subtitle</CardDescription>
  </CardHeader>
  <CardBody>
    {/* Content */}
  </CardBody>
  <CardFooter>Optional footer</CardFooter>
</Card>
```

#### Card Props

- `interactive={true}` — Hover lift + accent glow, for clickable cards

#### Table in Card

```tsx
<Card>
  <CardHeader>...</CardHeader>
  <CardBody className="p-0">
    <table>...</table>
  </CardBody>
</Card>
```

### Status Indicators

Use semantic color tokens:
- Green (`--success`) for enabled, online, complete
- Amber (`--warning`) for pending, attention needed
- Red (`--danger`) for errors, disabled, off
- Blue (`--accent`) for active, selected
- Gray (`--fg-muted`) for neutral, off

### Loading & Empty States

#### Skeletons

Use `.skeleton` class on placeholder elements (height, width, rounded-control).

#### Empty State

```tsx
<EmptyState
  title="No data yet"
  description="Create one to get started"
  action={<Button>Create</Button>}
/>
```

#### Save State Indicators

- **Idle** — No indicator, or subtle text ("Up to date")
- **Dirty** — Yellow/amber indicator ("Unsaved changes")
- **Saving** — Blue indicator with spinner ("Saving...")
- **Saved** — Green flash, then fade ("Saved!")
- **Error** — Red indicator with retry ("Failed to save")

See `SaveBar` component for reference.

---

## Responsive Design

### Breakpoints (Tailwind defaults)

- **sm**: 640px
- **md**: 768px
- **lg**: 1024px
- **xl**: 1280px
- **2xl**: 1536px

### Mobile-First Rules

1. Sidebar → Drawer on mobile (`lg` breakpoint up for sidebar)
2. Table → Card stack on mobile
3. Multi-column layout → Single column on mobile
4. Dense spacing → Relaxed spacing on mobile
5. Hide secondary actions behind menu on small screens

---

## Accessibility

### Color Contrast

All text meets WCAG 2.2 AA standards:
- Primary text on surface: 11.5:1 (light), 9.2:1 (dark)
- Muted text: 5.8:1 (light), 5.1:1 (dark)
- Accent text: 4.5:1 (both themes)

### Focus Management

- Keyboard-only focus rings: `outline: 2px solid var(--ring), outline-offset: 2px`
- Focus traps in modals
- Logical tab order throughout
- Escape key closes overlays

### Reduced Motion

All animations collapse to instant (0.01ms) under `prefers-reduced-motion: reduce`.

### Semantic HTML

- Use `<button>` for interactive elements (not `<div role="button">`)
- Use `<a>` for navigation
- Use form elements for data entry
- Use `<main>`, `<nav>`, `<aside>`, `<header>`, `<footer>` landmarks

---

## Dark Mode

No data-theme attribute → Follow OS via `prefers-color-scheme`
`data-theme="light"` → Force light
`data-theme="dark"` → Force dark

Toggle in header uses View Transitions API for animated circular reveal.

---

## Component Usage Examples

### Button

```tsx
import { Button } from "@/components/ui/button";

// Primary (use sparingly — one per screen)
<Button>Save Settings</Button>

// Secondary (default)
<Button variant="secondary">Cancel</Button>

// Ghost (toolbar, inline)
<Button variant="ghost" size="sm">
  <Trash2 className="size-4" />
</Button>

// Danger (destructive, confirm first)
<Button variant="danger">Delete</Button>

// Link (inline)
<Button variant="link">Learn more</Button>
```

### Card with Form

```tsx
import { Card, CardHeader, CardTitle, CardBody, CardFooter } from "@/components/ui/card";
import { Input, Field } from "@/components/ui/input";

<Card>
  <CardHeader>
    <CardTitle>Module Settings</CardTitle>
  </CardHeader>
  <CardBody className="space-y-4">
    <Field label="Name" htmlFor="name">
      <Input id="name" defaultValue={data.name} />
    </Field>
  </CardBody>
  <CardFooter>
    <Button>Save</Button>
    <Button variant="secondary">Cancel</Button>
  </CardFooter>
</Card>
```

### Status Badge

```tsx
import { Badge } from "@/components/ui/badge";

<Badge variant={enabled ? "success" : "muted"}>
  {enabled ? "Enabled" : "Disabled"}
</Badge>
```

---

## Anti-Patterns

### Don't:

- Use inline `style="color: #3B5BDB"` — use `text-accent` instead
- Create new color variables — use semantic tokens
- Add custom animations — use motion tokens or predefined animations
- Hard-code spacing — use Tailwind spacing
- Use `w-[123px]` — use standard Tailwind sizes
- Create page-specific button variants — extend the global button system
- Mix light/dark colors in a single file — let the theme system handle it

### Instead:

```tsx
// ❌ Don't
<div style={{ background: "#3B5BDB", padding: "16px" }}>

// ✅ Do
<div className="bg-accent p-4">
```

---

## File Structure

Design tokens live in:
- **`src/app/globals.css`** — CSS custom properties, animations, base styles
- **`src/components/ui/`** — Reusable components
- **`src/components/layout/`** — Layout components (nav, header, sidebar)
- **`src/lib/animate.ts`** — Motion helpers (hooks, spotlight handler)

Typography, spacing, colors, and radii are defined as CSS custom properties and wired through Tailwind v4's `@theme` directive.

---

## Maintenance

### Adding a New Color

1. Define CSS custom property in both light and dark sections of globals.css
2. Add to `@theme inline` block
3. Use via Tailwind class (e.g., `text-new-color`)

### Adding a New Font Size

1. Add to `@theme inline` under `--font-*`
2. Use via Tailwind class

### Updating Motion Durations

Update in globals.css `--motion-*` tokens; all animations and transitions use these variables and will update globally.

### Changing Theme Colors

Update CSS custom properties in globals.css light/dark sections; all components automatically adapt.

---

## Testing & Validation

### Checklist for New Components

- [ ] Uses semantic color tokens (no raw colors)
- [ ] Respects `prefers-reduced-motion`
- [ ] Works in both light and dark themes
- [ ] Meets WCAG 2.2 AA contrast
- [ ] Has proper focus states
- [ ] Responsive on mobile
- [ ] Documented with usage examples
- [ ] No hardcoded spacing/radii

### Commands

```bash
# Typecheck
npm run typecheck

# Lint
npm run lint

# Build Tailwind
npm run build

# Dev server
npm run dev
```

---

## References

- **Framework**: Next.js 16 with App Router
- **CSS Framework**: Tailwind CSS v4
- **UI Primitives**: Radix UI + shadcn/ui
- **Motion**: Motion / Framer Motion
- **Icons**: Lucide React
- **Component Library**: Class Variance Authority (CVA) for variants
