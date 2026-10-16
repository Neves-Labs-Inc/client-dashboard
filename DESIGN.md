# DESIGN.md: Client Dashboard

The design system for the Neves Labs Client Dashboard. Every design brief and design review treats this file as law. Domain words (Client, Project, Status Update, Milestone, Task, Invoice, Request...) follow `CONTEXT.md`.

Source of truth for the look: `prototypes/design-direction/index.html`, layout **B · Ops console** with palette **B3 · Graphite + green** (`?variant=B3`). Where this file differs from the prototype, this file wins (see [Known drift](#13-known-drift-from-the-prototype)).

Stack assumptions: React Router v7 (SSR), TypeScript, Tailwind CSS v4 (CSS-first `@theme`), `cn()` for conditional classes (see `~/.claude/skills/coding-style/react.md`). UI stack (decided 2026-10-10): Tailwind v4 + shadcn/ui (Radix primitives, re-skinned to this file) + lucide-react; see [Component inventory](#10-component-inventory).

---

## 1. Principles

1. **Dense, calm, scannable.** An ops console for the client: tables and rows before cards, numbers before prose. Hairlines, not boxes inside boxes. No decoration.
2. **State is never color alone.** Every health, Invoice status, Request status and Request kind ships with a distinct icon shape **and** a text label.
3. **The accent means "act here".** Teal marks primary buttons, the active nav item, links, focus rings and the Feature kind. It never encodes health. On track is yellow-green, a different hue.
4. **Numbers are mono.** IDs, dates, amounts, counts and percentages use IBM Plex Mono with tabular figures, so columns align.
5. **Every async surface has four states**: loading (structural skeleton), empty, error, success. No spinner-only screens.
6. **Mobile-first.** Design at 375px first; touch targets 44px; no horizontal page scroll.
7. **Tokens only.** Components never use raw hex, raw Tailwind palette colors (`text-red-600`), or `dark:` color overrides. Light/dark comes from the tokens. Exception: the Google logo (`GoogleMark`) carries Google's brand hexes, its white tile included, inside `app/components/auth/google-mark.tsx` only.

---

## 2. Color tokens

One theme (Neves Labs). Per-client branding is out of scope. Neutrals are faintly warm graphite, no blue tint.

### 2.1 Neutrals and accent

| Token (CSS var) | Tailwind name | Light | Dark | Use |
|---|---|---|---|---|
| `--color-bg` | `bg` | `#F4F4F2` | `#0C0C0B` | Page background; input fill |
| `--color-surface` | `surface` | `#FFFFFF` | `#151513` | Sidebar, panels, drawer, menus |
| `--color-surface-2` | `surface-2` | `#EFEFEC` | `#1D1D1B` | Table header row, row hover, secondary button, active nav item |
| `--color-surface-3` | `surface-3` | `#DBDBD6` | `#2F2F2C` | Progress track, skeleton blocks |
| `--color-fg` | `fg` | `#161614` | `#ECECE8` | Primary text |
| `--color-fg-2` | `fg-2` | `#5E5E58` | `#9C9C95` | Secondary text, labels, meta, placeholders |
| `--color-line` | `line` | `#E3E3DF` | `#272724` | Hairline borders, row dividers |
| `--color-line-strong` | `line-strong` | `#C6C6C0` | `#3B3B37` | Button borders, menu/drawer edges |
| `--color-line-input` | `line-input` | `#85857E` | `#66665F` | Input, select, textarea, radio-card borders (3:1 boundary) |
| `--color-accent` | `accent` | `#0F766E` | `#2DD4BF` | Primary button fill, focus ring, active-nav bar, selected radio card |
| `--color-accent-hover` | `accent-hover` | `#115E59` | `#5EEAD4` | Primary button hover/press |
| `--color-accent-subtle` | `accent-subtle` | `#D5EFEC` | `#0F2E2B` | Selected/info tint (sparingly) |
| `--color-accent-fg` | `accent-fg` | `#0B5F58` | `#5EEAD4` | Links, Feature kind, accent text on surfaces |
| `--color-on-accent` | `on-accent` | `#FFFFFF` | `#04201D` | Text/icons on `accent` fills |

### 2.2 Health (Status Update) colors

Each health has a foreground (`--color-<h>`) used for badge text/icon/border and the Milestone progress fill, and a tint (`--color-<h>-subtle`) for the badge background.

| Health | Token | Light fg / tint | Dark fg / tint | Non-color cue (icon + label) |
|---|---|---|---|---|
| On track | `ok` | `#467210` / `#ECF5DA` | `#A3E635` / `#1E2A0B` | Filled circle with check, "On track" |
| At risk | `risk` | `#A84D08` / `#FDF1DE` | `#FBBF24` / `#2E2408` | Filled triangle with "!", "At risk" |
| Off track | `off` | `#C81E1E` / `#FDE7E7` | `#F87171` / `#341313` | Filled octagon with "x", "Off track" |
| Complete | `done` | `#6D28D9` / `#EFE7FD` | `#B794F6` / `#241A3A` | Outlined square with check, "Complete" |
| Inactive | `idle` | `#57574F` / `#EEEEEA` | `#A3A39C` / `#1F1F1C` | Dashed circle with dash, "Inactive" |

Light `ok` and `risk` are darkened one step from the prototype (`#4D7C0F` -> `#467210`, `#B45309` -> `#A84D08`) so 12px badge text clears 4.5:1 on its tint. Same hues.

The icon SVGs are the prototype's `ICON` paths (lines 503-513); port them into one `StatusIcon` component. Inner strokes use `var(--color-bg)` so they knock out in both themes.

### 2.3 Invoice status

Client Users see Open, Paid, Overdue. **Void is never rendered** in the client area (filter it in the loader, not the UI).

| Status | Colors | Icon + label |
|---|---|---|
| Open | `fg-2` on `surface-2`, border `fg-2` | Hollow circle, "Open" |
| Paid | `ok` on `ok-subtle` | Check mark, "Paid" |
| Overdue | `off` on `off-subtle` | Filled circle with "!", "Overdue" |

Overdue is derived (Open and past due date), never stored.

### 2.4 Request kind and status

Request **status** is plain mono text with a leading glyph, no tinted badge (keeps the Requests table quiet; health and money are what need to pop).

| Status | Glyph | Text color |
|---|---|---|
| New | filled dot | `fg` |
| Accepted | check | `fg` |
| Done | double check | `fg` |
| Declined | x | `fg-2` |
| Withdrawn | dash | `fg-2` |

Request **kind**: Bug = filled square, `off` color, "Bug"; Feature = diamond, `accent-fg`, "Feature". Glyphs are inline SVG (12px), `aria-hidden`; the word carries meaning.

### 2.5 Implementation

```css
/* app/styles/tokens.css */
@theme {
  --color-bg: #F4F4F2; /* ...all light values from 2.1-2.2 */
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* dark values */ color-scheme: dark; }
}
:root[data-theme="dark"] { /* dark values */ color-scheme: dark; }
:root[data-theme="light"] { color-scheme: light; }
```

- Default follows `prefers-color-scheme`. A manual choice (System / Light / Dark) is stored in a `theme` cookie; the root loader reads it and SSR-renders `data-theme` on `<html>` (absent for System) so there is no flash.
- The toggle lives in the user menu as a 3-option segmented control (System, Light, Dark), icons + labels.
- If a component truly needs a theme variant, use `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *))` plus the media query; prefer tokens.

### 2.6 Contrast (WCAG 2.2 AA, computed)

| Pair | Light | Dark |
|---|---|---|
| `fg` on `surface` / `bg` | 18.1 / 16.5 | 15.4 / 16.5 |
| `fg-2` on `surface` / `surface-2` | 6.5 / 5.7 | 6.6 / 6.1 |
| `accent-fg` on `surface` | 7.5 | 12.4 |
| `on-accent` on `accent` | 5.5 | 9.2 |
| `on-accent` on `accent-hover` | 7.6 | 11.5 |
| `ok` on `ok-subtle` | 5.1 | 10.0 |
| `risk` on `risk-subtle` | 5.0 | 9.2 |
| `off` on `off-subtle` | 4.9 | 6.1 |
| `done` on `done-subtle` | 5.9 | 6.7 |
| `idle` on `idle-subtle` | 6.3 | 6.5 |
| Progress fill on `surface-3` (non-text, needs 3:1) | ok 4.1, risk 4.1, off 4.1, done 5.1, idle 5.3 | all >= 4.8 |
| `line-input` on `surface` / `bg` (needs 3:1) | 3.7 / 3.4 | 3.2 / 3.4 |
| Focus ring `accent` on `bg` / `surface` | 5.0 / 5.5 | 10.5 / 9.8 |

Rules: never put `fg-2` text on `surface-3`; never lower text opacity to de-emphasize (use `fg-2`); hairlines (`line`, `line-strong`) are decorative and must not be the only boundary of an interactive control.

---

## 3. Typography

Fonts: **IBM Plex Sans** (400, 500, 600) for UI; **IBM Plex Mono** (400, 500) for data. Self-host via `@fontsource/ibm-plex-sans` / `@fontsource/ibm-plex-mono` (or Google Fonts with `display=swap`); preload the 400 and 600 Sans weights.

```
--font-sans: "IBM Plex Sans", system-ui, sans-serif;
--font-mono: "IBM Plex Mono", ui-monospace, monospace;
```

Base size is 14px (dense console). **Minimum rendered text is 12px** anywhere.

| Role | Size / line-height | Weight | Font | Notes |
|---|---|---|---|---|
| Micro label | 12 / 16 | 500-600 | Sans, uppercase, `tracking-[0.06em]` | Panel titles, table headers, KPI labels |
| Mono meta | 12 / 16 | 400 | Mono | Breadcrumb (uppercase), "Updated Oct 7", "due Nov 14", nav counts |
| Badge | 12 / 16 | 500 | Sans | Health and Invoice badges |
| Table body | 13 / 20 | 400 | Sans | Cells, nav items, buttons |
| Table data | 13 / 20 | 400 | Mono, `tabular-nums` | Invoice numbers, dates, amounts, % |
| Body | 14 / 20 | 400 | Sans | Status Update notes, form help, drawer body |
| Strong row title | 14 / 20 | 600 | Sans | Project name |
| Field label | 13 / 18 | 600 | Sans | |
| Input text | 16 / 24 below `md`, 14 / 20 at `md`+ | 400 | Sans | 16px on mobile prevents iOS zoom |
| Page title (h1) | 18 / 24 | 600 | Sans | One per page |
| Drawer title | 13 / 18 | 600 | Sans, uppercase, tracked | Matches panel titles |
| KPI value | 20 / 28 | 500 | Mono, `tabular-nums` | |

All numbers in rows and tiles use `font-mono tabular-nums`. Truncate long text with `line-clamp-2` (notes, Request titles) or `truncate` (Milestone name); full text in the detail view, never only in a `title` tooltip.

---

## 4. Spacing and density

4px grid. Use Tailwind's default spacing scale (1 = 4px); no arbitrary values for spacing.

| Context | Value |
|---|---|
| Page padding | `p-3` (12px) mobile, `px-5 py-4` (20/16px) at `md`+ |
| Between panels / sections | `gap-4` (16px) |
| Panel header | `px-3 py-2` (12/8px), min-height 40px |
| Table row | `px-3 py-2`, `gap-3`; min-height 40px desktop, 44px touch |
| Header row | `py-1.5` |
| KPI tile | `px-3 py-2.5` |
| Form field stack | `gap-4`; label to control `mb-1.5` |
| Drawer padding | `p-4` (16px) |
| Inline icon to text | `gap-1.5` (6px) |
| Sidebar nav item | `px-2 py-1.5`, `gap-2`; items `gap-px` |

---

## 5. Radius, borders, elevation

- **Radius**: `--radius: 3px` on everything rectangular (buttons, inputs, badges, panels, menus, avatar, nav items, skeleton blocks). Progress bars `1px`. Drawer `0`. No pills, no full-round except the circular parts of icons.
- **Borders**: 1px hairlines. Panels `border border-line bg-surface`. Row dividers `border-t border-line`. Sidebar `border-r border-line`.
- **Elevation**: flat by default; no card shadows.
  - Popover/menu: `shadow-[0_10px_30px_rgb(0_0_0/0.18)]` + `border-line-strong`.
  - Drawer: `border-l border-line` over a backdrop `bg-black/45`.
  - Toast: same as popover.
- **Active nav**: `bg-surface-2 text-fg` + `shadow-[inset_2px_0_0_var(--color-accent)]` (left bar). On the mobile tab row the bar moves to the bottom (`inset_0_-2px_0`).

---

## 6. Layout shell

Breakpoints (Tailwind defaults): base = 375px design target, `md` 768, `lg` 1024, `xl` 1280.

### 6.1 Desktop (`md`+)

```
+------------+---------------------------------------------+
| Client name| CLIENT / OVERVIEW            [+ New request] |
| NEVES LABS | Overview                                    |
| · PORTAL   | +--------+--------+--------+--------+       |
|------------| | KPI    | KPI    | KPI    | KPI    |       |
| Overview   | +--------+--------+--------+--------+       |
| Projects 3 | [ Projects panel                     ]       |
| Invoices 2 | [ Invoices panel ] [ Requests panel  ]  xl+  |
| Requests 1 |                                             |
| Team     3 |                                             |
|  ...       |                                             |
|------------|                                             |
| MC Maya    |                                             |
+------------+---------------------------------------------+
```

- Grid `grid-cols-[220px_minmax(0,1fr)]`. Sidebar `sticky top-0 h-dvh bg-surface border-r`, full height.
- Sidebar: brand block (Client name 14/600, "Neves Labs · portal" mono 12 uppercase `fg-2`), nav (Overview, Projects, Invoices, Requests, Team) with optional mono count right-aligned (`fg-2`), user menu pinned to bottom (avatar 24px `bg-accent text-on-accent` initials, name, role in `fg-2`). Menu opens upward and holds: name, role, Client; Profile; theme toggle; Sign out.
- Nav counts: Projects = active count, Invoices = Open (incl. Overdue) count, Requests = New count. Hide when 0.
- Header: mono uppercase breadcrumb (`Client / page`), h1, page primary action right-aligned.
- Main content: `min-w-0`, `max-w-[1280px]`, left-aligned within the column.
- Overview: KPI row, Projects panel full width, then Invoices + Requests side-by-side at `xl` (`grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]`), stacked below `xl`.

### 6.2 Mobile (base, 375px)

- Sidebar becomes a sticky top bar (`bg-surface border-b`, `z-10`): row 1 = brand (left) + avatar menu button (right, 44px target); row 2 = nav as a tab row.
- Tab row: 5 items, `h-11` each, `overflow-x-auto` on the nav only (scrollbar hidden, page never scrolls sideways), counts hidden, active item = bottom accent bar. 5 items fit at 375px; if more are added later, they scroll inside the row.
- Page primary action sits under the h1, full-width is not required; min height 44px.
- KPI row becomes 2x2. Panels stack. Tables re-flow into stacked rows (see components).
- Respect safe areas: top bar `pt-[env(safe-area-inset-top)]`, drawer footer `pb-[max(1rem,env(safe-area-inset-bottom))]`.
- Global: `overflow-x: clip` is **not** a fix; every row must fit at 375px by layout (`min-w-0`, `truncate`, `line-clamp`).

### 6.3 Admin area

The Admin area **reuses this shell** (sidebar, header, panels, tables, tokens, components) and must not fork tokens. Its structure is **Client-centric** (decided in the "What does the Admin area look like?" ticket; prototype on branch `prototype/admin-area`, `?variant=A`):

- Sidebar: Home, Requests inbox (New count, covering every Client), the list of active Clients (right-aligned alert icons per active reason, 16px lucide, `fg-2`, tooltip + `aria-label`: `inbox` + count for New Requests, `refresh-cw-off` for a sync problem, `receipt` for an Overdue Invoice), "+ New client", a collapsed Archived group.
- Home: a Clients table plus an "Unassigned GitHub boards" panel.
- Client workspace: tabs Overview, Projects & boards, Team, Invoices, Requests. A row opens a detail view in place with a back link; create/edit forms use the Drawer (9.10).

---

## 7. States (every surface, every async action)

| State | Spec |
|---|---|
| **Loading** | Structural skeleton that mirrors the final layout exactly (same row heights, same columns), so nothing shifts on load. Blocks are `bg-surface-3 rounded-[3px]`, text-line blocks 10-12px tall. Pulse = opacity 1 -> 0.55 -> 1, 1.6s ease-in-out infinite. Skeleton fades in after a 150ms delay (avoid flash on fast loads). Container has `aria-busy="true"` and an `sr-only` "Loading Invoices". Default rows: 3 Projects, 5 Invoices, 4 Requests, 4 KPI tiles. |
| **Empty** | Inside the panel, under the header: 13px `fg-2` sentence, `px-3 py-6`, left-aligned, optional 16px icon, optional action. Copy per surface below. Never an empty table header with nothing under it. |
| **Error** | Inside the failing panel only; other panels keep working. 16px off-track octagon icon + "Couldn't load Invoices." (13px `fg`) + secondary button "Try again" (revalidates). For full-route failure use the route `ErrorBoundary` in the main column, shell stays. Use deferred data + `<Await errorElement>` per panel on the Overview. |
| **Success** | The data. After a mutation: toast + the changed row highlighted (`bg-accent-subtle` fading to transparent over 1.2s). |

Empty copy:
- Projects (none at all): "No Projects yet. They appear here once Neves Labs starts work."
- Projects (only Past Projects): "No active Projects." above the Past rows.
- Invoices: "No Invoices yet."
- Requests: "No Requests yet. Report a bug or ask for a feature." + "New request" button.
- Milestone cell with no current Milestone: mono `fg-2` "No current Milestone".
- Status Update missing: `fg-2` "No Status Update yet." (badge shows Inactive only if health is actually inactive; otherwise omit the badge).

Async actions (submit, edit, withdraw a Request; theme change):
- Button shows pending state: label changes ("Submitting..."), 12px spinner icon replaces the leading icon, `disabled` + `aria-busy`, width does not change (`min-w` set from idle label).
- Failure: inline error near the cause (field errors under fields; network/server error as a banner at the top of the drawer body with `role="alert"`). Inputs keep their values.
- Success: see Request drawer.

---

## 8. Motion (CSS only)

Animate only `transform` and `opacity` (plus color/background-color/border-color for hover). No JS animation libraries. Exits are faster than enters.

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` | Enters, hover in |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Exits |
| `--dur-instant` | 100ms | Hover/press color, press scale |
| `--dur-fast` | 150ms | Menu/popover exit, toast exit, tab indicator |
| `--dur-base` | 200ms | Menu/popover enter, toast enter, row highlight start |
| `--dur-drawer-in` | 240ms | Drawer enter |
| `--dur-drawer-out` | 180ms | Drawer exit |
| `--dur-progress` | 500ms | Progress fill on first render |

Patterns:
- **Hover**: `transition-colors duration-100`. Rows: `hover:bg-surface-2`. Nav: `hover:bg-surface-2 hover:text-fg`.
- **Press**: buttons `active:scale-[0.98]` (transform, 100ms). Rows that link: `active:bg-surface-3`.
- **Focus-visible**: `outline-2 outline-offset-2 outline-accent` on every interactive element, never removed. No focus styles on mouse click (`:focus-visible` only).
- **Menu**: enter opacity 0 -> 1 + `translateY(-4px)` -> 0 (upward menus: `+4px`), 200ms ease-out; exit 150ms ease-in.
- **Drawer**: panel `translateX(100%)` -> 0, 240ms ease-out; exit 180ms ease-in. Backdrop opacity 0 -> 1 in step.
- **Toast**: enter `translateY(8px)` + fade, 200ms; exit fade, 150ms.
- **Progress fill**: render as full-width bar with `transform: scaleX(p)` and `origin-left`; on mount transition from `scaleX(0)`, 500ms ease-out. Do not animate `width`.
- **Tab/page changes**: no page transition; content swaps instantly, skeletons cover the wait.
- Enter/exit with CSS: `[data-state=open|closed]` keyframes (Radix-style) or native `<dialog>`/popover with `@starting-style` + `transition-behavior: allow-discrete`.
- `@media (prefers-reduced-motion: reduce)`: drop translate/scale, keep opacity fades at <= 100ms, stop skeleton pulse (static blocks), progress fills render at final value.

---

## 9. Components

Conventions: one component per file in `app/components/ui/`, `function` + `<Name>Props`, Tailwind + `cn()`. Interactive targets: `h-11` (44px) below `md` and on `pointer-coarse`, compact size at `md`+ with a fine pointer.

### 9.1 Panel

`section` with `border border-line rounded-[3px] bg-surface min-w-0`. Header `flex items-center justify-between px-3 py-2 border-b border-line`: `h2` micro label in `fg-2`, right side = mono meta (`fg-2`, e.g. "3 active · 1 past", "open $4,250.00") or a secondary action button. Panel title links to the full list page when there is one.

### 9.2 Data table (shared by Projects, Invoices, Requests)

- Markup: CSS-grid rows with ARIA table roles (`role="table"`, `rowgroup`, `row`, `columnheader`, `cell`), so rows can re-flow on mobile without losing semantics. Do not use `display:none` on the header row; on mobile it becomes `sr-only`.
- Header row: `bg-surface-2`, micro label, `py-1.5`.
- Rows: `border-t border-line`, `hover:bg-surface-2` only when the row is a link. A linking row is a single `<a>` (or the title cell is the link with `after:absolute after:inset-0` to stretch), focus ring on the row.
- Numbers right-aligned (`text-right font-mono tabular-nums`).
- Long lists paginate or "View all" link from the Overview panel (Overview shows at most 5 Invoices and 5 Requests).

### 9.3 Project row (Projects table) / Project card (mobile)

Desktop `xl`: columns `110px | minmax(150px,1.1fr) | minmax(200px,2fr) | minmax(150px,1.2fr) | 150px` = Health, Project, Latest Status Update, Current Milestone, Tasks.
`lg`: 4 columns `100px | minmax(140px,1fr) | minmax(160px,1.6fr) | 140px`; the Tasks cell wraps under Project/Update (`col-start-2 col-end-[-1]`), its header hidden.
Below `md` (card re-flow, `grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-1.5`): row 1 = name + "Updated Oct 7" (left), health badge (right); then note, Milestone block, task counts, each full width.

Cells:
- **Health**: Health badge (9.4).
- **Project**: name 14/600 `fg`; under it mono meta `fg-2` "Updated Oct 7" (date of latest Status Update) or "Past Project".
- **Latest Status Update**: note, 13-14px `fg`, `line-clamp-2`.
- **Current Milestone**: name (`truncate`) + mono % right; Milestone progress bar (9.5); mono meta "due Nov 14".
- **Tasks**: mono `fg-2` "UP **5** IP **3** DN **17**" with numbers in `fg` 500. Abbreviations are visual only: the cell has `aria-label="5 Up next, 3 In progress, 17 Done"` and the abbreviations are `aria-hidden`. On mobile, spell them out ("5 up next · 3 in progress · 17 done") since width allows.
- **Past Projects** sort below active ones in the same table, name in `fg-2` (not reduced opacity), Milestone cell shows the last Status Update date in mono, no Tasks counts. Their badge is Complete or Inactive (or last health if unmirrored and frozen).

Hover: row `bg-surface-2`. Click: Project detail. Loading skeleton: 64x20 badge block, 2 lines (60% / 35%), 2 note lines, bar track + 2 short lines.

### 9.4 Health badge

`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[3px] border px-1.5 py-0.5 text-xs font-medium` with `border-<h> text-<h> bg-<h>-subtle`, 12px `StatusIcon` + label in sentence case ("On track"). Static, not interactive. On track keeps the check-circle icon and the yellow-green `ok`; never teal.

### 9.5 Milestone progress bar

- `h-1` (4px) track `bg-surface-3 rounded-[1px] overflow-hidden`; fill uses **the Project's health color** (`bg-ok`, `bg-risk`, `bg-off`, `bg-done`, `bg-idle`), not the accent.
- Fill via `transform: scaleX(progress/100)` with `origin-left` (8. Motion).
- `role="progressbar" aria-valuemin=0 aria-valuemax=100 aria-valuenow={n} aria-label="{Milestone} progress"`; the visible % label is mono `fg` (text never takes the health color).
- 0%: track only. 100%: full fill. Progress = share of client-visible Tasks that are Done (computed server-side).

### 9.6 Invoice status badge

Same mechanics as 9.4 with the 2.3 colors and icons. Open uses `border-fg-2 text-fg-2 bg-surface-2`.

### 9.7 Invoice table

Columns at `md`+: Number (mono) | Issued (mono) | Due (mono) | Amount (mono, right) | Status (badge). Template `minmax(110px,1.2fr) 90px 90px minmax(90px,1fr) 92px`.
Below `md`: `grid-cols-[minmax(0,1fr)_auto_auto] gap-x-2.5 gap-y-0.5`: Number over Due date ("Due Oct 1", mono `fg-2`) on the left, Amount, Status; Issued hidden visually (still present for screen readers as `sr-only`).
Amounts are formatted `Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })`. Sorted by issue date, newest first. Void never appears; the number gap is expected and not explained in the UI. Row links to the Invoice detail (Line Items, memo, Project). Panel meta: "open $X" = sum of Open + Overdue.

### 9.8 Requests table

Columns at `md`+: Kind | Title (`line-clamp-2`) | Status | Submitter (`fg-2`). Template `70px minmax(140px,2fr) 96px minmax(90px,1fr)`.
Below `md`: `grid-cols-[auto_minmax(0,1fr)_auto]`: Kind, Title over Submitter, Status spanning both lines.
Kind and Status per 2.4. A Request that points to a hidden Task shows its last title with `fg-2` "(no longer tracked)". Panel header action: secondary "+ New" button opening the drawer.

### 9.9 Summary numbers (KPI row)

Overview only. Four tiles in one bordered strip: `grid grid-cols-2 md:grid-cols-4 border border-line rounded-[3px] bg-surface`, tiles separated by hairlines (`border-l` / `border-t` per position, no double borders).

| Tile | Value | Notes |
|---|---|---|
| Active projects | count of non-past Projects | links to Projects |
| On track | `n/m` active Projects with On track health | value in `fg` (not `ok`) |
| Open balance | currency sum of Open + Overdue Invoices | links to Invoices |
| Overdue | count of Overdue Invoices | when > 0: value in `off` with the Overdue icon before it; when 0: `fg`, no icon |

Tile: micro label (`fg-2`) over value (mono 20/28, 500). No deltas, sparklines or charts (none needed for v1; any future chart goes through the `dataviz` skill first). Tiles that link get `hover:bg-surface-2` and a focus ring. Skeleton: label block 50% + value block 40% x 20px.

### 9.10 Request form drawer

Right-hand drawer, modal.
- Size: `w-[420px]` at `md`+, full width below (`inset-0`, not `100vw`, to avoid scrollbar overflow). Full height (`h-dvh`). `bg-surface border-l border-line`, radius 0.
- Structure: header (title "NEW REQUEST" drawer-title style + 44px close icon button with `aria-label="Close"`), scrollable body, sticky footer with actions (`border-t border-line`, right-aligned: secondary "Cancel", primary "Submit request").
- Body fields, `gap-4`:
  1. **Kind** (`fieldset` + `legend`): two radio cards, Bug (square icon) / Feature (diamond icon), default Bug. Card: `border border-line-input rounded-[3px] px-3 h-11 md:h-9`; checked = `border-accent` + `shadow-[inset_0_0_0_1px_var(--color-accent)]`; focus-visible ring on the card.
  2. **Title** (required) text input. Placeholder example: "e.g. Receipt PDF is missing the store address".
  3. **Description** textarea, min-height 96px, `resize-y`. Placeholder: "What happened, or what would you like? Steps help."
  4. **Project** (optional) select: "No specific project" + active Projects, then Past Projects.
  5. Help text under the fields (`fg-2` 13px): "Everyone at {Client} can see Requests."
- Behavior: opens from the page action or panel "+ New"; focus moves to the Kind group; focus is trapped; `Esc`, backdrop click, Cancel and close button dismiss; focus returns to the trigger. If the form is dirty, dismissing asks "Discard this request?" (inline confirm in the footer, not a second modal).
- States: submitting = primary button pending (7.); field errors inline; server error banner at body top. Success = drawer closes, toast "Request submitted", new row appears at the top of Requests with the highlight fade.
- Edit (while New, by its submitter) reuses the drawer titled "EDIT REQUEST" with "Save changes". Withdraw is a secondary button with `text-off` in the Request detail, with inline confirm.

### 9.11 Buttons

| Variant | Classes (intent) | Use |
|---|---|---|
| Primary | `bg-accent text-on-accent border border-accent hover:bg-accent-hover hover:border-accent-hover` | One per view: "+ New request", "Submit request" |
| Secondary | `bg-surface-2 text-fg border border-line-strong hover:bg-surface-3` | Cancel, "+ New" in panel headers, Try again |
| Ghost | `text-fg-2 hover:bg-surface-2 hover:text-fg` | Icon buttons, menu triggers |
| Destructive | Secondary with `text-off` | Withdraw request |

Size: `h-11 px-4 text-sm` base, `md:h-8 md:px-2.5 md:text-[13px]`, `pointer-coarse:h-11`. Radius 3px, weight 500, `gap-1.5`, leading 14px icon optional. Disabled: `opacity-50 cursor-not-allowed` is **not** allowed for text (contrast); use `bg-surface-2 text-fg-2 border-line` instead. Icon-only buttons need `aria-label` and a 44px hit area on touch.

### 9.12 Form fields

- Label above, 13/600 `fg`, `for` linked. Optional marker: " (optional)" in `fg-2` 400. Required fields are not starred; optional ones are marked.
- Control: `w-full bg-bg border border-line-input rounded-[3px] px-3 text-base md:text-sm`, height `h-11 md:h-9` (textarea excluded). Placeholder `fg-2`, never a substitute for the label.
- Hover: `border-fg-2`. Focus: `border-accent` + focus ring. Error: `border-off`, `aria-invalid`, message below (`text-off` 13px, 12px octagon icon, linked via `aria-describedby`), validated on blur and on submit; on submit, focus the first invalid field. Disabled/read-only: `bg-surface-2 text-fg-2`.
- Select: native `<select>` with a custom chevron (`appearance-none`), same box as inputs.

### 9.13 Toasts

Bottom-right at `md`+ (`bottom-4 right-4`, max-w 360px), bottom full-width with 12px margin on mobile (above safe area). `bg-surface border border-line-strong` + popover shadow, 13px text, optional 14px status icon. `role="status"` / `aria-live="polite"`, auto-dismiss 4s (pauses on hover/focus), close button. Success only; errors stay inline near their cause.

### 9.14 Menus

User menu (and any future dropdown): `bg-surface border border-line-strong rounded-[3px] p-1.5` + popover shadow, min-width 200px. Items `px-2.5 py-2 rounded-[2px] hover:bg-surface-2`, 44px tall on touch. Header meta block (`fg-2`, `border-b`). Keyboard: arrow keys, Esc closes, focus returns to trigger.

---

## 10. Component inventory

| Concern | Owner component (`app/components/ui/`) |
|---|---|
| Shell | `AppShell`, `Sidebar`, `NavItem`, `MobileTopBar`, `PageHeader` |
| Containers | `Panel` |
| Tables | `DataTable` (grid + ARIA roles), domain rows `ProjectRow`, `InvoiceRow`, `RequestRow` live in feature folders |
| Status | `StatusIcon`, `HealthBadge`, `InvoiceStatusBadge`, `RequestStatus`, `RequestKind` |
| Data | `ProgressBar`, `SummaryRow` + `SummaryTile`, `Money`, `DateText` (mono, `en-US`, "Oct 7" / "Jun 28, 2026" for other years) |
| Actions | `Button`, `IconButton` |
| Forms | `Field`, `Input`, `Textarea`, `Select`, `RadioCardGroup`, `FormError` |
| Overlays | `Drawer`, `Menu`, `Tooltip`, `Toast` / `Toaster`, `ThemeToggle` |
| States | `Skeleton` (+ `SkeletonRow` per table), `EmptyState`, `PanelError` |

Primitive library (decided): **shadcn/ui** on **Radix UI primitives** (Dialog for Drawer, DropdownMenu, Tooltip, Toast, RadioGroup), always re-skinned to this file (3px radius, Plex, these tokens); never ship shadcn defaults. Icons: **lucide-react** for generic UI icons (close, chevron, plus, menu, sun/moon/monitor); health/invoice icons are the custom `StatusIcon` shapes.

---

## 11. Accessibility checklist (applies to every screen)

- Contrast per 2.6; text never below 12px.
- Every status has icon + text; icons `aria-hidden`.
- Visible focus ring on all interactive elements; logical tab order: sidebar, header action, content.
- `<nav aria-label="Main">`, `aria-current="page"` on the active item.
- Landmarks: `aside`/`nav`, `main`, one `h1`, panel `h2`s.
- Drawer: `role="dialog" aria-modal aria-labelledby`, focus trap and return.
- Tables keep header semantics on mobile (`sr-only`, not hidden).
- Zoom allowed (`width=device-width, initial-scale=1`, no `maximum-scale`); layout survives 200% zoom.
- Reduced motion honored (8.).

---

## 12. Responsive checklist

- Design and review at 375px first, then 768, 1024, 1280.
- No horizontal page scroll at 375px (only the mobile nav tab row scrolls inside itself).
- Touch targets >= 44px below `md` and on coarse pointers; >= 8px between adjacent targets.
- Tables re-flow to stacked rows below `md`; no `overflow-x-auto` table wrappers.
- Inputs 16px on mobile.

---

## 13. Known drift from the prototype

The prototype is throwaway; when building, follow this file, not these prototype details:

- **B3 bars**: prototype's B3 CSS paints Milestone bars teal (`#app[data-palette=B3] .bar span`). Use the Project's health color (decision 3).
- **Light `ok`/`risk`** darkened to `#467210` / `#A84D08` for AA badge text.
- **Tiny text**: prototype uses 9.5-11px (`.68-.78rem` of 14px) for headers, meta, badges. Floor is now 12px.
- **Past rows** use `opacity: .72` (drops `fg-2` below AA). Use `fg-2` color instead.
- **Mobile header row** is `display:none`; use `sr-only`. Prototype tables are bare divs; add ARIA table roles.
- **Unicode glyphs** (`■ ◆ ● ✓ ✕ ✓✓ –`) for Request kind/status: replace with inline SVG icons.
- **Touch targets**: prototype nav items, buttons and radio cards are ~28-34px; 44px on touch.
- **Input borders** use `line-strong` (1.6:1); use `line-input` (>= 3:1).
- **Mobile drawer** is `100vw` (overflows with a scrollbar); use `inset-0` / `w-full`.
- **Sidebar** doesn't span the full page height when content is long; make it `sticky h-dvh` in a full-height grid.
- **Disabled/opacity** not specified in the prototype; see 9.11.
