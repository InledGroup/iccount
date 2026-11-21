---
name: inled-ui
description: Build any page in the Inled visual language — Apple-inspired light UI with system typography, pill buttons, soft white cards, hairline separators, the spinning Inled ring and the Inled wordmark. Use this skill whenever a page, app screen, landing, dashboard, docs site, email or component should look like Iccount/Inled, or when the user asks for "the Inled style", "el diseño de Iccount", Apple-like web UI, or a clean light interface with pill buttons. It is product- and layout-agnostic: it defines primitives and rules, not page sections.
---

# Inled UI

The Inled look: Apple HIG for the web. Light only, calm, generous whitespace,
hierarchy through size and weight rather than colour, one blue accent, pill
controls, soft white surfaces floating on a warm off-white page, and the Inled
ring as the only decorative element.

This skill is **structure-agnostic**. It gives you tokens and primitives; you
decide the page. Do not import Iccount's sections, copy, navigation or
information architecture unless the request is literally about Iccount.

---

## 1. Non-negotiables

- **Light mode only.** `color-scheme: light`, no dark variant, no theme toggle.
- **One accent.** Blue `#0071e3`. Everything else is grey scale.
- **No borders on cards.** Depth comes from soft shadows; separation inside
  surfaces comes from hairline separators. Never both a border and a shadow.
- **Pills for actions.** Full-radius (980px) controls, 44px tall minimum.
- **Type does the work.** Weight and size create hierarchy; colour stays quiet.
- **System font stack.** No webfont downloads, no icon fonts.
- **Product-neutral copy.** Sentence case, no exclamation marks, no marketing
  superlatives. Bilingual-ready (Spanish and English read equally well).

---

## 2. Tokens

Copy these verbatim as CSS custom properties. They are the whole palette.

```css
:root {
  color-scheme: light;

  --bg: #f5f5f7;
  --surface: #ffffff;
  --surface-grouped: #f2f2f7;
  --fill-1: rgba(118, 118, 128, 0.12);
  --fill-2: rgba(118, 118, 128, 0.08);
  --fill-3: rgba(118, 118, 128, 0.16);

  --text: #1d1d1f;
  --text-secondary: #6e6e73;
  --text-tertiary: #86868b;

  --separator: rgba(60, 60, 67, 0.14);
  --separator-strong: rgba(60, 60, 67, 0.22);

  --accent: #0071e3;
  --accent-hover: #0077ed;
  --accent-soft: rgba(0, 113, 227, 0.09);
  --accent-ring: rgba(0, 113, 227, 0.28);

  --danger: #d70015;
  --danger-soft: rgba(215, 0, 21, 0.08);
  --success: #1d7a34;
  --success-soft: rgba(29, 122, 52, 0.09);

  --nav-bg: rgba(245, 245, 247, 0.72);
  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.04), 0 12px 32px -16px rgba(0, 0, 0, 0.14);
  --shadow-hover: 0 2px 4px rgba(0, 0, 0, 0.05), 0 20px 44px -20px rgba(0, 0, 0, 0.22);

  --radius-card: 20px;
  --radius-control: 12px;
  --ease: cubic-bezier(0.22, 0.61, 0.36, 1);
  --container: 960px;
}
```

Spacing rhythm: `0.4 / 0.6 / 0.85 / 1 / 1.5 / 2 / 3.25rem`. Card padding
`1.75rem` (`1.35rem` under 680px). Never go below 16px page gutters.

---

## 3. Typography

```css
body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display',
    'Helvetica Neue', 'Inter', system-ui, sans-serif;
  font-size: 17px;
  line-height: 1.47;
  letter-spacing: -0.011em;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
```

