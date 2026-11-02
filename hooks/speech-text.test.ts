import { expect, test } from 'claude-code/testing'

import { CUE_END, CUE_START, toSpeech } from './speech-text'

const cue = (phrase: string) => CUE_START + phrase + CUE_END

test('drops code blocks and says so once', async () => {
  const md = 'Here is the fix:\n```ts\nconst a = 1\nconst b = 2\n```\nDone.'
  expect(toSpeech(md, 1000)).toBe(`Here is the fix: ${cue('Take a look at the code on screen.')} Done.`)
})

test('flattens markdown into plain sentences', async () => {
  const md = '## Result\n- **Fast** and `safe`\n- see [the docs](https://x.dev/a)\n1. next step'
  expect(toSpeech(md, 1000)).toBe('Result. Fast and safe. see the docs. next step.')
})

test('summarises tables, urls and long paths', async () => {
  const md = '| a | b |\n|---|---|\n| 1 | 2 |\nOpen https://example.com/x now, in /home/user/proj/src/app.ts'
  expect(toSpeech(md, 1000)).toBe(`${cue('Check the table on screen.')} Open a link now, in app.ts.`)
})

test('cuts long text at a sentence and points to the screen', async () => {
  const md = 'First sentence is here. Second sentence is here. Third sentence is here.'
  expect(toSpeech(md, 40)).toBe(`First sentence is here. ${cue('You can read the rest on screen.')}`)
})
