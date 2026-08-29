---
"@lumi/docs": patch
"@lumi/dashboard": patch
---

Redesign documentation with Apple Cupertino aesthetic and unify single source of truth:
- Refactor documentation styling in `apps/docs/src/styles/custom.css` with SF Pro / Inter typography, macOS window styled code blocks, frosted glass headers, and Apple pill controls.
- Unify documentation structure into `apps/docs/src/content/docs/` with root symlink `docs -> apps/docs/src/content/docs` to eliminate redundant copies.
- Synchronize documentation with active enterprise fleet configuration, Kubernetes deployment manifests, 27 Prisma models, and 66 RPC wire actions.
- Add version switcher for v0.1 in the docs header (`apps/docs/src/components/SiteTitle.astro`).
- Remove mentions of external Discord bots across docs and dashboard UI.
