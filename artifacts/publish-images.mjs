// Builds the lightweight images the site serves from the sources in artifacts/source.
// Run after recapturing the world: node artifacts/publish-images.mjs
// Filenames carry a content hash so browsers never reuse an outdated image.
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

async function publish(name, buffer) {
  const file = `/${name}-${createHash('sha256').update(buffer).digest('hex').slice(0, 12)}.webp`;
  await fs.writeFile(`public${file}`, buffer);
  console.log(file, `${Math.round(buffer.length / 1024)}KB`);
  return file;
}

// The plaza seen from above (artifacts/world-top.json: orthographic, 65° down,
// facing the stage), cropped to the stage and the eight frames. The page lays
// photo cards over each frame's projected center at the frames' real size.
const top = JSON.parse(await fs.readFile('artifacts/world-top.json', 'utf8'));
const crop = { left: 60, top: 450, width: 2280, height: 1560 };
const worldImage = await publish('world-map', await sharp('artifacts/source/world-top.webp')
  .extract(crop).resize(1600).webp({ quality: 80 }).toBuffer());
const round = (v) => Math.round(v * 10) / 10;
await fs.writeFile('src/lib/world-view.json', JSON.stringify({
  image: worldImage,
  width: crop.width,
  height: crop.height,
  card: { width: round(top.frameMeters.width * top.pixelsPerMeter), height: round(top.frameMeters.width * top.pixelsPerMeter * 9 / 16) },
  panels: top.panels.map(({ name, corners }) => ({
    name,
    x: round(corners.reduce((sum, c) => sum + c.x, 0) / 4 - crop.left),
    y: round(corners.reduce((sum, c) => sum + c.y, 0) / 4 - crop.top),
  })),
}, null, 2) + '\n');

// Stage board seen from the front, with the "YOUR NAME" placeholder painted in
// the board colour so the page can draw the typed name in its place.
const board = { r: 30, g: 30, b: 38 };
const patch = await sharp({ create: { width: 204, height: 36, channels: 3, background: board } }).png().toBuffer();
const stageSign = await publish('stage-sign', await sharp('artifacts/source/overview-3480.webp')
  .extract({ left: 1310, top: 370, width: 880, height: 420 })
  .composite([{ input: patch, left: 328, top: 253 }])
  .webp({ quality: 84 }).toBuffer());

// The in-world settings board seen from the front (artifacts/source/settings-board.webp,
// captured 2026-10-28 without post-processing so the thin gold lines stay gold).
// artifacts/settings-board.json has the URL field and buttons in image pixels; the page
// highlights them from the percentages written here.
const boardCapture = JSON.parse(await fs.readFile('artifacts/settings-board.json', 'utf8'));
const field = (name) => boardCapture.rects.find((r) => r.name === name);
const pct = (v, total) => Math.round(v / total * 1000) / 10;
const input = field('Atlas image URL input');
const apply = field('Atlas apply button');
const pad = 6;
const tagTop = input.bottom + pad + 10;
const settingsBoard = {
  image: await publish('settings-board', await sharp('artifacts/source/settings-board.webp').webp({ quality: 84 }).toBuffer()),
  width: boardCapture.width,
  height: boardCapture.height,
  mark: {
    left: pct(input.left - pad, boardCapture.width), top: pct(input.top - pad, boardCapture.height),
    width: pct(apply.right - input.left + pad * 2, boardCapture.width), height: pct(input.bottom - input.top + pad * 2, boardCapture.height),
  },
  pasteTag: { left: pct(input.left, boardCapture.width), top: pct(tagTop, boardCapture.height) },
  applyTag: { left: pct(apply.left, boardCapture.width), top: pct(tagTop, boardCapture.height) },
};

await fs.writeFile('src/lib/assets.json', JSON.stringify({ stageSign, settingsBoard }, null, 2) + '\n');
