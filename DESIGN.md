---
name: CivicLens
description: GIS-Based Rural Infrastructure & Citizen Grievance Intelligence Platform
colors:
  primary: "#0F5C4D"
  primary-hover: "#0B473B"
  primary-subtle: "#E6F2EF"
  primary-ink: "#FFFFFF"
  neutral-bg: "#F4F1EA"
  neutral-surface: "#FFFFFF"
  neutral-subtle: "#EAE5DC"
  neutral-rule: "#DFD9CE"
  neutral-rule-strong: "#C5BEB0"
  neutral-ink: "#141B22"
  neutral-ink-secondary: "#3A4652"
  neutral-ink-muted: "#5C6773"
  status-active: "#15803D"
  status-active-bg: "#ECFDF3"
  status-pending: "#B45309"
  status-pending-bg: "#FFFBEB"
  status-urgent: "#B91C1C"
  status-urgent-bg: "#FEF2F2"
  status-info: "#0369A1"
  status-info-bg: "#F0F9FF"
  layer-water: "#0284C7"
  layer-lighting: "#D97706"
  layer-sanitation: "#0F5C4D"
  layer-education: "#6D28D9"
  layer-health: "#B91C1C"
typography:
  display:
    fontFamily: "Public Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Public Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Public Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0em"
  label:
    fontFamily: "Public Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.01em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.02em"
rounded:
  xs: "4px"
  sm: "6px"
  md: "10px"
  lg: "14px"
  pill: "9999px"
  full: "9999px"
spacing:
  3xs: "2px"
  2xs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-ink}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  chip-filter:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-ink-secondary}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  chip-filter-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-ink}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  card:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  input-text:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.md}"
    padding: "11px 13px"
---

# CivicLens Design System

## Overview

CivicLens operates in the **Operate** mode. Grounded in the **Survey Atlas & Civic Governance** visual language, it serves field volunteers (ASHA/Anganwadi workers, village surveyors), local administration (Gram Panchayat secretariats), and rural citizens:

1. **Outdoor Glare Resistance**: Warm topographic stone-linen paper (`#F4F1EA`) eliminates harsh screen glare in direct sunlight while giving crisp white card sheets (`#FFFFFF`) immediate figure-ground separation.
2. **Tactile Touch Ergonomics**: Minimum 44px (48px on primary actions and navigation tabs) touch targets for one-handed operation in the field.
3. **Cartographic Restraint**: Clean GIS overlays, telemetry HUDs, and enclosed 1px-bordered cards without decorative slop or raw emoji substitutes.
4. **Resilient Local-First Hierarchy**: Offline status, outbox counts, and sync states live as persistent indicators in the top console header.

---

## Colors

### Primary & Accent
- **Primary / Civic Forest Emerald**: `#0F5C4D` (`var(--color-accent)`) — Institutional public works authority, primary actions, and active navigation states (8.1:1 contrast with white). In dark mode: `#2DD4BF`.
- **Primary Hover**: `#0B473B` (`var(--color-accent-hover)`). In dark mode: `#5EEAD4`.
- **Primary Subtle**: `#E6F2EF` (`var(--color-accent-subtle)`). In dark mode: `rgba(45, 212, 191, 0.14)`.

### Neutrals & Surfaces
- **Topographic Paper**: `#F4F1EA` (`var(--color-paper)`). In dark mode: `#0C1218`.
- **Card / Sheet Surface**: `#FFFFFF` (`var(--color-surface)`). In dark mode: `#131B24`.
- **Subtle Stone Surface**: `#EAE5DC` (`var(--color-paper-subtle)`). In dark mode: `#1A242F`.
- **Rule / Hairline**: `#DFD9CE` (`var(--color-rule)`). In dark mode: `#253241`.
- **Rule Strong**: `#C5BEB0` (`var(--color-rule-strong)`). In dark mode: `#394B60`.
- **Ink Primary**: `#141B22` (`var(--color-ink)`). In dark mode: `#F1F5F9`.
- **Ink Secondary**: `#3A4652` (`var(--color-ink-2)`). In dark mode: `#CBD5E1`.
- **Ink Muted**: `#5C6773` (`var(--color-ink-muted)`). In dark mode: `#8FA0B3`.

### Semantic Status
- **Active / Operational**: `#15803D` on `#ECFDF3` (dark: `#4ADE80` on `rgba(74, 222, 128, 0.12)`).
- **Pending / In-Queue**: `#B45309` on `#FFFBEB` (dark: `#FBBF24` on `rgba(251, 191, 36, 0.12)`).
- **Urgent / Outage / Gap**: `#B91C1C` on `#FEF2F2` (dark: `#F87171` on `rgba(248, 113, 113, 0.12)`).
- **Info / Synchronizing**: `#0369A1` on `#F0F9FF` (dark: `#38BDF8` on `rgba(56, 189, 248, 0.12)`).

