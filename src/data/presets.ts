import { FloorplanData } from '../types/floorplan';

export const NORDIC_RESIDENCE: FloorplanData = {
  id: 'nordic-residence',
  name: 'Nordic Courtyard Residence',
  subtitle: '6 Rooms · 117 m² · Daylight Timber & Limestone',
  guideStart: { x: -2.3, z: -1.1 },
  guideStartYaw: 0.45,
  rooms: [
    {
      id: 'r-living',
      name: 'Living Lounge',
      floorMaterial: 'oak',
      polygon: [
        { x: -6.5, z: -4.5 },
        { x: 0.0, z: -4.5 },
        { x: 0.0, z: 0.5 },
        { x: -6.5, z: 0.5 },
      ],
      labelOffset: { x: -0.1, z: 0.2 },
    },
    {
      id: 'r-kitchen',
      name: 'Kitchen & Dining',
      floorMaterial: 'travertine',
      polygon: [
        { x: 0.0, z: -4.5 },
        { x: 6.5, z: -4.5 },
        { x: 6.5, z: 0.0 },
        { x: 0.0, z: 0.0 },
      ],
      labelOffset: { x: 0, z: 0.3 },
    },
    {
      id: 'r-foyer',
      name: 'Entry Foyer',
      floorMaterial: 'travertine',
      polygon: [
        { x: -6.5, z: 0.5 },
        { x: -3.0, z: 0.5 },
        { x: -3.0, z: 4.5 },
        { x: -6.5, z: 4.5 },
      ],
    },
    {
      id: 'r-study',
      name: "Architect's Study",
      floorMaterial: 'walnut',
      polygon: [
        { x: -3.0, z: 0.5 },
        { x: 0.0, z: 0.5 },
        { x: 0.0, z: 4.5 },
        { x: -3.0, z: 4.5 },
      ],
    },
    {
      id: 'r-bedroom',
      name: 'Primary Suite',
      floorMaterial: 'oak',
      polygon: [
        { x: 0.0, z: 0.0 },
        { x: 4.0, z: 0.0 },
        { x: 4.0, z: 4.5 },
        { x: 0.0, z: 4.5 },
      ],
    },
    {
      id: 'r-bath',
      name: 'Spa Bathroom',
      floorMaterial: 'tile',
      polygon: [
        { x: 4.0, z: 0.0 },
        { x: 6.5, z: 0.0 },
        { x: 6.5, z: 4.5 },
        { x: 4.0, z: 4.5 },
      ],
    },
  ],
  walls: [
    // Exterior Perimeter (clockwise)
    { id: 'w-n1', start: { x: -6.5, z: -4.5 }, end: { x: 0.0, z: -4.5 }, thickness: 0.22, height: 2.85, isExterior: true },
    { id: 'w-n2', start: { x: 0.0, z: -4.5 }, end: { x: 6.5, z: -4.5 }, thickness: 0.22, height: 2.85, isExterior: true },
    { id: 'w-e1', start: { x: 6.5, z: -4.5 }, end: { x: 6.5, z: 0.0 }, thickness: 0.22, height: 2.85, isExterior: true },
    { id: 'w-e2', start: { x: 6.5, z: 0.0 }, end: { x: 6.5, z: 4.5 }, thickness: 0.22, height: 2.85, isExterior: true },
    { id: 'w-s4', start: { x: 6.5, z: 4.5 }, end: { x: 4.0, z: 4.5 }, thickness: 0.22, height: 2.85, isExterior: true },
    { id: 'w-s3', start: { x: 4.0, z: 4.5 }, end: { x: 0.0, z: 4.5 }, thickness: 0.22, height: 2.85, isExterior: true },
    { id: 'w-s2', start: { x: 0.0, z: 4.5 }, end: { x: -3.0, z: 4.5 }, thickness: 0.22, height: 2.85, isExterior: true },
    { id: 'w-s1', start: { x: -3.0, z: 4.5 }, end: { x: -6.5, z: 4.5 }, thickness: 0.22, height: 2.85, isExterior: true },
    { id: 'w-w2', start: { x: -6.5, z: 4.5 }, end: { x: -6.5, z: 0.5 }, thickness: 0.22, height: 2.85, isExterior: true },
    { id: 'w-w1', start: { x: -6.5, z: 0.5 }, end: { x: -6.5, z: -4.5 }, thickness: 0.22, height: 2.85, isExterior: true },

    // Interior Partitions
    { id: 'w-liv-kit', start: { x: 0.0, z: -4.5 }, end: { x: 0.0, z: 0.0 }, thickness: 0.15, height: 2.85 },
    { id: 'w-study-bed', start: { x: 0.0, z: 0.0 }, end: { x: 0.0, z: 4.5 }, thickness: 0.15, height: 2.85 },
    { id: 'w-foyer-liv', start: { x: -6.5, z: 0.5 }, end: { x: -3.0, z: 0.5 }, thickness: 0.15, height: 2.85 },
    { id: 'w-study-liv', start: { x: -3.0, z: 0.5 }, end: { x: 0.0, z: 0.5 }, thickness: 0.15, height: 2.85 },
    { id: 'w-foyer-study', start: { x: -3.0, z: 0.5 }, end: { x: -3.0, z: 4.5 }, thickness: 0.15, height: 2.85 },
    { id: 'w-kit-bed', start: { x: 0.0, z: 0.0 }, end: { x: 4.0, z: 0.0 }, thickness: 0.15, height: 2.85 },
    { id: 'w-kit-bath', start: { x: 4.0, z: 0.0 }, end: { x: 6.5, z: 0.0 }, thickness: 0.15, height: 2.85 },
    { id: 'w-bed-bath', start: { x: 4.0, z: 0.0 }, end: { x: 4.0, z: 4.5 }, thickness: 0.15, height: 2.85 },
  ],
  openings: [
    // Doors
    { id: 'd-entry', wallId: 'w-s1', type: 'door', t: 0.5, width: 1.15, swingDir: 1, hingeSide: 'end', headHeight: 2.2 },
    { id: 'd-foyer-liv', wallId: 'w-foyer-liv', type: 'door', t: 0.56, width: 1.25, swingDir: -1, hingeSide: 'start', headHeight: 2.2 },
    { id: 'd-liv-study', wallId: 'w-study-liv', type: 'door', t: 0.5, width: 1.05, swingDir: 1, hingeSide: 'end', headHeight: 2.15 },
    { id: 'd-liv-kit', wallId: 'w-liv-kit', type: 'door', t: 0.65, width: 1.45, swingDir: 1, hingeSide: 'start', headHeight: 2.3 },
    { id: 'd-kit-bed', wallId: 'w-kit-bed', type: 'door', t: 0.34, width: 1.05, swingDir: 1, hingeSide: 'start', headHeight: 2.15 },
    { id: 'd-bed-bath', wallId: 'w-bed-bath', type: 'door', t: 0.34, width: 1.0, swingDir: -1, hingeSide: 'start', headHeight: 2.15 },

    // Exterior Windows
    { id: 'win-liv-n', wallId: 'w-n1', type: 'window', t: 0.48, width: 2.8, sillHeight: 0.55, headHeight: 2.35 },
    { id: 'win-liv-w', wallId: 'w-w1', type: 'window', t: 0.55, width: 2.1, sillHeight: 0.75, headHeight: 2.3 },
    { id: 'win-kit-n', wallId: 'w-n2', type: 'window', t: 0.55, width: 2.4, sillHeight: 0.95, headHeight: 2.3 },
    { id: 'win-din-e', wallId: 'w-e1', type: 'window', t: 0.52, width: 2.2, sillHeight: 0.65, headHeight: 2.35 },
    { id: 'win-bath-e', wallId: 'w-e2', type: 'window', t: 0.55, width: 1.35, sillHeight: 1.25, headHeight: 2.3 },
    { id: 'win-bed-s', wallId: 'w-s3', type: 'window', t: 0.5, width: 2.2, sillHeight: 0.65, headHeight: 2.3 },
    { id: 'win-study-s', wallId: 'w-s2', type: 'window', t: 0.5, width: 1.65, sillHeight: 0.8, headHeight: 2.3 },
    { id: 'win-foyer-w', wallId: 'w-w2', type: 'window', t: 0.5, width: 1.4, sillHeight: 0.85, headHeight: 2.25 },
  ],
  furniture: [
    // Living Lounge
    { id: 'f-rug-1', type: 'rug', label: 'Nordic Wool Rug', x: -3.7, z: -2.35, rotation: 0, width: 3.1, depth: 2.2 },
    { id: 'f-sofa-1', type: 'sofa', label: 'Linen Lounge Sofa', x: -3.7, z: -3.55, rotation: 0, width: 2.5, depth: 0.96 },
    { id: 'f-ctable-1', type: 'coffee_table', label: 'White Oak Coffee Table', x: -3.7, z: -2.25, rotation: 0, width: 1.35, depth: 0.72 },
    { id: 'f-chair-1', type: 'armchair', label: 'Bouclé Lounge Chair', x: -5.45, z: -2.15, rotation: Math.PI / 2 - 0.2, width: 0.84, depth: 0.84 },
    { id: 'f-lamp-1', type: 'floor_lamp', label: 'Brass Arc Lamp', x: -5.6, z: -3.7, rotation: 0.6, width: 0.48, depth: 0.48 },
    { id: 'f-plant-1', type: 'plant', label: 'Olive Tree', x: -0.75, z: -3.8, rotation: 0, width: 0.62, depth: 0.62 },

    // Entry Foyer
    { id: 'f-console-1', type: 'console_table', label: 'Travertine Console', x: -5.95, z: 2.5, rotation: Math.PI / 2, width: 1.4, depth: 0.42 },
    { id: 'f-plant-2', type: 'plant', label: 'Fiddle Leaf Fig', x: -3.55, z: 3.85, rotation: 0, width: 0.58, depth: 0.58 },

    // Architect's Study
    { id: 'f-desk-1', type: 'desk', label: 'Drafting Desk', x: -1.5, z: 3.55, rotation: Math.PI, width: 1.55, depth: 0.76 },
    { id: 'f-shelf-1', type: 'bookshelf', label: 'Walnut Library', x: -2.65, z: 2.15, rotation: Math.PI / 2, width: 1.5, depth: 0.38 },

    // Kitchen & Dining
    { id: 'f-kcounter-1', type: 'kitchen_counter', label: 'Chef Cabinetry', x: 2.2, z: -4.02, rotation: 0, width: 3.1, depth: 0.65 },
    { id: 'f-kisland-1', type: 'kitchen_island', label: 'Limestone Island', x: 2.2, z: -2.55, rotation: 0, width: 2.15, depth: 0.9 },
    { id: 'f-dining-1', type: 'dining_set', label: 'Oak Dining Table', x: 5.05, z: -2.1, rotation: Math.PI / 2, width: 2.0, depth: 1.08 },
    { id: 'f-plant-3', type: 'plant', label: 'Monstera', x: 5.85, z: -3.9, rotation: 0, width: 0.58, depth: 0.58 },

    // Primary Suite
    { id: 'f-bed-1', type: 'bed_king', label: 'Oak Platform Bed', x: 2.15, z: 3.25, rotation: Math.PI, width: 2.0, depth: 2.1 },
    { id: 'f-ward-1', type: 'wardrobe', label: 'Fluted Oak Wardrobe', x: 0.42, z: 2.4, rotation: Math.PI / 2, width: 1.75, depth: 0.58 },

    // Spa Bathroom
    { id: 'f-tub-1', type: 'bathtub', label: 'Freestanding Tub', x: 5.45, z: 3.78, rotation: Math.PI, width: 1.65, depth: 0.78 },
    { id: 'f-vanity-1', type: 'vanity', label: 'Limestone Vanity', x: 6.05, z: 1.85, rotation: -Math.PI / 2, width: 1.25, depth: 0.54 },
  ],
  tourStops: [
    {
      id: 'stop-foyer',
      roomName: 'Entry Foyer',
      title: 'Sunlit Travertine Gallery',
      description:
        'Welcome inside! Honed travertine flooring establishes a calm threshold, framed by a western casement window and wide sightlines directly into the main living lounge.',
      highlights: ['14.0 m²', 'Honed Travertine', '1.25m Gallery Portal'],
      guidePos: { x: -4.55, z: 2.15 },
      featurePoint: { x: -5.9, z: 2.5 },
      cameraPos: { x: -4.45, y: 1.62, z: 4.05 },
      cameraLookAt: { x: -4.65, y: 1.32, z: 1.6 },
    },
    {
      id: 'stop-living',
      roomName: 'Living Lounge',
      title: 'Nordic Oak Living Pavilion',
      description:
        'Wide-plank Nordic white oak warms this 32.5 m² corner sanctuary. Dual-aspect glazing floods the tailored linen seating group with soft northern courtyard light.',
      highlights: ['32.5 m²', 'White Oak Planks', '2.8m Picture Window'],
      guidePos: { x: -2.15, z: -1.35 },
      featurePoint: { x: -3.7, z: -3.2 },
      cameraPos: { x: -0.95, y: 1.64, z: 0.1 },
      cameraLookAt: { x: -3.05, y: 1.28, z: -2.2 },
    },
    {
      id: 'stop-study',
      roomName: "Architect's Study",
      title: 'Private Walnut Studio',
      description:
        'Tucked peacefully off the lounge, rich smoked-walnut planks anchor a focused drafting workspace featuring bespoke shelving and warm southern garden views.',
      highlights: ['12.0 m²', 'Smoked Walnut', 'South Garden Light'],
      guidePos: { x: -1.3, z: 2.15 },
      featurePoint: { x: -1.5, z: 3.55 },
      cameraPos: { x: -1.55, y: 1.62, z: 0.78 },
      cameraLookAt: { x: -1.45, y: 1.25, z: 2.75 },
    },
    {
      id: 'stop-kitchen',
      roomName: 'Kitchen & Dining',
      title: 'Culinary Island & Dining Hall',
      description:
        'Flowing through a 1.45m portal, the culinary heart pairs a monolithic limestone island with custom oak cabinetry and a six-seat east-facing morning dining area.',
      highlights: ['29.3 m²', '2.15m Stone Island', 'Morning East Sun'],
      guidePos: { x: 2.25, z: -1.1 },
      featurePoint: { x: 3.2, z: -2.4 },
      cameraPos: { x: 0.55, y: 1.64, z: -0.65 },
      cameraLookAt: { x: 3.1, y: 1.28, z: -1.85 },
    },
    {
      id: 'stop-bedroom',
      roomName: 'Primary Suite',
      title: 'Serene Primary Sanctuary',
      description:
        'Designed for quiet restoration, the primary suite balances generous circulation around a low oak platform bed, fluted timber wardrobe, and private spa access.',
      highlights: ['18.0 m²', 'King Platform Suite', 'Direct Ensuite Flow'],
      guidePos: { x: 2.15, z: 1.45 },
      featurePoint: { x: 2.15, z: 3.2 },
      cameraPos: { x: 1.15, y: 1.62, z: 0.25 },
      cameraLookAt: { x: 2.25, y: 1.25, z: 2.2 },
    },
    {
      id: 'stop-bath',
      roomName: 'Spa Bathroom',
      title: 'Daylight Limestone Wet Room',
      description:
        'Our final stop features architectural porcelain tile, a sculptural freestanding soaking tub, floating stone vanity, and high clerestory glazing for natural privacy.',
      highlights: ['11.3 m²', 'Soaking Tub', 'Clerestory Window'],
      guidePos: { x: 4.95, z: 2.15 },
      featurePoint: { x: 5.45, z: 3.7 },
      cameraPos: { x: 4.55, y: 1.62, z: 0.5 },
      cameraLookAt: { x: 5.2, y: 1.22, z: 2.75 },
    },
  ],
};

