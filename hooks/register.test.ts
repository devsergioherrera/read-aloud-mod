import { expect, test } from 'claude-code/testing'

import { HOTKEYS } from './commands'

// The row above the prompt must draw exactly the hotkeys the table (and the README) promise.
test('the row above the prompt has a button for every hotkey', async ($, on) => {
  on('state.get', () => ({ value: { value: false, version: 1 } }))

  const ui = await $.ui.mount({
    plugin: 'read-aloud',
    component: 'AbovePrompt',
    props: { hasSurvey: false },
    surface: 'terminal',
  })

  for (const hotkey of HOTKEYS) {
    const button = await ui.find({ type: 'Button', text: new RegExp(hotkey.label) })
    expect(button).toBeDefined()
  }
  await ui.unmount()
})

// Guards the load itself: a module the engine cannot load registers nothing,
// and /read-aloud then vanishes from the typeahead.
test('session start registers /read-aloud with its options hint', async ($, on) => {
  const registered: { name: string; argumentHint?: string }[] = []
  on('command.register', (_, e) => {
    registered.push(e)
    return { value: { command: e.name } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect(registered.map(command => command.name)).toEqual(['read-aloud'])
  expect(registered[0]?.argumentHint).toContain('stop')
})

// Every step of the guide must draw: a tree the engine refuses would blank the whole row.
const STEPS = [
  { step: 'intent', text: /Step 1 of 5/, control: { type: 'Select' } },
  { step: 'check', text: /Step 2 of 5/, control: { type: 'Button', text: /check again/ } },
  { step: 'voice', text: /Step 3 of 5/, control: { type: 'Select' } },
  { step: 'install', text: /Step 4 of 5/, control: { type: 'Button', text: /try again/ } },
  { step: 'test', text: /Step 5 of 5/, control: { type: 'Button', text: /yes, use it/ } },
] as const

for (const { step, text, control } of STEPS) {
  test(`the guided setup draws the ${step} step`, async ($, on) => {
    on('state.get', () => ({ value: { value: { step, intent: 'both' }, version: 1 } }))

    const ui = await $.ui.mount({ plugin: 'read-aloud', component: 'AbovePrompt', props: { hasSurvey: false }, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text })).toBeDefined()
    expect(await ui.find(control)).toBeDefined()
    await ui.unmount()
  })
}

// The hotkeys reach these handlers through the engine; this proves the handlers do their job and answer.
test('pressing stop clears the talking flag and says so', async ($, on) => {
  const writes: { key: string; value: unknown }[] = []
  const toasts: string[] = []
  on('state.get', () => ({ value: { value: false, version: 1 } }))
  on('state.set', (_, e) => {
    writes.push(e)
    return { value: { version: 2 } }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: {} }
  })

  const ui = await $.ui.mount({ plugin: 'read-aloud', component: 'AbovePrompt', props: { hasSurvey: false }, surface: 'terminal' })
  await ui.press({ key: 'stop' })

  expect(writes).toContainEqual({ plugin: 'read-aloud', key: 'isTalking', value: false })
  expect(toasts).toEqual(['Nothing is playing.'])
  await ui.unmount()
})
