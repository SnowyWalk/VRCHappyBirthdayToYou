"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  PhotoFramingMode,
  PhotoFramingOptions,
  PhotoOrientation,
} from "@/lib/prepare-photo";

type PhotoFramingDialogProps = {
  file: File;
  onConfirm: (options: PhotoFramingOptions) => void;
  onCancel: () => void;
  busy?: boolean;
};

type SourceSize = {
  url: string;
  width: number;
  height: number;
};

export function PhotoFramingDialog({
  file,
  onConfirm,
  onCancel,
  busy = false,
}: PhotoFramingDialogProps) {
  const sourceUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const [loadedSize, setLoadedSize] = useState<SourceSize | null>(null);
  const [orientation, setOrientation] = useState<PhotoOrientation>("landscape");
  const [mode, setMode] = useState<PhotoFramingMode>("crop");
  const [position, setPosition] = useState(0.5);

  useEffect(() => {
    return () => URL.revokeObjectURL(sourceUrl);
  }, [sourceUrl]);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      setLoadedSize({ url: sourceUrl, width, height });
      setOrientation(width >= height ? "landscape" : "portrait");
    };
    image.src = sourceUrl;

    return () => {
      cancelled = true;
      image.onload = null;
      image.src = "";
    };
  }, [sourceUrl]);

  const sourceSize = loadedSize?.url === sourceUrl ? loadedSize : null;
  const targetRatio = orientation === "landscape" ? 16 / 9 : 9 / 16;
  const sourceRatio = sourceSize ? sourceSize.width / sourceSize.height : targetRatio;
  const cropAxis = sourceRatio > targetRatio ? "x" : "y";
  const objectPosition = useMemo(() => {
    if (mode !== "crop") return "center";
    const percent = `${Math.round(position * 100)}%`;
    return cropAxis === "x" ? `${percent} center` : `center ${percent}`;
  }, [cropAxis, mode, position]);

  const options = useMemo<PhotoFramingOptions>(
    () => ({ orientation, mode, position }),
    [mode, orientation, position],
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onCancel(); }}>
      <DialogContent className="photo-framing-dialog" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>사진 맞추기</DialogTitle>
          <DialogDescription>
            사진을 월드 패널 비율에 맞게 조정합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="photo-framing-layout">
          <div
            className="photo-framing-preview"
            data-orientation={orientation}
            data-mode={mode}
          >
            {sourceUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- Local blob previews cannot be optimized by next/image.
              <img
                src={sourceUrl}
                alt=""
                style={{
                  objectFit: mode === "crop" ? "cover" : "contain",
                  objectPosition,
                }}
              />
            )}
          </div>

          <div className="photo-framing-controls">
            <fieldset disabled={busy || !sourceSize}>
              <legend>방향</legend>
              <div className="photo-framing-segment" role="group" aria-label="방향">
                <button
                  type="button"
                  aria-pressed={orientation === "landscape"}
                  onClick={() => setOrientation("landscape")}
                >
                  가로
                </button>
                <button
                  type="button"
                  aria-pressed={orientation === "portrait"}
                  onClick={() => setOrientation("portrait")}
                >
                  세로
                </button>
              </div>
            </fieldset>

            <fieldset disabled={busy || !sourceSize}>
              <legend>방식</legend>
              <div className="photo-framing-segment" role="group" aria-label="방식">
                <button
                  type="button"
                  aria-pressed={mode === "crop"}
                  onClick={() => setMode("crop")}
                >
                  자르기
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "contain"}
                  onClick={() => setMode("contain")}
                >
                  여백 넣기
                </button>
              </div>
            </fieldset>

            {mode === "crop" && (
              <label className="photo-framing-slider">
                <span>위치</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={position}
                  disabled={busy || !sourceSize}
                  onChange={(event) => setPosition(Number(event.currentTarget.value))}
                />
              </label>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            취소
          </Button>
          <Button type="button" onClick={() => onConfirm(options)} disabled={busy || !sourceSize}>
            이 사진 사용
          </Button>
        </DialogFooter>
      </DialogContent>
      <style jsx global>{`
        .photo-framing-dialog {
          width: min(920px, calc(100vw - 32px));
          max-width: min(920px, calc(100vw - 32px));
          gap: 18px;
        }
        .photo-framing-layout {
          display: grid;
          grid-template-columns: minmax(360px, 1fr) 220px;
          gap: 18px;
          align-items: start;
        }
        .photo-framing-preview {
          display: grid;
          place-items: center;
          overflow: hidden;
          border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
          border-radius: 8px;
          background:
            linear-gradient(45deg, rgba(127, 127, 127, 0.14) 25%, transparent 25%),
            linear-gradient(-45deg, rgba(127, 127, 127, 0.14) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, rgba(127, 127, 127, 0.14) 75%),
            linear-gradient(-45deg, transparent 75%, rgba(127, 127, 127, 0.14) 75%);
          background-position: 0 0, 0 10px, 10px -10px, -10px 0;
          background-size: 20px 20px;
        }
        .photo-framing-preview[data-orientation="landscape"] {
          width: min(100%, calc(58vh * 16 / 9), 920px);
          aspect-ratio: 16 / 9;
        }
        .photo-framing-preview[data-orientation="portrait"] {
          width: min(100%, 360px, calc(58vh * 9 / 16));
          aspect-ratio: 9 / 16;
          justify-self: center;
        }
        .photo-framing-preview[data-mode="contain"] {
          background: #000;
        }
        .photo-framing-preview img {
          width: 100%;
          height: 100%;
          display: block;
        }
        .photo-framing-controls {
          display: grid;
          gap: 16px;
        }
        .photo-framing-controls fieldset {
          display: grid;
          gap: 8px;
          margin: 0;
          padding: 0;
          border: 0;
        }
        .photo-framing-controls legend,
        .photo-framing-slider span {
          margin-bottom: 8px;
          color: color-mix(in srgb, currentColor 72%, transparent);
          font-size: 13px;
          font-weight: 600;
        }
        .photo-framing-segment {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          padding: 4px;
          border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
          border-radius: 8px;
          background: color-mix(in srgb, currentColor 5%, transparent);
        }
        .photo-framing-segment button {
          min-height: 38px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: inherit;
          font: inherit;
          font-size: 14px;
          cursor: pointer;
        }
        .photo-framing-segment button[aria-pressed="true"] {
          background: var(--background);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
          font-weight: 700;
        }
        .photo-framing-segment button:disabled,
        .photo-framing-slider input:disabled {
          cursor: not-allowed;
        }
        .photo-framing-slider {
          display: grid;
          gap: 8px;
        }
        .photo-framing-slider input {
          width: 100%;
        }
        @media (max-width: 760px) {
          .photo-framing-layout {
            grid-template-columns: 1fr;
          }
          .photo-framing-controls {
            grid-template-columns: 1fr 1fr;
          }
          .photo-framing-slider {
            grid-column: 1 / -1;
          }
        }
        @media (max-width: 520px) {
          .photo-framing-controls {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </Dialog>
  );
}
