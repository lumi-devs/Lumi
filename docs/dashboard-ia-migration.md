# Dashboard Information Architecture — Migration Path

**Wave:** 6  
**Phases:** 5 phases, spanning Waves 6–8  
**Status:** Planning (no implementation yet)

## Overview

This document describes the step-by-step migration from the current dashboard IA to the proposed IA without breaking user workflows, losing data, or creating 404s.

**Key Principle:** Minimize disruption. Users should see improved navigation structure without losing access to existing features.

---

## Phase 1: Navigation Restructuring (Wave 6 Start)

**Goal:** Implement new sidebar navigation structure without moving routes yet.

**Duration:** 1–2 weeks  
**Risk:** Low (purely navigational, no backend changes)

### Steps

#### 1.1 Refactor guild-nav.ts

**File:** `apps/dashboard/src/lib/guild-nav.ts`

**Changes:**
- Replace `guildManagementGroups()` function with new structure
- Add `collapsible`, `defaultOpen`, `badge`, `alertDot` metadata
- Add `nested` flag for items that should show visual indent
- Add `visibilityCheck` for conditional items (e.g., bot-owner-only)

**Before:**
```typescript
export function guildManagementGroups(guildId: string): GuildNavGroup[] {
  const base = `/guild/${guildId}`;
  return [
    {
      title: "Moderation",
      links: [
        { href: `${base}/moderation`, label: "Moderation Cases", icon: Gavel },
        { href: `${base}/warn-thresholds`, label: "Warn Thresholds", icon: TriangleAlert },
        // ...
      ],
    },
    // ... other groups
  ];
}
```

**After:**
```typescript
export function guildManagementGroups(guildId: string): GuildNavGroup[] {
  const base = `/guild/${guildId}`;
  return [
    {
      title: "Discipline & Appeals",
      collapsible: true,
      defaultOpen: true,
      links: [
        { href: `${base}/moderation`, label: "Moderation Cases", icon: Gavel },
        { href: `${base}/moderation/thresholds`, label: "Warn Thresholds", icon: TriangleAlert, nested: true },
        { href: `${base}/moderation/blocklist`, label: "Blocklist", icon: Ban, nested: true },
        { href: `${base}/moderation/notes`, label: "Mod Notes", icon: StickyNote, nested: true },
        { href: `${base}/appeals`, label: "Appeals", icon: Scale },
        { href: `${base}/appeals/templates`, label: "Templates", icon: FileText, nested: true },
      ],
    },
    // ... other groups with same pattern
  ];
}
```

**Testing:**
- Update type tests to match new structure
- Verify all links resolve (no broken hrefs)
- Ensure badges/indicators render without errors

#### 1.2 Update GuildNavLink and GuildNavGroup types

**File:** `apps/dashboard/src/lib/guild-nav.ts`

**Add to GuildNavLink:**
```typescript
export interface GuildNavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  nested?: boolean;          // NEW: visual indent
  badge?: number | string;   // NEW: small badge (count/status)
  alertDot?: boolean;        // NEW: red alert dot
}
```

**Add to GuildNavGroup:**
```typescript
export interface GuildNavGroup {
  title: string;
  links: GuildNavLink[];
  collapsible?: boolean;
  defaultOpen?: boolean;
  badge?: number | string;   // NEW: group-level badge
  alertDot?: boolean;        // NEW: group-level alert dot
  visibilityCheck?: (session: Session) => boolean; // NEW: conditional rendering
}
```

#### 1.3 Update GuildSideNav component

**File:** `apps/dashboard/src/components/layout/guild-side-nav.tsx`

**Changes:**
1. Accept new badge/alertDot props
2. Render badges in group headers and items
3. Render alert dots with proper styling (red circle, top-right of header/item)
4. Apply nested styling (e.g., left padding) to items with `nested: true`
5. Store expanded/collapsed state in localStorage (per group)
6. Implement visibilityCheck logic (skip rendering if check returns false)

