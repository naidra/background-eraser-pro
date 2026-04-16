import { useState, useEffect, useCallback, useRef } from "react";

declare global {
  interface Window {
    cv: any;
  }
}

function waitForCvReady(onReady: (cv: any) => void, onError: (message: string) => void) {
  let settled = false;

  const succeed = (cv: any) => {
    if (settled) return;
    if (!cv || !cv.Mat) return;
    settled = true;
    window.clearInterval(intervalId);
    window.clearTimeout(timeoutId);
    onReady(cv);
  };

  const fail = (message: string) => {
    if (settled) return;
    settled = true;
    window.clearInterval(intervalId);
    window.clearTimeout(timeoutId);
    onError(message);
  };

  const intervalId = window.setInterval(() => {
    succeed(window.cv);
  }, 100);

  const timeoutId = window.setTimeout(() => {
    fail("Timed out while loading the local OpenCV engine.");
  }, 15000);

  if (window.cv && typeof window.cv.then === "function") {
    try {
      window.cv.then((cv: any) => {
        succeed(cv ?? window.cv);
      });
    } catch {
      fail("Failed to initialize the local OpenCV engine.");
    }
  }

  succeed(window.cv);
}

function drawImageToCanvas(image: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Your browser could not create a canvas context.");
  }

  context.drawImage(image, 0, 0, width, height);
  return { canvas, context };
}

async function fileToImage(file: Blob) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load the selected image."));
      img.src = objectUrl;
    });

    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function useOpenCv() {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadAttempted = useRef(false);

  useEffect(() => {
    if (loadAttempted.current) return;
    loadAttempted.current = true;

    if (window.cv && window.cv.Mat) {
      setReady(true);
      setLoading(false);
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-opencv-local="true"]');

    const finish = (cv: any) => {
      if (cv && cv.Mat) {
        setReady(true);
        setLoading(false);
        setError(null);
        return;
      }

      setReady(false);
      setLoading(false);
      setError("OpenCV loaded but never became ready.");
    };

    const fail = () => {
      setReady(false);
      setLoading(false);
      setError("Failed to load the local OpenCV engine.");
    };

    const handleReadyError = (message: string) => {
      setReady(false);
      setLoading(false);
      setError(message);
    };

    if (existingScript) {
      waitForCvReady(finish, handleReadyError);
      return;
    }

    const script = document.createElement("script");
    script.src = "/opencv.js";
    script.async = true;
    script.dataset.opencvLocal = "true";

    script.onload = () => {
      waitForCvReady(finish, handleReadyError);
    };

    script.onerror = fail;
    document.head.appendChild(script);
  }, []);

  const removeBackground = useCallback(
    async (imageFile: Blob): Promise<string> => {
      if (!ready || !window.cv) {
        throw new Error(error ?? "OpenCV is still loading.");
      }

      const cv = window.cv;
      const image = await fileToImage(imageFile);
      const width = image.width;
      const height = image.height;

      if (width < 16 || height < 16) {
        throw new Error("Please use an image that is at least 16x16 pixels.");
      }

      const { context: originalContext } = drawImageToCanvas(image, width, height);
      const originalImageData = originalContext.getImageData(0, 0, width, height);
      const processingImageData = originalImageData;

      let sourceRgba: any = null;
      let sourceRgb: any = null;
      let grabCutMask: any = null;
      let backgroundModel: any = null;
      let foregroundModel: any = null;
      let foregroundMask: any = null;
      let fullSizeAlpha: any = null;

      try {
        sourceRgba = cv.matFromImageData(processingImageData);
        sourceRgb = new cv.Mat();
        cv.cvtColor(sourceRgba, sourceRgb, cv.COLOR_RGBA2RGB);

        grabCutMask = new cv.Mat();
        backgroundModel = new cv.Mat();
        foregroundModel = new cv.Mat();

        const margin = Math.max(Math.round(Math.min(width, height) * 0.02), 4);
        const rect = new cv.Rect(
          margin,
          margin,
          Math.max(1, width - margin * 2),
          Math.max(1, height - margin * 2)
        );

        cv.grabCut(sourceRgb, grabCutMask, rect, backgroundModel, foregroundModel, 5, cv.GC_INIT_WITH_RECT);

        foregroundMask = new cv.Mat();
        const sureForeground = new cv.Mat();
        const probableForeground = new cv.Mat();
        const ones = new cv.Mat(grabCutMask.rows, grabCutMask.cols, cv.CV_8UC1, new cv.Scalar(1));
        const threes = new cv.Mat(grabCutMask.rows, grabCutMask.cols, cv.CV_8UC1, new cv.Scalar(3));

        cv.compare(grabCutMask, ones, sureForeground, cv.CMP_EQ);
        cv.compare(grabCutMask, threes, probableForeground, cv.CMP_EQ);
        cv.bitwise_or(sureForeground, probableForeground, foregroundMask);

        sureForeground.delete();
        probableForeground.delete();
        ones.delete();
        threes.delete();

        fullSizeAlpha = foregroundMask;

        const outputPixels = new Uint8ClampedArray(originalImageData.data);
        const alphaPixels = fullSizeAlpha.data;

        for (let index = 0, alphaIndex = 3; index < alphaPixels.length; index += 1, alphaIndex += 4) {
          outputPixels[alphaIndex] = alphaPixels[index];
        }

        const outputCanvas = document.createElement("canvas");
        outputCanvas.width = width;
        outputCanvas.height = height;

        const outputContext = outputCanvas.getContext("2d");
        if (!outputContext) {
          throw new Error("Your browser could not create an output canvas.");
        }

        outputContext.putImageData(new ImageData(outputPixels, width, height), 0, 0);

        const blob = await new Promise<Blob>((resolve, reject) => {
          outputCanvas.toBlob((value) => {
            if (value) {
              resolve(value);
              return;
            }

            reject(new Error("Failed to create the output image."));
          }, "image/png");
        });

        return URL.createObjectURL(blob);
      } finally {
        if (sourceRgba) sourceRgba.delete();
        if (sourceRgb) sourceRgb.delete();
        if (grabCutMask) grabCutMask.delete();
        if (backgroundModel) backgroundModel.delete();
        if (foregroundModel) foregroundModel.delete();
        if (foregroundMask) foregroundMask.delete();
      }
    },
    [error, ready]
  );

  return { ready, loading, error, removeBackground };
}
