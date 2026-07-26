# Original User Request

## Initial Request — 2026-07-26T14:21:17Z

Read actual files in `lumi` and `lumi-addons`, audit all non-TypeScript documentation files (including `README.md`, `AGENTS.md`, setup guides, and module docs), and regenerate them according to top-tier open-source industry standards. Make them engaging, concise, to the point, and visually appealing.

Working directory: /home/rebiz/opt/lumi
Integrity mode: development

## Requirements

### R1. Comprehensive Documentation Audit
Inspect all documentation and guide files (including `README.md`, `AGENTS.md`, `apps/dashboard/README.md`, `deploy/k8s/README.md`, `config/README.md`, `scripts/README.md`, and `lumi-addons` documentation). Analyze them against modern developer documentation standards (clear structure, concise copy, visual hierarchy, badges/tables/diagrams where appropriate).

### R2. Industry Standard Regeneration & Polish
Regenerate and rewrite documentation files so they are concise, professional, and visually compelling:
- **README.md**: Include clean feature matrix, quickstart, architecture diagram (Mermaid/ASCII), setup commands, and configuration reference without unnecessary verbosity.
- **AGENTS.md**: Standardize AI agent rules, workflows, system capabilities, context limits, and task execution guidelines.
- **Submodule / Addon Docs**: Provide clear module descriptions, installation steps, and API/hook references.

### R3. Verification & Link/Syntax Linting
Validate that all generated Markdown files have valid syntax, proper GitHub Flavored Markdown (GFM) formatting, no broken relative links, correctly formatted code blocks, and clear heading hierarchies.

## Acceptance Criteria

### Content Quality & Appeal
- [ ] `README.md` and `AGENTS.md` in `lumi` (and related `lumi-addons` docs) are fully regenerated, professional, and concise.
- [ ] Documentation includes structured sections: Overview, Quick Start, Architecture/Design, Configuration, and Contribution/Agent Guidelines.
- [ ] Fluff and outdated text are removed; key instructions are easy to skim and actionable.

### Syntax & Link Integrity
- [ ] Markdown files parse cleanly with no broken relative file links or syntax errors.
- [ ] Code blocks specify proper language identifiers (`ts`, `bash`, `yaml`, `mermaid`, etc.).

## Follow-up — 2026-07-26T08:53:08Z

User update: Scope expansion requested for lumi and lumi-addons.

Additional Requirements:
1. Audit and create industry-grade GitHub Actions workflows (.github/workflows/) for CI/CD, PR testing/linting, security scanning, release automation, and Dependabot.
2. Implement Nix environment setup (shell.nix / flake.nix) for reproducible local development and CI integration using nix-shell.
3. Add standard top-tier GitHub repo community files: Issue templates, PR template, SECURITY.md, and CODE_OF_CONDUCT.md where missing.

## Follow-up — 2026-07-26T08:53:23Z

Additional User Requirement:
Convert all .rst (reStructuredText) documentation files (such as lumi-addons CONTRIBUTING.rst) into clean, standard GitHub Flavored Markdown (.md) files (e.g. CONTRIBUTING.md) and update any references.

## Follow-up — 2026-07-26T08:54:00Z

Critical Instructions from User:
1. Blacklist / Ignore all installed 3rd-party vendor modules (e.g., node_modules/, data/3rd-party-modules/). Only audit and edit the actual project source repositories: lumi (/home/rebiz/opt/lumi) and lumi-addons (/home/rebiz/opt/lumi-addons-work).
2. Git Push: When all documentation edits, RST conversions, GitHub workflows, Nix configurations, and audits are completed, stage all changes, create descriptive commit messages, and execute `git push` for both repositories.

## Follow-up — 2026-07-26T08:54:57Z

Additional User Requirement (Goated Polish & GH Metadata Update):
1. Eye-Candy Visual Polish: Ensure README.md and AGENTS.md use top-tier GFM formatting, shields.io badges, Mermaid architecture diagrams, callouts (> [!NOTE], > [!TIP]), clean tables, and zero fluff.
2. GitHub Repository Metadata via `gh` CLI: Use `gh repo edit` (or nix-shell -p gh) to update repository description, topics/tags, website URL, and repository settings for both `lumi` and `lumi-addons` on GitHub.
## Follow-up — 2026-07-26T09:06:00Z

User Metadata & Scope Directives:
1. Vendor Blacklist: Strictly ignore/blacklist installed 3rd-party vendor modules (node_modules/, data/3rd-party-modules/). Only audit and edit actual project source repos (/home/rebiz/opt/lumi and /home/rebiz/opt/lumi-addons-work).
2. Documentation & Visual Polish:
   - Audit and regenerate README.md, AGENTS.md, and all submodule docs.
   - Use top-tier GFM formatting, shields.io badges, Mermaid architecture flowcharts, formatted tables, and callouts (> [!NOTE], > [!TIP]).
   - Convert all .rst files (e.g. CONTRIBUTING.rst -> CONTRIBUTING.md) to clean Markdown across both repos.
3. GitHub Actions Workflows & Nix Setup:
   - Create/update .github/workflows/ (ci.yml, security.yml, release.yml) and .github/dependabot.yml in both repos.
   - Create/update shell.nix and flake.nix in both repos.
   - Add community health files: SECURITY.md, CODE_OF_CONDUCT.md, PR templates, and Issue templates in both repos.
4. GitHub Repo Metadata via gh CLI:
   - Run nix-shell -p gh --run "gh repo edit --description '...' --add-topic '...'" to set top-tier descriptions and topics/tags for both lumi and lumi-addons on GitHub.
5. Verification & Git Push:
   - Execute nix-shell -p bun nodejs --run "bun run typecheck" and "bun run lint" in both repos.
   - Stage all changes (git add .), create descriptive commit messages, and execute git push for both /home/rebiz/opt/lumi and /home/rebiz/opt/lumi-addons-work.

## Follow-up — 2026-07-26T09:36:47Z

Execute remaining milestones rapidly:
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
