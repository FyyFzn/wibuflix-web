import { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Maximize,
  Minimize,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  FastForward,
  Server,
  ArrowLeft,
  Gauge
} from 'lucide-react';
import { formatDuration } from '../services/storage';

interface PlayerControlsProps {
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  isFullscreen: boolean;
  playbackRate: number;
  title?: string;
  activeServerName?: string;
  hasPrev?: boolean;
  hasNext?: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onPlaybackRateChange: (rate: number) => void;
  onOpenSpeedModal?: () => void;
  onSkipIntro?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onOpenServerModal?: () => void;
  onBack?: () => void;
}

export default function PlayerControls({
  playing,
  currentTime,
  duration,
  volume,
  muted,
  isFullscreen,
  playbackRate,
  title,
  activeServerName,
  hasPrev,
  hasNext,
  onPlayPause,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleFullscreen,
  onPlaybackRateChange,
  onOpenSpeedModal,
  onSkipIntro,
  onPrev,
  onNext,
  onOpenServerModal,
  onBack,
}: PlayerControlsProps) {
  const [visible, setVisible] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

  const resetHideTimer = () => {
    setVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (playing) {
      hideTimerRef.current = window.setTimeout(() => {
        setVisible(false);
      }, 3500);
    }
  };

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [playing]);

  const handleMouseMove = () => {
    resetHideTimer();
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      onMouseMove={handleMouseMove}
      className={`absolute inset-0 flex flex-col justify-between p-4 md:p-6 transition-opacity duration-300 pointer-events-auto bg-gradient-to-t from-black/85 via-transparent to-black/70 ${
        visible ? 'opacity-100' : 'opacity-0 cursor-none pointer-events-none'
      }`}
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-xl bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-colors"
              title="Kembali"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h2 className="text-sm md:text-base font-bold text-white line-clamp-1 drop-shadow">
            {title || 'Wibuflix Player'}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Top-Right Speed Button (Matches Mobile App layout) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onOpenSpeedModal) onOpenSpeedModal();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/40 hover:bg-black/60 text-xs font-semibold text-white backdrop-blur-md border border-white/10 transition-colors cursor-pointer"
            title="Kecepatan Putar"
          >
            <Gauge className="w-3.5 h-3.5 text-accent" />
            <span>{playbackRate}x</span>
          </button>

          {onOpenServerModal && (
            <button
              onClick={onOpenServerModal}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/40 hover:bg-black/60 text-xs font-semibold text-white backdrop-blur-md border border-white/10 transition-colors"
            >
              <Server className="w-3.5 h-3.5 text-accent" />
              <span className="hidden sm:inline">{activeServerName || 'Pilih Server'}</span>
              <span className="sm:hidden">Server</span>
            </button>
          )}
        </div>
      </div>

      {/* Center Controls (Skip 10s, Play/Pause) */}
      <div className="flex items-center justify-center gap-6 md:gap-10">
        {hasPrev && onPrev && (
          <button
            onClick={onPrev}
            className="p-2.5 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-transform hover:scale-110"
            title="Episode Sebelumnya"
          >
            <SkipBack className="w-5 h-5" />
          </button>
        )}

        <button
          onClick={() => onSeek(Math.max(0, currentTime - 10))}
          className="p-2.5 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-transform hover:scale-110"
          title="Mundur 10 detik"
        >
          <RotateCcw className="w-5 h-5" />
        </button>

        <button
          onClick={onPlayPause}
          className="p-4 md:p-5 rounded-full bg-accent hover:bg-accent-hover text-white shadow-xl shadow-accent/40 transition-transform hover:scale-105 active:scale-95"
          title={playing ? 'Jeda' : 'Putar'}
        >
          {playing ? (
            <Pause className="w-7 h-7 fill-white" />
          ) : (
            <Play className="w-7 h-7 fill-white ml-0.5" />
          )}
        </button>

        <button
          onClick={() => onSeek(Math.min(duration, currentTime + 10))}
          className="p-2.5 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-transform hover:scale-110"
          title="Maju 10 detik"
        >
          <RotateCw className="w-5 h-5" />
        </button>

        {hasNext && onNext && (
          <button
            onClick={onNext}
            className="p-2.5 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-transform hover:scale-110"
            title="Episode Selanjutnya"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Bottom Controls & Timeline */}
      <div className="space-y-2">
        {/* Skip Intro Floating Action */}
        {currentTime < 120 && onSkipIntro && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onSkipIntro}
              className="px-3.5 py-1.5 rounded-xl bg-black/70 hover:bg-black/90 text-white font-medium text-xs backdrop-blur-md border border-white/20 shadow-lg hover:border-accent transition-all flex items-center gap-1.5 group cursor-pointer"
              title="Lewati Intro (+85s) - Tombol [S]"
            >
              <FastForward className="w-3.5 h-3.5 text-accent group-hover:scale-110 transition-transform" />
              <span>Lewati Intro (+85 detik)</span>
              <kbd className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-mono text-gray-300">S</kbd>
            </button>
          </div>
        )}

        {/* Seek Bar */}
        <div className="relative group/bar flex items-center h-4 cursor-pointer">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="w-full h-1.5 group-hover/bar:h-2.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-accent transition-all"
            style={{
              background: `linear-gradient(to right, #FF5722 ${progressPercent}%, rgba(255, 255, 255, 0.2) ${progressPercent}%)`
            }}
          />
        </div>

        {/* Time and Action Row */}
        <div className="flex items-center justify-between text-xs text-gray-200">
          <div className="flex items-center gap-4">
            <span className="font-mono">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>

            {/* Volume Slider */}
            <div className="hidden sm:flex items-center gap-2">
              <button onClick={onToggleMute} className="hover:text-accent transition-colors">
                {muted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => onVolumeChange(Number(e.target.value))}
                className="w-16 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-accent"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 relative">
            {/* Playback Speed Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenSpeedModal) {
                    onOpenSpeedModal();
                  } else {
                    setShowSpeedMenu(!showSpeedMenu);
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-mono text-xs font-semibold border border-white/15 transition-all flex items-center gap-0.5 cursor-pointer"
                title="Kecepatan Putar"
              >
                <span>{playbackRate}x</span>
              </button>

              {showSpeedMenu && (
                <div
                  className="absolute bottom-full mb-2 right-0 bg-[#181926]/95 border border-white/15 rounded-xl p-1.5 shadow-2xl backdrop-blur-md flex flex-col gap-1 z-50 min-w-[75px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {SPEED_OPTIONS.map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => {
                        onPlaybackRateChange(rate);
                        setShowSpeedMenu(false);
                      }}
                      className={`px-3 py-1 text-xs rounded-lg text-left transition-colors font-mono font-medium ${
                        playbackRate === rate
                          ? 'bg-accent text-white font-bold'
                          : 'text-gray-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={onToggleFullscreen}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors"
              title={isFullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh'}
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
