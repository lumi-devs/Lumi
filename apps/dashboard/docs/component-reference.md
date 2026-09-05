# Component Reference Guide

Quick reference for using Lumi's design system components.

## Buttons

```tsx
import { Button } from "@/components/ui/button";

// Primary (use once per screen max)
<Button>Save</Button>
<Button>Install Module</Button>

// Secondary (default, most buttons)
<Button variant="secondary">Cancel</Button>
<Button variant="secondary">Skip</Button>

// Ghost (toolbar, inline, repeated actions)
<Button variant="ghost" size="icon"><Trash2 /></Button>
<Button variant="ghost" size="sm">Copy</Button>

// Danger (destructive, after confirmation)
<Button variant="danger">Delete User</Button>

// Danger Ghost (low-emphasis destructive)
<Button variant="dangerGhost">Remove</Button>

// Link (inline navigation)
<Button variant="link">Learn more</Button>

// With icons
<Button>
  <Plus className="size-4" />
  Add Item
</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="md">Default</Button>  {/* default */}
<Button size="lg">Large</Button>
<Button size="icon">📋</Button>
<Button size="iconSm">↑</Button>
```

## Cards

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardBody, CardFooter } from "@/components/ui/card";

// Basic card
<Card>
  <CardHeader>
    <CardTitle>Settings</CardTitle>
    <CardDescription>Manage your preferences</CardDescription>
  </CardHeader>
  <CardBody>
    {/* Content */}
  </CardBody>
  <CardFooter>
    <Button>Save</Button>
  </CardFooter>
</Card>

// Interactive card (hover lift + glow)
<Card interactive>
  <CardHeader>
    <CardTitle>Module</CardTitle>
  </CardHeader>
  <CardBody>
    Click to configure
  </CardBody>
</Card>

// Card with table (no padding)
<Card>
  <CardHeader><CardTitle>Users</CardTitle></CardHeader>
  <CardBody className="p-0">
    <Table>...</Table>
  </CardBody>
</Card>
```

## Input & Form Fields

```tsx
import { Input, Label, Field, SettingRow, Textarea, Select } from "@/components/ui/input";

// Simple input
<Input placeholder="Enter name" />

// With label and hint
<Field label="Bot Token" htmlFor="token">
  <Input id="token" type="password" />
</Field>

// With hint text
<Field label="Username" htmlFor="user" hint="3–20 characters">
  <Input id="user" />
</Field>

// Textarea
<Textarea placeholder="Description" />

// Select
<Select>
  <option>Option 1</option>
  <option>Option 2</option>
</Select>

// Label + control side-by-side (setting row)
<SettingRow
  label="Enable Auto-Moderation"
  htmlFor="automod"
  description="Automatically moderate messages"
  control={<Switch checked={enabled} onChange={setEnabled} />}
/>

// Form validation
<Field label="Email" htmlFor="email" hint={error && <span className="text-danger">{error}</span>}>
  <Input id="email" type="email" value={email} onChange={handleChange} />
</Field>
```

## Badges & Status

```tsx
import { Badge, StatusDot } from "@/components/ui/badge";

// Badges
<Badge>Neutral</Badge>
<Badge variant="success">Enabled</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="danger">Disabled</Badge>
<Badge variant="accent">Featured</Badge>
<Badge variant="outline">Draft</Badge>

// With dot
<Badge variant="success" dot>Online</Badge>

// Status dot (for tables)
<StatusDot active={isOnline} title="Shard online" />
```

## Alerts

```tsx
import { Alert } from "@/components/ui/alert";

// Info (default)
<Alert>This is an informational message</Alert>

// Warning
<Alert variant="warning">This action requires confirmation</Alert>

// Danger
<Alert variant="danger">This action cannot be undone</Alert>

// Custom icon
<Alert variant="info" icon={AlertCircle}>
  Custom icon
</Alert>

// No icon
<Alert icon={null}>Just text</Alert>
```

## Switch & Checkbox

```tsx
import { Switch, Checkbox } from "@/components/ui/switch";

// Toggle switch
<Switch
  checked={enabled}
  onChange={setEnabled}
  aria-label="Enable feature"
/>

