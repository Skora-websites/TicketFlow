"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, RotateCcw, Check } from "lucide-react";

interface AvatarCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string | null;
  onCropComplete: (croppedDataUrl: string) => void;
}

const STAGE_SIZE = 280;
const CROP_RADIUS = 110;
const CROP_DIAMETER = CROP_RADIUS * 2;
const OUTPUT_SIZE = 256;

export function AvatarCropDialog({
  open,
  onOpenChange,
  imageSrc,
  onCropComplete,
}: AvatarCropDialogProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [imgNaturalSize, setImgNaturalSize] = useState({ width: 0, height: 0 });

  const dragStartRef = useRef({ pointerX: 0, pointerY: 0, offsetX: 0, offsetY: 0 });
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Reset transform state whenever a new image is loaded
  useEffect(() => {
    if (open) {
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setIsDragging(false);
    }
  }, [open, imageSrc]);

  // Base scale covers the crop diameter so there are never empty gaps inside circle
  const baseScale =
    imgNaturalSize.width && imgNaturalSize.height
      ? Math.max(
          CROP_DIAMETER / imgNaturalSize.width,
          CROP_DIAMETER / imgNaturalSize.height
        )
      : 1;

  const currentScale = baseScale * zoom;
  const renderedWidth = imgNaturalSize.width * currentScale;
  const renderedHeight = imgNaturalSize.height * currentScale;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.pointerX;
    const dy = e.clientY - dragStartRef.current.pointerY;

    // Constrain offset so the image doesn't slide completely outside the circle
    const maxOffsetX = Math.max(0, (renderedWidth - CROP_DIAMETER) / 2) + 40;
    const maxOffsetY = Math.max(0, (renderedHeight - CROP_DIAMETER) / 2) + 40;

    const nextX = Math.min(maxOffsetX, Math.max(-maxOffsetX, dragStartRef.current.offsetX + dx));
    const nextY = Math.min(maxOffsetY, Math.max(-maxOffsetY, dragStartRef.current.offsetY + dy));

    setOffset({ x: nextX, y: nextY });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const handleApply = () => {
    if (!imgRef.current) return;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Circular clip
    const outRadius = OUTPUT_SIZE / 2;
    ctx.beginPath();
    ctx.arc(outRadius, outRadius, outRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    // Map stage coordinate system to output canvas
    const ratio = OUTPUT_SIZE / CROP_DIAMETER;
    const stageCenter = STAGE_SIZE / 2;
    const cropOrigin = stageCenter - CROP_RADIUS;

    const imgStageLeft = stageCenter + offset.x - renderedWidth / 2;
    const imgStageTop = stageCenter + offset.y - renderedHeight / 2;

    const outX = (imgStageLeft - cropOrigin) * ratio;
    const outY = (imgStageTop - cropOrigin) * ratio;
    const outW = renderedWidth * ratio;
    const outH = renderedHeight * ratio;

    ctx.drawImage(imgRef.current, outX, outY, outW, outH);

    // Prefer webp with high quality, fallback to png
    let dataUrl = "";
    try {
      dataUrl = canvas.toDataURL("image/webp", 0.9);
      if (!dataUrl.startsWith("data:image/webp")) {
        dataUrl = canvas.toDataURL("image/png");
      }
    } catch {
      dataUrl = canvas.toDataURL("image/png");
    }

    onCropComplete(dataUrl);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crop Profile Picture</DialogTitle>
          <DialogDescription>
            Drag to move and adjust zoom to fit inside the circular frame.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {/* Crop Stage Viewport */}
          <div
            className="relative overflow-hidden rounded-2xl border border-border bg-black/90 select-none cursor-grab active:cursor-grabbing shadow-inner"
            style={{ width: STAGE_SIZE, height: STAGE_SIZE, touchAction: "none" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={(e) => {
              e.preventDefault();
              setZoom((z) => Math.min(3, Math.max(1, z - e.deltaY * 0.0015)));
            }}
          >
            {/* The Image */}
            {imageSrc && (
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Crop preview"
                className="pointer-events-none absolute select-none max-w-none"
                style={{
                  width: `${renderedWidth}px`,
                  height: `${renderedHeight}px`,
                  left: `${STAGE_SIZE / 2 + offset.x - renderedWidth / 2}px`,
                  top: `${STAGE_SIZE / 2 + offset.y - renderedHeight / 2}px`,
                }}
                onLoad={(e) => {
                  const target = e.currentTarget;
                  setImgNaturalSize({
                    width: target.naturalWidth,
                    height: target.naturalHeight,
                  });
                }}
              />
            )}

            {/* SVG Circular Mask & Guide */}
            <div className="pointer-events-none absolute inset-0">
              <svg className="h-full w-full" viewBox={`0 0 ${STAGE_SIZE} ${STAGE_SIZE}`}>
                <defs>
                  <mask id="avatar-crop-mask">
                    <rect width={STAGE_SIZE} height={STAGE_SIZE} fill="white" />
                    <circle cx={STAGE_SIZE / 2} cy={STAGE_SIZE / 2} r={CROP_RADIUS} fill="black" />
                  </mask>
                </defs>
                {/* Darkened backdrop outside the circle */}
                <rect
                  width={STAGE_SIZE}
                  height={STAGE_SIZE}
                  fill="rgba(0, 0, 0, 0.65)"
                  mask="url(#avatar-crop-mask)"
                />
                {/* Circle boundary ring */}
                <circle
                  cx={STAGE_SIZE / 2}
                  cy={STAGE_SIZE / 2}
                  r={CROP_RADIUS}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.9)"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />
              </svg>
            </div>
          </div>

          {/* Zoom Slider & Reset */}
          <div className="w-full max-w-[280px] space-y-2">
            <div className="flex items-center gap-3">
              <ZoomOut className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-secondary accent-primary"
                aria-label="Zoom profile image"
              />
              <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setZoom(1);
                  setOffset({ x: 0, y: 0 });
                }}
                title="Reset position and zoom"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleApply} className="gap-1.5 font-bold">
            <Check className="h-4 w-4" />
            Apply Avatar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
