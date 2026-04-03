/** Traduções PT-BR para o HPE frontend. */

const t = {
  // App
  appName: 'Higra Pump Engine',
  appDesc: 'Plataforma de projeto de turbomáquinas hidráulicas',
  logout: 'Sair',
  user: 'Usuário',

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
  alreadyHaveAccount: 'Já tem conta? Entre',
  noAccount: 'Não tem conta? Registre-se',
  skipLogin: 'Pular login (modo dev)',

  // Projects
  projects: 'Projetos',
  newProject: '+ Novo Projeto',
  quickDesign: 'Projeto Rápido',
  projectName: 'Nome do projeto',
  descriptionOptional: 'Descrição (opcional)',
  create: 'Criar',
  creating: 'Criando...',
  noProjectsYet: 'Nenhum projeto ainda. Crie um ou use Projeto Rápido.',
  designs: 'projetos',

  // Sizing Form
  operatingPoint: 'Ponto de Operação',
  flowRate: 'Vazão Q [m³/h]',
  head: 'Altura H [m]',
  speed: 'Rotação n [rpm]',
  runSizing: 'Executar Dimensionamento',
  computing: 'Calculando...',

  // Sizing Form — machine / fluid / advanced (FX1)
  machineType: 'TIPO DE MÁQUINA',
  fluid: 'FLUIDO',
  operatingPointLabel: 'PONTO DE OPERAÇÃO',
  quickExamples: 'Exemplos rápidos:',
  advancedOptions: 'Opções Avançadas',
  tipClearance: 'Folga de topo [mm]',
  roughness: 'Rugosidade Ra [μm]',
  overrideD2: 'Sobreposição D2 [mm]',
  overrideB2: 'Sobreposição b2 [mm]',
  automatic: 'Automático',
  flowRateLabel: 'Vazão Q',
  headLabel: 'Altura Total H [m]',
  rpmLabel: 'Rotação n [rpm]',

  // Results — status panel (FX2-FX3)
  projectStatus: 'STATUS DO PROJETO',
  deHaller: 'De Haller',
  peripheralSpeed: 'Vel. periférica u2',
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
  tab3d: 'Visualização 3D',
  tabVelocity: 'Velocidades',
  tabLosses: 'Perdas',
  tabStress: 'Tensões',
  tabCompare: 'Comparação',
  tabAssistant: 'Assistente',
  tabLoading: 'Carregamento rVθ*',
  tabPressure: 'Dist. PS/SS',
  tabMultiSpeed: 'Multi-Velocidade',
  tabMeridionalEditor: 'Editor Meridional',
  tabSpanwise: 'Spanwise',

  // Results
  sizingResults: 'Resultados do Dimensionamento',
  specificSpeed: 'Velocidade Específica',
  impeller: 'Rotor',
  performance: 'Desempenho',
  type: 'Tipo',
  blades: 'Pás',
  efficiency: 'Rendimento',
  power: 'Potência',
  warnings: 'Avisos',
  enterOperatingPoint: 'Informe o ponto de operação e clique em "Executar Dimensionamento"',

  // Curves
  performanceCurves: 'Curvas de Desempenho',

  // Velocity
  velocityTriangles: 'Triângulos de Velocidade',
  inlet: 'Entrada',
  outlet: 'Saída',
  eulerHead: 'Altura de Euler',
  noVelocityData: 'Sem dados de velocidade',

  // Losses
  lossBreakdown: 'Distribuição de Perdas',
  profilePS: 'Perfil (LP)',
  profileSS: 'Perfil (LA)',
  tipLeakage: 'Folga de Topo',
  endwallHub: 'Parede (Cubo)',
  endwallShroud: 'Parede (Coroa)',
  mixing: 'Mistura',
  incidence: 'Incidência',
  recirculation: 'Recirculação',
  totalHeadLoss: 'Perda total de carga',
  lossCoefficient: 'Coeficiente de perda',
  diskFriction: 'Atrito de disco',
  lossUnavailable: 'Dados de perda indisponíveis.',

  // Stress
  structuralAnalysis: 'Análise Estrutural',
  centrifugalStress: 'Tensão Centrífuga',
  bendingStress: 'Tensão de Flexão',
  combined: 'Combinado',
  safetyFactors: 'Fatores de Segurança',
  vibration: 'Vibração',
  root: 'Raiz',
  tip: 'Ponta',
  leadingEdge: 'Bordo de Ataque',
  trailingEdge: 'Bordo de Fuga',
  maximum: 'Máximo',
  yieldSF: 'Escoamento',
  fatigueSF: 'Fadiga',
  ultimateSF: 'Ruptura',
  naturalFreq: '1ª Freq. Natural',
  campbellMargin: 'Margem Campbell',
  safe: 'SEGURO',
  warning: 'ATENÇÃO',
  allSafetyOk: 'Todos os fatores de segurança dentro dos limites.',
  stressUnavailable: 'Dados de tensão indisponíveis.',

  // 3D Viewer
  impeller3d: 'Rotor 3D',
  loading3d: 'Carregando geometria 3D...',
  failed3d: 'Falha ao carregar geometria',
  noGeometry: 'Sem dados de geometria',
  dragToRotate: 'Arraste para girar, scroll para zoom',
  exportSTEP: 'Exportar STEP',
  exportSTL: 'Exportar STL',

  // Comparison
  designComparison: 'Comparação de Projetos',
  add: '+ Adicionar',
  runAll: 'Executar Todos',

  // Assistant
  designAssistant: 'Assistente de Projeto',
  askAboutDesign: 'Pergunte sobre seu projeto...',
  send: 'Enviar',
  thinking: 'Pensando...',
  assistantGreeting: 'Olá! Posso ajudar a analisar seu projeto de bomba. Execute um dimensionamento primeiro e depois faça perguntas.',
  runSizingFirst: 'Execute uma análise de dimensionamento primeiro. Preciso dos dados do projeto para dar conselhos.',

  // Assistant responses
  assistEfficiency: (eta: string, nq: string, tip: string) =>
    `Rendimento atual: ${eta}%. Nq=${nq}. ${tip}`,
  assistEffLow: 'Considere aumentar o número de pás ou ajustar beta2 para melhorar o rendimento.',
  assistEffHigh: 'Excelente rendimento. Foque em manter isso nos pontos fora de projeto.',
  assistEffGood: 'Bom rendimento para essa faixa de velocidade específica.',
  assistNpsh: (npsh: string) => `NPSHr = ${npsh} m.`,
  assistNpshHigh: 'Relativamente alto. Considere reduzir a velocidade de entrada ou aumentar D1.',
  assistNpshOk: 'Dentro da faixa normal para este porte de bomba.',
  assistDims: (d2: string, d1: string, b2: string, z: number) =>
    `Rotor D2 = ${d2} mm, D1 = ${d1} mm. Largura de saída b2 = ${b2} mm. ${z} pás.`,
  assistAngles: (b1: string, b2: string, tip: string) =>
    `Ângulos de pá: beta1=${b1} graus (entrada), beta2=${b2} graus (saída). ${tip}`,
  assistLowBeta2: 'Beta2 baixo — risco de separação no difusor.',
  assistAnglesOk: 'Ângulos dentro da faixa típica.',
  assistNoWarnings: 'Nenhum aviso encontrado. Parâmetros dentro das faixas recomendadas.',
  assistImproveBlades: 'Aumentar número de pás (tente Z=7-9)',
  assistImproveBeta2: 'Aumentar beta2 para reduzir perdas de difusão',
  assistImproveD1: 'Ampliar olho de entrada D1 para reduzir NPSHr',
  assistAlreadyOptimized: 'Projeto já está bem otimizado para este ponto de operação',
  assistSuggestions: 'Sugestões de melhoria',
  assistSummary: (nq: string, d2: string, eta: string, z: number, npsh: string, pwr: string) =>
    `Resumo: Nq=${nq}, D2=${d2}mm, eta=${eta}%, ${z} pás, NPSHr=${npsh}m, Potência=${pwr}kW. Pergunte sobre rendimento, cavitação, dimensões ou melhorias.`,

  // Save design
  saveDesign: 'Salvar no Projeto',
  saving: 'Salvando...',
  designSaved: 'Design salvo!',
  saveNoProject: 'Selecione um projeto para salvar',

  // Errors
  somethingWentWrong: 'Algo deu errado',
  unexpectedError: 'Ocorreu um erro inesperado',
  tryAgain: 'Tentar Novamente',
}

export default t
