**English** | [Español](README.es.md)

# Gumball Chat

Gumball Chat turns useful Twitch chat messages into colored gumballs the streamer opens live on stream.

## Preview and links

- Overlay capture: pending a verified screenshot at `docs/media/overlay.png`.
- Demo video (YouTube): pending publication.
- Devpost: pending publication.
- Panel: <http://localhost:3000/>
- OBS overlay: <http://localhost:3000/overlay>
- Viewer instructions: <http://localhost:3000/instructivos>
- Design: [docs/DISENO.md](docs/DISENO.md) (Spanish)
- Project plan and Twitch integration: [docs/PLAN.md](docs/PLAN.md) (Spanish)

## Features

- Chat messages are classified, translated, and filtered before entering the machine.
- The streamer reviews colored gumballs and chooses when to draw one; the overlay animates the selected message into a public card.
- Spoilers remain sealed until the final reveal.
- Optional category tags include `&hint` / `&pista`, `&challenge` / `&reto`, `&cheer` / `&animo`, `&prediction` / `&prediccion`, and `&spoiler`. Messages without tags are classified automatically.
- AI and local safety filters continue to inspect tagged and untagged messages for spam, unsafe content, and prompt injection.
- English and Spanish interface languages, message-language translation, OBS overlay controls, and configurable public cards.
- The panel groups repeated messages by frequency and authors. The simulator includes a one-button 50-gumball fill for layout previews.

## How it connects to Twitch

The default `simulator` mode works without Twitch credentials. `eventsub` listens for `channel.chat.message` over Twitch EventSub WebSocket and validates the configured bot token for `user:read:chat` and `user:bot`. The experimental `anonymous` IRC mode attempts to join a public channel without OAuth and may be rejected by Twitch. The app does not send replies to chat; `user:write:chat` is not currently used.

## Quick start

Requires Node.js 24 or later. No Twitch or Gemini credentials are needed to try the local simulator.

```powershell
npm.cmd install
npm.cmd start
```

Open <http://localhost:3000/>, select **50 gumballs**, then choose **Draw a gumball**. Without `GEMINI_API_KEY`, safe messages use the local classifier. On macOS/Linux, use `npm install` and `npm start`.

## Connect your Twitch channel