### GIS Infrastructure Layer Colors
- **Water Supply (Handpumps/Tanks)**: `#0284C7`
- **Street Lighting**: `#D97706`
- **Public Sanitation (Toilets/Drains)**: `#0F5C4D`
- **Education (Schools/Anganwadis)**: `#6D28D9`
- **Healthcare (PHCs/Subcentres)**: `#B91C1C`

---

## Typography

**Display & Body Font:** `Public Sans`, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif.
**Technical & Coordinate Font:** `JetBrains Mono`, ui-monospace, SFMono-Regular, Menlo, monospace.

### Hierarchy
- **Display** (ExtraBold 800, 1.5rem–1.875rem, line-height 1.2): Main view headings (`text-wrap: balance`).
- **Headline** (Bold 700, 1.125rem–1.25rem, line-height 1.25): Card titles, dialog headers.
- **Title** (Bold 700, 0.875rem, line-height 1.3): Section labels and form steps.
- **Body** (Regular 400, 0.875rem, line-height 1.45): Primary descriptive text and notes. Max measure: 65–75ch.
- **Label / Tag** (SemiBold 600, 0.75rem, line-height 1.3): Navigation tabs, status chips, badges.
- **Spatial / Mono** (Medium 500, 0.75rem–0.8125rem, line-height 1.4): GPS coordinates, record counts, and timestamps.

### The Tabular Figures Rule
All geographic coordinates, telemetry numbers, asset counters, sync queues, and metric percentages use `font-variant-numeric: tabular-nums` via `.tabular-nums`.

---

## Layout

- **Mobile First**: Full viewport height (`100dvh`), tailored for 360px–420px field devices.
- **Desktop / Tablet Cartographic Console**: On viewports $\ge$ 768px, the interface sits inside a framed console (`max-width: 540px; height: 94vh; border-radius: var(--radius-lg)`) centered over a topographic dot-grid canvas.
- **Z-Index Hierarchy**: Map/Content (`1`), Map HUD (`500`), Route Card (`999`), Header (`1000`), Bottom Dock (`1200`), Bottom Sheet (`2000`), Modals (`3000`).

---

## Elevation & Depth

- **Subtle Resting** (`--shadow-subtle`): `0 1px 2px rgba(20, 27, 34, 0.05)`
- **Interactive Card** (`--shadow-card`): `0 2px 6px rgba(20, 27, 34, 0.06), 0 1px 2px rgba(20, 27, 34, 0.04)`
- **Floating HUD** (`--shadow-float`): `0 6px 16px -2px rgba(20, 27, 34, 0.10), 0 2px 6px -1px rgba(20, 27, 34, 0.05)`
- **Modal & Console Frame** (`--shadow-modal`): `0 16px 36px -6px rgba(20, 27, 34, 0.16), 0 4px 10px -2px rgba(20, 27, 34, 0.06)`

---

## Shapes

- **Micro-affordances (`--radius-xs`: 4px, `--radius-sm`: 6px)**: Badges, language buttons, inputs, status tags.
- **Containers (`--radius-md`: 10px, `--radius-lg`: 14px)**: Cards, bottom sheet top corners, dialogs, primary buttons.
- **Pills (`--radius-pill`: 9999px)**: Filter chips, sync chips, active tab icon capsules, map pins.

---

## Components

- **Header & Sync Pill**: Houses the civic emblem, Ward 3 label, live sync status pill, EN/HI/MR segmented toggle, dark mode switch, and logout action.
- **Bottom Navigation Dock**: Fixed 68px dock with pill highlight behind the active icon and a 3px top accent notch.
- **Map HUD & Route Card**: Top floating telemetry capsule, horizontal scrolling filter chips, and an enclosed TSP repair route summary card.
- **Category Selection & Urgency Bar**: 2-column category cards with 38px icon containers and a 4-tier semantic urgency segmented bar.
- **Duplicate Alert & Coverage Gap Cards**: Fully enclosed `1px` bordered semantic cards with pill status badges (zero thick side-tab borders).

---

## Do's and Don'ts

### Do:
- **Do** format all lat/long coordinates, timestamps, and KPI counters with `tabular-nums`.
- **Do** maintain $\ge$ 44px touch targets on all interactive controls.
- **Do** use authored SVG icons from `CivicIcons.tsx` for every symbol and action.
- **Do** theme browser surfaces (`::selection`, scrollbars, `caret-color`, `:focus-visible`).

### Don't:
- **Don't** use thick colored `border-left` or `border-right` side-tab borders on cards or alerts.
- **Don't** use raw emoji characters (`🧭`, `👍`, `✕`) inside UI controls.
- **Don't** place inline `style={{ ... }}` overrides in TSX views when a design-system class exists.
- **Don't** use kickers or eyebrows above headings.
