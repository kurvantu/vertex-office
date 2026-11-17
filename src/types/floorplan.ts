export interface Point2D {
  x: number; // meters, East-West (+X = right on 2D plan)
  z: number; // meters, North-South (+Z = down on 2D plan)
}

export type FloorMaterialType =
  | 'oak'
  | 'walnut'
  | 'travertine'
  | 'tile'
  | 'tatami'
  | 'concrete';

export interface RoomZone {
  id: string;
  name: string;
  /** Axis-aligned or polygon vertices in meters (clockwise) */
  polygon: Point2D[];
  floorMaterial: FloorMaterialType;
  labelOffset?: Point2D;
}

export type OpeningType = 'door' | 'window';

export interface WallOpening {
  id: string;
  wallId: string;
  type: OpeningType;
  /** Normalized position along the wall centerline (0.1 .. 0.9) */
  t: number;
  /** Width in meters (e.g., 0.9m door, 1.6m window) */
  width: number;
  /** For doors: +1 or -1 side of wall normal for swing direction */
  swingDir?: 1 | -1;
  /** For doors: hinge on 'start' or 'end' of opening */
  hingeSide?: 'start' | 'end';
  /** Sill height for windows in meters (default 0.82) */
  sillHeight?: number;
  /** Top height in meters (door ~2.12, window ~2.22) */
  headHeight?: number;
}

export interface Wall {
  id: string;
  start: Point2D;
  end: Point2D;
  thickness: number; // meters (0.2 exterior, 0.14 interior)
  height: number; // meters (default 2.8)
  isExterior?: boolean;
  color?: string;
}

export type FurnitureType =
  | 'sofa'
  | 'coffee_table'
  | 'rug'
  | 'dining_set'
  | 'kitchen_island'
  | 'kitchen_counter'
  | 'bed_king'
  | 'wardrobe'
  | 'bathtub'
  | 'vanity'
  | 'toilet'
  | 'desk'
  | 'armchair'
  | 'plant'
  | 'bookshelf'
  | 'floor_lamp'
  | 'console_table';

export interface FurnitureItem {
  id: string;
  type: FurnitureType;
  label: string;
  x: number;
  z: number;
  /** Rotation in radians around Y axis (0 = faces +Z) */
  rotation: number;
  width: number; // X extent when rotation = 0 (meters)
  depth: number; // Z extent when rotation = 0 (meters)
  accentColor?: string;
}

export interface TourStop {
  id: string;
  roomName: string;
  title: string;
  description: string;
  highlights: string[];
  /** Where Elena walks and stands */
  guidePos: Point2D;
  /** Where Elena gestures / points briefly before facing camera */
  featurePoint: Point2D;
  /** Ideal virtual-tour camera vantage point */
  cameraPos: { x: number; y: number; z: number };
  /** Camera look target during presentation */
  cameraLookAt: { x: number; y: number; z: number };
}

export interface FloorplanData {
  id: string;
  name: string;
  subtitle: string;
  rooms: RoomZone[];
  walls: Wall[];
  openings: WallOpening[];
  furniture: FurnitureItem[];
  tourStops: TourStop[];
  guideStart: Point2D;
  guideStartYaw: number;
}

export type ViewMode = '2d' | 'split' | '3d' | 'tour';

export type EditorTool =
  | 'select'
  | 'walk'
  | 'wall'
  | 'door'
  | 'window'
  | 'furniture';

export type WallDisplayMode = 'cutaway' | 'full' | 'low';

export type LightingPreset = 'daylight' | 'golden' | 'studio';

export type GuideInspectTarget = 'none' | 'full' | 'head' | 'hands' | 'feet';

export type GuideGesture =
  | 'auto'
  | 'wave'
  | 'present'
  | 'show_hands'
  | 'show_feet';

export interface SelectionState {
  kind: 'wall' | 'opening' | 'furniture' | 'room';
  id: string;
}

/** Shared high-frequency mutable state updated at 60fps by 3D engine & read by 2D canvas */
export interface LiveSyncState {
  guidePos: Point2D;
  guideYaw: number;
  guideIsWalking: boolean;
  guidePath: Point2D[];
  guideDestination: Point2D | null;
  cameraPos: { x: number; y: number; z: number };
  cameraYaw: number;
  cameraFovRad: number;
}

export interface WalkRequest {
  id: number;
  target: Point2D;
  facePoint?: Point2D;
  tourStopId?: string;
  announceText?: string;
}

export interface FurnitureCatalogEntry {
  type: FurnitureType;
  label: string;
  width: number;
  depth: number;
  category: 'Living' | 'Dining & Kitchen' | 'Bedroom & Study' | 'Bath & Decor';
}

export const FURNITURE_CATALOG: FurnitureCatalogEntry[] = [
  { type: 'sofa', label: 'Linen Sofa', width: 2.3, depth: 0.95, category: 'Living' },
  { type: 'armchair', label: 'Lounge Chair', width: 0.82, depth: 0.82, category: 'Living' },
  { type: 'coffee_table', label: 'Oak Coffee Table', width: 1.3, depth: 0.72, category: 'Living' },
  { type: 'rug', label: 'Woven Area Rug', width: 2.8, depth: 2.0, category: 'Living' },
  { type: 'dining_set', label: 'Dining Table (6)', width: 1.9, depth: 1.1, category: 'Dining & Kitchen' },
  { type: 'kitchen_island', label: 'Kitchen Island', width: 2.1, depth: 0.92, category: 'Dining & Kitchen' },
  { type: 'kitchen_counter', label: 'Chef Cabinetry', width: 2.8, depth: 0.65, category: 'Dining & Kitchen' },
  { type: 'bed_king', label: 'Platform Bed', width: 2.0, depth: 2.15, category: 'Bedroom & Study' },
  { type: 'wardrobe', label: 'Oak Wardrobe', width: 1.8, depth: 0.6, category: 'Bedroom & Study' },
  { type: 'desk', label: 'Architect Desk', width: 1.5, depth: 0.75, category: 'Bedroom & Study' },
  { type: 'bookshelf', label: 'Library Shelf', width: 1.4, depth: 0.38, category: 'Bedroom & Study' },
  { type: 'bathtub', label: 'Soaking Tub', width: 1.65, depth: 0.78, category: 'Bath & Decor' },
  { type: 'vanity', label: 'Stone Vanity', width: 1.15, depth: 0.55, category: 'Bath & Decor' },
  { type: 'plant', label: 'Fiddle Leaf Fig', width: 0.58, depth: 0.58, category: 'Bath & Decor' },
  { type: 'floor_lamp', label: 'Brass Arc Lamp', width: 0.48, depth: 0.48, category: 'Bath & Decor' },
  { type: 'console_table', label: 'Entry Console', width: 1.3, depth: 0.42, category: 'Bath & Decor' },
];
