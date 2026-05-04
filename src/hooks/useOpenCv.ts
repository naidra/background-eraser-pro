import { useState, useEffect, useCallback, useRef } from "react";

declare global {
  interface Window {
    cv: any;
  }
}

export interface TextRegion {
  x: number;
  y: number;
  width: number;
  height: number;
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

async function urlToImage(src: string) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load the image for text detection."));
    img.src = src;
  });

  return image;
}

function mergeTextRegions(regions: TextRegion[], width: number, height: number) {
  const padding = Math.max(6, Math.round(Math.min(width, height) * 0.006));
  const padded = regions.map((region) => ({
    x: Math.max(0, region.x - padding),
    y: Math.max(0, region.y - padding),
    width: Math.min(width - Math.max(0, region.x - padding), region.width + padding * 2),
    height: Math.min(height - Math.max(0, region.y - padding), region.height + padding * 2),
  }));

  let didMerge = true;
  while (didMerge) {
    didMerge = false;

    for (let i = 0; i < padded.length; i += 1) {
      for (let j = i + 1; j < padded.length; j += 1) {
        const a = padded[i];
        const b = padded[j];
        const overlaps =
          a.x <= b.x + b.width &&
          a.x + a.width >= b.x &&
          a.y <= b.y + b.height &&
          a.y + a.height >= b.y;

        if (!overlaps) continue;

        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const right = Math.max(a.x + a.width, b.x + b.width);
        const bottom = Math.max(a.y + a.height, b.y + b.height);
        padded[i] = { x, y, width: right - x, height: bottom - y };
        padded.splice(j, 1);
        didMerge = true;
        break;
      }

      if (didMerge) break;
    }
  }

  return padded
    .map((region) => ({
      x: Math.round(region.x),
      y: Math.round(region.y),
      width: Math.round(region.width),
      height: Math.round(region.height),
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
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

  const detectTextRegions = useCallback(
    async (imageUrl: string): Promise<TextRegion[]> => {
      if (!ready || !window.cv) {
        throw new Error(error ?? "OpenCV is still loading.");
      }

      const cv = window.cv;
      const image = await urlToImage(imageUrl);
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;

      if (width < 16 || height < 16) {
        throw new Error("Please use an image that is at least 16x16 pixels.");
      }

      const { context } = drawImageToCanvas(image, width, height);
      const imageData = context.getImageData(0, 0, width, height);

      let sourceRgba: any = null;
      let gray: any = null;
      let blurred: any = null;
      let gradientX: any = null;
      let gradientAbs: any = null;
      let threshold: any = null;
      let closed: any = null;
      let dilated: any = null;
      let kernel: any = null;
      let dilationKernel: any = null;
      let contours: any = null;
      let hierarchy: any = null;

      try {
        sourceRgba = cv.matFromImageData(imageData);
        gray = new cv.Mat();
        blurred = new cv.Mat();
        gradientX = new cv.Mat();
        gradientAbs = new cv.Mat();
        threshold = new cv.Mat();
        closed = new cv.Mat();
        dilated = new cv.Mat();

        cv.cvtColor(sourceRgba, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, blurred, new cv.Size(3, 3), 0);
        cv.Sobel(blurred, gradientX, cv.CV_16S, 1, 0, 3, 1, 0, cv.BORDER_DEFAULT);
        cv.convertScaleAbs(gradientX, gradientAbs);
        cv.threshold(gradientAbs, threshold, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);

        const kernelWidth = Math.max(9, Math.round(width * 0.018));
        const kernelHeight = Math.max(3, Math.round(height * 0.006));
        kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(kernelWidth, kernelHeight));
        dilationKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));

        cv.morphologyEx(threshold, closed, cv.MORPH_CLOSE, kernel);
        cv.dilate(closed, dilated, dilationKernel, new cv.Point(-1, -1), 1);

        contours = new cv.MatVector();
        hierarchy = new cv.Mat();
        cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        const imageArea = width * height;
        const regions: TextRegion[] = [];

        for (let index = 0; index < contours.size(); index += 1) {
          const contour = contours.get(index);
          const rect = cv.boundingRect(contour);
          const area = rect.width * rect.height;
          const aspectRatio = rect.width / Math.max(rect.height, 1);

          contour.delete();

          if (rect.width < 12 || rect.height < 8) continue;
          if (area < imageArea * 0.00035 || area > imageArea * 0.55) continue;
          if (aspectRatio < 0.45 || aspectRatio > 35) continue;

          regions.push({
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          });
        }

        return mergeTextRegions(regions, width, height);
      } finally {
        if (sourceRgba) sourceRgba.delete();
        if (gray) gray.delete();
        if (blurred) blurred.delete();
        if (gradientX) gradientX.delete();
        if (gradientAbs) gradientAbs.delete();
        if (threshold) threshold.delete();
        if (closed) closed.delete();
        if (dilated) dilated.delete();
        if (kernel) kernel.delete();
        if (dilationKernel) dilationKernel.delete();
        if (contours) contours.delete();
        if (hierarchy) hierarchy.delete();
      }
    },
    [error, ready]
  );

  return { ready, loading, error, removeBackground, detectTextRegions };
}
