import type { CefrLevel } from '@/types'

// ============================================================================
// CEFR WORD LISTS
// These are representative samples. For production, replace with comprehensive
// lists (e.g., Oxford 3000, Cambridge English Vocabulary Profile).
// ============================================================================

// A1 — Absolute beginner (most common 500 words)
const A1_WORDS = new Set([
  'hello', 'goodbye', 'yes', 'no', 'please', 'thank', 'sorry', 'excuse',
  'name', 'school', 'family', 'friend', 'house', 'home', 'food', 'water',
  'book', 'table', 'chair', 'door', 'window', 'floor', 'room', 'bed',
  'cat', 'dog', 'fish', 'bird', 'tree', 'flower', 'sun', 'moon', 'star',
  'red', 'blue', 'green', 'yellow', 'white', 'black', 'big', 'small',
  'happy', 'sad', 'hot', 'cold', 'fast', 'slow', 'eat', 'drink', 'sleep',
  'walk', 'run', 'jump', 'sit', 'stand', 'see', 'hear', 'speak', 'read',
  'write', 'come', 'go', 'give', 'take', 'want', 'like', 'love', 'know',
  'day', 'night', 'morning', 'afternoon', 'evening', 'week', 'month', 'year',
  'boy', 'girl', 'man', 'woman', 'baby', 'child', 'mother', 'father',
  'sister', 'brother', 'teacher', 'student', 'doctor', 'city', 'country',
  'street', 'shop', 'park', 'school', 'hospital', 'restaurant', 'hotel',
  'car', 'bus', 'train', 'plane', 'ticket', 'money', 'price', 'time',
  'number', 'color', 'weather', 'rain', 'snow', 'wind', 'hot', 'cold',
])

// A2 — Elementary
const A2_WORDS = new Set([
  'afternoon', 'airport', 'animals', 'apartment', 'beach', 'beautiful',
  'breakfast', 'business', 'careful', 'celebrate', 'cinema', 'clothes',
  'comfortable', 'computer', 'correct', 'dangerous', 'decide', 'different',
  'difficult', 'direction', 'discover', 'discuss', 'distance', 'dream',
  'driver', 'education', 'enjoy', 'environment', 'especially', 'example',
  'exercise', 'explain', 'factory', 'famous', 'festival', 'foreign',
  'future', 'garden', 'healthy', 'heavy', 'holiday', 'hospital', 'hungry',
  'imagine', 'important', 'interesting', 'journey', 'language', 'library',
  'market', 'married', 'meeting', 'message', 'modern', 'mountain', 'museum',
  'music', 'natural', 'necessary', 'neighbor', 'newspaper', 'normal',
  'office', 'outside', 'patient', 'perhaps', 'photograph', 'popular',
  'possible', 'practice', 'prefer', 'prepare', 'problem', 'probably',
  'program', 'project', 'promise', 'public', 'question', 'quickly',
  'realize', 'receive', 'recent', 'remember', 'repeat', 'report',
  'science', 'season', 'simple', 'special', 'sport', 'station', 'story',
  'summer', 'surprise', 'swimming', 'telephone', 'television', 'terrible',
  'together', 'tomorrow', 'tourist', 'traffic', 'travel', 'trouble',
  'typical', 'understand', 'university', 'usually', 'vacation', 'village',
  'visitor', 'welcome', 'wonderful', 'yesterday',
])