**Example (pseudocode):**
```typescript
export function GuildSideNav({
  guildId,
  guildName,
  guildIcon,
  memberCount,
  guilds,
  username,
  avatar,
  isBotOwner,
  panicArmed,
  unreviewed AppealCount,     // NEW: for badge
  healthStatus,               // NEW: for alert dot
  // ... other props
}: Props) {
  const groups = guildManagementGroups(guildId)
    .filter(group => !group.visibilityCheck || group.visibilityCheck({ isBotOwner }))
    .map(group => ({
      ...group,
      badge: calculateBadge(group, data),        // NEW
      alertDot: calculateAlertDot(group, data),  // NEW
    }));

  return (
    <SideNav
      groups={groups}
      // ... existing props
    />
  );
}
```

#### 1.4 Update SideNav component

**File:** `apps/dashboard/src/components/layout/side-nav.tsx`

**Changes:**
1. Render badges in group headers (top-right, mono font, small)
2. Render alert dots in group headers (red circle, top-right)
3. Apply `nested` styling to items (e.g., `pl-6` instead of `pl-3`)
4. Persist collapsed/expanded state to localStorage
5. Restore state on component mount

#### 1.5 Add Breadcrumb component

**New File:** `apps/dashboard/src/components/ui/breadcrumb.tsx`

**Purpose:** Show location hierarchy (Server → Section → Page → Detail)

**API:**
```typescript
interface BreadcrumbSegment {
  label: string;
  href?: string; // undefined for current page
}

export function Breadcrumb({ segments }: { segments: BreadcrumbSegment[] }) {
  // Render as: Server > Section > Page > Detail
}
```

**Usage (on all non-home pages):**
```typescript
<Breadcrumb segments={[
  { label: guildName, href: `/guild/${guildId}` },
  { label: "Moderation", href: `/guild/${guildId}/moderation` },
  { label: "Cases" }, // current page
]} />
```

#### 1.6 Create route redirects (Temporary)

**Files:** Create `apps/dashboard/src/app/guild/[guildId]/[old-path]/page.tsx` → redirect to new paths

**Examples:**
```typescript
// /warn-thresholds → /moderation/thresholds
export default function WarnThresholdsPage() {
  redirect(`/guild/${guildId}/moderation/thresholds`);
}
```

**Affected routes:**
- `/warn-thresholds` → `/moderation/thresholds`
- `/tempvc` → `/config/voice`
- `/history` → `/config/history`
- `/advanced` → `/config/advanced`
- (others will be created in Phase 2)

**Rationale:** Users with bookmarks or direct links don't hit 404s. Redirects can be removed after v1.

#### 1.7 Update tests

**Files:**
- `apps/dashboard/tests/guild-nav.test.tsx` (new or updated)
- `apps/dashboard/tests/side-nav.test.tsx`

**Test coverage:**
- Sidebar renders with new group structure
- Badges calculate correctly
- Alert dots show/hide based on state
- visibilityCheck filters groups
- Nested items render with indent
- localStorage persistence works
- Redirects resolve correctly

#### 1.8 Documentation updates

**Files:**
- Update `docs/dashboard-ia-proposed.md` with implementation status
- Add code comments to `guild-nav.ts` explaining new structure
- Update `AGENTS.md` or architecture docs if navigation patterns are documented there

### Phase 1 Acceptance Criteria

- [ ] All sidebar groups render with new structure
- [ ] Badges/alert dots display correctly (no console errors)
- [ ] Nested items have visual indent
- [ ] Collapsed/expanded state persists to localStorage
- [ ] Bot-owner-only items only visible to bot owners
- [ ] Old route redirects work (no 404s for old bookmarks)
- [ ] TypeScript passes (`bun run typecheck`)
- [ ] Lint passes (`bun run lint`)
- [ ] Dashboard tests pass (`bun run test`)
- [ ] No accessibility regressions (axe-core)
- [ ] Manual QA on desktop + tablet + mobile

