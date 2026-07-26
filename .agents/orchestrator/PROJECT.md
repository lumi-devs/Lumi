# Project: Documentation & Repository Standards Regeneration for Lumi & Lumi-Addons

## Architecture
Comprehensive documentation, CI/CD, Nix environment, community standards, GitHub metadata, and git deployment setup for `lumi` (`/home/rebiz/opt/lumi`) and `lumi-addons` (`/home/rebiz/opt/lumi-addons-work`).

## Blacklist / Vendor Boundaries
- **IGNORE / BLACKLIST**: `node_modules/`, `data/3rd-party-modules/`.
- **TARGET REPOS**:
  - `lumi`: `/home/rebiz/opt/lumi`
  - `lumi-addons`: `/home/rebiz/opt/lumi-addons-work`

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Core Documentation Audit & Regeneration | `lumi/README.md`, `lumi/AGENTS.md` | none | DONE |
| 2 | App & Deployment Documentation | `apps/dashboard/README.md`, `apps/gateway/README.md`, `apps/scheduler/README.md`, `apps/worker/README.md`, `deploy/k8s/README.md`, `deploy/docker/README.md` | M1 | DONE |
| 3 | Config & Scripts Documentation | `config/README.md`, `scripts/README.md`, `CONTRIBUTING.md` setup guides | M1 | DONE |
| 4 | Addons Documentation & RST Conversion | `/home/rebiz/opt/lumi-addons-work`: convert `.rst` to `.md` (`CONTRIBUTING.rst` -> `CONTRIBUTING.md`), update references, polish module READMEs | M1 | DONE |
| 5 | Workflows, Nix & Community Standards | Both repos: `.github/workflows/` (`ci.yml`, `security.yml`, `release.yml`), `.github/dependabot.yml`, `shell.nix`, `flake.nix`, issue/PR templates, `SECURITY.md`, `CODE_OF_CONDUCT.md` | M1 | IN_PROGRESS |
| 6 | GitHub Repo Metadata Update | Execute `nix-shell -p gh --run "gh repo edit ..."` to set top-tier descriptions and topics/tags for both `lumi` and `lumi-addons` | M5 | PLANNED |
| 7 | Verification & Git Push | Typecheck & lint (`nix-shell -p bun nodejs --run "bun run typecheck"`, `"bun run lint"`), stage (`git add .`), commit, and `git push` for both `/home/rebiz/opt/lumi` and `/home/rebiz/opt/lumi-addons-work` | M6 | PLANNED |

## Interface Contracts
- Formatting Standard: GitHub Flavored Markdown (GFM).
- RST Conversion: All `.rst` files in `lumi-addons-work` converted to standard `.md`, original `.rst` removed, relative links updated.
- Diagrams: Mermaid or ASCII visual diagrams.
- Code Blocks: Must specify language identifiers (`bash`, `ts`, `yaml`, `json`, `nix`, `mermaid`, etc.).
- Workflows: GitHub Actions (`.github/workflows/*.yml`) for CI (lint, typecheck, test, build), security scanning, dependabot in both repos.
- Nix Setup: Standard `shell.nix` and `flake.nix` providing Bun, Node, and required development dependencies in both repos.
- Community Files: `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue templates, PR template in both repos.
- Repo Metadata: Description, topics/tags updated via `gh repo edit` in both repos.
- Git Push: Stage, commit, and `git push` for both `/home/rebiz/opt/lumi` and `/home/rebiz/opt/lumi-addons-work`.
