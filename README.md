# read-aloud

A Claude Code mod that reads Claude's answers aloud with a local, offline Kokoro voice.
Off by default. Code blocks and tables are not read: you hear "Take a look at the code on screen."

## Install

```
/plugin marketplace add <owner>/<repo>
/plugin install read-aloud@read-aloud
/read-aloud setup
```

`/read-aloud setup` installs the voice once (about 120 MB, needs `uv` and an audio player: paplay, aplay or ffplay).
For a local checkout, use its path instead of `<owner>/<repo>`.

## Use

- Toggle: **ctrl+x, Tab, then m** (the `Speak` row above the prompt), or `/read-aloud on|off|toggle`.
- `/read-aloud now` reads the last answer, `/read-aloud stop` stops, `/read-aloud status` shows the engine.
- `/read-aloud voice male|female|<kokoro name>` changes the voice live (defaults: `am_michael`, `af_heart`).
- While on, Claude is asked to keep answers under 100 words (`spokenWords` in the config menu).
- `/read-aloud speed faster|slower|1.3` changes the speed live (default 1.3).
- Voice, speed, language and length limit are also in the plugin's config menu.
