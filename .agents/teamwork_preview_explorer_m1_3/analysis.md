# Workspace Map & Submodule Documentation Audit Analysis

## Executive Summary

This report provides a comprehensive inventory and audit of all non-TypeScript documentation files across the `/home/rebiz/opt/lumi` repository and its 3rd-party addon repository at `/home/rebiz/opt/lumi/data/3rd-party-modules/lumi-addons`. 

A total of **20 non-TypeScript documentation files** (Markdown `.md`, ReStructuredText `.rst`, plain text `.txt`, and license files) were discovered, inspected, and audited. The audit examined relative link validity, syntax formatting, code block language identifiers, architectural alignment, and structural completeness.

---

## 1. Documentation Inventory

| # | File Path | Format | Lines | Bytes | Category |
|---|---|---|---|---|---|
| 1 | `README.md` | Markdown | 223 | 8,748 | Monorepo Root |
| 2 | `AGENTS.md` | Markdown | 175 | 8,158 | Monorepo Root / AI Guidelines |
| 3 | `CHANGELOG.md` | Markdown | 59 | 3,413 | Monorepo Root |
| 4 | `CODE_OF_CONDUCT.md` | Markdown | 16 | 1,157 | Monorepo Root |
| 5 | `CONTRIBUTING.md` | Markdown | 144 | 4,405 | Monorepo Root |
| 6 | `SECURITY.md` | Markdown | 29 | 1,731 | Monorepo Root |
| 7 | `LICENSE` | Text | 662 | 34,523 | Monorepo Root / AGPL-3.0 |
| 8 | `version.txt` | Text | 2 | 6 | Monorepo Root |
| 9 | `.github/PRIVACY_POLICY.md` | Markdown | 126 | 9,226 | Community & Legal |
| 10 | `.github/PULL_REQUEST_TEMPLATE.md` | Markdown | 29 | 1,167 | Community & GitHub Workflow |
| 11 | `.github/TERMS_OF_SERVICE.md` | Markdown | 72 | 3,133 | Community & Legal |
| 12 | `apps/dashboard/README.md` | Markdown | 71 | 2,644 | Apps Documentation |
| 13 | `config/README.md` | Markdown | 29 | 1,254 | Configuration Documentation |
| 14 | `deploy/k8s/README.md` | Markdown | 39 | 1,327 | Deployment Documentation |
| 15 | `scripts/README.md` | Markdown | 33 | 2,075 | Tooling Documentation |
| 16 | `data/3rd-party-modules/lumi-addons/README.rst` | RST | 82 | 2,481 | Addons Submodule Root |
| 17 | `data/3rd-party-modules/lumi-addons/CONTRIBUTING.rst` | RST | 111 | 4,045 | Addons Submodule Guidelines |
| 18 | `data/3rd-party-modules/lumi-addons/LICENSE` | Text | 624 | 32,457 | Addons Submodule / GPL-3.0 |
| 19 | `data/3rd-party-modules/lumi-addons/activity-roles/README.rst` | RST | 19 | 652 | Addon Module Documentation |
| 20 | `data/3rd-party-modules/lumi-addons/rolementions/README.rst` | RST | 70 | 3,446 | Addon Module Documentation |

---

## 2. Key Findings & Categorized Audit Defect Summary

### 2.1 Documentation Coverage Gaps (Missing Documentation Files)

1. **Un-documented Applications (`apps/`)**:
   - `apps/gateway` — Missing `README.md` explaining WebSocket gateway runtime role, event bus publishing, and env configuration.
   - `apps/scheduler` — Missing `README.md` explaining BullMQ scheduled task coordinator and leader election.
   - `apps/worker` — Missing `README.md` explaining worker process execution, job consumption, and scaling model.
   - *(Only `apps/dashboard` contains a `README.md`.)*

2. **Un-documented Packages (`packages/`)**:
   - None of the 8 monorepo packages contain a `README.md` file:
     - `packages/contracts`
     - `packages/core`
     - `packages/eslint-config`
     - `packages/event-bus`
     - `packages/observability`
     - `packages/sdk`
     - `packages/sharding`
     - `packages/typescript-config`

3. **Un-documented Addons (`lumi-addons`)**:
   - 3 out of 5 module directories in `lumi-addons` are missing documentation files (`README.rst` or `README.md`):
     - `data/3rd-party-modules/lumi-addons/auto-translate/`
     - `data/3rd-party-modules/lumi-addons/emoji-stealer/` (linked in `README.rst`, but file does not exist)
     - `data/3rd-party-modules/lumi-addons/thread-cleaner/`

---

### 2.2 Broken Links and Placeholder URLs

1. **Broken Relative File Link**:
   - Location: `data/3rd-party-modules/lumi-addons/README.rst` (line 74)
   - Target Link: `Contributing Guidelines <./CONTRIBUTING.md>`
   - Issue: The target file is named `CONTRIBUTING.rst`, NOT `CONTRIBUTING.md`. Clicking this link results in a 404 error.

2. **Broken Directory / Target Link**:
   - Location: `data/3rd-party-modules/lumi-addons/README.rst` (line 37)
   - Target Link: `emoji-stealer <./emoji-stealer/>`
   - Issue: Target directory contains no `README.rst` or `README.md` file.

3. **Unresolved Placeholder Discord Invite URLs**:
   - `SECURITY.md` (line 20): `https://discord.gg/YOUR_INVITE`
   - `.github/PRIVACY_POLICY.md` (line 10): `https://discord.gg/YOUR_INVITE`
   - `.github/TERMS_OF_SERVICE.md` (line 10): `https://discord.gg/YOUR_INVITE`

---

### 2.3 Structural Inconsistencies and Legacy References