---

## Phase 2: Route Reorganization (Wave 6 → 7 Start)

**Goal:** Move routes to new paths, update data-fetching, maintain backward compatibility.

**Duration:** 2–3 weeks  
**Risk:** Medium (route changes, data fetching updates)

### Steps

#### 2.1 Create new route structure

**Move files:**
```
# Moderation nested routes
/guild/[guildId]/warn-thresholds → /guild/[guildId]/moderation/thresholds
/guild/[guildId]/blocklist → /guild/[guildId]/moderation/blocklist
/guild/[guildId]/mod-notes → /guild/[guildId]/moderation/notes

# Configuration routes
/guild/[guildId]/modules → /guild/[guildId]/config/modules
/guild/[guildId]/modules/[moduleName] → /guild/[guildId]/modules/[moduleName] (keep, but add parent route)
/guild/[guildId]/addons → /guild/[guildId]/config/addons
/guild/[guildId]/setup → /guild/[guildId]/config/setup (optional, or keep at top)
/guild/[guildId]/advanced → /guild/[guildId]/config/advanced
/guild/[guildId]/tempvc → /guild/[guildId]/config/voice
/guild/[guildId]/history → /guild/[guildId]/config/history

# Monitoring routes
/guild/[guildId]/audit → /guild/[guildId]/monitoring/audit
/guild/[guildId]/health → /guild/[guildId]/health (keep at top level for quick access)

# Security routes
/guild/[guildId]/security → /guild/[guildId]/security/panic (or keep both)
/guild/[guildId]/overrides → /guild/[guildId]/security/overrides

# Appeals routes
/guild/[guildId]/appeals → /guild/[guildId]/appeals (keep)
/guild/[guildId]/appeal/[caseId] → /guild/[guildId]/appeals/[appealId] (rename)
```

#### 2.2 Update data-fetching

**RPC Actions:** No changes needed (RPC is internal). Just update URL parameters passed to actions.

**Examples:**
```typescript
// Dashboard action to fetch moderation cases
// Still returns same data, just called from new route path
const cases = await getGuildModerationCases(guildId, page);
```

#### 2.3 Create redirect routes for old paths

**Strategy:** Keep old routes as redirects for at least one release.

**Example redirect file:**
```typescript
// /guild/[guildId]/warn-thresholds/page.tsx
import { redirect } from "next/navigation";

export default async function WarnThresholdsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  redirect(`/guild/${guildId}/moderation/thresholds`);
}
```

#### 2.4 Update link generation in guild-nav.ts

**Already done in Phase 1** — links point to new routes.

#### 2.5 Update tests

**Update all route-based tests:**
- Change test route from `/warn-thresholds` to `/moderation/thresholds`
- Update URL assertions
- Add tests for redirects

#### 2.6 Update documentation

- **docs/dashboard-ia-proposed.md:** Mark Phase 2 as complete
- **Code comments:** Add migration notes to old route files (if kept for redirects)

### Phase 2 Acceptance Criteria

- [ ] All routes moved to new paths
- [ ] Old routes redirect to new paths (no 404s)
- [ ] Data-fetching still works (same RPC calls)
- [ ] TypeScript passes
- [ ] Lint passes
- [ ] All dashboard tests pass
- [ ] Manual QA: Navigate to old URLs, confirm redirects work
- [ ] No broken internal links in sidebar (all point to new routes)
- [ ] Documentation updated

---

## Phase 3: Configuration Hub (Wave 7)

**Goal:** Redesign modules/addons configuration page with unified discovery + enablement + configuration.

**Duration:** 2–3 weeks  
**Risk:** Medium (new component structure, data fetching)

### Steps

#### 3.1 Design unified modules configuration page

**Route:** `/guild/[guildId]/config/modules` (replaces `/guild/[guildId]/modules`)

