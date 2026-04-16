import { Loader2 } from "lucide-react";

export default function ProcessingOverlay() {
  return (
    <div className="flex flex-col items-center gap-5 py-20">
      <div className="relative">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <span className="block animate-spin"><Loader2 className="h-8 w-8 text-primary"/></span>
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
