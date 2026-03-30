# Design System

> Warm, human-centered, editorial — intentionally distinct from cold/techy AI aesthetics.

---

## Colors

### Core Palette

| Token                | Role                         | Hex       | RGB           |
| -------------------- | ---------------------------- | --------- | ------------- |
| `hearth-bg`          | Background (light)           | `#FAF9F5` | 250, 249, 245 |
| `hearth-card`        | Background (warm) / Card     | `#EEECE2` | 238, 236, 226 |
| `hearth-accent`      | Primary accent (terra cotta) | `#DA7756` | 218, 119, 86  |
| `hearth-accent-deep` | CTA / Button orange          | `#BD5D3A` | 189, 93, 58   |

### Text

| Token            | Role                   | Hex       | RGB           |
| ---------------- | ---------------------- | --------- | ------------- |
| `hearth-heading` | Heading / Near-black   | `#141413` | 20, 20, 19    |
| `hearth-text`    | Body text (dark brown) | `#3D3929` | 61, 57, 41    |
| `hearth-muted`   | Muted / Secondary text | `#736B64` | 115, 107, 100 |

> **Note:** Muted text uses a darker, warmer tone (`#736B64`) rather than a light grey, to preserve warmth and contrast on `#FAF9F5` backgrounds.

### Borders & Surfaces

| Token           | Role               | Hex       | RGB           |
| --------------- | ------------------ | --------- | ------------- |
| `hearth-border` | Dividers / Borders | `#E8E6DC` | 232, 230, 220 |

### Accent Colors (used sparingly)

| Role  | Hex       |
| ----- | --------- |
| Blue  | `#6A9BCC` |
| Green | `#788C5D` |

---

## Typography

| Role          | Font                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Headings & UI | **Google Sans** — clean, humanist; warm feel without being cold                                                        |
| Body          | **Google Sans** — consistent across all text sizes                                                                     |
| Web fallback  | `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif` |

> Both `--font-serif` and `--font-sans` resolve to Google Sans, ensuring a unified, modern-humanist reading experience across all contexts.

---

## Shape & Elevation

### Border Radius

| Token  | Value  | Use                        |
| ------ | ------ | -------------------------- |
| `xs`   | `4px`  | Focus rings, small accents |
| `sm`   | `8px`  | Inputs, buttons            |
| `md`   | `10px` | Cards, panels              |
| `lg`   | `12px` | Large containers           |
| `full` | `20px` | Tags, badges, pills        |

### Shadow

| Name          | Value                              |
| ------------- | ---------------------------------- |
| `shadow-warm` | `0 2px 8px rgba(61, 57, 41, 0.08)` |

---

## Spacing Scale

A consistent semantic spacing scale is applied via Tailwind:

| Token  | Value  |
| ------ | ------ |
| `xs`   | `2px`  |
| `sm`   | `4px`  |
| `base` | `8px`  |
| `md`   | `12px` |
| `lg`   | `16px` |
| `xl`   | `24px` |
| `2xl`  | `32px` |
| `3xl`  | `40px` |

---

## Design Philosophy

- Warm, earthy neutrals anchored by a burnt orange primary
- Unified humanist sans (Google Sans) keeps the UI clean without feeling cold or corporate
- No cold blues, no dark gradients, no "sci-fi" tech aesthetic
- Generous whitespace, paper-like surfaces
- Semantic token naming (`hearth-*`) keeps Tailwind usage self-documenting
- Designed to work for both marketing and product UI
