// Private-use markers wrap a spoken cue ("look at the screen"); scripts/speak.py
// reads it slower and with a soft pause before and after.
export const CUE_START = '\uE000'
export const CUE_END = '\uE001'

const cue = (phrase: string) => CUE_START + phrase + CUE_END

// The spoken cues, in the language of the voice that will say them.
const PHRASES = {
  en: { code: 'Take a look at the code on screen.', table: 'Check the table on screen.', rest: 'You can read the rest on screen.' },
  es: { code: 'Mira el código en pantalla.', table: 'Mira la tabla en pantalla.', rest: 'Puedes leer el resto en pantalla.' },
} as const

type Spoken = keyof typeof PHRASES

const endsSentence = (line: string) => /[.!?:;,]$/.test(line)

const cutAtSentence = (text: string, maxChars: number, language: Spoken) => {
  if (text.length <= maxChars) {
    return text
  }

  const head = text.slice(0, maxChars)
  const lastStop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '))
  const cut = lastStop > maxChars * 0.4 ? head.slice(0, lastStop + 1) : head.replace(/\s+\S*$/, '')

  return cut + ' ' + cue(PHRASES[language].rest)
}

/** Turns a markdown answer into plain sentences a voice can read. */
export const toSpeech = (markdown: string, maxChars: number, language: Spoken = 'en'): string => {
  const lines: string[] = []
  let isInCode = false
  let isInTable = false

  for (const raw of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) {
      if (!isInCode) {
        lines.push(cue(PHRASES[language].code))
      }
      isInCode = !isInCode
      continue
    }

    if (isInCode) {
      continue
    }

    if (/^\s*\|/.test(raw)) {
      if (!isInTable) {
        lines.push(cue(PHRASES[language].table))
      }
      isInTable = true
      continue
    }
    isInTable = false

    const line = raw
      .replace(/[\uE000\uE001]/g, '')
      .replace(/^\s*#{1,6}\s+/, '')
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
      .replace(/^\s*>\s?/, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/g, 'a link')
      .replace(/(?:~|\.{0,2})?(?:\/[\w.@-]+){3,}/g, path => path.split('/').pop() ?? path)
      .replace(/`([^`]*)`/g, '$1')
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(\S(?:.*?\S)?)\1/g, '$2')
      .replace(/<[^>]+>/g, '')
      .replace(/^[-=*_]{3,}\s*$/, '')
      .trim()

    if (line === '') {
      continue
    }

    lines.push(endsSentence(line) ? line : line + '.')
  }

  const text = lines.join(' ').replace(/\s+/g, ' ').trim()

  return cutAtSentence(text, maxChars, language)
}
