// Segmentation.tsx
import { useEffect, useRef, useState, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as bodySegmentation from '@tensorflow-models/body-segmentation';

type EnhanceMode = 'none' | 'gamma';
type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';

interface SegmentationProps {
  defaultBackground?: string;
}

function enhanceGamma(imageData: ImageData, gamma: number = 1.5): ImageData {
  const data = imageData.data;
  const inv = 1 / gamma;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = data[i + c] / 255;
      data[i + c] = Math.min(255, Math.pow(v, inv) * 255);
    }
  }
  return imageData;
}

function blurMask(imageData: ImageData, radius = 1): ImageData {
  const { width, height, data } = imageData;
  const out = new Uint8ClampedArray(data.length);
  const tmp = new Uint32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    tmp[i] = data[i * 4 + 3];
  }
  const r = radius;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let cnt = 0;
      for (let yy = Math.max(0, y - r); yy <= Math.min(height - 1, y + r); yy++) {
        for (let xx = Math.max(0, x - r); xx <= Math.min(width - 1, x + r); xx++) {
          sum += tmp[yy * width + xx];
          cnt++;
        }
      }
      const v = Math.round(sum / cnt);
      const idx = (y * width + x) * 4;
      out[idx] = out[idx + 1] = out[idx + 2] = 0;
      out[idx + 3] = v;
    }
  }
  return new ImageData(out, width, height);
}

