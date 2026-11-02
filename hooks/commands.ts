// The one place that describes /read-aloud: its help text, its dim argument hint
// and its typeahead rows all come from this table, so they can never disagree.

import { allVoices } from './languages'

export const COMMAND = 'read-aloud'

export type Subcommand = {
  readonly name: string
  /** What follows `/read-aloud` when typed in full; the name when absent. */
  readonly usage?: string
  readonly summary: string
  /** The words that fit the argument after the name, offered as the second typeahead level. */
  readonly values?: readonly string[]
}

export type Suggestion = { text: string; label: string; description: string }

export const SUBCOMMANDS: readonly Subcommand[] = [
  { name: 'on', summary: 'Read every answer aloud' },
  { name: 'off', summary: 'Stop reading answers' },
  { name: 'toggle', summary: 'Switch between on and off' },
  { name: 'now', summary: 'Read the last answer again' },
  { name: 'stop', summary: 'Stop talking right now' },
  {
    name: 'voice',
    usage: 'voice <male|female|name>',
    summary: 'Change the voice (English and Spanish voices)',
    values: ['male', 'female', ...allVoices()],
  },
  {
    name: 'speed',
    usage: 'speed <faster|slower|0.6-2>',
    summary: 'Change the speaking speed',
    values: ['faster', 'slower', '1', '1.3', '1.5'],
  },
  {
    name: 'lang',
    usage: 'lang <en|es|auto>',
    summary: 'Speak English, Spanish, or follow each answer',
    values: ['en', 'es', 'auto'],
  },
  { name: 'status', summary: 'Show which voice engine is in use' },
  {
    name: 'setup',
    usage: 'setup [en|es|both]',
    summary: 'Guided install of the Kokoro voice (about 120 MB, once)',
    values: ['en', 'es', 'both', 'cancel'],
  },
  { name: 'help', summary: 'Show this list' },
]

// Pressed after `ctrl+x Tab`. One key each, drawn in the row above the prompt as `key: label`.
// Letters only: ctrl+s is Claude Code's draft stash, and the row's own keys are Tab, Enter, Space, Esc.
export type Hotkey = { readonly key: string; readonly label: string }

export const HOTKEYS: readonly Hotkey[] = [
  { key: 'm', label: 'on/off' },
  { key: 's', label: 'stop' },
  { key: 'r', label: 'repeat' },
  { key: 'f', label: 'faster' },
  { key: 'l', label: 'slower' },
]

const hotkeysText = () => `Hotkeys: ctrl+x, Tab, then ${HOTKEYS.map(hotkey => `${hotkey.key} ${hotkey.label}`).join(', ')}.`

const usageOf = (sub: Subcommand) => sub.usage ?? sub.name

export const argumentHint = (): string => `[${SUBCOMMANDS.map(sub => sub.name).join('|')}]`

export const helpText = (): string => {
  const width = Math.max(...SUBCOMMANDS.map(sub => usageOf(sub).length))
  const rows = SUBCOMMANDS.map(sub => `  /${COMMAND} ${usageOf(sub).padEnd(width)}   ${sub.summary}`)
  return [`Read answers aloud:`, ...rows, '', hotkeysText()].join('\n')
}

const startsWith = (prefix: string) => (word: string) => word.startsWith(prefix.toLowerCase())

/**
 * Typeahead rows for a draft that ends at the cursor: the subcommands after
 * `/read-aloud `, then the values of a subcommand that has them.
 */
export const suggest = (beforeCursor: string): Suggestion[] => {
  const pair = beforeCursor.match(/^\/read-aloud\s+(\S+)\s+(\S*)$/)
  if (pair) {
    const sub = SUBCOMMANDS.find(candidate => candidate.name === pair[1]?.toLowerCase())
    return (sub?.values ?? [])
      .filter(startsWith(pair[2] ?? ''))
      .map(value => ({ text: value, label: value, description: sub?.summary ?? '' }))
  }

  const single = beforeCursor.match(/^\/read-aloud\s+(\S*)$/)
  if (single) {
    return SUBCOMMANDS.filter(sub => startsWith(single[1] ?? '')(sub.name)).map(sub => ({
      text: sub.name,
      label: usageOf(sub),
      description: sub.summary,
    }))
  }

  return []
}
