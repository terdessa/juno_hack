---
name: Medley
description: A quiet clinical instrument for GP follow-up calls — colour reserved for exactly four things that need it.
colors:
  ink: "oklch(0.21 0 0)"
  canvas: "oklch(0.985 0 0)"
  card-white: "oklch(1 0 0)"
  surface-recessed: "oklch(0.955 0 0)"
  border-hairline: "oklch(0.915 0 0)"
  border-field: "oklch(0.68 0 0)"
  text-muted: "oklch(0.47 0 0)"
  sidebar-tint: "oklch(0.958 0.003 250)"
  live-ember: "oklch(0.55 0.20 25)"
  live-ember-surface: "oklch(0.96 0.03 25)"
  overdue-amber: "oklch(0.52 0.13 65)"
  overdue-amber-surface: "oklch(0.96 0.035 75)"
  flag-crimson: "oklch(0.48 0.19 18)"
  flag-crimson-surface: "oklch(0.96 0.03 18)"
  done-moss: "oklch(0.46 0.10 155)"
  done-moss-surface: "oklch(0.95 0.03 155)"
typography:
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 600
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  reading:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.65
  micro:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.45
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  2xl: "18px"
  3xl: "22px"
  full: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  badge-neutral:
    backgroundColor: "{colors.surface-recessed}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.md}"
    padding: "4px 10px"
  input-field:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
  card-surface:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
---

# Design System: Medley

## Overview

**Creative North Star: "The Quiet Instrument"**

Medley reads like a piece of clinical instrumentation, not a SaaS dashboard wearing a healthcare skin. The canvas is a true neutral at chroma 0 — no warm cream tint, because a paper-toned near-white is the saturated AI default and reads as generated the moment a second person has seen a few. Nothing is coloured for decoration. Primary actions are ink-filled, not branded; surfaces are grey-on-grey, distinguished by two planes (a sidebar rail one shade off the content) rather than by hue.

Colour is a clinical signal, not a mood. Exactly four things in the entire product carry saturated colour — a call happening right now, a follow-up gone overdue, a safeguarding or low-mood flag, a completed call — and nothing else is allowed to borrow those hues. A doctor reading the screen from a metre away between patients can tell what needs attention without hunting, and a quiet overdue case is exactly as visually loud as an urgent one, because loudness was never the mechanism.

Warmth is deliberate but structural, not material: it lives in the copy voice (plain, direct, never falsely reassuring) and in small physical details — a pressed-state scale on every tappable control, a mic button that breathes with two offset rings while listening, an equaliser that dances while Medley speaks. A display serif was tried on patient names and rejected: it read as warmth in a mock-up and as inconsistency in a tool opened forty times a day. One family, many weights, does the whole job.

**Key Characteristics:**
- True neutral (chroma 0) canvas and ink — no warm or cool tint anywhere except the four state colours
- Exactly four saturated hues in the whole system, each meaning one clinical state, never decorative
- Single sans family (Geist) at multiple weights instead of a display/body pairing
- Two-plane structure: a recessed sidebar rail against a lighter content plane
- Named, motion-driven state: pulsing dots, breathing mic rings, an equaliser — always paired with a written status word, never colour or motion alone
- Every animated cue has a static reduced-motion equivalent that still communicates the same state

## Colors

Deliberately restrained: a chroma-0 ink/neutral scale for structure and text, and four reserved hues that each mean exactly one clinical thing.

### Primary
- **Ink** (`oklch(0.21 0 0)`): the only "brand" colour in the system. Fills primary buttons, active nav state, focus rings, and body text. Not a hue — colour is reserved for state, so the primary action colour is simply the darkest neutral.

### Secondary — the four clinical signals
- **Live Ember** (`oklch(0.55 0.20 25)`, surface `oklch(0.96 0.03 25)`): a call happening right now. Paired with a pulsing dot and the sticky "on a call now" strip.
- **Overdue Amber** (`oklch(0.52 0.13 65)`, surface `oklch(0.96 0.035 75)`): a follow-up past due that nobody has acted on.
- **Flag Crimson** (`oklch(0.48 0.19 18)`, surface `oklch(0.96 0.03 18)`): a clinical flag — safeguarding, low or distressed mood, a failed call, an error banner. Also backs `--destructive`.
- **Done Moss** (`oklch(0.46 0.10 155)`, surface `oklch(0.95 0.03 155)`): a call completed. Also backs `--success`.

