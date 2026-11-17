import * as THREE from 'three';
import { GuideGesture } from '../types/floorplan';

interface FingerRig {
  mcp: THREE.Group; // base knuckle (or CMC for thumb)
  pip: THREE.Group; // middle knuckle
  dip: THREE.Group; // distal knuckle
  baseSplayZ: number;
  isThumb?: boolean;
}

interface ArmRig {
  sideSign: 1 | -1; // +1 = Left (+X), -1 = Right (-X)
  shoulder: THREE.Group;
  elbow: THREE.Group;
  wrist: THREE.Group;
  fingers: FingerRig[]; // [thumb, index, middle, ring, pinky]
}

interface ToeRig {
  mtp: THREE.Group; // base toe joint
  ip: THREE.Group; // distal toe joint
  baseYaw: number;
}

interface LegRig {
  sideSign: 1 | -1;
  hip: THREE.Group;
  knee: THREE.Group;
  ankle: THREE.Group;
  toeBase: THREE.Group;
  toes: ToeRig[]; // [hallux/big, 2nd, 3rd, 4th, 5th/pinky]
}

export interface HumanGuideController {
  root: THREE.Group;
  update: (params: {
    dt: number;
    elapsed: number;
    isWalking: boolean;
    walkSpeed: number;
    isSpeaking: boolean;
    gesture: GuideGesture;
    lookTargetWorld?: THREE.Vector3 | null;
    presentDirWorld?: THREE.Vector3 | null;
  }) => void;
  getInspectAnchorWorld: (target: 'full' | 'head' | 'hands' | 'feet') => {
    focus: THREE.Vector3;
    idealCamOffset: THREE.Vector3;
  };
  triggerWave: (duration?: number) => void;
  triggerPresent: (duration?: number) => void;
  dispose: () => void;
}

function createTaperedLimb(
  rTop: number,
  rBottom: number,
  length: number,
  material: THREE.Material,
  radialSegs = 16
): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, length, radialSegs, 1);
  // Shift so top sits at y = 0 and extends down to y = -length
  geo.translate(0, -length * 0.5, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createHorizontalToeSegment(
  rBase: number,
  rTip: number,
  length: number,
  material: THREE.Material,
  radialSegs = 12
): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(rTip, rBase, length, radialSegs, 1);
  // Rotate so base is at z = 0 and extends forward to z = +length
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0, length * 0.5);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createSculptedHeadGeometry(): THREE.BufferGeometry {
  // Smooth cranial + facial contour sphere with realistic jawline, cheeks, forehead & occiput
  const geo = new THREE.SphereGeometry(0.096, 32, 28);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const ny = y / 0.096; // -1 (chin) .. +1 (crown)
    const nz = z / 0.096; // -1 (back) .. +1 (face)

    // Elongate head vertically to natural human proportion (~22.5cm height)
    y *= 1.19;

    // Slight temple & cheek sculpting
    x *= 0.87;

    // Taper lower face smoothly toward jawline and chin
    if (ny < 0.05) {
      const jawFactor = Math.max(0, (0.05 - ny) / 1.05);
      x *= 1.0 - jawFactor * 0.34;
      if (nz > 0) {
        // Gentle chin projection and cheek plane
        z *= 1.0 - jawFactor * 0.12;
        if (ny < -0.65) {
          z += 0.007 * (1 - Math.abs(x) / 0.06);
        }
      } else {
        // Tuck underside of occiput into neck cleanly
        z *= 1.0 - jawFactor * 0.36;
      }
    } else {
      // Natural cranial fullness at back of skull
      if (nz < 0) {
        z *= 1.06;
      }
      // Subtle cheekbone definition around ny ~ -0.05..0.12
      if (ny < 0.2 && nz > 0.2) {
        x *= 1.03;
      }
    }

    // Slightly flatter natural front facial plane
    if (nz > 0.35 && ny > -0.55 && ny < 0.55) {
      z *= 0.96;
    }

    pos.setXYZ(i, x, y, z);
  }
  // Center pivot at base of skull (occipital condyles / top of neck)
  geo.translate(0, 0.098, 0.005);
  geo.computeVertexNormals();
  return geo;
}

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * dt));
}

