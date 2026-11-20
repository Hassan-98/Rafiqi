# Rafiqi design system: «زمرد محدث» (redesign 2026-09)

This is the reference for every screen. The app is Arabic and always RTL. It uses React 19, Tailwind v4 and zustand, and ships as a Capacitor Android app and a Tauri desktop app. The layout is mobile-first; at `lg` and above, the side rail replaces the dock.

## 1. Identity

- **Tone.** Calm, dignified and premium, with light Islamic ornament. There is one focal element per screen, and ornament supports the content without competing with it.
- **Palettes.** The user switches palette in «أنا → المظهر». Every colour comes from a token, so every screen must work in all sixteen combinations:
  - `emerald`, the default «زمرد محدث»: emerald accent with gold ornament.
  - `turquoise`, «فيروز وخزف»: turquoise tile on cool porcelain, saffron ornament; petrol-blue nights.
  - `lapis`, «لازورد وذهب»: the lapis and gold of an illuminated Mushaf on ivory; deep lapis nights.
  - `dusk`, «بنفسج الغروب»: muted plum with amber; aubergine nights.
  - `clay`, «ورد وطين»: muted terracotta-rose on blush paper; warm clay nights.
  - `brass`, «ليل ونحاس»: night-ink surfaces with a brass accent.
  - `sage`, «رمل ومريمية»: stone neutrals with a sage accent.
  - `ink`, «حبر وورق»: graphite ink on paper, gold the only colour (for minimal-colour tastes). In dark mode the accent is silver, so accent text reads close to body text: never rely on accent colour alone to mark a state.
  - Each palette has a light and a dark mode (`html.dark`; dark is the default). In every dark mode except emerald the accent is light, so `text-on-accent` is dark ink.
  - Adding one: a light + dark block in `src/index.css` (the light block also sets the night surfaces; the dark block re-sets everything the light one changed), plus `PREVIEW` and `PALETTE_OPTIONS` in `PalettePicker.tsx`.
- **Never hardcode a hex colour** in components (`#1A6B5A`, `#fff` backgrounds and so on). Use tokens. An SVG `fill`/`stroke` should use `currentColor` plus a `text-*` class, or `var(--color-…)`.

## 2. Tokens (Tailwind utilities)

| Role | Utility | Notes |
|---|---|---|
| Page background | `bg-cream` / `dark:bg-dark-bg` | set by the layouts |
| Card surface | `bg-white` / `dark:bg-dark-card` | always pair them |
| Recessed well / track | `bg-cream-dark/55` / `dark:bg-dark-surface` | |
| Primary accent | `teal`, `teal-light`, `teal-dark` | `text-teal dark:text-teal-light` for accent text |
| Achievement / ornament | `gold`, `gold-light`, `gold-dark` | stars, streaks, records |
| Ink | `text-text-primary dark:text-text-on-dark`, then `text-text-secondary`, then `text-text-muted` | |
| **Text on accent fills** | `text-on-accent` (also `/70`, `/80`) | **never `text-white` on teal**: every dark palette but emerald needs dark ink |
| Status | `success`, `warning`, `danger`, `info` | |
| Hairline ring | `ring-1 ring-black/[0.04] dark:ring-white/[0.06]` | prefer this to borders |

- **Gradients:** `bg-[image:var(--gradient-teal)]` for the hero or primary fill, `--gradient-gold`, `--gradient-hero-light` / `--gradient-hero-dark`, and `--gradient-night`. All of them are token-derived.
- **Shadows:** `shadow-[var(--shadow-xs|sm|md|lg)]`. They are tinted by the palette, so never add raw `rgba(0,0,0,…)` shadows.
- **Radius:**
  - `rounded-[var(--radius-card)]` (22px) for containers;
  - `rounded-[var(--radius-inner)]` (14px) for rows and tiles inside cards;
  - `rounded-xl` or `rounded-2xl` for icon chips and buttons;
  - pills only for tiny badges and chips.
- **Motion:** 150–300ms transitions using the `ease-out-soft` token, and `transform`/`opacity` only. Import from `@/lib/motion`, never framer-motion. `layout`/`layoutId` do nothing. Respect `motion-reduce:`.
- **Numbers:** always Arabic-Indic, via `toArabicDigits` (`@/utils/arabicFormat` or `@/services/statsService`). Use `font-counter tabular-nums` for counters and times.
- **Arabic typography:** never use `tracking-*` or `uppercase` on Arabic (letter-spacing breaks cursive joins). Use `font-display` for headings, `font-ornate` (Amiri) for short ornamental titles or quotes, and `font-quran` for Quranic text. Use `text-balance` for headings and `text-pretty` for paragraphs.

