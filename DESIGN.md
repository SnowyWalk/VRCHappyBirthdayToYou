# Design

## Source of truth
- Status: Active; last refreshed: 2026-10-28 (single-screen redesign).
- Surfaces: `src/components/studio.tsx` (whole flow), `world-scene.tsx` (walls), `name-sign.tsx`, `link-dialog.tsx`, `load-dialog.tsx`, `src/app/globals.css`. Browser checks: `tests/e2e/*.spec.ts`.

## Who arrives and why
- Visitors come from the Birthday World, where the settings board tells them to open this site. They already know the goal: set a name and photos, then paste a link back into the world.
- The site is a tool, not a landing page. No marketing copy, no gate in front of the editor, no learning curve.

## Information architecture
- `/` is the editor itself, as a fresh draft. Nothing is created on the server until the first "링크 만들기"; then the album is created, saved, and the address switches in place to `/edit/{uuid}#key=…` (no remount, drafts survive).
- `/edit/{uuid}#key=…` opens a saved album in the same editor.
- One screen, three numbered parts, top to bottom: ① 생일자 이름 ② 사진 ③ 링크 (fixed bottom bar). No step navigation and no hidden stages.
- `/party/{hash}/atlas.png` is the immutable BWAT image; `/data/{uuid}` is debugging JSON; `/media/{uuid}/{hash}` serves photos restored from the atlas.

## Flow
1. Name: one large input. Next to it, the world's stage board renders the typed name live where "YOUR NAME" sits in the world. An empty name leaves the board blank, as in the world. Validation (control characters, 128 UTF-8 bytes) runs on save and focuses the field.
2. Photos: the two real wall captures with the eight frames at their measured positions. Clicking a frame opens the file picker; dropping one photo fills that frame; other ratios open 사진 맞추기 (crop/contain, direction, position). "여러 장 한 번에 넣기" (or dropping several photos) fills empty frames in panel order (hero-left, hero-right, then gallery) and center-crops other ratios, then reports how many went in.
3. Link: the bottom bar is always visible. It shows a one-line status and one primary action:
   - not saved / changed → "링크 만들기" / "새 링크 만들기";
   - saved and unchanged → "링크 복사" (→ "복사됨").
   Saving copies the link immediately and opens the link dialog: the world's "아틀라스 이미지 URL" row with a "여기에 붙여넣기 (Ctrl+V)" callout, the link with a copy button, and two notes (24-hour validity, edits need a new link). "링크 보기" reopens it. If the browser blocks copying, the field is focused and selected with a Ctrl+C hint.
- Any edit after saving marks the link stale ("바뀐 내용이 있어요") and the primary action becomes "새 링크 만들기", so an outdated link cannot be copied by mistake.
- On `/`, links made in this browser appear above the editor ("이 브라우저에서 만든 링크") with name, photo count and age; one click resumes, a trash button deletes. Header: "불러오기" (paste a world PNG link or edit link) on a fresh draft, "새로 만들기" once an album exists. Saved albums can be deleted at the page bottom ("사진과 링크 삭제").

## Walls
- Never rearrange the frames into a grid: the photo must be placed where it hangs in the world. Frames follow the projected Unity texture corners (`src/lib/world-view.json`, `panelTransform`).
- Wide containers (≥720px) show each full wall capture with the HAPPY BIRTHDAY landmark; filled frames get a "빼기" button below.
- Narrow containers zoom into the frames' region and number them 1–8 (left wall 1–4, right wall 5–8, left to right on screen), with a row of large numbered slot buttons below each wall. Slots are the accessible controls there; the zoomed frames stay clickable but are hidden from assistive tech.

## Visual language
- Neutral surfaces in light and dark themes (system default, header toggle remembered). Blue primary action, green when copied. World images keep their own night palette in both themes.
- Steps are marked by small numbered circles, not by navigation. Copy is short, practical Korean.

## Performance
- Served images are lossy WebP made by `artifacts/publish-images.mjs` from `artifacts/source/`: walls 2400×600 (~100KB each), stage board ~30KB, URL row ~4KB. Filenames carry a content hash. Do not ship multi-megabyte captures.

## Accessibility and responsive behavior
- Native buttons and labels, visible focus, `role="status"` for the bar and bulk-add result, alerts for errors. Touch targets ≥44px. No horizontal page scroll at 360px; the action bar respects the safe area. Respect reduced motion.

## Constraints kept from the protocol
- BWAT v1 (`docs/BIRTHDAY_ATLAS_PROTOCOL_V1.md`): eight fixed panel IDs, landscape 16:9 or portrait 9:16 on every panel, name only in the `name` query, NFC UTF-8 ≤128 bytes. Name-only saves reuse the PNG; photo changes publish a new immutable PNG.
