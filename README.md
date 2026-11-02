# read-aloud-mod

**Stop reading. Start listening.** Claude Code answers, spoken by a local, offline voice.

Off by default. Nothing leaves your machine.

## Install

```
/plugin marketplace add devsergioherrera/read-aloud-mod
/plugin install read-aloud@read-aloud
/read-aloud setup
```

`/read-aloud setup` installs the voice once (about 120 MB). It needs `uv` and an audio player: `paplay`, `aplay`, or `ffplay`.

## Use

| Action | How |
| --- | --- |
| Turn on or off | `ctrl+x`, `Tab`, `m`, or `/read-aloud on \| off \| toggle` |
| Read the last answer | `/read-aloud now` |
| Stop talking | `/read-aloud stop` |
| Check the engine | `/read-aloud status` |

## Settings

| Setting | Command | Default |
| --- | --- | --- |
| Voice | `/read-aloud voice male \| female \| <name>` | `am_michael` / `af_heart` |
| Speed | `/read-aloud speed faster \| slower \| 1.3` | `1.3` |
| Answer length | Config menu, `spokenWords` | 100 words |

Code blocks and tables are not read aloud. You hear a short cue instead.

## Privacy

The voice runs locally with Kokoro. No audio or text is sent to a cloud service.

## License

To be decided.