// In a form context
<SettingRow
  label="Enabled"
  control={<Switch checked={enabled} onChange={setEnabled} />}
/>

// Checkbox
<Checkbox
  checked={selected}
  onChange={(e) => setSelected(e.target.checked)}
  aria-label="Select item"
/>

// Multiple checkboxes (for lists)
{items.map((item) => (
  <label key={item.id} className="flex items-center gap-2">
    <Checkbox
      checked={selected.includes(item.id)}
      onChange={(e) => {
        if (e.target.checked) {
          setSelected([...selected, item.id]);
        } else {
          setSelected(selected.filter((id) => id !== item.id));
        }
      }}
    />
    {item.name}
  </label>
))}
```

## Tables

```tsx
import { Table, THead, TBody, TR, TH, TD, TableScroll } from "@/components/ui/table";
import { DataTable } from "@/components/ui/data-table";

// Simple table
<TableScroll>
  <Table>
    <THead>
      <TR>
        <TH>Name</TH>
        <TH>Status</TH>
      </TR>
    </THead>
    <TBody>
      {items.map((item) => (
        <TR key={item.id}>
          <TD>{item.name}</TD>
          <TD><Badge variant={item.status}>{item.status}</Badge></TD>
        </TR>
      ))}
    </TBody>
  </Table>
</TableScroll>

// Data table (with sorting, filtering, etc.)
const columns: ColumnDef<typeof dataTableFeatures, User>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "email",
    header: "Email",
  },
];

<DataTable columns={columns} data={users} />
```

## Dropdown Menu

```tsx
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon">
      <MoreVertical className="size-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Edit</DropdownMenuItem>
    <DropdownMenuItem>Copy</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem>Delete</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

## Sheets (Slides)

```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent side="right">
    <SheetHeader>
      <SheetTitle>Settings</SheetTitle>
    </SheetHeader>
    {/* Content */}
  </SheetContent>
</Sheet>
```

## Dialogs (Modals)

```tsx
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

<ConfirmDialog
  open={open}
  onOpenChange={setOpen}
  title="Delete User?"
  description="This action cannot be undone."
  primaryLabel="Delete"
  secondaryLabel="Cancel"
  onPrimary={() => {
    deleteUser();
    setOpen(false);
  }}
  variant="danger"
/>
```

## Pagination

```tsx
import { Pagination } from "@/components/ui/pagination";

<Pagination
  page={currentPage}
  pageSize={20}
  total={totalItems}
  itemLabel="results"
/>
```

## Empty State

```tsx
import { EmptyState } from "@/components/ui/empty-state";

<EmptyState
  title="No users yet"
  description="Create your first user to get started"
  action={<Button>Create User</Button>}
/>
```

## Tooltips

```tsx
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon">
        <Info className="size-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      Additional information here
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

## Page Header

```tsx
import { PageHeader } from "@/components/ui/page-header";

<PageHeader
  title="Module Settings"
  description="Configure module behavior"
  actions={
    <Button>Save</Button>
  }
/>
```

## Skeletons (Loading)

```tsx
// Use the .skeleton class
<div className="skeleton h-12 w-full rounded-control" />
<div className="skeleton h-8 w-40 rounded-control" />

// In a card context
<Card>
  <CardBody className="space-y-4">
    <div className="skeleton h-6 w-40 rounded-control" />
    <div className="skeleton h-4 w-full rounded-control" />
    <div className="skeleton h-4 w-3/4 rounded-control" />
  </CardBody>
</Card>
```

## Animations & Motion

```tsx
// Page load entrance
<div className="rise" style={{ "--rise-delay": "0ms" }}>
  Header
</div>

// Live status indicator
<div className="size-2 rounded-full bg-success pulse-live" />

// Hover spotlight (on cards)
<Card interactive>
  {/* Automatically gets spotlight effect on hover */}
</Card>
```

## Section Headers

```tsx
import { SectionHead } from "@/components/ui/section-head";

<SectionHead>Configuration</SectionHead>
```

## Readout (Display Value)

```tsx
import { Readout } from "@/components/ui/readout";

<Readout label="Status" value="Active" />
```

## Status Pills

```tsx
import { StatusPill } from "@/components/ui/status-pill";

