# Design

## Source of truth
- Status: Active; last refreshed: 2026-10-04.
- Surfaces: entry and album editor. Evidence: user brief, existing entry/editor/CSS and browser tests, latest Birthday World gallery arrangement, previous captures. New capture is taken only while the world chat is idle.
## Brand
- Birthday World controller for visitors already familiar with the VRChat world.
- Keep world image and action controls; remove promotional copy, feature cards, footers and studio labels.
## Product goals
- Create once, repeatedly save the same UUID, load existing work, choose eight photos and birthday nickname, publish BWAT v1 atlas PNG and copy its immutable direct URL.
- Success: saved content survives server restart; unchanged photos are not uploaded again.
- Non-goals: modifying Unity project, authentication, production hosting.
## Personas and jobs
- Visitors arrive from the world's instructions; they need to set panel photos, enter a name and copy a link, on desktop or mobile.
## Information architecture
- `/`: actual world preview, dominant 새로 만들기, secondary 불러오기. `/edit/{uuid}`: name field, full-width interactive world capture, selected photo tools, save and copy result.
- `/party/{hash}/atlas.png`: immutable BWAT image; `/data/{uuid}` remains debugging JSON; `/media/{uuid}/{hash}`: originals.
## Design principles
- Preserve world positions: eight photo targets overlay their measured texture corners in the world render. Selecting a target immediately opens its file picker. Never rearrange the panels into cards, columns or an arbitrary grid.
- Clearly distinguish unsaved preview from saved world data.
- Home uses one fresh overview of the circular terrace. Editor uses two real captures of four panels each, with the guestbook and complete HAPPY BIRTHDAY heading visible in both. These are essential spatial landmarks; never hide them or crop away the heading. Keep panel positions, sizes and rotations unchanged; hide only the obstructing Photo booth, restore in finally, and never save the scene. Measured texture corners connect click targets to Unity objects and existing atlas IDs. Do not rearrange panels into a grid.
## Visual language
- Neutral light and dark surfaces; high-contrast blue action buttons. The world image conveys the world atmosphere; interface copy stays functional.
- Home shows the world image, dominant 새로 만들기 and secondary 불러오기. No visible heading, emotional copy, tagline or marketing text. Primary CTA >=64px high and >=260px wide. Editor shows a name field and the full-width world image; photos overlay the exact projected texture corners instead of separate cards.
- Restrained transitions, respect reduced motion.
## Components
- Reuse shadcn Button, Input, Dialog, theme toggle. WorldScene contains native projected photo buttons over the actual capture. L1–L4 and R1–R4 follow the physical order from stage to entrance; preserve populated/empty/busy states. A panel click immediately opens its file picker, so there is no persistent selection, selected-panel toolbar, or separate replacement control. The birthday name input spans the gallery width. Only the world image URL and its copy control are shown; remove the edit-link disclosure.
## Accessibility
- WCAG AA aim; visible focus; native buttons, labels, dialog focus management; status live region.
- Every scene panel available in a labeled list; no hover-only controls.
## Responsive behavior
- Desktop shows the two wall views sequentially at full width. Mobile keeps both images at least 1300px wide in internally scrolling viewports, starting at the birthday heading; each has 무대 쪽/입구 쪽 controls matching the real camera direction. Creation stays in the first viewport; save stays fixed with safe-area clearance. Touch targets >=44px; the page itself has no horizontal overflow at 360px.
## Interaction states
- Loading disables duplicate operations; empty panels show plus; errors preserve edits; saved state shows timestamp.
- Save conflicts ask for reload through an explicit error; network failures allow retry.
## Content voice
- Only necessary Korean control, action and result text. Name: 생일자의 이름. Gallery: 사진을 넣을 패널을 누르세요. Help: 가로 16:9 또는 세로 9:16 · 사진당 60MB. Save: 저장하고 링크 만들기 / 변경 사항 저장. Copy: 월드에 붙여 넣을 링크 / 링크 복사. No emotional headings, taglines, marketing description or infrastructure terms.
## Implementation constraints
- Next.js App Router, TypeScript, shadcn/ui, Tailwind CSS v4. Persistent Node server filesystem.
- Verify lint, types, build, API deduplication and browser create/save/load flows.
## Open questions
- Diagram panel IDs must remain identical to PANELS atlasId/objectName mapping. New previews refresh home imagery without breaking editor hit targets.
- Unity Udon URL download and manifest reader remain a separate integration task.
- Production authentication and domain deployment policy.

## 테마

라이트·다크 테마를 제공한다. 최초 접속은 기기 설정을 따르고, 헤더의 아이콘 버튼으로 전환한 선택은 브라우저에 저장한다. 월드 이미지와 패널 강조는 그대로 유지하며 입력칸, 팝업, 오류 안내와 모바일 저장 바에도 테마를 적용한다.

## BWAT v1 publishing

Keep the editable album UUID; changed photo content produces an immutable 2048×2048 PNG URL, while name-only saves reuse the PNG and update its name query parameter. All eight panel positions support landscape 16:9 and portrait 9:16. Show only actionable format limits and errors. The public copy button is named VRChat용 이미지 링크 복사. Preserve prior files and distinguish unsaved previews from the previous published link. Nicknames use NFC UTF-8 at most 128 bytes. See docs/BIRTHDAY_ATLAS_PROTOCOL_V1.md.
