Before writing or modifying any UI component in TravelBuddy, load and follow these design guidelines exactly. They are the source of truth for all visual decisions. If something you're about to build conflicts with a rule here, follow the rule and note the conflict.

---

# TravelBuddy Design System

## Philosophy

TravelBuddy has an **editorial travel aesthetic** — think magazine-quality, geography-aware, and warm. Destinations should feel real. Typography should feel considered. Yellow is our brand color: bold, confident, and used sparingly so it lands.

Two principles above all:
1. **Consistent spacing over clever layouts.** If you're unsure how to space something, use the scale.
2. **Never use emoji in UI.** Always use Lucide icons with defined sizes and colors.

---

## Typography

Two fonts are in use via `next/font/google`. Both are loaded in `app/layout.tsx` and exposed as CSS variables:

| Variable | Font | Use |
|---|---|---|
| `--font-display` | **Fraunces** | Trip names, page titles, hero headings, any "moment" text |
| `--font-sans` | **Inter** | All body text, labels, UI copy, metadata |

### Semantic type classes (defined in `globals.css`, use these everywhere)

```
.type-display     Fraunces, text-4xl, font-bold,     leading-tight,   tracking-tight
.type-heading     Fraunces, text-2xl, font-semibold,  leading-snug,    tracking-tight
.type-subheading  Inter,    text-lg,  font-semibold,  leading-snug
.type-body        Inter,    text-sm,  font-normal,    leading-relaxed  ← fix for tight line heights
.type-caption     Inter,    text-xs,  font-normal,    leading-normal,  text-text-muted
```

**Rules:**
- Trip names always use `.type-heading` or `.type-display` (Fraunces). Never Inter for trip names.
- Page section labels (e.g. "Upcoming", "Flights") always use `.type-caption` in uppercase with `tracking-wide`.
- Never set `leading-tight` on body-sized text. Use `leading-relaxed` (1.625) for anything `text-sm` or `text-base`.
- Prefer the semantic class over manual Tailwind classes. If you write `text-2xl font-semibold`, ask yourself: should this be `.type-heading`?

---

## Color Tokens

All colors are CSS variables in `globals.css`, referenced as Tailwind tokens.

### Brand colors

| Token | Light value | Dark value | Hex (light) | Usage |
|---|---|---|---|---|
| `primary` | `250 204 21` | `250 204 21` | `#FACC15` | Brand yellow — backgrounds, borders, active indicators |
| `primary.dark` | `234 179 8` | `202 138 4` | `#EAB308` | Yellow hover/pressed states |
| `primary-foreground` | `17 24 39` | `17 24 39` | `#111827` | Text **on** yellow backgrounds — always near-black |
| `secondary` | `29 78 216` | `96 165 250` | `#1d4ed8` | Deep ocean blue — links, flight events, info states |
| `accent` | `224 123 57` | `249 115 22` | `#e07b39` | Terra cotta — hotel events, warmth, food |

### Surface colors

| Token | Light | Dark | Usage |
|---|---|---|---|
| `background` | `#faf9f7` | `#0f172a` | Page background — warm off-white in light mode |
| `card` | `#ffffff` | `#1e293b` | Card surfaces |
| `surface` | `#f5f3f0` | `#162032` | Subtle inset backgrounds |
| `border` | `#e2e8f0` | `#334155` | All borders |

### Text colors

| Token | Usage |
|---|---|
| `text-base` | `#111827` light / `#f1f5f9` dark — primary text |
| `text-muted` | Secondary, metadata, descriptions |
| `text-light` | Tertiary, placeholder |

### ⚠️ Yellow usage rules (critical)

- **Yellow on white** is never readable as text. Never use `text-primary` on a white/light background.
- Yellow is used as a **background or border**, with `text-primary-foreground` (near-black) on top.
- Examples of correct yellow usage:
  - Active nav indicator: `border-l-4 border-primary` (left border, not text)
  - Primary CTA button: `bg-primary text-primary-foreground hover:bg-primary-dark`
  - Trip detail header accent bar: `bg-primary h-1`
  - Status badge for "active" trip: `bg-primary/20 text-primary-foreground border border-primary/30`
