export const WORD_PAIRS = [
  { secret: 'guitar', villainHint: 'violin' },
  { secret: 'pizza', villainHint: 'pasta' },
  { secret: 'ocean', villainHint: 'lake' },
  { secret: 'volcano', villainHint: 'earthquake' },
  { secret: 'wolf', villainHint: 'fox' },
  { secret: 'castle', villainHint: 'palace' },
  { secret: 'thunder', villainHint: 'rain' },
  { secret: 'coffee', villainHint: 'tea' },
  { secret: 'dragon', villainHint: 'dinosaur' },
  { secret: 'mountain', villainHint: 'hill' },
]

export function getRandomWordPair() {
  return WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)]
}
