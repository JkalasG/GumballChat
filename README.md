**English** | [Español](README.es.md)

![Gumball Chat: your Twitch chat, one gumball at a time](assets/covers/github-social-1280x640-en.png)

# Gumball Chat

**Your Twitch chat, one gumball at a time.**

Every big stream has the same problem: the best message in chat (the hint that saves the run, the dare everyone wants to see, the prediction that comes true) scrolls away in two seconds, buried under emotes and spam.

**Gumball Chat catches those messages and turns them into a moment.** It reads your live Twitch chat, and AI keeps only the useful messages: hints, challenges, cheers, predictions and spoilers. It translates them into your language and drops each one into a glass gumball machine on your stream overlay. When the timing is right, you turn the crank: the gumball races up the tube, pops open, and puts that viewer's message on screen with their name on it.

- **Viewers** get a real reason to write something good, and a shot at being featured.
- **Streamers** stay in control: nothing appears on stream until you decide.
- **Spoilers** stay sealed inside the machine until the final reveal.

![A cheer message popping out of the machine on stream](docs/media/overlay-reveal.jpg)

## Watch the pitch

[![Gumball Chat, 2-minute pitch](assets/covers/youtube-thumbnail-1280x720-en.png)](https://www.youtube.com/)

> Replace the link above with the public YouTube URL of the demo video. The video script is in [assets/video/SCRIPT.md](assets/video/SCRIPT.md).

| Links | |
| --- | --- |
| Devpost | _add the project link_ |
| Streamer panel | <http://localhost:3000/> |
| OBS overlay (transparent) | <http://localhost:3000/overlay> |
| Viewer instructions (transparent) | <http://localhost:3000/instructivos> |
| Brand assets | [assets/](assets/) |

## What makes it different

| | |
| --- | --- |
| **A machine, not a list** | Physics-based gumballs (Matter.js) fall through a protruding glass tube, pile up by color, and fly out for every reveal. Chat becomes something viewers watch, not something they scroll past. |
| **AI that filters before it shows** | Gemini classifies, translates and safety-checks each message. Abuse, spam and prompt-injection attempts never reach the machine. |
| **Built for a live stream** | If Gemini is slow, a local classifier answers instantly. If Twitch drops, the connection comes back on its own. The machine never freezes mid-stream. |
| **Global chat, one language** | Japanese, Portuguese, French or Spanish messages arrive translated into the streamer's language, with the original one click away. |
| **Zero-setup testing** | Anyone can type their own channel name in the panel and see their chat flow into the machine, with no tokens and no app registration. |

## See it in action

**1. Chat drops in.** New messages fall through the tube into the globe, one color per category.

![Gumballs falling into the machine through the glass tube](docs/media/overlay-fill.jpg)

**2. You turn the crank.** The chosen gumball shoots up the tube and opens into a card designed for its category.

![A challenge card on the overlay](docs/media/overlay-challenge.jpg)

**3. The panel is your control room.** Connect any channel, watch the live message counter, filter by category, and draw or remove gumballs.

![Streamer panel connected to a Twitch channel](docs/media/panel.jpg)

**4. Every message is traceable.** The live console follows each message through every stage. Below, a prompt-injection attempt is received, translated by Gemini and blocked by the safety filter.

![Live activity console tracing one message](docs/media/console.jpg)

## Quick start (2 minutes, no credentials)

Requires [Node.js](https://nodejs.org/) 24 or later.

```powershell
git clone https://github.com/JkalasG/GumballChat.git
cd GumballChat
npm.cmd install
npm.cmd start
```

On macOS or Linux, use `npm install` and `npm start`.

1. Open the panel at <http://localhost:3000/>.
2. **Try the simulator:** press **50 gumballs**, open <http://localhost:3000/overlay> in another tab, then press **Draw a gumball** in the panel.
3. **Try your own Twitch chat:** type your channel name in the connection bar at the top (`your_channel`, `@your_channel` or a `twitch.tv/your_channel` link) and press **Connect**. Write in your chat, for example `&hint check behind the waterfall`. Your stream does not need to be live.

Without a `GEMINI_API_KEY`, the local classifier keeps tagged messages and blocks unsafe ones. Add a key to unlock automatic classification and translation (see [Configuration](#configuration)).

## How to use it on stream

### Before you go live

1. Copy `.env.example` to `.env`, then set `CHAT_MODE=anonymous` and `TWITCH_CHANNEL_LOGIN=your_channel`. The server will connect to your chat every time it starts.
2. Optional: add a free [Google AI Studio](https://aistudio.google.com/) key as `GEMINI_API_KEY`.
3. Run `npm.cmd start` and keep the terminal open while you stream.
4. In OBS, add the overlay (see [OBS setup](#obs-setup)).
5. In the panel, type the **Current game**. The AI uses it to tell a hint from a spoiler.

### During the stream

- The bar at the top turns **green** with a live message counter when Twitch is connected. It turns **amber** while reconnecting and **red** with the exact reason if something fails.
- The **Gumballs** view lists every accepted message with its category, author and original language. Use the category chips to filter, then **Draw a gumball** for a random one, or **Draw** on a specific message.
- **Remove** takes a message out of the machine. **Show original** switches between the translation and the original text.
- **Live activity** shows the full trace of every message. Type `#gum-12`, `@user`, `level:warn` or `help` in its prompt to filter it.

### At the end

Press **Final reveal** to open every sealed spoiler at once.

### For your viewers

Add the instruction page as a second OBS source, or upload the ready-made Twitch panels from [assets/twitch-panels/](assets/twitch-panels/). Tags are optional: without one, the AI picks the category.

![Viewer instructions overlay](docs/media/instructions.jpg)

| English | Spanish | Category |
| --- | --- | --- |
| `&hint` | `&pista` | Hint · yellow |
| `&challenge` | `&reto` | Challenge · orange |
| `&cheer` | `&animo` | Cheer · pink |
| `&prediction` | `&prediccion` | Prediction · purple |
| `&spoiler` | `&spoiler` | Spoiler · charcoal, sealed |

A tag suggests a category; it never skips the AI or the safety filters.

## OBS setup

1. Add a **Browser Source** at **1920×1080** with the URL <http://localhost:3000/overlay>. The background is transparent.
2. Right-click the source and choose **Transform → Reset Transform**, so it is never stretched or blurry.
3. Optional URL parameters: `?pos=left|right` (machine side), `?scale=0.45`–`1.15` (machine size) and `?lang=en|es`. Example: `http://localhost:3000/overlay?pos=left&scale=0.8`.
4. Optional: add <http://localhost:3000/instructivos> as a second Browser Source.

## Configuration

The panel's **Settings** page controls everything shown on stream, and changes apply live without reloading OBS. You can set:

- the interface and translation languages;
- the machine's side and scale;
- the card text (translation, original or both), author, language, stamp and badge;
- the card position, size, animation, duration and character limit;
- which categories appear, with your own names and stamps.

![Settings page](docs/media/settings.jpg)

| `.env` variable | Purpose |
| --- | --- |
| `CHAT_MODE` | `simulator` (default), `anonymous` (read-only Twitch chat, no token) or `eventsub`. |
| `TWITCH_CHANNEL_LOGIN` | Default channel. It is connected on start in `anonymous`/`eventsub`. |
| `TWITCH_AUTOCONNECT` | `true` (default) connects on start; `false` waits for you to press Connect. |
| `TWITCH_CLIENT_ID`, `TWITCH_OAUTH_TOKEN`, `TWITCH_BOT_LOGIN` | EventSub credentials (private). |
| `GEMINI_API_KEY` | Optional Google AI Studio key. It never leaves the server. |
| `GEMINI_MODEL` | Default `gemini-3-flash-preview` (about 4–6 s per batch of 8 messages in our tests). |
| `GEMINI_TIMEOUT_MS` | How long to wait for Gemini before the local classifier answers (default `12000`). |
| `GEMINI_THINKING_LEVEL` | `minimal` (default), `low`, `high` or `default`. |
| `STREAMER_LANGUAGE` | Language messages are translated into. |
| `UI_LANGUAGE` | Initial interface language (`en` or `es`). |
| `PORT`, `HOST` | Default `3000` and `127.0.0.1` (this computer only). |

## Twitch integration

| Mode | How it reads chat | Needs |
| --- | --- | --- |
| `simulator` | Local sample messages. Any public channel can still be connected from the panel. | Nothing |
| `anonymous` | Twitch IRC over WebSocket with a read-only anonymous user. | Nothing |
| `eventsub` | Subscribes to `channel.chat.message` over EventSub WebSocket for `TWITCH_CHANNEL_LOGIN`. Other channels typed in the panel use the read-only reader. | Client ID and a user token with `user:read:chat` and `user:bot` |

To use EventSub:

1. Register an app in the [Twitch Developer Console](https://dev.twitch.tv/console/apps).
2. Generate a token with the [Twitch CLI](https://dev.twitch.tv/docs/cli/) (`twitch token -u -s "user:read:chat user:bot"`).
3. Fill in the four `TWITCH_*` values in `.env`. `TWITCH_BOT_LOGIN` must be the account that owns the token.

The app only reads chat; it never posts. Channel emotes are removed using the positions Twitch sends with each message, so emote-only spam never costs an AI call.

## How it works

```text
Twitch chat ──► connection manager ──► quick filters ──► Gemini / local classifier ──► machine (WebSocket)
 IRC or EventSub   auto-connect, retry    emotes, noise,    category, translation,       streamer draws ──► overlay card
                                          duplicates        safety, keep / discard
```

- **Server:** Node.js HTTP + WebSocket ([server/index.js](server/index.js)) with chat adapters in [server/chat/](server/chat/) and the classifier in [server/ai/](server/ai/).
- **Batching:** messages are batched (up to 10 per Gemini call, two calls in parallel). If Gemini fails twice in a row, a circuit breaker pauses it for 60 s and the local classifier handles everything.
- **Overlay:** canvas + Matter.js physics, with no CDN, so it works offline in OBS ([public/overlay/](public/overlay/)).
- **Panel:** plain HTML/CSS/JS with English and Spanish dictionaries ([public/panel/](public/panel/), [public/shared/i18n.js](public/shared/i18n.js)).

## Troubleshooting

| Problem | Fix |
| --- | --- |
| The bar says _Could not connect: Twitch did not answer for that channel_ | Check the username; it may not exist or may be suspended. |
| Messages arrive but nothing enters the machine | Without Gemini, only tagged messages are kept. Add a tag (`&hint …`) or set `GEMINI_API_KEY`. |
| The panel shows _Local classifier active_ | Gemini was slow or failed, and the machine kept working with the local classifier. It retries automatically. |
| The overlay looks blurry in OBS | Use a 1920×1080 Browser Source and **Reset Transform**. Resize the machine with `?scale=` instead of stretching. |
| `EADDRINUSE` on start | Another program uses port 3000. Set `PORT=3001` in `.env`. |
| EventSub says _Invalid token_ | User tokens expire after a few hours. Generate a new one and restart. |

## Tests

```powershell
npm.cmd run smoke                          # routes, filters, Gemini contract (mocked), WebSocket flow, i18n parity
node scripts/test-anonymous-irc.js CHANNEL # live check of the read-only Twitch reader
```

## How we used Codex

Codex was used to build the core of the project:

- the Node server and WebSocket flow;
- the local simulator;
- the Twitch EventSub and IRC adapters;
- Gemini classification, batching and safety filters;
- the Matter.js machine;
- the streamer panel, viewer instructions, settings and i18n.

Parts of the later visual redesign, the Twitch connection manager and the brand assets were made with Claude Code. The Codex session ID is included in the Devpost submission.

## Project structure

```text
.
├── assets/               # Logos, covers, Twitch panels (SVG + PNG), video script
├── docs/                 # Design notes, plan (Spanish) and README images
├── public/
│   ├── brand/            # Web-sized logo and favicon
│   ├── shared/           # i18n dictionaries and theme
│   ├── panel/            # Streamer panel, settings, Twitch bar, activity console
│   ├── overlay/          # Animated OBS machine and category cards
│   ├── instructivos/     # Viewer guide
│   └── vendor/           # Matter.js and fonts (served locally)
├── scripts/              # Smoke check and IRC probe
├── server/
│   ├── ai/               # Gemini classifier and local fallback
│   ├── chat/             # EventSub, IRC and simulator adapters
│   ├── index.js          # HTTP, WebSocket and Twitch connection manager
│   └── state.js          # In-memory message state
└── .env.example
```

## Privacy and security

- Secrets live only in `.env`, which git ignores; the panel and overlay never receive the Gemini key or Twitch token.
- The server listens on `127.0.0.1` by default. The panel has no login, so change `HOST` only if you mean to expose it.
- Chat text is treated as untrusted data: the AI prompt ignores instructions inside messages, and local safety filters run before anything reaches the machine.

## Credits and license

- [Matter.js](https://brm.io/matter-js/): MIT License.
- Bagel Fat One and Bricolage Grotesque: SIL Open Font License (see `public/vendor/fonts`).
- Gumball Chat: MIT License, see [LICENSE](LICENSE).
