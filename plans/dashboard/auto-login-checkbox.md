# Auto-Login Checkbox (Login Page)

## What the user wants

"Log in automatically next time" checkbox on the login page — **opt-out** (checked by default).

## Behaviour

- Checkbox is checked by default
- When checked: after successful Discord OAuth, auto-redirect through OAuth next time user hits `/login`
- When unchecked: normal flow — user must click the button explicitly on each visit
- Label: "Log in automatically next time"

## Implementation

### Storage

`localStorage.setItem('lumi.autologin', 'true' | 'false')`

Read on `/login` page load (client-side): if `'true'`, immediately trigger sign-in action.

### Component changes

`apps/dashboard/src/components/auth/login-form.tsx`:
- Add `useState` initialized from `localStorage.getItem('lumi.autologin') !== 'false'` (default true)
- Render `<label><input type="checkbox" checked={autoLogin} onChange={...} /> Log in automatically next time</label>` below the Discord button
- On login action, write preference to localStorage before redirect

### Auto-trigger

`apps/dashboard/src/app/login/page.tsx` or a thin client wrapper:
- On mount, read `lumi.autologin`. If true, trigger OAuth redirect immediately
- Must be client-side only (localStorage not available server-side)

## Files

1. `apps/dashboard/src/components/auth/login-form.tsx` — add checkbox + auto-trigger logic
2. Thin `LoginAutoTrigger` client component if the login page needs to stay a server component

## UX

Checkbox below the button, styled subtly (small, muted text). Not a security decision — just a convenience setting.