function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export function createHumanGuide(): HumanGuideController {
  const root = new THREE.Group();
  root.name = 'HumanGuide_Elena';

  const disposableMaterials: THREE.Material[] = [];
  const disposableGeometries: THREE.BufferGeometry[] = [];

  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposableMaterials.push(m);
    return m;
  };

  // Warm, lifelike architectural character materials
  const skinMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe8b89a,
      roughness: 0.58,
      metalness: 0.01,
      emissive: 0x3b170c,
      emissiveIntensity: 0.06,
    })
  );

  const skinWarmMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdfa386,
      roughness: 0.55,
      metalness: 0.01,
      emissive: 0x3d150b,
      emissiveIntensity: 0.06,
    })
  );

  const nailMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf6dad0,
      roughness: 0.26,
      metalness: 0.04,
    })
  );

  const lipMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc9736a,
      roughness: 0.42,
      metalness: 0.02,
    })
  );

  const hairMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x34231b,
      roughness: 0.48,
      metalness: 0.06,
    })
  );

  const eyeWhiteMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfbf9f6,
      roughness: 0.2,
      metalness: 0.0,
    })
  );

  const irisMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5c3d24,
      roughness: 0.18,
      metalness: 0.05,
    })
  );

  const pupilMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x111010,
      roughness: 0.1,
    })
  );

  const glintMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
    })
  );

  // Chic architectural guide attire: terracotta-sage linen blouse + warm stone cropped trousers
  const blouseMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3d5a52, // Refined deep Nordic sage-teal so skin arms, hands & neck pop vividly
      roughness: 0.78,
      metalness: 0.02,
    })
  );

  const trouserMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd8cfc2, // Tailored warm alabaster-sand cropped ankle trousers
      roughness: 0.82,
      metalness: 0.01,
    })
  );

  const beltMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7c4b2b,
      roughness: 0.48,
      metalness: 0.08,
    })
  );

  const brassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd4a857,
      roughness: 0.28,
      metalness: 0.78,
    })
  );

  // Subtle floor contact ring beneath guide (visual anchor on floor)
  const auraGeo = new THREE.RingGeometry(0.24, 0.285, 40);
  auraGeo.rotateX(-Math.PI / 2);
  const auraMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xc85a32,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  const floorAura = new THREE.Mesh(auraGeo, auraMat);
  floorAura.position.y = 0.006;
  root.add(floorAura);

  // =========================================================================
  // 1. PELVIS & BODY / TORSO
  // =========================================================================
  const pelvisGroup = new THREE.Group();
  pelvisGroup.position.set(0, 0.89, 0);
  root.add(pelvisGroup);

  // Sculpted pelvis / hips
  const pelvisMesh = new THREE.Mesh(new THREE.SphereGeometry(0.155, 24, 18), trouserMat);
  pelvisMesh.scale.set(1.04, 0.72, 0.74);
  pelvisMesh.position.set(0, 0.015, -0.008);
  pelvisMesh.castShadow = true;
  pelvisMesh.receiveShadow = true;
  pelvisGroup.add(pelvisMesh);

  // Lower waist riser (trouser high waist)
  const highWaist = new THREE.Mesh(
    new THREE.CylinderGeometry(0.126, 0.152, 0.11, 24),
    trouserMat
  );
  highWaist.scale.set(1.0, 1.0, 0.73);
  highWaist.position.set(0, 0.068, -0.004);
  highWaist.castShadow = true;
  pelvisGroup.add(highWaist);

  // Leather belt + brushed brass architectural buckle
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.129, 0.132, 0.028, 24), beltMat);
  belt.scale.set(1.01, 1.0, 0.74);
  belt.position.set(0, 0.115, -0.003);
  pelvisGroup.add(belt);

  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.032, 0.014), brassMat);
  buckle.position.set(0, 0.115, 0.095);
  pelvisGroup.add(buckle);

  // Spine & Upper Torso / Chest
  const spineGroup = new THREE.Group();
  spineGroup.position.set(0, 0.12, 0); // world y = 1.01
  pelvisGroup.add(spineGroup);

  // Abdomen / lower ribcage
  const lowerTorso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.142, 0.124, 0.19, 24),
    blouseMat
  );
  lowerTorso.scale.set(1.02, 1.0, 0.73);
  lowerTorso.position.set(0, 0.09, 0);
  lowerTorso.castShadow = true;
  lowerTorso.receiveShadow = true;
  spineGroup.add(lowerTorso);

  // Upper ribcage / chest
  const upperTorso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.162, 0.141, 0.18, 24),
    blouseMat
  );
  upperTorso.scale.set(1.05, 1.0, 0.72);
  upperTorso.position.set(0, 0.265, 0);
  upperTorso.castShadow = true;
  upperTorso.receiveShadow = true;
  spineGroup.add(upperTorso);

  // Natural contoured bust shapes
  for (const s of [-1, 1]) {
    const bust = new THREE.Mesh(new THREE.SphereGeometry(0.068, 18, 16), blouseMat);
    bust.scale.set(0.95, 0.92, 0.84);
    bust.position.set(s * 0.062, 0.235, 0.078);
    bust.castShadow = true;
    spineGroup.add(bust);
  }

  // Smooth upper shoulder / trapezius bridge
  const shoulderBridge = new THREE.Mesh(new THREE.SphereGeometry(0.168, 24, 16), blouseMat);
  shoulderBridge.scale.set(1.06, 0.34, 0.66);
  shoulderBridge.position.set(0, 0.345, -0.003);
  shoulderBridge.castShadow = true;
  spineGroup.add(shoulderBridge);

  // Exposed V-neck skin décolletage & sculpted collarbones (clavicles)
  const decolletage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.068, 0.032, 0.068, 18),
    skinMat
  );
  decolletage.scale.set(1.18, 1.0, 0.85);
  decolletage.position.set(0, 0.358, 0.035);
  decolletage.rotation.x = 0.25;
  spineGroup.add(decolletage);

  for (const s of [-1, 1]) {
    const clavicle = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.0085, 0.075, 6, 10),
      skinMat
    );
    clavicle.rotation.z = Math.PI / 2 - s * 0.12;
    clavicle.rotation.y = -s * 0.18;
    clavicle.position.set(s * 0.052, 0.362, 0.068);
    spineGroup.add(clavicle);
  }

  // Subtle brass architectural studio badge on left lapel
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.011, 0.006), brassMat);
  badge.position.set(0.078, 0.305, 0.106);
  badge.rotation.y = 0.26;
  spineGroup.add(badge);

  // =========================================================================
  // 2. ARTICULATED NECK
  // =========================================================================
  const neckGroup = new THREE.Group();
  neckGroup.position.set(0, 0.365, 0.002); // world y = 1.375
  spineGroup.add(neckGroup);

  // Neck base flare into trapezius
  const neckBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.052, 0.068, 0.042, 20),
    skinMat
  );
  neckBase.scale.set(1.04, 1.0, 0.94);
  neckBase.position.set(0, 0.015, 0);
  neckBase.castShadow = true;
  neckGroup.add(neckBase);

  // Main cylindrical-tapered neck column
  const neckColumn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.047, 0.053, 0.095, 22),
    skinMat
  );
  neckColumn.scale.set(0.98, 1.0, 0.96);
  neckColumn.position.set(0, 0.058, 0.004);
  neckColumn.rotation.x = 0.05; // natural slight forward cervical lordosis
  neckColumn.castShadow = true;
  neckColumn.receiveShadow = true;
  neckGroup.add(neckColumn);

  // Subtle sternocleidomastoid tendons for anatomical realism
  for (const s of [-1, 1]) {
    const scm = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.068, 6, 8), skinMat);
    scm.position.set(s * 0.025, 0.048, 0.032);
    scm.rotation.z = s * 0.24;
    scm.rotation.x = -0.18;
    neckGroup.add(scm);
  }

  // =========================================================================
  // 3. SCULPTED HEAD, FACE, EYES, NOSE, LIPS, EARS & HAIR
  // =========================================================================
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.096, 0.008); // world y = 1.471
  neckGroup.add(headGroup);

  const headGeo = createSculptedHeadGeometry();
  disposableGeometries.push(headGeo);
  const headMesh = new THREE.Mesh(headGeo, skinMat);
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  headGroup.add(headMesh);

  // Subtle rosy cheeks
  for (const s of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.024, 14, 12), skinWarmMat);
    cheek.scale.set(1.05, 0.72, 0.55);
    cheek.position.set(s * 0.046, 0.078, 0.072);
    headGroup.add(cheek);
  }

  // Sculpted Nose (bridge + tip + left/right nostrils)
  const noseGroup = new THREE.Group();
  noseGroup.position.set(0, 0.088, 0.092);
  headGroup.add(noseGroup);

  const noseBridge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0065, 0.0105, 0.034, 12),
    skinMat
  );
  noseBridge.scale.set(0.85, 1.0, 1.15);
  noseBridge.position.set(0, 0.008, 0.004);
  noseBridge.rotation.x = -0.34;
  noseBridge.castShadow = true;
  noseGroup.add(noseBridge);

  const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.0105, 14, 12), skinWarmMat);
  noseTip.scale.set(1.02, 0.88, 1.12);
  noseTip.position.set(0, -0.008, 0.012);
  noseTip.castShadow = true;
  noseGroup.add(noseTip);

  for (const s of [-1, 1]) {
    const nostrilWing = new THREE.Mesh(new THREE.SphereGeometry(0.0068, 10, 10), skinWarmMat);
    nostrilWing.scale.set(1.0, 0.78, 0.95);
    nostrilWing.position.set(s * 0.0088, -0.0105, 0.005);
    noseGroup.add(nostrilWing);
  }

  // Expressive Eyes (sclera + iris + pupil + glint + animated blinking eyelids + eyebrows)
  const upperEyelids: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(s * 0.032, 0.108, 0.081);
    eyeGroup.rotation.y = s * 0.14;
    headGroup.add(eyeGroup);

    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.0135, 16, 14), eyeWhiteMat);
    sclera.scale.set(1.15, 0.88, 0.75);
    eyeGroup.add(sclera);

    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0076, 14, 12), irisMat);
    iris.scale.set(1.0, 1.0, 0.45);
    iris.position.set(0, 0, 0.0082);
    eyeGroup.add(iris);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 12, 10), pupilMat);
    pupil.scale.set(1.0, 1.0, 0.35);
    pupil.position.set(0, 0, 0.0108);
    eyeGroup.add(pupil);

    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.0018, 8, 8), glintMat);
    glint.position.set(0.0024, 0.0025, 0.0122);
    eyeGroup.add(glint);

    // Animated upper eyelid hemisphere
    const lidPivot = new THREE.Group();
    eyeGroup.add(lidPivot);
    const upperLid = new THREE.Mesh(
      new THREE.SphereGeometry(0.0148, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
      skinWarmMat
    );
    upperLid.scale.set(1.16, 0.92, 0.8);
    upperLid.rotation.x = -0.34; // resting natural open-eye crease
    lidPivot.add(upperLid);
    upperEyelids.push(lidPivot);

    // Upper lash line definition
    const lash = new THREE.Mesh(
      new THREE.TorusGeometry(0.0128, 0.0016, 6, 16, Math.PI * 0.82),
      hairMat
    );
    lash.rotation.z = Math.PI * 0.09;
    lash.position.set(0, 0.001, 0.0055);
    lidPivot.add(lash);

    // Sculpted arched eyebrow
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.0032, 0.024, 6, 10), hairMat);
    brow.rotation.z = Math.PI / 2 - s * 0.11;
    brow.rotation.y = -s * 0.14;
    brow.position.set(s * 0.002, 0.019, 0.006);
    eyeGroup.add(brow);
  }

  // Sculpted Lips (upper lip + animated lower lip for tour narration)
  const upperLip = new THREE.Mesh(new THREE.CapsuleGeometry(0.0046, 0.022, 6, 12), lipMat);
  upperLip.rotation.z = Math.PI / 2;
  upperLip.scale.set(0.85, 1.0, 0.9);
  upperLip.position.set(0, 0.052, 0.088);
  headGroup.add(upperLip);

  const lowerLipPivot = new THREE.Group();
  lowerLipPivot.position.set(0, 0.048, 0.072);
  headGroup.add(lowerLipPivot);

  const lowerLip = new THREE.Mesh(new THREE.CapsuleGeometry(0.0052, 0.019, 6, 12), lipMat);
  lowerLip.rotation.z = Math.PI / 2;
  lowerLip.scale.set(0.92, 1.0, 0.95);
  lowerLip.position.set(0, -0.002, 0.0155);
  lowerLipPivot.add(lowerLip);

  // Sculpted Left & Right Ears (outer helix rim + ear plate + soft earlobe)
  for (const s of [-1, 1]) {
    const earGroup = new THREE.Group();
    earGroup.position.set(s * 0.082, 0.096, -0.002);
    earGroup.rotation.y = s * -0.26;
    earGroup.rotation.z = s * -0.08;
    headGroup.add(earGroup);

    const earPlate = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 12), skinMat);
    earPlate.scale.set(0.32, 1.28, 0.78);
    earPlate.castShadow = true;
    earGroup.add(earPlate);

    const helix = new THREE.Mesh(
      new THREE.TorusGeometry(0.014, 0.0042, 8, 16, Math.PI * 1.25),
      skinWarmMat
    );
    helix.rotation.y = Math.PI / 2;
    helix.rotation.x = -Math.PI * 0.15;
    helix.scale.set(0.85, 1.25, 1.0);
    helix.position.set(s * 0.003, 0.003, 0);
    earGroup.add(helix);

    const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.0068, 10, 10), skinWarmMat);
    lobe.position.set(s * 0.002, -0.019, 0.003);
    earGroup.add(lobe);

    // Tiny minimalist pearl/brass stud earring
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.0032, 8, 8), brassMat);
    stud.position.set(s * 0.0065, -0.02, 0.005);
    earGroup.add(stud);
  }

  // Styled Architectural Hair (clean swept crown + low chignon bun so ears & neck stay visible!)
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.099, 28, 22, 0, Math.PI * 2, 0, Math.PI * 0.64),
    hairMat
  );
  hairCap.scale.set(0.91, 1.16, 1.06);
  hairCap.position.set(0, 0.106, -0.005);
  hairCap.rotation.x = -0.26;
  hairCap.castShadow = true;
  headGroup.add(hairCap);

  // Soft parted front hair sweeps framing forehead without hiding ears
  const leftSweep = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.075, 8, 12), hairMat);
  leftSweep.position.set(0.044, 0.165, 0.052);
  leftSweep.rotation.set(0.45, 0.35, 0.92);
  leftSweep.scale.set(0.68, 1.0, 0.9);
  leftSweep.castShadow = true;
  headGroup.add(leftSweep);

  const rightSweep = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.068, 8, 12), hairMat);
  rightSweep.position.set(-0.046, 0.163, 0.05);
  rightSweep.rotation.set(0.45, -0.35, -0.95);
  rightSweep.scale.set(0.66, 1.0, 0.9);
  rightSweep.castShadow = true;
  headGroup.add(rightSweep);

  // Sculpted back chignon bun + brass hairpin
  const chignon = new THREE.Mesh(new THREE.SphereGeometry(0.046, 20, 16), hairMat);
  chignon.scale.set(1.06, 0.94, 0.92);
  chignon.position.set(0, 0.096, -0.108);
  chignon.castShadow = true;
  headGroup.add(chignon);

  const hairPin = new THREE.Mesh(new THREE.CylinderGeometry(0.0024, 0.0018, 0.105, 8), brassMat);
  hairPin.position.set(0.004, 0.104, -0.132);
  hairPin.rotation.z = 1.18;
  headGroup.add(hairPin);

  // =========================================================================
  // 4. LEFT & RIGHT ARMS WITH COMPLETE HANDS & FIVE ARTICULATED FINGERS EACH
  // =========================================================================
  const buildArmWithFiveFingers = (sideSign: 1 | -1): ArmRig => {
    // sideSign = +1 -> Left arm (+X), sideSign = -1 -> Right arm (-X)
    const shoulder = new THREE.Group();
    shoulder.position.set(sideSign * 0.178, 0.332, -0.002);
    spineGroup.add(shoulder);

    // Tailored short cap sleeve over rounded deltoid
    const capSleeve = new THREE.Mesh(new THREE.SphereGeometry(0.052, 18, 14), blouseMat);
    capSleeve.scale.set(0.95, 1.08, 0.95);
    capSleeve.position.set(0, -0.012, 0);
    capSleeve.castShadow = true;
    shoulder.add(capSleeve);

    const sleeveCuff = createTaperedLimb(0.048, 0.044, 0.075, blouseMat, 16);
    sleeveCuff.position.y = -0.01;
    shoulder.add(sleeveCuff);

    // Bare sculpted upper arm (bicep / tricep)
    const upperArm = createTaperedLimb(0.041, 0.0355, 0.195, skinMat, 16);
    upperArm.position.y = -0.072;
    shoulder.add(upperArm);

    // Smooth elbow joint sphere
    const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(0.0355, 14, 12), skinMat);
    elbowJoint.position.y = -0.265;
    elbowJoint.castShadow = true;
    shoulder.add(elbowJoint);

    // Elbow pivot
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.265, 0);
    shoulder.add(elbow);

    // Bare sculpted forearm tapering smoothly to wrist
    const forearm = createTaperedLimb(0.0365, 0.0245, 0.242, skinMat, 16);
    elbow.add(forearm);

    // Subtle wrist joint contour (flattened oval matching human wrist)
    const wristJoint = new THREE.Mesh(new THREE.SphereGeometry(0.025, 14, 12), skinMat);
    wristJoint.scale.set(1.14, 0.85, 0.72);
    wristJoint.position.y = -0.242;
    elbow.add(wristJoint);

    // Wrist pivot
    // Local hand convention:
    //   -Y = toward fingertips
    //   +Z = dorsal (back of hand, fingernails)
    //   -Z = palmar (palm of hand; +X rotation curls fingers into palm!)
    //   -sideSign * X = radial (THUMB side, medial when back of hand faces +Z)
    //   +sideSign * X = ulnar (PINKY side, lateral when back of hand faces +Z)
    const wrist = new THREE.Group();
    wrist.position.set(0, -0.244, 0);
    elbow.add(wrist);

    const radial = -sideSign; // direction toward thumb
    const ulnar = sideSign; // direction toward pinky

    // Sculpted metacarpal palm body
    const palmMain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.041, 0.082, 18),
      skinMat
    );
    palmMain.scale.set(1.02, 1.0, 0.34);
    palmMain.position.set(0, -0.041, 0);
    palmMain.castShadow = true;
    palmMain.receiveShadow = true;
    wrist.add(palmMain);

    // Rounded knuckle bridge across MCP joints
    const knuckleBar = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.0115, 0.058, 8, 12),
      skinMat
    );
    knuckleBar.rotation.z = Math.PI / 2;
    knuckleBar.scale.set(0.95, 1.0, 0.88);
    knuckleBar.position.set(0, -0.081, 0);
    knuckleBar.castShadow = true;
    wrist.add(knuckleBar);

    // Fleshy thenar thumb eminence pad on palmar radial side
    const thenarPad = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 10), skinWarmMat);
    thenarPad.scale.set(0.95, 1.32, 0.72);
    thenarPad.position.set(radial * 0.025, -0.042, -0.005);
    thenarPad.rotation.z = radial * -0.35;
    wrist.add(thenarPad);

    // Hypothenar pad on palmar ulnar edge
    const hypothenarPad = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 10), skinWarmMat);
    hypothenarPad.scale.set(0.75, 1.45, 0.68);
    hypothenarPad.position.set(ulnar * 0.027, -0.046, -0.004);
    wrist.add(hypothenarPad);

    const fingers: FingerRig[] = [];

    // Helper to build a single multi-phalangeal finger with knuckles, rounded pad & dorsal fingernail
    const addFinger = (cfg: {
      baseX: number;
      baseY: number;
      baseZ: number;
      splayZ: number;
      yawY?: number;
      l1: number;
      l2: number;
      l3: number;
      r0: number;
      r1: number;
      r2: number;
      r3: number;
      isThumb?: boolean;
    }) => {
      const mcp = new THREE.Group();
      mcp.position.set(cfg.baseX, cfg.baseY, cfg.baseZ);
      mcp.rotation.z = cfg.splayZ;
      if (cfg.yawY) mcp.rotation.y = cfg.yawY;
      wrist.add(mcp);

      // MCP knuckle sphere
      const k0 = new THREE.Mesh(new THREE.SphereGeometry(cfg.r0 * 1.04, 10, 10), skinWarmMat);
      mcp.add(k0);

      // Proximal phalanx
      const seg1 = createTaperedLimb(cfg.r0, cfg.r1, cfg.l1, skinMat, 12);
      mcp.add(seg1);

      // PIP middle knuckle pivot
      const pip = new THREE.Group();
      pip.position.set(0, -cfg.l1, 0);
      mcp.add(pip);

      const k1 = new THREE.Mesh(new THREE.SphereGeometry(cfg.r1 * 1.03, 10, 10), skinWarmMat);
      pip.add(k1);

      // Middle phalanx
      const seg2 = createTaperedLimb(cfg.r1, cfg.r2, cfg.l2, skinMat, 12);
      pip.add(seg2);

      // DIP distal knuckle pivot
      const dip = new THREE.Group();
      dip.position.set(0, -cfg.l2, 0);
      pip.add(dip);

      const k2 = new THREE.Mesh(new THREE.SphereGeometry(cfg.r2 * 1.02, 10, 10), skinWarmMat);
      dip.add(k2);

      // Distal phalanx
      const seg3 = createTaperedLimb(cfg.r2, cfg.r3, cfg.l3, skinMat, 12);
      dip.add(seg3);

      // Soft rounded fingertip pad
      const tip = new THREE.Mesh(new THREE.SphereGeometry(cfg.r3, 10, 10), skinWarmMat);
      tip.scale.set(1.0, 1.12, 0.92);
      tip.position.set(0, -cfg.l3, 0);
      dip.add(tip);

      // Delicate pale-pink fingernail plate on dorsal (+Z) side of fingertip!
      const nail = new THREE.Mesh(new THREE.SphereGeometry(cfg.r3 * 0.84, 10, 8), nailMat);
      nail.scale.set(0.92, 1.38, 0.28);
      nail.position.set(0, -cfg.l3 * 0.68, cfg.r3 * 0.82);
      dip.add(nail);

      fingers.push({
        mcp,
        pip,
        dip,
        baseSplayZ: cfg.splayZ,
        isThumb: cfg.isThumb,
      });
    };

    // FINGER 1: THUMB (opposable radial digit — metacarpal + proximal + distal + thumbnail)
    // Note: in right-handed coords, rotating vector (0, -1, 0) by angle a around Z gives (sin a, -cos a, 0).
    // To splay toward `radial`, we set rotation.z = radial * positiveAngle!
    addFinger({
      baseX: radial * 0.035,
      baseY: -0.032,
      baseZ: -0.004,
      splayZ: radial * 0.64,
      yawY: radial * 0.42, // natural thumb opposition
      l1: 0.032,
      l2: 0.028,
      l3: 0.022,
      r0: 0.0092,
      r1: 0.0079,
      r2: 0.0071,
      r3: 0.0062,
      isThumb: true,
    });

    // FINGER 2: INDEX FINGER
    addFinger({
      baseX: radial * 0.030,
      baseY: -0.081,
      baseZ: 0.0,
      splayZ: radial * 0.13,
      l1: 0.039,
      l2: 0.024,
      l3: 0.017,
      r0: 0.0070,
      r1: 0.0062,
      r2: 0.0055,
      r3: 0.0048,
    });

    // FINGER 3: MIDDLE FINGER (longest central finger)
    addFinger({
      baseX: radial * 0.010,
      baseY: -0.085,
      baseZ: 0.001,
      splayZ: radial * 0.015,
      l1: 0.044,
      l2: 0.027,
      l3: 0.018,
      r0: 0.0072,
      r1: 0.0064,
      r2: 0.0056,
      r3: 0.0049,
    });

    // FINGER 4: RING FINGER
    addFinger({
      baseX: ulnar * 0.010,
      baseY: -0.082,
      baseZ: 0.0,
      splayZ: ulnar * 0.1,
      l1: 0.040,
      l2: 0.025,
      l3: 0.017,
      r0: 0.0068,
      r1: 0.0060,
      r2: 0.0053,
      r3: 0.0046,
    });

    // FINGER 5: PINKY / LITTLE FINGER
    addFinger({
      baseX: ulnar * 0.029,
      baseY: -0.075,
      baseZ: -0.001,
      splayZ: ulnar * 0.22,
      l1: 0.032,
      l2: 0.019,
      l3: 0.015,
      r0: 0.0059,
      r1: 0.0052,
      r2: 0.0046,
      r3: 0.0041,
    });

    return { sideSign, shoulder, elbow, wrist, fingers };
  };

  const leftArm = buildArmWithFiveFingers(1);
  const rightArm = buildArmWithFiveFingers(-1);

  // =========================================================================
  // 5. LEFT & RIGHT LEGS WITH COMPLETE BARE FEET & FIVE ARTICULATED TOES EACH
  // =========================================================================
  const buildLegWithFiveToes = (sideSign: 1 | -1): LegRig => {
    // sideSign = +1 -> Left leg (+X), sideSign = -1 -> Right leg (-X)
    const medial = -sideSign; // toward midline (BIG TOE / HALLUX side!)
    const lateral = sideSign; // away from midline (LITTLE / PINKY TOE side!)

    const hip = new THREE.Group();
    hip.position.set(sideSign * 0.092, 0.89, 0);
    root.add(hip);

    // Upper thigh (trouser)
    const thigh = createTaperedLimb(0.084, 0.064, 0.42, trouserMat, 18);
    hip.add(thigh);

    // Smooth knee cap / joint
    const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.062, 16, 14), trouserMat);
    kneeCap.position.set(0, -0.42, 0.003);
    kneeCap.castShadow = true;
    hip.add(kneeCap);

    // Knee pivot at world y = 0.47
    const knee = new THREE.Group();
    knee.position.set(0, -0.42, 0);
    hip.add(knee);

    // Cropped ankle trouser lower leg (stops neatly above ankle so bare foot + ankle + 5 toes shine!)
    const trouserShin = createTaperedLimb(0.063, 0.052, 0.265, trouserMat, 18);
    knee.add(trouserShin);

    // Crisp tailored trouser cuff hem
    const cuff = new THREE.Mesh(
      new THREE.TorusGeometry(0.051, 0.0055, 8, 20),
      trouserMat
    );
    cuff.rotation.x = Math.PI / 2;
    cuff.position.set(0, -0.265, 0);
    knee.add(cuff);

    // Bare sculpted lower shin, Achilles tendon & ankle down to ankle pivot (y = -0.395 -> world y = 0.075)
    const bareAnkleColumn = createTaperedLimb(0.044, 0.034, 0.132, skinMat, 18);
    bareAnkleColumn.position.y = -0.263;
    knee.add(bareAnkleColumn);

    // Ankle pivot at world y = 0.075 (so floor plane is at local y = -0.075!)
    const ankle = new THREE.Group();
    ankle.position.set(0, -0.395, 0);
    knee.add(ankle);

    // Anatomical medial & lateral malleoli (ankle bones)
    const medialMalleolus = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 10, 10),
      skinWarmMat
    );
    medialMalleolus.position.set(medial * 0.031, 0.008, 0.004);
    ankle.add(medialMalleolus);

    const lateralMalleolus = new THREE.Mesh(
      new THREE.SphereGeometry(0.0135, 10, 10),
      skinWarmMat
    );
    lateralMalleolus.position.set(lateral * 0.032, -0.003, -0.004);
    ankle.add(lateralMalleolus);

    // Sculpted rounded heel (Calcaneus), bottom touches y = -0.074
    const heel = new THREE.Mesh(new THREE.SphereGeometry(0.037, 16, 14), skinMat);
    heel.scale.set(0.94, 0.96, 1.15);
    heel.position.set(0, -0.039, -0.012);
    heel.castShadow = true;
    heel.receiveShadow = true;
    ankle.add(heel);

    // Dorsal instep bridge sloping smoothly from ankle front down to metatarsal ball of foot
    const instep = new THREE.Mesh(
      new THREE.CylinderGeometry(0.044, 0.035, 0.132, 18),
      skinMat
    );
    instep.rotation.x = Math.PI / 2 + 0.25;
    instep.scale.set(1.04, 1.0, 0.62);
    instep.position.set(lateral * 0.002, -0.038, 0.056);
    instep.castShadow = true;
    instep.receiveShadow = true;
    ankle.add(instep);

    // Plantar sole & contoured forefoot midsole
    const solePlate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.047, 0.034, 0.145, 18),
      skinWarmMat
    );
    solePlate.rotation.x = Math.PI / 2;
    solePlate.scale.set(1.04, 1.0, 0.36);
    solePlate.position.set(lateral * 0.002, -0.058, 0.055);
    solePlate.castShadow = true;
    solePlate.receiveShadow = true;
    ankle.add(solePlate);

    // Wide sculpted metatarsal ball of foot (oblique human angle: big toe base slightly further forward)
    const ballOfFoot = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.017, 0.068, 10, 14),
      skinMat
    );
    ballOfFoot.rotation.z = Math.PI / 2;
    ballOfFoot.rotation.y = medial * -0.18;
    ballOfFoot.scale.set(0.95, 1.0, 1.18);
    ballOfFoot.position.set(lateral * 0.002, -0.057, 0.122);
    ballOfFoot.castShadow = true;
    ballOfFoot.receiveShadow = true;
    ankle.add(ballOfFoot);

    // Subtle first-metatarsal head contour behind big toe
    const halluxMount = new THREE.Mesh(new THREE.SphereGeometry(0.0175, 12, 10), skinMat);
    halluxMount.scale.set(0.95, 0.85, 1.2);
    halluxMount.position.set(medial * 0.035, -0.058, 0.128);
    ankle.add(halluxMount);

    // Master toe push-off hinge group at the metatarsal ball line
    const toeBase = new THREE.Group();
    toeBase.position.set(0, -0.061, 0.126);
    ankle.add(toeBase);

    const toes: ToeRig[] = [];

    const addToe = (cfg: {
      x: number;
      y: number;
      zOffset: number;
      yaw: number;
      l1: number;
      l2: number;
      r0: number;
      r1: number;
      r2: number;
    }) => {
      const mtp = new THREE.Group();
      mtp.position.set(cfg.x, cfg.y, cfg.zOffset);
      mtp.rotation.y = cfg.yaw;
      toeBase.add(mtp);

      // Base joint blend
      const j0 = new THREE.Mesh(new THREE.SphereGeometry(cfg.r0, 10, 10), skinMat);
      mtp.add(j0);

      // Proximal toe phalanx (+Z forward)
      const p1 = createHorizontalToeSegment(cfg.r0, cfg.r1, cfg.l1, skinMat, 12);
      mtp.add(p1);

      // Interphalangeal distal pivot
      const ip = new THREE.Group();
      ip.position.set(0, 0, cfg.l1);
      ip.rotation.x = 0.07; // slight natural downward plantar grip
      mtp.add(ip);

      const j1 = new THREE.Mesh(new THREE.SphereGeometry(cfg.r1 * 1.02, 10, 10), skinWarmMat);
      ip.add(j1);

      // Distal toe phalanx
      const p2 = createHorizontalToeSegment(cfg.r1, cfg.r2, cfg.l2, skinMat, 12);
      ip.add(p2);

      // Plump rounded toe tip pad
      const pad = new THREE.Mesh(new THREE.SphereGeometry(cfg.r2 * 1.05, 12, 10), skinWarmMat);
      pad.scale.set(1.04, 0.92, 1.12);
      pad.position.set(0, -cfg.r2 * 0.05, cfg.l2);
      pad.castShadow = true;
      ip.add(pad);

      // Pale-pink lustrous toenail plate sitting cleanly on the dorsal (+Y) top of each toe!
      const toenail = new THREE.Mesh(new THREE.SphereGeometry(cfg.r2 * 0.88, 10, 8), nailMat);
      toenail.scale.set(0.98, 0.25, 1.22);
      toenail.position.set(0, cfg.r2 * 0.86, cfg.l2 * 0.72);
      ip.add(toenail);

      toes.push({ mtp, ip, baseYaw: cfg.yaw });
    };

    // FIVE ANATOMICALLY GRADUATED, DISTINCTLY SEPARATED TOES PER FOOT (10 TOES TOTAL):
    // TOE 1: HALLUX (Big Toe — medial inner side, robust & prominent)
    addToe({
      x: medial * 0.036,
      y: 0.001,
      zOffset: 0.011,
      yaw: medial * 0.03,
      l1: 0.025,
      l2: 0.021,
      r0: 0.0115,
      r1: 0.0106,
      r2: 0.0102,
    });

    // TOE 2: SECOND / INDEX TOE
    addToe({
      x: medial * 0.014,
      y: -0.001,
      zOffset: 0.010,
      yaw: medial * 0.01,
      l1: 0.024,
      l2: 0.019,
      r0: 0.0074,
      r1: 0.0068,
      r2: 0.0065,
    });

    // TOE 3: MIDDLE TOE
    addToe({
      x: lateral * 0.004,
      y: -0.0015,
      zOffset: 0.006,
      yaw: lateral * -0.01,
      l1: 0.021,
      l2: 0.017,
      r0: 0.0070,
      r1: 0.0064,
      r2: 0.0061,
    });

    // TOE 4: FOURTH TOE
    addToe({
      x: lateral * 0.021,
      y: -0.002,
      zOffset: -0.001,
      yaw: lateral * -0.04,
      l1: 0.018,
      l2: 0.015,
      r0: 0.0065,
      r1: 0.0060,
      r2: 0.0057,
    });

    // TOE 5: LITTLE / PINKY TOE (lateral outer edge, compact & subtly tucked)
    addToe({
      x: lateral * 0.037,
      y: -0.003,
      zOffset: -0.010,
      yaw: lateral * -0.09,
      l1: 0.014,
      l2: 0.012,
      r0: 0.0060,
      r1: 0.0055,
      r2: 0.0052,
    });

    return { sideSign, hip, knee, ankle, toeBase, toes };
  };

  const leftLeg = buildLegWithFiveToes(1);
  const rightLeg = buildLegWithFiveToes(-1);

  // =========================================================================
  // 6. PROCEDURAL ANIMATION STATE & BIOMECHANICAL CONTROLLER
  // =========================================================================
  let walkCycle = 0;
  let walkBlend = 0;
  let waveTimer = 0;
  let presentTimer = 0;
  let nextBlinkAt = 2.4;
  let blinkProgress = -1;
  const tempLocalLook = new THREE.Vector3();
  const invRootQuat = new THREE.Quaternion();

  const applyFingerPose = (
    arm: ArmRig,
    curl: [number, number, number, number, number],
    spreadMultiplier: number,
    dt: number,
    speed = 10
  ) => {
    for (let i = 0; i < 5; i++) {
      const f = arm.fingers[i];
      const c = curl[i]; // 0 = straight open, 1 = comfortably curled
      if (f.isThumb) {
        f.mcp.rotation.z = damp(f.mcp.rotation.z, f.baseSplayZ * spreadMultiplier, speed, dt);
        f.mcp.rotation.x = damp(f.mcp.rotation.x, c * 0.32, speed, dt);
        f.pip.rotation.x = damp(f.pip.rotation.x, c * 0.42, speed, dt);
        f.dip.rotation.x = damp(f.dip.rotation.x, c * 0.38, speed, dt);
      } else {
        f.mcp.rotation.z = damp(f.mcp.rotation.z, f.baseSplayZ * spreadMultiplier, speed, dt);
        f.mcp.rotation.x = damp(f.mcp.rotation.x, c * 0.55, speed, dt);
        f.pip.rotation.x = damp(f.pip.rotation.x, c * 0.72, speed, dt);
        f.dip.rotation.x = damp(f.dip.rotation.x, c * 0.45, speed, dt);
      }
    }
  };

  const update: HumanGuideController['update'] = ({
    dt,
    elapsed,
    isWalking,
    walkSpeed,
    isSpeaking,
    gesture,
    lookTargetWorld,
  }) => {
    const safeDt = Math.min(dt, 0.05);

    if (waveTimer > 0) waveTimer = Math.max(0, waveTimer - safeDt);
    if (presentTimer > 0) presentTimer = Math.max(0, presentTimer - safeDt);

    // Subtle floor aura pulse
    auraMat.opacity = 0.24 + Math.sin(elapsed * 2.5) * 0.08;
    const auraScale = 1 + Math.sin(elapsed * 2.5) * 0.03;
    floorAura.scale.set(auraScale, 1, auraScale);

    // Determine active gesture state
    let activeGesture: GuideGesture = gesture;
    if (activeGesture === 'auto') {
      if (waveTimer > 0) activeGesture = 'wave';
      else if (presentTimer > 0 || isSpeaking) activeGesture = 'present';
    }

    // Smooth walk blend & phase accumulation
    const targetWalk = isWalking && gesture !== 'show_hands' && gesture !== 'show_feet' ? 1 : 0;
    walkBlend = damp(walkBlend, targetWalk, 9, safeDt);
    if (walkBlend > 0.01) {
      walkCycle += safeDt * Math.max(4.8, walkSpeed * 4.35);
    }

    const s = Math.sin(walkCycle);
    const c = Math.cos(walkCycle);
    const breath = Math.sin(elapsed * 1.9);
    const idleSway = Math.sin(elapsed * 0.85);

    // --- PELVIS & SPINE ---
    const walkBob = Math.abs(c) * 0.022 * walkBlend;
    pelvisGroup.position.y = 0.89 - walkBob + breath * 0.0025 * (1 - walkBlend);
    pelvisGroup.position.x = idleSway * 0.008 * (1 - walkBlend) + s * 0.012 * walkBlend;
    pelvisGroup.rotation.y = s * 0.085 * walkBlend + idleSway * 0.02 * (1 - walkBlend);
    pelvisGroup.rotation.z = -s * 0.03 * walkBlend - idleSway * 0.015 * (1 - walkBlend);

    // Counter-rotate spine against pelvis during walk + natural breathing expansion
    spineGroup.rotation.y = -s * 0.1 * walkBlend - idleSway * 0.015 * (1 - walkBlend);
    spineGroup.rotation.x = 0.035 * walkBlend + breath * 0.012;
    spineGroup.rotation.z = idleSway * 0.012 * (1 - walkBlend);

    // --- LEGS, FEET & ALL 10 TOES ---
    const animateLeg = (leg: LegRig, phaseOffset: number) => {
      const ph = walkCycle + phaseOffset;
      const swing = Math.sin(ph);
      const lift = Math.max(0, Math.cos(ph)); // foot lifting forward
      const pushOff = Math.max(0, -Math.sin(ph)); // trailing leg pushing off toes

      const targetHipX = -swing * 0.44 * walkBlend;
      const targetKneeX = (lift * 0.68 + Math.max(0, -swing) * 0.12) * walkBlend;
      const targetAnkleX = (-lift * 0.22 + pushOff * 0.24) * walkBlend;
      const targetToeFlex = -pushOff * 0.34 * walkBlend;

      leg.hip.rotation.x = damp(leg.hip.rotation.x, targetHipX, 14, safeDt);
      leg.hip.position.y = 0.89 - walkBob;
      leg.hip.position.x = leg.sideSign * 0.092 + pelvisGroup.position.x * 0.4;
      leg.knee.rotation.x = damp(leg.knee.rotation.x, targetKneeX, 14, safeDt);
      leg.ankle.rotation.x = damp(leg.ankle.rotation.x, targetAnkleX, 14, safeDt);
      leg.toeBase.rotation.x = damp(leg.toeBase.rotation.x, targetToeFlex, 14, safeDt);

      // Individual 5-toe articulation (fan & subtle sequential flex during Feet Inspection!)
      for (let t = 0; t < 5; t++) {
        const toe = leg.toes[t];
        if (activeGesture === 'show_feet') {
          const wave = Math.sin(elapsed * 2.6 - t * 0.45 - leg.sideSign * 0.4);
          const fanDir = t === 0 ? -leg.sideSign * 0.06 : leg.sideSign * (t * 0.022);
          toe.mtp.rotation.x = damp(toe.mtp.rotation.x, -0.14 + wave * 0.14, 10, safeDt);
          toe.ip.rotation.x = damp(toe.ip.rotation.x, 0.06 - wave * 0.08, 10, safeDt);
          toe.mtp.rotation.y = damp(toe.mtp.rotation.y, toe.baseYaw + fanDir, 10, safeDt);
        } else {
          const micro = Math.sin(elapsed * 1.2 + t * 0.7) * 0.015 * (1 - walkBlend);
          toe.mtp.rotation.x = damp(toe.mtp.rotation.x, micro, 10, safeDt);
          toe.ip.rotation.x = damp(toe.ip.rotation.x, 0.07, 10, safeDt);
          toe.mtp.rotation.y = damp(toe.mtp.rotation.y, toe.baseYaw, 10, safeDt);
        }
      }
    };

    animateLeg(leftLeg, 0);
    animateLeg(rightLeg, Math.PI);

    // --- LEFT & RIGHT ARMS, WRISTS & ALL 10 FINGERS ---
    // Note: shoulder X rotation: negative lifts arm FORWARD (+Z)!
    // Elbow X rotation: negative bends forearm FORWARD/UP (+Z/+Y)!
    // Shoulder Z rotation: sideSign * positive abducts arm OUTWARD away from torso!
    if (activeGesture === 'show_hands') {
      // Showcase pose: Elena raises BOTH open hands upright in front of her chest with all 5 fingers
      // per hand fanned clearly and flexing softly so every single digit, knuckle & nail is crisp!
      const gentle = Math.sin(elapsed * 1.6);
      for (const arm of [leftArm, rightArm]) {
        const sg = arm.sideSign;
        arm.shoulder.rotation.x = damp(arm.shoulder.rotation.x, -0.82 + gentle * 0.02, 8, safeDt);
        arm.shoulder.rotation.z = damp(arm.shoulder.rotation.z, sg * 0.18, 8, safeDt);
        arm.shoulder.rotation.y = damp(arm.shoulder.rotation.y, -sg * 0.06, 8, safeDt);

        arm.elbow.rotation.x = damp(arm.elbow.rotation.x, -1.92 + gentle * 0.03, 8, safeDt);
        arm.wrist.rotation.x = damp(arm.wrist.rotation.x, -0.22, 8, safeDt);
        // Gentle wrist turn so user sees palms, thumb opposition, knuckles & dorsal nails
        arm.wrist.rotation.y = damp(
          arm.wrist.rotation.y,
          Math.sin(elapsed * 0.95) * 0.28 * sg,
          6,
          safeDt
        );
        arm.wrist.rotation.z = damp(arm.wrist.rotation.z, 0, 8, safeDt);

        // Subtle open-finger ripple while keeping all 5 fingers distinctly fanned open
        const ripple: [number, number, number, number, number] = [
          0.04 + Math.max(0, Math.sin(elapsed * 2.0)) * 0.09,
          0.03 + Math.max(0, Math.sin(elapsed * 2.0 - 0.5)) * 0.1,
          0.02 + Math.max(0, Math.sin(elapsed * 2.0 - 1.0)) * 0.1,
          0.03 + Math.max(0, Math.sin(elapsed * 2.0 - 1.5)) * 0.1,
          0.04 + Math.max(0, Math.sin(elapsed * 2.0 - 2.0)) * 0.1,
        ];
        applyFingerPose(arm, ripple, 1.55, safeDt, 10);
      }
    } else if (activeGesture === 'wave' && walkBlend < 0.45) {
      // Friendly welcoming wave with Right arm (fingers wide open!), relaxed poised Left arm
      const waveOsc = Math.sin(elapsed * 6.2);
      rightArm.shoulder.rotation.x = damp(rightArm.shoulder.rotation.x, -0.95, 9, safeDt);
      rightArm.shoulder.rotation.z = damp(rightArm.shoulder.rotation.z, -0.58, 9, safeDt);
      rightArm.shoulder.rotation.y = damp(rightArm.shoulder.rotation.y, 0.15, 9, safeDt);
      rightArm.elbow.rotation.x = damp(rightArm.elbow.rotation.x, -1.65, 9, safeDt);
      rightArm.wrist.rotation.z = damp(rightArm.wrist.rotation.z, waveOsc * 0.34, 14, safeDt);
      rightArm.wrist.rotation.y = damp(rightArm.wrist.rotation.y, 0, 9, safeDt);
      rightArm.wrist.rotation.x = damp(rightArm.wrist.rotation.x, -0.08, 9, safeDt);
      applyFingerPose(rightArm, [0.05, 0.04, 0.04, 0.05, 0.07], 1.42, safeDt, 12);

      // Left arm poised naturally with visible fingers
      leftArm.shoulder.rotation.x = damp(leftArm.shoulder.rotation.x, -0.08, 7, safeDt);
      leftArm.shoulder.rotation.z = damp(leftArm.shoulder.rotation.z, 0.16, 7, safeDt);
      leftArm.shoulder.rotation.y = damp(leftArm.shoulder.rotation.y, -0.35, 7, safeDt);
      leftArm.elbow.rotation.x = damp(leftArm.elbow.rotation.x, -0.28, 7, safeDt);
      leftArm.wrist.rotation.set(0, 0, 0);
      applyFingerPose(leftArm, [0.18, 0.22, 0.28, 0.33, 0.38], 1.12, safeDt, 8);
    } else if (activeGesture === 'present' && walkBlend < 0.45) {
      // Graceful architectural tour-guide hosting gesture: expressive open-palm motion!
      const g1 = Math.sin(elapsed * 2.1);
      const g2 = Math.cos(elapsed * 1.65);

      // Right hand leads open welcoming architectural sweep
      rightArm.shoulder.rotation.x = damp(
        rightArm.shoulder.rotation.x,
        -0.52 + g1 * 0.12,
        6,
        safeDt
      );
      rightArm.shoulder.rotation.z = damp(
        rightArm.shoulder.rotation.z,
        -0.36 - Math.max(0, g1) * 0.18,
        6,
        safeDt
      );
      rightArm.shoulder.rotation.y = damp(rightArm.shoulder.rotation.y, -0.25, 6, safeDt);
      rightArm.elbow.rotation.x = damp(
        rightArm.elbow.rotation.x,
        -1.08 + g2 * 0.16,
        6,
        safeDt
      );
      rightArm.wrist.rotation.y = damp(rightArm.wrist.rotation.y, -0.55, 6, safeDt); // open palm upward
      rightArm.wrist.rotation.z = damp(rightArm.wrist.rotation.z, g1 * 0.1, 6, safeDt);
      rightArm.wrist.rotation.x = damp(rightArm.wrist.rotation.x, -0.08, 6, safeDt);
      applyFingerPose(
        rightArm,
        [0.08, 0.08 + g1 * 0.04, 0.13 + g1 * 0.04, 0.18, 0.22],
        1.32,
        safeDt,
        8
      );

      // Left hand complements gently at waist height
      leftArm.shoulder.rotation.x = damp(
        leftArm.shoulder.rotation.x,
        -0.32 - g2 * 0.08,
        6,
        safeDt
      );
      leftArm.shoulder.rotation.z = damp(leftArm.shoulder.rotation.z, 0.24, 6, safeDt);
      leftArm.shoulder.rotation.y = damp(leftArm.shoulder.rotation.y, 0.18, 6, safeDt);
      leftArm.elbow.rotation.x = damp(
        leftArm.elbow.rotation.x,
        -0.88 - g1 * 0.1,
        6,
        safeDt
      );
      leftArm.wrist.rotation.y = damp(leftArm.wrist.rotation.y, 0.45, 6, safeDt);
      leftArm.wrist.rotation.z = damp(leftArm.wrist.rotation.z, 0, 6, safeDt);
      leftArm.wrist.rotation.x = damp(leftArm.wrist.rotation.x, -0.05, 6, safeDt);
      applyFingerPose(leftArm, [0.12, 0.14, 0.19, 0.24, 0.28], 1.24, safeDt, 8);
    } else {
      // Natural idle breathing + counter-swinging biomechanical walk
      const leftSwing = -s * 0.36 * walkBlend;
      const rightSwing = s * 0.36 * walkBlend;

      leftArm.shoulder.rotation.x = damp(
        leftArm.shoulder.rotation.x,
        leftSwing - 0.04 * (1 - walkBlend),
        10,
        safeDt
      );
      leftArm.shoulder.rotation.z = damp(
        leftArm.shoulder.rotation.z,
        0.15 + breath * 0.015,
        8,
        safeDt
      );
      leftArm.shoulder.rotation.y = damp(leftArm.shoulder.rotation.y, -0.45, 8, safeDt);
      leftArm.elbow.rotation.x = damp(
        leftArm.elbow.rotation.x,
        -0.22 - Math.max(0, -leftSwing) * 0.48,
        10,
        safeDt
      );
      leftArm.wrist.rotation.x = damp(leftArm.wrist.rotation.x, 0, 8, safeDt);
      leftArm.wrist.rotation.y = damp(leftArm.wrist.rotation.y, 0, 8, safeDt);
      leftArm.wrist.rotation.z = damp(leftArm.wrist.rotation.z, 0, 8, safeDt);
      applyFingerPose(leftArm, [0.16, 0.18, 0.24, 0.3, 0.35], 1.15, safeDt, 8);

      rightArm.shoulder.rotation.x = damp(
        rightArm.shoulder.rotation.x,
        rightSwing - 0.04 * (1 - walkBlend),
        10,
        safeDt
      );
      rightArm.shoulder.rotation.z = damp(
        rightArm.shoulder.rotation.z,
        -0.15 - breath * 0.015,
        8,
        safeDt
      );
      rightArm.shoulder.rotation.y = damp(rightArm.shoulder.rotation.y, 0.45, 8, safeDt);
      rightArm.elbow.rotation.x = damp(
        rightArm.elbow.rotation.x,
        -0.22 - Math.max(0, -rightSwing) * 0.48,
        10,
        safeDt
      );
      rightArm.wrist.rotation.x = damp(rightArm.wrist.rotation.x, 0, 8, safeDt);
      rightArm.wrist.rotation.y = damp(rightArm.wrist.rotation.y, 0, 8, safeDt);
      rightArm.wrist.rotation.z = damp(rightArm.wrist.rotation.z, 0, 8, safeDt);
      applyFingerPose(rightArm, [0.16, 0.18, 0.24, 0.3, 0.35], 1.15, safeDt, 8);
    }

    // --- NECK & HEAD NATURAL LOOK-AT TRACKING ---
    let targetYaw = Math.sin(elapsed * 0.65) * 0.08 * (1 - walkBlend);
    let targetPitch = Math.sin(elapsed * 0.9) * 0.03;

    if (lookTargetWorld && walkBlend < 0.6) {
      tempLocalLook.copy(lookTargetWorld).sub(root.position);
      invRootQuat.copy(root.quaternion).invert();
      tempLocalLook.applyQuaternion(invRootQuat);
      tempLocalLook.y -= 1.56; // relative to eye height

      if (tempLocalLook.z > 0.15) {
        const rawYaw = Math.atan2(tempLocalLook.x, tempLocalLook.z);
        const horiz = Math.hypot(tempLocalLook.x, tempLocalLook.z);
        const rawPitch = -Math.atan2(tempLocalLook.y, Math.max(0.3, horiz));
        targetYaw = THREE.MathUtils.clamp(rawYaw, -0.68, 0.68);
        targetPitch = THREE.MathUtils.clamp(rawPitch, -0.32, 0.34);
      }
    }

    // Split rotation organically: 38% cervical neck, 62% head + gentle conversational nod
    const talkNod = isSpeaking ? Math.sin(elapsed * 3.8) * 0.035 : 0;
    const talkTilt = isSpeaking ? Math.sin(elapsed * 1.9) * 0.045 : 0;

    neckGroup.rotation.y = dampAngle(neckGroup.rotation.y, targetYaw * 0.38, 6, safeDt);
    neckGroup.rotation.x = dampAngle(neckGroup.rotation.x, targetPitch * 0.35, 6, safeDt);
    headGroup.rotation.y = dampAngle(headGroup.rotation.y, targetYaw * 0.62, 7, safeDt);
    headGroup.rotation.x = dampAngle(
      headGroup.rotation.x,
      targetPitch * 0.65 + talkNod,
      7,
      safeDt
    );
    headGroup.rotation.z = dampAngle(headGroup.rotation.z, talkTilt, 6, safeDt);

    // --- NATURAL EYE BLINKING ---
    if (elapsed >= nextBlinkAt && blinkProgress < 0) {
      blinkProgress = 0;
    }
    let blinkAmt = 0;
    if (blinkProgress >= 0) {
      blinkProgress += safeDt / 0.16;
      if (blinkProgress >= 1) {
        blinkProgress = -1;
        nextBlinkAt = elapsed + 2.6 + ((Math.sin(elapsed * 13.7) + 1) * 1.4);
      } else {
        blinkAmt = Math.sin(blinkProgress * Math.PI);
      }
    }
    for (const lid of upperEyelids) {
      lid.rotation.x = blinkAmt * 0.85;
    }

    // --- SUBTLE SPEAKING LIP ANIMATION ---
    const mouthOpen =
      isSpeaking || activeGesture === 'present'
        ? (Math.sin(elapsed * 11.5) * 0.5 + 0.5) *
          (Math.sin(elapsed * 4.3) * 0.4 + 0.6) *
          0.16
        : 0;
    lowerLipPivot.rotation.x = damp(lowerLipPivot.rotation.x, mouthOpen, 18, safeDt);
  };

  const getInspectAnchorWorld: HumanGuideController['getInspectAnchorWorld'] = (target) => {
    const localFocus = new THREE.Vector3();
    const localCam = new THREE.Vector3();

    switch (target) {
      case 'head':
        localFocus.set(0, 1.50, 0.02);
        localCam.set(0.11, 1.56, 0.64);
        break;
      case 'hands':
        localFocus.set(0, 1.41, 0.32);
        localCam.set(0.0, 1.43, 0.98);
        break;
      case 'feet':
        localFocus.set(0, -0.015, 0.105);
        localCam.set(0.0, 0.34, 0.55);
        break;
      case 'full':
      default:
        localFocus.set(0, 0.78, 0.04);
        localCam.set(0.28, 1.08, 2.48);
        break;
    }

    const focus = localFocus.applyQuaternion(root.quaternion).add(root.position);
    const camWorld = localCam.applyQuaternion(root.quaternion).add(root.position);
    return {
      focus,
      idealCamOffset: camWorld.sub(focus),
    };
  };

  return {
    root,
    update,
    getInspectAnchorWorld,
    triggerWave: (duration = 2.8) => {
      waveTimer = duration;
    },
    triggerPresent: (duration = 5.0) => {
      presentTimer = duration;
    },
    dispose: () => {
      disposableMaterials.forEach((m) => m.dispose());
      disposableGeometries.forEach((g) => g.dispose());
    },
  };
}
