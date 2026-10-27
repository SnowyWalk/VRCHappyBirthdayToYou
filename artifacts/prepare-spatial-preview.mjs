// Rebuilds the panel geometry in src/lib/world-view.json from the measured
// captures (artifacts/world-{left,right}.json). Images are published separately
// by artifacts/publish-images.mjs, so existing image paths are kept.
import fs from 'node:fs/promises';
const crop = { left: 0, top: 300, width: 1600, height: 400 };
const previous = JSON.parse(await fs.readFile('src/lib/world-view.json', 'utf8'));
const views = [];
for (const side of ['left', 'right']) {
  const capture = JSON.parse(await fs.readFile(`artifacts/world-${side}.json`, 'utf8'));
  const image = previous.views.find(view => view.side === side)?.image;
  views.push({ side, image, width: crop.width, height: crop.height, crop,
    landmark: { ...capture.landmark, x: capture.landmark.x - crop.left, y: capture.landmark.y - crop.top },
    panels: capture.panels.map(panel => ({ ...panel, corners: panel.corners.map(({x,y}) => ({x:x-crop.left, y:y-crop.top})) })) });
}
await fs.writeFile('src/lib/world-view.json', JSON.stringify({ views }, null, 2) + '\n');
