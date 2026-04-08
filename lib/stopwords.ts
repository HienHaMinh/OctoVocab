// Common English stop words — filtered out during vocabulary extraction
// These are function words and very basic words not useful for vocab learning

export const STOP_WORDS = new Set([
  // Articles
  'a', 'an', 'the',
  // Pronouns
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
  'you', 'your', 'yours', 'yourself', 'yourselves',
  'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  // Conjunctions
  'and', 'but', 'or', 'nor', 'for', 'yet', 'so',
  'although', 'because', 'since', 'unless', 'until', 'while',
  'although', 'though', 'even', 'if', 'when', 'where', 'whether',
  // Prepositions
  'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'to', 'up',
  'with', 'about', 'above', 'after', 'against', 'along', 'among',
  'around', 'before', 'behind', 'below', 'beneath', 'beside', 'between',
  'beyond', 'during', 'except', 'inside', 'near', 'off', 'out',
  'outside', 'over', 'past', 'through', 'throughout', 'under',
  'underneath', 'until', 'upon', 'within', 'without',
  // Auxiliary verbs
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing',
  'will', 'would', 'shall', 'should', 'may', 'might', 'must',
  'can', 'could', 'need', 'dare', 'ought', 'used',
  // Common adverbs
  'not', 'no', 'nor', 'also', 'just', 'then', 'than', 'so', 'very',
  'here', 'there', 'where', 'now', 'only', 'same', 'too', 'both',
  'each', 'few', 'more', 'most', 'other', 'some', 'such',
  // Numbers and basic quantifiers
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'first', 'second', 'third',
  'all', 'any', 'every', 'either', 'neither', 'much', 'many',
  // Other common words
  'as', 'well', 'like', 'how', 'why', 'new', 'old', 'good', 'long',
  'little', 'own', 'right', 'still', 'back', 'way', 'even',
  'never', 'always', 'often', 'already', 'again', 'once',
  'something', 'anything', 'everything', 'nothing', 'someone',
  'anyone', 'everyone', 'nobody', 'somebody', 'whose',
])

// Minimum word length (shorter words usually not useful vocab)
export const MIN_WORD_LENGTH = 3

// Check if a token should be filtered out
export function isStopWord(word: string): boolean {
  return STOP_WORDS.has(word.toLowerCase())
}

// Check if a string looks like a real word (not number, symbol, etc.)
export function isRealWord(token: string): boolean {
  // Must contain at least one letter
  if (!/[a-zA-Z]/.test(token)) return false
  // Must meet minimum length
  if (token.length < MIN_WORD_LENGTH) return false
  // Must not be all numbers
  if (/^\d+$/.test(token)) return false
  // Must not contain special characters (except hyphens in compound words)
  if (/[^a-zA-Z'-]/.test(token)) return false
  // Must not start/end with hyphen
  if (token.startsWith('-') || token.endsWith('-')) return false
  return true
}