**Layout:**
1. **Header:** "Modules & Addons" with description
2. **Filters:** Toggle between "All", "Enabled", "Disabled", "Available"
3. **Table/Grid:**
   - Module name + icon
   - Description
   - Status (enabled/disabled toggle)
   - Quick configure button (opens modal or nav to detail page)
4. **Empty State:** If no modules available

#### 3.2 Create /config/modules page

**File:** `apps/dashboard/src/app/guild/[guildId]/config/modules/page.tsx`

**Features:**
- Fetch list of all available modules
- Fetch enabled modules for guild
- Render table with enable/disable toggles
- On toggle: make RPC call to enable/disable
- Show loading state during toggle
- Show error toast if toggle fails

**Data Fetching:**
```typescript
const allModules = await fetchAvailableModules(); // list all modules
const enabledModules = await getGuildModuleStatus(guildId); // which are enabled
const moduleConfigs = await getGuildModuleConfigs(guildId); // current settings
```

#### 3.3 Create /config/addons page (similar)

**File:** `apps/dashboard/src/app/guild/[guildId]/config/addons/page.tsx`

**Features:** Same pattern as modules

#### 3.4 Update module detail pages

**Route:** `/guild/[guildId]/modules/[moduleName]/page.tsx` (unchanged)

**Changes:**
- Add breadcrumb: "Modules & Addons > [Module Name]"
- Add "back" button to config/modules page
- Keep form layout identical to current

#### 3.5 Add general settings page

**New File:** `apps/dashboard/src/app/guild/[guildId]/config/general/page.tsx`

**Content:**
- Guild name input
- Guild icon upload/display
- Guild description (if applicable)
- Save button

#### 3.6 Update tests

- Test modules page: renders table, toggles enable/disable
- Test addons page: similar
- Test breadcrumbs appear on detail pages

#### 3.7 Update documentation

- Document new configuration hub pattern
- Provide examples for adding new module configuration pages

### Phase 3 Acceptance Criteria

- [ ] `/guild/[guildId]/config/modules` page created and functional
- [ ] `/guild/[guildId]/config/addons` page created and functional
- [ ] Enable/disable toggles work correctly
- [ ] Navigating to `/guild/[guildId]/modules` redirects to `/config/modules`
- [ ] Module detail pages have breadcrumbs
- [ ] TypeScript passes
- [ ] Lint passes
- [ ] All tests pass
- [ ] Manual QA: Enable/disable modules, verify state persists
- [ ] Documentation updated

---

## Phase 4: Monitoring Dashboard (Wave 7)

**Goal:** Reorganize audit/health pages under Monitoring & Diagnostics category.

**Duration:** 1–2 weeks  
**Risk:** Low (mostly reorganization, minimal code changes)

### Steps

#### 4.1 Rename /health → Health Dashboard (or keep as-is)

**File:** `/guild/[guildId]/health/page.tsx` (no move needed, already top-level)

**Update:**
- Page title → "Health Dashboard" (instead of "Health Check")
- Add breadcrumb (if health is still top-level, breadcrumb is optional)

#### 4.2 Create Activity & Trends page

**New File:** `/guild/[guildId]/monitoring/activity/page.tsx`

**Content:**
1. **Recent Actions Timeline:** Last N moderation actions (chart + list)
2. **Member Trends:** Joins/leaves over time (chart)
3. **Moderation Frequency:** Actions by type over time (chart)
4. **Filters:** Date range, action type, moderator

**Data Fetching:**
```typescript
const activityData = await getGuildActivity(guildId, { startDate, endDate });
const moderationStats = await getGuildModerationStats(guildId);
const memberTrends = await getGuildMemberTrends(guildId);
```

#### 4.3 Move audit log

**Rename:** `/guild/[guildId]/audit` → `/guild/[guildId]/monitoring/audit`

**Update:**
- Keep page functionality identical
- Add breadcrumb: "Monitoring & Diagnostics > Audit Log"