| Role | Size | Weight | Extra |
|---|---|---|---|
| Display / h1 | `clamp(2.15rem, 5.2vw, 3.25rem)` | 700 | `letter-spacing: -0.028em`, `line-height: 1.08`, `text-wrap: balance` |
| Section / h2 | `1.4375rem` | 600 | `-0.022em`, `line-height: 1.2` |
| Subsection / h3 | `1.0625rem` | 600 | `-0.015em` |
| Lede | `1.1875rem` | 400 | `--text-secondary`, `line-height: 1.42`, `text-wrap: pretty`, max ~34ch |
| Body | 17px | 400 | `--text`; secondary paragraphs use `--text-secondary` |
| Small print | `0.8125rem` | 400 | `--text-tertiary` |
| Eyebrow / overline | `0.8125rem` | 600 | accent on `--accent-soft` pill |
| Code | `0.875em` | 400 | `ui-monospace, 'SF Mono', Menlo, Consolas` |

Rules:

- Body text never full-bleed wider than ~68ch; long copy lives in a `640px`
  column.
- `code` = `--fill-2` background, 6px radius, `0.12em 0.36em` padding.
  `pre` = `--surface-grouped`, 14px radius, `1rem 1.1rem` padding, 13px text.
- Links are accent colour, no underline by default, underline on hover only if
  the link sits inside body copy.
- All-caps only for tiny overlines and table headers, with `0.04em` tracking.

---

## 4. Brand assets

Use the official artwork; never redraw, recolour, rotate or add effects to it.

| Asset | URL | Use |
|---|---|---|
| Inled ring | `https://iccount.inled.es/inled-ring.png` | Header mark (26px), hero/empty states (92–118px), favicons |
| Inled wordmark | `https://iccount.inled.es/inled-logo-full.png` | Footer signature (20px height, 72% opacity), legal/print |

```html
<!-- header brand -->
<a class="brand" href="/">
  <img class="brand-ring" src="https://iccount.inled.es/inled-ring.png" alt="" width="26" height="26" />
  <span>Product name</span>
  <span class="brand-divider">/</span>
  <span class="brand-sub">Inled</span>
</a>

<!-- footer signature -->
<img class="inled-mark" src="https://iccount.inled.es/inled-logo-full.png" alt="Inled" height="20" />
```

Hero treatment (only where a hero exists): 118px ring centred above the
headline (92px on mobile), slowly spinning, with a soft halo behind it.

```css
.hero-ring { position: relative; width: 118px; height: 118px; margin: 0 auto 1.75rem; }
.hero-ring::after {
  content: ''; position: absolute; inset: -22%; border-radius: 50%; z-index: -1;
  background: radial-gradient(circle, rgba(0,113,227,.18), rgba(255,59,48,.06) 55%, transparent 72%);
  filter: blur(14px);
}
.hero-ring img { width: 100%; height: 100%; display: block; animation: ring-spin 26s linear infinite; }
@keyframes ring-spin { to { transform: rotate(360deg); } }
```

The ring is the only thing allowed to spin or glow. Do not stack it with
gradients, particles or 3D.

---

## 5. Buttons

One family, pill shaped, 44px tall (36px for `.plain`, 34px for inline danger).
Primary is blue; everything else is grey or text-only. Never outlined buttons.

```css
.btn, button {
  display: inline-flex; align-items: center; justify-content: center; gap: .4rem;
  min-height: 44px; padding: 0 1.35rem; border: 0; border-radius: 980px;
  background: var(--accent); color: #fff;
  font: inherit; font-size: 1rem; font-weight: 500; letter-spacing: -.01em;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
  transition: background 160ms var(--ease), transform 160ms var(--ease),
              box-shadow 200ms var(--ease), opacity 160ms var(--ease);
}
.btn:hover, button:hover { background: var(--accent-hover); color: #fff; }
.btn:active, button:active { transform: scale(.975); }
button:disabled { opacity: .45; cursor: progress; transform: none; }

.btn.secondary { background: var(--fill-1); color: var(--text); }
.btn.secondary:hover { background: var(--fill-3); color: var(--text); }

.btn.plain { background: transparent; color: var(--accent); padding: 0 .6rem; min-height: 36px; }
.btn.plain:hover { background: var(--accent-soft); }

.btn.destructive { background: var(--danger); color: #fff; }
.btn.destructive:hover { background: #b80012; }

button.danger { background: transparent; color: var(--danger); min-height: 34px;
  padding: 0 .7rem; font-size: .875rem; border-radius: 980px; }
button.danger:hover { background: var(--danger-soft); }
```

