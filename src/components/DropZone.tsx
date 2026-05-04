import { useCallback, useState, useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DropZoneProps {
  onImageSelect: (file: File) => void;
  disabled?: boolean;
  title?: string;
  description?: string;
  buttonLabel?: string;
  compact?: boolean;
}

export default function DropZone({
  onImageSelect,
  disabled,
  title = "Drop your image here",
  description = "Clean, private background removal directly in your browser.",
  buttonLabel = "Upload Image",
  compact = false,
}: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      onImageSelect(file);
    },
    [onImageSelect]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile, disabled]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`
        relative flex flex-col items-center justify-center overflow-hidden rounded-[28px]
        border-2 border-dashed px-8 text-center transition-all duration-200
        ${compact ? "min-h-[260px] gap-4 py-7" : "min-h-[360px] gap-5 py-10"}
        ${dragOver
          ? "border-primary bg-primary/[0.08] shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.18)] scale-[1.01]"
          : "border-border/80 bg-gradient-to-b from-background to-secondary/55 hover:border-primary/40 hover:bg-secondary/70"
        }
        ${disabled ? "opacity-50 pointer-events-none" : ""}
      `}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/[0.06] to-transparent" />

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      <div className={`relative flex items-center justify-center rounded-2xl border border-primary/15 bg-background shadow-sm ${compact ? "h-12 w-12" : "h-16 w-16"}`}>
        <div className="absolute inset-0 rounded-2xl bg-primary/[0.07]" />
        <Upload className={`relative z-10 text-primary ${compact ? "h-5 w-5" : "h-7 w-7"}`} />
      </div>

      <div className="space-y-2">
        <h3 className={`${compact ? "text-lg" : "text-xl"} font-semibold tracking-tight text-foreground`}>
          {title}
        </h3>
        <p className="max-w-xs text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>

      <Button
        type="button"
        size="lg"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className={`rounded-xl bg-primary font-semibold text-primary-foreground shadow-md hover:bg-primary/90 ${compact ? "px-6" : "px-8 text-base"}`}
      >
        {buttonLabel}
      </Button>

      <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground/75">
        PNG · JPG · WebP
      </p>
    </div>
  );
}
