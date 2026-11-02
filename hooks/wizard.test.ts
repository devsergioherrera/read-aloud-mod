import { expect, test } from 'claude-code/testing'

import { approve, checked, chooseGender, chooseIntent, installed, languagesOf, modeOf, nextSample, parseCheck, progress, rejectVoice, sampleLanguage, start } from './wizard'

test('the happy path walks every step in order', async () => {
  let wizard = start()
  expect(wizard.step).toBe('intent')

  wizard = chooseIntent(wizard, 'es')
  expect(wizard.step).toBe('check')

  wizard = checked(wizard, [])
  expect(wizard.step).toBe('voice')

  wizard = chooseGender(wizard, 'female')
  expect(wizard.step).toBe('install')

  wizard = installed(wizard, [])
  expect(wizard.step).toBe('test')

  expect(approve(wizard).step).toBe('done')
})

test('a missing tool keeps the guide on the check, with the fix to run', async () => {
  const wizard = checked(chooseIntent(start(), 'en'), ['uv is missing: winget install astral-sh.uv'])
  expect(wizard.step).toBe('check')
  expect(wizard.problems).toEqual(['uv is missing: winget install astral-sh.uv'])
})

test('a failed install stays on the install step and a retry clears the error', async () => {
  const failed = installed(chooseGender(chooseIntent(start(), 'en'), 'male'), ['The install failed: no network'])
  expect(failed.step).toBe('install')
  expect(failed.problems).toHaveLength(1)
  expect(installed(failed, []).step).toBe('test')
})

test('not liking the voice goes back to the voice choice', async () => {
  const testing = installed(chooseGender(checked(chooseIntent(start(), 'en'), []), 'male'), [])
  expect(rejectVoice(testing).step).toBe('voice')
})

test('both languages play an English sample, then a Spanish one, then loop', async () => {
  let wizard = installed(chooseGender(chooseIntent(start(), 'both'), 'male'), [])
  expect(languagesOf('both')).toEqual(['en', 'es'])
  expect(sampleLanguage(wizard)).toBe('en')
  wizard = nextSample(wizard)
  expect(sampleLanguage(wizard)).toBe('es')
  expect(sampleLanguage(nextSample(wizard))).toBe('en')
})

test('an intent maps to the language mode the mod speaks in', async () => {
  expect(modeOf('en')).toBe('en')
  expect(modeOf('es')).toBe('es')
  expect(modeOf('both')).toBe('auto')
})

test('progress counts from step 1 of 5', async () => {
  expect(progress(start())).toBe('Step 1 of 5')
  expect(progress(chooseIntent(start(), 'en'))).toBe('Step 2 of 5')
})

test('the check output becomes the fixes, per platform', async () => {
  const output = 'uv:missing\naudio:missing\n'
  expect(parseCheck(output, false)).toEqual([
    'uv is missing: curl -LsSf https://astral.sh/uv/install.sh | sh',
    'no audio player: sudo apt install pulseaudio-utils',
  ])
  expect(parseCheck(output, true)).toEqual(['uv is missing: winget install astral-sh.uv'])
  expect(parseCheck('uv:ok\naudio:ok\n', false)).toEqual([])
})
