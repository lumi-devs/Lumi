---
"@lumi/dashboard": minor
---

Rework the dashboard UI around an "engineering blueprint / operator console"
design direction, built on a semantic design-token system.

- Committed aesthetic: hairline rules, wide uppercase micro-labels, condensed
  engineered chrome type over a subtle graph-paper field, and one saturated
  signal colour (blueprint cobalt) reserved for the primary action and the
  active route — amber/green/red stay reserved for machine status.
- New type pairing: Saira Semi Condensed (chrome), IBM Plex Sans (body),
  JetBrains Mono (data), all self-hosted via `next/font`.
- One orchestrated page-load reveal on the guild overview and system panel,
  disabled under `prefers-reduced-motion`.
- Light and dark themes are both authored (previously dark-only with two
  unreachable novelty palettes); `system`/`light`/`dark` is selectable from the
  header and follows `prefers-color-scheme` by default.
- Replaced emoji-as-icons throughout the app chrome with `lucide-react`. A
  module's own emoji is still shown, in a fixed glyph tile.
- Denser data screens: the module list and global kill-switch grid are now
  tables/lists instead of card grids, and the control scale dropped from 40px
  to 32px.
- Clear primary/secondary/destructive button hierarchy, designed empty states,
  route-level loading skeletons and an error boundary.
- Dropped the glassmorphism, radial page glow and gradient wordmark.
