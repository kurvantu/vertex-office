import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  FloorplanData,
  GuideGesture,
  GuideInspectTarget,
  LightingPreset,
  LiveSyncState,
  Point2D,
  TourStop,
  ViewMode,
  WalkRequest,
  WallDisplayMode,
} from '../types/floorplan';
import { createFloorMaterialCache } from '../scene/textures';
import { buildArchitecture, BuiltArchitecture } from '../scene/buildArchitecture';
import { createHumanGuide, HumanGuideController } from '../scene/createHumanGuide';
import { NavGrid } from '../utils/pathfinding';
import {
  Compass,
  Eye,
  Footprints,
  Layers,
  RotateCcw,
  Sun,
  Sunset,
  Sparkles,
} from 'lucide-react';

interface Scene3DViewportProps {
  floorplan: FloorplanData;
  viewMode: ViewMode;
  wallMode: WallDisplayMode;
  onWallModeChange: (mode: WallDisplayMode) => void;
  lighting: LightingPreset;
  onLightingChange: (preset: LightingPreset) => void;
  inspectTarget: GuideInspectTarget;
  onInspectTargetChange: (target: GuideInspectTarget) => void;
  guideGesture: GuideGesture;
  walkRequest: WalkRequest | null;
  activeTourStop: TourStop | null;
  isTourPlaying: boolean;
  isSpeaking: boolean;
  onSelectTourStop: (index: number) => void;
  onGuideArrived: (walkReqId: number, tourStopId?: string) => void;
  onFloorWalkClick: (pt: Point2D) => void;
  liveSyncRef: React.MutableRefObject<LiveSyncState>;
}

function angleLerp(current: number, target: number, t: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * t;
}

