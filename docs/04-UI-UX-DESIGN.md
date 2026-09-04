# UI / UX Design System
## BinTrack — Minimal theme, light & dark mode

Related: `03-APP-FLOW.md`

---

## 1. Design principles

1. **Location first.** The bin code is the hero of every screen. It is always the largest text on a pick card.
2. **One glance, one action.** Each screen answers a single question (Where is it? What do I pick next? What's wrong?) and offers one primary action.
3. **Calm by default, loud when it matters.** Neutral greys carry 95 % of the UI; colour is reserved for stock health and alert severity.
4. **Scanner-native.** Every input that can be scanned shows a scan icon; large tap targets (≥ 44 px) for warehouse use on phones with gloves.
5. **Same layout in both themes.** Dark mode is a token swap, not a redesign. Contrast ≥ 4.5:1 for text in both.

## 2. Colour tokens

Implemented as CSS variables (HSL, shadcn/ui convention) and consumed by Tailwind (`bg-background`, `text-muted-foreground`, …). Dark mode via `class="dark"` on `<html>`.

### 2.1 Neutral palette

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `0 0% 100%` | `240 10% 4%` | page |
| `--foreground` | `240 10% 4%` | `0 0% 98%` | primary text |
| `--card` | `0 0% 100%` | `240 6% 7%` | cards, panels |
| `--card-foreground` | `240 10% 4%` | `0 0% 98%` | |
| `--muted` | `240 5% 96%` | `240 4% 12%` | subtle backgrounds, table stripes |
| `--muted-foreground` | `240 4% 46%` | `240 5% 65%` | secondary text |
| `--border` | `240 6% 90%` | `240 4% 16%` | dividers, inputs |
| `--input` | `240 6% 90%` | `240 4% 16%` | |
| `--ring` | `240 5% 65%` | `240 5% 65%` | focus ring |
| `--primary` | `240 6% 10%` | `0 0% 98%` | primary button (near-black / near-white) |
| `--primary-foreground` | `0 0% 98%` | `240 6% 10%` | |
| `--accent` | `240 5% 96%` | `240 4% 14%` | hover states |

### 2.2 Semantic palette (stock health & severity)

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--success` | `142 70% 35%` | `142 60% 45%` | healthy stock, verified scan, picked |
| `--warning` | `38 92% 45%` | `38 90% 55%` | low stock, expiring soon, short line |
| `--destructive` | `0 72% 48%` | `0 70% 58%` | out of stock, expired, mismatch |
| `--info` | `217 80% 50%` | `217 85% 62%` | dead stock, informational |
| `--reserved` | `262 60% 55%` | `262 65% 68%` | reserved quantity |

Backgrounds for badges use the same hue at 12 % alpha (`hsl(var(--warning) / 0.12)`) so they read identically in both themes.

### 2.3 Tailwind config excerpt
```ts
// tailwind.config.ts
export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        border: 'hsl(var(--border))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        destructive: 'hsl(var(--destructive))',
        info: 'hsl(var(--info))',
        reserved: 'hsl(var(--reserved))',
      },
      borderRadius: { lg: '10px', md: '8px', sm: '6px' },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], mono: ['JetBrains Mono', 'ui-monospace', 'monospace'] },
    },
  },
}
```

### 2.4 globals.css excerpt
```css
:root {
  --background: 0 0% 100%; --foreground: 240 10% 4%;
  --card: 0 0% 100%; --muted: 240 5% 96%; --muted-foreground: 240 4% 46%;
  --border: 240 6% 90%; --primary: 240 6% 10%; --primary-foreground: 0 0% 98%;
  --success: 142 70% 35%; --warning: 38 92% 45%; --destructive: 0 72% 48%;
  --info: 217 80% 50%; --reserved: 262 60% 55%; --ring: 240 5% 65%;
}
.dark {
  --background: 240 10% 4%; --foreground: 0 0% 98%;
  --card: 240 6% 7%; --muted: 240 4% 12%; --muted-foreground: 240 5% 65%;
  --border: 240 4% 16%; --primary: 0 0% 98%; --primary-foreground: 240 6% 10%;
  --success: 142 60% 45%; --warning: 38 90% 55%; --destructive: 0 70% 58%;
  --info: 217 85% 62%; --reserved: 262 65% 68%;
}
html { color-scheme: light; } html.dark { color-scheme: dark; }
body { @apply bg-background text-foreground antialiased; }
```

Theme switching: `useTheme()` store → `light | dark | system`; applies class on `<html>`, listens to `prefers-color-scheme`, persists in `localStorage` (`bt-theme`) and syncs to `profiles.preferences.theme`.

## 3. Typography

| Style | Font | Size / line | Weight | Use |
|---|---|---|---|---|
| Display | Inter | 28 / 34 | 600 | page titles |
| H2 | Inter | 20 / 28 | 600 | section titles |
| H3 | Inter | 16 / 24 | 600 | card titles |
| Body | Inter | 14 / 20 | 400 | default |
| Small | Inter | 12 / 16 | 400 | meta, table headers (uppercase, tracking 0.04em) |
| **Location code** | JetBrains Mono | 24 / 28 (cards), 14 (tables) | 600 | `WH1-R02-B017` — always mono, always tabular |
| Numbers | Inter `tabular-nums` | — | 500 | quantities, KPIs |

## 4. Spacing, layout, elevation

- 4-pt grid; common spacing 4/8/12/16/24/32.
- Max content width 1280 px; dashboard uses 12-col grid, gap 16.
- Elevation: flat. Cards = 1 px border, no shadow. Popovers/dialogs = 1 px border + `shadow-lg` (soft, 8 % black; 40 % black in dark).
- Radius 8 px default; pills 999 px.
- Sidebar 240 px (collapsed 64 px); mobile → bottom nav with 5 items (Home, Search, Scan, Orders, More/Admin).

## 5. Components (shadcn/ui base + custom)

| Component | Notes |
|---|---|
| `Button` | variants: primary (solid), secondary (outline), ghost, destructive. Height 40 (mobile 48). Loading spinner state. |
| `Input` / `SearchInput` | left icon, right scan icon (opens scanner). Clear button. |
| `LocationBadge` | mono, bordered pill: `WH1-R02-B017`. Click → bin drawer. Variant sizes sm/lg. |
| `QtyBadge` | `12` with reserved suffix `(3 res)` in `--reserved`. |
| `ExpiryChip` | date + relative ("in 12 d"). Colour: > 30 d muted, ≤ 30 d warning, ≤ 7 d destructive text, expired destructive filled. |
| `StatusChip` | order/pick/alert states; dot + label. |
| `StockHealthBar` | thin bar: available vs reorder point; colour semantic. |
| `PickTaskCard` | left colour rail (status), big location code, product name/sku, lot/expiry chip, qty, [Scan] button. Verified → success rail; picked → dimmed + check. |
| `ScannerSheet` | bottom sheet (mobile) / dialog (desktop). Camera viewport with corner guides, torch toggle, camera switcher, manual input fallback, step indicator (Bin → Product → Qty). Vibrate + beep on decode. |
| `AlertItem` | severity rail, icon per type, title, message, product/bin links, age, inline actions. |
| `NotificationBell` | icon + count badge (max "99+"), popover list, "Mark all read". |
| `KpiTile` | label (small uppercase), value (28 px tabular), delta or sublabel, optional sparkline. |
| `RowHeatmap` | CSS grid of bins per row; cell background = `hsl(var(--success) / fill%)` scaling to warning > 90 %, destructive > 100 %. Tooltip with bin contents. |
| `DataTable` | TanStack Table: sticky header, column visibility, server pagination, CSV export button, row density toggle. |
| `CsvDropzone` | dashed border, file icon, template link; preview table with error cells highlighted (destructive 12 % bg). |
| `EmptyState` | icon + one-line reason + single CTA. |
| `Toast` | bottom-right (desktop) / top (mobile). Severity colour rail. Alerts toast with "View". |

Icons: lucide-react, 20 px in nav, 16 px inline. Stroke 1.75.

## 6. Key screen wireframes

### 6.1 Staff — Search & product detail (desktop)
```
┌────────────────────────────────────────────────────────────────────────────┐
│ ☰  BinTrack      [🔍 Search products, SKU, barcode…            ⌸]   🔔  ◐  ● │
├──────────┬─────────────────────────────────────────────────────────────────┤
│ Home     │  Blue Ceramic Mug 350ml                     SKU MUG-0042   [⎙] │
│ Search ● │  ● Perishable: No   Category: Kitchen   Barcode 8901234567890   │
│ Orders   │ ┌──────────┬──────────┬──────────┬──────────┐                   │
│ Receive  │ │ On hand  │ Reserved │Available │ Reorder  │                   │
│ Transfer │ │   142    │    12    │   130    │    40    │  ▬▬▬▬▬▬▬▬▬▬░░     │
│ Scan     │ └──────────┴──────────┴──────────┴──────────┘                   │
│ Movements│  Locations                                                       │
│          │  LOCATION        ROW   BIN   LOT      EXPIRY      QTY   RES      │
│          │  WH1-R02-B017    R02   B017  —        —            90    12      │
│ ──────── │  WH1-R03-B004    R03   B004  —        —            52     0      │
│ Admin ▸  │                                                                  │
│          │  [Transfer from bin]  [Print barcode]                            │
└──────────┴─────────────────────────────────────────────────────────────────┘
```

### 6.2 Staff — Pick list with scan (mobile)
```
┌──────────────────────────────┐
│ ‹ ORD-20260904-0031  ● Picking│
│ 3 of 5 picked · Row R02 next │
├──────────────────────────────┤
│ ▌ WH1-R02-B017               │
│ ▌ Blue Ceramic Mug · MUG-0042│
│ ▌ Lot L2409 · exp in 21 d    │
│ ▌ Pick 4                     │
│ ▌              [ Scan ▣ ]    │
├──────────────────────────────┤
│ ▌ WH1-R02-B023   (short 2/5) │
│ ▌ Oat Milk 1L · OAT-0007     │
│ ▌ exp in 6 d ⚠               │
│ ▌ Pick 2       [ Scan ▣ ]    │
├──────────────────────────────┤
│ ✓ WH1-R01-B003  Picked 10    │
└──────────────────────────────┘
   [Home] [Search] [◉ Scan] [Orders] [More]