export default function SegmentationTF({
  defaultBackground = '/backgrounds/green.png'
}: SegmentationProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const segmenterRef = useRef<any>(null);

  const enhanceRef = useRef<EnhanceMode>('gamma');
  const runningRef = useRef(false);
  const videoReadyRef = useRef(false);

  const [running, setRunning] = useState(false);
  const [bgUrl, setBgUrl] = useState(defaultBackground);
  const [enhance, setEnhance] = useState<EnhanceMode>('gamma');
  const [modelStatus, setModelStatus] = useState<ModelStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Sync refs
  useEffect(() => {
    enhanceRef.current = enhance;
  }, [enhance]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  // Load background
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = bgUrl;
    img.onload = () => {
      bgImageRef.current = img;
    };
    img.onerror = () => {
      console.warn('Failed to load background:', bgUrl);
      bgImageRef.current = null;
    };
  }, [bgUrl]);

  // 🎥 Initialize camera with loadeddata
  useEffect(() => {
    let stream: MediaStream | null = null;

    const onLoadedData = () => {
      videoReadyRef.current = true;
      console.log('✅ Video ready:', videoRef.current?.videoWidth, 'x', videoRef.current?.videoHeight);
    };

    const initCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.addEventListener('loadeddata', onLoadedData);
          await video.play();
        }
      } catch (err) {
        console.error('Camera init failed', err);
        setErrorMessage('Camera init failed: ' + (err as Error).message);
      }
    };

    initCamera();

    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
      const video = videoRef.current;
      if (video) {
        video.removeEventListener('loadeddata', onLoadedData);
      }
      videoReadyRef.current = false;
    };
  }, []);

  // 🧠 Initialize model
  useEffect(() => {
    let mounted = true;
    const initModel = async () => {
      try {
        setModelStatus('loading');
        await tf.setBackend('webgl').catch(() => tf.setBackend('cpu'));
        await tf.ready();

        const model = bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation;
        const config = {
          runtime: 'tfjs',
          modelType: 'general',
        } as const;

        const segmenter = await bodySegmentation.createSegmenter(model, config);
        if (!mounted) {
          segmenter.dispose?.();
          return;
        }
        segmenterRef.current = segmenter;
        setModelStatus('ready');
      } catch (err) {
        console.error('Model init error', err);
        setErrorMessage(String(err));
        setModelStatus('error');
      }
    };
    initModel();
    return () => {
      mounted = false;
      const segmenter = segmenterRef.current;
      if (segmenter) {
        segmenter.dispose?.();
        segmenterRef.current = null;
      }
      tf.engine().disposeVariables();
    };
  }, []);

  // 🖼️ Process frame (stable)
  const processFrame = useCallback(() => {
    // Guard: only process if actively running
    if (!runningRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const offscreen = offscreenRef.current;
    const segmenter = segmenterRef.current;

    if (!video || !canvas || !offscreen || !segmenter || video.videoWidth === 0) {
      return;
    }

    const ctx = canvas.getContext('2d');
    const offCtx = offscreen.getContext('2d');
    if (!ctx || !offCtx) return;

    const width = (canvas.width = offscreen.width = video.videoWidth);
    const height = (canvas.height = offscreen.height = video.videoHeight);

    offCtx.drawImage(video, 0, 0, width, height);

    if (enhanceRef.current === 'gamma') {
      try {
        const id = offCtx.getImageData(0, 0, width, height);
        enhanceGamma(id);
        offCtx.putImageData(id, 0, 0);
      } catch (e) {
        console.warn('Enhance failed', e);
      }
    }

    tf.engine().startScope();
    (async () => {
      try {
        let segmentationResult;
        if (typeof segmenter.segmentPeople === 'function') {
          segmentationResult = await segmenter.segmentPeople(offscreen);
        } else if (typeof segmenter.segmentForPerson === 'function') {
          segmentationResult = [await segmenter.segmentForPerson(offscreen)];
        } else {
          segmentationResult = [await segmenter.segment(offscreen)];
        }

        if (!segmentationResult?.[0]) return;

        const seg = segmentationResult[0];
        let maskImageData: ImageData | null = null;

        if (seg.mask) {
          const m = seg.mask;
          if (typeof m.toImageData === 'function') {
            maskImageData = await m.toImageData();
          } else if (typeof m.toCanvasImageSource === 'function') {
            const source = await m.toCanvasImageSource();
            const mctx = (source as HTMLCanvasElement).getContext('2d');
            if (mctx) maskImageData = mctx.getImageData(0, 0, source.width, source.height);
          }
        } else if (seg.categoryMask instanceof ImageData) {
          maskImageData = seg.categoryMask;
        } else if (seg.segmentationMask instanceof ImageData) {
          maskImageData = seg.segmentationMask;
        }

        if (!maskImageData) return;

        let maskCanvas = document.createElement('canvas');
        maskCanvas.width = maskImageData.width;
        maskCanvas.height = maskImageData.height;
        const maskCtx = maskCanvas.getContext('2d');
        maskCtx?.putImageData(maskImageData, 0, 0);

        if (maskCanvas.width !== width || maskCanvas.height !== height) {
          const tmp = document.createElement('canvas');
          tmp.width = width;
          tmp.height = height;
          const tctx = tmp.getContext('2d');
          if (tctx) {
            tctx.imageSmoothingEnabled = true;
            tctx.imageSmoothingQuality = 'high';
            tctx.drawImage(maskCanvas, 0, 0, width, height);
            maskCanvas = tmp;
          }
        }

        const mctx2 = maskCanvas.getContext('2d');
        if (!mctx2) return;
        const finalMask = blurMask(mctx2.getImageData(0, 0, width, height), 1);

        ctx.clearRect(0, 0, width, height);
        if (bgImageRef.current) {
          ctx.drawImage(bgImageRef.current, 0, 0, width, height);
        } else {
          ctx.fillStyle = 'green';
          ctx.fillRect(0, 0, width, height);
        }

        const fgCanvas = document.createElement('canvas');
        fgCanvas.width = width;
        fgCanvas.height = height;
        const fgCtx = fgCanvas.getContext('2d');
        if (!fgCtx) return;
        fgCtx.drawImage(video, 0, 0, width, height);
        const videoData = fgCtx.getImageData(0, 0, width, height);

        const out = new ImageData(width, height);
        const maskData = finalMask.data;
        for (let i = 0; i < width * height; i++) {
          const idx = i * 4;
          out.data[idx] = videoData.data[idx];
          out.data[idx + 1] = videoData.data[idx + 1];
          out.data[idx + 2] = videoData.data[idx + 2];
          out.data[idx + 3] = maskData[idx + 3];
        }

        const temp = document.createElement('canvas');
        temp.width = width;
        temp.height = height;
        const tCtx = temp.getContext('2d');
        if (tCtx) {
          tCtx.putImageData(out, 0, 0);
          ctx.drawImage(temp, 0, 0, width, height);
        }
      } catch (err) {
        console.error('Segmentation error', err);
      } finally {
        tf.engine().endScope();
      }
    })();
  }, []); // ✅ Empty deps

  // 🔄 START LOOP ONLY WHEN: model ready + video ready + running
  useEffect(() => {
    // Do not start unless all conditions are met
    if (modelStatus !== 'ready' || !videoReadyRef.current || !running) {
      return;
    }

    let rafId: number;
    const loop = () => {
      processFrame();
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [modelStatus, running]); // videoReadyRef is not a dep — we only enter when it's true

  return (
    <div style={{ display: 'flex', gap: '1rem' }}>
      <div style={{ position: 'relative' }}>
        <video
          ref={videoRef}
          style={{ display: 'none' }}
          muted
          playsInline
        />
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          style={{ width: 640, height: 360, borderRadius: 8, background: '#000' }}
        />
        <canvas
          ref={offscreenRef}
          width={1280}
          height={720}
          style={{ display: 'none' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          Status: <strong style={{ color: modelStatus === 'error' ? 'red' : undefined }}>{modelStatus}</strong>
        </div>
        {errorMessage && <div style={{ color: 'red' }}>{errorMessage}</div>}

        <label>
          Background:
          <select value={bgUrl} onChange={(e) => setBgUrl(e.target.value)} style={{ marginLeft: 8 }}>
            <option value="/backgrounds/green.png">Green</option>
            <option value="/backgrounds/office.jpg">Office</option>
            <option value="/backgrounds/beach.jpg">Beach</option>
          </select>
        </label>

        <label>
          Enhancement:
          <select value={enhance} onChange={(e) => setEnhance(e.target.value as EnhanceMode)} style={{ marginLeft: 8 }}>
            <option value="gamma">Gamma</option>
            <option value="none">None</option>
          </select>
        </label>

        <button onClick={() => setRunning(prev => !prev)} disabled={modelStatus !== 'ready'}>
          {running ? 'Stop' : 'Start'}
        </button>

        <div style={{ marginTop: 12, padding: 8, background: '#f4f4f4', borderRadius: 6 }}>
          <p style={{ margin: 0 }}>Tips:</p>
          <ul style={{ margin: '4px 0 0 16px' }}>
            <li>Good lighting improves mask quality</li>
            <li>First frame may take 1–2 seconds to appear</li>
            <li>Stand 1–2 meters from the camera</li>
          </ul>
        </div>
      </div>
    </div>
  );
}