1. Register a Twitch application at [Twitch Developer Console](https://dev.twitch.tv/console/apps).
2. Review [EventSub](https://dev.twitch.tv/docs/eventsub/) and [Twitch authentication and scopes](https://dev.twitch.tv/docs/authentication/).
3. Create a local `.env` from `.env.example`. For EventSub, set `CHAT_MODE=eventsub`, `TWITCH_CLIENT_ID`, `TWITCH_OAUTH_TOKEN`, `TWITCH_CHANNEL_LOGIN`, and `TWITCH_BOT_LOGIN`. Use a token belonging to the configured bot account and grant `user:read:chat` and `user:bot`.
4. Restart the server and select **Connect Twitch** in the panel.

Keep `.env` private. IRC mode only needs `CHAT_MODE=anonymous` and `TWITCH_CHANNEL_LOGIN`, but it is experimental. See [docs/PLAN.md](docs/PLAN.md) for project-specific setup details.

## OBS setup

Add a Browser Source at 1920×1080 and keep its aspect ratio; do not stretch it. Use the transparent page <http://localhost:3000/overlay>. Settings in the panel update the overlay live. Existing scene URLs may override saved settings with `?pos=left` or `?pos=right`, `?scale=0.45` through `?scale=1.15`, and `?lang=en` or `?lang=es`. OBS Lanczos scaling is recommended when resizing the source. The instruction page at <http://localhost:3000/instructivos> can be added as a second transparent Browser Source.

## Configuration

| Panel setting | Purpose |
| --- | --- |
| Interface language | English or Spanish UI; defaults to English. `?lang=` overrides it per page. |
| Streamer language | Target language used when translating chat messages. |
| Overlay side, scale, status | Positions and scales the machine and toggles its status badge. |
| Card text and display | Translated/original/both text, author, source language, stamp, featured badge, position, size, animation, duration, and character limit. |
| Category controls | Enable or hide each category and customize its label and stamp (up to 24 characters). |

| `.env` variable | Purpose |
| --- | --- |
| `CHAT_MODE` | `simulator`, `anonymous`, or `eventsub`. |
| `TWITCH_CLIENT_ID` | Twitch application client ID for EventSub. |
| `TWITCH_OAUTH_TOKEN` | Private bot OAuth token for EventSub. |
| `TWITCH_CHANNEL_LOGIN` | Channel login used by Twitch chat modes. |
| `TWITCH_BOT_LOGIN` | Bot login associated with the EventSub token. |
| `GEMINI_API_KEY` | Optional Google AI Studio key; stays on the server. |
| `GEMINI_MODEL` | Gemini model name. |
| `STREAMER_LANGUAGE` | Initial chat translation language before panel settings are saved. |
| `UI_LANGUAGE` | Initial interface language (`en` or `es`). |
| `PORT` | HTTP port (default `3000`). |
| `HOST` | Bind address (default `127.0.0.1`, local machine only). |

Get a Gemini key at [Google AI Studio](https://aistudio.google.com/). Settings are stored locally in the ignored `.gumball-settings.json` file.

## Chat tags

| English tag | Spanish tag | Category / color |
| --- | --- | --- |
| `&hint` | `&pista` | Hint · yellow |
| `&challenge` | `&reto` | Challenge · orange-red |
| `&cheer` | `&animo` | Cheer · pink |
| `&prediction` | `&prediccion` | Prediction · purple |
| `&spoiler` | `&spoiler` | Spoiler · charcoal |

A tag suggests the category; it does not bypass the AI classifier or safety filters. Untagged messages continue through automatic classification.

## How we used Codex

Codex-assisted work in this repository has covered the application flow, local simulator, Twitch EventSub and experimental IRC adapters, message classification and filtering, batching, the animated Matter.js machine, the panel, viewer instructions, and the settings/i18n work described here. The current repository does not include a public Codex session identifier; add the shareable session reference to the Devpost entry if one is published. No other coding tool is claimed here.

## Tests

Run the local smoke checks with:

```powershell
npm.cmd run smoke
```

The anonymous IRC connectivity probe is separate and requires a public channel name; it connects to Twitch:

```powershell
node scripts/test-anonymous-irc.js CHANNEL_NAME
```

## Project structure

```text
.
├── docs/                 # Design, plan, and project notes (mostly Spanish)
├── public/
│   ├── shared/           # i18n and shared theme
│   ├── panel/            # Streamer dashboard and configuration
│   ├── overlay/          # Animated OBS machine and public cards
│   ├── instructivos/     # Viewer-facing participation guide
│   └── vendor/           # Local Matter.js and fonts
├── scripts/              # Smoke check and optional IRC probe
├── server/
│   ├── ai/               # Gemini classifier and local fallback
│   ├── chat/             # EventSub, IRC, and simulator adapters
│   ├── index.js          # HTTP and WebSocket server
│   └── state.js          # In-memory message state
├── .env.example
├── LICENSE
└── package.json
```

## Privacy and security

Secrets belong in `.env`; the panel and WebSocket state do not expose the Gemini key or Twitch token. The server binds to `127.0.0.1` by default. Chat text is untrusted input: the classifier prompt treats it as data, and local safety filters run before messages are admitted. The local panel has no login; changing `HOST` can expose it to other interfaces, so do that only when intended.

## Credits and license

Matter.js is distributed under the MIT License. The Bagel Fat One and Bricolage Grotesque font files in `public/vendor/fonts` retain their OFL notices. Gumball Chat is released under the MIT License; see [LICENSE](LICENSE).