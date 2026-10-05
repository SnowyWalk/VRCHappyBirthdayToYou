import fs from 'node:fs/promises';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
async function publishImage(name, buffer) {
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0,12);
  const image = `/${name}-${hash}.webp`;
  await fs.writeFile(`public${image}`, buffer);
  return image;
}
const crop = { left: 0, top: 300, width: 1600, height: 400 };
const views = [];
for (const side of ['left', 'right']) {
  const capture = JSON.parse(await fs.readFile(`artifacts/world-${side}.json`, 'utf8'));
  const image = await publishImage(`world-${side}`, await sharp(`artifacts/world-${side}.png`).extract(crop).webp({ quality: 94 }).toBuffer());
  views.push({ side, image, width: crop.width, height: crop.height, crop,
    landmark: { ...capture.landmark, x: capture.landmark.x - crop.left, y: capture.landmark.y - crop.top },
    panels: capture.panels.map(panel => ({ ...panel, corners: panel.corners.map(({x,y}) => ({x:x-crop.left, y:y-crop.top})) })) });
}
const overview = {image: await publishImage('world-overview', await sharp('artifacts/world-overview-20261004.png').extract({left:220,top:180,width:1160,height:640}).webp({quality:94}).toBuffer()), width:1160,height:640};
await fs.writeFile('src/lib/world-view.json', JSON.stringify({ views, overview }, null, 2));
