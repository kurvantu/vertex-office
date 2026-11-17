import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  EditorTool,
  FloorMaterialType,
  FloorplanData,
  FURNITURE_CATALOG,
  FurnitureCatalogEntry,
  FurnitureItem,
  LiveSyncState,
  Point2D,
  RoomZone,
  SelectionState,
  Wall,
  WallOpening,
} from '../types/floorplan';
import { computePolygonArea, computePolygonCentroid } from '../data/presets';
import { getWallSolidSegments, pointToSegmentDistSq } from '../utils/pathfinding';
import {
  Armchair,
  DoorOpen,
  FlipHorizontal,
  Footprints,
  Maximize2,
  Minus,
  MousePointer2,
  PenTool,
  Plus,
  RotateCw,
  Square,
  Trash2,
  Undo2,
} from 'lucide-react';

interface Floorplan2DEditorProps {
  floorplan: FloorplanData;
  onChangeFloorplan: (next: FloorplanData, recordUndo?: boolean) => void;
  canUndo: boolean;
  onUndo: () => void;
  activeTool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  liveSyncRef: React.MutableRefObject<LiveSyncState>;
  onWalkGuideTo: (pt: Point2D) => void;
  onSelectTourStop: (index: number) => void;
  activeTourStopIndex: number | null;
  compact?: boolean;
  onExpandFromCompact?: () => void;
}

const FLOOR_FILL_COLORS: Record<FloorMaterialType, string> = {
  oak: '#F2E7D5',
  walnut: '#E6D8C8',
  travertine: '#F3EEE4',
  tile: '#E5EDEC',
  tatami: '#EDE9D3',
  concrete: '#EAE9E5',
};

const FLOOR_MATERIAL_LABELS: { type: FloorMaterialType; label: string; swatch: string }[] = [
  { type: 'oak', label: 'White Oak', swatch: '#D6B890' },
  { type: 'walnut', label: 'Walnut', swatch: '#8E684C' },
  { type: 'travertine', label: 'Travertine', swatch: '#EAE3D6' },
  { type: 'tile', label: 'Spa Tile', swatch: '#CFD9D8' },
  { type: 'tatami', label: 'Tatami', swatch: '#D8CFA8' },
  { type: 'concrete', label: 'Concrete', swatch: '#CBC9C3' },
];

