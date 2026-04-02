/** Traducoes PT-BR para o HPE frontend. */

const t = {
  // App
  appName: 'Higra Pump Engine',
  appDesc: 'Plataforma de projeto de turbomaquinas hidraulicas',
  logout: 'Sair',
  user: 'Usuario',

  // Login
  signIn: 'Entrar na sua conta',
  createAccount: 'Criar sua conta',
  name: 'Nome',
  company: 'Empresa',
  email: 'Email',
  password: 'Senha',
  signInBtn: 'Entrar',
  createAccountBtn: 'Criar Conta',
  pleaseWait: 'Aguarde...',
  alreadyHaveAccount: 'Ja tem conta? Entre',
  noAccount: 'Nao tem conta? Registre-se',
  skipLogin: 'Pular login (modo dev)',

  // Projects
  projects: 'Projetos',
  newProject: '+ Novo Projeto',
  quickDesign: 'Projeto Rapido',
  projectName: 'Nome do projeto',
  descriptionOptional: 'Descricao (opcional)',
  create: 'Criar',
  creating: 'Criando...',
  noProjectsYet: 'Nenhum projeto ainda. Crie um ou use Projeto Rapido.',
  designs: 'projetos',

  // Sizing Form
  operatingPoint: 'Ponto de Operacao',
  flowRate: 'Vazao Q [m3/h]',
  head: 'Altura H [m]',
  speed: 'Rotacao n [rpm]',
  runSizing: 'Executar Dimensionamento',
  computing: 'Calculando...',

  // Sizing Form — machine / fluid / advanced (FX1)
  machineType: 'TIPO DE MAQUINA',
  fluid: 'FLUIDO',
  operatingPointLabel: 'PONTO DE OPERACAO',
  quickExamples: 'Exemplos rapidos:',
  advancedOptions: 'Opcoes Avancadas',
  tipClearance: 'Folga de topo [mm]',
  roughness: 'Rugosidade Ra [um]',
  overrideD2: 'Sobreposicao D2 [mm]',
  overrideB2: 'Sobreposicao b2 [mm]',
  automatic: 'Automatico',
  flowRateLabel: 'Vazao Q',
  headLabel: 'Altura Total H [m]',
  rpmLabel: 'Rotacao n [rpm]',

  // Results — status panel (FX2-FX3)
  projectStatus: 'STATUS DO PROJETO',
  deHaller: 'De Haller',
  peripheralSpeed: 'Vel. periferica u2',
  pmin: 'Pmin',
  geometry: 'Geometria',
  performance2: 'Desempenho',
  losses2: 'Perdas',
  meridionalView: 'Meridional',
  closeView: 'Fechar',
  warningsLabel: 'AVISOS',

  // Navigation / Tabs
  navProjects: 'Projetos',
  navCurrentProject: 'Projeto Atual',
  tabSizing: 'Dimensionamento',
  tabCurves: 'Curvas',
  tab3d: 'Visualizacao 3D',
  tabVelocity: 'Velocidades',
  tabLosses: 'Perdas',
  tabStress: 'Tensoes',
  tabCompare: 'Comparacao',
  tabAssistant: 'Assistente',
  tabLoading: 'Carregamento rVθ*',
  tabPressure: 'Dist. PS/SS',
  tabMultiSpeed: 'Multi-Velocidade',
  tabMeridionalEditor: 'Editor Meridional',
  tabSpanwise: 'Spanwise',

  // Results
  sizingResults: 'Resultados do Dimensionamento',
  specificSpeed: 'Velocidade Especifica',
  impeller: 'Rotor',
  performance: 'Desempenho',
  type: 'Tipo',
  blades: 'Pas',
  efficiency: 'Rendimento',
  power: 'Potencia',
  warnings: 'Avisos',
  enterOperatingPoint: 'Informe o ponto de operacao e clique em "Executar Dimensionamento"',

  // Curves
  performanceCurves: 'Curvas de Desempenho',

  // Velocity
  velocityTriangles: 'Triangulos de Velocidade',
  inlet: 'Entrada',
  outlet: 'Saida',
  eulerHead: 'Altura de Euler',
  noVelocityData: 'Sem dados de velocidade',

  // Losses
  lossBreakdown: 'Distribuicao de Perdas',
  profilePS: 'Perfil (LP)',
  profileSS: 'Perfil (LA)',
  tipLeakage: 'Folga de Topo',
  endwallHub: 'Parede (Cubo)',
  endwallShroud: 'Parede (Coroa)',
  mixing: 'Mistura',
  incidence: 'Incidencia',
  recirculation: 'Recirculacao',
  totalHeadLoss: 'Perda total de carga',
  lossCoefficient: 'Coeficiente de perda',
  diskFriction: 'Atrito de disco',
  lossUnavailable: 'Dados de perda indisponiveis.',

  // Stress
  structuralAnalysis: 'Analise Estrutural',
  centrifugalStress: 'Tensao Centrifuga',
  bendingStress: 'Tensao de Flexao',
  combined: 'Combinado',
  safetyFactors: 'Fatores de Seguranca',
  vibration: 'Vibracao',
  root: 'Raiz',
  tip: 'Ponta',
  leadingEdge: 'Bordo de Ataque',
  trailingEdge: 'Bordo de Fuga',
  maximum: 'Maximo',
  yieldSF: 'Escoamento',
  fatigueSF: 'Fadiga',
  ultimateSF: 'Ruptura',
  naturalFreq: '1a Freq. Natural',
  campbellMargin: 'Margem Campbell',
  safe: 'SEGURO',
  warning: 'ATENCAO',
  allSafetyOk: 'Todos os fatores de seguranca dentro dos limites.',
  stressUnavailable: 'Dados de tensao indisponiveis.',

  // 3D Viewer
  impeller3d: 'Rotor 3D',
  loading3d: 'Carregando geometria 3D...',
  failed3d: 'Falha ao carregar geometria',
  noGeometry: 'Sem dados de geometria',
  dragToRotate: 'Arraste para girar, scroll para zoom',
  exportSTEP: 'Exportar STEP',
  exportSTL: 'Exportar STL',

  // Comparison
  designComparison: 'Comparacao de Projetos',
  add: '+ Adicionar',
  runAll: 'Executar Todos',

  // Assistant
  designAssistant: 'Assistente de Projeto',
  askAboutDesign: 'Pergunte sobre seu projeto...',
  send: 'Enviar',
  thinking: 'Pensando...',
  assistantGreeting: 'Ola! Posso ajudar a analisar seu projeto de bomba. Execute um dimensionamento primeiro e depois faca perguntas.',
  runSizingFirst: 'Execute uma analise de dimensionamento primeiro. Preciso dos dados do projeto para dar conselhos.',

  // Assistant responses
  assistEfficiency: (eta: string, nq: string, tip: string) =>
    `Rendimento atual: ${eta}%. Nq=${nq}. ${tip}`,
  assistEffLow: 'Considere aumentar o numero de pas ou ajustar beta2 para melhorar o rendimento.',
  assistEffHigh: 'Excelente rendimento. Foque em manter isso nos pontos fora de projeto.',
  assistEffGood: 'Bom rendimento para essa faixa de velocidade especifica.',
  assistNpsh: (npsh: string) => `NPSHr = ${npsh} m.`,
  assistNpshHigh: 'Relativamente alto. Considere reduzir a velocidade de entrada ou aumentar D1.',
  assistNpshOk: 'Dentro da faixa normal para este porte de bomba.',
  assistDims: (d2: string, d1: string, b2: string, z: number) =>
    `Rotor D2 = ${d2} mm, D1 = ${d1} mm. Largura de saida b2 = ${b2} mm. ${z} pas.`,
  assistAngles: (b1: string, b2: string, tip: string) =>
    `Angulos de pa: beta1=${b1} graus (entrada), beta2=${b2} graus (saida). ${tip}`,
  assistLowBeta2: 'Beta2 baixo — risco de separacao no difusor.',
  assistAnglesOk: 'Angulos dentro da faixa tipica.',
  assistNoWarnings: 'Nenhum aviso encontrado. Parametros dentro das faixas recomendadas.',
  assistImproveBlades: 'Aumentar numero de pas (tente Z=7-9)',
  assistImproveBeta2: 'Aumentar beta2 para reduzir perdas de difusao',
  assistImproveD1: 'Ampliar olho de entrada D1 para reduzir NPSHr',
  assistAlreadyOptimized: 'Projeto ja esta bem otimizado para este ponto de operacao',
  assistSuggestions: 'Sugestoes de melhoria',
  assistSummary: (nq: string, d2: string, eta: string, z: number, npsh: string, pwr: string) =>
    `Resumo: Nq=${nq}, D2=${d2}mm, eta=${eta}%, ${z} pas, NPSHr=${npsh}m, Potencia=${pwr}kW. Pergunte sobre rendimento, cavitacao, dimensoes ou melhorias.`,

  // Errors
  somethingWentWrong: 'Algo deu errado',
  unexpectedError: 'Ocorreu um erro inesperado',
  tryAgain: 'Tentar Novamente',
}

export default t
