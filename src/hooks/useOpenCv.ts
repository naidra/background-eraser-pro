/* eslint-disable @typescript-eslint/no-explicit-any */
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

function ensureOdd(value: number) {
  return value % 2 === 0 ? value + 1 : value;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function markMaskBorder(cv: any, mask: any, borderSize: number) {
  if (borderSize <= 0) return;

  const top = mask.roi(new cv.Rect(0, 0, mask.cols, borderSize));
  const bottom = mask.roi(new cv.Rect(0, mask.rows - borderSize, mask.cols, borderSize));
  const left = mask.roi(new cv.Rect(0, 0, borderSize, mask.rows));
  const right = mask.roi(new cv.Rect(mask.cols - borderSize, 0, borderSize, mask.rows));

  top.setTo(new cv.Scalar(cv.GC_BGD));
  bottom.setTo(new cv.Scalar(cv.GC_BGD));
  left.setTo(new cv.Scalar(cv.GC_BGD));
  right.setTo(new cv.Scalar(cv.GC_BGD));

  top.delete();
  bottom.delete();
  left.delete();
  right.delete();
}

function seedGrabCutMask(cv: any, mask: any) {
  const width = mask.cols;
  const height = mask.rows;
  const shortestSide = Math.min(width, height);
  const border = Math.max(3, Math.round(shortestSide * 0.025));
  const insetX = Math.max(border * 2, Math.round(width * 0.1));
  const insetY = Math.max(border * 2, Math.round(height * 0.1));

  markMaskBorder(cv, mask, border);

  const probableForeground = new cv.Rect(
    insetX,
    insetY,
    Math.max(1, width - insetX * 2),
    Math.max(1, height - insetY * 2)
  );

  cv.rectangle(
    mask,
    new cv.Point(probableForeground.x, probableForeground.y),
    new cv.Point(
      probableForeground.x + probableForeground.width,
      probableForeground.y + probableForeground.height
    ),
    new cv.Scalar(cv.GC_PR_FGD),
    cv.FILLED
  );

  cv.ellipse(
    mask,
    new cv.Point(Math.round(width / 2), Math.round(height / 2)),
    new cv.Size(
      Math.max(8, Math.round(width * 0.22)),
      Math.max(8, Math.round(height * 0.28))
    ),
    0,
    0,
    360,
    new cv.Scalar(cv.GC_FGD),
    cv.FILLED
  );
}

function buildForegroundMask(cv: any, grabCutMask: any) {
  const foregroundMask = new cv.Mat();
  const sureForeground = new cv.Mat();
  const probableForeground = new cv.Mat();
  const ones = new cv.Mat(grabCutMask.rows, grabCutMask.cols, cv.CV_8UC1, new cv.Scalar(cv.GC_FGD));
  const threes = new cv.Mat(grabCutMask.rows, grabCutMask.cols, cv.CV_8UC1, new cv.Scalar(cv.GC_PR_FGD));

  cv.compare(grabCutMask, ones, sureForeground, cv.CMP_EQ);
  cv.compare(grabCutMask, threes, probableForeground, cv.CMP_EQ);
  cv.bitwise_or(sureForeground, probableForeground, foregroundMask);

  ones.delete();
  threes.delete();
  sureForeground.delete();
  probableForeground.delete();

  return foregroundMask;
}

function refineForegroundMask(cv: any, mask: any) {
  const shortestSide = Math.min(mask.cols, mask.rows);
  const kernelSize = clamp(ensureOdd(Math.round(shortestSide * 0.008)), 3, 9);
  const closeSize = clamp(ensureOdd(Math.round(shortestSide * 0.012)), 3, 11);
  const openKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(kernelSize, kernelSize));
  const closeKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(closeSize, closeSize));

  cv.morphologyEx(mask, mask, cv.MORPH_OPEN, openKernel);
  cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, closeKernel);

  openKernel.delete();
  closeKernel.delete();
}

