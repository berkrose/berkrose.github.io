# Portfolio Design System: High-End Editorial

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Digital Gallery."** 

This system is not a container for content; it is a curated environment where the interface recedes to let the work breathe. It moves beyond the rigid, "templated" look of modern portfolios by using intentional asymmetry, extreme white space, and a monochrome palette that feels authoritative yet invisible. We break the standard grid by treating the screen like a high-end physical lookbook, utilizing "The Layering Principle" to define space rather than lines.

## 2. Colors
The palette is rooted in absolute neutrals, using deep blacks and a spectrum of greys to create a sophisticated, high-contrast environment.

### Core Tokens
- **Primary:** `#000000` (The anchor for typography and high-impact elements)
- **Secondary:** `#bb0018` (The "Cinnabar" accent, used sparingly for critical actions or status)
- **Surface:** `#f9f9f9` (The canvas; a warm, off-white that feels more premium than pure hex white)
- **On-Surface:** `#1a1c1c` (The primary text color, providing softer contrast than pure black for long-form reading)

### The "No-Line" Rule
Traditional 1px borders are strictly prohibited for sectioning. Structural boundaries must be defined solely through:
1. **Vertical Space:** Large, intentional gaps using the spacing scale.
2. **Background Shifts:** Moving from `surface` to `surface-container-low` (`#f3f3f4`) to denote a new context.
3. **Tonal Transitions:** Using `surface-container` (`#eeeeee`) for inner groupings.

### Surface Hierarchy & Nesting
Treat the UI as a series of stacked sheets of fine paper. 
- Use `surface-container-lowest` (`#ffffff`) for cards or interactive modules sitting atop a `surface-container-low` section.
- This creates "natural depth" that feels architectural rather than digital.

### The Glass & Gradient Rule
For floating navigation or mobile menus, utilize **Glassmorphism**. Apply `surface` at 80% opacity with a `20px` backdrop-blur. This ensures the editorial content is always visible beneath the chrome, softening the edges of the experience.

---

## 3. Typography
The typography is the voice of the brand. We use **Inter Tight** for its architectural precision and **halyard-display** for high-end editorial flair.

- **Display-LG (3.5rem):** Used for "The Impossible" statements. Low letter-spacing (-0.02em) to create a dense, graphic block of text.
- **Headline-MD (1.75rem):** Section headers. Must be high-contrast (Primary on Surface).
- **Body-LG (1rem):** The workhorse. Uses `on-surface` for maximum readability. 
- **Label-SM (0.6875rem):** All-caps with increased tracking (+0.1em) for metadata and small captions, mimicking gallery wall labels.

The hierarchy functions as a visual rhythm: large, bold statements followed by expansive whitespace, leading into precise, small-scale metadata.

---

## 4. Elevation & Depth
Depth in this system is achieved through **Tonal Layering**, not structural shadows.

- **The Layering Principle:** Place a `surface-container-lowest` card on a `surface-container-low` section. The change in hex value is enough to signify elevation.
- **Ambient Shadows:** Only used for floating "Call to Action" buttons or modals. 
  - **Blur:** 40px
  - **Opacity:** 4% of `on-surface`
  - **Offset:** Y: 8px
- **The "Ghost Border" Fallback:** If a container absolutely requires a boundary (e.g., image on a white background), use `outline-variant` (`#cfc4c5`) at **15% opacity**. It should be felt, not seen.

---

## 5. Components

### Buttons
- **Primary:** Solid `primary` (`#000000`) background, `on-primary` (`#ffffff`) text. 0px corner radius. High-end fashion aesthetic.
- **Tertiary (Editorial):** Text-only with a 1px `on-surface` underline offset by 4px. No background.

### Cards & Image Styling
- **Forbid Dividers:** Do not use lines to separate project cards. Use the Spacing Scale (64px - 128px) to create breathing room.
- **The "Masonry Offset":** Images should not always align to a horizontal axis. Offset image heights or use asymmetric margins to create a dynamic, editorial flow.
- **Full-Width Bleeds:** Crucial imagery should bleed to the edge of the viewport to break the "container" feel.

### Form Inputs
- **Text Fields:** No box container. Use a bottom-only "Ghost Border" (15% opacity) that animates to 100% opacity `primary` on focus.
- **Labels:** Use `label-sm` positioned above the input.

### Navigation
- **The Floating Bar:** Use Glassmorphism (80% `surface` + blur) with 0px rounding. Navigation items use `title-sm` with a `secondary` (`#bb0018`) dot indicator for active states.

---

## 6. Do's and Don'ts

### Do:
- **Do use aggressive whitespace.** If a section feels finished, double the margin.
- **Do use monochrome imagery.** Treat colored images with a subtle desaturation to ensure the UI and photography feel like one cohesive unit.
- **Do lean into asymmetry.** Place text on the left and images on the right with uneven gutters to mimic a magazine layout.

### Don't:
- **Don't use border-radius.** Every element must have a 0px corner radius to maintain a brutalist, high-end architectural feel.
- **Don't use standard drop shadows.** They look "cheap" and "app-like." Use tonal shifts instead.
- **Don't use "Gray" text.** Use the `on-surface-variant` token which is a warm, tinted neutral that feels intentional, never "disabled."