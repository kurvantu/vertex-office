import * as THREE from 'three';
import {
  FloorplanData,
  FurnitureItem,
  RoomZone,
  Wall,
  WallDisplayMode,
  WallOpening,
} from '../types/floorplan';
import { FloorMaterialCache } from './textures';

interface CutawayWallRecord {
  group: THREE.Group;
  midX: number;
  midZ: number;
  outNormalX: number;
  outNormalZ: number;
  isExterior: boolean;
  currentScaleY: number;
}

export interface BuiltArchitecture {
  group: THREE.Group;
  walkableMeshes: THREE.Object3D[];
  tourMarkerMeshes: THREE.Object3D[];
  updateWallCutaway: (
    cameraPos: THREE.Vector3,
    targetPos: THREE.Vector3,
    mode: WallDisplayMode,
    dt: number,
    elapsed: number
  ) => void;
  dispose: () => void;
}

function createRoomFloorMesh(room: RoomZone, mat: THREE.Material): THREE.Mesh | null {
  if (room.polygon.length < 3) return null;
  // Shape is in XY plane; rotateX(PI/2) sends (x, y, 0) -> (x, 0, y) so shape Y maps to +Z!
  const shape = new THREE.Shape();
  shape.moveTo(room.polygon[0].x, room.polygon[0].z);
  for (let i = 1; i < room.polygon.length; i++) {
    shape.lineTo(room.polygon[i].x, room.polygon[i].z);
  }
  shape.closePath();

  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(Math.PI / 2);
  // Flip normals upward (+Y) since rotateX(+PI/2) faces -Y depending on winding
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  // Ensure upward-facing triangles by checking signed normal
  const index = geo.index;
  if (index) {
    const arr = index.array as Uint16Array | Uint32Array;
    if (arr.length >= 3) {
      const a = new THREE.Vector3().fromBufferAttribute(pos, arr[0]);
      const b = new THREE.Vector3().fromBufferAttribute(pos, arr[1]);
      const c = new THREE.Vector3().fromBufferAttribute(pos, arr[2]);
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      if (n.y < 0) {
        for (let i = 0; i < arr.length; i += 3) {
          const tmp = arr[i + 1];
          arr[i + 1] = arr[i + 2];
          arr[i + 2] = tmp;
        }
        index.needsUpdate = true;
      }
    }
  }

  // World-scale UVs (1 repeat every ~2.2m for natural plank/tile proportions)
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) * 0.45, pos.getZ(i) * 0.45);
  }
  uv.needsUpdate = true;
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.002;
  mesh.receiveShadow = true;
  mesh.userData = { isWalkableFloor: true, roomId: room.id, roomName: room.name };
  return mesh;
}

