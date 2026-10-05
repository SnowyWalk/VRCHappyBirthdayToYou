# Controller redesign — 2026-10-01

User context: visitors arrive from an already explained VRChat world. The site is a controller, not a landing page.

Plan before UI edits:
1. Replace landing copy, feature summaries, three-step section and footer with the world image and Create new / Load.
2. Keep UUID creation, image hashing, auth, load and save contracts unchanged. Existing storage and browser tests lock these flows.
3. Make highlighted scene panels open the image picker directly; keep selected-photo replacement/removal and compact numbered fallback controls.
4. Put nickname and save controls next to the scene. Show the saved world URL with its copy action; keep edit-key portability under a compact secondary control.
5. Remove technical integration text from the product UI; keep actual Unity integration limits in README and final report.
6. Replace obsolete presentation CSS, retain shadcn tokens and accessible keyboard/focus/error states. Verify desktop/mobile screenshots, e2e, lint, types and build.

Acceptance: no promotional headings, steps, feature cards, footer, UUID or internal technical labels in the normal editor. Keep compact save state, errors and conflict reload feedback. Both scene and numbered fallback buttons open the picker with correct panel labels; fallback buttons have 44px touch targets. Stable save/load flows; controls usable on mobile.
