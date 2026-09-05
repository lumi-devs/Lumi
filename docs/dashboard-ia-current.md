# Dashboard Information Architecture — Current State

**Date Audited:** 2026-09-03  
**Scope:** Apps Dashboard v0.3.0  
**Methodology:** Route audit, navigation component analysis, UX flow mapping

## Executive Summary

The current dashboard uses a **context-based sidebar navigation** with collapsible category groups. The structure divides access into three tiers:

1. **Public/Login** — unauthenticated flows
2. **Guild Admin** — per-server management (accessible to guild managers)
3. **System Admin** — platform-wide controls (bot owner only)

The navigation is functionally complete but exhibits organizational confusion between feature domains (what users do) and administrative domains (how things are configured).

---

## 1. Global/Authentication Layer

```
/                 → Landing page + guild picker
├─ /login         → OAuth flow
├─ /guilds        → Server picker (primary entry after auth)
├─ /legal/privacy → Legal pages
└─ /legal/terms   → Legal pages

Special routes:
/appeal/[guildId]/[caseId]     → Direct case appeal link (public)
/verify/[guildId]              → Verify member entry (public)
```

**Current Behavior:**
- Unauthenticated users land on `/`, which displays landing page
- Authenticated users see server picker at `/guilds`
- No landing page for authenticated users yet (defaults to guilds page)

---

## 2. Guild-Scoped Navigation

**Entry:** `/guild/[guildId]/`  
**Layout:** Two-column (sidebar + main)  
**Sidebar:** Persistent, collapsible category groups

### Top-Level Links (Always Visible)
```
📋 General      → /guild/[guildId]/
🎛️ Modules      → /guild/[guildId]/modules
📦 Addons       → /guild/[guildId]/addons
✨ Guided Setup → /guild/[guildId]/setup
```

**Purpose:** Primary entry points into major feature areas.  
**UX:** One-click access from anywhere in guild context.

### Category Groups (Collapsible)

**Default State:** Moderation + Security expanded; Community + System collapsed.

#### A. Moderation (4 items, default: expanded)
```
Gavel          Moderation Cases   → /guild/[guildId]/moderation
Triangle Alert Warn Thresholds    → /guild/[guildId]/warn-thresholds
Ban            Blocklist          → /guild/[guildId]/blocklist
Sticky Note    Mod Notes          → /guild/[guildId]/mod-notes
```

**Purpose:** Managing disciplinary actions and moderator records.  
**Scope:** Per-guild member actions, threshold rules, blocklist, notes.

#### B. Security (3 items, default: expanded)
```
Shield Alert   Panic & Verification → /guild/[guildId]/security
Sliders        Overrides             → /guild/[guildId]/overrides
Heart Pulse    Health Check          → /guild/[guildId]/health
```

**Purpose:** Emergency controls and security monitoring.  
**Scope:** Panic button, role/permission overrides, bot health signals.  
**Alert Indicator:** Red dot when panic is armed.

#### C. Community (2 items, default: collapsed)
```
ID Card        Permits → /guild/[guildId]/permits
Scale          Appeals → /guild/[guildId]/appeals
```

**Purpose:** Member engagement and dispute resolution.  
**Scope:** Access permits/verification, ban appeals management.

#### D. System (4 items, default: collapsed)
```
Volume 2       Voice Generators      → /guild/[guildId]/tempvc
History        Settings History      → /guild/[guildId]/history
Clipboard List Audit Log             → /guild/[guildId]/audit
Wrench         Advanced              → /guild/[guildId]/advanced
```

**Purpose:** Operational logs and advanced configuration.  
**Scope:** Temporary voice channel config, config change history, moderation/system audit log, advanced guild settings.

### Page-Level Routes

#### Guild Overview (`/guild/[guildId]/`)
**Content:**
- Guild name, member count, icon
- Module status strip (all modules + enablement)
- Health summary (quick status indicators)
- Stats grid (member count, recent cases, etc.)
- "Needs Attention" panel (high-priority issues)
- Recent audit entries (last N actions)

#### Feature Pages (Module Configuration)
**Pattern:** `/guild/[guildId]/[feature-name]/page.tsx`

Examples:
- `/guild/[guildId]/moderation/` — Case database, filtering, details
- `/guild/[guildId]/security/` — Panic mode settings + verification config
- `/guild/[guildId]/permits/` — Permit list and management
- `/guild/[guildId]/modules/` — Module gallery + per-module settings
- `/guild/[guildId]/modules/[moduleName]/` — Single module config form

#### Detail/Nested Routes
- `/guild/[guildId]/appeal/[caseId]/` → (deep link, not nav-visible)

