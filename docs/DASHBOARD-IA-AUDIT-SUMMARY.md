# Dashboard Information Architecture — Audit & Redesign Summary

**Wave:** 6 — Dashboard Information Architecture and Navigation  
**Date:** 2026-09-03  
**Status:** AUDIT COMPLETE — Redesign Proposed, No Implementation Yet  
**Documents Created:** 3 detailed files

---

## Overview

This is a complete audit of the Lumi dashboard's current information architecture, with a comprehensive redesign proposal aligned to plan.md §8 (Dashboard — Full Product Redesign).

### Deliverables

1. **`docs/dashboard-ia-current.md`** — Current state audit (10 sections)
2. **`docs/dashboard-ia-proposed.md`** — Redesign proposal (15 sections + appendices)
3. **`docs/dashboard-ia-migration.md`** — 5-phase migration plan (with timelines)

---

## Key Findings

### Current State (✓ Functional, ⚠ Pain Points)

**Strengths:**
- Sidebar-based navigation is proven and scalable
- Collapsible groups reduce visual clutter
- Server switcher is prominent
- Security alerts (panic indicator) are visible
- Desktop experience is clean and organized

**Weaknesses:**
1. **Conceptual misalignment** — Categories don't map to user workflows:
   - Moderation Cases and Appeals in separate sections (should be unified)
   - Voice Generators and Settings History grouped together (unrelated domains)
   - Configuration mixed with monitoring (Health Check under Security)

2. **Discoverability issues:**
   - Warn Thresholds deeply nested but often missed by admins
   - Module configuration requires exploring two sections (overview + modules)
   - Guided Setup competes for attention despite lower-use frequency

3. **Inconsistent status visibility:**
   - Only Security gets alert indicator (panic armed)
   - Other critical states (pending appeals, module failures) invisible at a glance

4. **Navigation patterns inconsistent:**
   - Guild switcher is dropdown (discovery-unfriendly)
   - System section has one-way back button (limited flexibility)
   - All pages at same depth (no hierarchy)

5. **Mobile responsiveness:**
   - Sidebar collapses but no drawer pattern
   - Small touch targets (44px guideline not always met)
   - Horizontal scroll on narrow screens

---

## Proposed Solution

### Reorganized Category Structure

**From 4 categories → 6 categories**

```
BEFORE                          AFTER
─────────────────────────────────────────────────────
Moderation                      Discipline & Appeals
├─ Cases                        ├─ Cases
├─ Thresholds                   ├─ Thresholds (nested)
├─ Blocklist                    ├─ Blocklist (nested)
└─ Mod Notes                    ├─ Notes (nested)
                                ├─ Appeals
                                └─ Templates (nested)

                                Safety & Security
                                ├─ Panic Mode
                                ├─ Verification
                                └─ Overrides

Community                       Community & Engagement
├─ Permits                      ├─ Permits
└─ Appeals                      └─ Verification

Security                        Monitoring & Diagnostics
├─ Panic Mode                   ├─ Health Dashboard
├─ Verification                 ├─ Activity & Trends (NEW)
└─ Overrides                    └─ Audit Log

                                Configuration (NEW)
                                ├─ Modules & Addons
                                ├─ General Settings
                                ├─ Advanced
                                ├─ Voice Generators
                                └─ Settings History

System                          System (bot-owner only)
├─ Voice Generators             ├─ Data Management
├─ Settings History             ├─ Export/Backup
├─ Audit Log                    └─ GDPR & Privacy
└─ Advanced
```

### Key Changes

#### 1. Unified Discipline & Appeals
**Why:** Moderators handle cases from creation → appeal → resolution. Separating these forces navigation between sections.

**Impact:** Better workflow, clearer mental model.

#### 2. Separated Configuration from Monitoring
**Why:** Admins distinguish between "how do I set things up?" vs. "what's happening now?"

**Impact:** Clearer purpose, better feature discoverability.

#### 3. Progressive Disclosure
**Why:** Not all users need advanced settings all the time.

**Impact:** Sidebar stays clean; configuration collapsed by default.

#### 4. Nested Routes
**Why:** Clear visual hierarchy (Moderation > Thresholds) shows relationships.

**Impact:** Better scannability, improved mental model of structure.

#### 5. Status Indicators on All Categories
**Why:** Only Security currently shows alert state; other sections hide important signals.

**Impact:** At-a-glance awareness of what needs attention across dashboard.

#### 6. Mobile-First Responsive Behavior
**Why:** Current sidebar doesn't adapt well to mobile/tablet.

**Impact:** Off-canvas drawer, proper touch targets, no horizontal scroll.

---

## Navigation Hierarchy

