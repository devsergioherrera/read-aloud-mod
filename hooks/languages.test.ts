import { expect, test } from 'claude-code/testing'

import { LANGUAGES, detectLanguage, languageOfVoice } from './languages'
import { toSpeech } from './speech-text'

test('Spanish prose is detected, English and code-heavy answers stay English', async () => {
  expect(detectLanguage('Hola, esta es la respuesta que necesitas para el proyecto.')).toBe('es')
  expect(detectLanguage('¿Quieres que lo haga ahora?')).toBe('es')
  expect(detectLanguage('This is the answer that you need for the project.')).toBe('en')
  expect(detectLanguage('```es\nel la de que y en un una es por para con\n```\nHere is the fix for the bug.')).toBe('en')
  expect(detectLanguage('')).toBe('en')
})

test('voices belong to their language', async () => {
  expect(languageOfVoice('ef_dora')).toBe('es')
  expect(languageOfVoice('em_alex')).toBe('es')
  expect(languageOfVoice('am_michael')).toBe('en')
  expect(languageOfVoice('bf_emma')).toBe('en')
  expect(languageOfVoice('zz_nobody')).toBeUndefined()
})

test('every default voice fits the language it is the default of', async () => {
  for (const language of LANGUAGES) {
    for (const voice of Object.values(language.voices)) {
      expect(language.voicePattern.test(voice)).toBe(true)
    }
  }
})

test('the spoken cues follow the voice language', async () => {
  const md = 'Mira:\n```ts\nconst a = 1\n```\nListo.'
  expect(toSpeech(md, 1000, 'es')).toContain('Mira el código en pantalla.')
  expect(toSpeech(md, 1000)).toContain('Take a look at the code on screen.')
})