<StatusPill status="online">Shard 1</StatusPill>
<StatusPill status="offline">Shard 2</StatusPill>
```

## Value Chip

```tsx
import { ValueChip } from "@/components/ui/value-chip";

<ValueChip label="Users" value="1,234" />
```

## Patterns & Common Layouts

### Settings Panel

```tsx
<Card>
  <CardHeader>
    <CardTitle>Module Configuration</CardTitle>
  </CardHeader>
  <CardBody className="space-y-4">
    <SettingRow
      label="Enabled"
      description="Enable this module"
      control={<Switch checked={enabled} onChange={setEnabled} />}
    />
    <SettingRow
      label="Max Warnings"
      description="Maximum warnings before action"
      control={<Input type="number" value={maxWarnings} />}
    />
  </CardBody>
  <CardFooter>
    <Button>Save Changes</Button>
  </CardFooter>
</Card>
```

### Save State Indicators

```tsx
import { SaveBar } from "@/components/save-bar";

<SaveBar
  state={saveState} // 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
  error={error}
  onRetry={handleRetry}
/>
```

### Data List

```tsx
<div className="space-y-2">
  {items.map((item) => (
    <div key={item.id} className="flex items-center justify-between border-b border-border px-4 py-3 hover:bg-surface-hover">
      <div className="flex-1">
        <p className="font-display font-semibold text-fg">{item.name}</p>
        <p className="text-[14px] text-fg-muted">{item.description}</p>
      </div>
      <Badge variant="success">{item.status}</Badge>
    </div>
  ))}
</div>
```

## CSS Custom Properties (For Direct Use)

When you need to reference tokens directly in CSS or via JavaScript:

```tsx
// Colors
background: var(--bg)
background: var(--surface)
color: var(--fg)
color: var(--fg-muted)
border-color: var(--border)

// Accent
color: var(--accent)
background: var(--accent-soft)

// Status
color: var(--success)
background: var(--warning-soft)

// Shadows
box-shadow: var(--shadow-md)
box-shadow: var(--shadow-accent)

// Motion
transition-duration: var(--motion-normal)
animation-duration: var(--motion-slow)

// Glass
backdrop-filter: blur(var(--glass-blur-md))

// Focus
outline-color: var(--ring)
```

## Accessibility Checklist

Every component should:
- [ ] Support keyboard navigation (Tab, Enter, Escape)
- [ ] Have proper ARIA labels (`aria-label`, `aria-labelledby`)
- [ ] Show focus states (keyboard-only, via `.focus-visible`)
- [ ] Use semantic HTML (`<button>`, `<a>`, `<input>`, etc.)
- [ ] Have proper color contrast (WCAG AA, 4.5:1 minimum)
- [ ] Work with `prefers-reduced-motion`
- [ ] Announce state changes to screen readers
- [ ] Support mobile (touch targets 44px+)

## Testing Components

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

test("button click triggers action", async () => {
  const user = userEvent.setup();
  const handleClick = vitest.fn();
  
  render(<Button onClick={handleClick}>Click me</Button>);
  
  await user.click(screen.getByRole("button"));
  expect(handleClick).toHaveBeenCalled();
});

test("switch updates state", async () => {
  const user = userEvent.setup();
  const handleChange = vitest.fn();
  
  render(<Switch checked={false} onChange={handleChange} />);
  
  await user.click(screen.getByRole("switch"));
  expect(handleChange).toHaveBeenCalledWith(true);
});
```

## Performance Tips

1. **Lazy load sheets/dialogs** — Don't render until opened
2. **Memoize table rows** — Use `React.memo()` for long lists
3. **Batch state updates** — Group related state changes
4. **Use data attributes** — For testing, debugging, and styling
5. **Avoid inline functions** — In variant props (use `useState` instead)
6. **Use `useCallback` for handlers** — In tables with many rows

## Theming

Components automatically adapt to light/dark themes based on:
1. `data-theme` attribute on `<html>` (explicit override)
2. `prefers-color-scheme` (OS preference)
3. Default is to follow OS

Toggle theme in the header; View Transitions API animates the change.
