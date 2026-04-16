import { Loader2 } from "lucide-react";

export default function ProcessingOverlay() {
  return (
    <div className="flex flex-col items-center gap-5 py-16">
      <div className="relative">
        <div className="h-16 w-16 rounded-2xl bg-secondary flex items-center justify-center animate-pulse-glow">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-lg font-semibold text-foreground">Removing background…</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Processing entirely in your browser with OpenCV
        </p>
      </div>
    </div>
  );
}
