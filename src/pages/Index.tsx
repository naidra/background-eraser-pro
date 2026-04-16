import { useState, useCallback } from "react";
import { Download, RotateCcw, Sparkles, Shield, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import DropZone from "@/components/DropZone";
import ImageComparison from "@/components/ImageComparison";
import ProcessingOverlay from "@/components/ProcessingOverlay";
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
    <div className="min-h-screen bg-background">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-primary/5 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-20">
        {/* Header */}
        <header className="mb-12 text-center animate-fade-in">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            100% Browser-Based · No Upload Required
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
            <span className="gradient-text">Background</span>{" "}
            <span className="text-foreground">Remover</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            Remove image backgrounds instantly using OpenCV — everything runs
            locally in your browser. Your images never leave your device.
          </p>
        </header>

        {/* Main card */}
        <div
          className="glass rounded-3xl p-6 sm:p-8 animate-fade-in"
          style={{ animationDelay: "0.1s" }}
        >
          {state === "idle" && (
            <>
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
            </>
          )}

          {state === "processing" && <ProcessingOverlay />}

          {state === "done" && original && result && (
            <div className="space-y-6">
              <ImageComparison original={original} processed={result} />
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  onClick={download}
                  className="gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 px-6"
                >
                  <Download className="h-4 w-4" />
                  Download PNG
                </Button>
                <Button
                  variant="outline"
                  onClick={reset}
                  className="gap-2 rounded-xl px-6"
                >
                  <RotateCcw className="h-4 w-4" />
                  New Image
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Features */}
        <div
          className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3 animate-fade-in"
          style={{ animationDelay: "0.2s" }}
        >
          {[
            {
              icon: Shield,
              title: "Private",
              desc: "Images never leave your device",
            },
            {
              icon: Zap,
              title: "Fast",
              desc: "OpenCV GrabCut runs in milliseconds",
            },
            {
              icon: Sparkles,
              title: "Free",
              desc: "No limits, no watermarks, no sign-up",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="flex items-start gap-3 rounded-2xl bg-card/40 p-5 border border-border/40"
            >
              <div className="rounded-xl bg-secondary p-2.5">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{f.title}</p>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
