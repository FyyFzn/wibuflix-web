import { useEffect, useRef, useState, useCallback } from 'react';
import { Anime4kPipeline } from '../utils/anime4k/Anime4kPipeline';

interface UseAnime4kUpscalerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  enabled: boolean;
}

export function useAnime4kUpscaler({ videoRef, canvasRef, enabled }: UseAnime4kUpscalerProps) {
  const [isUpscalingActive, setIsUpscalingActive] = useState(false);
  const [is1080pNative, setIs1080pNative] = useState(false);
  const [videoResolution, setVideoResolution] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const pipelineRef = useRef<Anime4kPipeline | null>(null);
  const callbackIdRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);

  // Initialize or re-init pipeline
  const initPipeline = useCallback(() => {
    if (!canvasRef.current) return null;
    try {
      if (!pipelineRef.current) {
        pipelineRef.current = new Anime4kPipeline(canvasRef.current);
      }
      return pipelineRef.current;
    } catch (err) {
      console.warn('[Anime4K] WebGL2 Pipeline init failed, falling back to native video:', err);
      return null;
    }
  }, [canvasRef]);

  // Clean up WebGL and frame loop
  const stopLoop = useCallback(() => {
    isRunningRef.current = false;
    const video = videoRef.current;
    if (callbackIdRef.current !== null) {
      if (video && 'cancelVideoFrameCallback' in video) {
        (video as any).cancelVideoFrameCallback(callbackIdRef.current);
      } else {
        cancelAnimationFrame(callbackIdRef.current);
      }
      callbackIdRef.current = null;
    }
  }, [videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const handleLoadedMetadata = () => {
      const vWidth = video.videoWidth || 0;
      const vHeight = video.videoHeight || 0;
      setVideoResolution({ width: vWidth, height: vHeight });

      const isNative1080 = vHeight >= 1080;
      setIs1080pNative(isNative1080);

      // Gate: upscaler only activates when <= 720p and enabled
      const shouldUpscale = enabled && vHeight > 0 && vHeight <= 720 && !isNative1080;

      if (shouldUpscale) {
        // Output canvas fixed to 1080p height maintaining aspect ratio
        const aspect = vWidth / (vHeight || 1);
        const targetHeight = 1080;
        const targetWidth = Math.round(targetHeight * aspect);

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const pipeline = initPipeline();
        if (pipeline) {
          pipeline.setOutputSize(targetWidth, targetHeight);
          setIsUpscalingActive(true);
          startLoop();
        } else {
          setIsUpscalingActive(false);
          stopLoop();
        }
      } else {
        setIsUpscalingActive(false);
        stopLoop();
      }
    };

    const startLoop = () => {
      if (isRunningRef.current) return;
      isRunningRef.current = true;

      const render = () => {
        if (!isRunningRef.current || !videoRef.current || !pipelineRef.current) return;
        try {
          if (!videoRef.current.paused && !videoRef.current.ended) {
            pipelineRef.current.renderFrame(videoRef.current);
          }
        } catch {
          // Ignore render dropped frames
        }

        if (videoRef.current && 'requestVideoFrameCallback' in videoRef.current) {
          callbackIdRef.current = (videoRef.current as any).requestVideoFrameCallback(render);
        } else {
          callbackIdRef.current = requestAnimationFrame(render);
        }
      };

      if ('requestVideoFrameCallback' in video) {
        callbackIdRef.current = (video as any).requestVideoFrameCallback(render);
      } else {
        callbackIdRef.current = requestAnimationFrame(render);
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('resize', handleLoadedMetadata);
    video.addEventListener('canplay', handleLoadedMetadata);
    video.addEventListener('play', () => {
      if (isUpscalingActive) startLoop();
    });
    video.addEventListener('pause', stopLoop);
    video.addEventListener('ended', stopLoop);

    if (video.readyState >= 1) {
      handleLoadedMetadata();
    }

    return () => {
      stopLoop();
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('resize', handleLoadedMetadata);
      video.removeEventListener('canplay', handleLoadedMetadata);
      video.removeEventListener('pause', stopLoop);
      video.removeEventListener('ended', stopLoop);
    };
  }, [enabled, videoRef, canvasRef, initPipeline, stopLoop, isUpscalingActive]);

  useEffect(() => {
    return () => {
      stopLoop();
      if (pipelineRef.current) {
        pipelineRef.current.destroy();
        pipelineRef.current = null;
      }
    };
  }, [stopLoop]);

  return {
    isUpscalingActive,
    is1080pNative,
    videoResolution,
  };
}
