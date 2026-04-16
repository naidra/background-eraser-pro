import { useCallback, useState, useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DropZoneProps {
  onImageSelect: (file: File) => void;
  disabled?: boolean;
}

export default function DropZone({ onImageSelect, disabled }: DropZoneProps) {
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
        relative flex min-h-[360px] flex-col items-center justify-center gap-5 overflow-hidden rounded-[28px]
        border-2 border-dashed px-8 py-10 text-center transition-all duration-200
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

      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/15 bg-background shadow-sm">
        <div className="absolute inset-0 rounded-2xl bg-primary/[0.07]" />
        <Upload className="relative z-10 h-7 w-7 text-primary" />
      </div>

      <div className="space-y-2">
        <h3 className="text-xl font-semibold tracking-tight text-foreground">
          Drop your image here
        </h3>
        <p className="max-w-xs text-sm leading-6 text-muted-foreground">
          Clean, private background removal directly in your browser.
        </p>
      </div>

      <Button
        type="button"
        size="lg"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="rounded-xl bg-primary px-8 text-base font-semibold text-primary-foreground shadow-md hover:bg-primary/90"
      >
        Upload Image
      </Button>

      <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground/75">
        PNG · JPG · WebP
      </p>
    </div>
  );
}