#### 4.4 Update system admin monitoring

**System routes (unchanged conceptually, but reorganized in sidebar):**
- `/system/shards` → "Shard Telemetry"
- `/system/audit` → "System Audit Log"
- Add `/system/health` (optional) for platform-level health

#### 4.5 Update tests

- Test activity page renders charts correctly
- Test audit log still filters/searches

#### 4.6 Update documentation

- Document new Activity & Trends page
- Update IA documentation with monitoring reorganization

### Phase 4 Acceptance Criteria

- [ ] `/guild/[guildId]/monitoring/activity` page created
- [ ] `/guild/[guildId]/monitoring/audit` page moved and functional
- [ ] Old audit routes redirect to new paths
- [ ] Health dashboard visible in sidebar (Monitoring & Diagnostics)
- [ ] Breadcrumbs appear on all monitoring pages
- [ ] Charts render without errors
- [ ] TypeScript passes
- [ ] Lint passes
- [ ] All tests pass
- [ ] Documentation updated

---

## Phase 5: Mobile Optimization & Responsive Behavior (Wave 8)

**Goal:** Implement off-canvas drawer for mobile, test responsive breakpoints.

**Duration:** 2–3 weeks  
**Risk:** Medium (touch interactions, responsive testing)

### Steps

#### 5.1 Create off-canvas drawer component

**New File:** `apps/dashboard/src/components/ui/drawer.tsx` (or use existing Shadcn drawer)

**Features:**
- Slide from left on open
- Close on backdrop click
- Close on Esc key
- Swipe to dismiss (optional, requires gesture lib)
- Respects `prefers-reduced-motion`

#### 5.2 Update guild layout for mobile

**File:** `apps/dashboard/src/app/guild/[guildId]/layout.tsx`

**Changes:**
- On mobile (<768px): hide sidebar, show hamburger button in header
- Hamburger button opens drawer
- Drawer contains GuildSideNav
- Clicking link in drawer closes drawer

#### 5.3 Update header component

**File:** `apps/dashboard/src/components/layout/site-header.tsx`

**Changes:**
- Add hamburger button on mobile (hidden on desktop)
- Button opens/closes sidebar drawer
- Add aria-label for accessibility

#### 5.4 Test responsive breakpoints

**Test matrix:**
| Breakpoint | Device | Expected Behavior |
|---|---|---|
| <768px | iPhone, small tablet | Off-canvas drawer + hamburger |
| 768px-1024px | iPad, tablet | Icon-only sidebar + main content |
| >1024px | Desktop | Full sidebar + main content |

#### 5.5 Test touch interactions

- Tap hamburger to open/close drawer
- Tap backdrop to close drawer
- Swipe to dismiss (if implemented)
- Tap link to navigate + close drawer
- No accidental closes on link hover

#### 5.6 Accessibility testing

- WCAG 2.2 AA compliance (axe-core)
- Screen reader: drawer announces state
- Keyboard: Tab through sidebar links, Esc closes drawer
- Motion: Respects prefers-reduced-motion

#### 5.7 Update tests

- Test hamburger button visibility on mobile
- Test drawer open/close
- Test links in drawer navigate correctly
- Test backdrop close

#### 5.8 Performance testing

- Drawer open/close animation smooth (60fps)
- No layout shift on sidebar toggle
- No performance regression

#### 5.9 Update documentation

- Document responsive behavior by breakpoint
- Add screenshots showing mobile, tablet, desktop layouts
- Document touch gestures (if any)

### Phase 5 Acceptance Criteria

- [ ] Off-canvas drawer implemented
- [ ] Hamburger button works on all mobile devices
- [ ] Responsive breakpoints tested (mobile/tablet/desktop)
- [ ] Touch interactions work smoothly
- [ ] No accessibility regressions
- [ ] Performance metrics acceptable (60fps animations)
- [ ] TypeScript passes
- [ ] Lint passes
- [ ] All tests pass
- [ ] Manual QA on mobile browser + mobile device emulator
- [ ] Documentation updated

