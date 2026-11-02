import { atom, read } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { toSpeech } from './speech-text'

const isOnRef = { plugin: 'read-aloud', key: 'isOn' } as const
const isOn = atom(isOnRef, false)
const last = { plugin: 'read-aloud', key: 'last' } as const

// The best Kokoro voice of each kind; `/read-aloud voice male|female` picks one live.
const PRESETS: Record<string, string> = { male: 'am_michael', female: 'af_heart' }

const SPEED_MIN = 0.6
const SPEED_MAX = 2

const HELP = [
  '/read-aloud on | off | toggle   turn automatic reading of answers on or off',
  '/read-aloud now                 read the last answer',
  '/read-aloud stop               stop talking',
  '/read-aloud voice male | female | <name>   change the voice now (e.g. am_fenrir, af_bella)',
  '/read-aloud speed faster | slower | 1.3   change the speaking speed now (0.6 to 2)',
  '/read-aloud setup              install the Kokoro voice (one time, ~120 MB)',
  '/read-aloud status             show the engine in use',
].join('\n')

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

function stop() {
  void current?.return?.(undefined as never)
  current = null
}

async function speak($: EngineInterface, answer: string, options: Options) {
  stop()
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

  void (async () => {
    try {
      let step = await stream.next()
      while (!step.done) {
        step = await stream.next()
      }
      if (step.value.code) {
        $.ui.toast('read-aloud: the voice failed. Try /read-aloud status')
      }
    } catch {
      // a stopped stream rejects its pending read; nothing to report
    } finally {
      if (current === stream) {
        current = null
      }
    }
  })()
}

async function setOn($: EngineInterface, value: boolean) {
  await $.state.set(isOnRef, value)
  $.ui.status(value ? 'speak: on' : undefined)
  if (!value) {
    stop()
  }
  $.ui.toast(value ? 'Speak: on. Answers will be read aloud.' : 'Speak: off')
}

async function toggle($: EngineInterface) {
  const { value = false } = await $.state.get(isOnRef)
  await setOn($, !value)
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'read-aloud', description: 'Read answers aloud: on, off, now, stop, setup, status' })
    // Keep the on/off choice the user made, across sessions. It is off by default (see the README).
    const { value: isActive = false } = await $.state.get(isOnRef)
    $.ui.status(isActive ? 'speak: on' : undefined)
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

  on('prompt.submit', ($, e, next) => {
    stop()
    return next(e)
  })

  on('session.end', ($, e, next) => {
    stop()
    return next(e)
  })

  on('command.run', { command: 'read-aloud' }, async ($, e) => {
    const word = e.args.trim().toLowerCase()

    if (word === 'on' || word === 'off') {
      await setOn($, word === 'on')
      return { text: `Speak is ${word}.` }
    }

    if (word === 'toggle') {
      await toggle($)
      return { text: 'Speak toggled.' }
    }

    if (word === 'stop') {
      stop()
      return { text: 'Stopped.' }
    }

    if (word === 'now') {
      const { value = '' } = await $.state.get(last)
      if (value === '') {
        return { text: 'No answer to read yet.' }
      }
      await speak($, value, options)
      return { text: 'Reading the last answer.' }
    }

    if (word === 'voice' || word.startsWith('voice ')) {
      const name = word.slice('voice'.length).trim()
      if (name === '') {
        const saved = await $.store.get('voice')
        return { text: `Voice: ${typeof saved === 'string' ? saved : String(options.voice ?? 'am_michael')}. Use /read-aloud voice male, female, or a Kokoro name.` }
      }
      await $.store.set('voice', name)
      await speak($, `Hi, this is the ${name} voice.`, options)
      return { text: `Voice set to ${PRESETS[name] ?? name}.` }
    }

    if (word === 'speed' || word.startsWith('speed ')) {
      const arg = word.slice('speed'.length).trim()
      const savedSpeed = await $.store.get('speed')
      const current = typeof savedSpeed === 'number' ? savedSpeed : Number(options.speed ?? 1.3)
      if (arg === '') {
        return { text: `Speed: ${current}. Use /read-aloud speed faster, slower, or a number from ${SPEED_MIN} to ${SPEED_MAX}.` }
      }

      const requested = arg === 'faster' ? current + 0.1 : arg === 'slower' ? current - 0.1 : Number(arg)
      if (Number.isNaN(requested)) {
        return { text: 'Speed must be faster, slower, or a number like 1.3.' }
      }

      const next = Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, requested)) * 100) / 100
      await $.store.set('speed', next)
      await speak($, 'This is the new speaking speed.', options)
      return { text: `Speed set to ${next}.` }
    }

    if (word === 'status') {
      const check = await $.process.run(
        isWindows ? powershell($.plugin.root, 'check.ps1') : ['bash', `${$.plugin.root}/scripts/speak.sh`, '--check'],
      )
      const { value = false } = await $.state.get(isOnRef)
      return { text: `Speak is ${value ? 'on' : 'off'}. ${check.stdout.trim()}` }
    }

    if (word === 'setup') {
      $.ui.toast('Installing the Kokoro voice, this takes a minute...')
      const ran = await $.process.run(
        isWindows ? powershell($.plugin.root, 'setup.ps1') : ['bash', `${$.plugin.root}/scripts/setup.sh`],
        { timeoutMs: 600_000 },
      )
      const tail = (ran.exitCode === 0 ? ran.stdout : ran.stderr || ran.stdout).trim().split('\n').slice(-3).join('\n')
      return { text: ran.exitCode === 0 ? tail : `Setup failed:\n${tail}` }
    }

    return { text: HELP }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const isActive = await read($, isOn)
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text dimColor>{isActive ? 'Speak: on ' : 'Speak: off '}</Text>
        <Button key="toggle" label={isActive ? 'Turn off' : 'Turn on'} hotkey="m" onPress={() => toggle($)} />
      </Box>
    )
  })
}