```
Scanner sheet:
```
┌──────────────────────────────┐
│ Scan bin  ›  Scan product  › Qty
│ ┌──────────────────────────┐ │
│ │  ┌─┐              ┌─┐    │ │
│ │       (camera)           │ │
│ │  └─┘              └─┘    │ │
│ └──────────────────────────┘ │
│ Expecting  WH1-R02-B017      │
│ [🔦] [⟲ camera]  [Type code] │
└──────────────────────────────┘
Mismatch state: red banner "Wrong bin — expected WH1-R02-B017, got WH1-R02-B018" [Retry]
```

### 6.3 Admin — Live dashboard (desktop)
```
┌────────────────────────────────────────────────────────────────────────────┐
│ Dashboard                                 ● Live      Last update 2 s ago  │
│ ┌────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┐  │
│ │ SKUs   │ Units  │ Value  │ Low    │Expiring│ Open   │ Picks  │Accuracy│  │
│ │  800   │ 41,206 │ ₹18.4L │  23 ⚠  │  11 ⚠  │  7     │  142   │ 99.6 % │  │
│ └────────┴────────┴────────┴────────┴────────┴────────┴────────┴────────┘  │
│ ┌──────────────────────────────────────┐ ┌───────────────────────────────┐ │
│ │ Stock by row          ▐▌▐▌▐▌▐▌       │ │ Alerts (23)     [Ack all]     │ │
│ │ R01 ████████████ 12,400              │ │ ▌● Out of stock · OAT-0007    │ │
│ │ R02 ██████████   10,110              │ │ ▌● Expired · MILK-0012 R03-B09│ │
│ │ R03 ████████      9,870              │ │ ▌● Low stock · MUG-0042 (38)  │ │
│ │ R04 ███████       8,826              │ │ ▌● Expiring 6 d · YOG-0033    │ │
│ ├──────────────────────────────────────┤ │ ▌● Pick discrepancy ORD-0031  │ │
│ │ Bin utilisation                      │ │ …                             │ │
│ │ R01 ▢▣▣▣▢▣▣▣▣▣▣▢▣▣▣▣▣▣▢▣▣▣▣▣▣▣▣▣▣▣ │ └───────────────────────────────┘ │
│ │ R02 ▣▣▣▢▣▣▣▣▣▣▣▣▣▣▢▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣ │ ┌───────────────────────────────┐ │
│ │ R03 ▣▣▢▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▢▣▣▣▣▣▣▣▣▣▣▣ │ │ Orders in progress            │ │
│ │ R04 ▣▣▣▣▣▣▣▢▣▣▣▣▣▣▣▣▣▣▣▣▣▣▢▣▣▣▣▣▣▣ │ │ ORD-0031  Priya  3/5  ●●      │ │
│ └──────────────────────────────────────┘ └───────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ ┌───────────────────────────────┐ │
│ │ Recent movements (live)              │ │ Expiring ≤ 30 d               │ │
│ │ 14:02 OUT 4 MUG-0042 R02-B017 Priya  │ │ YOG-0033  R03-B09  120  6 d   │ │
│ └──────────────────────────────────────┘ └───────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