export function buildArchitecture(
  floorplan: FloorplanData,
  floorCache: FloorMaterialCache
): BuiltArchitecture {
  const group = new THREE.Group();
  group.name = 'ArchitectureRoot';

  const walkableMeshes: THREE.Object3D[] = [];
  const tourMarkerMeshes: THREE.Object3D[] = [];
  const pulseRings: THREE.Mesh[] = [];
  const cutawayWalls: CutawayWallRecord[] = [];
  const localMaterials: THREE.Material[] = [];

  const mat = <T extends THREE.Material>(m: T): T => {
    localMaterials.push(m);
    return m;
  };

  // Shared architectural surface palette
  const exteriorWallMat = mat(
    new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.86, metalness: 0.01 })
  );
  const interiorWallMat = mat(
    new THREE.MeshStandardMaterial({ color: 0xf8f6f1, roughness: 0.88, metalness: 0.01 })
  );
  const wallCapMat = mat(
    new THREE.MeshStandardMaterial({ color: 0xd9d4ca, roughness: 0.75, metalness: 0.02 })
  );
  const baseboardMat = mat(
    new THREE.MeshStandardMaterial({ color: 0xeae5dc, roughness: 0.65, metalness: 0.02 })
  );
  const oakWoodMat = mat(
    new THREE.MeshStandardMaterial({ color: 0xc9a273, roughness: 0.52, metalness: 0.02 })
  );
  const walnutWoodMat = mat(
    new THREE.MeshStandardMaterial({ color: 0x7b563c, roughness: 0.48, metalness: 0.03 })
  );
  const doorPanelMat = mat(
    new THREE.MeshStandardMaterial({ color: 0xd4b287, roughness: 0.5, metalness: 0.02 })
  );
  const bronzeFrameMat = mat(
    new THREE.MeshStandardMaterial({ color: 0x2f2d2a, roughness: 0.38, metalness: 0.45 })
  );
  const brassMat = mat(
    new THREE.MeshStandardMaterial({ color: 0xd4a654, roughness: 0.26, metalness: 0.82 })
  );
  const glassMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0xd9eef7,
      roughness: 0.08,
      metalness: 0.12,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    })
  );
  const linenMat = mat(
    new THREE.MeshStandardMaterial({ color: 0xebe5da, roughness: 0.9, metalness: 0 })
  );
  const linenWarmMat = mat(
    new THREE.MeshStandardMaterial({ color: 0xdfd6c7, roughness: 0.88, metalness: 0 })
  );
  const terracottaMat = mat(
    new THREE.MeshStandardMaterial({ color: 0xc8643c, roughness: 0.78, metalness: 0.01 })
  );
  const sageMat = mat(
    new THREE.MeshStandardMaterial({ color: 0x7a917e, roughness: 0.8, metalness: 0.01 })
  );
  const stoneMat = mat(
    new THREE.MeshStandardMaterial({ color: 0xe8e2d7, roughness: 0.42, metalness: 0.03 })
  );
  const ceramicWhiteMat = mat(
    new THREE.MeshStandardMaterial({ color: 0xfbfaf8, roughness: 0.22, metalness: 0.04 })
  );
  const mirrorMat = mat(
    new THREE.MeshStandardMaterial({ color: 0xdce6eb, roughness: 0.06, metalness: 0.88 })
  );
  const foliageMat = mat(
    new THREE.MeshStandardMaterial({ color: 0x4d734b, roughness: 0.68, metalness: 0.01 })
  );
  const foliageLightMat = mat(
    new THREE.MeshStandardMaterial({ color: 0x648b5c, roughness: 0.66, metalness: 0.01 })
  );
  const lampGlowMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0xfff5e0,
      emissive: 0xffd591,
      emissiveIntensity: 0.55,
      roughness: 0.6,
    })
  );

  // Compute plan bounding box for architectural plinth & exterior detection
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
  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const spanX = Math.max(4, maxX - minX);
  const spanZ = Math.max(4, maxZ - minZ);

  // =========================================================================
  // 1. EXTERIOR COURTYARD GARDEN & ARCHITECTURAL PLINTH
  // =========================================================================
  const lawnMat = mat(
    new THREE.MeshStandardMaterial({ color: 0xd7d8ce, roughness: 0.96, metalness: 0 })
  );
  const ground = new THREE.Mesh(new THREE.CircleGeometry(46, 64), lawnMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.09;
  ground.receiveShadow = true;
  group.add(ground);

  // Architectural stone terrace apron surrounding the house
  const terraceMat = mat(
    new THREE.MeshStandardMaterial({ color: 0xe5e0d6, roughness: 0.82, metalness: 0.01 })
  );
  const terrace = new THREE.Mesh(
    new THREE.BoxGeometry(spanX + 2.8, 0.075, spanZ + 2.8),
    terraceMat
  );
  terrace.position.set(centerX, -0.045, centerZ);
  terrace.receiveShadow = true;
  terrace.userData = { isWalkableFloor: true };
  group.add(terrace);
  walkableMeshes.push(terrace);

  // Sub-floor slab directly beneath residence (covers any custom drawn walls too)
  const subSlab = new THREE.Mesh(
    new THREE.BoxGeometry(spanX + 0.35, 0.08, spanZ + 0.35),
    mat(new THREE.MeshStandardMaterial({ color: 0xded7ca, roughness: 0.72 }))
  );
  subSlab.position.set(centerX, -0.04, centerZ);
  subSlab.receiveShadow = true;
  subSlab.userData = { isWalkableFloor: true };
  group.add(subSlab);
  walkableMeshes.push(subSlab);

  // Subtle landscaped courtyard trees/shrubs outside windows for pleasant tour views
  const gardenSpots = [
    { x: minX - 2.3, z: minZ - 1.4, s: 1.15 },
    { x: maxX + 2.2, z: minZ - 1.6, s: 1.0 },
    { x: centerX - 1.2, z: minZ - 2.5, s: 0.85 },
    { x: maxX + 2.4, z: maxZ + 1.2, s: 1.1 },
  ];
  for (const gs of gardenSpots) {
    const shrubGroup = new THREE.Group();
    shrubGroup.position.set(gs.x, -0.08, gs.z);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.08, 1.35 * gs.s, 8),
      walnutWoodMat
    );
    trunk.position.y = 0.67 * gs.s;
    trunk.castShadow = true;
    shrubGroup.add(trunk);

    const canopyOffsets = [
      [0, 1.45, 0, 0.55],
      [0.28, 1.32, 0.18, 0.42],
      [-0.26, 1.35, -0.15, 0.44],
      [0.05, 1.72, -0.08, 0.38],
    ];
    for (let i = 0; i < canopyOffsets.length; i++) {
      const [ox, oy, oz, rad] = canopyOffsets[i];
      const leaf = new THREE.Mesh(
        new THREE.DodecahedronGeometry(rad * gs.s, 1),
        i % 2 === 0 ? foliageMat : foliageLightMat
      );
      leaf.position.set(ox * gs.s, oy * gs.s, oz * gs.s);
      leaf.castShadow = true;
      shrubGroup.add(leaf);
    }
    group.add(shrubGroup);
  }

  // =========================================================================
  // 2. ROOM FLOOR ZONES
  // =========================================================================
  for (const room of floorplan.rooms) {
    const fmat = floorCache.getMaterial(room.floorMaterial);
    const mesh = createRoomFloorMesh(room, fmat);
    if (mesh) {
      group.add(mesh);
      walkableMeshes.push(mesh);
    }
  }

  // =========================================================================
  // 3. SEGMENTED 3D WALLS WITH REAL CUTOUT DOORS & WINDOWS
  // =========================================================================
  const buildWall3D = (wall: Wall, allOpenings: WallOpening[]) => {
    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.05) return;

    const angle = Math.atan2(dz, dx);
    const wallGroup = new THREE.Group();
    wallGroup.position.set(wall.start.x, 0, wall.start.z);
    // Rotate so local +X goes from wall.start -> wall.end!
    // In Three.js, rotation.y = -angle maps (1, 0, 0) -> (cos(-a), 0, -sin(-a)) = (cos a, 0, sin a)!
    wallGroup.rotation.y = -angle;

    const H = wall.height || 2.85;
    const T = wall.thickness || 0.16;
    const wMat = wall.isExterior ? exteriorWallMat : interiorWallMat;

    const addWallBox = (x0: number, x1: number, y0: number, y1: number) => {
      const w = x1 - x0;
      const h = y1 - y0;
      if (w < 0.015 || h < 0.015) return;
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, T), wMat);
      box.position.set(x0 + w * 0.5, y0 + h * 0.5, 0);
      box.castShadow = true;
      box.receiveShadow = true;
      wallGroup.add(box);

      // Crisp architectural top wall cap (looks ultra-clean in cutaway & 3D views)
      if (Math.abs(y1 - H) < 0.02) {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.004, 0.022, T + 0.008), wallCapMat);
        cap.position.set(x0 + w * 0.5, H + 0.01, 0);
        wallGroup.add(cap);
      }

      // Baseboard trim along floor-touching segments
      if (y0 < 0.02 && w > 0.08) {
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(w - 0.01, 0.085, T + 0.018),
          baseboardMat
        );
        base.position.set(x0 + w * 0.5, 0.0425, 0);
        wallGroup.add(base);
      }
    };

    // Extend ends slightly by T*0.48 to form seamless architectural corner miters
    const wallOpenings = allOpenings
      .filter((o) => o.wallId === wall.id)
      .map((o) => {
        const half = Math.min(o.width * 0.5, length * 0.45);
        const cx = o.t * length;
        return {
          opening: o,
          x0: Math.max(0.06, cx - half),
          x1: Math.min(length - 0.06, cx + half),
        };
      })
      .sort((a, b) => a.x0 - b.x0);

    let cursor = -T * 0.45;
    for (const item of wallOpenings) {
      const { opening, x0, x1 } = item;
      if (x0 > cursor + 0.01) {
        addWallBox(cursor, x0, 0, H);
      }

      const openW = x1 - x0;
      const headH = Math.min(H - 0.18, opening.headHeight ?? (opening.type === 'door' ? 2.18 : 2.3));

      // Header / lintel wall above opening
      addWallBox(x0, x1, headH, H);

      if (opening.type === 'door') {
        // Wooden door casing jambs + head
        const jambT = 0.042;
        const jambD = T + 0.028;
        const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(jambT, headH, jambD), oakWoodMat);
        leftJamb.position.set(x0 + jambT * 0.5, headH * 0.5, 0);
        leftJamb.castShadow = true;
        wallGroup.add(leftJamb);

        const rightJamb = new THREE.Mesh(new THREE.BoxGeometry(jambT, headH, jambD), oakWoodMat);
        rightJamb.position.set(x1 - jambT * 0.5, headH * 0.5, 0);
        rightJamb.castShadow = true;
        wallGroup.add(rightJamb);

        const headJamb = new THREE.Mesh(
          new THREE.BoxGeometry(openW, jambT, jambD),
          oakWoodMat
        );
        headJamb.position.set(x0 + openW * 0.5, headH - jambT * 0.5, 0);
        wallGroup.add(headJamb);

        // Hinged open timber door leaf (swung gracefully 82 deg open so Elena glides right through!)
        const leafW = Math.min(0.92, openW - jambT * 2);
        const leafH = headH - jambT - 0.012;
        const swingDir = opening.swingDir ?? 1;
        const hingeAtStart = (opening.hingeSide ?? 'start') === 'start';

        const hingePivot = new THREE.Group();
        hingePivot.position.set(
          hingeAtStart ? x0 + jambT : x1 - jambT,
          0.008,
          swingDir * (T * 0.42)
        );
        // Swing cleanly open into room along local Z normal
        const openAngle = 1.42; // ~81 degrees open
        hingePivot.rotation.y = hingeAtStart ? -swingDir * openAngle : swingDir * openAngle;
        wallGroup.add(hingePivot);

        const leafSign = hingeAtStart ? 1 : -1;
        const doorLeaf = new THREE.Mesh(
          new THREE.BoxGeometry(leafW, leafH, 0.038),
          doorPanelMat
        );
        doorLeaf.position.set(leafSign * leafW * 0.5, leafH * 0.5, 0);
        doorLeaf.castShadow = true;
        doorLeaf.receiveShadow = true;
        hingePivot.add(doorLeaf);

        // Brushed brass lever handles on both sides of door leaf
        for (const side of [-1, 1]) {
          const handle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.016, 0.022), brassMat);
          handle.position.set(leafSign * (leafW - 0.1), 1.0, side * 0.032);
          hingePivot.add(handle);
        }
      } else {
        // Architectural Window: lower wall + sill + dark bronze frame + mullions + glass
        const sillH = Math.max(0.25, opening.sillHeight ?? 0.78);
        addWallBox(x0, x1, 0, sillH);

        const winH = headH - sillH;
        const frameT = 0.04;

        // Projecting limestone sill
        const sill = new THREE.Mesh(
          new THREE.BoxGeometry(openW + 0.06, 0.036, T + 0.065),
          stoneMat
        );
        sill.position.set(x0 + openW * 0.5, sillH + 0.012, 0);
        sill.receiveShadow = true;
        wallGroup.add(sill);

        // Outer bronze perimeter frame
        const topBar = new THREE.Mesh(new THREE.BoxGeometry(openW, frameT, 0.065), bronzeFrameMat);
        topBar.position.set(x0 + openW * 0.5, headH - frameT * 0.5, 0);
        wallGroup.add(topBar);

        const botBar = new THREE.Mesh(new THREE.BoxGeometry(openW, frameT, 0.065), bronzeFrameMat);
        botBar.position.set(x0 + openW * 0.5, sillH + frameT * 0.5, 0);
        wallGroup.add(botBar);

        const lBar = new THREE.Mesh(new THREE.BoxGeometry(frameT, winH, 0.065), bronzeFrameMat);
        lBar.position.set(x0 + frameT * 0.5, sillH + winH * 0.5, 0);
        wallGroup.add(lBar);

        const rBar = new THREE.Mesh(new THREE.BoxGeometry(frameT, winH, 0.065), bronzeFrameMat);
        rBar.position.set(x1 - frameT * 0.5, sillH + winH * 0.5, 0);
        wallGroup.add(rBar);

        // Vertical architectural mullions for wide picture windows
        const panels = openW > 2.1 ? 3 : openW > 1.1 ? 2 : 1;
        for (let p = 1; p < panels; p++) {
          const mul = new THREE.Mesh(
            new THREE.BoxGeometry(0.028, winH - frameT, 0.055),
            bronzeFrameMat
          );
          mul.position.set(x0 + (openW * p) / panels, sillH + winH * 0.5, 0);
          mul.castShadow = true;
          wallGroup.add(mul);
        }

        // Glazed window pane (does not cast opaque shadow so sunbeams enter!)
        const pane = new THREE.Mesh(
          new THREE.BoxGeometry(openW - frameT * 2, winH - frameT * 2, 0.014),
          glassMat
        );
        pane.position.set(x0 + openW * 0.5, sillH + winH * 0.5, 0);
        wallGroup.add(pane);
      }

      cursor = Math.max(cursor, x1);
    }

    if (cursor < length + T * 0.44) {
      addWallBox(cursor, length + T * 0.45, 0, H);
    }

    group.add(wallGroup);

    // Determine outward normal relative to building centroid for smart camera cutaway
    const midX = (wall.start.x + wall.end.x) * 0.5;
    const midZ = (wall.start.z + wall.end.z) * 0.5;
    let nx = -dz / length;
    let nz = dx / length;
    const toOutsideX = midX - centerX;
    const toOutsideZ = midZ - centerZ;
    if (nx * toOutsideX + nz * toOutsideZ < 0) {
      nx = -nx;
      nz = -nz;
    }

    const isAutoExt =
      wall.isExterior ??
      (Math.abs(midX - minX) < 0.35 ||
        Math.abs(midX - maxX) < 0.35 ||
        Math.abs(midZ - minZ) < 0.35 ||
        Math.abs(midZ - maxZ) < 0.35);

    cutawayWalls.push({
      group: wallGroup,
      midX,
      midZ,
      outNormalX: nx,
      outNormalZ: nz,
      isExterior: isAutoExt,
      currentScaleY: 1,
    });
  };

  for (const wall of floorplan.walls) {
    buildWall3D(wall, floorplan.openings);
  }

  // =========================================================================
  // 4. HIGH-CRAFT 3D ARCHITECTURAL FURNITURE
  // =========================================================================
  const buildFurniture3D = (item: FurnitureItem) => {
    const fg = new THREE.Group();
    fg.position.set(item.x, 0.003, item.z);
    fg.rotation.y = item.rotation;
    fg.userData = { furnitureId: item.id };

    const W = item.width;
    const D = item.depth;

    const addBox = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      m: THREE.Material,
      shadow = true
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      fg.add(mesh);
      return mesh;
    };

    switch (item.type) {
      case 'rug': {
        const rug = new THREE.Mesh(new THREE.BoxGeometry(W, 0.014, D), floorCache.rugMaterial);
        rug.position.y = 0.007;
        rug.receiveShadow = true;
        rug.userData = { isWalkableFloor: true };
        fg.add(rug);
        walkableMeshes.push(rug);
        break;
      }

      case 'sofa': {
        // Oak plinth frame + legs
        addBox(W - 0.08, 0.06, D - 0.08, 0, 0.13, 0, oakWoodMat);
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const leg = new THREE.Mesh(
              new THREE.CylinderGeometry(0.024, 0.018, 0.11, 10),
              oakWoodMat
            );
            leg.position.set(sx * (W * 0.5 - 0.12), 0.055, sz * (D * 0.5 - 0.12));
            fg.add(leg);
          }
        }
        // Seat deck + 3 plush linen seat cushions
        const innerW = W - 0.34;
        for (let i = 0; i < 3; i++) {
          const cw = innerW / 3 - 0.02;
          const cx = -innerW * 0.5 + (i + 0.5) * (innerW / 3);
          addBox(cw, 0.22, D - 0.14, cx, 0.28, 0.04, linenMat);
          // Backrest cushions along -Z so sofa faces +Z
          addBox(cw, 0.38, 0.2, cx, 0.56, -D * 0.5 + 0.22, linenWarmMat);
        }
        // Back shell + side armrests
        addBox(W, 0.62, 0.14, 0, 0.45, -D * 0.5 + 0.07, linenMat);
        addBox(0.17, 0.46, D - 0.04, -W * 0.5 + 0.085, 0.37, 0, linenMat);
        addBox(0.17, 0.46, D - 0.04, W * 0.5 - 0.085, 0.37, 0, linenMat);
        // Sculptural accent throw pillows
        const p1 = addBox(0.36, 0.34, 0.13, -W * 0.5 + 0.34, 0.52, -0.08, terracottaMat);
        p1.rotation.set(0.2, 0.35, -0.18);
        const p2 = addBox(0.34, 0.32, 0.12, W * 0.5 - 0.34, 0.51, -0.09, sageMat);
        p2.rotation.set(0.18, -0.32, 0.16);
        break;
      }

      case 'armchair': {
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const leg = new THREE.Mesh(
              new THREE.CylinderGeometry(0.022, 0.016, 0.16, 10),
              oakWoodMat
            );
            leg.position.set(sx * (W * 0.36), 0.08, sz * (D * 0.36));
            fg.add(leg);
          }
        }
        addBox(W - 0.06, 0.22, D - 0.08, 0, 0.27, 0.02, linenMat);
        addBox(W - 0.06, 0.46, 0.18, 0, 0.54, -D * 0.5 + 0.12, linenWarmMat);
        addBox(0.13, 0.34, D - 0.1, -W * 0.5 + 0.07, 0.42, 0, linenMat);
        addBox(0.13, 0.34, D - 0.1, W * 0.5 - 0.07, 0.42, 0, linenMat);
        addBox(0.38, 0.2, 0.1, 0, 0.45, -D * 0.18, terracottaMat);
        break;
      }

      case 'coffee_table': {
        // Sculpted Nordic oval-corner oak coffee table + art book + ceramic bowl
        addBox(W, 0.048, D, 0, 0.36, 0, oakWoodMat);
        for (const sx of [-1, 1]) {
          const col = new THREE.Mesh(
            new THREE.CylinderGeometry(0.095, 0.105, 0.34, 18),
            oakWoodMat
          );
          col.position.set(sx * (W * 0.3), 0.17, 0);
          col.castShadow = true;
          fg.add(col);
        }
        // Architecture monograph book + ceramic vase
        addBox(0.32, 0.032, 0.24, -0.22, 0.4, 0.03, ceramicWhiteMat, false);
        const bowl = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.07, 0.08, 16),
          terracottaMat
        );
        bowl.position.set(0.24, 0.42, -0.04);
        fg.add(bowl);
        break;
      }

      case 'dining_set': {
        const tW = W - 0.12;
        const tD = D - 0.12;
        // Solid oak dining tabletop
        addBox(tW, 0.048, tD, 0, 0.74, 0, oakWoodMat);
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const leg = new THREE.Mesh(
              new THREE.CylinderGeometry(0.028, 0.02, 0.72, 12),
              oakWoodMat
            );
            leg.position.set(sx * (tW * 0.44), 0.36, sz * (tD * 0.42));
            leg.castShadow = true;
            fg.add(leg);
          }
        }
        // Centerpiece ceramic vessel
        const vase = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.09, 0.2, 14),
          ceramicWhiteMat
        );
        vase.position.set(0, 0.86, 0);
        fg.add(vase);

        // 4 or 6 sculpted chairs tucked neatly
        const cols = W >= 1.7 ? 3 : 2;
        for (let c = 0; c < cols; c++) {
          const cx = -tW * 0.33 + (cols > 1 ? (c / (cols - 1)) * (tW * 0.66) : 0);
          for (const side of [-1, 1]) {
            const cz = side * (tD * 0.5 + 0.08);
            addBox(0.42, 0.045, 0.4, cx, 0.45, cz, linenWarmMat);
            addBox(0.4, 0.34, 0.04, cx, 0.64, cz + side * 0.18, oakWoodMat);
            for (const lx of [-0.17, 0.17]) {
              addBox(0.03, 0.44, 0.03, cx + lx, 0.22, cz + side * 0.17, oakWoodMat, false);
              addBox(0.03, 0.44, 0.03, cx + lx, 0.22, cz - side * 0.16, oakWoodMat, false);
            }
          }
        }
        break;
      }

      case 'kitchen_island': {
        // Fluted oak island base + honed limestone waterfall countertop
        addBox(W - 0.08, 0.86, D - 0.2, 0, 0.43, -0.08, oakWoodMat);
        addBox(W, 0.06, D, 0, 0.89, 0, stoneMat);
        // Waterfall stone sides
        addBox(0.055, 0.88, D, -W * 0.5 + 0.028, 0.44, 0, stoneMat);
        addBox(0.055, 0.88, D, W * 0.5 - 0.028, 0.44, 0, stoneMat);
        // Undermount sink basin + brass gooseneck tap
        addBox(0.56, 0.02, 0.38, -0.25, 0.915, -0.08, bronzeFrameMat, false);
        const faucetStem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.014, 0.28, 10),
          brassMat
        );
        faucetStem.position.set(-0.25, 1.05, -0.3);
        fg.add(faucetStem);
        const faucetArch = new THREE.Mesh(
          new THREE.TorusGeometry(0.08, 0.011, 8, 14, Math.PI),
          brassMat
        );
        faucetArch.rotation.y = Math.PI / 2;
        faucetArch.position.set(-0.25, 1.18, -0.22);
        fg.add(faucetArch);

        // 3 tucked counter stools along +Z overhang
        for (const sx of [-0.62, 0, 0.62]) {
          if (Math.abs(sx) > W * 0.42) continue;
          const seat = new THREE.Mesh(
            new THREE.CylinderGeometry(0.17, 0.16, 0.05, 16),
            linenWarmMat
          );
          seat.position.set(sx, 0.64, D * 0.36);
          seat.castShadow = true;
          fg.add(seat);
          for (const lx of [-0.11, 0.11]) {
            for (const lz of [-0.11, 0.11]) {
              addBox(0.025, 0.62, 0.025, sx + lx, 0.31, D * 0.36 + lz, oakWoodMat, false);
            }
          }
        }
        break;
      }

      case 'kitchen_counter': {
        addBox(W, 0.86, D - 0.04, 0, 0.43, -0.02, oakWoodMat);
        addBox(W + 0.02, 0.05, D, 0, 0.885, 0, stoneMat);
        // Stone backsplash
        addBox(W, 0.42, 0.03, 0, 1.12, -D * 0.5 + 0.02, stoneMat, false);
        // Induction cooktop glass panel
        addBox(0.72, 0.014, 0.46, 0.2, 0.915, 0.02, bronzeFrameMat, false);
        // Floating oak display shelf above
        addBox(W - 0.2, 0.04, 0.26, 0, 1.56, -D * 0.5 + 0.14, oakWoodMat);
        // Brass cabinet pulls
        for (let i = 0; i < 4; i++) {
          const px = -W * 0.38 + (i / 3) * (W * 0.76);
          addBox(0.14, 0.015, 0.02, px, 0.76, D * 0.5 - 0.01, brassMat, false);
        }
        break;
      }

      case 'bed_king': {
        const bW = W - 0.28;
        // Low oak platform frame
        addBox(bW + 0.1, 0.22, D - 0.08, 0, 0.14, 0.02, oakWoodMat);
        // Upholstered headboard at -Z
        addBox(W, 1.02, 0.12, 0, 0.54, -D * 0.5 + 0.07, linenWarmMat);
        // Crisp white mattress
        addBox(bW, 0.24, D - 0.22, 0, 0.36, 0.04, ceramicWhiteMat);
        // Layered warm linen duvet & terracotta throw blanket
        addBox(bW + 0.04, 0.12, D * 0.62, 0, 0.46, D * 0.15, linenMat);
        addBox(bW + 0.05, 0.05, 0.42, 0, 0.51, D * 0.3, sageMat);
        // 4 plush pillows
        for (const sx of [-1, 1]) {
          const pBack = addBox(
            bW * 0.42,
            0.22,
            0.28,
            sx * bW * 0.24,
            0.57,
            -D * 0.5 + 0.3,
            ceramicWhiteMat
          );
          pBack.rotation.x = 0.28;
          addBox(bW * 0.32, 0.15, 0.22, sx * bW * 0.24, 0.54, -D * 0.5 + 0.5, linenWarmMat);
        }
        // Floating nightstands + glowing bedside lamps
        for (const sx of [-1, 1]) {
          const nx = sx * (bW * 0.5 + 0.22);
          const nz = -D * 0.5 + 0.28;
          addBox(0.36, 0.14, 0.34, nx, 0.38, nz, oakWoodMat);
          const shade = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.1, 0.16, 14),
            lampGlowMat
          );
          shade.position.set(nx, 0.56, nz);
          fg.add(shade);
        }
        break;
      }

      case 'wardrobe': {
        addBox(W, 2.15, D, 0, 1.075, 0, oakWoodMat);
        // Subtle door seam & vertical brass pulls
        addBox(0.012, 2.05, 0.015, 0, 1.075, D * 0.5 + 0.004, walnutWoodMat, false);
        addBox(0.016, 0.42, 0.025, -0.06, 1.1, D * 0.5 + 0.015, brassMat, false);
        addBox(0.016, 0.42, 0.025, 0.06, 1.1, D * 0.5 + 0.015, brassMat, false);
        break;
      }

      case 'desk': {
        addBox(W, 0.045, D, 0, 0.74, 0, walnutWoodMat);
        addBox(0.05, 0.72, D - 0.08, -W * 0.5 + 0.06, 0.36, 0, walnutWoodMat);
        addBox(0.38, 0.68, D - 0.08, W * 0.5 - 0.22, 0.35, 0, walnutWoodMat);
        // Studio monitor + architectural blueprint sheet
        addBox(0.56, 0.34, 0.022, 0, 1.01, -D * 0.24, bronzeFrameMat);
        addBox(0.08, 0.12, 0.08, 0, 0.8, -D * 0.24, brassMat, false);
        addBox(0.44, 0.008, 0.3, -0.1, 0.768, 0.12, ceramicWhiteMat, false);
        // Sculpted task chair at +Z
        addBox(0.46, 0.05, 0.44, -0.1, 0.46, D * 0.45, linenMat);
        addBox(0.44, 0.36, 0.05, -0.1, 0.65, D * 0.45 + 0.2, linenWarmMat);
        const ped = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.025, 0.44, 10),
          bronzeFrameMat
        );
        ped.position.set(-0.1, 0.22, D * 0.45);
        fg.add(ped);
        break;
      }

      case 'bookshelf': {
        // Side uprights + 5 horizontal walnut shelves + curated books
        addBox(0.04, 1.92, D, -W * 0.5 + 0.02, 0.96, 0, walnutWoodMat);
        addBox(0.04, 1.92, D, W * 0.5 - 0.02, 0.96, 0, walnutWoodMat);
        const bookMats = [linenMat, terracottaMat, sageMat, stoneMat, ceramicWhiteMat];
        for (let s = 0; s < 5; s++) {
          const sy = 0.18 + s * 0.42;
          addBox(W - 0.04, 0.032, D, 0, sy, 0, walnutWoodMat);
          if (s < 4) {
            for (let b = 0; b < 5; b++) {
              const bx = -W * 0.34 + b * 0.11 + (s % 2) * 0.18;
              const bh = 0.2 + ((s + b) % 3) * 0.045;
              addBox(
                0.035,
                bh,
                0.22,
                bx,
                sy + 0.016 + bh * 0.5,
                0,
                bookMats[(s + b) % bookMats.length],
                false
              );
            }
          }
        }
        break;
      }

      case 'bathtub': {
        // Sculptural matte-white oval freestanding soaking tub
        const outer = new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 0.34, 0.58, 28),
          ceramicWhiteMat
        );
        outer.scale.set(W / 0.8, 1, D / 0.8);
        outer.position.y = 0.29;
        outer.castShadow = true;
        outer.receiveShadow = true;
        fg.add(outer);

        // Soft spa water surface inside tub
        const water = new THREE.Mesh(
          new THREE.CircleGeometry(0.35, 24),
          mat(
            new THREE.MeshStandardMaterial({
              color: 0xcbe4e6,
              roughness: 0.12,
              metalness: 0.1,
            })
          )
        );
        water.rotation.x = -Math.PI / 2;
        water.scale.set((W - 0.14) / 0.7, (D - 0.14) / 0.7, 1);
        water.position.y = 0.54;
        fg.add(water);

        // Oak bath tray + floor-standing brass filler
        addBox(0.24, 0.025, D + 0.04, 0.12, 0.595, 0, oakWoodMat, false);
        const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.78, 10), brassMat);
        stand.position.set(-W * 0.44, 0.39, -D * 0.38);
        fg.add(stand);
        break;
      }

      case 'vanity': {
        // Floating oak cabinet + limestone top + oval vessel basin + round mirror
        addBox(W, 0.44, D, 0, 0.58, 0, oakWoodMat);
        addBox(W + 0.02, 0.05, D + 0.02, 0, 0.825, 0, stoneMat);
        const basin = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.17, 0.13, 20),
          ceramicWhiteMat
        );
        basin.scale.set(1.2, 1, 0.85);
        basin.position.set(0, 0.91, 0.02);
        fg.add(basin);
        const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.2, 10), brassMat);
        tap.position.set(0, 0.94, -0.17);
        fg.add(tap);
        // Round brass-framed mirror mounted above vanity
        const mirror = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.025, 28), mirrorMat);
        mirror.rotation.x = Math.PI / 2;
        mirror.position.set(0, 1.48, -D * 0.5 + 0.03);
        fg.add(mirror);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.385, 0.014, 8, 32), brassMat);
        rim.position.set(0, 1.48, -D * 0.5 + 0.04);
        fg.add(rim);
        break;
      }

      case 'console_table': {
        addBox(W, 0.055, D, 0, 0.78, 0, stoneMat);
        addBox(0.12, 0.76, D - 0.08, -W * 0.36, 0.38, 0, stoneMat);
        addBox(0.12, 0.76, D - 0.08, W * 0.36, 0.38, 0, stoneMat);
        const vase = new THREE.Mesh(
          new THREE.CylinderGeometry(0.065, 0.1, 0.28, 16),
          terracottaMat
        );
        vase.position.set(-W * 0.22, 0.94, 0);
        vase.castShadow = true;
        fg.add(vase);
        const sprig = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 1), foliageMat);
        sprig.position.set(-W * 0.22, 1.16, 0);
        fg.add(sprig);
        break;
      }

      case 'plant': {
        const pot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.15, 0.38, 18),
          stoneMat
        );
        pot.position.y = 0.19;
        pot.castShadow = true;
        pot.receiveShadow = true;
        fg.add(pot);

        const soil = new THREE.Mesh(new THREE.CircleGeometry(0.185, 16), walnutWoodMat);
        soil.rotation.x = -Math.PI / 2;
        soil.position.y = 0.382;
        fg.add(soil);

        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.028, 0.92, 8),
          walnutWoodMat
        );
        stem.position.y = 0.82;
        stem.castShadow = true;
        fg.add(stem);

        const clusters = [
          [0, 1.32, 0, 0.22],
          [0.16, 1.14, 0.12, 0.17],
          [-0.17, 1.18, -0.1, 0.18],
          [0.12, 0.98, -0.14, 0.15],
          [-0.13, 0.96, 0.15, 0.16],
        ];
        clusters.forEach(([lx, ly, lz, lr], idx) => {
          const c = new THREE.Mesh(
            new THREE.DodecahedronGeometry(lr, 1),
            idx % 2 === 0 ? foliageMat : foliageLightMat
          );
          c.scale.set(1.1, 0.82, 1.1);
          c.position.set(lx, ly, lz);
          c.castShadow = true;
          fg.add(c);
        });
        break;
      }

      case 'floor_lamp': {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.03, 20), stoneMat);
        base.position.y = 0.015;
        fg.add(base);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 1.55, 10), brassMat);
        pole.position.y = 0.79;
        pole.castShadow = true;
        fg.add(pole);
        const shade = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.22, 0.28, 20),
          lampGlowMat
        );
        shade.position.y = 1.56;
        shade.castShadow = true;
        fg.add(shade);
        break;
      }

      default: {
        addBox(W, 0.65, D, 0, 0.325, 0, oakWoodMat);
        break;
      }
    }

    group.add(fg);
  };

  for (const item of floorplan.furniture) {
    buildFurniture3D(item);
  }

  // =========================================================================
  // 5. CLICKABLE 3D VIRTUAL TOUR HOTSPOT MEDALLIONS
  // =========================================================================
  const markerDiscMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xc85a32,
      emissiveIntensity: 0.25,
      roughness: 0.35,
    })
  );
  const markerRingMat = mat(
    new THREE.MeshBasicMaterial({
      color: 0xc85a32,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );

  floorplan.tourStops.forEach((stop, index) => {
    const mg = new THREE.Group();
    mg.position.set(stop.guidePos.x, 0.008, stop.guidePos.z);

    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.012, 28), markerDiscMat);
    disc.userData = { tourStopIndex: index, tourStopId: stop.id };
    mg.add(disc);
    tourMarkerMeshes.push(disc);

    const ringGeo = new THREE.RingGeometry(0.21, 0.25, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, markerRingMat);
    ring.position.y = 0.004;
    mg.add(ring);
    pulseRings.push(ring);

    group.add(mg);
  });

  // =========================================================================
  // 6. SMART CAMERA-AWARE WALL CUTAWAY UPDATER
  // =========================================================================
  const updateWallCutaway: BuiltArchitecture['updateWallCutaway'] = (
    cameraPos,
    _targetPos,
    mode,
    dt,
    elapsed
  ) => {
    const safeDt = Math.min(dt, 0.05);
    const blend = 1 - Math.exp(-10 * safeDt);

    for (const cw of cutawayWalls) {
      let desired = 1.0;
      if (mode === 'low') {
        desired = 0.16;
      } else if (mode === 'cutaway') {
        if (cw.isExterior) {
          const toCamX = cameraPos.x - cw.midX;
          const toCamZ = cameraPos.z - cw.midZ;
          const horiz = Math.hypot(toCamX, toCamZ);
          if (horiz > 0.01) {
            const dot = (toCamX / horiz) * cw.outNormalX + (toCamZ / horiz) * cw.outNormalZ;
            // Smoothly drop exterior walls standing between the viewer and interior
            if (dot > 0.22 && cameraPos.y > 1.85) {
              desired = 0.16;
            }
          }
        }
      }
      cw.currentScaleY += (desired - cw.currentScaleY) * blend;
      cw.group.scale.y = cw.currentScaleY;
    }

    // Subtle breathing animation on virtual tour floor medallions
    const pulse = 1 + Math.sin(elapsed * 2.4) * 0.08;
    for (let i = 0; i < pulseRings.length; i++) {
      pulseRings[i].scale.set(pulse, 1, pulse);
    }
  };

  return {
    group,
    walkableMeshes,
    tourMarkerMeshes,
    updateWallCutaway,
    dispose: () => {
      group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          // Dispose geometry safely
          m.geometry?.dispose();
        }
      });
      localMaterials.forEach((m) => m.dispose());
    },
  };
}
