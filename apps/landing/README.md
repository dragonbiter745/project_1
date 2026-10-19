# REVA Food Court · landing page

The public page for diners and investors. The first screen is a live 3D food court
(eight shops, 24 tables, a crowd of diners and staff) running a real simulation; below it the
story of how ordering works, the kitchen display and the operations console.

## Run

```bash
pnpm install
pnpm --filter @foodcourt/landing dev      # http://localhost:5186
pnpm --filter @foodcourt/landing test     # simulation + world build tests
pnpm --filter @foodcourt/landing build    # dist/
```

`VITE_CUSTOMER_URL` (optional) points the "Order now" buttons at the diner app.
It defaults to `https://reva-nest-foodcourt.web.app`.

## Deploy

CI (`.github/workflows/frontend-landing.yml`) builds, tests and deploys the `landing` Hosting
target: a preview channel on pull requests, the live site on `main`. Manually:

```bash
firebase deploy --only hosting:landing --project reva-nest-foodcourt
```

The target maps to the `reva-nest-landing` site in `.firebaserc`; create that site once with
`firebase hosting:sites:create reva-nest-landing` before the first deploy.

## QR deep links

`/?table=T12` opens the 3D court in explore mode with the order panel open and table T12
preselected (the same table codes as the printed plates). Ordering for real happens in the
customer app at `${VITE_CUSTOMER_URL}/t/T12`.

## How it is built

- `src/data` shops, menus (prices in paise) and the hall layout in metres.
- `src/sim` a plain TypeScript engine with no React or three imports: fixed 30 Hz steps,
  A* on a 25 cm nav grid with path smoothing, local avoidance, queue slots, atomic whole-table
  reservation, kitchens driven through `canTransitionSubOrder` from `@foodcourt/shared`,
  runners, cleaners, suppliers and a lunch-rush crowd curve. `rig.ts` turns animation states
  into joint angles.
- `src/scene` React Three Fiber. Static geometry is merged into one mesh per material
  (`batch.ts`), people are one instanced mesh per body part, textures are painted on canvases
  at start-up (no image, model, HDRI or font downloads). The UI reads the simulation through
  4 Hz snapshots; per-frame data never goes through React state.
- `src/ui` the DOM: hero overlay, explore HUD, demo order flow and the story sections.

The demo order in the 3D court is part of the simulation only; it never touches Firestore or
payments. Totals use `computeOrderTotals` from `@foodcourt/shared`, so GST matches the real app.

## Quality presets

Low, Medium and High change device pixel ratio, shadow map size, interior lights and
post-processing (N8AO, bloom, tilt-shift). Phones start on Low; `PerformanceMonitor` steps
quality up or down from the measured frame rate unless a preset is picked by hand.
