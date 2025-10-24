// src/App.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cam from '@mediapipe/camera_utils';
import * as selfieSegmentation from '@mediapipe/selfie_segmentation';

interface BackgroundOption {
  id: string;
  name: string;
  path: string;
}

interface EnhancementMode {
  id: string;
  name: string;
  description: string;
}

interface ProcessingState {
  isProcessing: boolean;
  progress: number;
  error: string | null;
  resultImage: string | null;
}

const App: React.FC = () => {
  // State management
  const [selectedBackground, setSelectedBackground] = useState<string>('beach.jpg');
  const [enhancementMode, setEnhancementMode] = useState<string>('auto');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [processingState, setProcessingState] = useState<ProcessingState>({
    isProcessing: false,
    progress: 0,
    error: null,
    resultImage: null
  });
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [isSafari, setIsSafari] = useState<boolean>(false);
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const segmenterRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);
  const backgroundImgRef = useRef<HTMLImageElement | null>(null);

  // Background options
  const backgroundOptions: BackgroundOption[] = [
    { id: 'beach', name: 'Beach', path: '/backgrounds/beach.jpg' },
    { id: 'green', name: 'Green', path: '/backgrounds/green.png.webp' },
    { id: 'office', name: 'Office', path: '/backgrounds/office.jpg' }
  ];

  // Enhancement modes
  const enhancementModes: EnhancementMode[] = [
    { id: 'auto', name: 'Auto Enhance', description: 'Automatically adjusts brightness and contrast' },
    { id: 'low-light', name: 'Low Light Boost', description: 'Enhances details in dark areas' },
    { id: 'vibrant', name: 'Vibrant Colors', description: 'Increases color saturation and vibrancy' },
    { id: 'natural', name: 'Natural Look', description: 'Subtle enhancement preserving natural appearance' }
  ];

  // Detect Safari browser
  useEffect(() => {
    const isSafariBrowser = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    setIsSafari(isSafariBrowser);
  }, []);

  // Load MediaPipe Selfie Segmentation model
  const loadModel = useCallback(async () => {
    try {
      setProcessingState(prev => ({ ...prev, isProcessing: true, progress: 10 }));
      
      // Initialize MediaPipe Selfie Segmentation
      const segmenter = new selfieSegmentation.SelfieSegmentation({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1/${file}`;
        }
      });
      
      segmenter.setOptions({
        modelSelection: 1, // 0 for general, 1 for landscape
        selfieMode: true
      });
      
      segmenter.onResults(onResults);
      
      segmenterRef.current = segmenter;
      setModelLoaded(true);
      setProcessingState(prev => ({ ...prev, isProcessing: false, progress: 100 }));
    } catch (error) {
      console.error('Error loading model:', error);
      setProcessingState(prev => ({ 
        ...prev, 
        isProcessing: false, 
        error: 'Failed to load segmentation model. Please try again.' 
      }));
    }
  }, []);

  // Handle camera access and setup
  const startCamera = useCallback(async () => {
    if (!videoRef.current || !segmenterRef.current) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });
      
      videoRef.current.srcObject = stream;
      videoRef.current.play();
      
      // Setup camera with MediaPipe
      const camera = new cam.Camera(videoRef.current, {
        onFrame: async () => {
          if (segmenterRef.current && videoRef.current) {
            await segmenterRef.current.send({ image: videoRef.current });
          }
        },
        width: 640,
        height: 480
      });
      
      camera.start();
      setIsCameraActive(true);
    } catch (error) {
      console.error('Error accessing camera:', error);
      setProcessingState(prev => ({ 
        ...prev, 
        error: 'Failed to access camera. Please allow camera permissions.' 
      }));
    }
  }, []);

  // Process results from MediaPipe
  const onResults = useCallback((results: any) => {
    if (!canvasRef.current || !videoRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas dimensions to match video
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    
    // Draw the video frame
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    
    // Apply enhancement based on selected mode
    applyEnhancement(ctx, enhancementMode);
    
    // Create background
    createBackground(canvas, ctx, selectedBackground);
    
    // Apply segmentation mask
    if (results.segmentationMask) {
      // Create a temporary canvas for the mask
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;
      const maskCtx = maskCanvas.getContext('2d');
      
      if (maskCtx) {
        // Draw the segmentation mask
        maskCtx.drawImage(results.segmentationMask, 0, 0, maskCanvas.width, maskCanvas.height);
        
        // Invert the mask (so we keep the person, not the background)
        maskCtx.globalCompositeOperation = 'difference';
        maskCtx.fillStyle = '#ffffff';
        maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
        
        // Apply the mask to the original image
        ctx.globalCompositeOperation = 'source-in';
        ctx.drawImage(maskCanvas, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }, [enhancementMode, selectedBackground]);

  // Apply enhancement based on selected mode
  const applyEnhancement = (ctx: CanvasRenderingContext2D, mode: string) => {
    // Save current state
    ctx.save();
    
    // Apply different enhancements based on mode
    switch (mode) {
      case 'auto':
        ctx.filter = 'brightness(1.2) contrast(1.1)';
        break;
      case 'low-light':
        ctx.filter = 'brightness(1.5) contrast(1.3) saturate(1.2)';
        break;
      case 'vibrant':
        ctx.filter = 'saturate(1.5) contrast(1.2)';
        break;
      case 'natural':
        ctx.filter = 'brightness(1.1) contrast(1.05) saturate(1.1)';
        break;
      default:
        ctx.filter = 'none';
    }
    
    // Restore state
    ctx.restore();
  };

  // Create background
  const createBackground = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, backgroundId: string) => {
    // Create a temporary canvas for the background
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = canvas.width;
    bgCanvas.height = canvas.height;
    const bgCtx = bgCanvas.getContext('2d');
    
    if (bgCtx) {
      // Draw background
      const bgImg = new Image();
      bgImg.src = `/backgrounds/${backgroundId}`;
      
      bgImg.onload = () => {
        // Scale background to fit
        const scale = Math.max(canvas.width / bgImg.width, canvas.height / bgImg.height);
        const scaledWidth = bgImg.width * scale;
        const scaledHeight = bgImg.height * scale;
        const x = (canvas.width - scaledWidth) / 2;
        const y = (canvas.height - scaledHeight) / 2;
        
        bgCtx.drawImage(bgImg, x, y, scaledWidth, scaledHeight);
        
        // Draw background on main canvas
        ctx.drawImage(bgCanvas, 0, 0);
      };
      
      bgImg.onerror = () => {
        // Fallback to solid color if background fails to load
        bgCtx.fillStyle = '#f0f0f0';
        bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
        ctx.drawImage(bgCanvas, 0, 0);
      };
    }
  };

  // Capture current frame as image
  const captureFrame = useCallback(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const dataURL = canvas.toDataURL('image/png');
    
    setProcessingState(prev => ({ 
      ...prev, 
      resultImage: dataURL 
    }));
  }, []);

  // Toggle dark mode
  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  // Initialize model on component mount
  useEffect(() => {
    loadModel();
  }, [loadModel]);

  // Clean up animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div className={`app ${isDarkMode ? 'dark-mode' : ''}`}>
      <header className="header">
        <h1>Real-Time Human Segmentation</h1>
        <button 
          className="theme-toggle" 
          onClick={toggleDarkMode}
          aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDarkMode ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 00-4.4-4.4C16.08 6.04 16.54 6 17 6a9 9 0 00-5-5z"/>
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 7c-2.67 0-8 1.34-8 4s5.33 4 8 4 8-1.34 8-4-5.33-4-8-4z"/>
              <path d="M12 12c2.67 0 8-1.34 8-4s-5.33-4-8-4-8 1.34-8 4 5.33 4 8 4z"/>
            </svg>
          )}
        </button>
      </header>

      <main className="main-content">
        <div className="camera-section">
          <div className="camera-container">
            <video 
              ref={videoRef} 
              className="video-stream" 
              autoPlay 
              playsInline 
              muted
              style={{ display: isCameraActive ? 'block' : 'none' }}
            ></video>
            <canvas 
              ref={canvasRef} 
              className="output-canvas"
              style={{ display: isCameraActive ? 'block' : 'none' }}
            ></canvas>
            
            {!isCameraActive && (
              <div className="camera-placeholder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5a3 3 0 00-5.356-1.857M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5a3 3 0 00-5.356-1.857M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5a3 3 0 00-5.356-1.857"/>
                </svg>
                <p>Click "Start Camera" to begin</p>
                {isSafari && (
                  <div className="safari-note">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                    </svg>
                    <span>Safari users: Allow camera access and ensure you're using the latest version</span>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="camera-controls">
            <button
              className="camera-button"
              onClick={() => {
                if (isCameraActive) {
                  // Stop camera
                  if (videoRef.current && videoRef.current.srcObject) {
                    const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
                    tracks.forEach(track => track.stop());
                    videoRef.current.srcObject = null;
                  }
                  setIsCameraActive(false);
                } else {
                  // Start camera
                  startCamera();
                }
              }}
            >
              {isCameraActive ? 'Stop Camera' : 'Start Camera'}
            </button>
            
            <button
              className="capture-button"
              onClick={captureFrame}
              disabled={!isCameraActive}
            >
              Capture Frame
            </button>
          </div>
        </div>

        <div className="controls-section">
          <div className="control-group">
            <label htmlFor="background">Select Background:</label>
            <select 
              id="background" 
              value={selectedBackground} 
              onChange={(e) => setSelectedBackground(e.target.value)}
              disabled={!isCameraActive}
            >
              {backgroundOptions.map(option => (
                <option key={option.id} value={option.path}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="enhancement">Enhancement Mode:</label>
            <select 
              id="enhancement" 
              value={enhancementMode} 
              onChange={(e) => setEnhancementMode(e.target.value)}
              disabled={!isCameraActive}
            >
              {enhancementModes.map(mode => (
                <option key={mode.id} value={mode.id}>
                  {mode.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {processingState.error && (
          <div className="error-message">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            {processingState.error}
          </div>
        )}

        {processingState.isProcessing && (
          <div className="progress-container">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${processingState.progress}%` }}
              ></div>
            </div>
            <span>{Math.round(processingState.progress)}%</span>
          </div>
        )}

        {processingState.resultImage && (
          <div className="result-section">
            <h2>Captured Result</h2>
            <div className="result-container">
              <img 
                src={processingState.resultImage} 
                alt="Captured Result" 
                className="result-image" 
              />
            </div>
            <div className="result-actions">
              <button 
                className="download-button"
                onClick={() => {
                  const link = document.createElement('a');
                  link.download = 'captured_image.png';
                  link.href = processingState.resultImage!;
                  link.click();
                }}
              >
                Download Result
              </button>
              <button 
                className="reset-button"
                onClick={() => {
                  setProcessingState(prev => ({ ...prev, resultImage: null }));
                }}
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        <p>© 2025 Real-Time Human Segmentation Tool | Built with MediaPipe & TensorFlow.js</p>
      </footer>
    </div>
  );
};

export default App;