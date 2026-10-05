import capture from './world-view.json';
import { type PanelId } from './panels';

export const WORLD_VIEWS = capture.views;
export const WORLD_OVERVIEW = capture.overview;
export function panelLocation(id: PanelId) {
  const side = id.includes('left') ? 'L' : 'R';
  const index = id.startsWith('hero') ? 1 : Number(id.slice(-1)) + 2;
  return `${side}${index}`;
}

// The four corners come from the same Unity camera as the background render.
// Use a projective transform so photos and click targets follow its perspective.
export function panelTransform(objectName: string) {
  const [p0, p1, p2, p3] = capture.views.flatMap(view => view.panels).find(p => p.name === objectName)!.corners;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  const denominator = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / denominator;
  const h = (dx1 * dy3 - dx3 * dy1) / denominator;
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + h * p3.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + h * p3.y;
  return `matrix3d(${[a/200, d/200, 0, g/200, b/112.5, e/112.5, 0, h/112.5, 0, 0, 1, 0, p0.x, p0.y, 0, 1].join(',')})`;
}
