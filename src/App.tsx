import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  EditorTool,
  FloorplanData,
  GuideGesture,
  GuideInspectTarget,
  LightingPreset,
  LiveSyncState,
  Point2D,
  ViewMode,
  WalkRequest,
  WallDisplayMode,
} from './types/floorplan';
import { cloneFloorplan, FLOORPLAN_PRESETS, NORDIC_RESIDENCE } from './data/presets';
import { Floorplan2DEditor } from './components/Floorplan2DEditor';
import { Scene3DViewport } from './components/Scene3DViewport';
import { TourDock } from './components/TourDock';
import { GuideInspectorPanel } from './components/GuideInspectorPanel';
import {
  Box,
  ChevronDown,
  Columns2,
  Compass,
  Grid2x2,
  RotateCcw,
  UserCheck,
} from 'lucide-react';

export function App() {
  const [presetId, setPresetId] = useState<string>(NORDIC_RESIDENCE.id);
  const [floorplan, setFloorplan] = useState<FloorplanData>(() =>
    cloneFloorplan(NORDIC_RESIDENCE)
  );
  const [undoStack, setUndoStack] = useState<FloorplanData[]>([]);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);

  // Studio layout & viewport state
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [splitRatio, setSplitRatio] = useState<number>(45); // % width for 2D floorplan in split view
  const [editorTool, setEditorTool] = useState<EditorTool>('select');
  const [wallMode, setWallMode] = useState<WallDisplayMode>('cutaway');
  const [lighting, setLighting] = useState<LightingPreset>('daylight');

  // 3D Human Guide anatomy inspection & animation state
  const [inspectTarget, setInspectTarget] = useState<GuideInspectTarget>('none');
  const [guideGesture, setGuideGesture] = useState<GuideGesture>('auto');

  // Guided Virtual Tour & Click-to-Walk state
  const walkCounterRef = useRef(1);
  const [walkRequest, setWalkRequest] = useState<WalkRequest | null>(null);
  const [activeTourStopIndex, setActiveTourStopIndex] = useState<number | null>(null);
  const [isTourPlaying, setIsTourPlaying] = useState<boolean>(false);
  const [isArrivedAtStop, setIsArrivedAtStop] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(false);

  // High-frequency 60fps synchronized state shared between Three.js & 2D Blueprint Canvas
  const liveSyncRef = useRef<LiveSyncState>({
    guidePos: { ...NORDIC_RESIDENCE.guideStart },
    guideYaw: NORDIC_RESIDENCE.guideStartYaw,
    guideIsWalking: false,
    guidePath: [],
    guideDestination: null,
    cameraPos: { x: 1.2, y: 10.2, z: 11.4 },
    cameraYaw: Math.PI,
    cameraFovRad: 0.9,
  });

  const stopSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const speakText = useCallback(
    (text: string, enableAudio: boolean) => {
      stopSpeech();
      setIsSpeaking(true);
      if (enableAudio && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          const utter = new SpeechSynthesisUtterance(text);
          utter.rate = 0.98;
          utter.pitch = 1.05;
          const voices = window.speechSynthesis.getVoices();
          const preferred = voices.find(
            (v) =>
              v.lang.startsWith('en') &&
              /samantha|victoria|karen|fiona|moira|aria|jenny|female|google uk english female/i.test(
                v.name
              )
          );
          if (preferred) utter.voice = preferred;
          utter.onend = () => setIsSpeaking(false);
          utter.onerror = () => setIsSpeaking(false);
          window.speechSynthesis.speak(utter);
          return;
        } catch {
          // Fallback to timer-based visual lip animation
        }
      }
    },
    [stopSpeech]
  );

  // Clean up speech on unmount
  useEffect(() => () => stopSpeech(), [stopSpeech]);

  // Floorplan change handler with Undo stack
  const handleChangeFloorplan = useCallback(
    (next: FloorplanData, recordUndo = true) => {
      if (recordUndo) {
        setUndoStack((prev) => [...prev.slice(-19), cloneFloorplan(floorplan)]);
      }
      setFloorplan(next);
    },
    [floorplan]
  );

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setFloorplan(last);
      return prev.slice(0, -1);
    });
  }, []);

  const handleSelectPreset = (id: string) => {
    const found = FLOORPLAN_PRESETS.find((p) => p.id === id) ?? NORDIC_RESIDENCE;
    stopSpeech();
    setPresetId(found.id);
    setFloorplan(cloneFloorplan(found));
    setUndoStack([]);
    setActiveTourStopIndex(null);
    setIsTourPlaying(false);
    setIsArrivedAtStop(false);
    setInspectTarget('none');
    setGuideGesture('auto');
    setPresetMenuOpen(false);
  };

  const handleResetCurrentPreset = () => {
    handleSelectPreset(presetId);
  };

  // Navigate Elena to a specific Tour Stop
  const goToTourStop = useCallback(
    (index: number, keepPlaying?: boolean) => {
      const stops = floorplan.tourStops;
      if (stops.length === 0) return;
      const wrapped = ((index % stops.length) + stops.length) % stops.length;
      const stop = stops[wrapped];

      stopSpeech();
      setInspectTarget('none');
      setGuideGesture('auto');
      setActiveTourStopIndex(wrapped);
      setIsArrivedAtStop(false);
      if (typeof keepPlaying === 'boolean') {
        setIsTourPlaying(keepPlaying);
      }
      if (viewMode === '2d') {
        setViewMode('split');
      }

      const id = ++walkCounterRef.current;
      setWalkRequest({
        id,
        target: { ...stop.guidePos },
        facePoint: { x: stop.cameraPos.x, z: stop.cameraPos.z },
        tourStopId: stop.id,
        announceText: `${stop.roomName}. ${stop.description}`,
      });
    },
    [floorplan.tourStops, stopSpeech, viewMode]
  );

  // Walk Elena to any arbitrary user-clicked floor coordinate (2D or 3D!)
  const handleWalkGuideTo = useCallback(
    (pt: Point2D) => {
      stopSpeech();
      setIsTourPlaying(false);
      setActiveTourStopIndex(null);
      setIsArrivedAtStop(false);
      setInspectTarget('none');
      setGuideGesture('auto');

      const id = ++walkCounterRef.current;
      setWalkRequest({
        id,
        target: { x: pt.x, z: pt.z },
      });
    },
    [stopSpeech]
  );

  // Called when Elena finishes walking along her A* path
  const handleGuideArrived = useCallback(
    (_walkId: number, tourStopId?: string) => {
      if (!tourStopId) return;
      const stop = floorplan.tourStops.find((s) => s.id === tourStopId);
      if (!stop) return;
      setIsArrivedAtStop(true);
      speakText(`${stop.roomName}. ${stop.description}`, voiceEnabled);
    },
    [floorplan.tourStops, speakText, voiceEnabled]
  );

  // Auto-stop visual lip speaking after 5.8s when silent, and auto-advance Guided Tour when playing!
  useEffect(() => {
    if (!isArrivedAtStop || activeTourStopIndex === null) return;

    const lipTimer = !voiceEnabled
      ? window.setTimeout(() => setIsSpeaking(false), 5400)
      : undefined;

    const advanceTimer = isTourPlaying
      ? window.setTimeout(() => {
          const nextIdx = (activeTourStopIndex + 1) % floorplan.tourStops.length;
          goToTourStop(nextIdx, true);
        }, 7200)
      : undefined;

    return () => {
      if (lipTimer) window.clearTimeout(lipTimer);
      if (advanceTimer) window.clearTimeout(advanceTimer);
    };
  }, [
    isArrivedAtStop,
    isTourPlaying,
    activeTourStopIndex,
    floorplan.tourStops.length,
    goToTourStop,
    voiceEnabled,
  ]);

  const handleStartOrToggleTour = () => {
    if (activeTourStopIndex === null) {
      // Switch into immersive Virtual Tour view & launch Stop 1!
      setViewMode('tour');
      goToTourStop(0, true);
    } else if (isTourPlaying) {
      setIsTourPlaying(false);
      stopSpeech();
    } else {
      setIsTourPlaying(true);
      if (isArrivedAtStop) {
        const nextIdx = (activeTourStopIndex + 1) % floorplan.tourStops.length;
        goToTourStop(nextIdx, true);
      }
    }
  };

  const handleSwitchViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === '2d') {
      setInspectTarget('none');
      setGuideGesture('auto');
    } else if (mode === 'tour') {
      setInspectTarget('none');
      setGuideGesture('auto');
      if (activeTourStopIndex === null && floorplan.tourStops.length > 0) {
        goToTourStop(0, true);
      }
    }
  };

  const handleToggleInspectGuide = () => {
    if (inspectTarget !== 'none') {
      setInspectTarget('none');
      setGuideGesture('auto');
    } else {
      stopSpeech();
      setIsTourPlaying(false);
      if (viewMode === '2d' || viewMode === 'tour') {
        setViewMode('3d');
      }
      setGuideGesture('auto');
      setInspectTarget('full');
    }
  };

  const handleToggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    if (!next) {
      stopSpeech();
    } else if (activeTourStopIndex !== null && isArrivedAtStop) {
      const stop = floorplan.tourStops[activeTourStopIndex];
      if (stop) speakText(`${stop.roomName}. ${stop.description}`, true);
    }
  };

  // Draggable vertical divider for Split View
  const workspaceRef = useRef<HTMLDivElement>(null);
  const startSplitDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const rect = workspaceRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitRatio(Math.max(28, Math.min(68, pct)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const activeTourStop =
    activeTourStopIndex !== null ? floorplan.tourStops[activeTourStopIndex] ?? null : null;

  const viewModes: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
    { id: '2d', label: '2D Plan', icon: <Grid2x2 className="w-3.5 h-3.5" /> },
    { id: 'split', label: 'Split', icon: <Columns2 className="w-3.5 h-3.5" /> },
    { id: '3d', label: '3D Preview', icon: <Box className="w-3.5 h-3.5" /> },
    { id: 'tour', label: 'Virtual Tour', icon: <Compass className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="w-full h-full flex flex-col bg-[#F6F5F1] text-[#1C1B19] overflow-hidden">
      {/* Slim 52px Architectural Studio Header */}
      <header className="h-13 shrink-0 px-3 sm:px-4 bg-white/90 backdrop-blur-md border-b border-black/[0.08] flex items-center justify-between gap-2 z-30">
        {/* Left: Brand + Floorplan Preset Selector */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-[#1C1B19] text-white flex items-center justify-center shadow-xs">
              <svg
                viewBox="0 0 20 20"
                fill="none"
                className="w-4 h-4"
                stroke="currentColor"
                strokeWidth="1.7"
              >
                <rect x="2.5" y="2.5" width="15" height="15" rx="1.5" />
                <path d="M2.5 10.5H10V17.5" />
                <path d="M10 2.5V6.5" />
                <circle cx="14" cy="13.5" r="1.6" fill="#C85A32" stroke="none" />
              </svg>
            </div>
            <span className="font-bold text-sm tracking-tight hidden sm:inline">PlanWalk</span>
          </div>

          <div className="h-4 w-px bg-black/10 hidden sm:block" />

          {/* Preset Dropdown */}
          <div className="relative min-w-0">
            <button
              onClick={() => setPresetMenuOpen((o) => !o)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-black/[0.045] transition text-xs font-semibold text-[#1C1B19] max-w-[170px] sm:max-w-[230px] cursor-pointer"
            >
              <span className="truncate">{floorplan.name}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#6B6860] shrink-0" />
            </button>

            {presetMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setPresetMenuOpen(false)}
                />
                <div className="absolute left-0 top-full mt-1.5 w-72 studio-glass rounded-2xl p-1.5 z-40 shadow-xl">
                  <div className="px-2.5 py-1 text-[10px] font-mono-tech uppercase tracking-wider text-[#6B6860]">
                    Architectural Floorplans
                  </div>
                  {FLOORPLAN_PRESETS.map((preset) => {
                    const active = preset.id === presetId;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => handleSelectPreset(preset.id)}
                        className={`w-full text-left px-2.5 py-2 rounded-xl transition cursor-pointer ${
                          active ? 'bg-[#1C1B19] text-white' : 'hover:bg-black/5 text-[#1C1B19]'
                        }`}
                      >
                        <div className="text-xs font-semibold">{preset.name}</div>
                        <div
                          className={`text-[10.5px] mt-0.5 ${
                            active ? 'text-white/75' : 'text-[#6B6860]'
                          }`}
                        >
                          {preset.subtitle}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Center: Primary 2D / Split / 3D / Virtual Tour Segmented Control */}
        <nav
          aria-label="Viewport Mode"
          className="flex items-center bg-[#F1EFEA] p-1 rounded-xl border border-black/[0.05]"
        >
          {viewModes.map((m) => {
            const active = viewMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => handleSwitchViewMode(m.id)}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                  active
                    ? m.id === 'tour'
                      ? 'bg-[#C85A32] text-white shadow-xs font-semibold'
                      : 'bg-white text-[#1C1B19] shadow-xs font-semibold'
                    : 'text-[#57534E] hover:text-[#1C1B19]'
                }`}
              >
                {m.icon}
                <span className="hidden md:inline">{m.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right: 3D Human Guide Inspector & Reset */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleToggleInspectGuide}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer border ${
              inspectTarget !== 'none'
                ? 'bg-[#3D5A52] text-white border-[#3D5A52] shadow-xs'
                : 'bg-white hover:bg-[#F6F5F1] text-[#1C1B19] border-black/10'
            }`}
            title="Inspect the 3D human guide up close (head, neck, body, 5 fingers per hand & 5 toes per foot)"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Inspect Guide</span>
          </button>

          <button
            onClick={handleResetCurrentPreset}
            className="p-1.5 rounded-xl text-[#6B6860] hover:text-[#1C1B19] hover:bg-black/5 transition cursor-pointer"
            title="Reset floorplan & tour to default state"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Edge-to-Edge Interactive 2D + 3D Studio Workspace */}
      <main
        ref={workspaceRef}
        className="flex-1 relative flex flex-col lg:flex-row overflow-hidden"
      >
        {/* 2D Architectural Blueprint Editor Pane (shown in '2d' and 'split' modes) */}
        {(viewMode === '2d' || viewMode === 'split') && (
          <section
            style={
              viewMode === 'split'
                ? { flexBasis: `${splitRatio}%` }
                : { flexBasis: '100%' }
            }
            className={`relative min-w-0 min-h-0 ${
              viewMode === 'split'
                ? 'h-[45%] lg:h-full shrink-0 border-b lg:border-b-0 border-black/10'
                : 'w-full h-full'
            }`}
          >
            <Floorplan2DEditor
              floorplan={floorplan}
              onChangeFloorplan={handleChangeFloorplan}
              canUndo={undoStack.length > 0}
              onUndo={handleUndo}
              activeTool={editorTool}
              onToolChange={setEditorTool}
              liveSyncRef={liveSyncRef}
              onWalkGuideTo={handleWalkGuideTo}
              onSelectTourStop={(idx) => goToTourStop(idx, false)}
              activeTourStopIndex={activeTourStopIndex}
            />
          </section>
        )}

        {/* Draggable Split Divider Handle (Desktop Split Mode) */}
        {viewMode === 'split' && (
          <div
            onPointerDown={startSplitDrag}
            title="Drag to resize 2D Floorplan & 3D Preview"
            className="hidden lg:flex w-1.5 shrink-0 bg-[#E6E3DC] hover:bg-[#C85A32]/60 transition-colors cursor-col-resize items-center justify-center z-20"
          >
            <div className="w-0.5 h-8 rounded-full bg-black/25" />
          </div>
        )}

        {/* Real-Time 3D Preview & Guided Virtual Tour Pane (kept mounted for instant transitions) */}
        <section
          className={`relative flex-1 min-w-0 min-h-0 ${
            viewMode === '2d' ? 'hidden' : 'block h-[55%] lg:h-full'
          }`}
        >
          <Scene3DViewport
            floorplan={floorplan}
            viewMode={viewMode}
            wallMode={wallMode}
            onWallModeChange={setWallMode}
            lighting={lighting}
            onLightingChange={setLighting}
            inspectTarget={inspectTarget}
            onInspectTargetChange={(t) => {
              setGuideGesture('auto');
              setInspectTarget(t);
            }}
            guideGesture={guideGesture}
            walkRequest={walkRequest}
            activeTourStop={activeTourStop}
            isTourPlaying={isTourPlaying}
            isSpeaking={isSpeaking}
            onSelectTourStop={(idx) => goToTourStop(idx, false)}
            onGuideArrived={handleGuideArrived}
            onFloorWalkClick={handleWalkGuideTo}
            liveSyncRef={liveSyncRef}
          />

          {/* Corner Live 2D Floorplan Radar Mini-Map when exploring in Full-Screen Virtual Tour */}
          {viewMode === 'tour' && inspectTarget === 'none' && (
            <div className="hidden sm:block absolute bottom-3 left-3 w-52 h-38 z-20">
              <Floorplan2DEditor
                floorplan={floorplan}
                onChangeFloorplan={handleChangeFloorplan}
                canUndo={false}
                onUndo={handleUndo}
                activeTool="walk"
                onToolChange={setEditorTool}
                liveSyncRef={liveSyncRef}
                onWalkGuideTo={handleWalkGuideTo}
                onSelectTourStop={(idx) => goToTourStop(idx, false)}
                activeTourStopIndex={activeTourStopIndex}
                compact
                onExpandFromCompact={() => setViewMode('split')}
              />
            </div>
          )}

          {/* Bottom-Center Floating HUD: Anatomy Close-Up Inspector OR Guided Virtual Tour Dock */}
          <div className="pointer-events-none absolute bottom-3 inset-x-0 flex justify-center px-3 z-20">
            {inspectTarget !== 'none' ? (
              <GuideInspectorPanel
                inspectTarget={inspectTarget}
                onSelectTarget={setInspectTarget}
                gesture={guideGesture}
                onSelectGesture={setGuideGesture}
              />
            ) : (
              <TourDock
                stops={floorplan.tourStops}
                activeIndex={activeTourStopIndex}
                isPlaying={isTourPlaying}
                isArrivedAtStop={isArrivedAtStop}
                voiceEnabled={voiceEnabled}
                onToggleVoice={handleToggleVoice}
                onStartOrTogglePlay={handleStartOrToggleTour}
                onSelectStop={(idx) => goToTourStop(idx, false)}
                onPrev={() =>
                  goToTourStop((activeTourStopIndex ?? 0) - 1, isTourPlaying)
                }
                onNext={() =>
                  goToTourStop((activeTourStopIndex ?? 0) + 1, isTourPlaying)
                }
                onDismissCard={() => {
                  stopSpeech();
                  setIsTourPlaying(false);
                  setActiveTourStopIndex(null);
                }}
              />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
