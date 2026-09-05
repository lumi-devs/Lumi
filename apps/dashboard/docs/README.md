# Lumi Dashboard Documentation

Welcome to the Lumi dashboard documentation. This directory contains guides for understanding and extending the dashboard's design system, architecture, and components.

## Quick Links

### For Designers & Product Managers
- **[Design System](design-system.md)** — Complete visual language reference
  - Color palette (light & dark)
  - Typography scale
  - Spacing & layout
  - Motion principles
  - Component patterns
  - Accessibility standards

### For Developers Building Features
- **[Component Reference](component-reference.md)** — Copy-paste component guide
  - Every component with examples
  - Common layout patterns
  - Accessibility checklist
  - Performance tips
  - Testing examples

### For Contributors & Architects
- **[Wave 5 Audit](WAVE-5-AUDIT.md)** — Complete design system audit
  - What's centralized vs. scattered
  - Component audit results
  - Theme system explanation
  - Accessibility verification
  - Build/test results
  - Future work (Wave 5.5+)

### For Implementation Reference
- **[Design Tokens](../src/lib/design-tokens.ts)** — Type-safe programmatic access
  - All tokens as TypeScript constants
  - CSS variable names
  - Light/dark values
  - Utility functions

---

## Directory Structure

```
apps/dashboard/
├── docs/
│   ├── README.md                   ← You are here
│   ├── design-system.md            ← Design tokens & principles
│   ├── component-reference.md      ← Component usage guide
│   └── WAVE-5-AUDIT.md            ← Audit results & verification
├── src/
│   ├── app/
│   │   └── globals.css             ← All design tokens (CSS custom properties)
│   ├── components/
│   │   ├── ui/                     ← Reusable components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   └── ... (20+ more)
│   │   └── layout/                 ← Layout components (nav, sidebar)
│   └── lib/
│       ├── design-tokens.ts        ← Programmatic token access
│       └── animate.ts              ← Motion utilities
└── tailwind.config.ts              ← (Implicit via @theme in globals.css)
```

---

## Getting Started

### 1. Understanding the Design System (5 minutes)

Start with **[Design System](design-system.md)** §Overview. Understand:
- "Midnight Sapphire" aesthetic
- 5 core principles
- Color palette structure

### 2. Building a Feature (10 minutes)

Check **[Component Reference](component-reference.md)** for your UI pattern:
- Settings panel? → Copy the "Settings Panel" pattern
- Need a table? → Use `DataTable` component
- Building a form? → Use `Field` wrapper components

### 3. Deep Dive (30 minutes)

Read the full **[Design System](design-system.md)** guide to understand:
- Why colors are semantic (not hardcoded hex)
- How themes work (light/dark both equal)
- Accessibility standards (WCAG 2.2 AA)
- Motion principles (calm, no overshoot)

### 4. Reference Implementation

See **[Wave 5 Audit](WAVE-5-AUDIT.md)** for:
- What's already built & verified
- Build/test results
- Accessibility compliance
- Future work (Storybook, token export, etc.)

---

## Common Tasks

### "I need to build a settings page"

1. Read: [Component Reference](component-reference.md) → Settings Panel pattern
2. Copy the pattern
3. Use `SettingRow` + `Switch`/`Input` components
4. Colors & spacing come from design tokens automatically

### "I need to add a new color to the system"

1. Read: [Design System](design-system.md) → Maintenance section
2. Add CSS custom property to `globals.css` (light & dark)
3. Add to `@theme inline` block
4. Use as Tailwind class (e.g., `bg-new-color`)

### "I need to verify accessibility"

1. Read: [Design System](design-system.md) → Accessibility section
2. Use tools: WAVE, Axe, Lighthouse
3. Test keyboard navigation
4. Test in both light & dark themes
5. Test with `prefers-reduced-motion` enabled

### "I need to understand why a component looks that way"

1. Open component file (e.g., `src/components/ui/button.tsx`)
2. Find the Tailwind classes
3. Look up each token in [Design System](design-system.md) → Color Palette
4. Understand the semantic purpose (e.g., `bg-accent` = primary action)

