import { expect, test } from 'claude-code/testing'

import { HOTKEYS, SUBCOMMANDS, argumentHint, helpText, suggest } from './commands'

// Claude Code's own keys inside the focused row above the prompt (abovePrompt:*), plus ctrl+s.
const RESERVED = ['tab', 'enter', 'space', 'escape', 'up', 'down', 'left', 'right']

test('hotkeys are single unique letters that clash with nothing reserved', async () => {
  const keys = HOTKEYS.map(hotkey => hotkey.key)
  expect(new Set(keys).size).toBe(keys.length)
  for (const key of keys) {
    expect(key).toMatch(/^[a-z]$/)
    expect(RESERVED).not.toContain(key)
  }
})

test('help lists every hotkey', async () => {
  const help = helpText()
  for (const hotkey of HOTKEYS) {
    expect(help).toContain(`${hotkey.key} ${hotkey.label}`)
  }
})

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
