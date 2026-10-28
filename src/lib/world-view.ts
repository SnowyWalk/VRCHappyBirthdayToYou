import map from './world-view.json';
import { PANELS, type PanelId } from './panels';

/** The plaza seen from above (see artifacts/publish-images.mjs), with each frame's projected center. */
export const WORLD_MAP = map;

/**
 * Numbering and fill order, read like the map: the pair nearest the stage
 * first, left before right, then each pair further from the stage.
 */
export const PANEL_ORDER: readonly PanelId[] = [
  'hero-left', 'hero-right',
  'memory-left-0', 'memory-right-0',
  'memory-left-1', 'memory-right-1',
  'memory-left-2', 'memory-right-2',
];

export function panelNumber(id: PanelId) {
  return PANEL_ORDER.indexOf(id) + 1;
}

export function panelCenter(id: PanelId) {
  const objectName = PANELS.find((p) => p.id === id)!.objectName;
  const { x, y } = map.panels.find((p) => p.name === objectName)!;
  return { x, y };
}
