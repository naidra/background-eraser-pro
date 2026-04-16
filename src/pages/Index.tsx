import { useState, useCallback } from "react";
import { Download, RotateCcw, Sparkles, Shield, Zap, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import DropZone from "@/components/DropZone";
import BeforeAfterView from "@/components/BeforeAfterView";
import ProcessingOverlay from "@/components/ProcessingOverlay";
import NavBar from "@/components/NavBar";
import { useOpenCv } from "@/hooks/useOpenCv";

type AppState = "idle" | "processing" | "done";

export default function Index() {
  const { ready, loading, removeBackground } = useOpenCv();
  const [state, setState] = useState<AppState>("idle");
  const [original, setOriginal] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImage = useCallback(
    async (dataUrl: string) => {
      setOriginal(dataUrl);
      setResult(null);
      setError(null);
      setState("processing");

      try {
        const output = await removeBackground(dataUrl);
        setResult(output);
        setState("done");
      } catch (err: any) {
        setError(err.message || "Processing failed");
        setState("idle");
      }
    },
    [removeBackground]
  );

  const reset = () => {
    setState("idle");
    setOriginal(null);
    setResult(null);
    setError(null);
  };

  const download = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result;
    a.download = "background-removed.png";
    a.click();
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <NavBar />

      {/* Hero Section */}
      <section className="relative grow overflow-hidden">
        {/* Subtle background pattern */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-primary/[0.04] blur-[100px]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pt-12 pb-16 sm:px-6 lg:pt-20 lg:pb-24">
          {state === "idle" && (
            <div className="flex flex-col items-center gap-12 lg:flex-row lg:items-start lg:gap-16">
              {/* Left: Copy */}
              <div className="flex-1 text-center lg:text-left lg:pt-8">
                <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-6xl leading-[1.1]">
                  Remove Image{" "}
                  <span className="text-primary">Background</span>
                </h1>
                <p className="mt-4 text-lg text-muted-foreground sm:text-xl max-w-lg mx-auto lg:mx-0">
                  100% Automatically and{" "}
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-0.5 text-sm font-semibold text-primary">
                    Free
                  </span>
                </p>
                <p className="mt-6 text-muted-foreground max-w-md mx-auto lg:mx-0">
                  Remove backgrounds instantly using OpenCV — everything runs
                  locally in your browser. Your images never leave your device.
                </p>

                {/* Feature pills */}
                <div className="mt-8 flex flex-wrap gap-3 justify-center lg:justify-start">
                  {[
                    { icon: Shield, text: "100% Private" },
                    { icon: Zap, text: "Instant Results" },
                    { icon: Sparkles, text: "No Sign-up" },
                  ].map((f) => (
                    <div
                      key={f.text}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-4 py-2 text-sm text-muted-foreground"
                    >
                      <f.icon className="h-4 w-4 text-primary" />
                      {f.text}
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Upload Card */}
              <div className="w-full max-w-md lg:max-w-lg flex-shrink-0">
                <div className="rounded-3xl bg-card border border-border p-6 sm:p-8" style={{ boxShadow: "var(--shadow-elevated)" }}>
                  <DropZone
                    onImageSelect={handleImage}
                    disabled={!ready || loading}
                  />
                  {loading && (
                    <p className="mt-4 text-center text-sm text-muted-foreground">
                      Loading OpenCV.js engine…
                    </p>
                  )}
                  {error && (
                    <p className="mt-4 text-center text-sm text-destructive">
                      {error}
                    </p>
                  )}
                  <p className="mt-4 text-center text-xs text-muted-foreground/70">
                    Your images are processed locally and never uploaded to any server.
                  </p>
                </div>
              </div>
            </div>
          )}

          {state === "processing" && <ProcessingOverlay />}

          {state === "done" && original && result && (
            <div className="mx-auto max-w-4xl space-y-6">
              <BeforeAfterView original={original} processed={result} />
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  onClick={download}
                  size="lg"
                  className="gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 px-8 text-base font-semibold shadow-md"
                >
                  <Download className="h-5 w-5" />
                  Download PNG
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={reset}
                  className="gap-2 rounded-xl px-8 text-base"
                >
                  <RotateCcw className="h-5 w-5" />
                  New Image
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 flex flex-col items-center gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Scissors className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">BG Remover</span>
          </div>
          <p>100% browser-based · Powered by OpenCV.js · No data leaves your device</p>
        </div>
      </footer>
    </div>
  );
}