---

## Rollback Plan

If a phase needs to be reverted:

1. **Phase 1 (Navigation):** Revert `guild-nav.ts` and sidebar components. Old routes still exist, revert changes to those.
2. **Phase 2 (Routes):** Redirect new routes back to old paths, delete new route files.
3. **Phase 3 (Config Hub):** Revert to old `/modules` and `/addons` pages. Delete `/config/*` routes.
4. **Phase 4 (Monitoring):** Revert `/monitoring/*` routes, keep health dashboard separate.
5. **Phase 5 (Mobile):** Revert drawer component, keep desktop layout.

**Rollback Criteria:**
- Critical bug discovered (data loss, security issue)
- User workflow broken (can't complete common task)
- Accessibility regression (fails WCAG AA)
- Performance degradation (>20% slower)

---

## Testing Strategy

### Unit Tests (Per Phase)
- Navigation structure renders correctly
- Badges/indicators calculate correctly
- Redirects resolve to new routes
- Form submissions work
- Data fetching succeeds

### Integration Tests (Per Phase)
- Navigation flow (click link → page loads)
- Page transitions (can move between pages)
- Search/filter works (in tables, audit logs, etc.)
- State persistence (collapsed/expanded groups)

### E2E Tests (Post-Phase 5)
- User workflows (ban user, configure module, check health)
- Cross-browser (Chrome, Firefox, Safari)
- Mobile responsiveness (iPhone, Android, iPad)
- Accessibility (keyboard nav, screen reader)

### Manual QA Checklist (Per Phase)

**Desktop:**
- [ ] All links clickable and navigate correctly
- [ ] Hover states work
- [ ] Active state highlights correctly
- [ ] Badges render without wrapping
- [ ] Alert dots visible

**Tablet:**
- [ ] Sidebar collapses to icon-only on scroll
- [ ] Groups expand/collapse on tap
- [ ] Touch targets are 44px+ (accessibility)
- [ ] No layout shift on sidebar toggle

**Mobile:**
- [ ] Hamburger button visible and clickable
- [ ] Drawer opens/closes smoothly
- [ ] Backdrop swipe-to-dismiss works (if implemented)
- [ ] Link taps don't accidentally close drawer
- [ ] No horizontal scroll (content fits screen width)

**Accessibility:**
- [ ] Keyboard: Tab navigates all interactive elements
- [ ] Keyboard: Enter/Space activate buttons/links
- [ ] Keyboard: Esc closes drawer (mobile)
- [ ] Screen reader: Announces nav items + state
- [ ] Color: Alert dots visible to color-blind users
- [ ] Motion: Reduced-motion preference respected

---

## Timeline Estimate

| Phase | Duration | Start | End | Wave |
|-------|----------|-------|-----|------|
| Phase 1: Navigation | 1–2 weeks | Wave 6 start | Mid Wave 6 | 6 |
| Phase 2: Routes | 2–3 weeks | Mid Wave 6 | End Wave 6 / Start Wave 7 | 6–7 |
| Phase 3: Config | 2–3 weeks | Wave 7 mid | End Wave 7 | 7 |
| Phase 4: Monitoring | 1–2 weeks | Wave 7 end | Wave 7/8 | 7–8 |
| Phase 5: Mobile | 2–3 weeks | Wave 8 start | Wave 8 mid | 8 |

**Total:** ~10–13 weeks (best case) / ~15–18 weeks (conservative)

---

## Risk Assessment

| Phase | Risk | Mitigation |
|-------|------|-----------|
| 1 | Low | Small refactor, no backend changes. Easy to rollback. |
| 2 | Medium | Route changes, but redirects prevent 404s. Good test coverage. |
| 3 | Medium | New page component, but similar to existing module config. |
| 4 | Low | Mostly renaming routes, keeping pages. |
| 5 | Medium | Touch interactions, responsive testing. Thorough QA needed. |

---

## Rollout Strategy

**Option A: All-at-once (Recommended)**
- Deploy all phases together (Waves 6–8)
- Faster to market, cleaner state
- Requires comprehensive testing

**Option B: Phased (If needed)**
- Phase 1–2: Deploy in v0.4.0
- Phase 3–4: Deploy in v0.5.0
- Phase 5: Deploy in v0.6.0 or later
- Creates temporary inconsistency (old + new routes both work)

---

## Documentation Maintenance

**Files to update throughout migration:**
1. `docs/dashboard-ia-current.md` → archive
2. `docs/dashboard-ia-proposed.md` → implementation status updates
3. `docs/dashboard-ia-migration.md` → this file (phase completion checkboxes)
4. Code comments in `guild-nav.ts`, layout files
5. Architecture docs (if they exist)
6. Contributor guide (if it documents navigation patterns)

---

## Success Metrics

By end of Wave 8:

- [ ] All 5 phases complete
- [ ] No 404s on old bookmarks (redirects work)
- [ ] No data loss or corruption
- [ ] User workflows intact (all common tasks still possible)
- [ ] IA improvements perceived by users (survey/feedback)
- [ ] Mobile experience improved (time-to-interact, responsiveness)
- [ ] Accessibility improved or maintained (WCAG AA)
- [ ] Performance maintained (no regression)
- [ ] TypeScript, lint, tests all pass
- [ ] Documentation accurate and complete

---

## Notes & Considerations

### Backward Compatibility
- Old URLs will redirect to new URLs for at least one release
- Users with bookmarks won't be broken
- Dashboard API (RPC) remains unchanged

### Analytics
- Consider tracking which old URLs users still access (to know when to remove redirects)
- Track new page views (activity/trends, new config pages)
- Monitor performance impact of new pages

### Localization
- Navigation strings are already localized (hopefully)
- Update localization files if adding new category/item names

### Command Palette
- If command palette exists, update it to use new routes
- Add new commands for new pages (activity/trends, etc.)

### Module Configuration Pattern
- After Phase 3, establish a pattern for new modules to follow:
  - Module enabled in /config/modules table
  - Module configured in /modules/[moduleName]
  - Document this pattern for module authors

---

## Appendix A: Route Mapping Reference

**Quick reference for all route changes:**

| Feature | Current Route | Proposed Route | Phase |
|---------|---|---|---|
| Moderation cases | `/moderation` | `/moderation` | 1 |
| Warn thresholds | `/warn-thresholds` | `/moderation/thresholds` | 2 |
| Blocklist | `/blocklist` | `/moderation/blocklist` | 2 |
| Mod notes | `/mod-notes` | `/moderation/notes` | 2 |
| Appeals | `/appeals` | `/appeals` | 1 |
| Appeals detail | `/appeal/[id]` | `/appeals/[id]` | 2 |
| Permits | `/permits` | `/permits` | 1 |
| Security | `/security` | `/security/panic` | 2 |
| Overrides | `/overrides` | `/security/overrides` | 2 |
| Verification | N/A | `/security/verification` + `/community/verification` | 2 |
| Health | `/health` | `/health` | 4 |
| Activity trends | N/A | `/monitoring/activity` | 4 |
| Audit log | `/audit` | `/monitoring/audit` | 4 |
| Modules | `/modules` | `/config/modules` | 3 |
| Module detail | `/modules/[name]` | `/modules/[name]` | 1 |
| Addons | `/addons` | `/config/addons` | 3 |
| General settings | N/A | `/config/general` | 3 |
| Advanced | `/advanced` | `/config/advanced` | 2 |
| Voice generators | `/tempvc` | `/config/voice` | 2 |
| Settings history | `/history` | `/config/history` | 2 |

---

**End of Migration Path**