Usage rules:

- **One primary per view.** Pair it with a `.secondary` (grey) action, side by
  side, `0.65rem` gap, wrapping on mobile.
- Destructive actions are never the default focus; confirm them in a
  confirmation step, not with a red pill next to the primary.
- Button labels are verbs in sentence case ("Save changes", "Guardar cambios").
  No icons unless the icon is unambiguous; if used, 18px, currentColor.
- Full-width buttons only inside narrow forms (`max-width: 440px`).

---

## 6. Surfaces and lists

```css
.card { background: var(--surface); border-radius: var(--radius-card);
  box-shadow: var(--shadow-card); padding: 1.75rem; }
.narrow { max-width: 440px; margin: 0 auto; }
.grouped { background: var(--surface); border-radius: var(--radius-card);
  box-shadow: var(--shadow-card); overflow: hidden; }
.grouped-item { padding: 1rem 1.25rem; }
.grouped-item + .grouped-item { border-top: 1px solid var(--separator); }
.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
```

- Cards are white on `--bg`. Hover lifts to `--shadow-hover` only if the whole
  card is clickable.
- Grouped rows replace bordered tables for settings-like content; rows use one
  hairline separator, never padding + border + shadow.
- Page container: `width: min(960px, calc(100% - 2.5rem))` (2rem on mobile).
- Vertical rhythm between blocks: `1rem` tight, `2rem` normal, `3.25rem` before
  a new section title. Whitespace is the layout tool.

---

## 7. Forms

```css
label { display: block; margin-bottom: .35rem; font-size: .875rem;
  font-weight: 500; color: var(--text-secondary); }
input[type='email'], input[type='password'], input[type='text'],
input[type='url'], textarea {
  width: 100%; min-height: 46px; padding: .65rem .9rem;
  border: 1px solid transparent; border-radius: var(--radius-control);
  background: var(--fill-2); color: var(--text); font: inherit; font-size: 1rem;
  transition: background 160ms var(--ease), border-color 160ms var(--ease), box-shadow 160ms var(--ease);
}
input:focus, textarea:focus {
  outline: none; background: var(--surface);
  border-color: var(--accent); box-shadow: 0 0 0 3.5px var(--accent-ring);
}
.field-hint { margin-top: .4rem; font-size: .8125rem; color: var(--text-tertiary); }
```

Fields are filled grey, not outlined; they turn white with a blue halo on
focus. Labels sit above the field, hints below in tertiary grey. Errors use
`--danger` text on `--danger-soft`, never a red border alone.

---

## 8. Small components

- **Eyebrow chip:** accent text on `--accent-soft`, radius 980px, `0.28rem
  0.7rem` padding, 13px/600.
- **Notice:** `--fill-2` background, 14px radius, `.8rem 1rem` padding,
  secondary text.
- **Alerts:** `.success` = success text on `--success-soft`; `.error` =
  danger text on `--danger-soft`. No icons required.
- **Checklist:** no bullets; 2px accent check drawn with borders, row
  separators hairline.
- **Table:** 12px uppercase tertiary headers, `0.85rem` cell padding,
  separators only between rows, collapses to stacked blocks under 680px.
- **Header:** sticky, `--nav-bg` + `backdrop-filter: saturate(180%) blur(20px)`,
  one hairline bottom border, 52px tall, nav links are text pills that get
  `--fill-2` on hover.
- **Footer:** hairline top border, 13px tertiary text, wordmark at 72% opacity.

---

## 9. Motion

- Easing is always `cubic-bezier(0.22, 0.61, 0.36, 1)`; durations 160ms
  (colour/opacity), 200ms (shadow), 520ms (page entrance).
- Page content enters with a 10px rise and fade, staggered 60ms per block
  (max three).
