# Dashboard Information Architecture — Proposed Redesign

**Version:** Wave 6 — Dashboard IA & Navigation  
**Effective Date:** Post-Wave 6 implementation  
**Design Principles:** Per plan.md §8

## Executive Summary

The proposed redesign reorganizes the dashboard to align **navigation structure** with **user mental models** and **workflows**, not administrative domain boundaries. Key changes:

1. **Reorganize categories** to match "what users do" not "what features are"
2. **Unified moderation + appeals flow** under a single "Discipline & Appeals" section
3. **Separate configuration from monitoring** — Settings vs. Health
4. **Promote module/addon management** to top-level where it drives functionality
5. **Improve status visibility** across all sections (not just Security)
6. **Progressive disclosure** for advanced/rare settings
7. **Mobile-first responsive behavior** at all breakpoints

---

## 1. Design Principles (from plan.md §8)

```
✓ Information hierarchy clarity
✓ Predictable navigation
✓ Feature discoverability
✓ Server selection prominence
✓ Module navigation clarity
✓ Configuration pages organization
✓ Consistent patterns across sections

+ fewer visual layers
+ clearer hierarchy
+ stronger spacing rhythm
+ predictable navigation
+ excellent typography
+ excellent empty states
+ restrained animation
+ excellent keyboard usability
+ responsive design
+ consistent forms
+ obvious save state
+ immediate feedback
+ no mystery controls
+ no unnecessary modals
+ no UI clutter
```

---

## 2. Global & Authentication Layer (Unchanged)

```
/                 → Landing page or guilds redirect
├─ /login         → OAuth flow
├─ /guilds        → Server picker
├─ /legal/privacy → Legal pages
└─ /legal/terms   → Legal pages

Special routes (public):
/appeal/[guildId]/[caseId]  → Public appeal entry
/verify/[guildId]           → Verification entry
/account                    → Cross-guild account settings (moved from guild context)
```

**Change:** Account settings moved to global level (not per-guild).

---

## 3. Redesigned Guild Navigation

**Entry:** `/guild/[guildId]/`  
**Layout:** Two-column (sidebar + main) — unchanged  
**Sidebar:** Restructured categories + better status visibility

### New Top-Level Links

```
🏠 Home          → /guild/[guildId]/
🛠️ Configuration → /guild/[guildId]/config
⚡ Quick Actions → (submenu or modal)
```

**Purpose:**
- **Home:** Dashboard overview, quick stats, at-a-glance health
- **Configuration:** Unified module, addon, and advanced settings access point
- **Quick Actions:** Floating action button or dropdown for common operations (engage panic, view recent cases, etc.)

**UX Rationale:**
- Reduces visual weight of top-level links
- Reserves top slots for truly primary user destinations
- Groups related management tasks under Configuration

### Navigation Categories (Redesigned)

**Sidebar Collapsible Groups** (using same component, different data structure)

#### A. Discipline & Appeals (6 items, default: expanded)
**Rationale:** Unifies the complete moderation workflow (action → tracking → resolution).

```
Gavel          Moderation Cases     → /guild/[guildId]/moderation
Triangle Alert Warn Thresholds      → /guild/[guildId]/moderation/thresholds
Ban            Blocklist            → /guild/[guildId]/moderation/blocklist
Sticky Note    Mod Notes            → /guild/[guildId]/moderation/notes
Scale          Appeals Management   → /guild/[guildId]/appeals
FileText       Appeal Templates     → /guild/[guildId]/appeals/templates
```

**Nested Rationale:** Thresholds, blocklist, and notes are now nested under moderation (clearer hierarchy). Appeal templates are under Appeals (focused appeal workflow).

**Improvements:**
- Moderators don't need to toggle between two sections to handle an appeal
- Thresholds conceptually belong with cases (both are moderation policy)
- Appeal templates grouped with appeals (related feature)
- Clear visual hierarchy: moderation operations → appeals (resolution)

#### B. Safety & Security (3 items, default: expanded)
**Rationale:** Emergency/security controls that require immediate visibility.

```
AlertTriangle  Panic Mode           → /guild/[guildId]/security/panic
ShieldAlert    Verification Rules   → /guild/[guildId]/security/verification
Sliders        Permission Overrides → /guild/[guildId]/security/overrides
```

