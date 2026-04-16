import { useCallback, useEffect, useRef, useState } from "react";
import { Brush, Eraser, Eye, EyeOff, RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type BrushMode = "keep" | "remove";
type PreviewMode = "cutout" | "overlay";

interface MaskRefinementDialogProps {
  open: boolean;
  original: string;
  processed: string;
  onApply: (nextResultUrl: string) => void;
  onOpenChange: (open: boolean) => void;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image for refinement."));
    image.src = src;
  });
}

function drawCheckerboard(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  size = 18
) {
  context.fillStyle = "#f4f4f5";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#e4e4e7";

  for (let y = 0; y < height; y += size) {
    for (let x = (Math.floor(y / size) % 2) * size; x < width; x += size * 2) {
      context.fillRect(x, y, size, size);
    }
  }
}

export default function MaskRefinementDialog({
  open,
  original,
  processed,
  onApply,
  onOpenChange,
}: MaskRefinementDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const originalImageDataRef = useRef<ImageData | null>(null);
  const maskRef = useRef<Uint8ClampedArray | null>(null);
  const initialMaskRef = useRef<Uint8ClampedArray | null>(null);
  const dimensionsRef = useRef({ width: 0, height: 0 });
  const historyRef = useRef<Uint8ClampedArray[]>([]);
  const drawingRef = useRef(false);
  const strokeStartedRef = useRef(false);

  const [brushMode, setBrushMode] = useState<BrushMode>("keep");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("overlay");
  const [brushSize, setBrushSize] = useState(36);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyDepth, setHistoryDepth] = useState(0);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);

  const renderPreview = useCallback(() => {
    const canvas = canvasRef.current;
    const originalImageData = originalImageDataRef.current;
    const mask = maskRef.current;
    const { width, height } = dimensionsRef.current;

    if (!canvas || !originalImageData || !mask || !width || !height) return;

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return;

    if (previewMode === "cutout") {
      drawCheckerboard(context, width, height);
    }

    const pixels = new Uint8ClampedArray(originalImageData.data);

    if (previewMode === "cutout") {
      for (let index = 0, alphaIndex = 3; index < mask.length; index += 1, alphaIndex += 4) {
        pixels[alphaIndex] = mask[index];
      }
    } else {
      for (let index = 0, pixelIndex = 0; index < mask.length; index += 1, pixelIndex += 4) {
        const alpha = mask[index] / 255;
        if (alpha < 0.98) {
          pixels[pixelIndex] = Math.round(pixels[pixelIndex] * alpha + 220 * (1 - alpha));
          pixels[pixelIndex + 1] = Math.round(pixels[pixelIndex + 1] * alpha + 60 * (1 - alpha));
          pixels[pixelIndex + 2] = Math.round(pixels[pixelIndex + 2] * alpha + 75 * (1 - alpha));
        }
        pixels[pixelIndex + 3] = 255;
      }
    }

    context.putImageData(new ImageData(pixels, width, height), 0, 0);
  }, [previewMode]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const prepareEditor = async () => {
      setLoading(true);
      setError(null);
      setReady(false);
      historyRef.current = [];
      setHistoryDepth(0);

      try {
        const [originalImage, processedImage] = await Promise.all([
          loadImage(original),
          loadImage(processed),
        ]);

        if (cancelled) return;

        const width = originalImage.naturalWidth || originalImage.width;
        const height = originalImage.naturalHeight || originalImage.height;
        dimensionsRef.current = { width, height };

        const originalCanvas = document.createElement("canvas");
        originalCanvas.width = width;
        originalCanvas.height = height;
        const originalContext = originalCanvas.getContext("2d", { willReadFrequently: true });
        if (!originalContext) {
          throw new Error("Could not create a canvas for refinement.");
        }
        originalContext.drawImage(originalImage, 0, 0, width, height);
        const originalImageData = originalContext.getImageData(0, 0, width, height);
        originalImageDataRef.current = originalImageData;

        const processedCanvas = document.createElement("canvas");
        processedCanvas.width = width;
        processedCanvas.height = height;
        const processedContext = processedCanvas.getContext("2d", { willReadFrequently: true });
        if (!processedContext) {
          throw new Error("Could not extract the cutout mask.");
        }
        processedContext.drawImage(processedImage, 0, 0, width, height);
        const processedImageData = processedContext.getImageData(0, 0, width, height);

        const alphaMask = new Uint8ClampedArray(width * height);
        for (let pixelIndex = 3, maskIndex = 0; pixelIndex < processedImageData.data.length; pixelIndex += 4, maskIndex += 1) {
          alphaMask[maskIndex] = processedImageData.data[pixelIndex];
        }

        maskRef.current = alphaMask;
        initialMaskRef.current = new Uint8ClampedArray(alphaMask);
        setReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to open the refinement editor.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    prepareEditor();

    return () => {
      cancelled = true;
      drawingRef.current = false;
      strokeStartedRef.current = false;
    };
  }, [open, original, processed]);

  useEffect(() => {
    if (ready) {
      renderPreview();
    }
  }, [ready, renderPreview]);

  const pushHistory = useCallback(() => {
    if (!maskRef.current) return;
    historyRef.current = [
      ...historyRef.current.slice(-11),
      new Uint8ClampedArray(maskRef.current),
    ];
    setHistoryDepth(historyRef.current.length);
  }, []);

  const getCanvasCoordinates = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const { width, height } = dimensionsRef.current;
    if (!canvas || !width || !height) return null;

    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const y = ((event.clientY - rect.top) / rect.height) * height;

    return {
      x: Math.max(0, Math.min(width - 1, x)),
      y: Math.max(0, Math.min(height - 1, y)),
    };
  }, []);

  const updateCursorPosition = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    setCursorPosition({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  }, []);

  const applyBrush = useCallback((x: number, y: number) => {
    const mask = maskRef.current;
    const { width, height } = dimensionsRef.current;
    if (!mask || !width || !height) return;

    const radius = brushSize / 2;
    const left = Math.max(0, Math.floor(x - radius));
    const right = Math.min(width - 1, Math.ceil(x + radius));
    const top = Math.max(0, Math.floor(y - radius));
    const bottom = Math.min(height - 1, Math.ceil(y + radius));

    for (let row = top; row <= bottom; row += 1) {
      for (let column = left; column <= right; column += 1) {
        const dx = column - x;
        const dy = row - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > radius) continue;

        const falloff = 1 - distance / radius;
        const strength = falloff * falloff;
        const index = row * width + column;
        const current = mask[index];

        mask[index] =
          brushMode === "keep"
            ? Math.round(current + (255 - current) * strength)
            : Math.round(current * (1 - strength));
      }
    }

    renderPreview();
  }, [brushMode, brushSize, renderPreview]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ready) return;

    const point = getCanvasCoordinates(event);
    if (!point) return;

    drawingRef.current = true;
    strokeStartedRef.current = true;
    pushHistory();
    applyBrush(point.x, point.y);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [applyBrush, getCanvasCoordinates, pushHistory, ready]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    updateCursorPosition(event);

    if (!drawingRef.current || !ready) return;

    const point = getCanvasCoordinates(event);
    if (!point) return;

    applyBrush(point.x, point.y);
  }, [applyBrush, getCanvasCoordinates, ready, updateCursorPosition]);

  const stopDrawing = useCallback(() => {
    drawingRef.current = false;
    strokeStartedRef.current = false;
  }, []);

  const handleUndo = useCallback(() => {
    const previous = historyRef.current.pop();
    if (!previous) return;

    maskRef.current = previous;
    setHistoryDepth(historyRef.current.length);
    renderPreview();
  }, [renderPreview]);

  const handleReset = useCallback(() => {
    if (!initialMaskRef.current) return;
    maskRef.current = new Uint8ClampedArray(initialMaskRef.current);
    historyRef.current = [];
    setHistoryDepth(0);
    renderPreview();
  }, [renderPreview]);

  const handleApply = useCallback(async () => {
    const originalImageData = originalImageDataRef.current;
    const mask = maskRef.current;
    const { width, height } = dimensionsRef.current;

    if (!originalImageData || !mask || !width || !height) return;

    const outputPixels = new Uint8ClampedArray(originalImageData.data);
    for (let index = 0, alphaIndex = 3; index < mask.length; index += 1, alphaIndex += 4) {
      outputPixels[alphaIndex] = mask[index];
    }

    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = width;
    outputCanvas.height = height;
    const outputContext = outputCanvas.getContext("2d");
    if (!outputContext) {
      setError("Failed to create the refined output.");
      return;
    }

    outputContext.putImageData(new ImageData(outputPixels, width, height), 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      outputCanvas.toBlob((value) => {
        if (value) {
          resolve(value);
          return;
        }

        reject(new Error("Failed to generate the refined PNG."));
      }, "image/png");
    });

    onApply(URL.createObjectURL(blob));
    onOpenChange(false);
  }, [onApply, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle>Refine Cutout</DialogTitle>
          <DialogDescription>
            Paint over missed areas to keep the subject or erase leftover background.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 p-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Brush mode</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={brushMode === "keep" ? "default" : "outline"}
                  className="gap-2"
                  onClick={() => setBrushMode("keep")}
                >
                  <Brush className="h-4 w-4" />
                  Keep
                </Button>
                <Button
                  type="button"
                  variant={brushMode === "remove" ? "default" : "outline"}
                  className="gap-2"
                  onClick={() => setBrushMode("remove")}
                >
                  <Eraser className="h-4 w-4" />
                  Remove
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                <span>Brush size</span>
                <span className="text-muted-foreground">{brushSize}px</span>
              </div>
              <input
                type="range"
                min={12}
                max={120}
                step={2}
                value={brushSize}
                onChange={(event) => setBrushSize(Number(event.target.value))}
                className="w-full accent-primary"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Preview</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={previewMode === "overlay" ? "default" : "outline"}
                  className="gap-2"
                  onClick={() => setPreviewMode("overlay")}
                >
                  <EyeOff className="h-4 w-4" />
                  Overlay
                </Button>
                <Button
                  type="button"
                  variant={previewMode === "cutout" ? "default" : "outline"}
                  className="gap-2"
                  onClick={() => setPreviewMode("cutout")}
                >
                  <Eye className="h-4 w-4" />
                  Cutout
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={historyDepth === 0}
                onClick={handleUndo}
              >
                <Undo2 className="h-4 w-4" />
                Undo
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={handleReset}
              >
                <RotateCcw className="h-4 w-4" />
                Reset mask
              </Button>
            </div>

            <div className="rounded-2xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
              Use `Keep` to paint missing subject areas back in. Use `Remove` to erase leftover background.
            </div>
          </div>

          <div className="space-y-4">
            <div
              ref={containerRef}
              className="overflow-auto rounded-3xl border border-border bg-secondary/30 p-3"
            >
              <div className="mx-auto max-w-full">
                {loading && (
                  <div className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
                    Preparing the refinement editor…
                  </div>
                )}

                {!loading && error && (
                  <div className="flex min-h-[320px] items-center justify-center text-center text-sm text-destructive">
                    {error}
                  </div>
                )}

                {!loading && !error && (
                  <div className="relative inline-block max-w-full">
                    <canvas
                      ref={canvasRef}
                      className="block h-auto max-h-[65vh] w-full touch-none rounded-2xl border border-border bg-background"
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={stopDrawing}
                      onPointerLeave={() => {
                        stopDrawing();
                        setCursorPosition(null);
                      }}
                      onPointerCancel={() => {
                        stopDrawing();
                        setCursorPosition(null);
                      }}
                      onPointerEnter={updateCursorPosition}
                    />
                    {cursorPosition && ready && (
                      <div
                        className="pointer-events-none absolute rounded-full border-2 shadow-sm"
                        style={{
                          left: cursorPosition.x,
                          top: cursorPosition.y,
                          width: `${(() => {
                            const canvas = canvasRef.current;
                            const { width } = dimensionsRef.current;
                            if (!canvas || !width) return brushSize;
                            return (brushSize / width) * canvas.getBoundingClientRect().width;
                          })()}px`,
                          height: `${(() => {
                            const canvas = canvasRef.current;
                            const { width } = dimensionsRef.current;
                            if (!canvas || !width) return brushSize;
                            return (brushSize / width) * canvas.getBoundingClientRect().width;
                          })()}px`,
                          transform: "translate(-50%, -50%)",
                          borderColor: brushMode === "keep" ? "rgb(34 197 94 / 0.95)" : "rgb(239 68 68 / 0.95)",
                          backgroundColor: brushMode === "keep" ? "rgb(34 197 94 / 0.12)" : "rgb(239 68 68 / 0.12)",
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleApply} disabled={!ready || loading || !!error}>
                Apply refinements
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
