/** English translations for HPE frontend. */

const t = {
  // App
  appName: 'Higra Pump Engine',
  appDesc: 'Hydraulic turbomachinery design platform',
  logout: 'Sign Out',
  user: 'User',

  // Login
  signIn: 'Sign in to your account',
  createAccount: 'Create your account',
  name: 'Name',
  company: 'Company',
  email: 'Email',
  password: 'Password',
  signInBtn: 'Sign In',
  createAccountBtn: 'Create Account',
  pleaseWait: 'Please wait...',
  alreadyHaveAccount: 'Already have an account? Sign in',
  noAccount: "Don't have an account? Sign up",
  skipLogin: 'Skip login (dev mode)',

  // Projects
  projects: 'Projects',
  newProject: '+ New Project',
  quickDesign: 'Quick Design',
  projectName: 'Project name',
  descriptionOptional: 'Description (optional)',
  create: 'Create',
  creating: 'Creating...',
  noProjectsYet: 'No projects yet. Create one or use Quick Design.',
  designs: 'designs',

  // Sizing Form
  operatingPoint: 'Operating Point',
  flowRate: 'Flow Rate Q [m\u00B3/h]',
  head: 'Head H [m]',
  speed: 'Speed n [rpm]',
  runSizing: 'Run Sizing',
  computing: 'Computing...',

  // Sizing Form -- machine / fluid / advanced (FX1)
  machineType: 'MACHINE TYPE',
  fluid: 'FLUID',
  operatingPointLabel: 'OPERATING POINT',
  quickExamples: 'Quick examples:',
  advancedOptions: 'Advanced Options',
  tipClearance: 'Tip Clearance [mm]',
  roughness: 'Roughness Ra [\u03BCm]',
  overrideD2: 'Override D2 [mm]',
  overrideB2: 'Override b2 [mm]',
  automatic: 'Automatic',
  flowRateLabel: 'Flow Rate Q',
  headLabel: 'Total Head H [m]',
  rpmLabel: 'Speed n [rpm]',

  // Results -- status panel (FX2-FX3)
  projectStatus: 'PROJECT STATUS',
  deHaller: 'De Haller',
  peripheralSpeed: 'Peripheral speed u2',
  pmin: 'Pmin',
  geometry: 'Geometry',
  performance2: 'Performance',
  losses2: 'Losses',
  meridionalView: 'Meridional',
  closeView: 'Close',
  warningsLabel: 'WARNINGS',

  // Navigation / Tabs
  navProjects: 'Projects',
  navCurrentProject: 'Current Project',
  tabSizing: 'Sizing',
  tabCurves: 'Curves',
  tab3d: '3D View',
  tabVelocity: 'Velocity',
  tabLosses: 'Losses',
  tabStress: 'Stress',
  tabCompare: 'Comparison',
  tabAssistant: 'Assistant',
  tabLoading: 'Loading rV\u03B8*',
  tabPressure: 'PS/SS Dist.',
  tabMultiSpeed: 'Multi-Speed',
  tabMeridionalEditor: 'Meridional Editor',
  tabSpanwise: 'Spanwise',

  // Results
  sizingResults: 'Sizing Results',
  specificSpeed: 'Specific Speed',
  impeller: 'Impeller',
  performance: 'Performance',
  type: 'Type',
  blades: 'Blades',
  efficiency: 'Efficiency',
  power: 'Power',
  warnings: 'Warnings',
  enterOperatingPoint: 'Enter the operating point and click "Run Sizing"',

  // Curves
  performanceCurves: 'Performance Curves',

  // Velocity
  velocityTriangles: 'Velocity Triangles',
  inlet: 'Inlet',
  outlet: 'Outlet',
  eulerHead: 'Euler Head',
  noVelocityData: 'No velocity data',

  // Losses
  lossBreakdown: 'Loss Breakdown',
  profilePS: 'Profile (PS)',
  profileSS: 'Profile (SS)',
  tipLeakage: 'Tip Leakage',
  endwallHub: 'Endwall (Hub)',
  endwallShroud: 'Endwall (Shroud)',
  mixing: 'Mixing',
  incidence: 'Incidence',
  recirculation: 'Recirculation',
  totalHeadLoss: 'Total head loss',
  lossCoefficient: 'Loss coefficient',
  diskFriction: 'Disk friction',
  lossUnavailable: 'Loss data unavailable.',

  // Stress
  structuralAnalysis: 'Structural Analysis',
  centrifugalStress: 'Centrifugal Stress',
  bendingStress: 'Bending Stress',
  combined: 'Combined',
  safetyFactors: 'Safety Factors',
  vibration: 'Vibration',
  root: 'Root',
  tip: 'Tip',
  leadingEdge: 'Leading Edge',
  trailingEdge: 'Trailing Edge',
  maximum: 'Maximum',
  yieldSF: 'Yield',
  fatigueSF: 'Fatigue',
  ultimateSF: 'Ultimate',
  naturalFreq: '1st Natural Freq.',
  campbellMargin: 'Campbell Margin',
  safe: 'SAFE',
  warning: 'WARNING',
  allSafetyOk: 'All safety factors within limits.',
  stressUnavailable: 'Stress data unavailable.',

  // 3D Viewer
  impeller3d: '3D Impeller',
  loading3d: 'Loading 3D geometry...',
  failed3d: 'Failed to load geometry',
  noGeometry: 'No geometry data',
  dragToRotate: 'Drag to rotate, scroll to zoom',
  exportSTEP: 'Export STEP',
  exportSTL: 'Export STL',

  // Comparison
  designComparison: 'Design Comparison',
  add: '+ Add',
  runAll: 'Run All',

  // Assistant
  designAssistant: 'Design Assistant',
  askAboutDesign: 'Ask about your design...',
  send: 'Send',
  thinking: 'Thinking...',
  assistantGreeting: 'Hello! I can help analyze your pump design. Run a sizing first, then ask questions.',
  runSizingFirst: 'Run a sizing analysis first. I need the design data to give advice.',

  // Assistant responses
  assistEfficiency: (eta: string, nq: string, tip: string) =>
    `Current efficiency: ${eta}%. Nq=${nq}. ${tip}`,
  assistEffLow: 'Consider increasing blade count or adjusting beta2 to improve efficiency.',
  assistEffHigh: 'Excellent efficiency. Focus on maintaining it at off-design points.',
  assistEffGood: 'Good efficiency for this specific speed range.',
  assistNpsh: (npsh: string) => `NPSHr = ${npsh} m.`,
  assistNpshHigh: 'Relatively high. Consider reducing inlet velocity or increasing D1.',
  assistNpshOk: 'Within normal range for this pump size.',
  assistDims: (d2: string, d1: string, b2: string, z: number) =>
    `Impeller D2 = ${d2} mm, D1 = ${d1} mm. Outlet width b2 = ${b2} mm. ${z} blades.`,
  assistAngles: (b1: string, b2: string, tip: string) =>
    `Blade angles: beta1=${b1} deg (inlet), beta2=${b2} deg (outlet). ${tip}`,
  assistLowBeta2: 'Low beta2 -- risk of diffuser separation.',
  assistAnglesOk: 'Angles within typical range.',
  assistNoWarnings: 'No warnings found. Parameters within recommended ranges.',
  assistImproveBlades: 'Increase blade count (try Z=7-9)',
  assistImproveBeta2: 'Increase beta2 to reduce diffusion losses',
  assistImproveD1: 'Enlarge eye diameter D1 to reduce NPSHr',
  assistAlreadyOptimized: 'Design is already well optimized for this operating point',
  assistSuggestions: 'Improvement suggestions',
  assistSummary: (nq: string, d2: string, eta: string, z: number, npsh: string, pwr: string) =>
    `Summary: Nq=${nq}, D2=${d2}mm, eta=${eta}%, ${z} blades, NPSHr=${npsh}m, Power=${pwr}kW. Ask about efficiency, cavitation, dimensions or improvements.`,

  // Save design
  saveDesign: 'Save to Project',
  saving: 'Saving...',
  designSaved: 'Design saved!',
  saveNoProject: 'Select a project to save',

  // Errors
  somethingWentWrong: 'Something went wrong',
  unexpectedError: 'An unexpected error occurred',
  tryAgain: 'Try Again',
}

export default t
