"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Plus, Check, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { PANELS, type PanelId } from "@/lib/panels";
import { WORLD_VIEWS, panelLocation, panelTransform } from "@/lib/world-view";

type SceneProps = {
  photos?: Partial<Record<PanelId, string | null>>;
  orientations?: Partial<Record<PanelId, "landscape" | "portrait">>;
  onSelect?: (id: PanelId) => void;
  onRemove?: (id: PanelId) => void;
  onDropPhoto?: (id: PanelId, files: File[]) => void;
  disabled?: boolean;
};

function WallView({ view, photos = {}, onSelect, onRemove, onDropPhoto, disabled }: SceneProps & { view: typeof WORLD_VIEWS[number] }) {
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
  const scale = width / view.width;
  return <section className="wall-view" data-world-side={view.side} aria-label={left ? "왼쪽 패널" : "오른쪽 패널"}>
    <div className="scene-view-heading">
      <h3>{left ? "왼쪽" : "오른쪽"}</h3>
      <div className="scene-navigation" aria-label={`${left ? "왼쪽" : "오른쪽"} 전경 이동`}>
        <button type="button" aria-label="왼쪽으로 이동" onClick={() => move(!left)}><ChevronLeft size={15} /></button>
        <button type="button" aria-label="오른쪽으로 이동" onClick={() => move(left)}><ChevronRight size={15} /></button>
      </div>
    </div>
    <div className="scene-viewport" ref={viewport}>
      <div className="world-render" style={{ width, height: view.height * scale }}>
        <div className="world-canvas" style={{ width: view.width, height: view.height, transform: `scale(${scale})` }}>
          <Image src={view.image} alt={`${left ? "왼쪽" : "오른쪽"} 사진 패널 실제 위치`} fill priority sizes="1400px" draggable={false} />
          {PANELS.filter(p => p.id.includes(view.side)).map(p => {
            const filled = Boolean(photos[p.id]);
            const number = PANELS.findIndex(panel => panel.id === p.id) + 1;
            const corner = view.panels.find(panel => panel.name === p.objectName)!.corners[2];
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
                style={{ left: corner.x, top: corner.y, transform: `translate(-100%, -100%) scale(${1 / scale})`, transformOrigin: "bottom right" }}
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