### 6.4 Admin — CSV import
```
Step 1 Type  ○ Products ● Opening stock ○ Bins ○ Orders     [⭳ Template]
Step 2 ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
       │        Drop CSV here or click to browse            │
       └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
Step 3 Preview (20 of 1,214 rows)   ✓ 1,201 valid   ✗ 13 errors
       sku        location_code   qty   lot     expiry_date
       MUG-0042   WH1-R02-B017    90    —       —
       OAT-0007   WH1-R02-B023    5     L2409   2026-09-10
       XYZ-9999   WH1-R09-B001    3     —       —          ✗ bin not found
Step 4 Mode ● Partial ○ Strict                       [Import 1,201 rows]
       ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░  63 %  760/1,201   errors 0
```

### 6.5 Add product (admin)
Two-column form: left identity (SKU, name, category, barcode with [scan]), right stock rules (unit, cost, reorder point/qty, **Perishable toggle** → reveals shelf-life days). Image dropzone. Sticky footer: [Cancel] [Save] [Save & receive stock].

## 7. Interaction details

- **Debounce** search 200 ms; show skeleton rows; keep previous results while loading.
- **Keyboard**: `/` search, `s` open scanner, `Esc` close sheets, `Enter` confirm in scanner qty step, `j/k` move between pick cards.
- **Scan feedback**: 80 ms vibration + short beep on success; double buzz on mismatch; screen flash uses semantic colour at 20 % overlay for 300 ms.
- **Optimistic UI**: pick confirm updates card instantly; rollback with toast on RPC error.
- **Live indicator**: green dot "Live" in dashboard header; amber "Reconnecting" when socket drops.
- **Empty & loading**: skeletons match final layout to avoid shift.
- **Destructive confirms**: write-off, deactivate, role change → dialog with typed confirmation for role changes.

## 8. Accessibility

- Contrast: all text ≥ 4.5:1; location code ≥ 7:1 in both themes.
- Colour never the only signal: status chips have icon + text; heat-map cells have title text.
- Focus visible: 2 px ring `--ring` offset 2 px.
- All scanner steps operable via keyboard/HID input; live regions announce "Bin verified", "Wrong product".
- Touch targets ≥ 44 × 44 px; pick cards ≥ 72 px tall.
- Reduced motion: disable flash/animations under `prefers-reduced-motion`.
- Screen-reader labels on icon-only buttons.

## 9. Responsive breakpoints

| Breakpoint | Layout |
|---|---|
| < 640 px | single column, bottom nav, scanner as full-screen sheet, tables become cards |
| 640–1024 px | collapsed sidebar (icons), 2-col dashboard |
| > 1024 px | full sidebar, 12-col dashboard grid |

## 10. Assets
- Logo: wordmark "BinTrack" in Inter 600 + a 16 px square-with-dot glyph (bin + item). Monochrome (uses `--foreground`).
- Favicon: same glyph; light/dark variants via `prefers-color-scheme` media in `<link>`.
- QR labels: 40 × 40 mm, location code beneath in mono 12 pt; product labels 50 × 25 mm Code128 + SKU + name.
