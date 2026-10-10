"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Plus, Check, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { PANELS, type PanelId } from "@/lib/panels";
import { WORLD_VIEWS, WORLD_OVERVIEW, panelLocation, panelTransform } from "@/lib/world-view";

type SceneProps = {
  photos?: Partial<Record<PanelId, string | null>>;
  orientations?: Partial<Record<PanelId, "landscape" | "portrait">>;
  onSelect?: (id: PanelId) => void;
  onRemove?: (id: PanelId) => void;
  onDropPhoto?: (id: PanelId, files: File[]) => void;
  disabled?: boolean;
  photoError?: { panel: PanelId; message: string } | null;
};

function WallView({ view, photos = {}, onSelect, onRemove, onDropPhoto, disabled, photoError }: SceneProps & { view: typeof WORLD_VIEWS[number] }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(view.width);
  const [dropTarget, setDropTarget] = useState<PanelId | null>(null);
  const left = view.side === "left";
  useEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver(() => setWidth(Math.max(element.clientWidth, 1300)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = viewport.current!;
    const center = view.landmark.x * width / view.width;
    element.scrollLeft = center - element.clientWidth / 2;
  }, [width, left, view]);
  function move(toStage: boolean) {
    const element = viewport.current!;
    const entrance = left ? 0 : element.scrollWidth - element.clientWidth;
    const stage = view.landmark.x * width / view.width - element.clientWidth / 2;
    element.scrollTo({ left: toStage ? stage : entrance,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  function showPanel() {
    const panel = view.panels.find(panel => panel.name.startsWith("Hero"))!;
    const center = panel.corners.reduce((sum, corner) => sum + corner.x, 0) / panel.corners.length;
    viewport.current!.scrollTo({ left: center * width / view.width - viewport.current!.clientWidth / 2,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  const scale = width / view.width;
  return <section className="wall-view" data-world-side={view.side} aria-label={left ? "왼쪽 패널" : "오른쪽 패널"}>
    <div className="scene-view-heading">
      <div className="wall-location">
        <div className={`wall-map ${view.side}`} aria-hidden="true">
          <Image src={WORLD_OVERVIEW.image} width={1160} height={640} alt="" unoptimized />
          <span />
        </div>
        <h3>무대를 바라본 {left ? "왼쪽" : "오른쪽"}</h3>
      </div>
      <div className="scene-navigation" aria-label={`${left ? "왼쪽" : "오른쪽"} 전경 이동`}>
        <button type="button" className="show-panel-button" onClick={showPanel}>패널 보기</button>
        <button type="button" aria-label="왼쪽으로 이동" onClick={() => move(!left)}><ChevronLeft size={15} /></button>
        <button type="button" aria-label="오른쪽으로 이동" onClick={() => move(left)}><ChevronRight size={15} /></button>
      </div>
    </div>
    {photoError?.panel.includes(view.side) && <div className="panel-error" role="alert">
      <span>{panelLocation(photoError.panel)} · {photoError.message}</span>
      <button type="button" disabled={disabled} onClick={() => onSelect?.(photoError.panel)}>다시 선택</button>
    </div>}
    <div className="scene-viewport" ref={viewport}>
      <div className="world-render" style={{ width, height: view.height * scale }}>
        <div className="world-canvas" style={{ width: view.width, height: view.height, transform: `scale(${scale})` }}>
          <Image src={view.image} alt={`${left ? "왼쪽" : "오른쪽"} 사진 패널 실제 위치`} fill priority unoptimized sizes="1400px" draggable={false} />
          {PANELS.filter(p => p.id.includes(view.side)).map(p => {
            const filled = Boolean(photos[p.id]);
            const number = PANELS.findIndex(panel => panel.id === p.id) + 1;
            const corners = view.panels.find(panel => panel.name === p.objectName)!.corners;
            const removeX = corners.reduce((sum, corner) => sum + corner.x, 0) / corners.length;
            const removeY = Math.max(...corners.map(corner => corner.y)) + 8 / scale;
            return <Fragment key={p.id}><button type="button" data-panel-id={p.id} data-world-object={p.objectName}
              className={`scene-panel ${filled ? "populated" : ""} ${dropTarget === p.id && !disabled ? "drop-target" : ""}`}
              style={{ transform: panelTransform(p.objectName) }} disabled={disabled}
              aria-label={`${number}. ${p.name}${filled ? ", 사진 설정됨" : ", 비어 있음"}`}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes("Files")) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = disabled ? "none" : "copy";
                if (!disabled) setDropTarget(p.id);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDropTarget(null);
                if (!disabled) onDropPhoto?.(p.id, Array.from(event.dataTransfer.files));
              }}
              onClick={() => onSelect?.(p.id)}>
              {filled ? <Image src={photos[p.id]!} alt="" fill unoptimized sizes="350px" draggable={false} /> : <Plus size={30} strokeWidth={2} />}
              <span className="panel-badge">{panelLocation(p.id)}</span>
              {filled && <span className="panel-filled"><Check size={16} /></span>}
            </button>
              {filled && onRemove && <button type="button" className="panel-remove" disabled={disabled}
                style={{ left: removeX, top: removeY, transform: `translateX(-50%) scale(${1 / scale})`, transformOrigin: "top center" }}
                aria-label={`${panelLocation(p.id)} 사진 제거`} onClick={() => onRemove(p.id)}><Trash2 size={16} /></button>}
            </Fragment>;
          })}
        </div>
      </div>
    </div>
  </section>;
}

export function WorldScene(props: SceneProps) {
  return <div className="world-scene" role="group" aria-label="사진 패널 번호"
    onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
    onDrop={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}>
    {WORLD_VIEWS.map(view => <WallView key={view.side} view={view} {...props} />)}
  </div>;
}
