declare module 'claude-code' {
  interface PluginState {
    'read-aloud': {
      isOn: boolean
      last: string
      isTalking: boolean
      // The guided setup; the same shape as `Wizard` in hooks/wizard.ts (a contract may not import).
      wizard: {
        step: 'intent' | 'check' | 'voice' | 'install' | 'test' | 'done'
        intent?: 'en' | 'es' | 'both'
        gender?: 'male' | 'female'
        problems?: string[]
        sample?: number
      } | null
    }
  }
}