- Press feedback is `scale(0.975)`; nothing bounces.
- Honour `prefers-reduced-motion: reduce` by collapsing every animation and
  transition to 1ms.
- Focus is always visible: `outline: 2px solid var(--accent); outline-offset: 2px`
  on `:focus-visible`.

---

## 10. Copy

- Sentence case everywhere; headings can be short phrases, not Title Case.
- Numbers and units with a space where Spanish requires it ("600 000
  iteraciones"); use `text-wrap: pretty` to avoid orphans.
- Spanish and English versions must have the same number of lines of intent —
  write both, don't translate word by word. Keep keys symmetric.
- Say what happens, then the caveat: "Tu contraseña no sale del navegador. Ni
  siquiera nosotros podemos leerla."
- No exclamation marks, no "revolutionary", no emoji in UI chrome.

---

## 11. Accessibility

- Minimum contrast: body text `--text` on white/grey; secondary at 17px passes;
  tertiary is for 13px hints only, never for essential content.
- Touch targets ≥ 44×44px (36px for inline plain actions is the floor).
- Semantic elements, one `h1` per page, real `<button>` for actions, real
  `<label for>` for fields, `aria-live="polite"` for async status.
- Never rely on colour alone for errors: pair with text.

---

## 12. Portable stylesheet

Drop this in when the project has no design system yet, then compose freely.
It contains no page structure.

```css
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display',
    'Helvetica Neue', 'Inter', system-ui, sans-serif;
  font-size: 17px; line-height: 1.47; letter-spacing: -.011em;
  -webkit-font-smoothing: antialiased; }
h1, h2, h3 { margin: 0; font-weight: 700; letter-spacing: -.028em; line-height: 1.08; text-wrap: balance; }
h1 { font-size: clamp(2.15rem, 5.2vw, 3.25rem); }
h2 { font-size: 1.4375rem; font-weight: 600; letter-spacing: -.022em; line-height: 1.2; }
h3 { font-size: 1.0625rem; font-weight: 600; letter-spacing: -.015em; }
p { margin: 0; } p + p { margin-top: .75rem; }
a { color: var(--accent); text-decoration: none; transition: color 160ms var(--ease); }
a:hover { color: var(--accent-hover); }
::selection { background: var(--accent-soft); }
code, pre { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: .875em; }
code { background: var(--fill-2); border-radius: 6px; padding: .12em .36em; }
pre { padding: 1rem 1.1rem; background: var(--surface-grouped); border-radius: 14px; overflow-x: auto; }
pre code { background: none; padding: 0; font-size: .8125rem; }
.lede { color: var(--text-secondary); font-size: 1.1875rem; line-height: 1.42; text-wrap: pretty; }
.muted { color: var(--text-secondary); font-size: .9375rem; }
.small { font-size: .8125rem; color: var(--text-tertiary); }
.eyebrow { display: inline-flex; align-items: center; gap: .4rem; padding: .28rem .7rem;
  border-radius: 980px; background: var(--accent-soft); color: var(--accent);
  font-size: .8125rem; font-weight: 600; }
.container { width: min(var(--container), calc(100% - 2.5rem)); margin: 0 auto; }
```

---

## 13. Anti-patterns

- Dark mode, neon, glassmorphism panels, gradient buttons.
- Outlined or square buttons; icon-only primary actions.
- Cards with borders *and* shadows; separators between padded rows *and* gaps.
- Multiple accent colours; accent-coloured body copy.
- Marketing headings in Title Case or all caps.
- Redrawn or recoloured Inled marks; the ring placed off-centre next to text.
- Layouts that assume a specific set of sections — build from the primitives
  the page actually needs.

---

## 14. Deliverable checklist

1. Tokens pasted once, no ad-hoc hex values anywhere else.
2. One blue primary action visible per screen.
3. Type scale respected; nothing below 13px except legal print.
4. Ring/wordmark loaded from the official URLs, with `alt` handling.
5. Focus-visible, reduced-motion and 680px breakpoint handled.
6. Copy in sentence case, both languages if the product is bilingual.