---

## 3. System Admin Navigation

**Accessible:** Bot owner only.  
**Entry:** `/system/`  
**Layout:** Identical to guild (sidebar + main)  
**Sidebar:** Non-collapsible category groups

### Category Groups

#### A. Platform (3 items)
```
Globe          Global Config          → /system/
Power          Module Kill-Switches   → /system/modules
Package        Addon Repositories     → /system/addons
```

**Purpose:** Platform-wide settings and module/addon management.  
**Scope:** Global feature toggles, system configuration, addon registry.

#### B. Enforcement (2 items)
```
Ban            Global Blocklist       → /system/blocklist
Shield User    User Privacy / GDPR    → /system/users
```

**Purpose:** Cross-guild user/safety management.  
**Scope:** Global ban list, GDPR data deletion requests.

#### C. Diagnostics (2 items)
```
Network        Sharding Telemetry     → /system/shards
Clipboard List System Audit Log       → /system/audit
```

**Purpose:** Observability and system health.  
**Scope:** Shard status, global action logs.

---

## 4. Current Navigation Component Architecture

**File Structure:**
```
src/components/layout/
├─ guild-side-nav.tsx       (guild-scoped nav + switcher + user footer)
├─ system-side-nav.tsx      (system-scoped nav + back button + user footer)
├─ side-nav.tsx             (generic collapsible group renderer)
└─ site-header.tsx          (top header, search, user menu)

src/lib/
├─ guild-nav.ts             (guild link + group definitions)
└─ system-nav.ts            (system group definitions)
```

**Key Features:**
- **Guild Switcher** (top of guild sidebar): Dropdown to switch servers + "All Servers" link
- **Collapsible Groups** (guild-scoped): Moderation/Security default open, Community/System default closed
- **Alert Indicator** (Security group): Red dot when panic armed
- **Category Badges** (guild-scoped): Item count badge per group
- **User Footer** (both contexts): Username, avatar, role badge (manager/bot owner)

---

## 5. Identified Pain Points & Architectural Concerns

### A. Information Organization Confusion

1. **Community vs. Moderation are separate:** Appeals (handling bans) lives under Community, but Moderation Cases lives under Moderation. A moderator managing a case's appeal must navigate two different sections.

2. **System category mixes domains:** Voice Generators (feature config) and Settings History (audit trail) are separate concerns but share a category.

3. **Configuration vs. Monitoring blurred:** Health Check is a monitoring page, but it's under Security admin config, not Diagnostics.

### B. Discoverability Issues

1. **Warn Thresholds nested deep:** Under Moderation, but it's a guild-wide rule, not a case action. Could be missed by admins who don't explore fully.

2. **Module configuration dual-access:** Modules can be toggled from overview page, but detailed config requires navigating to Modules section. No clear visual hierarchy.

3. **Setup wizard is a top-level link:** Good for onboarding, but competes for attention with "General" and "Modules" for regular users.

### C. Navigation Patterns Inconsistency

1. **Guild switcher is dropdown:** Requires click to explore alternatives. Server list (`/guilds`) is separate from guild context.

2. **System section has "back" button:** One-directional; can't toggle between Guild and System admin contexts easily.

3. **Alert indicator (panic dot) only on Security:** Other categories might need status indicators (e.g., module failures, pending appeals).

### D. Mobile & Responsive Concerns

1. **Sidebar-based layout assumes desktop:** Mobile users need to interact with hamburger/collapse to see nav.

2. **Wide content area (max-w-[88rem]):** Doesn't adjust sensibly on mobile/tablet.

### E. Hierarchy & Progressive Disclosure

1. **No levels of depth:** All pages are at `/guild/[guildId]/[page]/`. No distinction between dashboard-level config and feature-level config.

2. **Module pages are independent:** `/guild/[guildId]/modules/[moduleName]/` has its own form layout. No unified settings experience.

---

## 6. Current User Flows

### Flow 1: "I need to ban this user"
1. User enters guild context (`/guild/[guildId]/`)
2. Clicks "Moderation Cases"
3. Uses action/search to find or enter case
4. Performs moderation action

**Steps:** 2-3 clicks

### Flow 2: "I want to configure permits"
1. User enters guild context
2. Collapses/scrolls to find "Community"
3. Clicks "Permits"
4. Views/edits permit rules

**Steps:** 2-4 clicks

### Flow 3: "Something's wrong, engage panic mode"
1. User enters guild context
2. Security section likely visible (default expanded)
3. Clicks "Panic & Verification"
4. Engages panic mode

**Steps:** 2 clicks (good!)

