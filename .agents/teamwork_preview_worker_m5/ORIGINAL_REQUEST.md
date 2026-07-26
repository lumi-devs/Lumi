## 2026-07-26T09:16:48Z
<USER_REQUEST>
You are Worker M5 for Lumi (/home/rebiz/opt/lumi) and Lumi Addons (/home/rebiz/opt/lumi-addons-work).
Your working directory is /home/rebiz/opt/lumi/.agents/teamwork_preview_worker_m5.

Your task is Milestone 5: GitHub Actions Workflows, Nix Environment Setup, and Community Health Files in BOTH repositories:
- Repo 1: /home/rebiz/opt/lumi
- Repo 2: /home/rebiz/opt/lumi-addons-work

Vendor Blacklist Rule: Strictly ignore/blacklist 3rd-party vendor modules (node_modules/, data/3rd-party-modules/). Only edit project source files.

Requirements for BOTH /home/rebiz/opt/lumi and /home/rebiz/opt/lumi-addons-work:
1. GitHub Actions Workflows & Dependabot:
   - Create/update .github/workflows/ci.yml (Runs linting, typechecking, build, test on push/PR using Bun & Node.js).
   - Create/update .github/workflows/security.yml (Runs security scanning / CodeQL / dependency vulnerability checks).
   - Create/update .github/workflows/release.yml (Handles release packaging and tagging).
   - Create/update .github/dependabot.yml (Configures Dependabot for npm/bun and github-actions updates).
2. Nix Environment Setup:
   - Create/update shell.nix (Defines nix-shell with bun, nodejs_22, git, gh, and dev utilities).
   - Create/update flake.nix (Defines modern Nix flake with devShells.default).
3. Community Health Files:
   - Create/update SECURITY.md (Vulnerability reporting policy, supported versions, security contact).
   - Create/update CODE_OF_CONDUCT.md (Contributor Covenant v2.1).
   - Create/update .github/PULL_REQUEST_TEMPLATE.md.
   - Create/update .github/ISSUE_TEMPLATE/bug_report.yml and .github/ISSUE_TEMPLATE/feature_request.yml (or .md).

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

When finished:
1. Update /home/rebiz/opt/lumi/.agents/teamwork_preview_worker_m5/progress.md.
2. Write a detailed handoff.md in /home/rebiz/opt/lumi/.agents/teamwork_preview_worker_m5 detailing modified files, verification performed, and content summaries.
3. Send a message to parent reporting completion.
</USER_REQUEST>
