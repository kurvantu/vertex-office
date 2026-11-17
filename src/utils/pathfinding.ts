import { FloorplanData, Point2D, Wall, WallOpening } from '../types/floorplan';

export interface WallSegment2D {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  thickness: number;
}

/** Splits a wall into its solid sub-segments along [0..1], subtracting door openings */
export function getWallSolidSegments(
  wall: Wall,
  openings: WallOpening[],
  subtractTypes: ('door' | 'window')[] = ['door']
): { t0: number; t1: number }[] {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.05) return [];

  const relevant = openings
    .filter((o) => o.wallId === wall.id && subtractTypes.includes(o.type))
    .map((o) => {
      const half = Math.min(o.width * 0.5, len * 0.46) / len;
      return {
        a: Math.max(0.02, o.t - half),
        b: Math.min(0.98, o.t + half),
      };
    })
    .sort((u, v) => u.a - v.a);

  const solid: { t0: number; t1: number }[] = [];
  let cursor = 0;
  for (const gap of relevant) {
    if (gap.a > cursor + 0.01) {
      solid.push({ t0: cursor, t1: gap.a });
    }
    cursor = Math.max(cursor, gap.b);
  }
  if (cursor < 0.99) {
    solid.push({ t0: cursor, t1: 1 });
  }
  return solid;
}

export function extractSolidFloorSegments(floorplan: FloorplanData): WallSegment2D[] {
  const segments: WallSegment2D[] = [];
  for (const wall of floorplan.walls) {
    const spans = getWallSolidSegments(wall, floorplan.openings, ['door']);
    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    for (const s of spans) {
      segments.push({
        ax: wall.start.x + dx * s.t0,
        az: wall.start.z + dz * s.t0,
        bx: wall.start.x + dx * s.t1,
        bz: wall.start.z + dz * s.t1,
        thickness: wall.thickness,
      });
    }
  }
  return segments;
}

export function pointToSegmentDistSq(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): { distSq: number; t: number; cx: number; cz: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-8) {
    const ex = px - ax;
    const ez = pz - az;
    return { distSq: ex * ex + ez * ez, t: 0, cx: ax, cz: az };
  }
  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + dx * t;
  const cz = az + dz * t;
  const ex = px - cx;
  const ez = pz - cz;
  return { distSq: ex * ex + ez * ez, t, cx, cz };
}

export class NavGrid {
  private cellSize = 0.2;
  private minX = -10;
  private maxX = 10;
  private minZ = -8;
  private maxZ = 8;
  private cols: number;
  private rows: number;
  private blocked: Uint8Array;
  public solidSegments: WallSegment2D[];

  constructor(floorplan: FloorplanData) {
    // Expand bounds dynamically if user drew walls far out
    for (const w of floorplan.walls) {
      this.minX = Math.min(this.minX, w.start.x - 2.5, w.end.x - 2.5);
      this.maxX = Math.max(this.maxX, w.start.x + 2.5, w.end.x + 2.5);
      this.minZ = Math.min(this.minZ, w.start.z - 2.5, w.end.z - 2.5);
      this.maxZ = Math.max(this.maxZ, w.start.z + 2.5, w.end.z + 2.5);
    }

    this.cols = Math.ceil((this.maxX - this.minX) / this.cellSize);
    this.rows = Math.ceil((this.maxZ - this.minZ) / this.cellSize);
    this.blocked = new Uint8Array(this.cols * this.rows);
    this.solidSegments = extractSolidFloorSegments(floorplan);

    const agentRadius = 0.23;

    // Precompute furniture oriented bounding boxes (ignore rugs & lamps which are flat/tiny)
    const obstacles = floorplan.furniture
      .filter((f) => f.type !== 'rug')
      .map((f) => ({
        x: f.x,
        z: f.z,
        cos: Math.cos(-f.rotation),
        sin: Math.sin(-f.rotation),
        hx: f.width * 0.5 + 0.14,
        hz: f.depth * 0.5 + 0.14,
      }));

    for (let r = 0; r < this.rows; r++) {
      const pz = this.minZ + (r + 0.5) * this.cellSize;
      for (let c = 0; c < this.cols; c++) {
        const px = this.minX + (c + 0.5) * this.cellSize;
        let isBlocked = false;

        for (let i = 0; i < this.solidSegments.length; i++) {
          const seg = this.solidSegments[i];
          const clear = seg.thickness * 0.5 + agentRadius;
          const { distSq } = pointToSegmentDistSq(px, pz, seg.ax, seg.az, seg.bx, seg.bz);
          if (distSq < clear * clear) {
            isBlocked = true;
            break;
          }
        }

        if (!isBlocked) {
          for (let i = 0; i < obstacles.length; i++) {
            const ob = obstacles[i];
            const rx = px - ob.x;
            const rz = pz - ob.z;
            const lx = rx * ob.cos - rz * ob.sin;
            const lz = rx * ob.sin + rz * ob.cos;
            if (Math.abs(lx) < ob.hx && Math.abs(lz) < ob.hz) {
              isBlocked = true;
              break;
            }
          }
        }

        if (isBlocked) {
          this.blocked[r * this.cols + c] = 1;
        }
      }
    }
  }