### Flow 4: "I need to audit changes to role X"
1. User enters guild context
2. Collapses/scrolls to System
3. Clicks "Audit Log"
4. Filters/searches

**Steps:** 2-4 clicks

---

## 7. Design System & Visual Language

**Current Implementation:**
- Sidebar uses collapsible groups with chevron toggles
- Icons (Lucide) for each category and link
- Category badges (item count) in collapsible header
- Alert indicator (red dot) for high-priority states
- No sub-navigation within pages (flat sidebar always visible)

**Interactions:**
- Hover: Border and text color shift on nav items
- Active: Current page is highlighted (likely via pathname)
- Collapsed groups shrink; expanded groups show all links
- Guild switcher is dropdown (not a select element)

---

## 8. Accessibility & UX Observations

**Positive:**
- Consistent icon usage aids quick scanning
- Sidebar visible on desktop eliminates surprise navigation
- Collapsible groups reduce vertical scroll on mobile

**Concerns:**
- Red alert dot (panic indicator) may not be sufficient for color-blind users
- No breadcrumb/location indicator on pages
- No "current section" highlight in sidebar (unclear context)
- Dropdown guild switcher may be confusing on first use
- System admin section lacks "how to get here" context

---

## 9. Route Summary Table

| Path | Purpose | Context | Accessible To |
|------|---------|---------|---|
| `/` | Landing | Public | Everyone |
| `/login` | Auth | Public | Unauthenticated |
| `/guilds` | Server picker | User | Authenticated |
| `/guild/[guildId]/` | Overview | Guild | Guild managers |
| `/guild/[guildId]/modules` | Module gallery | Guild | Guild managers |
| `/guild/[guildId]/modules/[moduleName]` | Module config | Guild | Guild managers |
| `/guild/[guildId]/addons` | Addon management | Guild | Guild managers |
| `/guild/[guildId]/setup` | Onboarding wizard | Guild | Guild managers |
| `/guild/[guildId]/moderation` | Case database | Guild | Guild managers |
| `/guild/[guildId]/warn-thresholds` | Threshold rules | Guild | Guild managers |
| `/guild/[guildId]/blocklist` | Blocklist mgmt | Guild | Guild managers |
| `/guild/[guildId]/mod-notes` | Moderator notes | Guild | Guild managers |
| `/guild/[guildId]/security` | Panic + verification | Guild | Guild managers |
| `/guild/[guildId]/overrides` | Permission overrides | Guild | Guild managers |
| `/guild/[guildId]/health` | Health monitoring | Guild | Guild managers |
| `/guild/[guildId]/permits` | Access permits | Guild | Guild managers |
| `/guild/[guildId]/appeals` | Ban appeals | Guild | Guild managers |
| `/guild/[guildId]/tempvc` | Voice config | Guild | Guild managers |
| `/guild/[guildId]/history` | Settings history | Guild | Guild managers |
| `/guild/[guildId]/audit` | Audit log | Guild | Guild managers |
| `/guild/[guildId]/advanced` | Advanced settings | Guild | Guild managers |
| `/guild/[guildId]/account` | User account settings | Cross-guild | Authenticated |
| `/appeal/[guildId]/[caseId]` | Public appeal form | Public | Appeal link holders |
| `/verify/[guildId]` | Verification entry | Public | Discord members |
| `/system/` | Global config | System | Bot owner |
| `/system/modules` | Kill-switches | System | Bot owner |
| `/system/addons` | Addon registry | System | Bot owner |
| `/system/blocklist` | Global blocklist | System | Bot owner |
| `/system/users` | GDPR management | System | Bot owner |
| `/system/shards` | Shard telemetry | System | Bot owner |
| `/system/audit` | Global audit log | System | Bot owner |

---

## 10. Measured Observations

**Sidebar Width:** ~280px on desktop  
**Navigation Collapse:** Per-session (localStorage), not persistent  
**Search Integration:** Command palette exists but not deeply integrated into IA  
**Mobile Breakpoint:** Sidebar collapses at Tailwind `md` breakpoint (768px)

---

## Summary

The current IA is **functional and navigable** but suffers from:

1. **Conceptual misalignment** — categories don't map cleanly to user workflows
2. **Buried discoverability** — key features require category exploration
3. **Inconsistent metaphors** — mixing administrative config, operational monitoring, and user-facing features
4. **Limited status visibility** — only Security gets an alert indicator
5. **No progressive disclosure** — all configuration lives at the same depth

**Architecture is solid** (sidebar-based navigation is proven), but **information model needs realignment** to match how users think about their tasks rather than how features are administratively implemented.
