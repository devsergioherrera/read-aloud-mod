import { atom, read } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { COMMAND, argumentHint, helpText, suggest } from './commands'
import { toSpeech } from './speech-text'

const isOnRef = { plugin: 'read-aloud', key: 'isOn' } as const
const isOn = atom(isOnRef, false)
const talkingRef = { plugin: 'read-aloud', key: 'isTalking' } as const
const isTalking = atom(talkingRef, false)
const last = { plugin: 'read-aloud', key: 'last' } as const

// The best Kokoro voice of each kind; `/read-aloud voice male|female` picks one live.
const PRESETS: Record<string, string> = { male: 'am_michael', female: 'af_heart' }

const SPEED_MIN = 0.6
const SPEED_MAX = 2

type Options = { voice?: unknown; speed?: unknown; lang?: unknown; maxChars?: unknown }

let current: AsyncGenerator<unknown, { code: number | null }> | null = null

const runtime = (globalThis as { process?: { platform?: string; env?: Record<string, string | undefined> } }).process
const isWindows = runtime?.platform === 'win32'

// On Windows the voice runs straight from its venv, so stopping kills the player itself.
function windowsPython(): string {
  const base = runtime?.env?.READ_ALOUD_HOME ?? `${runtime?.env?.LOCALAPPDATA}\\read-aloud`
  return `${base}\\venv\\Scripts\\python.exe`
}

const powershell = (root: string, script: string, ...args: string[]) => [
  'powershell',
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  `${root}/scripts/${script}`,
  ...args,
]

async function stop($: EngineInterface) {
  const stream = current
  current = null
  void stream?.return?.(undefined as never)
  await $.state.set(talkingRef, false)
}

async function speak($: EngineInterface, answer: string, options: Options) {
  await stop($)
  const text = toSpeech(answer, Number(options.maxChars ?? 20000))
  if (text === '') {
    return
  }

  const saved = await $.store.get('voice')
  const voice = typeof saved === 'string' ? (PRESETS[saved] ?? saved) : String(options.voice ?? 'am_michael')

  const savedSpeed = await $.store.get('speed')
  const speed = typeof savedSpeed === 'number' ? savedSpeed : Number(options.speed ?? 1.3)

  const stream = $.process.spawn({
    argv: isWindows ? [windowsPython(), `${$.plugin.root}/scripts/speak.py`] : ['bash', `${$.plugin.root}/scripts/speak.sh`],
    input: text,
    env: {
      SPEAK_VOICE: voice,
      SPEAK_SPEED: String(speed),
      SPEAK_LANG: String(options.lang ?? 'en-us'),
    },
  })
  current = stream
  await $.state.set(talkingRef, true)

  void (async () => {
    try {
      let step = await stream.next()
      while (!step.done) {
        step = await stream.next()
      }
      if (step.value.code) {
        $.ui.toast(`read-aloud: the voice failed. Try /${COMMAND} status`)
      }
    } catch {
      // a stopped stream rejects its pending read; nothing to report
    } finally {
      if (current === stream) {
        current = null
        await $.state.set(talkingRef, false)
      }
    }
  })()
}

async function setOn($: EngineInterface, value: boolean) {
  await $.state.set(isOnRef, value)
  $.ui.status(value ? 'read-aloud: on' : undefined)
  if (!value) {
    await stop($)
  }
  $.ui.toast(value ? 'Read-aloud: on. Answers will be read aloud.' : 'Read-aloud: off')
}

async function toggle($: EngineInterface) {
  const { value = false } = await $.state.get(isOnRef)
  await setOn($, !value)
}

// One handler per subcommand of commands.ts; each answers with the text to print.
type Handler = ($: EngineInterface, arg: string, options: Options) => Promise<string>

