import { useCallback, useState, useRef } from "react";
import { Upload, Image as ImageIcon } from "lucide-react";

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
      onClick={() => !disabled && inputRef.current?.click()}
      className={`
        relative cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center
        transition-all duration-300 ease-out
        ${dragOver
          ? "border-primary bg-primary/5 scale-[1.02]"
          : "border-border hover:border-primary/50 hover:bg-card/40"
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
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="rounded-2xl bg-secondary p-4">
            <Upload className="h-8 w-8 text-primary" />
          </div>
          <div className="absolute -right-2 -top-2 rounded-lg bg-primary/20 p-1.5">
            <ImageIcon className="h-4 w-4 text-primary" />
          </div>
        </div>
        <div>
          <p className="text-lg font-semibold text-foreground">
            Drop your image here
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            or click to browse · PNG, JPG, WebP
          </p>
        </div>
      </div>
    </div>
  );
}
