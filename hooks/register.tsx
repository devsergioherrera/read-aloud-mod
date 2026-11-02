import { atom, read } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { COMMAND, argumentHint, helpText, suggest } from './commands'
import { LANGUAGES, detectLanguage, isLangId, languageOf, languageOfVoice } from './languages'
import type { Gender, LangId } from './languages'
import { toSpeech } from './speech-text'
import {
  CHECK_PS,
  CHECK_SH,
  GENDERS,
  INTENTS,
  approve,
  checked,
  chooseGender,
  chooseIntent,
  installed,
  isGender,
  isIntent,
  languagesOf,
  modeOf,
  nextSample,
  parseCheck,
  progress,
  rejectVoice,
  sampleLanguage,
  start,
} from './wizard'
import type { Intent, Wizard } from './wizard'

const isOnRef = { plugin: 'read-aloud', key: 'isOn' } as const
const isOn = atom(isOnRef, false)
const talkingRef = { plugin: 'read-aloud', key: 'isTalking' } as const
const isTalking = atom(talkingRef, false)
const wizardRef = { plugin: 'read-aloud', key: 'wizard' } as const
const wizardAtom = atom(wizardRef, null)
const last = { plugin: 'read-aloud', key: 'last' } as const

const SPEED_MIN = 0.6
const SPEED_MAX = 2

type Options = { voice?: unknown; speed?: unknown; lang?: unknown; maxChars?: unknown }
type Ui = ReturnType<EngineInterface['ui']['resolve']>

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

// --- Language and voice ---------------------------------------------------------------------

/** What the person chose: one language, or `auto` to follow each answer. English until they say otherwise. */
async function languageMode($: EngineInterface): Promise<LangId | 'auto'> {
  const saved = await $.store.get('language')
  return saved === 'auto' || isLangId(saved) ? saved : 'en'
}

/** The voice for a language: the saved one if it fits, else the default male voice. */
async function voiceFor($: EngineInterface, language: LangId, options: Options): Promise<string> {
  const profile = languageOf(language)
  const saved = await $.store.get(`voice.${language}`)
  const legacy = language === 'en' ? await $.store.get('voice') : undefined
  const picked = typeof saved === 'string' ? saved : typeof legacy === 'string' ? legacy : String(options.voice ?? '')
  const named = picked === 'male' || picked === 'female' ? profile.voices[picked] : picked
  return profile.voicePattern.test(named) ? named : profile.voices.male
}

const kokoroLang = (language: LangId, voice: string, options: Options) =>
  language === 'en' ? (voice.startsWith('b') ? 'en-gb' : String(options.lang ?? 'en-us').startsWith('en') ? String(options.lang ?? 'en-us') : 'en-us') : languageOf(language).kokoro