function keepForegroundComponents(cv: any, mask: any) {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const cleaned = cv.Mat.zeros(mask.rows, mask.cols, cv.CV_8UC1);

  try {
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    if (contours.size() === 0) {
      mask.copyTo(cleaned);
      return cleaned;
    }

    const imageArea = mask.rows * mask.cols;
    const centerX = mask.cols / 2;
    const centerY = mask.rows / 2;
    const maxDistance = Math.hypot(centerX, centerY);
    const candidates: Array<{ index: number; area: number; score: number }> = [];
    let largestArea = 0;

    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index);
      const rect = cv.boundingRect(contour);
      const area = cv.contourArea(contour);
      const rectCenterX = rect.x + rect.width / 2;
      const rectCenterY = rect.y + rect.height / 2;
      const centerWeight = 1 - Math.min(1, Math.hypot(rectCenterX - centerX, rectCenterY - centerY) / maxDistance);
      const score = area * (0.75 + centerWeight * 0.5);

      contour.delete();

      largestArea = Math.max(largestArea, area);
      candidates.push({ index, area, score });
    }

    const minimumArea = Math.max(24, imageArea * 0.0006);
    const kept = candidates
      .filter((candidate) => (
        candidate.area >= minimumArea &&
        (candidate.area >= largestArea * 0.035 || candidate.score >= largestArea * 0.08)
      ))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    for (const candidate of kept) {
      cv.drawContours(cleaned, contours, candidate.index, new cv.Scalar(255), cv.FILLED);
    }

    return cleaned;
  } finally {
    contours.delete();
    hierarchy.delete();
  }
}

function applyEdgeAwareFeather(cv: any, mask: any, sourceRgb: any) {
  const shortestSide = Math.min(mask.cols, mask.rows);
  const kernelSize = clamp(ensureOdd(Math.round(shortestSide * 0.006)), 3, 7);
  const blurSize = clamp(ensureOdd(Math.round(shortestSide * 0.014)), 3, 13);
  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(kernelSize, kernelSize));
  const eroded = new cv.Mat();
  const dilated = new cv.Mat();
  const band = new cv.Mat();
  const blurred = new cv.Mat();
  const gray = new cv.Mat();
  const edges = new cv.Mat();

  try {
    cv.erode(mask, eroded, kernel);
    cv.dilate(mask, dilated, kernel);
    cv.subtract(dilated, eroded, band);
    cv.GaussianBlur(mask, blurred, new cv.Size(blurSize, blurSize), 0, 0, cv.BORDER_DEFAULT);
    cv.cvtColor(sourceRgb, gray, cv.COLOR_RGB2GRAY);
    cv.Canny(gray, edges, 45, 120);
    cv.dilate(edges, edges, kernel);

    const alpha = mask.clone();
    const alphaPixels = alpha.data;
    const maskPixels = mask.data;
    const bandPixels = band.data;
    const blurPixels = blurred.data;
    const edgePixels = edges.data;

    for (let index = 0; index < alphaPixels.length; index += 1) {
      if (bandPixels[index] === 0) continue;

      const hardAlpha = maskPixels[index];
      const softAlpha = blurPixels[index];
      alphaPixels[index] = edgePixels[index] > 0
        ? Math.round(hardAlpha * 0.72 + softAlpha * 0.28)
        : softAlpha;
    }

    return alpha;
  } finally {
    kernel.delete();
    eroded.delete();
    dilated.delete();
    band.delete();
    blurred.delete();
    gray.delete();
    edges.delete();
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
    script.src = `${location.href}/opencv.js`;
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
      let filteredMask: any = null;
      let fullSizeAlpha: any = null;

      try {
        sourceRgba = cv.matFromImageData(processingImageData);
        sourceRgb = new cv.Mat();
        cv.cvtColor(sourceRgba, sourceRgb, cv.COLOR_RGBA2RGB);

        grabCutMask = new cv.Mat(
          sourceRgb.rows,
          sourceRgb.cols,
          cv.CV_8UC1,
          new cv.Scalar(cv.GC_PR_BGD)
        );
        backgroundModel = new cv.Mat();
        foregroundModel = new cv.Mat();

        seedGrabCutMask(cv, grabCutMask);

        const evaluationRect = new cv.Rect(
          1,
          1,
          Math.max(1, sourceRgb.cols - 2),
          Math.max(1, sourceRgb.rows - 2)
        );

        cv.grabCut(
          sourceRgb,
          grabCutMask,
          evaluationRect,
          backgroundModel,
          foregroundModel,
          4,
          cv.GC_INIT_WITH_MASK
        );
        cv.grabCut(
          sourceRgb,
          grabCutMask,
          evaluationRect,
          backgroundModel,
          foregroundModel,
          2,
          cv.GC_EVAL
        );

        foregroundMask = buildForegroundMask(cv, grabCutMask);
        refineForegroundMask(cv, foregroundMask);
        filteredMask = keepForegroundComponents(cv, foregroundMask);
        fullSizeAlpha = applyEdgeAwareFeather(cv, filteredMask, sourceRgb);

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
        if (filteredMask) filteredMask.delete();
        if (fullSizeAlpha) fullSizeAlpha.delete();
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