1. **Incomplete Submodule Module Inventory**:
   - Location: `data/3rd-party-modules/lumi-addons/README.rst` (lines 34–38)
   - Issue: The "Available Modules" table lists ONLY `emoji-stealer`. It omits four other existing addon modules: `activity-roles`, `auto-translate`, `rolementions`, and `thread-cleaner`.

2. **Legacy Bot Name Leak ("Ember")**:
   - Location: `data/3rd-party-modules/lumi-addons/rolementions/README.rst` (line 10)
   - Text: `...the next time it’s pinged, Ember blocks further mentions of it for a set duration...`
   - Issue: References legacy bot name "Ember" instead of "Lumi".

3. **Outdated Code Decorators in Guidelines**:
   - Location: `data/3rd-party-modules/lumi-addons/CONTRIBUTING.rst` (line 89)
   - Code snippet: `@LumiModule({ ... })` and `import { Module, LumiModule } from "#lib/module-system/Module.js";`
   - Issue: Out of date with `AGENTS.md` and `@lumi/core`, which use `@DefineModule` decorator and `#lib/module-system.js`.

4. **Inaccurate Import Alias Path**:
   - Location: `data/3rd-party-modules/lumi-addons/CONTRIBUTING.rst` (line 44)
   - Path given: `#utilities/cards.js`
   - Issue: Monorepo alias standard defined in `AGENTS.md` is `#lib/utilities/cards.js` or `src/lib/utilities/cards.ts`.

5. **Inconsistent File Extension Guidance**:
   - Location: `data/3rd-party-modules/lumi-addons/CONTRIBUTING.rst` (line 66)
   - Text: `└── README.md # User-facing installation and usage guide`
   - Issue: Advises creating `README.md`, whereas existing module README files in `lumi-addons` use ReStructuredText (`README.rst`).

---

### 2.4 Formatting and Syntax Defects

1. **Empty RST HTML Blocks**:
   - Location: `data/3rd-party-modules/lumi-addons/README.rst` (lines 21–27)
   - Issue: Empty `.. raw:: html` tags without content.

2. **Unlabeled Code Block Syntax**:
   - Location: `data/3rd-party-modules/lumi-addons/rolementions/README.rst` (line 17)
   - Issue: Uses bare `::` instead of directive `.. code:: bash`.

---

## 3. File-by-File Audit Table

| File Path | Status | Link Check | Syntax & Formatting | Structural Completeness |
|---|---|---|---|---|
| `README.md` | PASS | Valid relative links | Proper GFM formatting | Complete |
| `AGENTS.md` | PASS | Valid relative links | Proper GFM formatting | Complete |
| `CHANGELOG.md` | PASS | Valid spec links | GFM Keep-a-Changelog | Complete |
| `CODE_OF_CONDUCT.md` | PASS | N/A | GFM Contributor Covenant | Complete |
| `CONTRIBUTING.md` | PASS | Valid links (`AGENTS.md`) | Proper GFM formatting | Complete |
| `SECURITY.md` | MINOR | `YOUR_INVITE` placeholder | Proper GFM formatting | Complete |
| `LICENSE` | PASS | N/A | Verbatim AGPL-3.0 text | Complete |
| `version.txt` | PASS | N/A | Single line version string | Complete |
| `.github/PRIVACY_POLICY.md` | MINOR | `YOUR_INVITE` placeholder | GFM with HTML title | Complete |
| `.github/PULL_REQUEST_TEMPLATE.md` | PASS | Valid relative links | Proper GFM template | Complete |
| `.github/TERMS_OF_SERVICE.md` | PASS | Valid link to `../LICENSE` | GFM with HTML title | Complete |
| `apps/dashboard/README.md` | PASS | N/A | GFM tables & code blocks | Complete |
| `config/README.md` | PASS | N/A | GFM lists & code blocks | Complete |
| `deploy/k8s/README.md` | PASS | N/A | GFM code blocks | Complete |
| `scripts/README.md` | PASS | N/A | GFM headings & lists | Complete |
| `data/3rd-party-modules/lumi-addons/README.rst` | FAIL | Broken link `./CONTRIBUTING.md` | Empty `raw:: html` tags | Incomplete module table |
| `data/3rd-party-modules/lumi-addons/CONTRIBUTING.rst` | FAIL | N/A | RST formatting | Outdated `@LumiModule` & alias |
| `data/3rd-party-modules/lumi-addons/LICENSE` | PASS | N/A | Verbatim GPL-3.0 text | Complete |
| `data/3rd-party-modules/lumi-addons/activity-roles/README.rst` | PASS | N/A | RST formatting | Complete |
| `data/3rd-party-modules/lumi-addons/rolementions/README.rst` | WARN | N/A | Bare `::` code block | Legacy "Ember" name reference |

---

## 4. Remediation Recommendations

1. **Fix Broken Link in `lumi-addons/README.rst`**: Change `CONTRIBUTING.md` link to `CONTRIBUTING.rst`.
2. **Update Module Table in `lumi-addons/README.rst`**: Add `activity-roles`, `auto-translate`, `rolementions`, and `thread-cleaner`.
3. **Create Missing README Files**:
   - Add `README.md` for `apps/gateway`, `apps/scheduler`, `apps/worker`.
   - Add `README.md` for `packages/*`.
   - Add `README.rst` for `lumi-addons` modules: `auto-translate`, `emoji-stealer`, `thread-cleaner`.
4. **Update `rolementions/README.rst`**: Replace legacy "Ember" reference with "Lumi".
5. **Update `lumi-addons/CONTRIBUTING.rst`**: Update code block to `@DefineModule`, correct import aliases, and align file extension guidance.
6. **Replace Placeholder Links**: Replace `https://discord.gg/YOUR_INVITE` with production server URL or environment placeholder.
