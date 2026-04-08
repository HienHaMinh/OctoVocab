// Porter Stemmer — ported for English word normalization
// Used to detect duplicate word forms (run/running/ran → run)
// Reference: https://tartarus.org/martin/PorterStemmer/

// ============================================================================
// PORTER STEMMER
// ============================================================================

function isConsonant(word: string, i: number): boolean {
  const c = word[i]
  if (c === 'a' || c === 'e' || c === 'i' || c === 'o' || c === 'u') return false
  if (c === 'y') return i === 0 || !isConsonant(word, i - 1)
  return true
}

function measure(stem: string): number {
  let count = 0
  let inVowelSeq = false
  for (let i = 0; i < stem.length; i++) {
    if (!isConsonant(stem, i)) {
      inVowelSeq = true
    } else if (inVowelSeq) {
      count++
      inVowelSeq = false
    }
  }
  return count
}

function containsVowel(stem: string): boolean {
  for (let i = 0; i < stem.length; i++) {
    if (!isConsonant(stem, i)) return true
  }
  return false
}

function endsDoubleConsonant(word: string): boolean {
  const len = word.length
  if (len < 2) return false
  if (word[len - 1] !== word[len - 2]) return false
  return isConsonant(word, len - 1)
}

function endsCVC(word: string): boolean {
  const len = word.length
  if (len < 3) return false
  const c3 = isConsonant(word, len - 1)
  const c2 = isConsonant(word, len - 2)
  const c1 = isConsonant(word, len - 3)
  if (!c3 || c2 || !c1) return false
  const last = word[len - 1]
  return last !== 'w' && last !== 'x' && last !== 'y'
}

function step1a(word: string): string {
  if (word.endsWith('sses')) return word.slice(0, -2)
  if (word.endsWith('ies')) return word.slice(0, -2)
  if (word.endsWith('ss')) return word
  if (word.endsWith('s') && word.length > 2) return word.slice(0, -1)
  return word
}

function step1b(word: string): string {
  if (word.endsWith('eed')) {
    const stem = word.slice(0, -3)
    return measure(stem) > 0 ? stem + 'ee' : word
  }
  if (word.endsWith('ed')) {
    const stem = word.slice(0, -2)
    if (containsVowel(stem)) return step1b2(stem)
    return word
  }
  if (word.endsWith('ing')) {
    const stem = word.slice(0, -3)
    if (containsVowel(stem)) return step1b2(stem)
    return word
  }
  return word
}

function step1b2(word: string): string {
  if (word.endsWith('at') || word.endsWith('bl') || word.endsWith('iz')) return word + 'e'
  if (endsDoubleConsonant(word)) {
    const last = word[word.length - 1]
    if (last !== 'l' && last !== 's' && last !== 'z') return word.slice(0, -1)
  }
  if (measure(word) === 1 && endsCVC(word)) return word + 'e'
  return word
}

function step1c(word: string): string {
  if (word.endsWith('y') && containsVowel(word.slice(0, -1))) {
    return word.slice(0, -1) + 'i'
  }
  return word
}

function step2(word: string): string {
  const replacements: [string, string][] = [
    ['ational', 'ate'], ['tional', 'tion'], ['enci', 'ence'], ['anci', 'ance'],
    ['izer', 'ize'], ['bli', 'ble'], ['alli', 'al'], ['entli', 'ent'],
    ['eli', 'e'], ['ousli', 'ous'], ['ization', 'ize'], ['ation', 'ate'],
    ['ator', 'ate'], ['alism', 'al'], ['iveness', 'ive'], ['fulness', 'ful'],
    ['ousness', 'ous'], ['aliti', 'al'], ['iviti', 'ive'], ['biliti', 'ble'],
    ['logi', 'log'],
  ]
  for (const [suffix, replacement] of replacements) {
    if (word.endsWith(suffix)) {
      const stem = word.slice(0, -suffix.length)
      if (measure(stem) > 0) return stem + replacement
    }
  }
  return word
}

function step3(word: string): string {
  const replacements: [string, string][] = [
    ['icate', 'ic'], ['ative', ''], ['alize', 'al'],
    ['iciti', 'ic'], ['ical', 'ic'], ['ful', ''], ['ness', ''],
  ]
  for (const [suffix, replacement] of replacements) {
    if (word.endsWith(suffix)) {
      const stem = word.slice(0, -suffix.length)
      if (measure(stem) > 0) return stem + replacement
    }
  }
  return word
}

function step4(word: string): string {
  const suffixes = [
    'al', 'ance', 'ence', 'er', 'ic', 'able', 'ible', 'ant', 'ement',
    'ment', 'ent', 'ou', 'ism', 'ate', 'iti', 'ous', 'ive', 'ize',
  ]
  for (const suffix of suffixes) {
    if (word.endsWith(suffix)) {
      const stem = word.slice(0, -suffix.length)
      if (measure(stem) > 1) return stem
    }
  }
  if (word.endsWith('ion')) {
    const stem = word.slice(0, -3)
    if (measure(stem) > 1 && (stem.endsWith('s') || stem.endsWith('t'))) return stem
  }
  return word
}

function step5a(word: string): string {
  if (word.endsWith('e')) {
    const stem = word.slice(0, -1)
    if (measure(stem) > 1) return stem
    if (measure(stem) === 1 && !endsCVC(stem)) return stem
  }
  return word
}

function step5b(word: string): string {
  if (measure(word) > 1 && endsDoubleConsonant(word) && word.endsWith('l')) {
    return word.slice(0, -1)
  }
  return word
}

export function stem(word: string): string {
  if (word.length <= 2) return word.toLowerCase()
  let w = word.toLowerCase()
  w = step1a(w)
  w = step1b(w)
  w = step1c(w)
  w = step2(w)
  w = step3(w)
  w = step4(w)
  w = step5a(w)
  w = step5b(w)
  return w
}

// ============================================================================
// DUPLICATE DETECTION
// ============================================================================

// Group words by their stem (to find likely duplicates)
export function groupByStem(words: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>()

  for (const word of words) {
    const wordStem = stem(word)
    if (!groups.has(wordStem)) {
      groups.set(wordStem, [])
    }
    groups.get(wordStem)!.push(word)
  }

  return groups
}

// Find word clusters that are likely duplicates (same stem, multiple forms)
export function findDuplicateClusters(words: string[]): Array<{
  stem: string
  words: string[]
}> {
  const groups = groupByStem(words)
  const clusters: Array<{ stem: string; words: string[] }> = []

  for (const [wordStem, wordList] of Array.from(groups)) {
    if (wordList.length > 1) {
      clusters.push({ stem: wordStem, words: wordList.sort() })
    }
  }

  return clusters.sort((a, b) => b.words.length - a.words.length)
}

// Suggest the canonical form from a list of word variants
// Prefers the shortest word (usually the base form)
export function suggestCanonical(words: string[]): string {
  if (words.length === 0) return ''
  if (words.length === 1) return words[0]

  // Prefer words that don't end in -ing, -ed, -s, -er, -est
  const suffixes = ['ing', 'tion', 'ness', 'ment', 'ance', 'ence', 'ity', 'er', 'est', 'ed', 'ly']

  const scored = words.map((word) => {
    let score = word.length // shorter = better base form
    for (const suffix of suffixes) {
      if (word.endsWith(suffix)) score += 10
    }
    return { word, score }
  })

  scored.sort((a, b) => a.score - b.score)
  return scored[0].word
}