export const Scene3DViewport: React.FC<Scene3DViewportProps> = ({
  floorplan,
  viewMode,
  wallMode,
  onWallModeChange,
  lighting,
  onLightingChange,
  inspectTarget,
  onInspectTargetChange,
  guideGesture,
  walkRequest,
  activeTourStop,
  isTourPlaying,
  isSpeaking,
  onSelectTourStop,
  onGuideArrived,
  onFloorWalkClick,
  liveSyncRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [freeRoamInTour, setFreeRoamInTour] = useState(false);
  const [guideStatusLabel, setGuideStatusLabel] = useState<string>('Ready to guide');

  // Keep latest callbacks & props in refs so the 60fps Three.js loop stays fresh without rebuilding
  const propsRef = useRef({
    viewMode,
    wallMode,
    lighting,
    inspectTarget,
    guideGesture,
    activeTourStop,
    isTourPlaying,
    isSpeaking,
    freeRoamInTour,
    onInspectTargetChange,
    onSelectTourStop,
    onGuideArrived,
    onFloorWalkClick,
  });
  propsRef.current = {
    viewMode,
    wallMode,
    lighting,
    inspectTarget,
    guideGesture,
    activeTourStop,
    isTourPlaying,
    isSpeaking,
    freeRoamInTour,
    onInspectTargetChange,
    onSelectTourStop,
    onGuideArrived,
    onFloorWalkClick,
  };

  // Engine internals ref
  const engineRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    guide: HumanGuideController;
    guideLight: THREE.PointLight;
    sunLight: THREE.DirectionalLight;
    hemiLight: THREE.HemisphereLight;
    fillLight: THREE.DirectionalLight;
    arch: BuiltArchitecture | null;
    navGrid: NavGrid | null;
    floorCache: ReturnType<typeof createFloorMaterialCache>;
    pathLine: THREE.Line;
    destRing: THREE.Mesh;
    hoverRing: THREE.Mesh;
    // Guide navigation state
    pathQueue: Point2D[];
    activeWalkId: number;
    activeWalkTourStopId?: string;
    faceAfterArrival: Point2D | null;
    desiredYaw: number;
    isWalking: boolean;
    // Camera transition state
    camTransition: {
      active: boolean;
      pos: THREE.Vector3;
      target: THREE.Vector3;
    };
    // First-person / Virtual tour free look state
    fpYaw: number;
    fpPitch: number;
    keys: Set<string>;
    resetOrbitView: () => void;
    updatePathVisual: () => void;
  } | null>(null);

  // Initialize Three.js scene once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xedeae2);
    scene.fog = new THREE.Fog(0xedeae2, 24, 52);

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const camera = new THREE.PerspectiveCamera(46, width / height, 0.06, 90);
    camera.position.set(1.2, 10.2, 11.4);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.minDistance = 0.24;
    controls.maxDistance = 28;
    controls.maxPolarAngle = Math.PI * 0.492;
    controls.target.set(-0.4, 0.8, 0.2);
    controls.update();

    // Architectural daylight illumination rig
    const hemiLight = new THREE.HemisphereLight(0xfffdf8, 0xd8cfc0, 1.05);
    hemiLight.position.set(0, 18, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff5e4, 1.65);
    sunLight.position.set(9.5, 15.5, 8.5);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 38;
    const d = 11.5;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.018;
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0xe4eef8, 0.55);
    fillLight.position.set(-10, 9, -8);
    scene.add(fillLight);

    // Gentle warm interior fill & portrait key following our 3D human guide
    const guideLight = new THREE.PointLight(0xfff7eb, 0.55, 5.5, 1.4);
    scene.add(guideLight);

    const floorCache = createFloorMaterialCache();
    const guide = createHumanGuide();
    guide.root.position.set(floorplan.guideStart.x, 0.004, floorplan.guideStart.z);
    guide.root.rotation.y = floorplan.guideStartYaw;
    guide.triggerWave(3.2);
    scene.add(guide.root);

    // 3D walking path line + destination ring + floor hover cursor
    const pathGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const pathMat = new THREE.LineBasicMaterial({
      color: 0xc85a32,
      transparent: true,
      opacity: 0.78,
    });
    const pathLine = new THREE.Line(pathGeo, pathMat);
    pathLine.visible = false;
    scene.add(pathLine);

    const destGeo = new THREE.RingGeometry(0.16, 0.23, 32);
    destGeo.rotateX(-Math.PI / 2);
    const destMat = new THREE.MeshBasicMaterial({
      color: 0xc85a32,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const destRing = new THREE.Mesh(destGeo, destMat);
    destRing.position.y = 0.018;
    destRing.visible = false;
    scene.add(destRing);

    const hoverGeo = new THREE.RingGeometry(0.15, 0.19, 32);
    hoverGeo.rotateX(-Math.PI / 2);
    const hoverMat = new THREE.MeshBasicMaterial({
      color: 0x1c1b19,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const hoverRing = new THREE.Mesh(hoverGeo, hoverMat);
    hoverRing.position.y = 0.016;
    hoverRing.visible = false;
    scene.add(hoverRing);

    const keys = new Set<string>();

    const updatePathVisual = () => {
      const eng = engineRef.current;
      if (!eng) return;
      if (eng.pathQueue.length === 0) {
        eng.pathLine.visible = false;
        eng.destRing.visible = false;
        return;
      }
      const pts: THREE.Vector3[] = [
        new THREE.Vector3(eng.guide.root.position.x, 0.03, eng.guide.root.position.z),
        ...eng.pathQueue.map((p) => new THREE.Vector3(p.x, 0.03, p.z)),
      ];
      eng.pathLine.geometry.dispose();
      eng.pathLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      eng.pathLine.visible = true;

      const last = eng.pathQueue[eng.pathQueue.length - 1];
      eng.destRing.position.set(last.x, 0.02, last.z);
      eng.destRing.visible = true;
    };

    const resetOrbitView = () => {
      const eng = engineRef.current;
      if (!eng) return;
      eng.camTransition = {
        active: true,
        pos: new THREE.Vector3(1.2, 10.2, 11.4),
        target: new THREE.Vector3(-0.3, 0.6, 0.2),
      };
    };

    engineRef.current = {
      scene,
      camera,
      renderer,
      controls,
      guide,
      guideLight,
      sunLight,
      hemiLight,
      fillLight,
      arch: null,
      navGrid: null,
      floorCache,
      pathLine,
      destRing,
      hoverRing,
      pathQueue: [],
      activeWalkId: 0,
      activeWalkTourStopId: undefined,
      faceAfterArrival: null,
      desiredYaw: floorplan.guideStartYaw,
      isWalking: false,
      camTransition: {
        active: false,
        pos: new THREE.Vector3(),
        target: new THREE.Vector3(),
      },
      fpYaw: Math.PI,
      fpPitch: -0.06,
      keys,
      resetOrbitView,
      updatePathVisual,
    };

    // Cancel automatic camera glide if user starts manually orbiting/dragging
    const handleControlStart = () => {
      if (engineRef.current) {
        engineRef.current.camTransition.active = false;
      }
    };
    controls.addEventListener('start', handleControlStart);

    // Pointer interaction: hover cursor ring, click-to-walk, click tour marker, click Elena, & tour look-drag
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    let isTourDragging = false;
    let lastDragX = 0;
    let lastDragY = 0;

    const getNdc = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      if (
        e.button === 0 &&
        propsRef.current.viewMode === 'tour' &&
        propsRef.current.inspectTarget === 'none'
      ) {
        isTourDragging = true;
        lastDragX = e.clientX;
        lastDragY = e.clientY;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const eng = engineRef.current;
      if (!eng) return;

      // Free 360 look drag when in Virtual Tour mode
      if (
        isTourDragging &&
        propsRef.current.viewMode === 'tour' &&
        propsRef.current.inspectTarget === 'none'
      ) {
        const dx = e.clientX - lastDragX;
        const dy = e.clientY - lastDragY;
        if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) {
          if (!propsRef.current.freeRoamInTour) {
            // Sync yaw/pitch from current camera forward before taking over
            const fwd = new THREE.Vector3();
            eng.camera.getWorldDirection(fwd);
            eng.fpYaw = Math.atan2(-fwd.x, -fwd.z);
            eng.fpPitch = Math.asin(THREE.MathUtils.clamp(fwd.y, -0.85, 0.85));
            setFreeRoamInTour(true);
          }
          eng.fpYaw += dx * 0.0034;
          eng.fpPitch = THREE.MathUtils.clamp(eng.fpPitch + dy * 0.0026, -1.05, 0.95);
        }
        lastDragX = e.clientX;
        lastDragY = e.clientY;
        hoverRing.visible = false;
        return;
      }

      if (propsRef.current.inspectTarget !== 'none' || !eng.arch) {
        hoverRing.visible = false;
        renderer.domElement.style.cursor = 'grab';
        return;
      }

      getNdc(e);
      raycaster.setFromCamera(pointer, eng.camera);

      // Check hover on guide
      const guideHit = raycaster.intersectObject(eng.guide.root, true);
      if (guideHit.length > 0 && guideHit[0].object !== eng.guide.root.children[0]) {
        hoverRing.visible = false;
        renderer.domElement.style.cursor = 'pointer';
        return;
      }

      // Check hover on tour hotspot markers
      const markerHit = raycaster.intersectObjects(eng.arch.tourMarkerMeshes, false);
      if (markerHit.length > 0) {
        hoverRing.visible = false;
        renderer.domElement.style.cursor = 'pointer';
        return;
      }

      // Check walkable floor hover
      const floorHit = raycaster.intersectObjects(eng.arch.walkableMeshes, false);
      if (floorHit.length > 0) {
        const pt = floorHit[0].point;
        hoverRing.position.set(pt.x, 0.018, pt.z);
        hoverRing.visible = true;
        renderer.domElement.style.cursor = 'pointer';
      } else {
        hoverRing.visible = false;
        renderer.domElement.style.cursor = 'grab';
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      isTourDragging = false;
      if (e.button !== 0) return;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved > 5) return; // Was an orbit or look drag, not a click

      const eng = engineRef.current;
      if (!eng || !eng.arch) return;
      if (propsRef.current.inspectTarget !== 'none') return;

      getNdc(e);
      raycaster.setFromCamera(pointer, eng.camera);

      // 1. Click on Elena -> friendly wave + open anatomy inspector!
      const guideHit = raycaster.intersectObject(eng.guide.root, true);
      if (guideHit.length > 0 && guideHit[0].object !== eng.guide.root.children[0]) {
        eng.guide.triggerWave(3.2);
        propsRef.current.onInspectTargetChange('full');
        return;
      }

      // 2. Click on a Tour Stop medallion -> jump tour to that stop
      const markerHit = raycaster.intersectObjects(eng.arch.tourMarkerMeshes, false);
      if (markerHit.length > 0) {
        const idx = markerHit[0].object.userData?.tourStopIndex;
        if (typeof idx === 'number') {
          setFreeRoamInTour(false);
          propsRef.current.onSelectTourStop(idx);
          return;
        }
      }

      // 3. Click on walkable floor -> walk Elena cleanly to that spot!
      const floorHit = raycaster.intersectObjects(eng.arch.walkableMeshes, false);
      if (floorHit.length > 0) {
        const pt = floorHit[0].point;
        propsRef.current.onFloorWalkClick({ x: pt.x, z: pt.z });
      }
    };

    const onPointerLeave = () => {
      isTourDragging = false;
      hoverRing.visible = false;
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);

    // Keyboard WASD / Arrow navigation
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        keys.add(k);
        if (propsRef.current.viewMode === 'tour' && propsRef.current.inspectTarget === 'none') {
          const eng = engineRef.current;
          if (eng && !propsRef.current.freeRoamInTour) {
            const fwd = new THREE.Vector3();
            eng.camera.getWorldDirection(fwd);
            eng.fpYaw = Math.atan2(-fwd.x, -fwd.z);
            eng.fpPitch = Math.asin(THREE.MathUtils.clamp(fwd.y, -0.85, 0.85));
            setFreeRoamInTour(true);
          }
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.key.toLowerCase());
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Responsive ResizeObserver
    const ro = new ResizeObserver(() => {
      if (!container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);

    // Main 60fps animation & simulation loop
    const clock = new THREE.Clock();
    let rafId = 0;
    const tempLookTarget = new THREE.Vector3();
    const tempCamForward = new THREE.Vector3();
    const desiredTourCamPos = new THREE.Vector3();
    const desiredTourLookAt = new THREE.Vector3();
    const currentTourLookAt = new THREE.Vector3(
      floorplan.guideStart.x,
      1.35,
      floorplan.guideStart.z
    );
    let lastStatusWalking: boolean | null = null;

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.elapsedTime;
      const eng = engineRef.current;
      if (!eng) return;

      const p = propsRef.current;

      // 1. Advance Elena along A* path waypoints
      const walkSpeed = 1.52; // natural comfortable architectural tour walking pace (m/s)
      const isHoldPose = p.inspectTarget === 'hands' || p.inspectTarget === 'feet' || p.inspectTarget === 'head';

      if (eng.pathQueue.length > 0 && !isHoldPose) {
        const nextWp = eng.pathQueue[0];
        const dx = nextWp.x - eng.guide.root.position.x;
        const dz = nextWp.z - eng.guide.root.position.z;
        const dist = Math.hypot(dx, dz);

        if (dist < 0.06) {
          eng.guide.root.position.x = nextWp.x;
          eng.guide.root.position.z = nextWp.z;
          eng.pathQueue.shift();

          if (eng.pathQueue.length === 0) {
            eng.isWalking = false;
            eng.updatePathVisual();
            // Turn toward the visitor camera or highlighted architectural feature upon arrival
            if (eng.faceAfterArrival) {
              eng.desiredYaw = Math.atan2(
                eng.faceAfterArrival.x - eng.guide.root.position.x,
                eng.faceAfterArrival.z - eng.guide.root.position.z
              );
            } else {
              eng.desiredYaw = Math.atan2(
                eng.camera.position.x - eng.guide.root.position.x,
                eng.camera.position.z - eng.guide.root.position.z
              );
            }
            eng.guide.triggerPresent(5.5);
            p.onGuideArrived(eng.activeWalkId, eng.activeWalkTourStopId);
          } else {
            eng.updatePathVisual();
          }
        } else {
          eng.isWalking = true;
          const step = Math.min(dist, walkSpeed * dt);
          eng.guide.root.position.x += (dx / dist) * step;
          eng.guide.root.position.z += (dz / dist) * step;
          eng.desiredYaw = Math.atan2(dx, dz);
          // Smoothly update leading path segment start
          const posAttr = eng.pathLine.geometry.getAttribute('position') as THREE.BufferAttribute;
          if (posAttr && posAttr.count >= 2) {
            posAttr.setXYZ(0, eng.guide.root.position.x, 0.03, eng.guide.root.position.z);
            posAttr.needsUpdate = true;
          }
        }
      } else {
        eng.isWalking = false;
      }

      if (lastStatusWalking !== eng.isWalking) {
        lastStatusWalking = eng.isWalking;
        setGuideStatusLabel(eng.isWalking ? 'Walking to waypoint…' : 'Presenting space');
      }

      // Smoothly turn Elena's body toward desiredYaw
      eng.guide.root.rotation.y = angleLerp(
        eng.guide.root.rotation.y,
        eng.desiredYaw,
        1 - Math.exp(-7.5 * dt)
      );

      // Update soft guide portrait light (brightens slightly during close-up inspection)
      const inspectBoost = p.inspectTarget !== 'none';
      eng.guideLight.intensity = inspectBoost ? 1.05 : 0.45;
      if (p.inspectTarget === 'feet') {
        eng.guideLight.position.set(
          eng.camera.position.x * 0.5 + eng.guide.root.position.x * 0.5,
          0.85,
          eng.camera.position.z * 0.5 + eng.guide.root.position.z * 0.5
        );
      } else {
        eng.guideLight.position.set(
          eng.guide.root.position.x + Math.sin(eng.guide.root.rotation.y) * 0.9,
          1.95,
          eng.guide.root.position.z + Math.cos(eng.guide.root.rotation.y) * 0.9
        );
      }

      // Determine active animation gesture (auto-pose hands/feet cleanly during close-up inspect!)
      let effectiveGesture: GuideGesture = p.guideGesture;
      if (effectiveGesture === 'auto') {
        if (p.inspectTarget === 'hands') effectiveGesture = 'show_hands';
        else if (p.inspectTarget === 'feet') effectiveGesture = 'show_feet';
      }

      tempLookTarget.copy(eng.camera.position);
      eng.guide.update({
        dt,
        elapsed,
        isWalking: eng.isWalking,
        walkSpeed,
        isSpeaking: p.isSpeaking,
        gesture: effectiveGesture,
        lookTargetWorld: tempLookTarget,
      });

      // 2. Camera Control Logic (Inspect vs Virtual Tour vs Orbit Preview)
      const inTourMode = p.viewMode === 'tour' && p.inspectTarget === 'none';
      eng.controls.enabled = !inTourMode;

      // Dynamic destination ring pulse
      if (eng.destRing.visible) {
        const sc = 1 + Math.sin(elapsed * 4.5) * 0.14;
        eng.destRing.scale.set(sc, 1, sc);
      }

      if (inTourMode) {
        if (p.freeRoamInTour) {
          // Interactive First-Person Virtual Tour walkthrough (WASD/Arrows + 360 look)
          if (eng.keys.has('q')) eng.fpYaw += 1.6 * dt;
          if (eng.keys.has('e')) eng.fpYaw -= 1.6 * dt;

          let moveFwd = 0;
          let moveRight = 0;
          if (eng.keys.has('w') || eng.keys.has('arrowup')) moveFwd += 1;
          if (eng.keys.has('s') || eng.keys.has('arrowdown')) moveFwd -= 1;
          if (eng.keys.has('d') || eng.keys.has('arrowright')) moveRight += 1;
          if (eng.keys.has('a') || eng.keys.has('arrowleft')) moveRight -= 1;

          const fwdX = -Math.sin(eng.fpYaw);
          const fwdZ = -Math.cos(eng.fpYaw);
          const rightX = Math.cos(eng.fpYaw);
          const rightZ = -Math.sin(eng.fpYaw);

          if (moveFwd !== 0 || moveRight !== 0) {
            const len = Math.hypot(moveFwd, moveRight);
            const speed = 2.45 * dt;
            const rawX = eng.camera.position.x + ((fwdX * moveFwd + rightX * moveRight) / len) * speed;
            const rawZ = eng.camera.position.z + ((fwdZ * moveFwd + rightZ * moveRight) / len) * speed;
            const safe = eng.navGrid
              ? eng.navGrid.resolveCameraWalk({ x: rawX, z: rawZ }, 0.28)
              : { x: rawX, z: rawZ };
            eng.camera.position.x = safe.x;
            eng.camera.position.z = safe.z;
          }

          // Smooth human eye-level height with subtle footstep head-bob
          const isPlayerMoving = moveFwd !== 0 || moveRight !== 0;
          const bob = isPlayerMoving ? Math.sin(elapsed * 8.5) * 0.018 : 0;
          eng.camera.position.y += (1.62 + bob - eng.camera.position.y) * (1 - Math.exp(-10 * dt));

          const cosP = Math.cos(eng.fpPitch);
          currentTourLookAt.set(
            eng.camera.position.x + fwdX * cosP * 3,
            eng.camera.position.y + Math.sin(eng.fpPitch) * 3,
            eng.camera.position.z + fwdZ * cosP * 3
          );
          eng.camera.lookAt(currentTourLookAt);
        } else {
          // Guided Cinematic Virtual Tour Camera: glides behind Elena while walking, frames room at stop!
          const gx = eng.guide.root.position.x;
          const gz = eng.guide.root.position.z;
          const gyaw = eng.guide.root.rotation.y;

          if (eng.isWalking) {
            // Trail gracefully 2.15m behind Elena at 1.62m eye height, respecting walls
            const trailX = gx - Math.sin(gyaw) * 2.1 + Math.cos(gyaw) * 0.28;
            const trailZ = gz - Math.cos(gyaw) * 2.1 - Math.sin(gyaw) * 0.28;
            const safe = eng.navGrid
              ? eng.navGrid.resolveCameraWalk({ x: trailX, z: trailZ }, 0.3)
              : { x: trailX, z: trailZ };
            desiredTourCamPos.set(safe.x, 1.64, safe.z);
            desiredTourLookAt.set(
              gx + Math.sin(gyaw) * 0.55,
              1.34,
              gz + Math.cos(gyaw) * 0.55
            );
          } else if (p.activeTourStop) {
            desiredTourCamPos.set(
              p.activeTourStop.cameraPos.x,
              p.activeTourStop.cameraPos.y,
              p.activeTourStop.cameraPos.z
            );
            desiredTourLookAt.set(
              p.activeTourStop.cameraLookAt.x,
              p.activeTourStop.cameraLookAt.y,
              p.activeTourStop.cameraLookAt.z
            );
            // Have Elena softly face between the visitor camera and room focal point
            const toCamYaw = Math.atan2(
              eng.camera.position.x - gx,
              eng.camera.position.z - gz
            );
            eng.desiredYaw = toCamYaw;
          } else {
            // Stand comfortably facing Elena in her current room
            const frontX = gx + Math.sin(gyaw) * 2.15;
            const frontZ = gz + Math.cos(gyaw) * 2.15;
            const safe = eng.navGrid
              ? eng.navGrid.resolveCameraWalk({ x: frontX, z: frontZ }, 0.3)
              : { x: frontX, z: frontZ };
            desiredTourCamPos.set(safe.x, 1.62, safe.z);
            desiredTourLookAt.set(gx, 1.32, gz);
          }

          const camSmooth = 1 - Math.exp(-2.8 * dt);
          const lookSmooth = 1 - Math.exp(-4.2 * dt);
          eng.camera.position.lerp(desiredTourCamPos, camSmooth);
          currentTourLookAt.lerp(desiredTourLookAt, lookSmooth);
          eng.camera.lookAt(currentTourLookAt);
        }
      } else {
        // Orbit Mode (Split / 3D Preview / Anatomy Close-Up Inspector)
        if (eng.camTransition.active) {
          const ease = 1 - Math.exp(-6.5 * dt);
          eng.camera.position.lerp(eng.camTransition.pos, ease);
          eng.controls.target.lerp(eng.camTransition.target, ease);
          if (
            eng.camera.position.distanceTo(eng.camTransition.pos) < 0.012 &&
            eng.controls.target.distanceTo(eng.camTransition.target) < 0.012
          ) {
            eng.camTransition.active = false;
          }
        } else if (p.inspectTarget === 'none') {
          // Optional gentle WASD horizontal camera pan in 3D Preview mode
          let panFwd = 0;
          let panRight = 0;
          if (eng.keys.has('w') || eng.keys.has('arrowup')) panFwd += 1;
          if (eng.keys.has('s') || eng.keys.has('arrowdown')) panFwd -= 1;
          if (eng.keys.has('d') || eng.keys.has('arrowright')) panRight += 1;
          if (eng.keys.has('a') || eng.keys.has('arrowleft')) panRight -= 1;

          if (panFwd !== 0 || panRight !== 0) {
            eng.camera.getWorldDirection(tempCamForward);
            tempCamForward.y = 0;
            if (tempCamForward.lengthSq() > 1e-4) {
              tempCamForward.normalize();
              const rx = -tempCamForward.z;
              const rz = tempCamForward.x;
              const spd = 4.5 * dt;
              const mx = (tempCamForward.x * panFwd + rx * panRight) * spd;
              const mz = (tempCamForward.z * panFwd + rz * panRight) * spd;
              eng.camera.position.x += mx;
              eng.camera.position.z += mz;
              eng.controls.target.x += mx;
              eng.controls.target.z += mz;
            }
          }
        }
        eng.controls.update();
      }

      // 3. Update smart wall cutaway (force full immersive walls in first-person tour mode unless set to 'low')
      if (eng.arch) {
        const effectiveWallMode: WallDisplayMode =
          p.inspectTarget !== 'none'
            ? 'low'
            : inTourMode && p.wallMode === 'cutaway'
            ? 'full'
            : p.wallMode;
        eng.arch.updateWallCutaway(
          eng.camera.position,
          eng.controls.target,
          effectiveWallMode,
          dt,
          elapsed
        );
      }

      // 4. Push 60fps synchronized Guide + Camera telemetry to 2D Floorplan blueprint!
      eng.camera.getWorldDirection(tempCamForward);
      const sync = liveSyncRef.current;
      sync.guidePos.x = eng.guide.root.position.x;
      sync.guidePos.z = eng.guide.root.position.z;
      sync.guideYaw = eng.guide.root.rotation.y;
      sync.guideIsWalking = eng.isWalking;
      sync.guidePath = eng.pathQueue;
      sync.guideDestination =
        eng.pathQueue.length > 0 ? eng.pathQueue[eng.pathQueue.length - 1] : null;
      sync.cameraPos.x = eng.camera.position.x;
      sync.cameraPos.y = eng.camera.position.y;
      sync.cameraPos.z = eng.camera.position.z;
      sync.cameraYaw = Math.atan2(tempCamForward.x, tempCamForward.z);
      sync.cameraFovRad = THREE.MathUtils.degToRad(eng.camera.fov) * eng.camera.aspect;

      renderer.render(scene, camera);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      controls.removeEventListener('start', handleControlStart);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);

      engineRef.current?.arch?.dispose();
      guide.dispose();
      floorCache.dispose();
      pathGeo.dispose();
      pathMat.dispose();
      destGeo.dispose();
      destMat.dispose();
      hoverGeo.dispose();
      hoverMat.dispose();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild 3D architecture & A* navgrid instantaneously whenever floorplan changes!
  const prevPlanIdRef = useRef<string>(floorplan.id);
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;

    if (eng.arch) {
      eng.scene.remove(eng.arch.group);
      eng.arch.dispose();
    }

    const built = buildArchitecture(floorplan, eng.floorCache);
    eng.scene.add(built.group);
    eng.arch = built;
    eng.navGrid = new NavGrid(floorplan);

    // If switched to a whole new preset floorplan, move Elena to its start position cleanly
    if (prevPlanIdRef.current !== floorplan.id) {
      prevPlanIdRef.current = floorplan.id;
      eng.pathQueue = [];
      eng.isWalking = false;
      eng.updatePathVisual();
      eng.guide.root.position.set(floorplan.guideStart.x, 0.004, floorplan.guideStart.z);
      eng.guide.root.rotation.y = floorplan.guideStartYaw;
      eng.desiredYaw = floorplan.guideStartYaw;
      eng.guide.triggerWave(3.0);
      setFreeRoamInTour(false);
    }
  }, [floorplan]);

  // Apply Lighting Preset transitions
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;

    if (lighting === 'golden') {
      eng.scene.background = new THREE.Color(0xefe4d4);
      eng.scene.fog = new THREE.Fog(0xefe4d4, 22, 50);
      eng.sunLight.color.setHex(0xffd296);
      eng.sunLight.intensity = 1.95;
      eng.sunLight.position.set(13, 9.5, 9.5);
      eng.hemiLight.color.setHex(0xfff1dc);
      eng.hemiLight.groundColor.setHex(0xc9b49a);
      eng.hemiLight.intensity = 0.95;
      eng.fillLight.intensity = 0.42;
    } else if (lighting === 'studio') {
      eng.scene.background = new THREE.Color(0xf3f2ee);
      eng.scene.fog = new THREE.Fog(0xf3f2ee, 28, 60);
      eng.sunLight.color.setHex(0xffffff);
      eng.sunLight.intensity = 1.3;
      eng.sunLight.position.set(7, 18, 8);
      eng.hemiLight.color.setHex(0xffffff);
      eng.hemiLight.groundColor.setHex(0xe4e1da);
      eng.hemiLight.intensity = 1.35;
      eng.fillLight.intensity = 0.78;
    } else {
      // Nordic Daylight
      eng.scene.background = new THREE.Color(0xedeae2);
      eng.scene.fog = new THREE.Fog(0xedeae2, 24, 52);
      eng.sunLight.color.setHex(0xfff6e6);
      eng.sunLight.intensity = 1.65;
      eng.sunLight.position.set(9.5, 15.5, 8.5);
      eng.hemiLight.color.setHex(0xfffdf8);
      eng.hemiLight.groundColor.setHex(0xd8cfc0);
      eng.hemiLight.intensity = 1.08;
      eng.fillLight.intensity = 0.55;
    }
  }, [lighting]);

  // Execute walk requests (from 2D floorplan click, 3D floor click, or Guided Virtual Tour stop!)
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng || !walkRequest || !eng.navGrid) return;

    const start: Point2D = {
      x: eng.guide.root.position.x,
      z: eng.guide.root.position.z,
    };
    const path = eng.navGrid.findPath(start, walkRequest.target);
    eng.pathQueue = path;
    eng.activeWalkId = walkRequest.id;
    eng.activeWalkTourStopId = walkRequest.tourStopId;
    eng.faceAfterArrival = walkRequest.facePoint ?? null;
    eng.updatePathVisual();

    if (walkRequest.tourStopId) {
      setFreeRoamInTour(false);
    }
  }, [walkRequest]);

  // Handle switching in/out of Virtual Tour mode
  const prevViewModeRef = useRef<ViewMode>(viewMode);
  useEffect(() => {
    const eng = engineRef.current;
    const prev = prevViewModeRef.current;
    prevViewModeRef.current = viewMode;
    if (!eng) return;

    if (viewMode === 'tour') {
      setFreeRoamInTour(false);
      eng.guide.triggerWave(2.8);
    } else if (prev === 'tour' && inspectTarget === 'none') {
      eng.resetOrbitView();
    }
  }, [viewMode, inspectTarget]);

  // Handle Close-Up 3D Human Anatomy Inspection Camera Focus!
  const prevInspectRef = useRef<GuideInspectTarget>('none');
  useEffect(() => {
    const eng = engineRef.current;
    const prev = prevInspectRef.current;
    prevInspectRef.current = inspectTarget;
    if (!eng) return;

    if (inspectTarget === 'none') {
      if (prev !== 'none' && viewMode !== 'tour') {
        eng.resetOrbitView();
      }
      return;
    }

    // Pause active walk so Elena holds a poised, crystal-clear inspection stance
    const anchor = eng.guide.getInspectAnchorWorld(inspectTarget);
    const desiredPos = anchor.focus.clone().add(anchor.idealCamOffset);
    eng.camTransition = {
      active: true,
      pos: desiredPos,
      target: anchor.focus.clone(),
    };
    if (inspectTarget === 'full') {
      eng.guide.triggerWave(2.8);
    }
  }, [inspectTarget, viewMode]);

  const cycleLighting = () => {
    const next: LightingPreset =
      lighting === 'daylight' ? 'golden' : lighting === 'golden' ? 'studio' : 'daylight';
    onLightingChange(next);
  };

  const cycleWalls = () => {
    const next: WallDisplayMode =
      wallMode === 'cutaway' ? 'full' : wallMode === 'full' ? 'low' : 'cutaway';
    onWallModeChange(next);
  };

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-[#EDEAE2]">
      <div ref={containerRef} className="w-full h-full" />

      {/* Top-Left Subtle 3D Viewport Badge */}
      <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2">
        <div className="studio-glass rounded-full px-3 py-1.5 flex items-center gap-2 text-xs font-medium text-[#1C1B19]">
          <span
            className={`w-2 h-2 rounded-full ${
              viewMode === 'tour' ? 'bg-[#C85A32] animate-pulse' : 'bg-[#3D6B5E]'
            }`}
          />
          <span>
            {inspectTarget !== 'none'
              ? '3D Guide Anatomy View'
              : viewMode === 'tour'
              ? freeRoamInTour
                ? 'Virtual Tour · Free Walk'
                : 'Virtual Tour · Following Elena'
              : '3D Architectural Preview'}
          </span>
          <span className="hidden sm:inline text-[#6B6860] border-l border-black/10 pl-2">
            {guideStatusLabel}
          </span>
        </div>
      </div>

      {/* Top-Right Compact 3D Scene Controls */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        {viewMode === 'tour' && freeRoamInTour && inspectTarget === 'none' && (
          <button
            onClick={() => setFreeRoamInTour(false)}
            className="studio-glass rounded-full px-3 py-1.5 text-xs font-semibold text-[#C85A32] hover:bg-white transition flex items-center gap-1.5 cursor-pointer"
            title="Smoothly re-follow Elena the 3D tour guide"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Follow Elena</span>
          </button>
        )}

        <button
          onClick={cycleWalls}
          className="studio-glass rounded-full px-2.5 py-1.5 text-xs font-medium text-[#1C1B19] hover:bg-white transition flex items-center gap-1.5 cursor-pointer"
          title="Cycle wall display mode (Smart Cutaway / Full Height / Dollhouse Low)"
        >
          <Layers className="w-3.5 h-3.5 text-[#6B6860]" />
          <span className="hidden md:inline capitalize">
            {wallMode === 'cutaway' ? 'Cutaway' : wallMode === 'full' ? 'Full Walls' : 'Low Walls'}
          </span>
        </button>

        <button
          onClick={cycleLighting}
          className="studio-glass rounded-full px-2.5 py-1.5 text-xs font-medium text-[#1C1B19] hover:bg-white transition flex items-center gap-1.5 cursor-pointer"
          title="Switch lighting atmosphere (Nordic Daylight / Golden Hour / Studio)"
        >
          {lighting === 'daylight' && <Sun className="w-3.5 h-3.5 text-amber-600" />}
          {lighting === 'golden' && <Sunset className="w-3.5 h-3.5 text-[#C85A32]" />}
          {lighting === 'studio' && <Sparkles className="w-3.5 h-3.5 text-slate-600" />}
          <span className="hidden md:inline capitalize">{lighting}</span>
        </button>

        {viewMode !== 'tour' && (
          <button
            onClick={() => {
              onInspectTargetChange('none');
              engineRef.current?.resetOrbitView();
            }}
            className="studio-glass rounded-full p-1.5 text-[#1C1B19] hover:bg-white transition cursor-pointer"
            title="Reset 3D camera overview"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#6B6860]" />
          </button>
        )}
      </div>

      {/* Subtle Bottom-Right Navigation Micro-Hint (hidden when tour card occupies bottom in narrow view) */}
      {inspectTarget === 'none' && !isTourPlaying && (
        <div className="pointer-events-none hidden lg:flex absolute bottom-3 right-3 studio-glass rounded-full px-3 py-1 items-center gap-2.5 text-[11px] text-[#6B6860]">
          <span className="flex items-center gap-1">
            <Footprints className="w-3 h-3 text-[#C85A32]" />
            Click floor to walk guide
          </span>
          <span className="opacity-30">·</span>
          <span className="flex items-center gap-1">
            <Compass className="w-3 h-3" />
            {viewMode === 'tour' ? 'Drag look · WASD walk' : 'Drag orbit · Scroll zoom'}
          </span>
        </div>
      )}
    </div>
  );
};
