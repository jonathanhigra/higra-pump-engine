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
  machineType: 'TIPO DE MAQUINA',
  fluid: 'FLUIDO',
  operatingPointLabel: 'PUNTO DE OPERACION',
  quickExamples: 'Ejemplos rapidos:',
  advancedOptions: 'Opciones Avanzadas',
  tipClearance: 'Holgura de punta [mm]',
  roughness: 'Rugosidad Ra [\u03BCm]',
  overrideD2: 'Sobreescribir D2 [mm]',
  overrideB2: 'Sobreescribir b2 [mm]',
  automatic: 'Automatico',
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
  specificSpeed: 'Velocidad Especifica',
  impeller: 'Impulsor',
  performance: 'Rendimiento',
  type: 'Tipo',
  blades: 'Alabes',
  efficiency: 'Eficiencia',
  power: 'Potencia',
  warnings: 'Avisos',
  enterOperatingPoint: 'Ingrese el punto de operacion y haga clic en "Ejecutar Dimensionamiento"',

  // Curves
  performanceCurves: 'Curvas de Rendimiento',

  // Velocity
  velocityTriangles: 'Triangulos de Velocidad',
  inlet: 'Entrada',
  outlet: 'Salida',
  eulerHead: 'Altura de Euler',
  noVelocityData: 'Sin datos de velocidad',

  // Losses
  lossBreakdown: 'Distribucion de Perdidas',
  profilePS: 'Perfil (LP)',
  profileSS: 'Perfil (LA)',
  tipLeakage: 'Holgura de Punta',
  endwallHub: 'Pared (Cubo)',
  endwallShroud: 'Pared (Corona)',
  mixing: 'Mezcla',
  incidence: 'Incidencia',
  recirculation: 'Recirculacion',
  totalHeadLoss: 'Perdida total de carga',
  lossCoefficient: 'Coeficiente de perdida',
  diskFriction: 'Friccion de disco',
  lossUnavailable: 'Datos de perdida no disponibles.',

  // Stress
  structuralAnalysis: 'Analisis Estructural',
  centrifugalStress: 'Tension Centrifuga',
  bendingStress: 'Tension de Flexion',
  combined: 'Combinado',
  safetyFactors: 'Factores de Seguridad',
  vibration: 'Vibracion',
  root: 'Raiz',
  tip: 'Punta',
  leadingEdge: 'Borde de Ataque',
  trailingEdge: 'Borde de Fuga',
  maximum: 'Maximo',
  yieldSF: 'Fluencia',
  fatigueSF: 'Fatiga',
  ultimateSF: 'Rotura',
  naturalFreq: '1a Frec. Natural',
  campbellMargin: 'Margen Campbell',
  safe: 'SEGURO',
  warning: 'ATENCION',
  allSafetyOk: 'Todos los factores de seguridad dentro de los limites.',
  stressUnavailable: 'Datos de tension no disponibles.',

  // 3D Viewer
  impeller3d: 'Impulsor 3D',
  loading3d: 'Cargando geometria 3D...',
  failed3d: 'Error al cargar geometria',
  noGeometry: 'Sin datos de geometria',
  dragToRotate: 'Arrastre para girar, scroll para zoom',
  exportSTEP: 'Exportar STEP',
  exportSTL: 'Exportar STL',

  // Comparison
  designComparison: 'Comparacion de Disenos',
  add: '+ Agregar',
  runAll: 'Ejecutar Todos',

  // Assistant
  designAssistant: 'Asistente de Diseno',
  askAboutDesign: 'Pregunte sobre su diseno...',
  send: 'Enviar',
  thinking: 'Pensando...',
  assistantGreeting: 'Hola! Puedo ayudar a analizar su diseno de bomba. Ejecute un dimensionamiento primero y luego haga preguntas.',
  runSizingFirst: 'Ejecute un analisis de dimensionamiento primero. Necesito los datos del diseno para dar consejos.',

  // Assistant responses
  assistEfficiency: (eta: string, nq: string, tip: string) =>
    `Eficiencia actual: ${eta}%. Nq=${nq}. ${tip}`,
  assistEffLow: 'Considere aumentar el numero de alabes o ajustar beta2 para mejorar la eficiencia.',
  assistEffHigh: 'Excelente eficiencia. Enfoquese en mantenerla en puntos fuera de diseno.',
  assistEffGood: 'Buena eficiencia para este rango de velocidad especifica.',
  assistNpsh: (npsh: string) => `NPSHr = ${npsh} m.`,
  assistNpshHigh: 'Relativamente alto. Considere reducir la velocidad de entrada o aumentar D1.',
  assistNpshOk: 'Dentro del rango normal para este tamano de bomba.',
  assistDims: (d2: string, d1: string, b2: string, z: number) =>
    `Impulsor D2 = ${d2} mm, D1 = ${d1} mm. Ancho de salida b2 = ${b2} mm. ${z} alabes.`,
  assistAngles: (b1: string, b2: string, tip: string) =>
    `Angulos de alabe: beta1=${b1} grados (entrada), beta2=${b2} grados (salida). ${tip}`,
  assistLowBeta2: 'Beta2 bajo -- riesgo de separacion en el difusor.',
  assistAnglesOk: 'Angulos dentro del rango tipico.',
  assistNoWarnings: 'Sin avisos encontrados. Parametros dentro de los rangos recomendados.',
  assistImproveBlades: 'Aumentar numero de alabes (intente Z=7-9)',
  assistImproveBeta2: 'Aumentar beta2 para reducir perdidas de difusion',
  assistImproveD1: 'Ampliar diametro de ojo D1 para reducir NPSHr',
  assistAlreadyOptimized: 'El diseno ya esta bien optimizado para este punto de operacion',
  assistSuggestions: 'Sugerencias de mejora',
  assistSummary: (nq: string, d2: string, eta: string, z: number, npsh: string, pwr: string) =>
    `Resumen: Nq=${nq}, D2=${d2}mm, eta=${eta}%, ${z} alabes, NPSHr=${npsh}m, Potencia=${pwr}kW. Pregunte sobre eficiencia, cavitacion, dimensiones o mejoras.`,

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