function pointInPolygon(pt: Point2D, poly: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      zi = poly[i].z;
    const xj = poly[j].x,
      zj = poly[j].z;
    const intersect =
      zi > pt.z !== zj > pt.z && pt.x < ((xj - xi) * (pt.z - zi)) / (zj - zi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function snapCoord(v: number, step = 0.25): number {
  return Math.round(v / step) * step;
}

export const Floorplan2DEditor: React.FC<Floorplan2DEditorProps> = ({
  floorplan,
  onChangeFloorplan,
  canUndo,
  onUndo,
  activeTool,
  onToolChange,
  liveSyncRef,
  onWalkGuideTo,
  onSelectTourStop,
  activeTourStopIndex,
  compact = false,
  onExpandFromCompact,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<FurnitureCatalogEntry>(
    FURNITURE_CATALOG[0]
  );
  const [placementRotation, setPlacementRotation] = useState<number>(0);
  const [showFurnitureDrawer, setShowFurnitureDrawer] = useState(false);
  const [showDimensions, setShowDimensions] = useState(true);

  // Viewport transform: pixels per meter + center world offset
  const viewRef = useRef({
    ppm: 46,
    centerX: 0,
    centerZ: 0,
    width: 600,
    height: 500,
    initialized: false,
  });

  // Live drafting interaction state (kept in ref for zero-lag 60fps canvas rendering)
  const interactionRef = useRef<{
    hoverWorld: Point2D | null;
    wallStart: Point2D | null;
    hoverWallSnap: { wall: Wall; t: number; x: number; z: number } | null;
    draggingFurniture: {
      id: string;
      offsetX: number;
      offsetZ: number;
      moved: boolean;
      snapshotTaken: boolean;
    } | null;
    isPanning: boolean;
    panLastX: number;
    panLastY: number;
    spaceHeld: boolean;
  }>({
    hoverWorld: null,
    wallStart: null,
    hoverWallSnap: null,
    draggingFurniture: null,
    isPanning: false,
    panLastX: 0,
    panLastY: 0,
    spaceHeld: false,
  });

  const fitFloorplanToView = useCallback(() => {
    const v = viewRef.current;
    if (v.width < 20 || v.height < 20) return;
    let minX = -6.5,
      maxX = 6.5,
      minZ = -4.5,
      maxZ = 4.5;
    if (floorplan.walls.length > 0) {
      minX = Infinity;
      maxX = -Infinity;
      minZ = Infinity;
      maxZ = -Infinity;
      for (const w of floorplan.walls) {
        minX = Math.min(minX, w.start.x, w.end.x);
        maxX = Math.max(maxX, w.start.x, w.end.x);
        minZ = Math.min(minZ, w.start.z, w.end.z);
        maxZ = Math.max(maxZ, w.start.z, w.end.z);
      }
    }
    const spanX = Math.max(4, maxX - minX);
    const spanZ = Math.max(4, maxZ - minZ);
    const padX = compact ? 1.15 : 1.34;
    const padZ = compact ? 1.18 : 1.42;
    v.ppm = Math.max(
      10,
      Math.min(110, Math.min(v.width / (spanX * padX), v.height / (spanZ * padZ)))
    );
    v.centerX = (minX + maxX) * 0.5 - (compact ? 0 : 0.25);
    v.centerZ = (minZ + maxZ) * 0.5;
    v.initialized = true;
  }, [floorplan.walls, compact]);

  // Refit when floorplan preset changes or compact mode changes
  const prevPlanId = useRef(floorplan.id);
  useEffect(() => {
    if (prevPlanId.current !== floorplan.id) {
      prevPlanId.current = floorplan.id;
      setSelection(null);
      interactionRef.current.wallStart = null;
      fitFloorplanToView();
    }
  }, [floorplan.id, fitFloorplanToView]);

  useEffect(() => {
    fitFloorplanToView();
  }, [compact, fitFloorplanToView]);

  // Close wall drawing chain on tool change
  useEffect(() => {
    interactionRef.current.wallStart = null;
    if (activeTool === 'furniture') {
      setShowFurnitureDrawer(true);
    } else {
      setShowFurnitureDrawer(false);
    }
  }, [activeTool]);

  const screenToWorld = (sx: number, sy: number): Point2D => {
    const v = viewRef.current;
    return {
      x: v.centerX + (sx - v.width * 0.5) / v.ppm,
      z: v.centerZ + (sy - v.height * 0.5) / v.ppm,
    };
  };

  const snapWallVertex = (raw: Point2D): Point2D => {
    // Magnetic snap to existing wall endpoints first
    for (const w of floorplan.walls) {
      for (const ep of [w.start, w.end]) {
        if (Math.hypot(raw.x - ep.x, raw.z - ep.z) < 0.32) {
          return { x: ep.x, z: ep.z };
        }
      }
    }
    return { x: snapCoord(raw.x, 0.25), z: snapCoord(raw.z, 0.25) };
  };

  const findNearestWallSnap = (pt: Point2D): { wall: Wall; t: number; x: number; z: number } | null => {
    let best: { wall: Wall; t: number; x: number; z: number; d: number } | null = null;
    for (const w of floorplan.walls) {
      const len = Math.hypot(w.end.x - w.start.x, w.end.z - w.start.z);
      if (len < 1.1) continue;
      const res = pointToSegmentDistSq(pt.x, pt.z, w.start.x, w.start.z, w.end.x, w.end.z);
      const d = Math.sqrt(res.distSq);
      if (d < 0.65) {
        const margin = Math.min(0.35, 0.62 / len);
        const clampedT = Math.max(margin, Math.min(1 - margin, res.t));
        const sx = w.start.x + (w.end.x - w.start.x) * clampedT;
        const sz = w.start.z + (w.end.z - w.start.z) * clampedT;
        if (!best || d < best.d) {
          best = { wall: w, t: clampedT, x: sx, z: sz, d };
        }
      }
    }
    return best ? { wall: best.wall, t: best.t, x: best.x, z: best.z } : null;
  };

  // Delete & Rotate actions for selected element
  const deleteSelection = useCallback(() => {
    if (!selection) return;
    if (selection.kind === 'furniture') {
      onChangeFloorplan({
        ...floorplan,
        furniture: floorplan.furniture.filter((f) => f.id !== selection.id),
      });
      setSelection(null);
    } else if (selection.kind === 'opening') {
      onChangeFloorplan({
        ...floorplan,
        openings: floorplan.openings.filter((o) => o.id !== selection.id),
      });
      setSelection(null);
    } else if (selection.kind === 'wall') {
      onChangeFloorplan({
        ...floorplan,
        walls: floorplan.walls.filter((w) => w.id !== selection.id),
        openings: floorplan.openings.filter((o) => o.wallId !== selection.id),
      });
      setSelection(null);
    }
  }, [selection, floorplan, onChangeFloorplan]);

  const rotateSelectedFurniture = useCallback(() => {
    if (activeTool === 'furniture') {
      setPlacementRotation((r) => (r + Math.PI / 4) % (Math.PI * 2));
      return;
    }
    if (selection?.kind === 'furniture') {
      onChangeFloorplan({
        ...floorplan,
        furniture: floorplan.furniture.map((f) =>
          f.id === selection.id ? { ...f, rotation: (f.rotation + Math.PI / 4) % (Math.PI * 2) } : f
        ),
      });
    }
  }, [activeTool, selection, floorplan, onChangeFloorplan]);

  const flipSelectedDoor = useCallback(() => {
    if (selection?.kind !== 'opening') return;
    onChangeFloorplan({
      ...floorplan,
      openings: floorplan.openings.map((o) => {
        if (o.id !== selection.id || o.type !== 'door') return o;
        const curSwing = o.swingDir ?? 1;
        const curHinge = o.hingeSide ?? 'start';
        if (curSwing === 1) return { ...o, swingDir: -1 };
        return { ...o, swingDir: 1, hingeSide: curHinge === 'start' ? 'end' : 'start' };
      }),
    });
  }, [selection, floorplan, onChangeFloorplan]);

  const updateSelectedRoomFloor = (mat: FloorMaterialType) => {
    if (selection?.kind !== 'room') return;
    onChangeFloorplan({
      ...floorplan,
      rooms: floorplan.rooms.map((r) => (r.id === selection.id ? { ...r, floorMaterial: mat } : r)),
    });
  };

  // Keyboard shortcuts for 2D editor
  useEffect(() => {
    if (compact) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        interactionRef.current.spaceHeld = true;
      } else if (e.key === 'Escape') {
        interactionRef.current.wallStart = null;
        setSelection(null);
        setShowFurnitureDrawer(false);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection && selection.kind !== 'room') {
          e.preventDefault();
          deleteSelection();
        }
      } else if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey) {
        if (selection?.kind === 'furniture' || activeTool === 'furniture') {
          rotateSelectedFurniture();
        }
      } else if (e.key.toLowerCase() === 'z' && (e.metaKey || e.ctrlKey)) {
        if (canUndo) {
          e.preventDefault();
          onUndo();
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        interactionRef.current.spaceHeld = false;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [compact, selection, activeTool, canUndo, onUndo, deleteSelection, rotateSelectedFurniture]);

  // Keep latest state in a ref for the smooth 60fps canvas rendering loop
  const drawStateRef = useRef({
    floorplan,
    activeTool,
    selection,
    selectedCatalogItem,
    placementRotation,
    activeTourStopIndex,
    showDimensions,
    compact,
  });
  drawStateRef.current = {
    floorplan,
    activeTool,
    selection,
    selectedCatalogItem,
    placementRotation,
    activeTourStopIndex,
    showDimensions,
    compact,
  };

  // ResizeObserver + HiDPI 60fps Architectural Blueprint Renderer
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      const wasInit = viewRef.current.initialized;
      viewRef.current.width = w;
      viewRef.current.height = h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!wasInit || drawStateRef.current.compact) {
        fitFloorplanToView();
      }
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(container);
    handleResize();

    const drawFurnitureTopDown = (
      c: CanvasRenderingContext2D,
      type: FurnitureItem['type'],
      W: number,
      D: number,
      ppm: number,
      isSelected: boolean,
      isGhost = false
    ) => {
      const pw = W * ppm;
      const pd = D * ppm;
      const hw = pw * 0.5;
      const hd = pd * 0.5;

      c.save();
      if (isGhost) c.globalAlpha = 0.65;

      c.strokeStyle = isSelected ? '#C85A32' : '#57534E';
      c.lineWidth = isSelected ? 1.8 : 1.05;
      c.fillStyle = '#FDFCFA';

      const rRect = (x: number, y: number, w: number, h: number, r: number) => {
        const rr = Math.min(r, Math.abs(w) * 0.45, Math.abs(h) * 0.45);
        c.beginPath();
        c.roundRect(x, y, w, h, rr);
      };

      switch (type) {
        case 'rug': {
          c.fillStyle = 'rgba(232, 223, 208, 0.52)';
          c.strokeStyle = isSelected ? '#C85A32' : 'rgba(148, 130, 108, 0.55)';
          c.setLineDash([4, 3]);
          rRect(-hw, -hd, pw, pd, 3);
          c.fill();
          c.stroke();
          c.setLineDash([]);
          break;
        }
        case 'sofa': {
          rRect(-hw, -hd, pw, pd, 3);
          c.fill();
          c.stroke();
          // Backrest rail along -Z (top) + arms + 3 cushions
          const arm = pw * 0.08;
          const back = pd * 0.22;
          c.strokeRect(-hw + arm, -hd + back, pw - arm * 2, pd - back);
          const cw = (pw - arm * 2) / 3;
          for (let i = 1; i < 3; i++) {
            c.beginPath();
            c.moveTo(-hw + arm + cw * i, -hd + back);
            c.lineTo(-hw + arm + cw * i, hd);
            c.stroke();
          }
          break;
        }
        case 'armchair': {
          rRect(-hw, -hd, pw, pd, 4);
          c.fill();
          c.stroke();
          rRect(-hw * 0.72, -hd * 0.52, pw * 0.72, pd * 0.76, 2);
          c.stroke();
          break;
        }
        case 'bed_king': {
          rRect(-hw, -hd, pw, pd, 3);
          c.fill();
          c.stroke();
          // Headboard bar
          c.fillStyle = '#ECE6DA';
          c.fillRect(-hw, -hd, pw, pd * 0.08);
          c.strokeRect(-hw, -hd, pw, pd * 0.08);
          // Two pillows
          c.fillStyle = '#FFFFFF';
          rRect(-hw * 0.82, -hd * 0.76, pw * 0.36, pd * 0.18, 3);
          c.fill();
          c.stroke();
          rRect(hw * 0.1, -hd * 0.76, pw * 0.36, pd * 0.18, 3);
          c.fill();
          c.stroke();
          // Folded duvet line
          c.beginPath();
          c.moveTo(-hw, -hd * 0.26);
          c.lineTo(hw, -hd * 0.26);
          c.stroke();
          break;
        }
        case 'dining_set': {
          // Chairs peeking around sides
          const cols = W >= 1.7 ? 3 : 2;
          for (let i = 0; i < cols; i++) {
            const cx = -hw * 0.62 + (cols > 1 ? (i / (cols - 1)) * (pw * 0.62) : 0);
            const cw = Math.min(pw * 0.22, 0.4 * ppm);
            rRect(cx - cw * 0.5, -hd - 3, cw, 6, 2);
            c.fill();
            c.stroke();
            rRect(cx - cw * 0.5, hd - 3, cw, 6, 2);
            c.fill();
            c.stroke();
          }
          c.fillStyle = '#F7F1E7';
          rRect(-hw * 0.92, -hd * 0.85, pw * 0.92, pd * 0.85, 3);
          c.fill();
          c.stroke();
          break;
        }
        case 'kitchen_island': {
          c.fillStyle = '#F7F5F0';
          rRect(-hw, -hd, pw, pd, 2);
          c.fill();
          c.stroke();
          // Sink symbol
          rRect(-hw * 0.52, -hd * 0.55, pw * 0.26, pd * 0.44, 2);
          c.stroke();
          // 3 stools on +Z
          for (const sx of [-0.55, 0, 0.55]) {
            c.beginPath();
            c.arc(sx * hw, hd * 0.68, Math.max(2.5, 0.13 * ppm), 0, Math.PI * 2);
            c.fill();
            c.stroke();
          }
          break;
        }
        case 'kitchen_counter': {
          c.fillStyle = '#F6F3EC';
          c.fillRect(-hw, -hd, pw, pd);
          c.strokeRect(-hw, -hd, pw, pd);
          // 4 induction cooktop rings
          const r = Math.max(2, 0.07 * ppm);
          for (const bx of [0.1, 0.28]) {
            for (const bz of [-0.2, 0.22]) {
              c.beginPath();
              c.arc(bx * pw * 0.5, bz * pd * 0.5, r, 0, Math.PI * 2);
              c.stroke();
            }
          }
          break;
        }
        case 'bathtub': {
          rRect(-hw, -hd, pw, pd, Math.min(hw, hd) * 0.85);
          c.fill();
          c.stroke();
          c.fillStyle = '#E6F2F4';
          rRect(-hw * 0.84, -hd * 0.74, pw * 0.84, pd * 0.74, Math.min(hw, hd) * 0.72);
          c.fill();
          c.stroke();
          break;
        }
        case 'vanity': {
          c.fillRect(-hw, -hd, pw, pd);
          c.strokeRect(-hw, -hd, pw, pd);
          c.beginPath();
          c.ellipse(0, 0, pw * 0.2, pd * 0.28, 0, 0, Math.PI * 2);
          c.stroke();
          break;
        }
        case 'plant': {
          const rad = Math.min(hw, hd) * 0.85;
          c.fillStyle = '#DCE8D8';
          c.strokeStyle = isSelected ? '#C85A32' : '#4E704B';
          c.beginPath();
          c.arc(0, 0, rad, 0, Math.PI * 2);
          c.fill();
          c.stroke();
          // Botanical leaf lines
          for (let a = 0; a < 6; a++) {
            const ang = (a * Math.PI) / 3;
            c.beginPath();
            c.moveTo(0, 0);
            c.lineTo(Math.cos(ang) * rad * 0.78, Math.sin(ang) * rad * 0.78);
            c.stroke();
          }
          break;
        }
        case 'floor_lamp': {
          const rad = Math.min(hw, hd) * 0.75;
          c.fillStyle = '#FFF6E0';
          c.beginPath();
          c.arc(0, 0, rad, 0, Math.PI * 2);
          c.fill();
          c.stroke();
          c.beginPath();
          c.arc(0, 0, rad * 0.25, 0, Math.PI * 2);
          c.stroke();
          break;
        }
        default: {
          c.fillStyle = '#F7F3EB';
          rRect(-hw, -hd, pw, pd, 2);
          c.fill();
          c.stroke();
          break;
        }
      }

      if (isSelected) {
        c.strokeStyle = 'rgba(200, 90, 50, 0.45)';
        c.lineWidth = 1;
        c.setLineDash([3, 2]);
        c.strokeRect(-hw - 4, -hd - 4, pw + 8, pd + 8);
        c.setLineDash([]);
      }

      c.restore();
    };

    let rafId = 0;
    const render = (now: number) => {
      rafId = requestAnimationFrame(render);
      const v = viewRef.current;
      const st = drawStateRef.current;
      const inter = interactionRef.current;
      const sync = liveSyncRef.current;
      const fp = st.floorplan;
      const ppm = v.ppm;

      const wx = (x: number) => v.width * 0.5 + (x - v.centerX) * ppm;
      const wz = (z: number) => v.height * 0.5 + (z - v.centerZ) * ppm;

      // 1. Alabaster architectural paper background
      ctx.fillStyle = '#F8F7F3';
      ctx.fillRect(0, 0, v.width, v.height);

      // 2. Metric blueprint drafting grid (0.5m fine, 1.0m major)
      if (!st.compact) {
        const leftW = Math.floor(v.centerX - v.width / (2 * ppm)) - 1;
        const rightW = Math.ceil(v.centerX + v.width / (2 * ppm)) + 1;
        const topW = Math.floor(v.centerZ - v.height / (2 * ppm)) - 1;
        const botW = Math.ceil(v.centerZ + v.height / (2 * ppm)) + 1;

        if (ppm >= 28) {
          ctx.strokeStyle = 'rgba(28, 27, 25, 0.032)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let x = leftW; x <= rightW; x += 0.5) {
            if (Math.abs(x % 1) < 0.01) continue;
            const sx = Math.round(wx(x)) + 0.5;
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, v.height);
          }
          for (let z = topW; z <= botW; z += 0.5) {
            if (Math.abs(z % 1) < 0.01) continue;
            const sz = Math.round(wz(z)) + 0.5;
            ctx.moveTo(0, sz);
            ctx.lineTo(v.width, sz);
          }
          ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(28, 27, 25, 0.068)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = leftW; x <= rightW; x += 1) {
          const sx = Math.round(wx(x)) + 0.5;
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx, v.height);
        }
        for (let z = topW; z <= botW; z += 1) {
          const sz = Math.round(wz(z)) + 0.5;
          ctx.moveTo(0, sz);
          ctx.lineTo(v.width, sz);
        }
        ctx.stroke();
      }

      // 3. Room Zone fills + subtle flooring pattern
      for (const room of fp.rooms) {
        if (room.polygon.length < 3) continue;
        ctx.beginPath();
        ctx.moveTo(wx(room.polygon[0].x), wz(room.polygon[0].z));
        for (let i = 1; i < room.polygon.length; i++) {
          ctx.lineTo(wx(room.polygon[i].x), wz(room.polygon[i].z));
        }
        ctx.closePath();
        ctx.fillStyle = FLOOR_FILL_COLORS[room.floorMaterial] ?? '#F2E7D5';
        ctx.fill();

        if (st.selection?.kind === 'room' && st.selection.id === room.id) {
          ctx.strokeStyle = '#C85A32';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // 4. Top-down CAD Furniture vectors (rugs first, then solid pieces)
      const sortedFurn = [...fp.furniture].sort((a, b) =>
        a.type === 'rug' ? -1 : b.type === 'rug' ? 1 : 0
      );
      if (!st.compact || ppm > 14) {
        for (const f of sortedFurn) {
          ctx.save();
          ctx.translate(wx(f.x), wz(f.z));
          // Note: Three.js rotation.y rotates +X toward -Z; on 2D screen (+X right, +Z down), canvas rotate(-f.rotation)!
          ctx.rotate(-f.rotation);
          drawFurnitureTopDown(
            ctx,
            f.type,
            f.width,
            f.depth,
            ppm,
            st.selection?.kind === 'furniture' && st.selection.id === f.id
          );
          ctx.restore();
        }
      }

      // 5. Room Labels & Calculated Areas (m²)
      if (!st.compact && ppm >= 22) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const room of fp.rooms) {
          const area = computePolygonArea(room.polygon);
          if (area < 4.5) continue;
          const cen = computePolygonCentroid(room.polygon);
          const lx = wx(cen.x + (room.labelOffset?.x ?? 0));
          const lz = wz(cen.z + (room.labelOffset?.z ?? 0));

          ctx.font = '600 10.5px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = 'rgba(28, 27, 25, 0.72)';
          ctx.fillText(room.name.toUpperCase(), lx, lz - 6);

          ctx.font = '500 9.5px "JetBrains Mono", monospace';
          ctx.fillStyle = 'rgba(107, 104, 96, 0.85)';
          ctx.fillText(`${area.toFixed(1)} m²`, lx, lz + 7);
        }
      }

      // 6. Structural Walls (split cleanly at door & window openings!) + Door Swing Arcs + Windows
      for (const wall of fp.walls) {
        const dx = wall.end.x - wall.start.x;
        const dz = wall.end.z - wall.start.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.05) continue;

        const isWallSel = st.selection?.kind === 'wall' && st.selection.id === wall.id;
        const solidSpans = getWallSolidSegments(wall, fp.openings, ['door', 'window']);
        const thickPx = Math.max(st.compact ? 2.5 : 4.5, wall.thickness * ppm);

        // Draw solid wall sub-segments
        ctx.strokeStyle = isWallSel ? '#C85A32' : '#242320';
        ctx.lineWidth = thickPx;
        ctx.lineCap = 'square';
        for (const sp of solidSpans) {
          ctx.beginPath();
          ctx.moveTo(wx(wall.start.x + dx * sp.t0), wz(wall.start.z + dz * sp.t0));
          ctx.lineTo(wx(wall.start.x + dx * sp.t1), wz(wall.start.z + dz * sp.t1));
          ctx.stroke();
        }
        ctx.lineCap = 'butt';

        // Draw openings belonging to this wall
        const ang = Math.atan2(dz, dx);
        const wOpenings = fp.openings.filter((o) => o.wallId === wall.id);
        for (const op of wOpenings) {
          const halfT = Math.min(op.width * 0.5, len * 0.45) / len;
          const t0 = Math.max(0.02, op.t - halfT);
          const t1 = Math.min(0.98, op.t + halfT);
          const ax = wx(wall.start.x + dx * t0);
          const az = wz(wall.start.z + dz * t0);
          const bx = wx(wall.start.x + dx * t1);
          const bz = wz(wall.start.z + dz * t1);
          const openPx = Math.hypot(bx - ax, bz - az);
          const isOpSel = st.selection?.kind === 'opening' && st.selection.id === op.id;

          if (op.type === 'window') {
            // Architectural recessed glazed double-line window symbol
            ctx.save();
            ctx.translate((ax + bx) * 0.5, (az + bz) * 0.5);
            ctx.rotate(ang);
            ctx.fillStyle = '#D9ECF6';
            ctx.fillRect(-openPx * 0.5, -thickPx * 0.48, openPx, thickPx * 0.96);
            ctx.strokeStyle = isOpSel ? '#C85A32' : '#3C5A6E';
            ctx.lineWidth = isOpSel ? 1.8 : 1.1;
            ctx.strokeRect(-openPx * 0.5, -thickPx * 0.48, openPx, thickPx * 0.96);
            // Center glazing mullion line
            ctx.beginPath();
            ctx.moveTo(-openPx * 0.5, 0);
            ctx.lineTo(openPx * 0.5, 0);
            ctx.stroke();
            ctx.restore();
          } else if (!st.compact) {
            // Classic architectural 90-degree Door Leaf + Quarter-Circle Swing Arc!
            const swingDir = op.swingDir ?? 1;
            const hingeStart = (op.hingeSide ?? 'start') === 'start';
            const leafPx = Math.min(openPx * 0.92, 0.95 * ppm);

            ctx.save();
            ctx.translate(hingeStart ? ax : bx, hingeStart ? az : bz);
            ctx.rotate(ang);

            const closedAngle = hingeStart ? 0 : Math.PI;
            // Local +Y corresponds to swingDir = +1 normal (-sin a, cos a)
            const openAngle = swingDir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;

            // Quarter-circle dashed swing arc
            ctx.strokeStyle = isOpSel ? '#C85A32' : 'rgba(60, 56, 50, 0.55)';
            ctx.lineWidth = isOpSel ? 1.6 : 1.05;
            ctx.setLineDash([3, 2.5]);
            ctx.beginPath();
            const anticlockwise = hingeStart ? swingDir < 0 : swingDir > 0;
            ctx.arc(0, 0, leafPx, closedAngle, openAngle, anticlockwise);
            ctx.stroke();
            ctx.setLineDash([]);

            // Solid timber door leaf at open position
            ctx.strokeStyle = isOpSel ? '#C85A32' : '#7C5736';
            ctx.lineWidth = isOpSel ? 2.6 : 2.1;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(openAngle) * leafPx, Math.sin(openAngle) * leafPx);
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      // 7. Clean Exterior Architectural Dimension Lines (in meters)
      if (!st.compact && st.showDimensions && ppm >= 24 && fp.walls.length > 0) {
        let minX = Infinity,
          maxX = -Infinity,
          minZ = Infinity,
          maxZ = -Infinity;
        for (const w of fp.walls) {
          minX = Math.min(minX, w.start.x, w.end.x);
          maxX = Math.max(maxX, w.start.x, w.end.x);
          minZ = Math.min(minZ, w.start.z, w.end.z);
          maxZ = Math.max(maxZ, w.start.z, w.end.z);
        }

        const drawDimLine = (
          x1: number,
          y1: number,
          x2: number,
          y2: number,
          label: string,
          vertical = false
        ) => {
          ctx.save();
          ctx.strokeStyle = 'rgba(107, 104, 96, 0.55)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();

          // Architectural 45° tick slashes at ends
          const t = 4;
          for (const [tx, ty] of [
            [x1, y1],
            [x2, y2],
          ]) {
            ctx.beginPath();
            ctx.moveTo(tx - t, ty + t);
            ctx.lineTo(tx + t, ty - t);
            ctx.stroke();
          }

          const mx = (x1 + x2) * 0.5;
          const my = (y1 + y2) * 0.5;
          ctx.translate(mx, my);
          if (vertical) ctx.rotate(-Math.PI / 2);

          ctx.font = '500 9.5px "JetBrains Mono", monospace';
          const tw = ctx.measureText(label).width + 8;
          ctx.fillStyle = '#F8F7F3';
          ctx.fillRect(-tw * 0.5, -6, tw, 12);
          ctx.fillStyle = '#57534E';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, 0, 0);
          ctx.restore();
        };

        // Top total span dimension
        const topY = wz(minZ) - 22;
        drawDimLine(wx(minX), topY, wx(maxX), topY, `${(maxX - minX).toFixed(1)} m`, false);

        // Right total depth dimension
        const rightX = wx(maxX) + 22;
        drawDimLine(rightX, wz(minZ), rightX, wz(maxZ), `${(maxZ - minZ).toFixed(1)} m`, true);

        // Individual north exterior wall segment callouts
        for (const w of fp.walls) {
          if (
            Math.abs(w.start.z - minZ) < 0.05 &&
            Math.abs(w.end.z - minZ) < 0.05 &&
            Math.abs(w.end.x - w.start.x) < maxX - minX - 0.2
          ) {
            const segLen = Math.hypot(w.end.x - w.start.x, w.end.z - w.start.z);
            if (segLen >= 1.5) {
              drawDimLine(
                wx(w.start.x),
                wz(minZ) - 10,
                wx(w.end.x),
                wz(minZ) - 10,
                `${segLen.toFixed(1)}m`,
                false
              );
            }
          }
        }
      }

      // 8. Virtual Tour Stop Numbered Waypoints
      fp.tourStops.forEach((stop, idx) => {
        const sx = wx(stop.guidePos.x);
        const sz = wz(stop.guidePos.z);
        const isActive = st.activeTourStopIndex === idx;
        const r = st.compact ? 6.5 : 8.5;

        ctx.save();
        ctx.beginPath();
        ctx.arc(sx, sz, r, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? '#C85A32' : 'rgba(255, 255, 255, 0.92)';
        ctx.fill();
        ctx.strokeStyle = isActive ? '#9A3D1D' : 'rgba(28, 27, 25, 0.35)';
        ctx.lineWidth = 1.25;
        ctx.stroke();

        if (!st.compact) {
          ctx.font = '700 9px "JetBrains Mono", monospace';
          ctx.fillStyle = isActive ? '#FFFFFF' : '#3F3D39';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(idx + 1), sx, sz + 0.5);
        }
        ctx.restore();
      });

      // 9. Live 3D Camera Viewing Cone (frustum indicator)
      {
        const cx = wx(sync.cameraPos.x);
        const cz = wz(sync.cameraPos.z);
        const coneLen = st.compact ? 30 : 48;
        const halfFov = Math.min(0.62, Math.max(0.28, sync.cameraFovRad * 0.42));
        // Camera yaw: atan2(fwdX, fwdZ) -> canvas angle is atan2(fwdZ, fwdX) = PI/2 - yaw
        const cAng = Math.PI * 0.5 - sync.cameraYaw;

        ctx.save();
        const grad = ctx.createRadialGradient(cx, cz, 2, cx, cz, coneLen);
        grad.addColorStop(0, 'rgba(61, 90, 82, 0.24)');
        grad.addColorStop(1, 'rgba(61, 90, 82, 0.0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(cx, cz);
        ctx.arc(cx, cz, coneLen, cAng - halfFov, cAng + halfFov);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx, cz, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#3D5A52';
        ctx.fill();
        ctx.restore();
      }

      // 10. Live 3D Human Guide Walking Path & Avatar Marker!
      const gx = wx(sync.guidePos.x);
      const gz = wz(sync.guidePos.z);

      if (sync.guidePath.length > 0) {
        ctx.save();
        ctx.strokeStyle = '#C85A32';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = -(now * 0.025);
        ctx.beginPath();
        ctx.moveTo(gx, gz);
        for (const pt of sync.guidePath) {
          ctx.lineTo(wx(pt.x), wz(pt.z));
        }
        ctx.stroke();
        ctx.setLineDash([]);

        const last = sync.guidePath[sync.guidePath.length - 1];
        ctx.beginPath();
        ctx.arc(wx(last.x), wz(last.z), 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#C85A32';
        ctx.fill();
        ctx.restore();
      }

      // Elena live position + heading direction wedge
      {
        const gAng = Math.PI * 0.5 - sync.guideYaw;
        const pulse = 1 + Math.sin(now * 0.004) * 0.14;
        ctx.save();
        ctx.translate(gx, gz);

        // Soft pulsing halo
        ctx.beginPath();
        ctx.arc(0, 0, (st.compact ? 9 : 13) * pulse, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(200, 90, 50, 0.18)';
        ctx.fill();

        // Directional facing pointer triangle
        ctx.save();
        ctx.rotate(gAng);
        ctx.fillStyle = '#C85A32';
        ctx.beginPath();
        ctx.moveTo(st.compact ? 11 : 14, 0);
        ctx.lineTo(4, -4.5);
        ctx.lineTo(4, 4.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Center guide dot
        ctx.beginPath();
        ctx.arc(0, 0, st.compact ? 5.5 : 7, 0, Math.PI * 2);
        ctx.fillStyle = '#C85A32';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#FFFFFF';
        ctx.stroke();

        // Micro guide badge
        if (!st.compact) {
          ctx.font = '700 8.5px "Plus Jakarta Sans", sans-serif';
          const tag = 'GUIDE';
          const tw = ctx.measureText(tag).width + 8;
          ctx.fillStyle = 'rgba(28, 27, 25, 0.85)';
          ctx.beginPath();
          ctx.roundRect(-tw * 0.5, -22, tw, 12, 6);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(tag, 0, -16);
        }
        ctx.restore();
      }

      // 11. Interactive Drafting Tool Previews (Wall / Door / Window / Furniture / Walk)
      if (!st.compact && inter.hoverWorld) {
        if (st.activeTool === 'wall') {
          const snapped = snapWallVertex(inter.hoverWorld);
          if (inter.wallStart) {
            // Optional gentle orthogonal assist when nearly horizontal/vertical
            let endPt = { ...snapped };
            if (Math.abs(endPt.x - inter.wallStart.x) < 0.2) endPt.x = inter.wallStart.x;
            if (Math.abs(endPt.z - inter.wallStart.z) < 0.2) endPt.z = inter.wallStart.z;

            const sx1 = wx(inter.wallStart.x);
            const sz1 = wz(inter.wallStart.z);
            const sx2 = wx(endPt.x);
            const sz2 = wz(endPt.z);
            const len = Math.hypot(endPt.x - inter.wallStart.x, endPt.z - inter.wallStart.z);

            ctx.save();
            ctx.strokeStyle = 'rgba(200, 90, 50, 0.78)';
            ctx.lineWidth = Math.max(4, 0.16 * ppm);
            ctx.beginPath();
            ctx.moveTo(sx1, sz1);
            ctx.lineTo(sx2, sz2);
            ctx.stroke();

            if (len > 0.1) {
              const mx = (sx1 + sx2) * 0.5;
              const mz = (sz1 + sz2) * 0.5 - 14;
              const txt = `${len.toFixed(2)} m`;
              ctx.font = '600 10px "JetBrains Mono", monospace';
              const tw = ctx.measureText(txt).width + 10;
              ctx.fillStyle = '#1C1B19';
              ctx.beginPath();
              ctx.roundRect(mx - tw * 0.5, mz - 8, tw, 16, 4);
              ctx.fill();
              ctx.fillStyle = '#FFFFFF';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(txt, mx, mz);
            }
            ctx.restore();
          }
          // Vertex snap reticle
          ctx.beginPath();
          ctx.arc(wx(snapped.x), wz(snapped.z), 5, 0, Math.PI * 2);
          ctx.fillStyle = '#C85A32';
          ctx.fill();
        } else if (
          (st.activeTool === 'door' || st.activeTool === 'window') &&
          inter.hoverWallSnap
        ) {
          const hs = inter.hoverWallSnap;
          const w = hs.wall;
          const ang = Math.atan2(w.end.z - w.start.z, w.end.x - w.start.x);
          const wPx = (st.activeTool === 'door' ? 1.05 : 1.6) * ppm;
          ctx.save();
          ctx.translate(wx(hs.x), wz(hs.z));
          ctx.rotate(ang);
          ctx.fillStyle =
            st.activeTool === 'door' ? 'rgba(200, 90, 50, 0.35)' : 'rgba(56, 130, 180, 0.4)';
          ctx.strokeStyle = st.activeTool === 'door' ? '#C85A32' : '#2563EB';
          ctx.lineWidth = 2;
          ctx.fillRect(-wPx * 0.5, -6, wPx, 12);
          ctx.strokeRect(-wPx * 0.5, -6, wPx, 12);
          ctx.restore();
        } else if (st.activeTool === 'furniture') {
          const item = st.selectedCatalogItem;
          const px = wx(snapCoord(inter.hoverWorld.x, 0.1));
          const pz = wz(snapCoord(inter.hoverWorld.z, 0.1));
          ctx.save();
          ctx.translate(px, pz);
          ctx.rotate(-st.placementRotation);
          drawFurnitureTopDown(ctx, item.type, item.width, item.depth, ppm, true, true);
          ctx.restore();
        } else if (st.activeTool === 'walk') {
          const px = wx(inter.hoverWorld.x);
          const pz = wz(inter.hoverWorld.z);
          ctx.save();
          ctx.strokeStyle = '#C85A32';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(px, pz, 9, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(px, pz, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = '#C85A32';
          ctx.fill();
          ctx.restore();
        }
      }

      // 12. Crisp Architectural Scale Bar (bottom-right)
      if (!st.compact) {
        const barMeters = ppm > 55 ? 1 : 2;
        const barPx = barMeters * ppm;
        const bx = v.width - 16 - barPx;
        const by = v.height - 16;
        ctx.save();
        ctx.strokeStyle = 'rgba(28, 27, 25, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(bx, by - 4);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx + barPx, by);
        ctx.lineTo(bx + barPx, by - 4);
        ctx.moveTo(bx + barPx * 0.5, by);
        ctx.lineTo(bx + barPx * 0.5, by - 3);
        ctx.stroke();

        ctx.font = '500 9.5px "JetBrains Mono", monospace';
        ctx.fillStyle = '#6B6860';
        ctx.textAlign = 'right';
        ctx.fillText(`${barMeters} m`, bx + barPx, by - 7);
        ctx.textAlign = 'left';
        ctx.fillText('0', bx, by - 7);
        ctx.restore();
      }
    };

    rafId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitFloorplanToView, liveSyncRef]);

  // Pointer handlers for 2D Blueprint
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);
    const inter = interactionRef.current;

    // In compact mini-map mode (inside Virtual Tour), clicking checks tour stops or walks guide directly!
    if (compact) {
      for (let i = 0; i < floorplan.tourStops.length; i++) {
        const ts = floorplan.tourStops[i];
        if (Math.hypot(world.x - ts.guidePos.x, world.z - ts.guidePos.z) < 0.55) {
          onSelectTourStop(i);
          return;
        }
      }
      onWalkGuideTo(world);
      return;
    }

    // Middle-click, right-click, or Space+drag pans blueprint
    if (e.button === 1 || e.button === 2 || inter.spaceHeld) {
      inter.isPanning = true;
      inter.panLastX = e.clientX;
      inter.panLastY = e.clientY;
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (e.button !== 0) return;

    if (activeTool === 'walk') {
      // Check if user clicked a numbered Tour Stop first
      for (let i = 0; i < floorplan.tourStops.length; i++) {
        const ts = floorplan.tourStops[i];
        if (Math.hypot(world.x - ts.guidePos.x, world.z - ts.guidePos.z) < 0.34) {
          onSelectTourStop(i);
          return;
        }
      }
      onWalkGuideTo(world);
      return;
    }

    if (activeTool === 'wall') {
      const snapped = snapWallVertex(world);
      if (!inter.wallStart) {
        inter.wallStart = snapped;
      } else {
        let endPt = { ...snapped };
        if (Math.abs(endPt.x - inter.wallStart.x) < 0.2) endPt.x = inter.wallStart.x;
        if (Math.abs(endPt.z - inter.wallStart.z) < 0.2) endPt.z = inter.wallStart.z;
        const len = Math.hypot(endPt.x - inter.wallStart.x, endPt.z - inter.wallStart.z);
        if (len >= 0.35) {
          const newWall: Wall = {
            id: `w-user-${Date.now()}`,
            start: inter.wallStart,
            end: endPt,
            thickness: 0.16,
            height: 2.85,
          };
          onChangeFloorplan({
            ...floorplan,
            walls: [...floorplan.walls, newWall],
          });
          // Chain smoothly or stop if closed onto an existing endpoint
          inter.wallStart = null;
        }
      }
      return;
    }

    if (activeTool === 'door' || activeTool === 'window') {
      const snap = findNearestWallSnap(world);
      if (snap) {
        const isDoor = activeTool === 'door';
        const newOp: WallOpening = {
          id: `${isDoor ? 'd' : 'win'}-user-${Date.now()}`,
          wallId: snap.wall.id,
          type: isDoor ? 'door' : 'window',
          t: snap.t,
          width: isDoor ? 1.05 : 1.6,
          swingDir: 1,
          hingeSide: 'start',
          sillHeight: isDoor ? undefined : 0.78,
          headHeight: isDoor ? 2.18 : 2.3,
        };
        onChangeFloorplan({
          ...floorplan,
          openings: [...floorplan.openings, newOp],
        });
        setSelection({ kind: 'opening', id: newOp.id });
      }
      return;
    }

    if (activeTool === 'furniture') {
      const placed: FurnitureItem = {
        id: `f-user-${Date.now()}`,
        type: selectedCatalogItem.type,
        label: selectedCatalogItem.label,
        x: snapCoord(world.x, 0.1),
        z: snapCoord(world.z, 0.1),
        rotation: placementRotation,
        width: selectedCatalogItem.width,
        depth: selectedCatalogItem.depth,
      };
      onChangeFloorplan({
        ...floorplan,
        furniture: [...floorplan.furniture, placed],
      });
      setSelection({ kind: 'furniture', id: placed.id });
      return;
    }

    // SELECT tool hit testing (Priority: Tour Stop -> Opening -> Furniture -> Wall -> Room -> Pan)
    for (let i = 0; i < floorplan.tourStops.length; i++) {
      const ts = floorplan.tourStops[i];
      if (Math.hypot(world.x - ts.guidePos.x, world.z - ts.guidePos.z) < 0.28) {
        onSelectTourStop(i);
        return;
      }
    }

    // Check openings
    for (const op of floorplan.openings) {
      const w = floorplan.walls.find((wl) => wl.id === op.wallId);
      if (!w) continue;
      const ox = w.start.x + (w.end.x - w.start.x) * op.t;
      const oz = w.start.z + (w.end.z - w.start.z) * op.t;
      if (Math.hypot(world.x - ox, world.z - oz) < Math.max(0.32, op.width * 0.42)) {
        setSelection({ kind: 'opening', id: op.id });
        return;
      }
    }

    // Check furniture (non-rugs before rugs so sofas on top of rugs pick easily!)
    const pickOrder = [...floorplan.furniture].sort((a, b) =>
      a.type === 'rug' ? 1 : b.type === 'rug' ? -1 : 0
    );
    for (const f of pickOrder) {
      const dx = world.x - f.x;
      const dz = world.z - f.z;
      const cos = Math.cos(f.rotation);
      const sin = Math.sin(f.rotation);
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      if (Math.abs(lx) <= f.width * 0.5 + 0.06 && Math.abs(lz) <= f.depth * 0.5 + 0.06) {
        setSelection({ kind: 'furniture', id: f.id });
        inter.draggingFurniture = {
          id: f.id,
          offsetX: dx,
          offsetZ: dz,
          moved: false,
          snapshotTaken: false,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }

    // Check walls
    for (const w of floorplan.walls) {
      const res = pointToSegmentDistSq(world.x, world.z, w.start.x, w.start.z, w.end.x, w.end.z);
      if (Math.sqrt(res.distSq) < Math.max(0.22, w.thickness * 0.9)) {
        setSelection({ kind: 'wall', id: w.id });
        return;
      }
    }

    // Check rooms
    for (const r of floorplan.rooms) {
      if (pointInPolygon(world, r.polygon)) {
        setSelection({ kind: 'room', id: r.id });
        // Also allow panning if user drags on empty room floor!
        inter.isPanning = true;
        inter.panLastX = e.clientX;
        inter.panLastY = e.clientY;
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }

    setSelection(null);
    inter.isPanning = true;
    inter.panLastX = e.clientX;
    inter.panLastY = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const inter = interactionRef.current;

    if (inter.isPanning) {
      const dx = e.clientX - inter.panLastX;
      const dy = e.clientY - inter.panLastY;
      viewRef.current.centerX -= dx / viewRef.current.ppm;
      viewRef.current.centerZ -= dy / viewRef.current.ppm;
      inter.panLastX = e.clientX;
      inter.panLastY = e.clientY;
      return;
    }

    const world = screenToWorld(sx, sy);
    inter.hoverWorld = world;

    if (inter.draggingFurniture) {
      const drag = inter.draggingFurniture;
      const nx = snapCoord(world.x - drag.offsetX, 0.05);
      const nz = snapCoord(world.z - drag.offsetZ, 0.05);
      const recordUndo = !drag.snapshotTaken;
      drag.snapshotTaken = true;
      drag.moved = true;
      onChangeFloorplan(
        {
          ...floorplan,
          furniture: floorplan.furniture.map((f) =>
            f.id === drag.id ? { ...f, x: nx, z: nz } : f
          ),
        },
        recordUndo
      );
      return;
    }

    if (activeTool === 'door' || activeTool === 'window') {
      inter.hoverWallSnap = findNearestWallSnap(world);
    } else {
      inter.hoverWallSnap = null;
    }
  };

  const handlePointerUp = () => {
    interactionRef.current.isPanning = false;
    interactionRef.current.draggingFurniture = null;
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (compact) return;
    // Convenient double-click anywhere on the 2D floorplan walks Elena directly there!
    const rect = e.currentTarget.getBoundingClientRect();
    const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    onWalkGuideTo(world);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || compact) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const before = screenToWorld(sx, sy);
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      viewRef.current.ppm = Math.max(16, Math.min(125, viewRef.current.ppm * factor));
      const after = screenToWorld(sx, sy);
      viewRef.current.centerX += before.x - after.x;
      viewRef.current.centerZ += before.z - after.z;
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [compact]);

  const zoomBy = (factor: number) => {
    viewRef.current.ppm = Math.max(16, Math.min(125, viewRef.current.ppm * factor));
  };

  // Resolve selected entity details for crisp contextual pill
  const selectedFurniture =
    selection?.kind === 'furniture'
      ? floorplan.furniture.find((f) => f.id === selection.id)
      : null;
  const selectedOpening =
    selection?.kind === 'opening'
      ? floorplan.openings.find((o) => o.id === selection.id)
      : null;
  const selectedWall =
    selection?.kind === 'wall' ? floorplan.walls.find((w) => w.id === selection.id) : null;
  const selectedRoom: RoomZone | undefined =
    selection?.kind === 'room' ? floorplan.rooms.find((r) => r.id === selection.id) : undefined;

  // Compact Mini-Map rendering for Full-Screen Virtual Tour mode
  if (compact) {
    return (
      <div
        ref={containerRef}
        className="relative w-full h-full rounded-2xl overflow-hidden studio-glass select-none"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          className="block w-full h-full cursor-pointer"
          title="Click any room on the 2D floorplan to walk Elena there"
        />
        <div className="pointer-events-none absolute top-2 left-2.5 text-[10px] font-semibold tracking-wide uppercase text-[#57534E]">
          2D Live Radar
        </div>
        {onExpandFromCompact && (
          <button
            onClick={onExpandFromCompact}
            className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-white/85 hover:bg-white text-[#1C1B19] border border-black/10 transition cursor-pointer"
            title="Open Split 2D + 3D View"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }

  const tools: { id: EditorTool; label: string; icon: React.ReactNode; hint: string }[] = [
    {
      id: 'select',
      label: 'Select',
      icon: <MousePointer2 className="w-4 h-4" />,
      hint: 'Select, drag furniture, or change room floors (double-click to walk guide)',
    },
    {
      id: 'walk',
      label: 'Walk Guide',
      icon: <Footprints className="w-4 h-4" />,
      hint: 'Click anywhere on the 2D floorplan to walk the 3D human guide there',
    },
    {
      id: 'wall',
      label: 'Wall',
      icon: <PenTool className="w-4 h-4" />,
      hint: 'Click start and end points to draw a snapped 3D structural wall',
    },
    {
      id: 'door',
      label: 'Door',
      icon: <DoorOpen className="w-4 h-4" />,
      hint: 'Click any wall to insert a walkable 3D doorway with swing arc',
    },
    {
      id: 'window',
      label: 'Window',
      icon: <Square className="w-4 h-4" />,
      hint: 'Click any wall to cut a mullioned daylight window',
    },
    {
      id: 'furniture',
      label: 'Furnish',
      icon: <Armchair className="w-4 h-4" />,
      hint: 'Place matched 2D/3D architectural furniture (press R to rotate)',
    },
  ];

  const cursorClass =
    activeTool === 'walk' || activeTool === 'wall' || activeTool === 'door' || activeTool === 'window'
      ? 'cursor-crosshair'
      : activeTool === 'furniture'
      ? 'cursor-copy'
      : 'cursor-default';

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-[#F8F7F3] select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        className={`block w-full h-full ${cursorClass}`}
      />

      {/* Top-Left 2D Blueprint Header Pill */}
      <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2">
        <div className="studio-glass rounded-full px-3 py-1.5 flex items-center gap-2 text-xs font-medium text-[#1C1B19]">
          <span className="w-2 h-2 rounded-full bg-[#1C1B19]" />
          <span>2D Floorplan Blueprint</span>
          <span className="hidden sm:inline font-mono-tech text-[11px] text-[#6B6860] border-l border-black/10 pl-2">
            {floorplan.rooms.reduce((acc, r) => acc + computePolygonArea(r.polygon), 0).toFixed(0)}{' '}
            m²
          </span>
        </div>
      </div>

      {/* Top-Right Dimensions Toggle & Zoom Controls */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <button
          onClick={() => setShowDimensions((s) => !s)}
          className={`studio-glass rounded-full px-2.5 py-1.5 text-[11px] font-mono-tech font-medium transition cursor-pointer ${
            showDimensions ? 'text-[#1C1B19]' : 'text-[#9C9890]'
          }`}
          title="Toggle metric architectural dimension annotations"
        >
          DIMS
        </button>
        <div className="studio-glass rounded-full flex items-center px-1 py-0.5">
          <button
            onClick={() => zoomBy(1 / 1.2)}
            className="p-1 text-[#57534E] hover:text-[#1C1B19] cursor-pointer"
            title="Zoom out"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={fitFloorplanToView}
            className="px-1.5 text-[10px] font-mono-tech font-medium text-[#57534E] hover:text-[#1C1B19] cursor-pointer"
            title="Fit floorplan to view"
          >
            FIT
          </button>
          <button
            onClick={() => zoomBy(1.2)}
            className="p-1 text-[#57534E] hover:text-[#1C1B19] cursor-pointer"
            title="Zoom in"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Left Floating Slim Architectural Tool Rail */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col gap-1 studio-glass rounded-2xl p-1.5">
        {tools.map((t) => {
          const isActive = activeTool === t.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                onToolChange(t.id);
                if (t.id === 'furniture') {
                  setShowFurnitureDrawer(true);
                }
              }}
              title={`${t.label} — ${t.hint}`}
              className={`group relative flex flex-col items-center justify-center w-11 h-11 rounded-xl transition cursor-pointer ${
                isActive
                  ? 'bg-[#1C1B19] text-white shadow-sm'
                  : 'text-[#57534E] hover:bg-black/5 hover:text-[#1C1B19]'
              }`}
            >
              {t.icon}
              <span className="text-[8.5px] font-medium mt-0.5 leading-none tracking-tight">
                {t.label.split(' ')[0]}
              </span>
            </button>
          );
        })}

        <div className="h-px bg-black/10 my-0.5 mx-1.5" />

        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo last floorplan edit (Ctrl+Z)"
          className={`flex items-center justify-center w-11 h-8 rounded-xl transition ${
            canUndo
              ? 'text-[#57534E] hover:bg-black/5 hover:text-[#1C1B19] cursor-pointer'
              : 'text-black/20 cursor-not-allowed'
          }`}
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Compact Furniture Placement Catalog Popover */}
      {activeTool === 'furniture' && showFurnitureDrawer && (
        <div className="absolute left-18 top-1/2 -translate-y-1/2 w-56 max-h-[72%] overflow-y-auto studio-glass rounded-2xl p-2.5 z-20">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#57534E]">
              Place Furniture
            </span>
            <button
              onClick={rotateSelectedFurniture}
              className="flex items-center gap-1 text-[10px] font-mono-tech px-2 py-0.5 rounded-md bg-black/5 hover:bg-black/10 text-[#1C1B19] cursor-pointer"
              title="Rotate preview 45° (R)"
            >
              <RotateCw className="w-3 h-3" />
              {Math.round((placementRotation * 180) / Math.PI)}°
            </button>
          </div>
          <div className="grid grid-cols-1 gap-1">
            {FURNITURE_CATALOG.map((entry) => {
              const chosen = selectedCatalogItem.type === entry.type;
              return (
                <button
                  key={entry.type}
                  onClick={() => setSelectedCatalogItem(entry)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left text-xs transition cursor-pointer ${
                    chosen
                      ? 'bg-[#C85A32] text-white font-medium'
                      : 'hover:bg-black/5 text-[#1C1B19]'
                  }`}
                >
                  <span className="truncate">{entry.label}</span>
                  <span
                    className={`font-mono-tech text-[10px] ml-2 ${
                      chosen ? 'text-white/85' : 'text-[#6B6860]'
                    }`}
                  >
                    {entry.width}×{entry.depth}m
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Contextual Bottom-Left Selection Inspector Pill */}
      {(selectedFurniture || selectedOpening || selectedWall || selectedRoom) &&
        activeTool === 'select' && (
          <div className="absolute bottom-3 left-3 studio-glass rounded-2xl px-3 py-2 flex flex-wrap items-center gap-2 text-xs z-10 max-w-[78%]">
            {selectedFurniture && (
              <>
                <span className="font-semibold text-[#1C1B19]">{selectedFurniture.label}</span>
                <span className="font-mono-tech text-[11px] text-[#6B6860]">
                  {selectedFurniture.width}×{selectedFurniture.depth}m
                </span>
                <button
                  onClick={rotateSelectedFurniture}
                  className="p-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-[#1C1B19] cursor-pointer"
                  title="Rotate 45° (R)"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={deleteSelection}
                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-700 cursor-pointer"
                  title="Delete item (Del)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            {selectedOpening && (
              <>
                <span className="font-semibold capitalize text-[#1C1B19]">
                  {selectedOpening.type}
                </span>
                <span className="font-mono-tech text-[11px] text-[#6B6860]">
                  {selectedOpening.width.toFixed(2)}m wide
                </span>
                {selectedOpening.type === 'door' && (
                  <button
                    onClick={flipSelectedDoor}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/5 hover:bg-black/10 text-[#1C1B19] text-[11px] cursor-pointer"
                    title="Flip door swing direction"
                  >
                    <FlipHorizontal className="w-3.5 h-3.5" />
                    Flip
                  </button>
                )}
                <button
                  onClick={deleteSelection}
                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-700 cursor-pointer"
                  title="Remove opening (Del)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            {selectedWall && (
              <>
                <span className="font-semibold text-[#1C1B19]">
                  {selectedWall.isExterior ? 'Exterior Wall' : 'Partition Wall'}
                </span>
                <span className="font-mono-tech text-[11px] text-[#6B6860]">
                  {Math.hypot(
                    selectedWall.end.x - selectedWall.start.x,
                    selectedWall.end.z - selectedWall.start.z
                  ).toFixed(2)}
                  m · H {selectedWall.height}m
                </span>
                <button
                  onClick={deleteSelection}
                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-700 cursor-pointer"
                  title="Delete wall (Del)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            {selectedRoom && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-[#1C1B19] mr-1">{selectedRoom.name}:</span>
                {FLOOR_MATERIAL_LABELS.map((fm) => {
                  const active = selectedRoom.floorMaterial === fm.type;
                  return (
                    <button
                      key={fm.type}
                      onClick={() => updateSelectedRoomFloor(fm.type)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition cursor-pointer ${
                        active
                          ? 'bg-[#1C1B19] text-white font-medium'
                          : 'bg-black/5 hover:bg-black/10 text-[#1C1B19]'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-black/20"
                        style={{ backgroundColor: fm.swatch }}
                      />
                      <span>{fm.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

      {/* Active Tool Helper Toast when drawing/walking */}
      {activeTool !== 'select' && activeTool !== 'furniture' && (
        <div className="pointer-events-none absolute bottom-3 left-3 studio-glass rounded-full px-3 py-1.5 text-[11px] font-medium text-[#1C1B19]">
          {activeTool === 'walk' && 'Click anywhere inside the blueprint to walk Elena there'}
          {activeTool === 'wall' && 'Click start & end points to draw a snapped 3D wall (Esc cancels)'}
          {activeTool === 'door' && 'Hover a wall and click to insert a walkable 3D doorway'}
          {activeTool === 'window' && 'Hover a wall and click to insert a glazed 3D window'}
        </div>
      )}
    </div>
  );
};
