"use client";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, X } from "lucide-react";
import { type PanelId } from "@/lib/panels";
import { PANEL_ORDER, WORLD_MAP, panelCenter } from "@/lib/world-view";

type SceneProps = {
  photos: Partial<Record<PanelId, string | null>>;
  onSelect: (id: PanelId) => void;
  onRemove: (id: PanelId) => void;
  onDropPhoto: (id: PanelId, files: File[]) => void;
  disabled?: boolean;
  photoError?: { panel: PanelId; message: string } | null;
};

// Below this width the cards on the map are too small to tap, so the map
// becomes a guide and a grid of large numbered slots (same two columns) takes over.
const COMPACT_WIDTH = 640;
// In the world a frame is at most 3.6 m wide and 3.45 m tall: landscape photos
// fill the width, portrait photos the height (BirthdayGallerySetup.MaxSize).
const PORTRAIT_HEIGHT = WORLD_MAP.card.width * 3.45 / 3.6;

const panels = PANEL_ORDER.map((id, index) => ({ id, number: index + 1, ...panelCenter(id) }));

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

/** Photo shown in its own direction, like the frame in the world resizes to it. */
function useOrientation() {
  const [portrait, setPortrait] = useState<Record<string, boolean>>({});
  return {
    isPortrait: (src: string | null | undefined) => Boolean(src && portrait[src]),
    onLoad: (event: React.SyntheticEvent<HTMLImageElement>) => {
      const img = event.currentTarget;
      const src = img.getAttribute("src")!;
      const value = img.naturalHeight > img.naturalWidth;
      setPortrait((prev) => (prev[src] === value ? prev : { ...prev, [src]: value }));
    },
  };
}

export function WorldScene(props: SceneProps) {
  const frame = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const [dropTarget, setDropTarget] = useState<PanelId | null>(null);
  const orientation = useOrientation();
  useLayoutEffect(() => {
    const element = frame.current!;
    setFrameWidth(element.clientWidth);
    const observer = new ResizeObserver(() => setFrameWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const compact = frameWidth > 0 && frameWidth < COMPACT_WIDTH;
  const scale = frameWidth ? frameWidth / WORLD_MAP.width : 0;
  const { photos, onSelect, onRemove, disabled, photoError } = props;
  const { width: cardWidth, height: cardHeight } = WORLD_MAP.card;

  return (
    <div
      className="world-scene"
      data-compact={compact || undefined}
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
      onDrop={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
    >
      <div className="map-frame" ref={frame} style={{ aspectRatio: `${WORLD_MAP.width} / ${WORLD_MAP.height}` }}>
        {scale > 0 && (
          <div className="map-canvas" style={{ width: WORLD_MAP.width, height: WORLD_MAP.height, transform: `scale(${scale})` }}>
            <Image src={WORLD_MAP.image} alt="위에서 내려다본 월드 광장. 위쪽이 무대이고 양쪽 벽에 액자가 4개씩 있어요."
              fill priority unoptimized sizes="1000px" draggable={false} />
            {panels.map((p) => {
              const photo = photos[p.id];
              const portrait = orientation.isPortrait(photo);
              const width = portrait ? PORTRAIT_HEIGHT * 9 / 16 : cardWidth;
              const height = portrait ? PORTRAIT_HEIGHT : cardHeight;
              return (
                <Fragment key={p.id}>
                  <button
                    type="button"
                    className={`panel ${photo ? "filled" : ""} ${dropTarget === p.id ? "drop" : ""}`}
                    style={{ left: p.x - width / 2, top: p.y - height / 2, width, height }}
                    data-panel-id={p.id}
                    disabled={disabled}
                    aria-label={`사진 ${p.number} ${photo ? "바꾸기" : "넣기"}`}
                    // In compact mode the numbered slots below are the controls.
                    tabIndex={compact ? -1 : undefined}
                    aria-hidden={compact || undefined}
                    onClick={() => onSelect(p.id)}
                    {...dropHandlers(p.id, props, setDropTarget)}
                  >
                    {photo ? (
                      <Image src={photo} alt="" fill unoptimized sizes="400px" draggable={false} onLoad={orientation.onLoad} />
                    ) : (
                      <ImagePlus className="panel-plus" strokeWidth={1.6} style={{ transform: `scale(${1 / scale})` }} />
                    )}
                    <span className="panel-number" aria-hidden="true" style={{ transform: `scale(${1 / scale})` }}>{p.number}</span>
                  </button>
                  {!compact && photo && (
                    <button
                      type="button"
                      className="panel-remove"
                      disabled={disabled}
                      style={{ left: p.x + width / 2, top: p.y - height / 2, transform: `scale(${1 / scale}) translate(-50%, -50%)` }}
                      aria-label={`사진 ${p.number} 빼기`}
                      title="빼기"
                      onClick={() => onRemove(p.id)}
                    >
                      <X size={16} strokeWidth={2.5} />
                    </button>
                  )}
                </Fragment>
              );
            })}
          </div>
        )}
      </div>
      {compact && (
        <ul className="slot-grid">
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
                    <Image src={photo} alt="" fill unoptimized sizes="200px" draggable={false} onLoad={orientation.onLoad} />
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
      {photoError && (
        <div className="panel-error" role="alert">
          <span>사진 {panels.find((p) => p.id === photoError.panel)?.number} · {photoError.message}</span>
          <button type="button" disabled={disabled} onClick={() => onSelect(photoError.panel)}>
            다른 사진 고르기
          </button>
        </div>
      )}
    </div>
  );
}
