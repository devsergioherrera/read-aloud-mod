// The guided setup as a small state machine: pure functions from one step to the
// next, so every transition can be tested without a terminal. register.tsx only
// draws the current step and runs the effects (the check, the install, the sample).

import type { Gender, LangId } from './languages'

export type Intent = 'en' | 'es' | 'both'
export type Step = 'intent' | 'check' | 'voice' | 'install' | 'test' | 'done'

export type Wizard = {
  step: Step
  intent?: Intent
  gender?: Gender
  /** What blocks the step right now: the missing tools, or the install error. */
  problems?: string[]
  /** Which sample the test step plays next, for the intents with two languages. */
  sample?: number
}

export const STEPS: readonly Step[] = ['intent', 'check', 'voice', 'install', 'test']

export const INTENTS: readonly { value: Intent; label: string }[] = [
  { value: 'en', label: 'Listen in English' },
  { value: 'es', label: 'Escuchar en español' },
  { value: 'both', label: 'Both: the voice follows the answer' },
]

export const GENDERS: readonly { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male voice' },
  { value: 'female', label: 'Female voice' },
]

export const isIntent = (value: string): value is Intent => value === 'en' || value === 'es' || value === 'both'
export const isGender = (value: string): value is Gender => value === 'male' || value === 'female'

/** The languages an intent covers, in the order their samples play. */
export const languagesOf = (intent: Intent): LangId[] => (intent === 'both' ? ['en', 'es'] : [intent])

/** What /read-aloud should speak after this intent: one language, or follow each answer. */
export const modeOf = (intent: Intent): LangId | 'auto' => (intent === 'both' ? 'auto' : intent)

export const start = (): Wizard => ({ step: 'intent' })

export const chooseIntent = (wizard: Wizard, intent: Intent): Wizard => ({ ...wizard, step: 'check', intent, problems: undefined })

export const checked = (wizard: Wizard, problems: string[]): Wizard =>
  problems.length > 0 ? { ...wizard, step: 'check', problems } : { ...wizard, step: 'voice', problems: undefined }

export const chooseGender = (wizard: Wizard, gender: Gender): Wizard => ({ ...wizard, step: 'install', gender, problems: undefined })

export const installed = (wizard: Wizard, problems: string[]): Wizard =>
  problems.length > 0 ? { ...wizard, step: 'install', problems } : { ...wizard, step: 'test', sample: 0, problems: undefined }

/** `n`: back to the voice choice. */
export const rejectVoice = (wizard: Wizard): Wizard => ({ ...wizard, step: 'voice', problems: undefined })

export const nextSample = (wizard: Wizard): Wizard => ({ ...wizard, sample: (wizard.sample ?? 0) + 1 })

export const approve = (wizard: Wizard): Wizard => ({ ...wizard, step: 'done' })

/** The language the test step plays now. */
export const sampleLanguage = (wizard: Wizard): LangId => {
  const languages = languagesOf(wizard.intent ?? 'en')
  return languages[(wizard.sample ?? 0) % languages.length] ?? 'en'
}

/** "Step 2 of 5" for the row above the prompt. */
export const progress = (wizard: Wizard): string => `Step ${Math.max(1, STEPS.indexOf(wizard.step) + 1)} of ${STEPS.length}`

/** What `check` printed, one `name:ok` or `name:missing` per line, as the problems to fix. */
export const parseCheck = (output: string, isWindows: boolean): string[] => {
  const fixes: Record<string, string> = isWindows
    ? { uv: 'uv is missing: winget install astral-sh.uv' }
    : {
        uv: 'uv is missing: curl -LsSf https://astral.sh/uv/install.sh | sh',
        audio: 'no audio player: sudo apt install pulseaudio-utils',
      }

  return output
    .split('\n')
    .map(line => line.trim().match(/^(\w+):missing$/)?.[1])
    .flatMap(name => (name && fixes[name] ? [fixes[name]] : []))
}

/** The shell line that prints the check, one `name:ok|missing` per line. */
export const CHECK_SH =
  'command -v uv >/dev/null && echo uv:ok || echo uv:missing; ' +
  '(command -v paplay || command -v aplay || command -v ffplay) >/dev/null && echo audio:ok || echo audio:missing'

export const CHECK_PS = "if (Get-Command uv -ErrorAction SilentlyContinue) { 'uv:ok' } else { 'uv:missing' }"
