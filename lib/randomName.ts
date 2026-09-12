const ADJECTIVES = [
  'Swift', 'Brave', 'Clever', 'Sneaky', 'Bold', 'Quiet', 'Fierce', 'Lucky',
  'Sharp', 'Wild', 'Calm', 'Quick', 'Silent', 'Mighty', 'Nimble', 'Jolly',
]
const ANIMALS = [
  'Fox', 'Otter', 'Wolf', 'Hawk', 'Bear', 'Owl', 'Lynx', 'Raven',
  'Falcon', 'Badger', 'Panther', 'Heron', 'Cobra', 'Tiger', 'Eagle', 'Viper',
]

export function generateRandomName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
  const num = Math.floor(Math.random() * 100)
  return `${adj}${animal}${num}`
}
