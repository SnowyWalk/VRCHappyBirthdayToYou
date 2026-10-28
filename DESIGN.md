# Design

## Source of truth
- Status: Active; last refreshed: 2026-10-28 (single-screen redesign).
- Surfaces: `src/components/studio.tsx` (whole flow), `world-scene.tsx` (walls), `name-sign.tsx`, `load-dialog.tsx`, `src/app/globals.css`. Browser checks: `tests/e2e/*.spec.ts`.

## Who arrives and why
- Visitors come from the Birthday World, where the settings board tells them to open this site. They already know the goal: set a name and photos, then paste a link back into the world.
- The site is a tool, not a landing page. No marketing copy, no gate in front of the editor, no learning curve.

## Information architecture
- `/` is the editor itself, as a fresh draft. Nothing is created on the server until the first "링크 만들기"; then the album is created, saved, and the address switches in place to `/edit/{uuid}#key=…` (no remount, drafts survive).
- `/edit/{uuid}#key=…` opens a saved album in the same editor.
- One screen, three numbered parts, top to bottom: ① 생일자 이름 ② 사진 ③ 링크 복사해서 월드에 붙여넣기. No step navigation, no hidden stages and no result popup.
- `/party/{hash}/atlas.png` is the immutable BWAT image; `/data/{uuid}` is debugging JSON; `/media/{uuid}/{hash}` serves photos restored from the atlas.

## Flow
1. Name: one large input. Next to it, the world's stage board renders the typed name live where "YOUR NAME" sits in the world. An empty name leaves the board blank, as in the world. Validation (control characters, 128 UTF-8 bytes) runs on save and focuses the field.
2. Photos: the two real wall captures with the eight frames at their measured positions. Clicking a frame opens the file picker; dropping one photo fills that frame. There is no photo editing: other ratios are center-cropped without asking (wider-or-square → landscape, taller → portrait). "여러 장 한 번에 넣기" (or dropping several photos) fills empty frames in panel order (hero-left, hero-right, then gallery), then reports how many went in.
3. Link: part 3 sits in the page, not in a dialog. It holds one action area, the world's whole settings board (so visitors recognise it in VRChat) with the URL field and 적용 button marked, the three in-world steps and short notes (24-hour validity, edits need a new link, Allow Untrusted URLs).
   - not saved / changed → "링크 만들기" / "새 링크 만들기" (the old link is hidden while stale);
   - saved and unchanged → the link field and "링크 복사".
   Making the link scrolls part 3 into view and focuses "링크 복사"; it never copies on its own. "복사됨" shows for 2.5 seconds after a click and then returns to "링크 복사", so it always means "you just copied". If the browser blocks copying, the field is focused and selected with a Ctrl+C hint.
   While part 3's action is off screen, a fixed bottom bar shows the status and the same action; it slides away once part 3 is visible, so there are never two buttons in view and no secondary icon buttons.
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
- Served images are lossy WebP made by `artifacts/publish-images.mjs` from `artifacts/source/`: walls 2400×600 (~100KB each), stage board ~30KB, settings board ~35KB (its in-world fields are repainted to match the live world). Filenames carry a content hash. Do not ship multi-megabyte captures.

## Accessibility and responsive behavior
- Native buttons and labels, visible focus, `role="status"` for the bar and bulk-add result, alerts for errors. Touch targets ≥44px. No horizontal page scroll at 360px; the action bar respects the safe area. Respect reduced motion.

## Constraints kept from the protocol
- BWAT v1 (`docs/BIRTHDAY_ATLAS_PROTOCOL_V1.md`): eight fixed panel IDs, landscape 16:9 or portrait 9:16 on every panel, name only in the `name` query, NFC UTF-8 ≤128 bytes. Name-only saves reuse the PNG; photo changes publish a new immutable PNG.