### "I need to add a new component"

1. Read: [Design System](design-system.md) → Component Patterns
2. Ensure it uses semantic tokens only
3. Add to `src/components/ui/`
4. Document in [Component Reference](component-reference.md)
5. Verify accessibility (focus, contrast, ARIA)

---

## Design System Principles

### 1. Semantic Tokens Only
**Don't**: `style="color: #3B5BDB"`  
**Do**: `text-accent`

All colors have semantic names (`accent`, `success`, `warning`, etc.) that explain their purpose.

### 2. Light & Dark are Equal
Both themes:
- Have the same color semantics
- Support the same components
- Are tested equally
- Are first-class citizens (not an afterthought)

### 3. Calm, Purposeful Motion
- No bounce or overshoot
- Motion clarifies state change (not decoration)
- `prefers-reduced-motion` respected globally
- Durations: 75ms (instant) → 600ms (slow entrance)

### 4. Accessibility Built-In
- WCAG 2.2 AA compliant by default
- Keyboard navigation throughout
- Focus states visible
- Semantic HTML (no role hacks)

### 5. Composable Primitives
- Small, focused components
- Combine via props (not wrapper hell)
- Use CVA (class-variance-authority) for variants
- No giant monolithic "super-component"

---

## Token Organization

All tokens live in **one place**: `src/app/globals.css`

### Structure
```css
:root {
  /* Light theme tokens */
  --bg: #f4f5f8;
  --surface: #ffffff;
  --fg: #14161c;
  /* ... 50+ more ... */
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    /* Dark theme tokens */
    --bg: #090B14;
    --surface: #0F1219;
    --fg: #F0F2F8;
    /* ... 50+ more ... */
  }
}

@theme inline {
  /* Tailwind v4 theme configuration (CSS-first) */
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  /* ... wires all tokens to Tailwind ... */
}
```

### Why?
- **Single source of truth**: All values in one file
- **DRY**: Light/dark themes don't duplicate logic
- **Maintainable**: Change one token, every component updates
- **Accessible**: CSS variables understood by all browsers
- **Fast**: Native browser engine (no JavaScript)

---

## Component Architecture

### Button Example
```
src/components/ui/button.tsx
├── Uses: motion.button (for press feedback)
├── Uses: Slot.Root (for asChild prop)
├── Uses: buttonVariants (CVA for styling)
└── Exports: Button, buttonVariants

src/components/ui/button-variants.ts
├── Defines: 6 variants (primary, secondary, ghost, danger, link)
├── Defines: 5 sizes (sm, md, lg, icon)
└── Uses: Semantic tokens (bg-accent, text-fg, etc.)

globals.css
├── Defines: CSS custom properties (--accent, --fg, etc.)
├── Provides: Light/dark values
└── Wires to: Tailwind via @theme inline
```

### Token Flow
```
CSS Variable (--accent)
    ↓
CSS Custom Property Value (#3B5BDB light, #4C6EF5 dark)
    ↓
Tailwind Class (bg-accent)
    ↓
Component Usage (<Button>Save</Button>)
    ↓
Visual Output (Blue button, light or dark)
```

---

## Accessibility Standards

### WCAG 2.2 AA

| Aspect | Standard | Our Status |
|--------|----------|-----------|
| Text Contrast | 4.5:1 | ✅ 9.2:1–11.5:1 |
| Focus States | Visible | ✅ 2px ring on all interactive |
| Color Alone | Not only signal | ✅ Text + icons |
| Motion | Respectable | ✅ Calm, no overshoot |
| Keyboard | Full support | ✅ Tab, Enter, Escape |
| HTML | Semantic | ✅ `<button>`, `<a>`, `<input>` |

### Testing Checklist
- [ ] Keyboard navigation (Tab, Shift+Tab, Enter, Escape)
- [ ] Screen reader (VoiceOver, NVDA, JAWS)
- [ ] Color contrast (WAVE, Axe, Lighthouse)
- [ ] Focus visible (no outline removal)
- [ ] `prefers-reduced-motion` enabled
- [ ] Both light & dark themes
- [ ] Mobile (touch targets 44px+)

