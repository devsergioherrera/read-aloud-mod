# read-aloud-mod

**Stop reading. Start listening.** Claude Code answers, spoken by a local, offline voice.

Off by default. Nothing leaves your machine.

## Install

```
/plugin marketplace add devsergioherrera/read-aloud-mod
/plugin install read-aloud@read-aloud
/read-aloud setup
```

`/read-aloud setup` installs the voice once (about 120 MB). It needs [`uv`](https://docs.astral.sh/uv/getting-started/installation/).

| Platform | Also needs | Status |
| --- | --- | --- |
| Ubuntu / Linux | `paplay`, `aplay`, or `ffplay` | Tested |
| Windows 10 / 11 | PowerShell (built in). Install `uv` with `winget install astral-sh.uv` | Experimental, not tested on a real Windows machine yet |

## Use

| Action | How |
| --- | --- |
| Turn on or off | `ctrl+x`, `Tab`, `m`, or `/read-aloud on \| off \| toggle` |
| Read the last answer | `ctrl+x`, `Tab`, `r`, or `/read-aloud now` |
| Stop talking | `ctrl+x`, `Tab`, `s`, or `/read-aloud stop` |
| Faster / slower | `ctrl+x`, `Tab`, `f` / `l`, or `/read-aloud speed faster \| slower` |
| See every option | Type `/read-aloud ` and keep typing: the options appear as you go. `/read-aloud help` lists them all |
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
