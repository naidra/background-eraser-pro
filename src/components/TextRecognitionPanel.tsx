import { useEffect, useMemo, useState } from "react";
import { FileText, LocateFixed, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TextRegion } from "@/hooks/useOpenCv";

interface TextRecognitionPanelProps {
  imageUrl: string;
  detectTextRegions: (imageUrl: string) => Promise<TextRegion[]>;
  onReset?: () => void;
}

interface ImageSize {
  width: number;
  height: number;
}

type TextToolStatus = "idle" | "detecting" | "reading";

const TESSERACT_ASSET_PATH = "/tesseract";
const TEXT_PREVIEW_WIDTH = 720;

export default function TextRecognitionPanel({ imageUrl, detectTextRegions, onReset }: TextRecognitionPanelProps) {
  const [regions, setRegions] = useState<TextRegion[]>([]);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [status, setStatus] = useState<TextToolStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [recognizedText, setRecognizedText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRegions([]);
    setRecognizedText("");
    setError(null);
    setProgress(0);
  }, [imageUrl]);

  const detectDisabled = status !== "idle";
  const readDisabled = status !== "idle";
  const hasText = recognizedText.trim().length > 0;

  const progressLabel = useMemo(() => {
    if (status === "detecting") return "Locating text regions...";
    if (status === "reading") {
      const percent = Math.round(progress * 100);
      return percent > 0 ? `Reading text... ${percent}%` : "Reading text...";
    }

    if (regions.length > 0) return `${regions.length} text region${regions.length === 1 ? "" : "s"} located`;
    return "No text regions located yet";
  }, [progress, regions.length, status]);

  const handleDetect = async () => {
    setStatus("detecting");
    setError(null);

    try {
      const nextRegions = await detectTextRegions(imageUrl);
      setRegions(nextRegions);
      if (nextRegions.length === 0) {
        setError("No obvious text regions were detected in this image.");
      }
    } catch (err: any) {
      setError(err.message || "Text detection failed.");
    } finally {
      setStatus("idle");
    }
  };

  const handleRead = async () => {
    setStatus("reading");
    setError(null);
    setProgress(0);

    try {
      const Tesseract = await import("tesseract.js");
      const worker = await Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, {
        workerPath: `${TESSERACT_ASSET_PATH}/worker.min.js`,
        corePath: TESSERACT_ASSET_PATH,
        langPath: `${TESSERACT_ASSET_PATH}/`,
        workerBlobURL: false,
        gzip: true,
        logger: (message) => {
          if (message.status === "recognizing text") {
            setProgress(message.progress);
          }
        },
      });

      try {
        await worker.setParameters({
          tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
          preserve_interword_spaces: "1",
        });

        const {
          data: { text },
        } = await worker.recognize(imageUrl);

        setRecognizedText(text.trim());
        if (!text.trim()) {
          setError("Tesseract did not find readable text in this image.");
        }
      } finally {
        await worker.terminate();
      }
    } catch (err: any) {
      setError(err.message || "Text reading failed.");
    } finally {
      setStatus("idle");
      setProgress(0);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Extract text</h2>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{progressLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleDetect}
            disabled={detectDisabled}
            className="h-9 gap-2 rounded-lg px-3"
          >
            {status === "detecting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
            Detect/locate text
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleRead}
            disabled={readDisabled}
            className="h-9 gap-2 rounded-lg px-3"
          >
            {status === "reading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Read text
          </Button>
          {onReset && (
            <Button
              type="button"
              variant="ghost"
              onClick={onReset}
              disabled={status !== "idle"}
              className="h-9 gap-2 rounded-lg px-3"
            >
              <RotateCcw className="h-4 w-4" />
              New image
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 grid items-start gap-3 lg:grid-cols-[minmax(0,720px)_minmax(280px,1fr)]">
        <div className="overflow-auto rounded-xl border border-border bg-secondary/35 p-2">
          <div
            className="relative mx-auto overflow-hidden rounded-lg bg-background"
            style={{ width: TEXT_PREVIEW_WIDTH, maxWidth: "100%" }}
          >
            <img
              src={imageUrl}
              alt="Original image with text detection overlay"
              className="block h-auto w-full"
              onLoad={(event) => {
                setImageSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                });
              }}
            />
            {imageSize &&
              regions.map((region, index) => (
                <div
                  key={`${region.x}-${region.y}-${region.width}-${region.height}-${index}`}
                  className="pointer-events-none absolute border-2 border-primary bg-primary/10"
                  style={{
                    left: `${(region.x / imageSize.width) * 100}%`,
                    top: `${(region.y / imageSize.height) * 100}%`,
                    width: `${(region.width / imageSize.width) * 100}%`,
                    height: `${(region.height / imageSize.height) * 100}%`,
                  }}
                />
              ))}
          </div>
        </div>

        <div className="min-h-[180px] rounded-xl border border-border bg-secondary/25 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
            Recognized text
          </div>
          {hasText ? (
            <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{recognizedText}</pre>
          ) : (
            <p className="text-sm text-muted-foreground">Use Read text to extract copy from the original image.</p>
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}
