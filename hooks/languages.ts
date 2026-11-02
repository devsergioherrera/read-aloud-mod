// The languages the mod can speak, the Kokoro voices that fit each, and a cheap
// way to tell which one an answer is written in. Voices checked against the
// installed voices.bin: American English af_/am_, Spanish ef_/em_.

export type LangId = 'en' | 'es'
export type Gender = 'male' | 'female'

export type Language = {
  readonly id: LangId
  readonly label: string
  /** The language code Kokoro expects. */
  readonly kokoro: string
  /** The default voice for each gender. */
  readonly voices: Readonly<Record<Gender, string>>
  /** Other voices of this language, offered while typing `/read-aloud voice`. */
  readonly more: readonly string[]
  readonly sample: string
  readonly voicePattern: RegExp
}

export const LANGUAGES: readonly Language[] = [
  {
    id: 'en',
    label: 'English',
    kokoro: 'en-us',
    voices: { male: 'am_michael', female: 'af_heart' },
    more: ['am_fenrir', 'am_puck', 'af_bella', 'af_nicole'],
    sample: 'Hi, this is your new voice. Your answers will sound like this.',
    voicePattern: /^[ab][fm]_/,
  },
  {
    id: 'es',
    label: 'Español',
    kokoro: 'es',
    voices: { male: 'em_alex', female: 'ef_dora' },
    more: ['em_santa'],
    sample: 'Hola, esta es tu nueva voz. Así sonarán tus respuestas.',
    voicePattern: /^e[fm]_/,
  },
]

export const languageOf = (id: LangId): Language => LANGUAGES.find(language => language.id === id) ?? LANGUAGES[0]!

export const isLangId = (value: unknown): value is LangId => value === 'en' || value === 'es'

/** The language a Kokoro voice name belongs to, or undefined for a voice this mod does not know. */
export const languageOfVoice = (voice: string): LangId | undefined =>
  LANGUAGES.find(language => language.voicePattern.test(voice))?.id

export const allVoices = (): string[] =>
  LANGUAGES.flatMap(language => [...Object.values(language.voices), ...language.more])

const SPANISH_WORDS = new Set([
  'el', 'la', 'los', 'las', 'de', 'del', 'que', 'y', 'en', 'un', 'una', 'es', 'por', 'para', 'con',
  'se', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'ya', 'este', 'esta', 'son', 'muy', 'tu', 'te',
])

const ENGLISH_WORDS = new Set([
  'the', 'and', 'of', 'to', 'in', 'is', 'that', 'it', 'for', 'with', 'as', 'was', 'on', 'are', 'this',
  'you', 'be', 'at', 'or', 'have', 'not', 'your', 'can', 'will', 'from', 'but',
])

/** English unless the stop words clearly say Spanish; code blocks are ignored. */
export const detectLanguage = (text: string): LangId => {
  const prose = text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ')
  const words = prose.toLowerCase().match(/[a-záéíóúüñ]+/g) ?? []

  let spanish = (prose.match(/[¿¡ñ]/g) ?? []).length
  let english = 0
  for (const word of words) {
    if (SPANISH_WORDS.has(word)) {
      spanish += 1
    }
    if (ENGLISH_WORDS.has(word)) {
      english += 1
    }
  }

  return spanish > english ? 'es' : 'en'
}
