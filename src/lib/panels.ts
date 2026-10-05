export const PANELS = [
  {
    id: "hero-left",
    atlasId: 0,
    name: "대표 사진 · 왼쪽",
    kind: "portrait",
    objectName: "Hero portrait -1",
  },
  {
    id: "hero-right",
    atlasId: 4,
    name: "대표 사진 · 오른쪽",
    kind: "portrait",
    objectName: "Hero portrait 1",
  },
  {
    id: "memory-left-0",
    atlasId: 1,
    name: "갤러리 · 왼쪽 01",
    kind: "landscape",
    objectName: "Memory -1 0",
  },
  {
    id: "memory-left-1",
    atlasId: 2,
    name: "갤러리 · 왼쪽 02",
    kind: "landscape",
    objectName: "Memory -1 1",
  },
  {
    id: "memory-left-2",
    atlasId: 3,
    name: "갤러리 · 왼쪽 03",
    kind: "landscape",
    objectName: "Memory -1 2",
  },
  {
    id: "memory-right-0",
    atlasId: 5,
    name: "갤러리 · 오른쪽 01",
    kind: "landscape",
    objectName: "Memory 1 0",
  },
  {
    id: "memory-right-1",
    atlasId: 6,
    name: "갤러리 · 오른쪽 02",
    kind: "landscape",
    objectName: "Memory 1 1",
  },
  {
    id: "memory-right-2",
    atlasId: 7,
    name: "갤러리 · 오른쪽 03",
    kind: "landscape",
    objectName: "Memory 1 2",
  },
] as const;
export type PanelId = (typeof PANELS)[number]["id"];
export type Album = {
  id: string;
  nickname: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  atlasId?: string;
  panelOrientations?: Partial<Record<PanelId, "landscape" | "portrait">>;
  panels: Record<PanelId, string | null>;
};
