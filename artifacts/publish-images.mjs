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

// Wall captures: 4800×1200 sources shown at most ~1100px wide, so 2400px covers 2× screens.
const view = JSON.parse(await fs.readFile('src/lib/world-view.json', 'utf8'));
for (const wall of view.views) {
  wall.image = await publish(`wall-${wall.side}`,
    await sharp(`artifacts/source/wall-${wall.side}-4800.webp`).resize(2400, 600).webp({ quality: 80 }).toBuffer());
}
await fs.writeFile('src/lib/world-view.json', JSON.stringify(view, null, 2) + '\n');

// Stage board seen from the front, with the "YOUR NAME" placeholder painted in
// the board colour so the page can draw the typed name in its place.
const board = { r: 30, g: 30, b: 38 };
const patch = await sharp({ create: { width: 204, height: 36, channels: 3, background: board } }).png().toBuffer();
const stageSign = await publish('stage-sign', await sharp('artifacts/source/overview-3480.webp')
  .extract({ left: 1310, top: 370, width: 880, height: 420 })
  .composite([{ input: patch, left: 328, top: 253 }])
  .webp({ quality: 84 }).toBuffer());

// The whole in-world settings board, so visitors recognise it in VRChat
// (source: Birthday world/Captures/AtlasUrlLock_Kiosk.png). The capture was
// taken before the website address was set, so paint the fields as the live
// world shows them: the site address and the "paste the URL" status line.
const live = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1280">
  <rect x="138" y="776" width="560" height="40" fill="rgb(44,42,54)"/>
  <text x="160" y="590" font-family="Noto Sans KR, Malgun Gothic" font-size="22" fill="rgb(222,219,230)">https://hbd.snowywalk.me/</text>
  <text x="143" y="803" font-family="Noto Sans KR, Malgun Gothic" font-size="21" fill="rgb(255,212,145)">아틀라스 이미지 URL을 붙여넣으세요.</text>
</svg>`;
const painted = await sharp('artifacts/source/world-input-panel.webp')
  .composite([{ input: Buffer.from(live) }]).png().toBuffer();
// A little night sky stays around the board; the page places its highlights
// in percentages of this 992×1096 crop.
const settingsBoard = await publish('settings-board', await sharp(painted)
  .extract({ left: 44, top: 92, width: 992, height: 1096 })
  .resize(800).webp({ quality: 82 }).toBuffer());

await fs.writeFile('src/lib/assets.json', JSON.stringify({ stageSign, settingsBoard }, null, 2) + '\n');
