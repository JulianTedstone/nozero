# nozero design system

Graphite ground, **crimson = action**, **yellow = attention**. Adapted from the
nopilot brand-v3 system (`context-message-nopilot/site-redesign/brand-v3`) and
applied to this app.

## Files

- **`tokens.yaml`** — the single source of truth (W3C Design Tokens format):
  primitive ramps, light/dark semantic colour, the dark **column elevation
  ladder**, type, space, radius, border, shadow.
- **`app/globals.css`** — the web layer. `:root` (light) and `.dark` map the
  semantic tokens to CSS variables; `@theme inline` exposes them to Tailwind so
  utilities like `bg-surface`, `text-muted`, `border-line`, `text-primary`,
  `bg-active`, `bg-col-center`, `bg-col-side` work. shadcn's variables
  (`--background`, `--card`, `--primary`, `--ring`, …) are remapped to the brand
  palette so every shadcn component is themed by construction.

> The CSS layer is currently **hand-maintained** from `tokens.yaml`. Keep them in
> sync. A Style Dictionary v4 step can generate the CSS layer later — until then,
> change a value here *and* in `globals.css`.

## Non-negotiable rules

1. **Two signals, never swapped.** Crimson is the one action to take (primary
   button, brand mark, link). Yellow is what to notice (focus ring, selected
   row, live value, marked text). Yellow is a **fill, never text** — ink sits on
   it (`--on-active`).
2. **Borders are reserved for content elements** — cards, tickets, panels — at
   `radius.lg` (14px) + `border.hair` (1px line). Columns, dividers, outer
   containers, headers and footers are separated by **tone** (the column ladder)
   and whitespace, not boxes. **No nested borders.**
3. **Dark is stepped back from black.** Columns differ by lightness, not rules:
   `col-shell` (gutter) < `col-side` (secondary) < `col-center` (main focus) <
   `col-raised` (cards). Headers are differentiated by *type* (mono eyebrow),
   not a box.
4. **Serif (Newsreader) only for h1-equivalent titles.** Inter does everything
   structural; Geist Mono is the instrument layer (eyebrows, captions, plate
   numbers, code).
5. **Motion is rationed** — entrances and state changes only, brief and quiet,
   honouring `prefers-reduced-motion`. Nothing animates for decoration.
6. **Normalise analogous controls** across surfaces — the "new item", search and
   refresh affordances share placement, size and behaviour everywhere.

## Framework (brand-v3 Layer C)

shadcn/ui themed from these tokens; TanStack Table/Query for real grids; Tremor
for dashboards; React Hook Form + Zod for forms; Motion (restrained) for
animation. Icons: **Lucide at 1.5px stroke**, themed via `currentColor`.
