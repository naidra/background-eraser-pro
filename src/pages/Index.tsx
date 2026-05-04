import { useState, useCallback, useEffect, useRef } from "react";
import { Download, FileText, ImageIcon, RotateCcw, Sparkles, Shield, Zap, Scissors, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DropZone from "@/components/DropZone";
import BeforeAfterView from "@/components/BeforeAfterView";
import ProcessingOverlay from "@/components/ProcessingOverlay";
import NavBar from "@/components/NavBar";
import MaskRefinementDialog from "@/components/MaskRefinementDialog";
import TextRecognitionPanel from "@/components/TextRecognitionPanel";
import { useOpenCv } from "@/hooks/useOpenCv";

type AppState = "idle" | "processing" | "done";

export default function Index() {
  const { ready, loading, error: engineError, removeBackground, detectTextRegions } = useOpenCv();
  const [state, setState] = useState<AppState>("idle");
  const [original, setOriginal] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refineOpen, setRefineOpen] = useState(false);
  const [textOriginal, setTextOriginal] = useState<string | null>(null);
  const originalUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const textOriginalUrlRef = useRef<string | null>(null);

  const clearOriginalUrl = useCallback(() => {
    if (!originalUrlRef.current) return;
    URL.revokeObjectURL(originalUrlRef.current);
    originalUrlRef.current = null;
  }, []);

  const clearResultUrl = useCallback(() => {
    if (!resultUrlRef.current) return;
    URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = null;
  }, []);

  const clearTextOriginalUrl = useCallback(() => {
    if (!textOriginalUrlRef.current) return;
    URL.revokeObjectURL(textOriginalUrlRef.current);
    textOriginalUrlRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearOriginalUrl();
      clearResultUrl();
      clearTextOriginalUrl();
    };
  }, [clearOriginalUrl, clearResultUrl, clearTextOriginalUrl]);

  const handleImage = useCallback(
    async (file: File) => {
      clearOriginalUrl();
      clearResultUrl();

      const originalUrl = URL.createObjectURL(file);
      originalUrlRef.current = originalUrl;

      setOriginal(originalUrl);
      setResult(null);
      setError(null);
      setState("processing");

      try {
        const output = await removeBackground(file);
        resultUrlRef.current = output;
        setResult(output);
        setState("done");
      } catch (err: any) {
        setError(err.message || "Processing failed");
        setState("idle");
      }
    },
    [clearOriginalUrl, clearResultUrl, removeBackground]
  );

  const reset = () => {
    clearOriginalUrl();
    clearResultUrl();
    setState("idle");
    setOriginal(null);
    setResult(null);
    setError(null);
  };

  const handleTextImage = useCallback(
    (file: File) => {
      clearTextOriginalUrl();

      const originalUrl = URL.createObjectURL(file);
      textOriginalUrlRef.current = originalUrl;
      setTextOriginal(originalUrl);
    },
    [clearTextOriginalUrl]
  );

  const resetTextImage = useCallback(() => {
    clearTextOriginalUrl();
    setTextOriginal(null);
  }, [clearTextOriginalUrl]);

  const download = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result;
    a.download = "background-removed.png";
    a.click();
  };

  const handleRefinedResult = useCallback((nextResultUrl: string) => {
    clearResultUrl();
    resultUrlRef.current = nextResultUrl;
    setResult(nextResultUrl);
  }, [clearResultUrl]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <NavBar />

      {/* Hero Section */}
      <section className="relative grow overflow-hidden">
        {/* Subtle background pattern */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-primary/[0.04] blur-[100px]" />
        </div>

        <Tabs defaultValue="bg-remover" className="relative mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-6 lg:pt-12 lg:pb-24">
          <div className="mb-6 flex justify-center">
            <TabsList className="h-10 rounded-lg border border-border bg-muted/70 p-0.5 shadow-sm">
              <TabsTrigger
                value="bg-remover"
                className="h-9 gap-1.5 rounded-md border border-transparent px-3.5 text-sm font-semibold text-muted-foreground shadow-none transition-all data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:[&>svg]:text-primary"
              >
                <ImageIcon className="h-4 w-4" />
                Bg Remover
              </TabsTrigger>
              <TabsTrigger
                value="extract-text"
                className="h-9 gap-1.5 rounded-md border border-transparent px-3.5 text-sm font-semibold text-muted-foreground shadow-none transition-all data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:[&>svg]:text-primary"
              >
                <FileText className="h-4 w-4" />
                Extract text
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="bg-remover" className="mx-auto mt-0 w-full">
            {state === "idle" && (
              <div className="flex flex-col items-center gap-12 lg:flex-row lg:items-start lg:gap-16">
                <div className="flex-1 text-center lg:text-left lg:pt-8">
                  <h1 className="text-4xl font-extrabold tracking-tight text-gray-700 sm:text-5xl lg:text-6xl leading-[1.1]">
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
                    Remove backgrounds instantly using OpenCV. The engine runs
                    locally in your browser, so your images never leave your device.
                  </p>

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

                <div className="w-full max-w-md lg:max-w-lg flex-shrink-0">
                  <div
                    className="rounded-[32px] border border-border/70 bg-card/92 p-2 backdrop-blur-sm"
                    style={{ boxShadow: "var(--shadow-elevated)" }}
                  >
                    <DropZone
                      onImageSelect={handleImage}
                      disabled={!ready || loading}
                    />
                    {loading && (
                      <p className="mt-4 text-center text-sm text-muted-foreground">
                        Loading the local OpenCV engine…
                      </p>
                    )}
                    {engineError && (
                      <p className="mt-4 text-center text-sm text-destructive">
                        {engineError}
                      </p>
                    )}
                    {error && (
                      <p className="mt-4 text-center text-sm text-destructive">
                        {error}
                      </p>
                    )}
                    <p className="mt-4 mb-1 text-center text-xs text-muted-foreground/70">
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
                <div className="rounded-2xl border border-border bg-secondary/35 px-4 py-3 text-sm text-muted-foreground">
                  Need a cleaner edge? Open the refinement brush and paint what to keep or remove.
                </div>
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
                    onClick={() => setRefineOpen(true)}
                    className="gap-2 rounded-xl px-8 text-base"
                  >
                    <WandSparkles className="h-5 w-5" />
                    Manual Erase/Restore
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
          </TabsContent>

          <TabsContent value="extract-text" className="mx-auto mt-0 w-full">
            {!textOriginal ? (
              <div className="grid w-full items-center gap-8 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="text-center lg:text-left">
                  <h1 className="text-3xl font-extrabold tracking-tight text-gray-700 sm:text-4xl">
                    Extract text from images
                  </h1>
                  <p className="mt-4 max-w-xl text-muted-foreground mx-auto lg:mx-0">
                    Locate text regions with OpenCV.js, then read the text locally with Tesseract.js when you choose.
                  </p>
                  <div className="mt-6 grid gap-3 text-left sm:grid-cols-3 lg:grid-cols-1">
                    {[
                      { label: "Local OCR", value: "Worker, wasm, and language data live in this project." },
                      { label: "Region preview", value: "Detection boxes show where text was found before reading." },
                      { label: "Private by design", value: "Images stay in the browser and are not uploaded." },
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl border border-border bg-secondary/35 p-3">
                        <div className="text-sm font-semibold text-foreground">{item.label}</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="w-full max-w-md justify-self-center lg:max-w-lg lg:justify-self-end">
                  <div
                    className="rounded-[32px] border border-border/70 bg-card/92 p-2 backdrop-blur-sm"
                    style={{ boxShadow: "var(--shadow-elevated)" }}
                  >
                    <DropZone
                      onImageSelect={handleTextImage}
                      disabled={!ready || loading}
                      title="Upload an image with text"
                      description="Use PNG, JPG, or WebP files for local text detection and OCR."
                      buttonLabel="Upload for OCR"
                    />
                    {loading && (
                      <p className="mt-4 text-center text-sm text-muted-foreground">
                        Loading the local OpenCV engine…
                      </p>
                    )}
                    {engineError && (
                      <p className="mt-4 text-center text-sm text-destructive">
                        {engineError}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full">
                <TextRecognitionPanel
                  imageUrl={textOriginal}
                  detectTextRegions={detectTextRegions}
                  onReset={resetTextImage}
                />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </section>

      {original && result && (
        <MaskRefinementDialog
          open={refineOpen}
          original={original}
          processed={result}
          onApply={handleRefinedResult}
          onOpenChange={setRefineOpen}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 flex flex-col items-center gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Scissors className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">BG Remover</span>
            <span> and </span>
            <span className="font-semibold text-foreground">Text Extractor</span>
          </div>
          <p>100% browser-based · No data leaves your device</p>
        </div>
      </footer>
    </div>
  );
}
