import { expect, test } from 'claude-code/testing'

import { SUBCOMMANDS, argumentHint, helpText, suggest } from './commands'

test('help lists every subcommand and the hotkeys', async () => {
  const help = helpText()
  for (const sub of SUBCOMMANDS) {
    expect(help).toContain(`/read-aloud ${sub.usage ?? sub.name}`)
  }
  expect(help).toContain('ctrl+x, Tab')
})

test('the dim hint names every subcommand', async () => {
  expect(argumentHint()).toBe('[on|off|toggle|now|stop|voice|speed|status|setup|help]')
})

test('typing a letter after the command offers the matching subcommands', async () => {
  expect(suggest('/read-aloud s').map(row => row.text)).toEqual(['stop', 'speed', 'status', 'setup'])
  expect(suggest('/read-aloud vo').map(row => row.text)).toEqual(['voice'])
})

test('a subcommand with choices offers them as the second level', async () => {
  expect(suggest('/read-aloud voice f').map(row => row.text)).toEqual(['female'])
  expect(suggest('/read-aloud speed ').map(row => row.text)).toContain('faster')
})

test('other drafts get no rows', async () => {
  expect(suggest('hello')).toEqual([])
  expect(suggest('/read-aloud on now')).toEqual([])
  expect(suggest('/read-aloud stop x')).toEqual([])
})
