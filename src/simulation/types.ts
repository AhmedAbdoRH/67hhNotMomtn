export type AnatomicalZone =
  | 'none'
  | 'mons'
  | 'prepuce'
  | 'glans'
  | 'labia_major_left'
  | 'labia_major_right'
  | 'labia_minor_left'
  | 'labia_minor_right'
  | 'urethra'
  | 'vestibule'
  | 'fourchette'
  | 'perineum';

export interface PhysiologicalState {
  /** Vasocongestion: blood pooling, tissue engorgement, deep mucosal coloration (0..1) */
  congestion: number;
  /** Lubrication: cohesive fluid film and gravity-driven vestibular secretions (0..1) */
  moisture: number;
  /** Arousal / pleasure response: built via rhythm, gentle indirect touch, and pauses (0..1) */
  arousal: number;
  /** Discomfort / sensory overload: dry friction, harsh direct glans pressure, unrelaxed force (0..1) */
  discomfort: number;
  /** Direct clitoral glans sensory saturation / numbness buildup (0..1) */
  clitoralSaturation: number;
  /** Muscular/tissue relaxation of the vestibular introitus (0..1) */
  vestibuleRelaxation: number;
  /** Time since last rapid movement, rewards rhythmic pacing and brief pauses (seconds) */
  pauseDuration: number;
  /** Smoothed circular/orbital stimulation quality (0..1) */
  circularity: number;
  /** Smoothed stimulation rhythm continuity (0..1) */
  rhythmQuality: number;
  /** Continuous respiratory cycle phase (radians) */
  breathPhase: number;
  /** Respiratory rate in breaths per minute (12..26) */
  breathRateBpm: number;
  /** Subtle pelvic vascular micro-pulse phase (radians) */
  pulsePhase: number;
  /** Cumulative active stimulation time (seconds) */
  elapsedTime: number;
  /** Normalized progress toward peak Skene's gland release threshold (0..1) */
  peakProgress: number;
  /** Remaining duration of active periurethral / Skene's gland emission pulse (seconds) */
  peakReleaseTimer: number;
  /** Count of completed peak arousal / Skene's gland emission cycles */
  emissionCount: number;
}

export type TactileToolId = 'finger' | 'brush' | 'palm' | 'probe';

export interface PointerContact {
  active: boolean;
  /** Normalized anatomical space X (-1..1) */
  x: number;
  /** Normalized anatomical space Y (-1.25..1.25) */
  y: number;
  /** Velocity in normalized units / sec */
  vx: number;
  vy: number;
  /** Contact pressure / depth (0..1) */
  pressure: number;
  /** Current anatomical region under contact */
  zone: AnatomicalZone;
  /** True when contact directly compresses the exposed glans without prepuce shielding */
  isDirectGlans: boolean;
  /** Current surface friction coefficient (derived from moisture & pressure) */
  friction: number;
  /** Active external tactile tool/element guiding the contact */
  tool?: TactileToolId;
}

export interface SpringNode {
  id: string;
  /** Base resting position in normalized coordinates */
  restX: number;
  restY: number;
  /** Current dynamic position */
  x: number;
  y: number;
  /** Current velocity */
  vx: number;
  vy: number;
  /** Effective mass */
  mass: number;
  /** Base spring stiffness k */
  stiffness: number;
  /** Base viscous damping c */
  damping: number;
  /** Anisotropic lateral stretch weight (how much side-pull affects it) */
  compliance: number;
  /** Structural wave/crenulation offset for organic asymmetry */
  waveOffset: number;
  /** Currently hooked/caught by pointer drag */
  hooked: boolean;
  /** Hook anchor offset relative to pointer when caught */
  hookOffsetX: number;
  hookOffsetY: number;
}

export interface MoistureBead {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Droplet radius in normalized units */
  radius: number;
  /** Accumulated fluid volume (0..1) */
  volume: number;
  /** Opacity / visibility (0..1) */
  alpha: number;
}

export interface SkeneDroplet {
  id: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  age: number;
}

export interface TissueMeshState {
  majoraLeft: SpringNode[];
  majoraRight: SpringNode[];
  minoraLeft: SpringNode[];
  minoraRight: SpringNode[];
  prepuce: SpringNode[];
  glans: SpringNode;
  vestibuleLeft: SpringNode[];
  vestibuleRight: SpringNode[];
  moistureBeads: MoistureBead[];
  emissionDroplets: SkeneDroplet[];
  /** Hood vertical retraction (0 = closed/hooded, 1 = retracted upward) */
  hoodRetraction: number;
  /** Glans recession deeper beneath swollen hood at high congestion (0..1) */
  glansRecession: number;
  /** Current effective parting width at vestibule (0 = closed cleft) */
  cleftOpening: number;
  /** Vestibular bulb & introital mucosa engorgement/swelling (0..1) */
  introitusSwelling: number;
  /** External labial, preputial, and perineal soft-tissue swelling coupled to arousal & release (0..1) */
  externalSwelling: number;
  /** Tissue tension / defensive contraction factor from discomfort (0..1) */
  defensiveTension: number;
  /** Running counter for droplet IDs */
  nextBeadId: number;
  /** Running counter for Skene emission droplets */
  nextEmissionId: number;
}

export interface SimulationSnapshot {
  physiology: PhysiologicalState;
  mesh: TissueMeshState;
  contact: PointerContact;
  hoveredZone: AnatomicalZone;
}
