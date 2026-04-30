# Style Maintenance Notes

Styles are loaded in this order from `src/main.jsx`:

1. `src/index.css`: Tailwind directives plus the legacy global poker table styles.
2. `src/styles/poker-mobile-layout.css`: focused mobile layout guardrails that must win over the legacy rules.

Keep new selectors scoped with the existing `poker-*` naming pattern.

Recommended section order inside `index.css`:

1. Tailwind directives.
2. Keyframes and reusable animation classes.
3. Base table structure: shell, header, table area, center board.
4. Player surfaces: opponent cards, self panel, action dock.
5. Responsive layout overrides: mobile portrait, mobile landscape, square/tablet cases.
6. Stable legacy fallbacks.

Use `src/styles/poker-mobile-layout.css` for narrow mobile collision fixes, such as keeping absolute transition banners away from opponent cards, bet bubbles, scroll strips, community cards, and the bottom action area. Prefer one small rule with a comment over broad JSX utility overrides.

For mobile/tablet changes, run:

```powershell
npm run smoke:transition
npm run smoke:multiway-layout
npm run smoke:mobile-opponents
```
