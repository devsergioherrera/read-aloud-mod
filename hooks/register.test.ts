import { expect, test } from 'claude-code/testing'

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