### Neutral
- **Canvas** (`oklch(0.985 0 0)`): page background. True neutral, not warm — the deliberate rejection of a cream near-white.
- **Card White** (`oklch(1 0 0)`): cards, popovers, the elevated plane above canvas.
- **Surface Recessed** (`oklch(0.955 0 0)`): secondary buttons, muted badges, quiet fills.
- **Sidebar Tint** (`oklch(0.958 0.003 250)`): the nav rail — one shade down and a hair cool from content, enough to read as its own plane without a border doing all the work.
- **Border Hairline** (`oklch(0.915 0 0)`, ~1.23:1 on canvas): dividers between list rows. Deliberately quiet — darkening it turns lists into a grid, which is not the intent.
- **Border Field** (`oklch(0.68 0 0)`, ~3:1 on card): the edge of an actual input control. Kept distinctly darker than the hairline divider because WCAG 1.4.11 needs 3:1 for a boundary that is the only thing identifying a control.
- **Text Muted** (`oklch(0.47 0 0)`, ~6.5:1 on canvas): secondary text, timestamps, metadata.

### Named Rules
**The Four Signals Rule.** Saturated colour exists nowhere except Live Ember, Overdue Amber, Flag Crimson, and Done Moss. If a new state needs colour, it either maps onto one of these four or the system has grown a fifth meaning — treat that as a real design decision, not a quick addition.

**The Colour-Is-Never-Alone Rule.** Every colour-coded state also carries a written word or an accessible label (`aria-label`, visible status text). A status dot next to its own label is decorative; a status dot standing alone announces itself as an image with a name.

## Typography

**Body Font:** Geist (with `ui-sans-serif, system-ui, sans-serif` fallback)

**Character:** One family carrying the entire hierarchy through weight, size, and letter-spacing rather than a display/body pairing. Deliberately: a serif on patient names tested as warm in isolation and as noise in a tool opened forty times a shift.

