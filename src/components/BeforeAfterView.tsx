import { useState, useRef, useCallback } from "react";
import { SlidersHorizontal, Columns2, MousePointerClick } from "lucide-react";

type ViewMode = "slider" | "side-by-side" | "toggle";

interface BeforeAfterViewProps {
  original: string;
  processed: string;
}

const checkerboard = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Crect width='20' height='20' fill='%23f0f0f0'/%3E%3Crect width='10' height='10' fill='%23e0e0e0'/%3E%3Crect x='10' y='10' width='10' height='10' fill='%23e0e0e0'/%3E%3C/svg%3E")`;

function SliderView({ original, processed }: BeforeAfterViewProps) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setPosition((x / rect.width) * 100);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-2xl border border-border select-none touch-none cursor-col-resize shadow-md"
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        updatePosition(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging.current) updatePosition(e.clientX);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
    >
      {/* Processed (right / background) */}
      <div
        className="relative w-full"
        style={{ backgroundImage: checkerboard, backgroundSize: "20px 20px" }}
      >
        <img src={processed} alt="Background removed" className="block w-full h-auto" draggable={false} />
      </div>

      {/* Original (left / clipped overlay) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <img src={original} alt="Original" className="block w-full h-auto" draggable={false} />
      </div>

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 z-10 w-[2px] -translate-x-1/2"
        style={{ left: `${position}%`, background: "hsl(var(--primary))" }}
      >
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full h-10 w-10 border-2 border-primary bg-card shadow-lg">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-primary">
            <path d="M6 4L3 9L6 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 4L15 9L12 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <span className="absolute left-3 top-3 z-20 rounded-lg bg-foreground/80 px-2.5 py-1 text-xs font-medium text-primary-foreground backdrop-blur-md">
        Before
      </span>
      <span className="absolute right-3 top-3 z-20 rounded-lg bg-foreground/80 px-2.5 py-1 text-xs font-medium text-primary-foreground backdrop-blur-md">
        After
      </span>
    </div>
  );
}

function SideBySideView({ original, processed }: BeforeAfterViewProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="relative overflow-hidden rounded-2xl border border-border shadow-sm">
        <img src={original} alt="Original" className="block w-full h-auto" />
        <span className="absolute left-3 top-3 rounded-lg bg-foreground/80 px-2.5 py-1 text-xs font-medium text-primary-foreground backdrop-blur-md">
          Before
        </span>
      </div>
      <div
        className="relative overflow-hidden rounded-2xl border border-border shadow-sm"
        style={{ backgroundImage: checkerboard, backgroundSize: "20px 20px" }}
      >
        <img src={processed} alt="Processed" className="block w-full h-auto" />
        <span className="absolute right-3 top-3 rounded-lg bg-foreground/80 px-2.5 py-1 text-xs font-medium text-primary-foreground backdrop-blur-md">
          After
        </span>
      </div>
    </div>
  );
}

function ToggleView({ original, processed }: BeforeAfterViewProps) {
  const [showOriginal, setShowOriginal] = useState(false);

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-border cursor-pointer shadow-md"
      onPointerDown={() => setShowOriginal(true)}
      onPointerUp={() => setShowOriginal(false)}
      onPointerLeave={() => setShowOriginal(false)}
    >
      <div
        className="relative w-full"
        style={{ backgroundImage: checkerboard, backgroundSize: "20px 20px" }}
      >
        <img
          src={processed}
          alt="Processed"
          className="block w-full h-auto transition-opacity duration-300"
          style={{ opacity: showOriginal ? 0 : 1 }}
          draggable={false}
        />
      </div>
      <div className="absolute inset-0">
        <img
          src={original}
          alt="Original"
          className="block w-full h-auto transition-opacity duration-300"
          style={{ opacity: showOriginal ? 1 : 0 }}
          draggable={false}
        />
      </div>
      <span className="absolute left-1/2 bottom-4 -translate-x-1/2 z-20 rounded-lg bg-foreground/80 px-3 py-1.5 text-xs font-medium text-primary-foreground backdrop-blur-md">
        {showOriginal ? "Original" : "Hold to see original"}
      </span>
    </div>
  );
}

const modes: { key: ViewMode; label: string; icon: typeof SlidersHorizontal }[] = [
  { key: "slider", label: "Slider", icon: SlidersHorizontal },
  { key: "side-by-side", label: "Side by Side", icon: Columns2 },
  { key: "toggle", label: "Hold to Compare", icon: MousePointerClick },
];

export default function BeforeAfterView({ original, processed }: BeforeAfterViewProps) {
  const [mode, setMode] = useState<ViewMode>("side-by-side");

  return (
    <div className="space-y-4">
      {/* Mode switcher */}
      <div className="flex items-center justify-center">
        <div className="inline-flex items-center gap-1 rounded-xl bg-secondary p-1 border border-border">
          {modes.map((m) => {
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`
                  flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200
                  ${active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                  }
                `}
              >
                <m.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* View */}
      <div>
        {mode === "slider" && <SliderView original={original} processed={processed} />}
        {mode === "side-by-side" && <SideBySideView original={original} processed={processed} />}
        {mode === "toggle" && <ToggleView original={original} processed={processed} />}
      </div>
    </div>
  );
}
