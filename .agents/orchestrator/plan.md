# Orchestration Plan: Documentation & Repository Standards Regeneration

## Overview
Audit and regenerate all non-TypeScript documentation files, CI/CD workflows, Nix dev environments, and GitHub community standards across `lumi` and `lumi-addons`.

## Milestones & Iteration Loop

### Milestone 1: Core Documentation (`lumi/README.md`, `lumi/AGENTS.md`)
- **Status**: Explorers completed. Proceed to Implementation.
- **Worker**: Dispatch Worker (`teamwork_preview_worker`) to regenerate `lumi/README.md` and `lumi/AGENTS.md` based on Explorers 1 & 2 analysis reports.
- **Review**: Dispatch 2 Reviewers (`teamwork_preview_reviewer`).
- **Challenge**: Dispatch 2 Challengers (`teamwork_preview_challenger`).
- **Audit**: Dispatch Forensic Auditor (`teamwork_preview_auditor`).
- **Gate**: Require all checks to pass.

### Milestone 2: App & Deployment Documentation
- **Worker**: Regenerate `apps/dashboard/README.md`, create `apps/gateway/README.md`, `apps/scheduler/README.md`, `apps/worker/README.md`, and regenerate `deploy/k8s/README.md`.
- **Review & Challenge**: 2 Reviewers + 2 Challengers.
- **Audit**: Forensic Auditor verification.

### Milestone 3: Config & Scripts Documentation
- **Worker**: Regenerate `config/README.md`, `scripts/README.md`, and update `CONTRIBUTING.md` / setup guides.
- **Review & Challenge**: 2 Reviewers + 2 Challengers.
- **Audit**: Forensic Auditor verification.

### Milestone 4: Addons Documentation (`lumi-addons/`)
- **Worker**: Standardize `lumi-addons` docs to Markdown, fix broken links (`CONTRIBUTING.md`, `./emoji-stealer/`), create missing module READMEs (`auto-translate`, `emoji-stealer`, `thread-cleaner`), update `rolementions/README.md` (remove legacy "Ember"), update `CONTRIBUTING.md` (`@DefineModule`).
- **Review & Challenge**: 2 Reviewers + 2 Challengers.
- **Audit**: Forensic Auditor verification.

### Milestone 5: GitHub Workflows, Nix Environment & Community Standards
- **Worker**: Create `.github/workflows/ci.yml`, `.github/workflows/security.yml`, `.github/workflows/release.yml`, `.github/dependabot.yml`, `shell.nix`, `flake.nix`, `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/ISSUE_TEMPLATE/feature_request.yml`, `.github/PULL_REQUEST_TEMPLATE.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`.
- **Review & Challenge**: 2 Reviewers + 2 Challengers.
- **Audit**: Forensic Auditor verification.

### Milestone 6: Link, Syntax & Formatting Verification
- **Worker**: Conduct zero-broken-link check, Markdown syntax linting, and formatting verification across the whole repo.
- **Review & Challenge**: 2 Reviewers + 2 Challengers.
- **Audit**: Forensic Auditor final verification.
- **Victory Report**: Report victory/completion to parent/Sentinel.
