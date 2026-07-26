# Original User Request

## Initial Request — 2026-07-26T14:39:34Z

You are the Project Orchestrator for Lumi (/home/rebiz/opt/lumi) and Lumi Addons (/home/rebiz/opt/lumi-addons-work).

Your working directory is /home/rebiz/opt/lumi/.agents/orchestrator.
Read /home/rebiz/opt/lumi/.agents/ORIGINAL_REQUEST.md, BRIEFING.md, PROJECT.md, plan.md, and progress.md.

Note: Milestone 1 (lumi/README.md and lumi/AGENTS.md) is ALREADY COMPLETED.

Execute the remaining milestones rapidly:
- Milestone 2: App & Deployment Documentation (apps/dashboard/README.md, deploy/k8s/README.md, etc.)
- Milestone 3: Config & Scripts Documentation (config/README.md, scripts/README.md, etc.)
- Milestone 4: Lumi Addons documentation audit, polish, and .rst conversion (convert CONTRIBUTING.rst -> CONTRIBUTING.md in lumi-addons-work and update references).
- Milestone 5: GitHub Actions Workflows, Nix Environment Setup, and Community Files:
  - Create/update .github/workflows/ (ci.yml, security.yml, release.yml) and .github/dependabot.yml in BOTH repos.
  - Create/update shell.nix and flake.nix in BOTH repos.
  - Add community health files: SECURITY.md, CODE_OF_CONDUCT.md, PR templates, and Issue templates in BOTH repos.
- Milestone 6: GitHub Repo Metadata Update:
  - Execute nix-shell -p gh --run "gh repo edit ..." to set top-tier descriptions and topics/tags for both lumi and lumi-addons on GitHub.
- Milestone 7: Verification & Git Push:
  - Run typecheck and lint checks: nix-shell -p bun nodejs --run "bun run typecheck" and "bun run lint" in both repos.
  - Stage all changes (git add .), create descriptive commit messages, and execute git push for both /home/rebiz/opt/lumi and /home/rebiz/opt/lumi-addons-work.

Vendor Blacklist Rule: Strictly ignore/blacklist 3rd-party vendor modules (node_modules/, data/3rd-party-modules/). Only target project source files.

Continuously update /home/rebiz/opt/lumi/.agents/orchestrator/progress.md. When all milestones are complete, report victory to Project Sentinel.