- Examples of **incorrect** usage (do not do these):
  - `text-primary` on any white or `bg-card` background
  - `bg-primary` as a full-page background
  - Yellow text in body copy

### Semantic event-type colors

Use these consistently for timeline/itinerary event types:

| Event type | Color | Token |
|---|---|---|
| Flight / transport | Deep blue | `secondary` |
| Hotel / accommodation | Terra cotta | `accent` |
| Activity / sightseeing | Forest green | `text: #2d6a4f` / use Tailwind `green-800` |
| Expense | Amber | `warning` |
| Other | Muted | `text-muted` |

---

## Icon System

**All icons use Lucide React (`lucide-react`). No emoji anywhere in the UI.**

### Standard icon sizes

| Context | Size class | Usage |
|---|---|---|
| Inline with text | `h-4 w-4` | Labels, badges, list items |
| Button icon | `h-4 w-4` | Inside Button components |
| Section/card header | `h-5 w-5` | Alongside headings |
| Empty state | `h-10 w-10` | Large illustrative icons |
| Nav items | `h-5 w-5` | Sidebar and mobile nav |

### `TripIcon` component (`components/TripIcon.tsx`)

Use this for all event-type icon rendering. It accepts a `type` prop and returns the correct Lucide icon with color applied:

```tsx
<TripIcon type="flight" className="h-4 w-4" />
<TripIcon type="hotel" />
<TripIcon type="activity" size="lg" />
```

### Event type → icon mapping

| Type | Lucide icon | Color |
|---|---|---|
| `flight` / departure | `PlaneTakeoff` | `text-secondary` |
| arrival | `PlaneLanding` | `text-secondary` |
| `hotel` check-in | `BedDouble` | `text-accent` |
| hotel check-out | `LogOut` | `text-accent` |
| `activity` | `Compass` | `text-green-700` |
| `expense` | `Receipt` | `text-warning` |
| `transport` / car | `Car` | `text-secondary` |
| `other` | `Circle` | `text-text-muted` |

### Navigation icons

| Page | Icon |
|---|---|
| Trips (home) | `MapPin` |
| Import | `Upload` |
| Settings | `Settings` |
| Notifications | `Bell` |

### Trip status icons (replace emoji status badges)

| Status | Icon | Color treatment |
|---|---|---|
| Active / current | `Plane` | `bg-primary/20 text-primary-foreground` |
| Upcoming | `CalendarDays` | `bg-secondary/10 text-secondary` |
| Completed | `CheckCircle2` | `bg-muted text-text-muted` |

---

## Spacing

The core problem this system solves: inconsistent gaps and tight line heights. Follow these rules and the app will feel consistently breathable.

### Gap scale

| Context | Class | Value |
|---|---|---|
| Between page sections | `space-y-8` | 2rem |
| Between cards in a list | `space-y-3` | 0.75rem |
| Inside a card, between sections | `space-y-4` | 1rem |
| Between a label and its content | `space-y-1.5` | 0.375rem |
| Between inline elements | `gap-2` or `gap-3` | 0.5rem / 0.75rem |
| Tab content area (top padding) | `py-6` | 1.5rem |
| Page-level container | `px-4 py-6` or `px-6 py-8` | — |

### Padding inside containers

| Container | Padding |
|---|---|
| Card / list item (default) | `p-4` |
| Card (spacious, e.g. trip detail sections) | `p-5` or `p-6` |
| Dense list item (e.g. timeline event) | `px-4 py-3` |
| Section label row | `pb-2` below the label |
| Modal / dialog | `p-6` |

### Line height rules

| Text size | Required leading |
|---|---|
| `text-xs`, `text-sm` | `leading-relaxed` (1.625) |
| `text-base` | `leading-relaxed` (1.625) |
| `text-lg`, `text-xl` | `leading-snug` (1.375) |
| `text-2xl`+ (display/headings) | `leading-tight` (1.25) |