**Status Indicator:** Panic armed = red dot (unchanged)  
**New:** Verification status (enabled/disabled) and override count as badges.

**Improvements:**
- Renamed "Security" header to reflect content (Safety is broader)
- More specific naming (Panic Mode vs. generic "Panic & Verification")
- Consistent status signaling across all three links

#### C. Community & Engagement (2 items, default: expanded)
**Rationale:** User-facing, non-disciplinary features that build community.

```
IdCard    Permits & Access → /guild/[guildId]/permits
MessageCircle Verification → /guild/[guildId]/community/verification
```

**Note:** Verification appears here (user enrollment) AND under Safety (admin rules). Two perspectives same feature.

**Improvements:**
- Clearer positioning: community building, not security enforcement
- "Permits" refocused as community access, not admin rules
- Better name: "Community & Engagement" signals actual purpose

#### D. Monitoring & Diagnostics (3 items, default: collapsed)
**Rationale:** Observability and system health (monitoring, not configuration).

```
HeartPulse Health Dashboard  → /guild/[guildId]/health
BarChart   Activity & Trends → /guild/[guildId]/monitoring/activity
Clipboard Audit Log         → /guild/[guildId]/monitoring/audit
```

**Restructure:** Moved from "System" category. Health Check renamed "Health Dashboard" (more descriptive).

**Improvements:**
- Separated monitoring from admin config (clarifies purpose)
- Health Dashboard promotes status at a glance
- Activity trends shows behavioral patterns (new, addresses "what's happening now?")
- Audit log grouped with other observability

#### E. Configuration (collapsed by default)
**Rationale:** Rarely-accessed operational and advanced settings; grouped for discoverability.

```
Settings    Module & Addon Settings → /guild/[guildId]/config/modules
Layers      Module & Addon Enablement → /guild/[guildId]/config/features
Wrench      Advanced Settings       → /guild/[guildId]/config/advanced
FileText    General Settings        → /guild/[guildId]/config/general
History     Settings History        → /guild/[guildId]/config/history
Volume2     Voice Generators        → /guild/[guildId]/config/voice
```

**Sub-organization:**
- **Module & Addon Settings:** Unified point to configure all active modules (modules table → click to config)
- **Module & Addon Enablement:** Toggle features on/off (discovery interface)
- **Advanced Settings:** Guild-level options (rare use)
- **General Settings:** Guild name, icon, basic info (setup)
- **Settings History:** Audit trail of config changes
- **Voice Generators:** Temporary voice channel config

**Improvements:**
- Clear separation: "what can I do?" (top categories) vs. "how do I set it up?" (configuration)
- Progressive disclosure: collapsed by default keeps sidebar clean
- Nested structure shows relationships (all config-related items grouped)
- Module/addon management is now discoverable without top-level clutter

