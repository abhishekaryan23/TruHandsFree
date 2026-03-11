# TruHandsFree

<p align="center">
  <img src="assets/logo.png" width="128" alt="TruHandsFree Logo">
</p>

**macOS-native, LLM/STT provider-agnostic smart dictation and text transformation agent.**

TruHandsFree bridges your speech into any active application, contextually adapting its output based on where you're typing — terminal, code editor, chat app, or browser.

---

## Prerequisites (macOS)

Currently, TruHandsFree is built explicitly for **macOS Apple Silicon (M1/M2/M3/M4)**.

| Requirement | Version | Install |
|-------------|---------|---------|
| **Architecture** | Apple Silicon (ARM64) | *Intel Macs are currently unsupported for the packaged DMG* |
| **Python** | 3.10+ | `brew install python` |
| **Node.js** | 18+ | `brew install node` |
| **PortAudio** | — | `brew install portaudio` _(required by `sounddevice`)_ |

---

## Quick Start

### 1. Clone & Setup Backend

```bash
# Clone the repository
git clone <your-repo-url> TruHandsFree
cd TruHandsFree

# Create Python virtual environment
cd backend
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Setup Frontend

```bash
cd frontend
npm install
```

### 3. Set Your API Keys

TruHandsFree stores API keys in your **macOS Keychain** (never in plaintext files). You can set them via the Settings UI or via the API:

```bash
# Start the backend first
cd ../backend
source .venv/bin/activate
python server.py &

# Set your Groq API key (or any provider)
curl -X POST http://127.0.0.1:8055/secrets \
  -H "Content-Type: application/json" \
  -d '{"provider": "groq", "key": "YOUR_API_KEY_HERE"}'
```

### 4. Run in Development Mode

**Terminal 1 — Backend:**
```bash
cd backend
source .venv/bin/activate
python server.py
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

The Electron app will launch with:
- A **floating widget** (bottom-left) showing recording status
- A **settings window** (click ⚙️ on the widget) for configuration

### 5. macOS Permissions

For hotkeys to work, you **must** grant **Accessibility** permission:

> System Settings → Privacy & Security → Accessibility → Enable your Terminal app (or TruHandsFree.app)

### 6. Build for Production

```bash
cd frontend
npm run build
```

The automated `build-mac.sh` script produces the standalone `.dmg` installer.
For your convenience, the latest compiled builds are hosted directly on the **GitHub Releases** page.
- Navigate to the **Releases** section on the right sidebar of the GitHub repository.
- Download `TruHandsFree-0.0.0-arm64.dmg`.

To install, simply double-click the `.dmg`, drag the app to your `Applications` folder, and grant macOS Accessibility permissions on first launch!

---

## Global Hotkeys

TruHandsFree natively registers global keyboard hooks. You do not need to have the app focused. As long as the Tray Icon is running, you can hit these hotkeys from *any* application.

> **Note:** For legacy compatibility, both `Command (⌘)` and `Control (⌃)` keys work interchangeably for these shortcuts.

| Hotkey | Mode | Pipeline |
|--------|------|--------------------------------------------------|
| `⌃ + ⇧ + D` <br> `⌘ + ⇧ + D` | **Pure Dictation** | Raw Speech → Whisper STT → Paste raw transcript |
| `⌃ + ⇧ + T` <br> `⌘ + ⇧ + T` | **Smart Transform** | Speech → STT → LLM Agent + Custom Skills → Paste formatted text |

Each hotkey acts as a **toggle**:
1. Press `⌃ + ⇧ + D` once to **Start Recording**. A sound will chime, and the floating widget will pulse green.
2. Speak your thoughts naturally.
3. Press `⌃ + ⇧ + D` again to **Stop Recording**. 
4. The backend processes the audio, and injects the text natively into your active window via `nut-js` hardware emulation.

---

## 🧠 Smart Engine & Custom Skills

The **Smart Transform (`⌃ + ⇧ + T`)** mode is context-aware. It actively reads which application you are currently typing in (e.g., "Code", "Slack", "Chrome") and applies **Custom Skills** to rewrite your text appropriately.

### Adding Personal Skills
Open the **Settings Window** by clicking the Gear (⚙️) icon on the floating widget, and navigate to the **Skills** tab.

You can instruct the AI on exactly how to behave when you are using specific macOS apps.

#### Examples:
1. **The Coder (For VS Code / Cursor)**
   - *Prompt*: `If the active window is 'Code' or 'Cursor', format the transcript as a properly escaped Python docstring. Never include markdown backticks.`
2. **The Executive (For Slack / Teams)**
   - *Prompt*: `If the active window is 'Slack', rewrite the transcript to be heavily corporate, polite, and concise. Use bullet points for multiple ideas.`
3. **The Translator (For WeChat / WhatsApp)**
   - *Prompt*: `If the active window is 'WeChat', translate the transcript entirely to conversational Spanish.`

By defining application-specific skills, the Smart Engine anticipates *how* you want the text formatted before you even paste it.

---

## Architecture

```
TruHandsFree/
├── backend/                    # Python FastAPI engine
│   ├── server.py              # REST API (port 8055, controls pipeline)
│   ├── engine.py              # Dictation vs Smart orchestration
│   ├── agent/                 # Langchain Supervisor + Skill Injection
│   ├── audio/                 # sounddevice 16kHz microphone capture
│   ├── os_interfaces/         # Quartz Window Tracking (macOS)
│   └── security/              # 0o600 Encrypted Local Secrets 
├── frontend/                   # Electron + React + Vite
│   ├── electron/main.ts       # macOS Tray App + nut-js Keystroke Injector
│   ├── electron/preload.ts    # Secure IPC Error/Success bridging
│   └── src/                   # React components
│       ├── FloatingWidget.tsx # Always-on-top VU meter & status pill
│       └── SettingsView.tsx   # Hardware, Models, and Skills config
└── Project Management/         # Architecture & Workflow Diagrams
```

---

## Security & Privacy Model

- **Local Secrets:** API keys are stored locally at `~/.truhandsfree/.env_secrets`. This file is strictly permissioned `chmod 600` (readable only by your exact macOS user profile) to bypass heavily-prompted macOS Keychain native access.
- **Offline Triggers:** All global hotkeys (`Cmd/Ctrl+D`, `Cmd/Ctrl+T`) are processed entirely offline via Electron.
- **IPC Safety:** Electron operates with `contextIsolation: true` and `nodeIntegration: false`. The React frontend cannot access native Node capabilities except through explicit, whitelisted `preload.ts` bridges.
- **No Data Retention:** Trnscript data is held entirely in transient memory during processing and is immediately discarded after the `.nut-js` paste executes.

---

## Debugging

Audio recordings generated during local development are kept in `~/.truhandsfree/recordings/` with timestamps for debugging. The engine automatically purges old files, keeping only the 50 most recent debug captures to prevent disk bloat.

Detailed execution logs are aggregated locally at:
`~/.truhandsfree/logs/electron.log`

---

## License

MIT
