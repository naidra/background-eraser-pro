"use strict";

let cvReadyPromise = null;

function postInitError(error) {
  self.postMessage({
    type: "init-error",
    message: error instanceof Error ? error.message : "Failed to initialize OpenCV.",
  });
}

function ensureOdd(value) {
  return value % 2 === 0 ? value + 1 : value;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function markBorder(cv, mask, borderSize) {
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

function seedMask(cv, mask) {
  const width = mask.cols;
  const height = mask.rows;
  const shortestSide = Math.min(width, height);
  const border = Math.max(3, Math.round(shortestSide * 0.025));
  const insetX = Math.max(border * 2, Math.round(width * 0.1));
  const insetY = Math.max(border * 2, Math.round(height * 0.1));

  markBorder(cv, mask, border);

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

function buildForegroundMask(cv, grabCutMask) {
  const foregroundMask = new cv.Mat();
  const sureForeground = new cv.Mat();
  const probableForeground = new cv.Mat();
  const ones = new cv.Mat(grabCutMask.rows, grabCutMask.cols, cv.CV_8UC1, new cv.Scalar(1));
  const threes = new cv.Mat(grabCutMask.rows, grabCutMask.cols, cv.CV_8UC1, new cv.Scalar(3));

  cv.compare(grabCutMask, ones, sureForeground, cv.CMP_EQ);
  cv.compare(grabCutMask, threes, probableForeground, cv.CMP_EQ);
  cv.bitwise_or(sureForeground, probableForeground, foregroundMask);

  ones.delete();
  threes.delete();
  sureForeground.delete();
  probableForeground.delete();

  return foregroundMask;
}

function refineMask(cv, mask) {
  const shortestSide = Math.min(mask.cols, mask.rows);
  const kernelSize = clamp(ensureOdd(Math.round(shortestSide * 0.01)), 3, 9);
  const blurSize = clamp(ensureOdd(Math.round(shortestSide * 0.015)), 3, 11);
  const kernel = cv.getStructuringElement(
    cv.MORPH_ELLIPSE,
    new cv.Size(kernelSize, kernelSize)
  );

  cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
  cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
  cv.GaussianBlur(mask, mask, new cv.Size(blurSize, blurSize), 0, 0, cv.BORDER_DEFAULT);

  kernel.delete();
}

function drawBitmapToCanvas(bitmap, width, height) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, width, height);
  return { canvas, context };
}

async function processImage(imageFile) {
  const cv = await loadOpenCv();
  const bitmap = await createImageBitmap(imageFile);
  const width = bitmap.width;
  const height = bitmap.height;

  if (width < 16 || height < 16) {
    bitmap.close();
    throw new Error("Please use an image that is at least 16x16 pixels.");
  }

  const maxProcessingDimension = 1400;
  const scale = Math.min(1, maxProcessingDimension / Math.max(width, height));
  const processingWidth = Math.max(1, Math.round(width * scale));
  const processingHeight = Math.max(1, Math.round(height * scale));

  const { context: originalContext } = drawBitmapToCanvas(bitmap, width, height);
  const originalImageData = originalContext.getImageData(0, 0, width, height);

  const processingCanvas = scale < 1
    ? drawBitmapToCanvas(bitmap, processingWidth, processingHeight)
    : { context: originalContext };
  const processingImageData = processingCanvas.context.getImageData(
    0,
    0,
    processingWidth,
    processingHeight
  );

  bitmap.close();

  let sourceRgba = null;
  let sourceRgb = null;
  let grabCutMask = null;
  let backgroundModel = null;
  let foregroundModel = null;
  let foregroundMask = null;
  let fullSizeAlpha = null;

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

    seedMask(cv, grabCutMask);

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
    refineMask(cv, foregroundMask);

    if (scale < 1) {
      fullSizeAlpha = new cv.Mat();
      cv.resize(
        foregroundMask,
        fullSizeAlpha,
        new cv.Size(width, height),
        0,
        0,
        cv.INTER_LINEAR
      );
    } else {
      fullSizeAlpha = foregroundMask.clone();
    }

    const outputPixels = new Uint8ClampedArray(originalImageData.data);
    const alphaPixels = fullSizeAlpha.data;

    for (let index = 0, alphaIndex = 3; index < alphaPixels.length; index += 1, alphaIndex += 4) {
      outputPixels[alphaIndex] = alphaPixels[index];
    }

    const outputCanvas = new OffscreenCanvas(width, height);
    const outputContext = outputCanvas.getContext("2d");
    outputContext.putImageData(new ImageData(outputPixels, width, height), 0, 0);

    return await outputCanvas.convertToBlob({ type: "image/png" });
  } finally {
    if (sourceRgba) sourceRgba.delete();
    if (sourceRgb) sourceRgb.delete();
    if (grabCutMask) grabCutMask.delete();
    if (backgroundModel) backgroundModel.delete();
    if (foregroundModel) foregroundModel.delete();
    if (foregroundMask) foregroundMask.delete();
    if (fullSizeAlpha) fullSizeAlpha.delete();
  }
}

function loadOpenCv() {
  if (cvReadyPromise) return cvReadyPromise;

  cvReadyPromise = new Promise((resolve, reject) => {
    try {
      importScripts("opencv.js");
    } catch (error) {
      reject(error);
      return;
    }

    const timeout = self.setTimeout(() => {
      reject(new Error("Timed out while waiting for OpenCV to initialize."));
    }, 15000);

    Promise.resolve(self.cv)
      .then((cv) => {
        self.clearTimeout(timeout);
        if (cv && cv.Mat) {
          resolve(cv);
          return;
        }

        reject(new Error("OpenCV loaded but never became ready."));
      })
      .catch((error) => {
        self.clearTimeout(timeout);
        reject(error);
      });
  });

  return cvReadyPromise;
}

self.onmessage = async (event) => {
  const message = event.data;
  if (!message) return;

  if (message.type === "init") {
    loadOpenCv()
      .then(() => {
        self.postMessage({ type: "ready" });
      })
      .catch((error) => {
        postInitError(error);
      });
    return;
  }

  if (message.type !== "process") return;

  try {
    const blob = await processImage(message.imageFile);
    self.postMessage({ type: "result", id: message.id, blob });
  } catch (error) {
    self.postMessage({
      type: "process-error",
      id: message.id,
      message: error instanceof Error ? error.message : "Background removal failed.",
    });
  }
};