### Hierarchy
- **Headline** (600, Tailwind's default heading scale, -0.02em tracking, `text-wrap: balance`): page and section titles (`h1`–`h4`). No custom size token — the weight and tracking do the differentiating work, not a bespoke scale.
- **Reading** (400, 1.0625rem / 17px, 1.65 line-height): prose the doctor actually reads — call summaries, transcripts, agent replies.
- **Body** (400, 0.9375rem / 15px, 1.6 line-height): the default for interface text, labels, buttons.
- **Micro** (500, 0.8125rem / 13px, 1.45 line-height; relaxes to 14px below 640px): dense metadata — timestamps, chips, table furniture. A label is a label; it does not need its own scale relative to context.

### Named Rules
**The One-Family Rule.** No second typeface, ever, at any weight. Hierarchy is weight + size + spacing, because a label opened forty times a day should not also carry a font decision.

**Tabular Numerals Rule.** Anything that updates in place — call durations, timestamps, live readings — uses `font-variant-numeric: tabular-nums` (applied via `time` and `[data-numeric]`) so digits don't jitter sideways as they change.

## Layout

A fixed two-plane shell: a persistent nav rail (`228px` wide on desktop, collapsing to a `56px`-tall horizontal strip below `md`) against a content plane capped at `980px` and centred, with `20px`/`32px` horizontal padding (`px-5 sm:px-8`). Two z-index-managed overlays sit above the base plane: a sticky "on a call now" strip when a call is live, and an error banner when the day's list fails to load — both persistent across every page because their absence is the exact failure this product exists to prevent.

Named stacking order replaces arbitrary `z-50`s: `--z-rail: 20`, `--z-sticky: 30`, `--z-peek: 40`, `--z-backdrop: 50`, `--z-palette: 60`. A new overlay picks a name in this order rather than a guessed number.

## Elevation & Depth

Hybrid: mostly flat tonal layering (the two-plane sidebar/content split does most of the depth work), with two named shadows reserved for genuinely floating elements.

### Shadow Vocabulary
- **Soft** (`0 1px 2px oklch(0 0 0 / 0.04), 0 2px 8px oklch(0 0 0 / 0.04)`; deepens to `/0.4` in dark mode): resting elevation for cards, the active nav pill, the mic button at rest.
- **Float** (`0 12px 40px oklch(0 0 0 / 0.12), 0 2px 8px oklch(0 0 0 / 0.06)`; deepens to `/0.6` in dark mode): genuinely detached elements — the patient peek popover, the active/listening mic button.

### Named Rules
**The Two-Plane Rule.** Depth communicates structure (rail vs. content, resting vs. floating), never brand or decoration. A third shadow tier is a sign a component needs restructuring, not a bigger shadow.

## Shapes

Rounded throughout, scaling with role rather than a single flat radius: `6px` (badges, tight chips) → `8px` (buttons, inputs, list rows) → `10px` (base `--radius`) → `14–22px` (cards, popovers, the peek card) → full pill (`9999px`, the mode switch, status pills, the mic button). Borders are hairline by default (`--border`) and step up in contrast only where the boundary is the sole cue that a control exists (`--input`, 3:1 rule above).

## Components

### Buttons
- **Shape:** `rounded-md` (8px) as the system default; the mic button and mode switch escalate to full pill because they're circular/track controls, not text buttons.
- **Primary:** ink background, near-white text, `h-9` (36px) with `px-4 py-2`; hover dims to 90% opacity rather than shifting hue.
- **Outline / Secondary / Ghost:** hairline border on transparent or `bg-secondary`; hover fills with `bg-accent`. No colour beyond neutral — a secondary action never competes with a state colour.
- **Pressed state:** every tappable control (`button`, `a[href]`, `[role=button]`) scales to `0.985` on `:active`, defined once at the base layer rather than per component, and removed entirely under `prefers-reduced-motion`.

### Badges / Status
- **Mood badges:** filled with the matching state-surface colour and text in the matching state-ink colour (e.g. `bg-flag-surface text-flag`); **Neutral mood deliberately gets no colour** (`bg-secondary text-muted-foreground`) — an absence of signal is not itself a signal.
- **Status dots:** `h-2 w-2` filled circle in the matching state colour; only the "calling" state pulses (`pulse-dot`). Declined and queued share the same quiet grey dot — a call the doctor called off is not a fault, so it doesn't borrow the failure colour.

### Cards / Containers
- **Corner Style:** `rounded-xl` (14px) as the default card radius; the patient-peek popover steps up to nothing extra, staying at `rounded-xl` too, differentiated by `shadow-float` instead.
- **Background:** `--card` (pure white / `oklch(0.21 0 0)` dark), never the canvas colour, so cards read as a distinct lifted plane even without a shadow.
- **Shadow Strategy:** resting cards carry no shadow beyond the hairline border; only genuinely floating cards (the peek popover) use `shadow-float`.

### Inputs / Fields
- **Style:** `h-9`, `rounded-md`, transparent background, `--input` border (the 3:1-contrast field-only border, distinct from the quieter divider hairline).
- **Focus:** single system-wide `:focus-visible` ring (`2px solid var(--ring)`, `2px` offset), defined once at the base layer rather than per component, so focus is never visible on some controls and invisible on others.

### Navigation
- **Rail:** `bg-sidebar` (a hair cool, one shade off content), active item gets `bg-card` + `shadow-soft` (it "lifts" onto the content plane); inactive items are muted text that darkens on hover. Icons mirror the same active/muted state as their label.
- **Inbox count badge:** pill, `bg-foreground` normally, escalates to `bg-flag` only when at least one waiting item is urgent — the one place a nav badge is allowed to borrow a state colour, because the count's entire purpose is to be true everywhere.

### Voice Console (signature component)
The mic button is the product's signature control: a large (`80px`, `96px` on `sm+`) circular button that is either resting (hairline border, `shadow-soft`) or active (ink fill, `shadow-float`, two offset `mic-ring` pulses at staggered delays so the animation reads as continuous rather than looping). Every one of its four states (idle / listening / thinking / speaking) is also written out as a status word beside it — a doctor glancing from a metre away must know whose turn it is without interpreting an animation. Speaking state swaps the mic icon for a volume icon and adds a three-bar equaliser (`eq-bar`, staggered animation-delay). All motion collapses to a static, still-legible equivalent under `prefers-reduced-motion`.

### Mode Switch (signature component)
A two-option pill radiogroup (`Speak` / `Type`) with a single sliding thumb (`bg-card`, `shadow-soft`) that translates between the two positions rather than two buttons swapping backgrounds — the movement reads as one control changing state, not two things trading places. Built as `role="radiogroup"` with arrow-key navigation, matching screen-reader expectations for a radio group rather than a tab list, because it selects an input method rather than revealing a content panel.

## Do's and Don'ts

### Do:
- **Do** keep colour to the four named states (Live Ember, Overdue Amber, Flag Crimson, Done Moss). Anything else stays neutral.
- **Do** pair every colour cue with a written word or accessible label — colour is never the sole carrier of state.
- **Do** use the named z-index scale (`--z-rail` … `--z-palette`) for any new overlay instead of an arbitrary value.
- **Do** give every animated state cue (pulses, rings, equalisers) a static `prefers-reduced-motion` equivalent that still communicates the change.
- **Do** keep the input-field border (`--input`, ~3:1) visibly darker than the row-divider border (`--border`, ~1.23:1) — they answer different questions (is this a control? vs. where does this row end?).

### Don't:
- **Don't** introduce a second typeface, including a display serif. It was tried on patient names and rejected as inconsistent in a tool opened forty times a day.
- **Don't** tint the canvas or card surfaces warm (cream, paper-tone). The neutral is chroma-0 on purpose — it's the explicit rejection of the "generated AI editorial" look.
- **Don't** give the "neutral" mood, "declined" status, or "queued" status any colour beyond the quiet grey. Absence of a signal must not be dressed up as one.
- **Don't** add a new shadow tier beyond Soft and Float. If something needs a third level of depth, restructure the plane instead.
- **Don't** style focus rings per component. One `:focus-visible` rule at the base layer covers everything; a component-level override is how focus becomes visible on four controls and invisible on the two that matter.