// B1 — Intermediate
const B1_WORDS = new Set([
  'absolutely', 'academic', 'achieve', 'acknowledge', 'acquire', 'adapt',
  'adequate', 'adjust', 'administration', 'advantage', 'affect', 'agreement',
  'alternative', 'analysis', 'annual', 'apparently', 'approach', 'appropriate',
  'approximately', 'argument', 'assessment', 'assist', 'atmosphere', 'attitude',
  'authority', 'available', 'awareness', 'challenge', 'circumstances',
  'communicate', 'community', 'compete', 'complaint', 'complex', 'concentrate',
  'conclusion', 'confident', 'considerable', 'consist', 'contribution',
  'convenient', 'convince', 'cooperative', 'corruption', 'creative',
  'culture', 'deadline', 'democracy', 'depend', 'description', 'despite',
  'develop', 'discipline', 'dispute', 'distribute', 'diverse', 'economy',
  'effective', 'efficient', 'emotion', 'emphasis', 'encourage', 'establish',
  'evaluate', 'evidence', 'examine', 'experience', 'express', 'extend',
  'feature', 'flexible', 'focus', 'foundation', 'frequent', 'furthermore',
  'generate', 'global', 'guarantee', 'guidance', 'identify', 'immediately',
  'improvement', 'independent', 'indicate', 'influence', 'information',
  'inspire', 'institution', 'intention', 'introduce', 'investigate',
  'involved', 'knowledge', 'leadership', 'legislation', 'maintain',
  'management', 'meanwhile', 'negotiate', 'numerous', 'objective',
  'opportunity', 'organize', 'outcome', 'overcome', 'participate',
  'particular', 'performance', 'perspective', 'physical', 'policy',
  'potential', 'practical', 'process', 'produce', 'profession', 'prove',
  'psychological', 'purpose', 'quality', 'recognize', 'reduce', 'reflect',
  'relationship', 'relevant', 'represent', 'require', 'research', 'resolve',
  'resource', 'responsibility', 'result', 'revolution', 'role', 'significant',
  'situation', 'society', 'solution', 'source', 'specific', 'strategy',
  'structure', 'success', 'suggest', 'support', 'technology', 'theory',
  'therefore', 'traditional', 'treatment', 'unemployment', 'various',
])

// B2 — Upper intermediate
const B2_WORDS = new Set([
  'ambiguous', 'ambivalent', 'anomaly', 'anticipate', 'arbitrary',
  'assumption', 'autonomous', 'bias', 'capacity', 'circumstantial',
  'coherent', 'collaborate', 'competence', 'comprehensive', 'conceive',
  'conceptual', 'constraint', 'contradict', 'controversial', 'convention',
  'correlation', 'cynical', 'deduce', 'deliberate', 'demonstrate',
  'derive', 'discrimination', 'distinguish', 'elaborate', 'eliminate',
  'empirical', 'endorse', 'enhance', 'ethical', 'evaluate', 'evident',
  'explicit', 'facilitate', 'fluctuate', 'formulate', 'framework',
  'fundamental', 'generate', 'hierarchical', 'hypothetical', 'implement',
  'implicit', 'incentive', 'inference', 'inherent', 'initiative',
  'integrity', 'interaction', 'justify', 'legitimate', 'manipulate',
  'mechanism', 'methodology', 'minimize', 'moderate', 'monitor',
  'motivation', 'mutual', 'nevertheless', 'nonetheless', 'notion',
  'objective', 'obstacle', 'parameter', 'perspective', 'phenomenon',
  'pragmatic', 'preliminary', 'prevalent', 'principle', 'prioritize',
  'profound', 'prohibit', 'proportion', 'rational', 'reinforce',
  'reliable', 'reluctant', 'restrict', 'retain', 'significant',
  'sophisticated', 'spectrum', 'stabilize', 'standardize', 'stimulate',
  'subordinate', 'substantial', 'sufficient', 'supplement', 'sustain',
  'systematic', 'tendency', 'terminate', 'tolerance', 'transition',
  'transparent', 'ultimately', 'undermine', 'universal', 'validate',
  'variable', 'versatile', 'volatile', 'vulnerable', 'widespread',
])

// C1 — Advanced
const C1_WORDS = new Set([
  'ameliorate', 'articulate', 'assiduous', 'assimilate', 'attenuate',
  'audacious', 'bolster', 'burgeon', 'catalyst', 'circumspect',
  'clandestine', 'cogent', 'collateral', 'commensurate', 'compel',
  'concede', 'confound', 'contemplate', 'contiguous', 'convey',
  'corroborate', 'culminate', 'debilitate', 'dearth', 'delineate',
  'denounce', 'deprecate', 'derivative', 'dichotomy', 'discern',
  'discourse', 'disparate', 'disseminate', 'diverge', 'doctrine',
  'dubious', 'elicit', 'eloquent', 'emulate', 'encompass', 'entail',
  'enumerate', 'epitome', 'equivocal', 'eradicate', 'exacerbate',
  'exert', 'exorbitant', 'expedite', 'explicit', 'exploit', 'exponent',
  'fabricate', 'fathom', 'feasible', 'fervent', 'flourish', 'foment',
  'forthcoming', 'fragmented', 'galvanize', 'grapple', 'hegemony',
  'heuristic', 'illuminate', 'impede', 'impending', 'incessant',
  'incite', 'indeterminate', 'ineffable', 'infiltrate', 'innate',
  'intermittent', 'intrinsic', 'invoke', 'irrevocable', 'mandate',
  'meticulous', 'mitigate', 'nuance', 'obsolete', 'oscillate',
  'ostensibly', 'paradigm', 'perpetuate', 'pervasive', 'pivotal',
  'plausible', 'polarize', 'postulate', 'preclude', 'preliminary',
  'presumptuous', 'proliferate', 'protracted', 'provoke', 'reconcile',
  'redundant', 'relegate', 'repercussion', 'resilient', 'reticent',
  'rhetoric', 'rigorous', 'scrutinize', 'seminal', 'skeptical',
  'stagnant', 'stipulate', 'stringent', 'subjugate', 'succinct',
  'superfluous', 'suppress', 'tenacious', 'tentative', 'transcend',
  'ubiquitous', 'underpin', 'unequivocal', 'unprecedented', 'unravel',
  'vehement', 'vindicate', 'wield',
])

