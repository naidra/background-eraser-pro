import { useCallback, useState, useRef } from "react";
import { Upload, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DropZoneProps {
  onImageSelect: (dataUrl: string) => void;
  disabled?: boolean;
}

export default function DropZone({ onImageSelect, disabled }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) onImageSelect(e.target.result as string);
      };
      reader.readAsDataURL(file);
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
        relative flex flex-col items-center gap-5 rounded-2xl border-2 border-dashed p-10 text-center
        transition-all duration-200
        ${dragOver
          ? "border-primary bg-primary/5 scale-[1.01]"
          : "border-border hover:border-primary/40 hover:bg-secondary/50"
        }
        ${disabled ? "opacity-50 pointer-events-none" : ""}
      `}
    >
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

      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <Upload className="h-7 w-7 text-primary" />
      </div>

      <Button
        type="button"
        size="lg"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 px-8 text-base font-semibold shadow-md"
      >
        Upload Image
      </Button>

      <p className="text-sm text-muted-foreground">
        or drop a file · PNG, JPG, WebP
      </p>
    </div>
  );
}
