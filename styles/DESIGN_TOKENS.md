# CalSync Design Tokens — Claymorphism System

## Philosophy

Claymorphism for this extension uses:

- Subtle inner highlights (1px top gradient)
- Layered box-shadows for soft depth
- Rounded surfaces (14px–24px)
- Dark-first palette with auto light mode
- Accent: Soft violet (#7c6ef8)

## CSS Token Reference

```css
/* Surfaces */
--clay-bg:
  #1a1b2e /* Page background */ --clay-surface: #22243a /* Cards, panels */
    --clay-surface-raised: #2a2d45 /* Elevated elements */
    --clay-surface-hover: #313552 /* Hover state */ /* Borders */
    --clay-border: rgba(255, 255, 255, 0.06)
    --clay-border-hover: rgba(255, 255, 255, 0.12) /* Accent */
    --accent: #7c6ef8 --accent-glow: rgba(124, 110, 248, 0.25)
    --accent-soft: rgba(124, 110, 248, 0.12) /* Semantic */ --success: #34d399
    --warning: #f59e0b --danger: #f87171 /* Typography */
    --text-primary: #f0f0f8 --text-secondary: rgba(240, 240, 248, 0.55)
    --text-muted: rgba(240, 240, 248, 0.35) /* Radius */ --radius-sm: 10px
    --radius-md: 14px --radius-lg: 20px --radius-xl: 24px /* Clay Shadows */
    --shadow-clay: inset 0 1px 0 rgba(255, 255, 255, 0.07),
  0 4px 12px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.2);

--shadow-clay-hover:
  inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 6px 18px rgba(0, 0, 0, 0.45),
  0 2px 6px rgba(0, 0, 0, 0.25);
```

## Motion Spec

| Action       | Duration | Easing                         |
| ------------ | -------- | ------------------------------ |
| Hover lift   | 150ms    | ease                           |
| Click press  | 80ms     | ease-in                        |
| Card appear  | 150ms    | ease                           |
| Button slide | 200ms    | cubic-bezier(0.34,1.56,0.64,1) |
| Success anim | 200ms    | ease                           |

## Component Patterns

### EventCard

- `box-shadow: var(--shadow-clay)`
- `border-radius: var(--radius-lg)`
- Hover: `translateY(-1px)` + `var(--shadow-clay-hover)`
- Selected: accent border + `var(--accent-soft)` bg

### PrimaryButton

- Linear gradient: `#7c6ef8 → #a78bfa`
- Inner highlight: `inset 0 1px 0 rgba(255,255,255,0.15)`
- Press: `scale(0.98)`
- Loading: spinner overlay

### FloatingButton

- Dark pill with violet glow shadow
- `border-radius: 50px`
- Hover: `translateY(-2px) scale(1.02)`
- Spring-in animation on inject
