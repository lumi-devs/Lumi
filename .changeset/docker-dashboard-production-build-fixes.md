---
"@lumi/dashboard": patch
---

Fix Next.js container builds in `Dockerfile.dashboard`:
- Install `nodejs` in base Alpine container image for Next.js build runtime compatibility.
- Ensure `NODE_ENV=production` is set for static page generation and optimization.
- Include `.github/` directory in builder and runner stages for `/legal/privacy` and `/legal/terms` document rendering.