async function speak($: EngineInterface, answer: string, options: Options, forced?: LangId) {
  await stop($)

  const mode = await languageMode($)
  const language = forced ?? (mode === 'auto' ? detectLanguage(answer) : mode)
  const text = toSpeech(answer, Number(options.maxChars ?? 20000), language)
  if (text === '') {
    return
  }

  const voice = await voiceFor($, language, options)
  const savedSpeed = await $.store.get('speed')
  const speed = typeof savedSpeed === 'number' ? savedSpeed : Number(options.speed ?? 1.3)

  const stream = $.process.spawn({
    argv: isWindows ? [windowsPython(), `${$.plugin.root}/scripts/speak.py`] : ['bash', `${$.plugin.root}/scripts/speak.sh`],
    input: text,
    env: {
      SPEAK_VOICE: voice,
      SPEAK_SPEED: String(speed),
      SPEAK_LANG: kokoroLang(language, voice, options),
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

// What the hotkeys run: each one answers with a toast, so a key that did nothing is never silent.
async function stopNow($: EngineInterface) {
  const { value: isSpeaking = false } = await $.state.get(talkingRef)
  await stop($)
  $.ui.toast(isSpeaking ? 'Stopped.' : 'Nothing is playing.')
}

async function repeatNow($: EngineInterface, options: Options) {
  $.ui.toast(await runNow($, options))
}

async function changeSpeed($: EngineInterface, direction: 'faster' | 'slower', options: Options) {
  $.ui.toast(await runSpeed($, direction, options))
}

// --- Guided setup ---------------------------------------------------------------------------
// The steps and their transitions are pure (wizard.ts); these functions run the effects and store the result.

async function currentWizard($: EngineInterface): Promise<Wizard | null> {
  const { value = null } = await $.state.get(wizardRef)
  return value
}

async function saveChoice($: EngineInterface, intent: Intent, gender: Gender) {
  await $.store.set('language', modeOf(intent))
  for (const language of languagesOf(intent)) {
    await $.store.set(`voice.${language}`, languageOf(language).voices[gender])
  }
}

/** Installs the voice; the problems to show, none when it worked. */
async function installVoice($: EngineInterface): Promise<string[]> {
  $.ui.toast('Installing the Kokoro voice, this takes a minute...')
  const ran = await $.process.run(
    isWindows ? powershell($.plugin.root, 'setup.ps1') : ['bash', `${$.plugin.root}/scripts/setup.sh`],
    { timeoutMs: 600_000 },
  )
  if (ran.exitCode === 0) {
    return []
  }
  const tail = (ran.stderr || ran.stdout).trim().split('\n').slice(-3).join(' ')
  return [`The install failed: ${tail}`]
}

async function openWizard($: EngineInterface) {
  await $.state.set(wizardRef, start())
  return 'The guide is open above the prompt. Press ctrl+x, Tab to answer it. Esc returns to the prompt.'
}

async function closeWizard($: EngineInterface) {
  await $.state.set(wizardRef, null)
  await stop($)
  return 'Guided setup closed.'
}

async function runCheck($: EngineInterface) {
  const wizard = await currentWizard($)
  if (!wizard) {
    return
  }
  const ran = await $.process.run(isWindows ? ['powershell', '-NoProfile', '-Command', CHECK_PS] : ['bash', '-c', CHECK_SH])
  await $.state.set(wizardRef, checked(wizard, parseCheck(ran.stdout, isWindows)))
}

async function pickIntent($: EngineInterface, value: string) {
  const wizard = await currentWizard($)
  if (!wizard || !isIntent(value)) {
    return
  }
  await $.state.set(wizardRef, chooseIntent(wizard, value))
  await runCheck($)
}

async function playSample($: EngineInterface, options: Options) {
  const wizard = await currentWizard($)
  if (wizard) {
    const language = sampleLanguage(wizard)
    await speak($, languageOf(language).sample, options, language)
  }
}

async function runInstallStep($: EngineInterface, options: Options) {
  const wizard = await currentWizard($)
  if (!wizard) {
    return
  }
  const next = installed(wizard, await installVoice($))
  await $.state.set(wizardRef, next)
  if (next.step === 'test') {
    await playSample($, options)
  }
}

async function pickGender($: EngineInterface, value: string, options: Options) {
  const wizard = await currentWizard($)
  if (!wizard?.intent || !isGender(value)) {
    return
  }
  await saveChoice($, wizard.intent, value)
  await $.state.set(wizardRef, chooseGender(wizard, value))
  await runInstallStep($, options)
}

async function playAnother($: EngineInterface, options: Options) {
  const wizard = await currentWizard($)
  if (wizard) {
    await $.state.set(wizardRef, nextSample(wizard))
    await playSample($, options)
  }
}

async function changeVoice($: EngineInterface) {
  const wizard = await currentWizard($)
  if (wizard) {
    await stop($)
    await $.state.set(wizardRef, rejectVoice(wizard))
  }
}

async function approveVoice($: EngineInterface) {
  const wizard = await currentWizard($)
  if (wizard) {
    approve(wizard)
    await $.state.set(wizardRef, null)
    await stop($)
    await setOn($, true)
    $.ui.toast('Ready. ctrl+x, Tab, then m switches reading on or off.')
  }
}

function wizardView($: EngineInterface, ui: Ui, wizard: Wizard, options: Options) {
  const { Box, Button, Select, Text } = ui
  const problems = wizard.problems ?? []
  const sampleLabel = languageOf(sampleLanguage(wizard)).label

  const header = (
    <Text bold color="suggestion">
      {`Guided setup · ${progress(wizard)}`}
    </Text>
  )
  const footer = <Text dimColor>ctrl+x, Tab to answer · Esc returns to the prompt · /read-aloud setup cancel closes this guide</Text>

  switch (wizard.step) {
    case 'intent':
      return (
        <Box flexDirection="column">
          {header}
          <Select key="intent" label="What would you like? " options={[...INTENTS]} autoFocus onSelect={value => pickIntent($, value)} />
          {footer}
        </Box>
      )

    case 'check':
      return (
        <Box flexDirection="column">
          {header}
          {problems.length === 0 ? (
            <Text dimColor>Checking uv and the audio player...</Text>
          ) : (
            <Text color="warning">{problems.map(problem => `✗ ${problem}`).join('\n')}</Text>
          )}
          <Button plain key="recheck" label="check again" hotkey="r" onPress={() => runCheck($)} />
          {footer}
        </Box>
      )

    case 'voice':
      return (
        <Box flexDirection="column">
          {header}
          <Text color="success">✓ uv and the audio player are ready</Text>
          <Select key="gender" label="Which voice? " options={[...GENDERS]} autoFocus onSelect={value => pickGender($, value, options)} />
          {footer}
        </Box>
      )

    case 'install':
      return (
        <Box flexDirection="column">
          {header}
          {problems.length === 0 ? (
            <Text>Installing the voice, about 120 MB, once. This takes a minute...</Text>
          ) : (
            <Text color="error">{problems.map(problem => `✗ ${problem}`).join('\n')}</Text>
          )}
          <Button plain key="retry" label="try again" hotkey="r" onPress={() => runInstallStep($, options)} />
          {footer}
        </Box>
      )

    default:
      return (
        <Box flexDirection="column">
          {header}
          <Text>{`Playing a sample in ${sampleLabel}. Do you like this voice?`}</Text>
          <Box>
            <Button plain key="yes" label="yes, use it" hotkey="y" onPress={() => approveVoice($)} />
            <Text dimColor>  </Text>
            <Button plain key="again" label={languagesOf(wizard.intent ?? 'en').length > 1 ? 'other language' : 'play again'} hotkey="p" onPress={() => playAnother($, options)} />
            <Text dimColor>  </Text>
            <Button plain key="change" label="change voice" hotkey="n" onPress={() => changeVoice($)} />
          </Box>
          {footer}
        </Box>
      )
  }
}

// --- Commands -------------------------------------------------------------------------------
// One function per subcommand of commands.ts; each answers with the text to print.

async function runOn($: EngineInterface) {
  await setOn($, true)
  return 'Read-aloud is on.'
}

async function runOff($: EngineInterface) {
  await setOn($, false)
  return 'Read-aloud is off.'
}

async function runToggle($: EngineInterface) {
  await toggle($)
  return 'Read-aloud toggled.'
}

async function runStop($: EngineInterface) {
  await stop($)
  return 'Stopped.'
}

async function runNow($: EngineInterface, options: Options) {
  const { value = '' } = await $.state.get(last)
  if (value === '') {
    return 'No answer to read yet.'
  }
  await speak($, value, options)
  return 'Reading the last answer.'
}

async function runVoice($: EngineInterface, name: string, options: Options) {
  if (name === '') {
    const lines = []
    for (const language of LANGUAGES) {
      lines.push(`${language.label}: ${await voiceFor($, language.id, options)}`)
    }
    return `${lines.join(' · ')}. Use /${COMMAND} voice male, female, or a Kokoro name (am_*, af_* English; em_*, ef_* Spanish).`
  }

  const mode = await languageMode($)
  const language = name === 'male' || name === 'female' ? (mode === 'auto' ? 'en' : mode) : languageOfVoice(name)
  if (!language) {
    return `I don't know the voice "${name}". Try male, female, or one of: ${LANGUAGES.flatMap(item => [...Object.values(item.voices), ...item.more]).join(', ')}.`
  }

  await $.store.set(`voice.${language}`, name)
  await speak($, languageOf(language).sample, options, language)
  return `${languageOf(language).label} voice set to ${await voiceFor($, language, options)}.`
}

async function runSpeed($: EngineInterface, arg: string, options: Options) {
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
  await speak($, 'This is the new speaking speed.', options, 'en')
  return `Speed set to ${speed}.`
}

async function runLang($: EngineInterface, arg: string, options: Options) {
  if (arg === '') {
    return `Language: ${await languageMode($)}. Use /${COMMAND} lang en, es, or auto (the voice follows each answer).`
  }
  if (arg !== 'auto' && !isLangId(arg)) {
    return 'Language must be en, es, or auto.'
  }
  await $.store.set('language', arg)
  if (arg !== 'auto') {
    await speak($, languageOf(arg).sample, options, arg)
  }
  return `Language set to ${arg}.`
}

async function runStatus($: EngineInterface) {
  const check = await $.process.run(
    isWindows ? powershell($.plugin.root, 'check.ps1') : ['bash', `${$.plugin.root}/scripts/speak.sh`, '--check'],
  )
  const { value = false } = await $.state.get(isOnRef)
  return `Read-aloud is ${value ? 'on' : 'off'}. Language: ${await languageMode($)}. ${check.stdout.trim()}`
}

async function runSetup($: EngineInterface, arg: string) {
  if (arg === '') {
    return openWizard($)
  }
  if (arg === 'cancel') {
    return closeWizard($)
  }
  if (!isIntent(arg)) {
    return `Use /${COMMAND} setup for the guide, or /${COMMAND} setup en, es or both to skip it.`
  }

  await saveChoice($, arg, 'male')
  const problems = await installVoice($)
  return problems.length > 0 ? problems.join('\n') : 'Kokoro voice installed. Switch it on with /read-aloud on.'
}

async function runCommand($: EngineInterface, name: string, arg: string, options: Options) {
  switch (name) {
    case 'on':
      return runOn($)
    case 'off':
      return runOff($)
    case 'toggle':
      return runToggle($)
    case 'stop':
      return runStop($)
    case 'now':
      return runNow($, options)
    case 'voice':
      return runVoice($, arg, options)
    case 'speed':
      return runSpeed($, arg, options)
    case 'lang':
      return runLang($, arg, options)
    case 'status':
      return runStatus($)
    case 'setup':
      return runSetup($, arg)
    default:
      return helpText()
  }
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
    await $.state.set(wizardRef, null)
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
    return { text: await runCommand($, name, rest.join(' '), options) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const wizard = await read($, wizardAtom)
    if (wizard) {
      return wizardView($, $.ui.resolve(e), wizard, options)
    }

    const isActive = await read($, isOn)
    const isSpeaking = await read($, isTalking)
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text dimColor>{isActive ? 'Read aloud: on' : 'Read aloud: off'}{isSpeaking ? ' (talking)' : ''}  </Text>
        <Button plain key="toggle" label="on/off" hotkey="m" onPress={() => toggle($)} />
        <Text dimColor>  </Text>
        <Button plain key="stop" label="stop" hotkey="s" onPress={() => stopNow($)} />
        <Text dimColor>  </Text>
        <Button plain key="repeat" label="repeat" hotkey="r" onPress={() => repeatNow($, options)} />
        <Text dimColor>  </Text>
        <Button plain key="faster" label="faster" hotkey="f" onPress={() => changeSpeed($, 'faster', options)} />
        <Text dimColor>  </Text>
        <Button plain key="slower" label="slower" hotkey="l" onPress={() => changeSpeed($, 'slower', options)} />
      </Box>
    )
  })
}