### New Information Architecture

```
Guild Dashboard
├─ Home (/guild/[guildId]/)
│  ├─ Server info + member stats
│  ├─ Module status
│  ├─ Health summary
│  └─ Recent activity + alerts
│
├─ Discipline & Appeals
│  ├─ Moderation Cases (/moderation)
│  ├─ Warn Thresholds (/moderation/thresholds)
│  ├─ Blocklist (/moderation/blocklist)
│  ├─ Mod Notes (/moderation/notes)
│  ├─ Appeals (/appeals)
│  └─ Templates (/appeals/templates)
│
├─ Safety & Security
│  ├─ Panic Mode (/security/panic)
│  ├─ Verification Rules (/security/verification)
│  └─ Permission Overrides (/security/overrides)
│
├─ Community & Engagement
│  ├─ Permits (/permits)
│  └─ Verification (/community/verification)
│
├─ Monitoring & Diagnostics
│  ├─ Health Dashboard (/health)
│  ├─ Activity & Trends (/monitoring/activity) [NEW]
│  └─ Audit Log (/monitoring/audit)
│
└─ Configuration (collapsed by default)
   ├─ Modules & Addons (/config/modules)
   ├─ General Settings (/config/general)
   ├─ Advanced (/config/advanced)
   ├─ Voice Generators (/config/voice)
   └─ Settings History (/config/history)
```

---

## Design Principles Applied

From plan.md §8:

✓ **Information hierarchy clarity** — Clear category names, nested items show relationships  
✓ **Predictable navigation** — Consistent sidebar + breadcrumbs = always know where you are  
✓ **Feature discoverability** — Configuration hub makes all modules visible  
✓ **Server selection prominence** — Server switcher at top of sidebar (unchanged, good)  
✓ **Module navigation clarity** — Unified discovery + configuration interface  
✓ **Configuration pages organization** — All config under /config/, nested by purpose  
✓ **Consistent patterns** — Badge/alert indicators apply across all groups  

Plus:
✓ Fewer visual layers (clean sidebar, progressive disclosure)  
✓ Stronger spacing rhythm (nested indent shows hierarchy)  
✓ Excellent keyboard usability (breadcrumbs, tab navigation)  
✓ Responsive design (desktop/tablet/mobile all covered)  
✓ Consistent forms (all config follows same pattern)  

---

## Implementation Roadmap

### Phase 1: Navigation Restructuring (Wave 6, 1–2 weeks)
- Update `guild-nav.ts` structure
- Enhance `SideNav` component (badges, alert dots, nested styling)
- Add breadcrumb component
- Create temporary redirects for old routes
- **Risk:** Low | **Impact:** UI changes only

### Phase 2: Route Reorganization (Wave 6–7, 2–3 weeks)
- Move routes to new paths (thresholds → moderation/thresholds, etc.)
- Keep redirects for backward compatibility
- Update tests
- **Risk:** Medium | **Impact:** URL changes (mitigated by redirects)

### Phase 3: Configuration Hub (Wave 7, 2–3 weeks)
- Redesign modules/addons configuration page
- Unified discovery + enablement interface
- Nested module configuration
- **Risk:** Medium | **Impact:** New page component

### Phase 4: Monitoring Dashboard (Wave 7–8, 1–2 weeks)
- Rename "Health Check" → "Health Dashboard"
- Create "Activity & Trends" page
- Reorganize audit log under Monitoring
- **Risk:** Low | **Impact:** Page reorganization

### Phase 5: Mobile Optimization (Wave 8, 2–3 weeks)
- Implement off-canvas drawer
- Responsive breakpoint testing
- Touch interaction testing
- Accessibility improvements
- **Risk:** Medium | **Impact:** Responsive behavior

**Total Effort:** 10–13 weeks (best case) / 15–18 weeks (conservative)

---

## Success Metrics

### Information Architecture
- [ ] Category names are intuitive (user testing confirms)
- [ ] Nested hierarchy is understood (breadcrumbs help location awareness)
- [ ] Task workflows are shorter (fewer clicks/navigation steps)

### Navigation Experience
- [ ] All navigation visible without excessive scrolling
- [ ] Status indicators provide at-a-glance awareness
- [ ] Mobile/tablet navigation is smooth and intuitive

### User Satisfaction
- [ ] Support tickets for "where is X feature?" decrease
- [ ] Time-to-task improves (A/B test if applicable)
- [ ] Accessibility compliance maintained or improved (WCAG AA)

### Technical
- [ ] No 404s (redirects work for old URLs)
- [ ] No data loss or corruption
- [ ] Performance maintained (no regressions)
- [ ] Tests pass (100% of dashboard tests green)
- [ ] TypeScript and lint clean

