import React from 'react';
import { TourStop } from '../types/floorplan';
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

interface TourDockProps {
  stops: TourStop[];
  activeIndex: number | null;
  isPlaying: boolean;
  isArrivedAtStop: boolean;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  onStartOrTogglePlay: () => void;
  onSelectStop: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onDismissCard: () => void;
}

export const TourDock: React.FC<TourDockProps> = ({
  stops,
  activeIndex,
  isPlaying,
  isArrivedAtStop,
  voiceEnabled,
  onToggleVoice,
  onStartOrTogglePlay,
  onSelectStop,
  onPrev,
  onNext,
  onDismissCard,
}) => {
  if (stops.length === 0) return null;

  const activeStop = activeIndex !== null ? stops[activeIndex] : null;

  // Compact docked bar when no narration card is expanded
  if (!activeStop) {
    return (
      <div className="pointer-events-auto studio-glass rounded-full p-1.5 flex items-center gap-1.5 max-w-[92vw] shadow-lg">
        <button
          onClick={onStartOrTogglePlay}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#C85A32] hover:bg-[#B24D28] text-white text-xs font-semibold transition shadow-sm cursor-pointer shrink-0"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Guided Tour</span>
        </button>

        <div className="hidden md:flex items-center gap-1 overflow-x-auto pr-1">
          {stops.map((stop, idx) => (
            <button
              key={stop.id}
              onClick={() => onSelectStop(idx)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-[#57534E] hover:text-[#1C1B19] hover:bg-black/5 transition whitespace-nowrap cursor-pointer"
            >
              <span className="font-mono-tech text-[10px] w-4 h-4 rounded-full bg-black/8 flex items-center justify-center text-[#1C1B19] font-semibold">
                {idx + 1}
              </span>
              <span>{stop.roomName}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Expanded Architectural Guide Narration Card
  return (
    <div className="pointer-events-auto studio-glass rounded-2xl p-3.5 w-[min(460px,92vw)] shadow-xl">
      {/* Header Row: Elena Host Avatar + Stop Counter + Controls */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative w-7 h-7 rounded-full bg-[#3D5A52] text-white flex items-center justify-center text-[11px] font-bold shrink-0">
            E
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                isArrivedAtStop ? 'bg-emerald-500' : 'bg-[#C85A32] animate-pulse'
              }`}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-mono-tech text-[10px] font-semibold uppercase tracking-wider text-[#C85A32]">
                Stop {(activeIndex ?? 0) + 1}/{stops.length}
              </span>
              <span className="text-black/20">·</span>
              <span className="text-[11px] text-[#6B6860] truncate">
                {isArrivedAtStop ? 'Elena · Presenting' : 'Elena · Walking to room…'}
              </span>
            </div>
            <h3 className="text-sm font-bold text-[#1C1B19] leading-tight truncate">
              {activeStop.roomName} — {activeStop.title}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onToggleVoice}
            className={`p-1.5 rounded-lg transition cursor-pointer ${
              voiceEnabled
                ? 'bg-[#C85A32]/15 text-[#C85A32]'
                : 'text-[#6B6860] hover:bg-black/5 hover:text-[#1C1B19]'
            }`}
            title={voiceEnabled ? 'Mute voice guide narration' : 'Enable voice guide narration'}
          >
            {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onDismissCard}
            className="p-1.5 rounded-lg text-[#6B6860] hover:bg-black/5 hover:text-[#1C1B19] transition cursor-pointer"
            title="Minimize tour card"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Narrative Description */}
      <p className="text-xs leading-relaxed text-[#3F3D39] mb-2.5">{activeStop.description}</p>

      {/* Architectural Highlights + Playback Controls */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-black/8">
        <div className="flex flex-wrap items-center gap-1 min-w-0">
          {activeStop.highlights.map((h) => (
            <span
              key={h}
              className="font-mono-tech text-[10px] px-2 py-0.5 rounded-full bg-black/[0.045] text-[#4A4742]"
            >
              {h}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onPrev}
            className="p-1.5 rounded-full hover:bg-black/6 text-[#1C1B19] transition cursor-pointer"
            title="Previous room"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onStartOrTogglePlay}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#C85A32] hover:bg-[#B24D28] text-white text-[11px] font-semibold transition cursor-pointer"
            title={isPlaying ? 'Pause automatic tour' : 'Auto-advance guided tour'}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3 h-3 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current" />
                <span>Auto</span>
              </>
            )}
          </button>
          <button
            onClick={onNext}
            className="p-1.5 rounded-full hover:bg-black/6 text-[#1C1B19] transition cursor-pointer"
            title="Next room"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
