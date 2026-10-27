"use client";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, X } from "lucide-react";
import { PANELS, type PanelId } from "@/lib/panels";
import { WORLD_VIEWS, panelTransform } from "@/lib/world-view";

type SceneProps = {
  photos: Partial<Record<PanelId, string | null>>;
  onSelect: (id: PanelId) => void;
  onRemove: (id: PanelId) => void;
  onDropPhoto: (id: PanelId, files: File[]) => void;
  disabled?: boolean;
  photoError?: { panel: PanelId; message: string } | null;
};

type View = (typeof WORLD_VIEWS)[number];

// Below this container width the whole wall is too small to tap, so the view
// zooms into the panel area and adds a row of large numbered buttons.
const COMPACT_WIDTH = 720;

function centerOf(corners: { x: number; y: number }[]) {
  return {
    x: corners.reduce((sum, c) => sum + c.x, 0) / corners.length,
    y: corners.reduce((sum, c) => sum + c.y, 0) / corners.length,
  };
}

/** Panels of one wall in on-screen (left to right) order, numbered across both walls. */
function wallPanels(view: View) {
  const offset = view.side === "left" ? 0 : 4;
  return PANELS.filter((p) => p.id.includes(view.side))
    .map((p) => {
      const corners = view.panels.find((panel) => panel.name === p.objectName)!.corners;
      return { ...p, corners, center: centerOf(corners) };
    })
    .sort((a, b) => a.center.x - b.center.x)
    .map((p, index) => ({ ...p, number: offset + index + 1 }));
}

function panelCrop(view: View) {
  const xs = view.panels.flatMap((p) => p.corners.map((c) => c.x));
  const ys = view.panels.flatMap((p) => p.corners.map((c) => c.y));
  const left = Math.max(0, Math.min(...xs) - 24);
  const right = Math.min(view.width, Math.max(...xs) + 24);
  const top = Math.max(0, Math.min(...ys) - 20);
  const bottom = Math.min(view.height, Math.max(...ys) + 20);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function dropHandlers(id: PanelId, props: SceneProps, setTarget: (id: PanelId | null) => void) {
  return {
    onDragOver(event: React.DragEvent) {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = props.disabled ? "none" : "copy";
      if (!props.disabled) setTarget(id);
    },
    onDragLeave(event: React.DragEvent) {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTarget(null);
    },
    onDrop(event: React.DragEvent) {
      event.preventDefault();
      setTarget(null);
      if (!props.disabled) props.onDropPhoto(id, Array.from(event.dataTransfer.files));
    },
  };
}

function WallView({ view, ...props }: SceneProps & { view: View }) {
  const frame = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const [dropTarget, setDropTarget] = useState<PanelId | null>(null);
  useLayoutEffect(() => {
    const element = frame.current!;
    setFrameWidth(element.clientWidth);
    const observer = new ResizeObserver(() => setFrameWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const compact = frameWidth > 0 && frameWidth < COMPACT_WIDTH;
  const crop = compact ? panelCrop(view) : { x: 0, y: 0, width: view.width, height: view.height };
  const scale = frameWidth ? frameWidth / crop.width : 0;
  const panels = wallPanels(view);
  const { photos, onSelect, onRemove, disabled, photoError } = props;
  const sideLabel = view.side === "left" ? "왼쪽" : "오른쪽";

  return (
    <section className="wall" data-world-side={view.side} data-compact={compact || undefined} aria-label={`${sideLabel} 벽`}>
      <div className="wall-frame" ref={frame} style={{ aspectRatio: `${crop.width} / ${crop.height}` }}>
        {scale > 0 && (
          <div
            className="wall-canvas"
            style={{
              width: view.width,
              height: view.height,
              transform: `translate(${-crop.x * scale}px, ${-crop.y * scale}px) scale(${scale})`,
            }}
          >
            <Image src={view.image} alt={`월드 ${sideLabel} 벽의 사진 패널`} fill priority unoptimized sizes="1200px" draggable={false} />
            {panels.map((p) => {
              const photo = photos[p.id];
              const maxY = Math.max(...p.corners.map((c) => c.y));
              return (
                <Fragment key={p.id}>
                  <button
                    type="button"
                    className={`panel ${photo ? "filled" : ""} ${dropTarget === p.id ? "drop" : ""}`}
                    style={{ transform: panelTransform(p.objectName) }}
                    data-panel-id={p.id}
                    data-world-object={p.objectName}
                    disabled={disabled}
                    aria-label={`사진 ${p.number} ${photo ? "바꾸기" : "넣기"}`}
                    // In compact mode the numbered slots below are the accessible controls.
                    tabIndex={compact ? -1 : undefined}
                    aria-hidden={compact || undefined}
                    onClick={() => onSelect(p.id)}
                    {...dropHandlers(p.id, props, setDropTarget)}
                  >
                    {photo ? (
                      <Image src={photo} alt="" fill unoptimized sizes="400px" draggable={false} />
                    ) : (
                      <ImagePlus className="panel-plus" strokeWidth={1.6} />
                    )}
                  </button>
                  {compact && (
                    <span
                      className="panel-badge"
                      aria-hidden="true"
                      style={{ left: p.center.x, top: p.center.y, transform: `translate(-50%, -50%) scale(${1 / scale})` }}
                    >
                      {p.number}
                    </span>
                  )}
                  {!compact && photo && (
                    <button
                      type="button"
                      className="panel-remove"
                      disabled={disabled}
                      style={{ left: p.center.x, top: maxY + 6 / scale, transform: `translateX(-50%) scale(${1 / scale})` }}
                      aria-label={`사진 ${p.number} 빼기`}
                      onClick={() => onRemove(p.id)}
                    >
                      <X size={14} strokeWidth={2.5} /> 빼기
                    </button>
                  )}
                </Fragment>
              );
            })}
          </div>
        )}
      </div>
      {compact && (
        <ul className="slot-row">
          {panels.map((p) => {
            const photo = photos[p.id];
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={`slot ${photo ? "filled" : ""} ${dropTarget === p.id ? "drop" : ""}`}
                  data-panel-id={p.id}
                  disabled={disabled}
                  aria-label={`사진 ${p.number} ${photo ? "바꾸기" : "넣기"}`}
                  onClick={() => onSelect(p.id)}
                  {...dropHandlers(p.id, props, setDropTarget)}
                >
                  {photo ? (
                    <Image src={photo} alt="" fill unoptimized sizes="160px" draggable={false} />
                  ) : (
                    <ImagePlus className="panel-plus" strokeWidth={1.6} />
                  )}
                  <span className="slot-number" aria-hidden="true">{p.number}</span>
                </button>
                {photo && (
                  <button
                    type="button"
                    className="slot-remove"
                    disabled={disabled}
                    aria-label={`사진 ${p.number} 빼기`}
                    onClick={() => onRemove(p.id)}
                  >
                    <X size={14} strokeWidth={2.5} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {photoError && photoError.panel.includes(view.side) && (
        <div className="panel-error" role="alert">
          <span>
            사진 {panels.find((p) => p.id === photoError.panel)?.number} · {photoError.message}
          </span>
          <button type="button" disabled={disabled} onClick={() => onSelect(photoError.panel)}>
            다른 사진 고르기
          </button>
        </div>
      )}
    </section>
  );
}

export function WorldScene(props: SceneProps) {
  return (
    <div
      className="world-scene"
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
      onDrop={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
    >
      {WORLD_VIEWS.map((view) => (
        <WallView key={view.side} view={view} {...props} />
      ))}
    </div>
  );
}