**Never** use `leading-tight` or `leading-none` on body-size text. If you see it, fix it.

---

## Component Patterns

### Card

```tsx
<div className="rounded-xl border bg-card p-4 space-y-3">
  ...
</div>
```

For cards with a cover photo header, the photo sits outside the padding:
```tsx
<div className="rounded-xl border bg-card overflow-hidden">
  <div className="h-32 relative">
    <Image src={coverPhotoUrl} alt={name} fill className="object-cover" />
  </div>
  <div className="p-4 space-y-3">
    ...
  </div>
</div>
```

### Trip name in a card

Always Fraunces, always `font-semibold`:
```tsx
<h3 className="font-display font-semibold text-base leading-snug">{trip.name}</h3>
```

(`font-display` is the Tailwind token for Fraunces.)

### Section heading in a tab

```tsx
<h2 className="type-subheading">Flights</h2>
```

### Section label (metadata label above a list)

```tsx
<p className="text-xs font-medium text-text-muted uppercase tracking-wide">{label}</p>
```

### Empty state

```tsx
<div className="py-16 flex flex-col items-center gap-4 text-center">
  <div className="rounded-full bg-surface p-4">
    <IconComponent className="h-8 w-8 text-text-muted" />
  </div>
  <div className="space-y-1">
    <p className="font-semibold text-text-base">No trips yet</p>
    <p className="type-caption max-w-xs">Import a confirmation email or PDF to create your first trip.</p>
  </div>
  <Button>Get started</Button>
</div>
```

### Primary CTA button (yellow)

```tsx
<Button className="bg-primary text-primary-foreground hover:bg-primary-dark font-semibold">
  Import documents
</Button>
```

### Active nav item (left-border style)

```tsx
<div className={cn(
  "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
  isActive
    ? "border-l-2 border-primary bg-primary/10 text-text-base font-medium pl-[10px]"
    : "text-text-muted hover:bg-surface hover:text-text-base"
)}>
```

---

## Cover Photos

Trips have a `coverPhotoUrl` field populated by `services/photos.ts` at import time.

- Use `<Image src={trip.coverPhotoUrl} fill className="object-cover" />` inside a positioned container
- Always provide an `alt` attribute using the destination name
- Always have a fallback for when `coverPhotoUrl` is null: a gradient using the event-type color system
- Configure `next.config.ts` `remotePatterns` for any new photo CDN domain before using it

Fallback gradient by destination type (use as `className` on the cover div):
```
coastal / beach → bg-gradient-to-br from-blue-400 to-cyan-600
mountain / nature → bg-gradient-to-br from-green-700 to-emerald-900
city / urban → bg-gradient-to-br from-slate-500 to-slate-800
desert / warm → bg-gradient-to-br from-amber-400 to-orange-600
default → bg-gradient-to-br from-primary/60 to-yellow-600
```

---

## Dark Mode

Every component must include `dark:` variants for any hardcoded color (not for CSS-variable-based tokens, which adapt automatically).

- `bg-green-100 text-green-800` → always pair with `dark:bg-green-900/30 dark:text-green-400`
- `bg-blue-100 text-blue-800` → always pair with `dark:bg-blue-900/30 dark:text-blue-400`
- Photo overlays: add `dark:brightness-75` on cover photos
- Status badges: always include both light and dark variants

---

## Checklist before submitting any UI component

- [ ] No emoji used anywhere — all replaced with Lucide icons
- [ ] Trip names in Fraunces (`font-display`)
- [ ] Body text uses `leading-relaxed`, not `leading-tight`
- [ ] Section gaps use the spacing scale above
- [ ] Yellow (`bg-primary`) is never paired with white text — only `text-primary-foreground`
- [ ] Dark mode variants present for any hardcoded color class
- [ ] Cover photo has a null fallback gradient
- [ ] Empty states use the standard pattern above
