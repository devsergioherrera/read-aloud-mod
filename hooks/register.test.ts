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