// C2 — Proficiency/near-native
const C2_WORDS = new Set([
  'abstruse', 'acrimony', 'alacrity', 'anachronism', 'anathema',
  'antithesis', 'apotheosis', 'arcane', 'assiduous', 'atavistic',
  'bellicose', 'bifurcate', 'blandishment', 'byzantine', 'cacophony',
  'capitulate', 'caustic', 'circumlocution', 'cogitate', 'compunction',
  'contumacious', 'cupidity', 'decimate', 'demagogue', 'denouement',
  'desultory', 'diaphanous', 'diffidence', 'dilettante', 'dissonance',
  'ebullient', 'edification', 'effete', 'egregious', 'enervate',
  'ephemeral', 'equanimity', 'equivocate', 'erudite', 'etiolate',
  'excoriate', 'expunge', 'fastidious', 'fatuous', 'fecund',
  'festinate', 'flummox', 'garrulous', 'grandiloquent', 'hedonism',
  'imperious', 'impervious', 'impugn', 'inchoate', 'incorrigible',
  'indolent', 'ineluctable', 'inimical', 'insidious', 'intractable',
  'inveterate', 'laconic', 'loquacious', 'machiavellian', 'malevolent',
  'mendacious', 'mercurial', 'misanthrope', 'modicum', 'myriad',
  'nadir', 'nefarious', 'neologism', 'nihilism', 'nonchalance',
  'obdurate', 'obsequious', 'obtuse', 'odious', 'ominous', 'onerous',
  'opprobrium', 'ostracize', 'panacea', 'panache', 'paucity',
  'pedantic', 'penchant', 'penury', 'perfidious', 'perspicacious',
  'phlegmatic', 'platitude', 'plethora', 'polemical', 'portentous',
  'precipitate', 'prevaricate', 'proscribe', 'punctilious', 'pugnacious',
  'querulous', 'quixotic', 'rancor', 'rebuke', 'recalcitrant',
  'recidivism', 'recondite', 'remonstrate', 'repudiate', 'reticent',
  'sagacious', 'sanguine', 'sardonic', 'saturnine', 'sycophant',
  'tendentious', 'terse', 'timorous', 'torpor', 'truculent',
  'turpitude', 'umbrage', 'venal', 'veneration', 'veracity',
  'verbose', 'vicissitude', 'virulent', 'vitiate', 'vociferous',
  'voluble', 'wanton', 'zealous', 'zenith',
])

// ============================================================================
// CLASSIFICATION FUNCTION
// ============================================================================

export function classifyWordBuiltin(word: string): CefrLevel | null {
  const w = word.toLowerCase().trim()

  if (A1_WORDS.has(w)) return 'A1'
  if (A2_WORDS.has(w)) return 'A2'
  if (B1_WORDS.has(w)) return 'B1'
  if (B2_WORDS.has(w)) return 'B2'
  if (C1_WORDS.has(w)) return 'C1'
  if (C2_WORDS.has(w)) return 'C2'

  return null // Not found — needs AI fallback
}

export function getCefrColor(level: CefrLevel): string {
  switch (level) {
    case 'A1': return 'bg-green-100 text-green-800'
    case 'A2': return 'bg-emerald-100 text-emerald-800'
    case 'B1': return 'bg-blue-100 text-blue-800'
    case 'B2': return 'bg-indigo-100 text-indigo-800'
    case 'C1': return 'bg-purple-100 text-purple-800'
    case 'C2': return 'bg-red-100 text-red-800'
    case 'Unclassified': return 'bg-gray-100 text-gray-600'
  }
}

export const CEFR_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Unclassified']