  private worldToCell(x: number, z: number): { c: number; r: number } {
    const c = Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.minX) / this.cellSize)));
    const r = Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.minZ) / this.cellSize)));
    return { c, r };
  }

  private cellToWorld(c: number, r: number): Point2D {
    return {
      x: this.minX + (c + 0.5) * this.cellSize,
      z: this.minZ + (r + 0.5) * this.cellSize,
    };
  }

  private isCellBlocked(c: number, r: number): boolean {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return true;
    return this.blocked[r * this.cols + c] === 1;
  }

  private findNearestFreeCell(c0: number, r0: number): { c: number; r: number } {
    if (!this.isCellBlocked(c0, r0)) return { c: c0, r: r0 };
    for (let rad = 1; rad <= 14; rad++) {
      let best: { c: number; r: number; d: number } | null = null;
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.abs(dc) !== rad && Math.abs(dr) !== rad) continue;
          const nc = c0 + dc;
          const nr = r0 + dr;
          if (!this.isCellBlocked(nc, nr)) {
            const d = dc * dc + dr * dr;
            if (!best || d < best.d) {
              best = { c: nc, r: nr, d };
            }
          }
        }
      }
      if (best) return { c: best.c, r: best.r };
    }
    return { c: c0, r: r0 };
  }

  private hasLineOfSight(a: Point2D, b: Point2D): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(2, Math.ceil(dist / (this.cellSize * 0.45)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      const { c, r } = this.worldToCell(px, pz);
      if (this.isCellBlocked(c, r)) return false;
    }
    return true;
  }

  public findPath(start: Point2D, goal: Point2D): Point2D[] {
    const sRaw = this.worldToCell(start.x, start.z);
    const gRaw = this.worldToCell(goal.x, goal.z);
    const s = this.findNearestFreeCell(sRaw.c, sRaw.r);
    const g = this.findNearestFreeCell(gRaw.c, gRaw.r);

    const safeGoal =
      gRaw.c === g.c && gRaw.r === g.r ? { x: goal.x, z: goal.z } : this.cellToWorld(g.c, g.r);

    if (s.c === g.c && s.r === g.r) {
      return [safeGoal];
    }

    if (this.hasLineOfSight(start, safeGoal)) {
      return [safeGoal];
    }

    const total = this.cols * this.rows;
    const gScore = new Float32Array(total);
    gScore.fill(1e9);
    const fScore = new Float32Array(total);
    fScore.fill(1e9);
    const cameFrom = new Int32Array(total);
    cameFrom.fill(-1);
    const closed = new Uint8Array(total);
    const inOpen = new Uint8Array(total);

    const startIdx = s.r * this.cols + s.c;
    const goalIdx = g.r * this.cols + g.c;

    const open: number[] = [startIdx];
    inOpen[startIdx] = 1;
    gScore[startIdx] = 0;
    fScore[startIdx] = Math.hypot(g.c - s.c, g.r - s.r);

    const dirs = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, 1.4142],
      [-1, 1, 1.4142],
      [1, -1, 1.4142],
      [-1, -1, 1.4142],
    ];

    let closestIdx = startIdx;
    let closestH = fScore[startIdx];
    let iter = 0;
    const maxIter = 9000;

    while (open.length > 0 && iter < maxIter) {
      iter++;
      // Find lowest fScore in open set
      let bestPos = 0;
      let bestF = fScore[open[0]];
      for (let i = 1; i < open.length; i++) {
        const f = fScore[open[i]];
        if (f < bestF) {
          bestF = f;
          bestPos = i;
        }
      }

      const current = open[bestPos];
      open[bestPos] = open[open.length - 1];
      open.pop();
      inOpen[current] = 0;

      if (current === goalIdx) {
        closestIdx = goalIdx;
        break;
      }

      closed[current] = 1;
      const cc = current % this.cols;
      const cr = (current - cc) / this.cols;

      for (let d = 0; d < 8; d++) {
        const dc = dirs[d][0];
        const dr = dirs[d][1];
        const cost = dirs[d][2];
        const nc = cc + dc;
        const nr = cr + dr;
        if (this.isCellBlocked(nc, nr)) continue;

        // Prevent corner cutting on diagonals
        if (dc !== 0 && dr !== 0) {
          if (this.isCellBlocked(cc + dc, cr) || this.isCellBlocked(cc, cr + dr)) {
            continue;
          }
        }

        const nIdx = nr * this.cols + nc;
        if (closed[nIdx]) continue;

        const tentativeG = gScore[current] + cost;
        if (tentativeG < gScore[nIdx]) {
          cameFrom[nIdx] = current;
          gScore[nIdx] = tentativeG;
          const h = Math.hypot(g.c - nc, g.r - nr);
          fScore[nIdx] = tentativeG + h;
          if (h < closestH) {
            closestH = h;
            closestIdx = nIdx;
          }
          if (!inOpen[nIdx]) {
            open.push(nIdx);
            inOpen[nIdx] = 1;
          }
        }
      }
    }

    // Reconstruct raw path
    const raw: Point2D[] = [];
    let cur = closestIdx;
    while (cur !== -1 && cur !== startIdx) {
      const c = cur % this.cols;
      const r = (cur - c) / this.cols;
      raw.push(this.cellToWorld(c, r));
      cur = cameFrom[cur];
    }
    raw.reverse();

    if (closestIdx === goalIdx && raw.length > 0) {
      raw[raw.length - 1] = safeGoal;
    }
    if (raw.length === 0) {
      return [safeGoal];
    }

    // String-pull smoothing using line-of-sight
    const full = [start, ...raw];
    const smoothed: Point2D[] = [];
    let anchor = 0;
    while (anchor < full.length - 1) {
      let furthest = anchor + 1;
      for (let test = full.length - 1; test > anchor + 1; test--) {
        if (this.hasLineOfSight(full[anchor], full[test])) {
          furthest = test;
          break;
        }
      }
      smoothed.push(full[furthest]);
      anchor = furthest;
    }

    return smoothed;
  }

  /** Smooth circle-vs-segment pushout for first-person virtual tour exploration */
  public resolveCameraWalk(target: Point2D, radius = 0.28): Point2D {
    let x = target.x;
    let z = target.z;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < this.solidSegments.length; i++) {
        const seg = this.solidSegments[i];
        const minDist = seg.thickness * 0.5 + radius;
        const { distSq, cx, cz } = pointToSegmentDistSq(x, z, seg.ax, seg.az, seg.bx, seg.bz);
        if (distSq < minDist * minDist && distSq > 1e-8) {
          const d = Math.sqrt(distSq);
          const push = minDist - d;
          x += ((x - cx) / d) * push;
          z += ((z - cz) / d) * push;
        }
      }
    }
    return { x, z };
  }
}