---

## Building Your First Feature

### Step 1: Copy Component Pattern
From [Component Reference](component-reference.md), find your pattern:

```tsx
// Settings Panel (from reference guide)
<Card>
  <CardHeader>
    <CardTitle>Module Configuration</CardTitle>
  </CardHeader>
  <CardBody className="space-y-4">
    <SettingRow
      label="Enabled"
      description="Enable this module"
      control={<Switch checked={enabled} onChange={setEnabled} />}
    />
  </CardBody>
  <CardFooter>
    <Button>Save Changes</Button>
  </CardFooter>
</Card>
```

### Step 2: Import Components
```tsx
import { Card, CardHeader, CardTitle, CardBody, CardFooter } from "@/components/ui/card";
import { SettingRow } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
```

### Step 3: Build & Test
```bash
# Start dev server
bun run dev

# Test accessibility
# - Keyboard navigation
# - Theme toggle (top-right)
# - prefers-reduced-motion

# Verify in browser
# - Light theme
# - Dark theme
```

### Step 4: Add to Documentation
Update [Component Reference](component-reference.md) with your new pattern if reusable.

---

## Troubleshooting

### "My component doesn't use the right color"
**Check**: Are you using Tailwind classes (e.g., `bg-surface`) or hardcoded colors?
- ✅ Do use: `className="bg-surface text-fg"`
- ❌ Don't use: `style="background: #ffffff"`

### "My component looks different in dark mode"
**Check**: Are you using semantic tokens?
- ✅ Tokens change automatically: `bg-surface` → light/dark aware
- ❌ Hardcoded values don't: `bg-white` → always white, breaks dark mode

### "Focus outline is missing"
**Check**: Is the component a native interactive element?
- ✅ `<button>`, `<a>`, `<input>`, etc. get automatic focus styles
- ❌ `<div>` elements need `tabindex="0"` + manual focus ring

### "Animation is janky"
**Check**: Is it using motion tokens?
- ✅ Use: `transition-[color] duration-normal` (uses `--motion-normal`)
- ❌ Don't use: `transition duration-300` (hardcoded, doesn't respect system)

---

## Command Reference

```bash
# Development
bun run dev                 # Start dev server (localhost:8080)

# Verification
bun run typecheck          # TypeScript check
bun run lint               # ESLint check
bun run build              # Production build
bun run test               # Run tests

# Code exploration
grep -r "bg-accent" src/   # Find accent usage
grep -r "--motion" src/    # Find motion usage
find src/components -name "*.tsx" # List all components
```

---

## Resources

### Inside This Repo
- `src/app/globals.css` — All token definitions
- `src/lib/design-tokens.ts` — Programmatic token access
- `src/components/ui/` — Component implementations
- `src/lib/animate.ts` — Motion utilities & hooks

### External References
- [Tailwind CSS Docs](https://tailwindcss.com)
- [Radix UI Docs](https://radix-ui.com)
- [WCAG 2.2 Guidelines](https://www.w3.org/WAI/WCAG22/quickref/)
- [Motion for UX](https://www.nngroup.com/articles/animation-usability/)
- [Inclusive Components](https://inclusive-components.design/)

---

## Contributing

When adding to the design system:

1. **Update `globals.css`** if adding tokens
2. **Update `src/lib/design-tokens.ts`** with programmatic access
3. **Update [Design System](design-system.md)** with explanation
4. **Update [Component Reference](component-reference.md)** with examples
5. **Test**: Typecheck, lint, build, accessibility
6. **Document**: Why, not just what

---

## Contact & Questions

For questions about:
- **Components**: Check [Component Reference](component-reference.md)
- **Tokens**: Check [Design System](design-system.md)
- **Architecture**: Check [Wave 5 Audit](WAVE-5-AUDIT.md)
- **Code**: Check component source (`src/components/ui/`)

---

**Last Updated**: 2026-09-03  
**Wave**: 5 (Design System Foundation) ✅ Complete  
**Status**: Ready for Wave 6 (Dashboard Pages)