## 3. Components (reuse; do not re-create)

- `@/components/ui/Card`: variants `plain` (default), `elevated`, `inset`, `hero`, `gradient-edge`, `gold-rim`, `night`, `glass`.
  - `hero` is the accent surface with the etched girih lattice. Its content uses `text-on-accent`.
  - `gradient-edge` is the warm ornate panel for module heroes.
- `@/components/ui/Ornament`:
  - `Star8` (eight-point star);
  - `Medallion` (a value inside an 8-point seal; tones `gold`, `teal`, `onAccent`);
  - `OrnamentRule` (divider);
  - `ArchMotif` (faint mihrab arch for hero corners, placed absolutely with low opacity);
  - `SectionTitle` (the shared section header: gold star, title, subtitle, action).
- `@/components/ui/Section`: `SectionTitle` plus a stack of content.
- `@/components/ui/Button`: `primary`, `secondary`, `soft`, `ghost`, `gold`, `danger`, `icon`; sizes `sm`, `md` (48px), `lg`. Buttons already provide haptics and pressed and focus states.
- `@/components/ui/HapticPressable`: any tappable card or tile, with press scale and haptics.
- `@/components/layout/TopAppBar`: `title`, `subtitle?`, `showBack`, `actions`. Use it on pushed screens.
- The tab pages (Home, Quran, Adhkar, «وِرد وقيام», «أنا») open with a large page header instead of a TopAppBar:
  ```
  <header style={{paddingTop:'calc(var(--safe-top) + 1rem)'}}>
    small muted kicker line
    text-[26px] font-display font-bold title
    optional subtitle
  </header>
  ```
  The page wrapper is `flex flex-col gap-6 px-4 pb-nav`.
- `@/components/ui/ProgressRing`, `Toggle`, `BottomSheet`, `EmptyState`, `Skeleton`, `Toast` (`toast.success(...)`: no exclamation marks, and no "Oops").
- Stats: `@/components/stats/*` holds hand-built SVG charts. **Do not use recharts.** Use `SectionInsights` (`<SectionInsights domain="dhikr" statsTo="/stats/dhikr" />`) for the "your progress here" strip at the top of a section.
- Insights: `@/services/insightsService` (`useInsights(domain)`, `computeInsights`, `collectSnapshot`) is the single source of motivating facts. **Extend the engine instead of computing ad-hoc facts in a page.**

## 4. Layout patterns

- **Section rhythm:** `gap-6` between sections and `gap-2.5` to `gap-3` inside them. Every section starts with `SectionTitle`.
- **Hero:** one per screen, at the top. Use Card `hero` or `gradient-edge`, an optional `ArchMotif`, the key number in a `Medallion` or large `font-counter`, and one clear primary action.
- **Lists:** rows in a single `Card` with `p-1.5`. Each row is `rounded-[var(--radius-inner)] px-3 py-3 hover:bg-teal/5`, with an icon chip (`w-9 h-9 rounded-xl bg-teal/10 text-teal`) and hairline separators.
- **Tile grids:** 2 or 3 columns, never four equal feature cards. Vary the emphasis so one tile is the hero.
- **Chips:** segmented controls are `rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1`, with the active segment `bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal`.
- **States:**
  - Empty: `EmptyState` with a real first action.
  - Loading: `Skeleton` shaped like the content.
  - Error: an inline message plus a retry `Button`.
- **Accessibility:**
  - tap targets of at least 44px;
  - `aria-label` on icon-only buttons;
  - `aria-pressed` / `aria-checked` on toggles and chips;
  - focus rings are provided globally, so don't remove them;
  - text contrast of at least 4.5:1, which also means checking brass and sage in dark mode.

## 5. Copy

- Plain, warm, specific Arabic in active voice.
- Use the Islamic greeting and blessing phrases where they are natural (تقبّل الله، بارك الله فيك).
- Sentence case, no exclamation marks, and no generic AI phrases.

## 6. Ownership rules for parallel work

- Only edit the files assigned to you.
- **Do not edit** `src/index.css`, `src/App.tsx`, `src/data/featureCatalog.ts`, `src/components/ui/*`, `src/components/layout/*` or `src/services/cloudSyncService.ts` / `syncMerge.ts`. Report any change you need in them (a route to register, a CSS rule, a new UI primitive) in your final report.
- Edits to a store your area owns must be additive (new fields or actions) and must not break persisted data.
- When you finish, run `npx tsc -b` (the project uses `noUnusedLocals`). Fix errors in your own files and report errors in others' files.