const HANDLERS: Record<string, Handler> = {
  on: async $ => (await setOn($, true), 'Read-aloud is on.'),
  off: async $ => (await setOn($, false), 'Read-aloud is off.'),
  toggle: async $ => (await toggle($), 'Read-aloud toggled.'),
  stop: async $ => (await stop($), 'Stopped.'),
  help: async () => helpText(),

  now: async ($, _arg, options) => {
    const { value = '' } = await $.state.get(last)
    if (value === '') {
      return 'No answer to read yet.'
    }
    await speak($, value, options)
    return 'Reading the last answer.'
  },

  voice: async ($, name, options) => {
    if (name === '') {
      const saved = await $.store.get('voice')
      return `Voice: ${typeof saved === 'string' ? saved : String(options.voice ?? 'am_michael')}. Use /${COMMAND} voice male, female, or a Kokoro name.`
    }
    await $.store.set('voice', name)
    await speak($, `Hi, this is the ${name} voice.`, options)
    return `Voice set to ${PRESETS[name] ?? name}.`
  },

  speed: async ($, arg, options) => {
    const savedSpeed = await $.store.get('speed')
    const currentSpeed = typeof savedSpeed === 'number' ? savedSpeed : Number(options.speed ?? 1.3)
    if (arg === '') {
      return `Speed: ${currentSpeed}. Use /${COMMAND} speed faster, slower, or a number from ${SPEED_MIN} to ${SPEED_MAX}.`
    }

    const requested = arg === 'faster' ? currentSpeed + 0.1 : arg === 'slower' ? currentSpeed - 0.1 : Number(arg)
    if (Number.isNaN(requested)) {
      return 'Speed must be faster, slower, or a number like 1.3.'
    }

    const speed = Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, requested)) * 100) / 100
    await $.store.set('speed', speed)
    await speak($, 'This is the new speaking speed.', options)
    return `Speed set to ${speed}.`
  },

  status: async $ => {
    const check = await $.process.run(
      isWindows ? powershell($.plugin.root, 'check.ps1') : ['bash', `${$.plugin.root}/scripts/speak.sh`, '--check'],
    )
    const { value = false } = await $.state.get(isOnRef)
    return `Read-aloud is ${value ? 'on' : 'off'}. ${check.stdout.trim()}`
  },

  setup: async $ => {
    $.ui.toast('Installing the Kokoro voice, this takes a minute...')
    const ran = await $.process.run(
      isWindows ? powershell($.plugin.root, 'setup.ps1') : ['bash', `${$.plugin.root}/scripts/setup.sh`],
      { timeoutMs: 600_000 },
    )
    const tail = (ran.exitCode === 0 ? ran.stdout : ran.stderr || ran.stdout).trim().split('\n').slice(-3).join('\n')
    return ran.exitCode === 0 ? tail : `Setup failed:\n${tail}`
  },
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Read answers aloud. Type a space to see every option.',
      argumentHint: argumentHint(),
    })
    // Keep the on/off choice the user made, across sessions. It is off by default (see the README).
    const { value: isActive = false } = await $.state.get(isOnRef)
    $.ui.status(isActive ? 'read-aloud: on' : undefined)
    await $.state.set(talkingRef, false)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    if (e.agentId === undefined && e.reason === 'answer' && e.answer !== '') {
      await $.state.set(last, e.answer)
      const { value = false } = await $.state.get(isOnRef)
      if (value) {
        await speak($, e.answer, options)
      }
    }

    return result
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const { value = false } = await $.state.get(isOnRef)
    if (!value) {
      return composed
    }

    const limit = Number(options.spokenWords ?? 100)
    const text = `Read-aloud is ON: the user hears your answer spoken. Keep it under ${limit} words in plain sentences, with code and tables only when needed. If the user asks for more detail or a longer answer, give it.`

    return { sections: [...composed.sections, { id: 'read-aloud:brevity', text, scope: 'session' }] }
  })

  // Typing never interrupts the voice; sending a new prompt does.
  on('prompt.submit', async ($, e, next) => {
    await stop($)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await stop($)
    return next(e)
  })

  on('prompt.autocomplete', async ($, e, next) => {
    const result = await next(e)
    const rows = suggest(e.text.slice(0, e.cursor))
    return rows.length === 0 ? result : { suggestions: [...result.suggestions, ...rows] }
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const [name = '', ...rest] = e.args.trim().toLowerCase().split(/\s+/)
    const handler = HANDLERS[name]
    return { text: handler ? await handler($, rest.join(' '), options) : helpText() }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const isActive = await read($, isOn)
    const isSpeaking = await read($, isTalking)
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text dimColor>{isActive ? 'Read aloud: on ' : 'Read aloud: off '}</Text>
        <Button key="toggle" label={isActive ? 'Turn off' : 'Turn on'} hotkey="m" onPress={() => toggle($)} />
        <Text dimColor>{isSpeaking ? ' ' : ''}</Text>
        <Button key="stop" label={isSpeaking ? 'Stop talking' : 'Stop'} hotkey="s" onPress={() => stop($)} />
      </Box>
    )
  })
}