export const SOHO_LOFT: FloorplanData = {
  id: 'soho-loft',
  name: 'Soho Gallery Loft',
  subtitle: '4 Zones · 88 m² · Open-Concept Concrete & Oak',
  guideStart: { x: -1.8, z: 0.4 },
  guideStartYaw: 0.6,
  rooms: [
    {
      id: 'sl-atrium',
      name: 'Gallery Living Atrium',
      floorMaterial: 'concrete',
      polygon: [
        { x: -5.5, z: -4.0 },
        { x: 1.0, z: -4.0 },
        { x: 1.0, z: 4.0 },
        { x: -5.5, z: 4.0 },
      ],
      labelOffset: { x: 0.2, z: 0.1 },
    },
    {
      id: 'sl-kitchen',
      name: "Chef's Loft Kitchen",
      floorMaterial: 'oak',
      polygon: [
        { x: 1.0, z: -4.0 },
        { x: 5.5, z: -4.0 },
        { x: 5.5, z: 0.0 },
        { x: 1.0, z: 0.0 },
      ],
    },
    {
      id: 'sl-bed',
      name: 'Bedroom Alcove',
      floorMaterial: 'walnut',
      polygon: [
        { x: 1.0, z: 0.0 },
        { x: 5.5, z: 0.0 },
        { x: 5.5, z: 2.5 },
        { x: 1.0, z: 2.5 },
      ],
    },
    {
      id: 'sl-bath',
      name: 'Ensuite Bath',
      floorMaterial: 'tile',
      polygon: [
        { x: 1.0, z: 2.5 },
        { x: 5.5, z: 2.5 },
        { x: 5.5, z: 4.0 },
        { x: 1.0, z: 4.0 },
      ],
    },
  ],
  walls: [
    { id: 'lw-n1', start: { x: -5.5, z: -4.0 }, end: { x: 1.0, z: -4.0 }, thickness: 0.22, height: 3.0, isExterior: true },
    { id: 'lw-n2', start: { x: 1.0, z: -4.0 }, end: { x: 5.5, z: -4.0 }, thickness: 0.22, height: 3.0, isExterior: true },
    { id: 'lw-e1', start: { x: 5.5, z: -4.0 }, end: { x: 5.5, z: 0.0 }, thickness: 0.22, height: 3.0, isExterior: true },
    { id: 'lw-e2', start: { x: 5.5, z: 0.0 }, end: { x: 5.5, z: 4.0 }, thickness: 0.22, height: 3.0, isExterior: true },
    { id: 'lw-s2', start: { x: 5.5, z: 4.0 }, end: { x: 1.0, z: 4.0 }, thickness: 0.22, height: 3.0, isExterior: true },
    { id: 'lw-s1', start: { x: 1.0, z: 4.0 }, end: { x: -5.5, z: 4.0 }, thickness: 0.22, height: 3.0, isExterior: true },
    { id: 'lw-w1', start: { x: -5.5, z: 4.0 }, end: { x: -5.5, z: -4.0 }, thickness: 0.22, height: 3.0, isExterior: true },

    // Interior
    { id: 'lw-i1', start: { x: 1.0, z: -4.0 }, end: { x: 1.0, z: 0.0 }, thickness: 0.15, height: 3.0 },
    { id: 'lw-i2', start: { x: 1.0, z: 0.0 }, end: { x: 1.0, z: 2.5 }, thickness: 0.15, height: 3.0 },
    { id: 'lw-i3', start: { x: 1.0, z: 2.5 }, end: { x: 1.0, z: 4.0 }, thickness: 0.15, height: 3.0 },
    { id: 'lw-i4', start: { x: 1.0, z: 0.0 }, end: { x: 5.5, z: 0.0 }, thickness: 0.15, height: 3.0 },
    { id: 'lw-i5', start: { x: 1.0, z: 2.5 }, end: { x: 5.5, z: 2.5 }, thickness: 0.15, height: 3.0 },
  ],
  openings: [
    { id: 'ld-entry', wallId: 'lw-s1', type: 'door', t: 0.72, width: 1.2, swingDir: 1, hingeSide: 'start', headHeight: 2.3 },
    { id: 'ld-kit', wallId: 'lw-i1', type: 'door', t: 0.62, width: 1.6, swingDir: 1, hingeSide: 'start', headHeight: 2.4 },
    { id: 'ld-bed', wallId: 'lw-i2', type: 'door', t: 0.5, width: 1.1, swingDir: 1, hingeSide: 'start', headHeight: 2.2 },
    { id: 'ld-bath', wallId: 'lw-i5', type: 'door', t: 0.28, width: 0.95, swingDir: 1, hingeSide: 'start', headHeight: 2.15 },

    { id: 'lwin-n1', wallId: 'lw-n1', type: 'window', t: 0.5, width: 3.4, sillHeight: 0.5, headHeight: 2.55 },
    { id: 'lwin-w1', wallId: 'lw-w1', type: 'window', t: 0.5, width: 3.2, sillHeight: 0.55, headHeight: 2.55 },
    { id: 'lwin-n2', wallId: 'lw-n2', type: 'window', t: 0.5, width: 2.2, sillHeight: 0.9, headHeight: 2.45 },
    { id: 'lwin-e2', wallId: 'lw-e2', type: 'window', t: 0.35, width: 1.6, sillHeight: 0.75, headHeight: 2.4 },
  ],
  furniture: [
    { id: 'lf-rug', type: 'rug', label: 'Gallery Kilim Rug', x: -3.1, z: -1.7, rotation: 0, width: 3.2, depth: 2.3 },
    { id: 'lf-sofa', type: 'sofa', label: 'Modular Loft Sofa', x: -3.1, z: -2.95, rotation: 0, width: 2.6, depth: 0.98 },
    { id: 'lf-ct', type: 'coffee_table', label: 'Plinth Table', x: -3.1, z: -1.65, rotation: 0, width: 1.4, depth: 0.75 },
    { id: 'lf-din', type: 'dining_set', label: 'Atelier Dining Set', x: -3.2, z: 1.55, rotation: 0, width: 2.0, depth: 1.1 },
    { id: 'lf-shelf', type: 'bookshelf', label: 'Art Bookcase', x: 0.55, z: 3.1, rotation: -Math.PI / 2, width: 1.4, depth: 0.38 },
    { id: 'lf-kc', type: 'kitchen_counter', label: 'Loft Kitchen', x: 3.4, z: -3.52, rotation: 0, width: 3.0, depth: 0.65 },
    { id: 'lf-ki', type: 'kitchen_island', label: 'Chef Island', x: 3.4, z: -1.9, rotation: 0, width: 2.1, depth: 0.9 },
    { id: 'lf-bed', type: 'bed_king', label: 'Loft Platform Bed', x: 4.15, z: 1.25, rotation: -Math.PI / 2, width: 1.85, depth: 2.05 },
    { id: 'lf-tub', type: 'bathtub', label: 'Soaking Tub', x: 4.35, z: 3.35, rotation: Math.PI, width: 1.6, depth: 0.75 },
    { id: 'lf-plant', type: 'plant', label: 'Gallery Fig', x: -4.85, z: -3.3, rotation: 0, width: 0.62, depth: 0.62 },
  ],
  tourStops: [
    {
      id: 'sl-s1',
      roomName: 'Gallery Living Atrium',
      title: '52 m² Industrial-Warm Atrium',
      description:
        'Soaring 3-meter loft walls and factory-proportioned north & west glazing illuminate polished architectural concrete paired with tactile linen seating.',
      highlights: ['52.0 m²', '3.0m Ceiling', 'Dual Gallery Windows'],
      guidePos: { x: -1.1, z: -0.7 },
      featurePoint: { x: -3.1, z: -2.4 },
      cameraPos: { x: -0.5, y: 1.65, z: 1.6 },
      cameraLookAt: { x: -2.4, y: 1.3, z: -1.6 },
    },
    {
      id: 'sl-s2',
      roomName: "Chef's Loft Kitchen",
      title: 'Entertainer Island Kitchen',
      description:
        'A generous 1.6-meter opening leads into the warm oak culinary studio anchored by a sculpted prep island and abundant natural countertop light.',
      highlights: ['18.0 m²', '1.6m Portal', 'Sculpted Island'],
      guidePos: { x: 2.4, z: -0.85 },
      featurePoint: { x: 3.4, z: -2.2 },
      cameraPos: { x: 1.2, y: 1.65, z: -0.55 },
      cameraLookAt: { x: 3.2, y: 1.3, z: -1.8 },
    },
    {
      id: 'sl-s3',
      roomName: 'Bedroom Alcove',
      title: 'Tucked Walnut Sleeping Suite',
      description:
        'Separated acoustically from the gallery hall, smoked walnut flooring and morning east light create a tranquil urban bedroom with private ensuite bath.',
      highlights: ['18.0 m² Suite', 'Smoked Walnut', 'Private Ensuite'],
      guidePos: { x: 2.45, z: 1.2 },
      featurePoint: { x: 4.1, z: 1.25 },
      cameraPos: { x: 1.28, y: 1.62, z: 1.18 },
      cameraLookAt: { x: 3.05, y: 1.25, z: 1.25 },
    },
  ],
};