#### F. System (Moved to bottom, collapsed, bot-owner-only)
**Rationale:** Rare access (most guild managers won't need it), but visible for those who do.

```
Database  Data Management  → /guild/[guildId]/system/data
Export    Export/Backup    → /guild/[guildId]/system/export
ShieldUser GDPR & Privacy → /guild/[guildId]/system/privacy
```

**Visibility:** Only shown if user is bot owner (permission check in nav generator).

**Improvements:**
- Moved to bottom (rarely accessed by guild managers)
- Collapsed by default
- Clear labels for data operations

---

## 4. System Admin Navigation (Reorganized)

**Accessible:** Bot owner only.  
**Entry:** `/system/`  
**Layout:** Identical to guild (sidebar + main)  
**Sidebar:** Non-collapsible groups (similar structure to guild, but simpler)

**Structure remains largely the same, but:**

```
┌─ Platform & Configuration
│  ├─ Global Config
│  ├─ Module Kill-Switches (now at top)
│  └─ Addon Repositories
├─ Safety & Enforcement
│  ├─ Global Blocklist
│  └─ User Privacy (GDPR)
└─ Monitoring & Diagnostics
   ├─ System Health
   ├─ Shard Telemetry
   └─ System Audit Log
```

**Alignment:** Category names now match guild-level categories for consistency.

---

## 5. Proposed Page Hierarchy & Routes

### Guild Overview & Main Pages

```
/guild/[guildId]/
├─ (overview)                    [Home]
│  ├─ server info + member stats
│  ├─ module status strip
│  ├─ health summary
│  ├─ recent activity feed
│  └─ alerts/attention panel
│
├─ /config                       [Configuration hub]
│  ├─ /config/modules           [Module/addon discovery & enablement]
│  ├─ /config/features          [Feature discovery (alias or merged)]
│  ├─ /modules/[name]           [Individual module config form]
│  ├─ /config/addons            [Addon management]
│  ├─ /config/general           [Guild name, icon, basic settings]
│  ├─ /config/advanced          [Advanced options]
│  └─ /config/voice             [Temp voice channel config]
│
├─ /moderation                   [Case database]
│  ├─ (list view, filterable)
│  ├─ /moderation/[caseId]      [Case detail + actions]
│  ├─ /moderation/thresholds    [Warn threshold rules]
│  ├─ /moderation/blocklist     [Blocklist management]
│  └─ /moderation/notes         [Mod note templates/history]
│
├─ /appeals                      [Appeals management]
│  ├─ (list view, status-based)
│  ├─ /appeals/[appealId]       [Appeal detail + decision form]
│  └─ /appeals/templates        [Appeal response templates]
│
├─ /permits                      [Access permits]
│  ├─ (list view, tree by role)
│  ├─ /permits/[permitId]       [Permit detail + edit]
│  └─ /permits/rules            [Global permit rules]
│
├─ /security/panic              [Panic mode engagement]
│
├─ /security/verification       [Verification rules & enrollment]
│
├─ /security/overrides          [Permission override management]
│
├─ /community/verification      [Verification from user perspective]
│
├─ /health                       [Health dashboard]
│  ├─ module health
│  ├─ bot permissions status
│  ├─ shard status (local)
│  └─ performance metrics
│
├─ /monitoring/activity         [Activity trends & analytics]
│  ├─ recent actions timeline
│  ├─ member join/leave trends
│  └─ moderation action frequency
│
├─ /monitoring/audit            [Audit log viewer]
│  ├─ config changes
│  ├─ moderation actions
│  └─ system events
│
├─ /config/history              [Settings history]
│  └─ timeline of config changes
│
└─ /system/                     [System level, bot-owner only]
   ├─ /system/data             [Data export/backup]
   ├─ /system/export           [Guild export (alias)]
   └─ /system/privacy          [GDPR data deletion]
```

### System Admin Pages

```
/system/
├─ (overview)                    [System health dashboard]
│  ├─ platform status
│  ├─ shard fleet view
│  ├─ global alert panel
│  └─ recent system events
│
├─ /global-config               [Platform configuration]
│
├─ /modules                      [Module kill-switches]
│
├─ /addons                       [Addon repository]
│
├─ /blocklist                    [Global blocklist]
│
├─ /users                        [User privacy/GDPR]
│
├─ /shards                       [Shard telemetry]
│  ├─ fleet overview
│  ├─ shard detail [id]
│  └─ shard history
│
└─ /audit                        [System audit log]
```

---

## 6. New Information Hierarchy & Progressive Disclosure

### Sidebar Expansion Rules

**Desktop (≥1024px):**
- All collapsible groups visible
- Default open: Discipline & Appeals, Safety & Security, Community & Engagement
- Default collapsed: Monitoring & Diagnostics, Configuration, System
- Expansion state persisted to localStorage
- Sidebar width: 280px

**Tablet (768px–1023px):**
- Sidebar collapses to icon-only nav on scroll
- Tap to expand group (in-place animation)
- Groups default to collapsed to save space

**Mobile (<768px):**
- Sidebar becomes off-canvas drawer
- Hamburger menu in header to toggle
- Drawer overlays content (not side-by-side)
- Groups auto-collapse when drawer closes

### Status Visibility

**Each category group displays:**
- Item count badge (auto-calculated)
- Alert indicator (red dot) for high-priority items within group
- Status icon (optional) showing group health

**Specific Indicators:**
- **Discipline & Appeals:** Case count badge, unreviewed appeals dot
- **Safety & Security:** Panic armed dot (existing), override count badge
- **Community & Engagement:** Pending verifications dot
- **Monitoring & Diagnostics:** Health status icon (green/yellow/red)
- **Configuration:** Unsaved changes indicator (if applicable)

---

## 7. Key Design Changes

### A. Navigation Metaphors

**Before:** "System categories" (moderation, security, community, system)  
**After:** "User activities" (what you do) + "Configuration" (how you set things up)

### B. Module/Addon Discovery

**Before:** Top-level links to /modules and /addons, then click to configure  
**After:** Unified configuration hub under /config with module/addon discovery first, then configuration

**Benefit:** Users see "here's what can be enabled" before deciding to configure.

### C. Appeals Workflow

**Before:** Moderation Cases and Appeals in separate categories  
**After:** "Discipline & Appeals" unifies the workflow

**Benefit:** Moderator can scan from case → appeal → resolution in one sidebar section.

### D. Status Signaling

**Before:** Red dot only on Security (panic armed)  
**After:** Status indicators on all groups where appropriate

**Benefit:** Quick at-a-glance view of what needs attention, across all sections.

### E. Configuration Depth

**Before:** Feature configuration at /guild/[guildId]/[feature]/  
**After:** Configuration pages nested under /config/

**Examples:**
- Module toggles: /guild/[guildId]/config/modules
- Module detail: /guild/[guildId]/modules/[name] (or /config/modules/[name])
- Guild settings: /guild/[guildId]/config/general

**Benefit:** Clear visual hierarchy (config is under /config, operations are at top level).

---

## 8. User Flow Improvements

### Flow 1: "I need to handle a moderation case + its appeal"
**Before:** Navigate between Moderation Cases and Appeals  
**After:** Discipline & Appeals section shows both

Steps: 1 → 2 (improved!)

### Flow 2: "Enable a module and configure it"
**Before:** 
1. Click Modules
2. Browse/enable
3. Click module name to configure
4. Set options

**After:**
1. Click Configuration
2. Click "Module & Addon Settings"
3. Browse/enable/configure in unified interface

Steps: Same, but clearer sequence.

### Flow 3: "Check server health"
**Before:** Home page shows health panel, OR click Health Check in Security  
**After:** Home page + dedicated Health Dashboard in Monitoring

Steps: Same, but more discoverable.

### Flow 4: "I need to do something fast (panic/recent actions/etc.)"
**Before:** Moderation Cases → search/filter, OR Security → Panic  
**After:** Home page + Quick Actions floating menu (design TBD)

Steps: 1–2 (faster!)

---

## 9. Visual Language Updates

### Sidebar Styling

- **Group headers:** Bolder font, stronger color contrast
- **Nested items:** Slight left padding/indent to show hierarchy
- **Active state:** Full-width highlight (not just icon)
- **Status badges:** Small mono badge, positioned top-right of group header
- **Alert dots:** Positioned top-right, red (#e8494d or similar)

### Empty States

- Each page type should have clear empty state (no data, no features enabled, etc.)
- Inline CTAs to enable/configure (e.g., "Enable a module" in config hub)

### Breadcrumbs

- Add breadcrumb navigation on config/detail pages
- Pattern: Server Name → Category → Page → Detail (if applicable)
- Breadcrumbs allow quick navigation back to section

---

## 10. Responsive Behavior

### Desktop (≥1024px)
- Two-column layout (sidebar + main)
- Sidebar 280px fixed
- Main content area max-width 88rem
- All navigation visible, user chooses what to expand

### Tablet (768px–1023px)
- Two-column layout (sidebar icon-only + main)
- Sidebar collapses to icon strip (48px) on scroll
- Tap icon to expand group (drawer-like, in-place)
- Main content adjusts width
- Swipe to close drawer (TBD: Shadcn dialog behavior)

### Mobile (<768px)
- Single column
- Sidebar off-canvas drawer
- Hamburger menu in header
- Main content full-width (with padding)
- Drawer slides from left, overlays content
- Tap backdrop or close button to dismiss drawer

---

## 11. Migration Path

### Phase 1: Navigation Restructuring (Wave 6)
1. Refactor `guild-nav.ts` to produce new group structure
2. Update `GuildSideNav` to handle nested items + badges/indicators
3. Add breadcrumb component to page layouts
4. Test navigation on all breakpoints

### Phase 2: Page Reorganization (Ongoing)
1. Move route files to new locations (e.g., `/moderation/[caseId]` → `/moderation/[caseId]`)
2. Update RPC calls / data-fetching as needed
3. Ensure all old routes redirect to new locations (no 404s)
4. Update tests and documentation

### Phase 3: Configuration Hub (Wave 7)
1. Redesign modules config page (unified discovery + enable/configure)
2. Nest sub-pages under /config/
3. Update addon management
4. Create unified advanced settings page

### Phase 4: Monitoring Dashboard (Wave 7)
1. Rename "Health Check" → "Health Dashboard"
2. Create "Activity & Trends" page
3. Reorganize audit log access

### Phase 5: Mobile Optimization (Wave 8)
1. Implement off-canvas drawer for sidebar
2. Test responsive breakpoints
3. Optimize touch targets
4. Add swipe/gesture support (if applicable)

---

## 12. Accessibility & Inclusive Design

### Color
- **Alert indicators:** Use color + icon/shape (not color alone)
- **Status badges:** Text labels in addition to icon/color
- **Active states:** Use underline + highlight (not color alone)

### Keyboard Navigation
- Tab through sidebar groups, items, and main content
- Arrow keys to expand/collapse groups (custom behavior)
- Enter/Space to activate links
- Esc to close drawer (mobile)

### Screen Readers
- Proper heading hierarchy (h1 = page, h2 = section, etc.)
- aria-current for active nav item
- aria-expanded for collapsible groups
- aria-label for icon-only buttons (mobile hamburger)
- Skip-to-content link

### Motion & Animation
- Sidebar expand/collapse: 200ms ease-out animation
- Drawer open/close: 250ms ease-in-out
- Respect prefers-reduced-motion

---

## 13. Success Criteria (Wave 6 → Wave 7)

By end of Phase 1 (navigation restructuring):

- [ ] Guild nav renders new category structure (no behavior change yet)
- [ ] Category defaults (expand/collapse) work as designed
- [ ] Status indicators + badges render correctly
- [ ] Mobile sidebar collapses/expands properly
- [ ] Breadcrumbs appear on detail pages
- [ ] No accessibility regressions (axe-core clean)
- [ ] TypeScript clean, lint clean
- [ ] Dashboard tests pass
- [ ] Documentation updated (this file + code comments)

---

## 14. Comparison: Before → After

| Aspect | Current | Proposed | Benefit |
|--------|---------|----------|---------|
| **Moderation + Appeals** | Separate sections | Unified "Discipline & Appeals" | Clearer workflow, less switching |
| **Configuration** | Scattered at page level | Grouped under /config | Better discovery, clearer hierarchy |
| **Module Discovery** | /modules then config | /config/modules with unified UI | Single entry point |
| **Status Visibility** | Only Security (panic dot) | All sections with appropriate badges | At-a-glance health awareness |
| **Sidebar Real Estate** | 4 expanded groups | 3 expanded + 3 collapsed (cleaner) | Less visual clutter |
| **Mobile Sidebar** | Collapses to hamburger | Off-canvas drawer | Better space utilization |
| **Audit Access** | Under "System" (collapsed) | Monitoring & Diagnostics (clearer) | Clearer purpose, better location |
| **Health Checks** | Security section | Monitoring & Diagnostics | Separated from security config |
| **Guild Management** | Top-level links | Under Configuration | Better organization |

---

## 15. Open Design Questions (For Feedback)

1. **Quick Actions button:** Should it be:
   - Floating action button (FAB) in corner?
   - Dropdown in header next to search?
   - Sidebar section?
   - Top-level link?

2. **Module/Addon unified config:** Should module list and addon list be:
   - Separate pages (/config/modules, /config/addons)?
   - Unified table (modules + addons together)?
   - Tabs within one page?

3. **Activity Trends:** Should this include:
   - Join/leave counts over time?
   - Moderation action frequency?
   - Module-specific metrics (e.g., permits issued)?
   - User engagement metrics?

4. **Nested routes:** Should `/guild/[guildId]/moderation/thresholds` exist as:
   - Independent page (current proposal)?
   - Modal/inline editor in moderation list?
   - Separate main section (not nested)?

5. **Breadcrumbs:** Should they appear on:
   - All pages (including list views)?
   - Only detail pages?
   - Home page?

6. **Alert indicators:** Should they:
   - Show item-specific alerts (e.g., "3 unreviewed appeals")?
   - Just show "something needs attention" (red dot)?
   - Use different colors for severity (red/yellow/orange)?

---

## Summary of Changes

**Reorganizations:**
- Moderation + Appeals → "Discipline & Appeals" (unify workflow)
- System → split into "Monitoring & Diagnostics" + "Configuration" + "System" (clarity)
- Community (renamed) + new sections for engagement vs. safety

**New Patterns:**
- Configuration hub under /config/ (progressive disclosure)
- Status badges on all group headers (visibility)
- Breadcrumbs for location awareness
- Off-canvas drawer on mobile (better UX)

**Information Hierarchy:**
- Top-level: Home, Configuration (primary user destinations)
- Groups: Organized by activity/workflow, not administrative function
- Nested items: Show hierarchy (e.g., Moderation > Thresholds)

**Accessibility:**
- Enhanced indicators (color + icon/shape)
- Keyboard navigation improvements
- Screen reader friendly structure
- Mobile-first responsive

---

## Appendix A: Detailed Feature Mapping

### Moderation Domain

| Feature | Current Path | Proposed Path | Category |
|---------|--------------|---------------|----------|
| Cases | `/moderation` | `/moderation` | Discipline & Appeals |
| Warn Thresholds | `/warn-thresholds` | `/moderation/thresholds` | Discipline & Appeals (nested) |
| Blocklist | `/blocklist` | `/moderation/blocklist` | Discipline & Appeals (nested) |
| Mod Notes | `/mod-notes` | `/moderation/notes` | Discipline & Appeals (nested) |

### Appeals Domain

| Feature | Current Path | Proposed Path | Category |
|---------|--------------|---------------|----------|
| Appeals List | `/appeals` | `/appeals` | Discipline & Appeals |
| Appeal Detail | `/appeal/[caseId]` | `/appeals/[appealId]` | Discipline & Appeals |
| Templates | N/A | `/appeals/templates` | Discipline & Appeals (new) |

### Configuration Domain

| Feature | Current Path | Proposed Path | Category |
|---------|--------------|---------------|----------|
| Module List | `/modules` | `/config/modules` | Configuration |
| Module Config | `/modules/[name]` | `/modules/[name]` or `/config/modules/[name]` | Configuration |
| Addons | `/addons` | `/config/addons` | Configuration |
| General Settings | N/A (on home) | `/config/general` | Configuration |
| Advanced | `/advanced` | `/config/advanced` | Configuration |
| Voice Generators | `/tempvc` | `/config/voice` | Configuration |
| Settings History | `/history` | `/config/history` | Configuration |

### Security Domain

| Feature | Current Path | Proposed Path | Category |
|---------|--------------|---------------|----------|
| Panic Mode | `/security` | `/security/panic` | Safety & Security |
| Verification (Admin) | `/security` | `/security/verification` | Safety & Security |
| Verification (User) | N/A | `/community/verification` | Community & Engagement |
| Overrides | `/overrides` | `/security/overrides` | Safety & Security |

### Monitoring Domain

| Feature | Current Path | Proposed Path | Category |
|---------|--------------|---------------|----------|
| Health Check | `/health` | `/health` | Monitoring & Diagnostics |
| Audit Log | `/audit` | `/monitoring/audit` | Monitoring & Diagnostics |
| Activity Trends | N/A | `/monitoring/activity` | Monitoring & Diagnostics (new) |

---

## Appendix B: Sidebar Rendering Algorithm

Pseudocode for new sidebar structure:

```typescript
interface SidebarGroup {
  title: string;
  icon?: LucideIcon;
  items: SidebarItem[];
  collapsible: boolean;
  defaultOpen: boolean;
  badge?: number | string;
  alertDot?: boolean;
  visibilityCheck?: (session: Session) => boolean;
}

interface SidebarItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number | string;
  alertDot?: boolean;
  nested?: boolean; // visual indent
}

function renderGuildNav(guildId: string, session: Session): SidebarGroup[] {
  return [
    // Group 1: Discipline & Appeals
    {
      title: "Discipline & Appeals",
      icon: Scale,
      collapsible: true,
      defaultOpen: true,
      items: [
        { href: `/guild/${guildId}/moderation`, label: "Cases", icon: Gavel },
        { href: `/guild/${guildId}/moderation/thresholds`, label: "Thresholds", icon: TriangleAlert, nested: true },
        { href: `/guild/${guildId}/moderation/blocklist`, label: "Blocklist", icon: Ban, nested: true },
        { href: `/guild/${guildId}/moderation/notes`, label: "Mod Notes", icon: StickyNote, nested: true },
        { href: `/guild/${guildId}/appeals`, label: "Appeals", icon: Scale },
        { href: `/guild/${guildId}/appeals/templates`, label: "Templates", icon: FileText, nested: true },
      ],
      badge: casesCount + appealsCount,
      alertDot: unreviewedAppealsCount > 0,
    },
    // Group 2: Safety & Security
    {
      title: "Safety & Security",
      icon: ShieldAlert,
      collapsible: true,
      defaultOpen: true,
      items: [
        { href: `/guild/${guildId}/security/panic`, label: "Panic Mode", icon: AlertTriangle },
        { href: `/guild/${guildId}/security/verification`, label: "Verification", icon: ShieldAlert },
        { href: `/guild/${guildId}/security/overrides`, label: "Overrides", icon: Sliders, badge: overrideCount },
      ],
      alertDot: panicArmed,
    },
    // Group 3: Community & Engagement
    {
      title: "Community & Engagement",
      icon: Users,
      collapsible: true,
      defaultOpen: true,
      items: [
        { href: `/guild/${guildId}/permits`, label: "Permits", icon: IdCard },
        { href: `/guild/${guildId}/community/verification`, label: "Verification", icon: MessageCircle },
      ],
      alertDot: pendingVerificationsCount > 0,
    },
    // Group 4: Monitoring & Diagnostics
    {
      title: "Monitoring & Diagnostics",
      icon: Activity,
      collapsible: true,
      defaultOpen: false,
      items: [
        { href: `/guild/${guildId}/health`, label: "Health Dashboard", icon: HeartPulse },
        { href: `/guild/${guildId}/monitoring/activity`, label: "Activity & Trends", icon: TrendingUp },
        { href: `/guild/${guildId}/monitoring/audit`, label: "Audit Log", icon: ClipboardList },
      ],
      alertDot: healthStatus !== 'healthy',
    },
    // Group 5: Configuration
    {
      title: "Configuration",
      icon: Settings,
      collapsible: true,
      defaultOpen: false,
      items: [
        { href: `/guild/${guildId}/config/modules`, label: "Modules & Addons", icon: Layers },
        { href: `/guild/${guildId}/config/general`, label: "General", icon: Settings },
        { href: `/guild/${guildId}/config/advanced`, label: "Advanced", icon: Wrench },
        { href: `/guild/${guildId}/config/voice`, label: "Voice Generators", icon: Volume2 },
        { href: `/guild/${guildId}/config/history`, label: "Settings History", icon: History },
      ],
      badge: activeModuleCount,
    },
    // Group 6: System (bot-owner only, collapsed)
    {
      title: "System",
      icon: Database,
      collapsible: true,
      defaultOpen: false,
      visibilityCheck: (session) => session.isBotOwner,
      items: [
        { href: `/guild/${guildId}/system/data`, label: "Data Management", icon: Database },
        { href: `/guild/${guildId}/system/export`, label: "Export/Backup", icon: Download },
        { href: `/guild/${guildId}/system/privacy`, label: "GDPR & Privacy", icon: ShieldUser },
      ],
    },
  ];
}
```

---

## Appendix C: Questions for Stakeholder Feedback

1. Does the new organization feel more intuitive than the current structure?
2. Are there any workflows we missed that would benefit from additional restructuring?
3. Should "Community & Engagement" also include suggestion/feedback mechanisms?
4. Is "Monitoring & Diagnostics" the right name, or should it be something else?
5. Should Quick Actions be implemented, and if so, which actions are most valuable?
6. Are there any category names that feel confusing or unintuitive?
7. Should the mobile drawer have any special behavior (swipe gestures, auto-close, etc.)?
8. Should configuration pages have their own breadcrumb, or is the sidebar enough?

---

**End of Proposed Architecture**