---

## Comparison: Current vs. Proposed

| Aspect | Current | Proposed | Benefit |
|--------|---------|----------|---------|
| **Categories** | 4 (functional) | 6 (workflow-aligned) | Users think in workflows, not domains |
| **Moderation + Appeals** | Separate sections | Unified "Discipline & Appeals" | Complete workflow in one section |
| **Configuration** | Scattered | Grouped under /config/ | Progressive disclosure, clearer organization |
| **Status Visibility** | One indicator (panic) | All categories have badges/alerts | At-a-glance awareness |
| **Mobile Navigation** | Hamburger collapses | Off-canvas drawer | Better UX, proper touch targets |
| **Route Depth** | All at /guild/[id]/[page]/ | Nested (/moderation/thresholds) | Visual hierarchy, clearer structure |
| **Discoverability** | Modules exploration optional | Config hub makes all features visible | New admins find all capabilities |
| **Breadcrumbs** | None | Added to all pages | Users always know location |

---

## Alignment with Plan.md

**Section 8: Dashboard — Full Product Redesign**

This audit and redesign directly address the mandate:

> "Treat the dashboard as a first-class SaaS product. Do NOT merely reskin the current dashboard. Audit the entire application. Redesign: information architecture, navigation, server selection, server overview, module navigation, configuration pages..."

**Principles Applied:**
- ✓ Information hierarchy clarity
- ✓ Predictable navigation
- ✓ Feature discoverability
- ✓ Fewer visual layers
- ✓ Stronger spacing rhythm
- ✓ Excellent keyboard usability
- ✓ Responsive design

**Status:**
- ✓ Audit complete
- ✓ Redesign proposed
- ✓ Migration path documented
- ○ Implementation ready to begin (Wave 6 start)

---

## Stakeholder Questions for Feedback

1. Does the new category structure feel more intuitive than the current organization?
2. Should "Quick Actions" (fast access to common operations) be implemented? If so, where?
3. Are there workflows we missed that would benefit from additional restructuring?
4. Should "Activity & Trends" include specific metrics (joins/leaves, moderation frequency, etc.)?
5. Is "Monitoring & Diagnostics" the right name, or should it be "Observability" or "System Status"?
6. Should mobile drawer have swipe-to-dismiss gesture support?
7. Should breadcrumbs appear on all pages or only detail pages?
8. Should old routes redirect forever, or be removed after one release?

---

## Next Steps

### Immediate (Wave 6 Start)
1. Review and approve IA redesign (stakeholder feedback)
2. Create Phase 1 implementation plan (detailed subtasks)
3. Begin Phase 1 (navigation restructuring)

### Wave 6
1. Complete Phase 1 (navigation + redirects)
2. Complete Phase 2 (route reorganization)
3. Verify no breaking changes, all old URLs redirect

### Wave 7
1. Complete Phase 3 (configuration hub)
2. Complete Phase 4 (monitoring dashboard)
3. User testing on new workflows

### Wave 8
1. Complete Phase 5 (mobile optimization)
2. Accessibility audit (WCAG AA)
3. Performance testing
4. Final QA across all devices

### Post-Wave 8
1. Monitor analytics (which old routes still accessed?)
2. Gather user feedback (survey/support tickets)
3. Consider removing redirects (if no longer needed)
4. Document lessons learned

---

## Document Reference

| Document | Purpose | Length | Status |
|----------|---------|--------|--------|
| `docs/dashboard-ia-current.md` | Current audit + pain points | ~2000 words | FINAL |
| `docs/dashboard-ia-proposed.md` | Redesign + rationale + appendices | ~4000 words | FINAL |
| `docs/dashboard-ia-migration.md` | Implementation roadmap (5 phases) | ~3000 words | FINAL |
| This file | Summary + next steps | ~1500 words | FINAL |

---

## Conclusion

The Lumi dashboard's current IA is **functional but conceptually misaligned** with how users think about their tasks. The proposed redesign reorganizes navigation to match user workflows (Discipline & Appeals unified, Configuration separated from Monitoring) while applying modern SaaS navigation patterns (breadcrumbs, progressive disclosure, responsive design).

The 5-phase migration plan allows implementation to proceed without breaking changes, data loss, or accessibility regressions. Effort is estimated at 10–18 weeks, with low-to-medium risk and high impact on user experience.

**Ready to begin Phase 1 implementation.**

---

**Audit completed by:** Claude Code / Haiku 4.5  
**Review status:** Awaiting stakeholder feedback and approval  
**Next milestone:** Phase 1 kickoff (Wave 6 start)