export const KYOTO_PAVILION: FloorplanData = {
  id: 'kyoto-pavilion',
  name: 'Kyoto Garden Pavilion',
  subtitle: '5 Rooms · 110 m² · Japandi Tatami, Cedar & Stone',
  guideStart: { x: -1.6, z: -0.6 },
  guideStartYaw: 0.3,
  rooms: [
    {
      id: 'kp-genkan',
      name: 'Genkan Entry',
      floorMaterial: 'travertine',
      polygon: [
        { x: -6.0, z: 1.0 },
        { x: -2.5, z: 1.0 },
        { x: -2.5, z: 4.5 },
        { x: -6.0, z: 4.5 },
      ],
    },
    {
      id: 'kp-living',
      name: 'Tea & Living Hall',
      floorMaterial: 'oak',
      polygon: [
        { x: -6.0, z: -4.5 },
        { x: 0.5, z: -4.5 },
        { x: 0.5, z: 1.0 },
        { x: -6.0, z: 1.0 },
      ],
    },
    {
      id: 'kp-dining',
      name: 'Engawa Dining & Kitchen',
      floorMaterial: 'oak',
      polygon: [
        { x: 0.5, z: -4.5 },
        { x: 6.0, z: -4.5 },
        { x: 6.0, z: 0.5 },
        { x: 0.5, z: 0.5 },
      ],
    },
    {
      id: 'kp-tatami',
      name: 'Tatami Sanctuary',
      floorMaterial: 'tatami',
      polygon: [
        { x: -2.5, z: 1.0 },
        { x: 3.2, z: 1.0 },
        { x: 3.2, z: 4.5 },
        { x: -2.5, z: 4.5 },
      ],
    },
    {
      id: 'kp-hinoki',
      name: 'Hinoki Spa Bath',
      floorMaterial: 'tile',
      polygon: [
        { x: 3.2, z: 0.5 },
        { x: 6.0, z: 0.5 },
        { x: 6.0, z: 4.5 },
        { x: 3.2, z: 4.5 },
      ],
    },
    {
      id: 'kp-vest',
      name: 'Gallery Passage',
      floorMaterial: 'oak',
      polygon: [
        { x: 0.5, z: 0.5 },
        { x: 3.2, z: 0.5 },
        { x: 3.2, z: 1.0 },
        { x: 0.5, z: 1.0 },
      ],
    },
  ],
  walls: [
    { id: 'kw-n1', start: { x: -6.0, z: -4.5 }, end: { x: 0.5, z: -4.5 }, thickness: 0.22, height: 2.75, isExterior: true },
    { id: 'kw-n2', start: { x: 0.5, z: -4.5 }, end: { x: 6.0, z: -4.5 }, thickness: 0.22, height: 2.75, isExterior: true },
    { id: 'kw-e1', start: { x: 6.0, z: -4.5 }, end: { x: 6.0, z: 0.5 }, thickness: 0.22, height: 2.75, isExterior: true },
    { id: 'kw-e2', start: { x: 6.0, z: 0.5 }, end: { x: 6.0, z: 4.5 }, thickness: 0.22, height: 2.75, isExterior: true },
    { id: 'kw-s3', start: { x: 6.0, z: 4.5 }, end: { x: 3.2, z: 4.5 }, thickness: 0.22, height: 2.75, isExterior: true },
    { id: 'kw-s2', start: { x: 3.2, z: 4.5 }, end: { x: -2.5, z: 4.5 }, thickness: 0.22, height: 2.75, isExterior: true },
    { id: 'kw-s1', start: { x: -2.5, z: 4.5 }, end: { x: -6.0, z: 4.5 }, thickness: 0.22, height: 2.75, isExterior: true },
    { id: 'kw-w2', start: { x: -6.0, z: 4.5 }, end: { x: -6.0, z: 1.0 }, thickness: 0.22, height: 2.75, isExterior: true },
    { id: 'kw-w1', start: { x: -6.0, z: 1.0 }, end: { x: -6.0, z: -4.5 }, thickness: 0.22, height: 2.75, isExterior: true },

    // Interior shoji-inspired partitions
    { id: 'kw-i1', start: { x: -6.0, z: 1.0 }, end: { x: -2.5, z: 1.0 }, thickness: 0.14, height: 2.75 },
    { id: 'kw-i2', start: { x: -2.5, z: 1.0 }, end: { x: -2.5, z: 4.5 }, thickness: 0.14, height: 2.75 },
    { id: 'kw-i3', start: { x: -2.5, z: 1.0 }, end: { x: 3.2, z: 1.0 }, thickness: 0.14, height: 2.75 },
    { id: 'kw-i4', start: { x: 0.5, z: -4.5 }, end: { x: 0.5, z: 0.5 }, thickness: 0.14, height: 2.75 },
    { id: 'kw-i5', start: { x: 3.2, z: 0.5 }, end: { x: 6.0, z: 0.5 }, thickness: 0.14, height: 2.75 },
    { id: 'kw-i6', start: { x: 3.2, z: 0.5 }, end: { x: 3.2, z: 4.5 }, thickness: 0.14, height: 2.75 },
  ],
  openings: [
    { id: 'kd-entry', wallId: 'kw-s1', type: 'door', t: 0.5, width: 1.2, swingDir: 1, hingeSide: 'start', headHeight: 2.15 },
    { id: 'kd-genkan', wallId: 'kw-i1', type: 'door', t: 0.55, width: 1.3, swingDir: -1, hingeSide: 'start', headHeight: 2.15 },
    { id: 'kd-din', wallId: 'kw-i4', type: 'door', t: 0.65, width: 1.5, swingDir: 1, hingeSide: 'start', headHeight: 2.2 },
    { id: 'kd-tatami', wallId: 'kw-i3', type: 'door', t: 0.28, width: 1.25, swingDir: 1, hingeSide: 'start', headHeight: 2.15 },
    { id: 'kd-bath', wallId: 'kw-i5', type: 'door', t: 0.42, width: 1.0, swingDir: 1, hingeSide: 'start', headHeight: 2.15 },

    { id: 'kwin-n1', wallId: 'kw-n1', type: 'window', t: 0.5, width: 3.2, sillHeight: 0.45, headHeight: 2.3 },
    { id: 'kwin-n2', wallId: 'kw-n2', type: 'window', t: 0.5, width: 2.6, sillHeight: 0.65, headHeight: 2.3 },
    { id: 'kwin-s2', wallId: 'kw-s2', type: 'window', t: 0.5, width: 2.6, sillHeight: 0.55, headHeight: 2.25 },
    { id: 'kwin-e2', wallId: 'kw-e2', type: 'window', t: 0.55, width: 1.6, sillHeight: 1.1, headHeight: 2.25 },
  ],
  furniture: [
    { id: 'kf-con', type: 'console_table', label: 'Cedar Bench', x: -5.45, z: 2.7, rotation: Math.PI / 2, width: 1.35, depth: 0.42 },
    { id: 'kf-rug', type: 'rug', label: 'Jute Weave Mat', x: -3.2, z: -2.2, rotation: 0, width: 3.0, depth: 2.1 },
    { id: 'kf-sofa', type: 'sofa', label: 'Low Japandi Sofa', x: -3.2, z: -3.45, rotation: 0, width: 2.4, depth: 0.95 },
    { id: 'kf-ct', type: 'coffee_table', label: 'Low Cedar Tea Table', x: -3.2, z: -2.1, rotation: 0, width: 1.35, depth: 0.75 },
    { id: 'kf-plant1', type: 'plant', label: 'Indoor Bamboo', x: -5.3, z: -3.7, rotation: 0, width: 0.6, depth: 0.6 },
    { id: 'kf-kc', type: 'kitchen_counter', label: 'Hinoki Kitchen', x: 3.4, z: -4.0, rotation: 0, width: 2.9, depth: 0.65 },
    { id: 'kf-din', type: 'dining_set', label: 'Engawa Dining Table', x: 3.6, z: -1.85, rotation: 0, width: 2.0, depth: 1.08 },
    { id: 'kf-bed', type: 'bed_king', label: 'Low Tatami Futon Bed', x: 0.85, z: 3.25, rotation: Math.PI, width: 2.0, depth: 2.1 },
    { id: 'kf-tub', type: 'bathtub', label: 'Ofuro Soaking Tub', x: 4.8, z: 3.7, rotation: Math.PI, width: 1.6, depth: 0.8 },
    { id: 'kf-van', type: 'vanity', label: 'Stone Basin Vanity', x: 5.55, z: 2.0, rotation: -Math.PI / 2, width: 1.2, depth: 0.54 },
  ],
  tourStops: [
    {
      id: 'kp-s1',
      roomName: 'Tea & Living Hall',
      title: 'Moss-Garden Living Pavilion',
      description:
        'Low-slung timber proportions and deep panoramic north glazing draw the tranquil garden directly into this 35.8 m² Japandi living hall.',
      highlights: ['35.8 m²', 'Low Horizon Glazing', 'Natural Cedar & Oak'],
      guidePos: { x: -1.4, z: -1.1 },
      featurePoint: { x: -3.2, z: -2.9 },
      cameraPos: { x: -0.4, y: 1.6, z: 0.5 },
      cameraLookAt: { x: -2.7, y: 1.25, z: -2.1 },
    },
    {
      id: 'kp-s2',
      roomName: 'Tatami Sanctuary',
      title: 'Woven Rush-Grass Suite',
      description:
        'Authentic modular tatami mats scent the air and cushion bare footsteps beneath a minimalist low platform bed facing the southern courtyard.',
      highlights: ['20.0 m²', 'Woven Tatami', 'Barefoot Comfort'],
      guidePos: { x: -0.8, z: 2.55 },
      featurePoint: { x: 0.85, z: 3.25 },
      cameraPos: { x: -1.25, y: 1.58, z: 1.28 },
      cameraLookAt: { x: 0.05, y: 1.2, z: 2.95 },
    },
    {
      id: 'kp-s3',
      roomName: 'Engawa Dining & Kitchen',
      title: 'Sunlit Timber Dining Hall',
      description:
        'Hand-finished joinery connects the minimalist kitchen with a tranquil six-seat dining veranda, just steps from the private ofuro soaking bath.',
      highlights: ['27.5 m²', 'Hinoki Joinery', 'Ofuro Bath Access'],
      guidePos: { x: 2.1, z: -0.95 },
      featurePoint: { x: 3.6, z: -1.9 },
      cameraPos: { x: 0.6, y: 1.6, z: -0.55 },
      cameraLookAt: { x: 3.0, y: 1.25, z: -1.6 },
    },
  ],
};

export const FLOORPLAN_PRESETS: FloorplanData[] = [
  NORDIC_RESIDENCE,
  SOHO_LOFT,
  KYOTO_PAVILION,
];

export function cloneFloorplan(data: FloorplanData): FloorplanData {
  return JSON.parse(JSON.stringify(data));
}

export function computePolygonArea(polygon: { x: number; z: number }[]): number {
  if (polygon.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return Math.abs(sum) * 0.5;
}

export function computePolygonCentroid(polygon: { x: number; z: number }[]): { x: number; z: number } {
  if (polygon.length === 0) return { x: 0, z: 0 };
  let x = 0;
  let z = 0;
  for (const p of polygon) {
    x += p.x;
    z += p.z;
  }
  return { x: x / polygon.length, z: z / polygon.length };
}
