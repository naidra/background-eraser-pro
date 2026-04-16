import { useState, useEffect, useCallback, useRef } from "react";

declare global {
  interface Window {
    cv: any;
    Module: any;
  }
}

export function useOpenCv() {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const loadAttempted = useRef(false);

  useEffect(() => {
    if (loadAttempted.current) return;
    loadAttempted.current = true;

    if (window.cv && window.cv.Mat) {
      setReady(true);
      setLoading(false);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.9.0/opencv.js";
    script.async = true;

    script.onload = () => {
      const checkReady = () => {
        if (window.cv && window.cv.Mat) {
          setReady(true);
          setLoading(false);
        } else {
          setTimeout(checkReady, 100);
        }
      };
      if (window.cv && window.cv.then) {
        window.cv.then(() => {
          setReady(true);
          setLoading(false);
        });
      } else {
        checkReady();
      }
    };

    script.onerror = () => {
      setLoading(false);
    };

    document.head.appendChild(script);
  }, []);

  const removeBackground = useCallback(
    (imageSrc: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        if (!ready) {
          reject(new Error("OpenCV not ready"));
          return;
        }

        const cv = window.cv;
        const img = new Image();
        img.crossOrigin = "anonymous";

        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(img, 0, 0);

            const src = cv.imread(canvas);
            const mask = new cv.Mat();
            const bgdModel = new cv.Mat();
            const fgdModel = new cv.Mat();

            // Define rectangle slightly inset from edges
            const margin = Math.max(Math.round(Math.min(img.width, img.height) * 0.02), 4);
            const rect = new cv.Rect(margin, margin, img.width - margin * 2, img.height - margin * 2);

            // Run GrabCut
            cv.cvtColor(src, src, cv.COLOR_RGBA2RGB);
            cv.grabCut(src, mask, rect, bgdModel, fgdModel, 5, cv.GC_INIT_WITH_RECT);

            // Create foreground mask (GC_FGD=1, GC_PR_FGD=3)
            const fgMask = new cv.Mat();
            const ones = new cv.Mat(mask.rows, mask.cols, cv.CV_8UC1, new cv.Scalar(1));
            const threes = new cv.Mat(mask.rows, mask.cols, cv.CV_8UC1, new cv.Scalar(3));

            const isFgd = new cv.Mat();
            const isPrFgd = new cv.Mat();
            cv.compare(mask, ones, isFgd, cv.CMP_EQ);
            cv.compare(mask, threes, isPrFgd, cv.CMP_EQ);
            cv.bitwise_or(isFgd, isPrFgd, fgMask);

            // Apply mask to original RGBA image
            const origRgba = cv.imread(canvas);
            const result = new cv.Mat.zeros(origRgba.rows, origRgba.cols, cv.CV_8UC4);

            for (let i = 0; i < origRgba.rows; i++) {
              for (let j = 0; j < origRgba.cols; j++) {
                if (fgMask.ucharAt(i, j) > 0) {
                  const r = origRgba.ucharAt(i, j * 4);
                  const g = origRgba.ucharAt(i, j * 4 + 1);
                  const b = origRgba.ucharAt(i, j * 4 + 2);
                  result.data[i * origRgba.cols * 4 + j * 4] = r;
                  result.data[i * origRgba.cols * 4 + j * 4 + 1] = g;
                  result.data[i * origRgba.cols * 4 + j * 4 + 2] = b;
                  result.data[i * origRgba.cols * 4 + j * 4 + 3] = 255;
                }
              }
            }

            const outCanvas = document.createElement("canvas");
            outCanvas.width = img.width;
            outCanvas.height = img.height;
            cv.imshow(outCanvas, result);
            const dataUrl = outCanvas.toDataURL("image/png");

            // Cleanup
            src.delete();
            mask.delete();
            bgdModel.delete();
            fgdModel.delete();
            fgMask.delete();
            ones.delete();
            threes.delete();
            isFgd.delete();
            isPrFgd.delete();
            origRgba.delete();
            result.delete();

            resolve(dataUrl);
          } catch (err) {
            reject(err);
          }
        };

        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = imageSrc;
      });
    },
    [ready]
  );

  return { ready, loading, removeBackground };
}
