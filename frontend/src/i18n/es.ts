/** Traducciones ES para el frontend HPE. */

const t = {
  // App
  appName: 'Higra Pump Engine',
  appDesc: 'Plataforma de diseno de turbomaquinas hidraulicas',
  logout: 'Salir',
  user: 'Usuario',

  // Login
  signIn: 'Iniciar sesion',
  createAccount: 'Crear tu cuenta',
  name: 'Nombre',
  company: 'Empresa',
  email: 'Correo',
  password: 'Contrasena',
  signInBtn: 'Iniciar Sesion',
  createAccountBtn: 'Crear Cuenta',
  pleaseWait: 'Espere...',
  alreadyHaveAccount: 'Ya tienes cuenta? Inicia sesion',
  noAccount: 'No tienes cuenta? Registrate',
  skipLogin: 'Saltar login (modo dev)',

  // Projects
  projects: 'Proyectos',
  newProject: '+ Nuevo Proyecto',
  quickDesign: 'Diseno Rapido',
  projectName: 'Nombre del proyecto',
  descriptionOptional: 'Descripcion (opcional)',
  create: 'Crear',
  creating: 'Creando...',
  noProjectsYet: 'Aun no hay proyectos. Crea uno o usa Diseno Rapido.',
  designs: 'disenos',

  // Sizing Form
  operatingPoint: 'Punto de Operacion',
  flowRate: 'Caudal Q [m\u00B3/h]',
  head: 'Altura H [m]',
  speed: 'Velocidad n [rpm]',
  runSizing: 'Ejecutar Dimensionamiento',
  computing: 'Calculando...',

  // Sizing Form -- machine / fluid / advanced (FX1)
  machineType: 'TIPO DE MÁQUINA',
  fluid: 'FLUIDO',
  operatingPointLabel: 'PUNTO DE OPERACIÓN',
  quickExamples: 'Ejemplos rápidos:',
  advancedOptions: 'Opciones Avanzadas',
  tipClearance: 'Holgura de punta [mm]',
  roughness: 'Rugosidad Ra [\u03BCm]',
  overrideD2: 'Sobreescribir D2 [mm]',
  overrideB2: 'Sobreescribir b2 [mm]',
  automatic: 'Automático',
  flowRateLabel: 'Caudal Q',
  headLabel: 'Altura Total H [m]',
  rpmLabel: 'Velocidad n [rpm]',

  // Results -- status panel (FX2-FX3)
  projectStatus: 'ESTADO DEL PROYECTO',
  deHaller: 'De Haller',
  peripheralSpeed: 'Vel. periferica u2',
  pmin: 'Pmin',
  geometry: 'Geometria',
  performance2: 'Rendimiento',
  losses2: 'Perdidas',
  meridionalView: 'Meridional',
  closeView: 'Cerrar',
  warningsLabel: 'AVISOS',

  // Navigation / Tabs
  navProjects: 'Proyectos',
  navCurrentProject: 'Proyecto Actual',
  tabSizing: 'Dimensionamiento',
  tabCurves: 'Curvas',
  tab3d: 'Vista 3D',
  tabVelocity: 'Velocidades',
  tabLosses: 'Perdidas',
  tabStress: 'Tensiones',
  tabCompare: 'Comparacion',
  tabAssistant: 'Asistente',
  tabLoading: 'Carga rV\u03B8*',
  tabPressure: 'Dist. PS/SS',
  tabMultiSpeed: 'Multi-Velocidad',
  tabMeridionalEditor: 'Editor Meridional',
  tabSpanwise: 'Spanwise',

  // Results
  sizingResults: 'Resultados del Dimensionamiento',
  specificSpeed: 'Velocidad Específica',
  impeller: 'Impulsor',
  performance: 'Rendimiento',
  type: 'Tipo',
  blades: 'Álabes',
  efficiency: 'Eficiencia',
  power: 'Potencia',
  warnings: 'Avisos',
  enterOperatingPoint: 'Ingrese el punto de operación y haga clic en "Ejecutar Dimensionamiento"',

  // Curves
  performanceCurves: 'Curvas de Rendimiento',

  // Velocity
  velocityTriangles: 'Triángulos de Velocidad',
  inlet: 'Entrada',
  outlet: 'Salida',
  eulerHead: 'Altura de Euler',
  noVelocityData: 'Sin datos de velocidad',

  // Losses
  lossBreakdown: 'Distribución de Pérdidas',
  profilePS: 'Perfil (LP)',
  profileSS: 'Perfil (LA)',
  tipLeakage: 'Holgura de Punta',
  endwallHub: 'Pared (Cubo)',
  endwallShroud: 'Pared (Corona)',
  mixing: 'Mezcla',
  incidence: 'Incidencia',
  recirculation: 'Recirculación',
  totalHeadLoss: 'Pérdida total de carga',
  lossCoefficient: 'Coeficiente de pérdida',
  diskFriction: 'Fricción de disco',
  lossUnavailable: 'Datos de perdida no disponibles.',

  // Stress
  structuralAnalysis: 'Análisis Estructural',
  centrifugalStress: 'Tensión Centrífuga',
  bendingStress: 'Tensión de Flexión',
  combined: 'Combinado',
  safetyFactors: 'Factores de Seguridad',
  vibration: 'Vibración',
  root: 'Raíz',
  tip: 'Punta',
  leadingEdge: 'Borde de Ataque',
  trailingEdge: 'Borde de Fuga',
  maximum: 'Máximo',
  yieldSF: 'Fluencia',
  fatigueSF: 'Fatiga',
  ultimateSF: 'Rotura',
  naturalFreq: '1a Frec. Natural',
  campbellMargin: 'Margen Campbell',
  safe: 'SEGURO',
  warning: 'ATENCIÓN',
  allSafetyOk: 'Todos los factores de seguridad dentro de los límites.',
  stressUnavailable: 'Datos de tensión no disponibles.',

  // 3D Viewer
  impeller3d: 'Impulsor 3D',
  loading3d: 'Cargando geometría 3D...',
  failed3d: 'Error al cargar geometría',
  noGeometry: 'Sin datos de geometría',
  dragToRotate: 'Arrastre para girar, scroll para zoom',
  exportSTEP: 'Exportar STEP',
  exportSTL: 'Exportar STL',

  // Comparison
  designComparison: 'Comparación de Diseños',
  add: '+ Agregar',
  runAll: 'Ejecutar Todos',

  // Assistant
  designAssistant: 'Asistente de Diseño',
  askAboutDesign: 'Pregunte sobre su diseño...',
  send: 'Enviar',
  thinking: 'Pensando...',
  assistantGreeting: '¡Hola! Puedo ayudar a analizar su diseño de bomba. Ejecute un dimensionamiento primero y luego haga preguntas.',
  runSizingFirst: 'Ejecute un análisis de dimensionamiento primero. Necesito los datos del diseño para dar consejos.',

  // Assistant responses
  assistEfficiency: (eta: string, nq: string, tip: string) =>
    `Eficiencia actual: ${eta}%. Nq=${nq}. ${tip}`,
  assistEffLow: 'Considere aumentar el número de álabes o ajustar beta2 para mejorar la eficiencia.',
  assistEffHigh: 'Excelente eficiencia. Enfóquese en mantenerla en puntos fuera de diseño.',
  assistEffGood: 'Buena eficiencia para este rango de velocidad específica.',
  assistNpsh: (npsh: string) => `NPSHr = ${npsh} m.`,
  assistNpshHigh: 'Relativamente alto. Considere reducir la velocidad de entrada o aumentar D1.',
  assistNpshOk: 'Dentro del rango normal para este tamaño de bomba.',
  assistDims: (d2: string, d1: string, b2: string, z: number) =>
    `Impulsor D2 = ${d2} mm, D1 = ${d1} mm. Ancho de salida b2 = ${b2} mm. ${z} álabes.`,
  assistAngles: (b1: string, b2: string, tip: string) =>
    `Ángulos de álabe: beta1=${b1} grados (entrada), beta2=${b2} grados (salida). ${tip}`,
  assistLowBeta2: 'Beta2 bajo -- riesgo de separación en el difusor.',
  assistAnglesOk: 'Ángulos dentro del rango típico.',
  assistNoWarnings: 'Sin avisos encontrados. Parámetros dentro de los rangos recomendados.',
  assistImproveBlades: 'Aumentar número de álabes (intente Z=7-9)',
  assistImproveBeta2: 'Aumentar beta2 para reducir pérdidas de difusión',
  assistImproveD1: 'Ampliar diámetro de ojo D1 para reducir NPSHr',
  assistAlreadyOptimized: 'El diseño ya está bien optimizado para este punto de operación',
  assistSuggestions: 'Sugerencias de mejora',
  assistSummary: (nq: string, d2: string, eta: string, z: number, npsh: string, pwr: string) =>
    `Resumen: Nq=${nq}, D2=${d2}mm, eta=${eta}%, ${z} álabes, NPSHr=${npsh}m, Potencia=${pwr}kW. Pregunte sobre eficiencia, cavitación, dimensiones o mejoras.`,

  // Save design
  saveDesign: 'Guardar en Proyecto',
  saving: 'Guardando...',
  designSaved: 'Diseno guardado!',
  saveNoProject: 'Seleccione un proyecto para guardar',

  // Errors
  somethingWentWrong: 'Algo salio mal',
  unexpectedError: 'Ocurrio un error inesperado',
  tryAgain: 'Intentar de Nuevo',
}

export default t
