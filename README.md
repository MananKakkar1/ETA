# ETA – Electronic Teaching Assistant

ETA is an end-to-end learning assistant that combines an immersive React front-end with a Flask back-end powered by Google Gemini, ElevenLabs, and AWS DynamoDB. The application lets students chat with different AI personas, request generated notes or practice problems, hear spoken responses, and upload PDFs to enrich their personal knowledge base.

---

## Contents

1. [Architecture](#architecture)
2. [Key Features](#key-features)
3. [Repository Structure](#repository-structure)
4. [Prerequisites](#prerequisites)
5. [Environment Configuration](#environment-configuration)
6. [Local Development](#local-development)
7. [Back-end API Reference](#back-end-api-reference)
8. [Voice & Animation Flow](#voice--animation-flow)
9. [Troubleshooting](#troubleshooting)
10. [License](#license)

---

## Architecture

```text
┌───────────────────────────────────────────────────────────────────────────┐
│ React + Vite Front-end (Auth0 protected)                                   │
│  • Chat UI and personas                                                   │
│  • Context uploads & audio playback                                       │
│  • Communicates via axios/fetch to Flask API                              │
└─────────────────▲─────────────────────────────────────────────────────────┘
                  │ JSON / audio (MPEG)
┌─────────────────┴─────────────────────────────────────────────────────────┐
│ Flask API (backend/app.py)                                                │
│  • Gemini 2.5 Flash for text generation                                   │
│  • ElevenLabs for speech + emotion                                        │
│  • DynamoDB (table: ETA) for users, chat history, context                 │
│  • PDF ingestion & summarisation                                          │
└─────────────────▲─────────────────────────────────────────────────────────┘
                  │ boto3
         ┌────────┴────────┐
         │ AWS DynamoDB    │
         └─────────────────┘
```

---

## Key Features

- **Persona-driven chat** – switch between Professor, Study Buddy, and Exam Coach tones. Conversations persist per user and per thread.
- **Gemini responses** – the back-end composes prompts using persona, historic messages, and uploaded context to query Google’s Gemini 2.5 Flash model.
- **Voice replies** – ElevenLabs synthesises audio while Gemini supplies an emotion/animation hint for the avatar. When browsers block autoplay, the MP3 is still surfaced for manual playback.
- **Notes & Practice generation** – single-click actions request structured notes or practice problems that are appended to the chat session.
- **Context uploads** – PDFs are summarised and stored alongside the user to ground future answers.
- **Auth0 integration** – the React app requires Auth0 authentication and stores the user’s ETA ID client-side.

---

## Repository Structure

```text
backend/              Flask API, Gemini + ElevenLabs integration
  app.py              REST endpoints & DynamoDB utilities
  elevenlabs.py       Persona-aware TTS helper
  requirements.txt    Python dependencies

eta/                  React application (Vite)
  src/
    pages/chat.jsx    Main chat experience
    components/       Auth0 login, top bar, etc.
    Avatar.jsx        Drei/Three.js animated avatar
    lib/api.js        Front-end API client
  package.json        Front-end dependencies & scripts

README.md             (You are here)
```

---

## Prerequisites

- **Node.js** ≥ 18.x (for the Vite dev server)
- **Python** ≥ 3.10 (for the Flask API)
- **AWS credentials** with access to a DynamoDB table named `ETA`
- **Google Gemini API key** (`GEMINI_API_KEY`)
- **ElevenLabs API key** (`ELEVENLABS_API_KEY`)
- **Auth0 tenant** (domain + client ID)

Optional but recommended:

- `virtualenv` or `conda` for Python environments
- `awscli` configured with credentials/profile

---

## Environment Configuration

### Back-end (`backend/.env`)

Create `backend/.env` (or provide the variables via your shell/hosting platform):

```env
APP_SECRET_KEY=change-me
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
SYSTEM_PROMPT="You are ETA, a concise teaching assistant who explains concepts clearly."

# ElevenLabs
ELEVENLABS_API_KEY=your_elevenlabs_key
ELEVENLABS_VOICE_ID=default_voice_id
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
ELEVENLABS_VOICE_PROFESSOR=voice_id_optional
ELEVENLABS_VOICE_STUDY_BUDDY=voice_id_optional
ELEVENLABS_VOICE_EXAM_COACH=voice_id_optional

# Optional CORS override
ALLOWED_ORIGINS=http://localhost:5173

# AWS credentials normally provided via ~/.aws/credentials or environment variables
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-2
```

### Front-end (`eta/.env`)

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_AUTH0_DOMAIN=dev-eta.ca.auth0.com
VITE_AUTH0_CLIENT_ID=Rgq8OF7zgiCBvbpAN4oa3CDmRjouNxA4
```

These default values match the current source; change them for your Auth0 tenant and API host as required.

---

## Local Development

### 1. Install dependencies

```bash
# Back-end
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Front-end
cd ../eta
npm install
```

### 2. Run the Flask API

```bash
cd backend
source .venv/bin/activate
python app.py
```

The API listens on `http://localhost:3000` by default.

### 3. Run the React front-end

```bash
cd eta
npm run dev
```

Open the printed URL (usually `http://localhost:5173`) and authenticate via Auth0 to reach the chat experience.

---

## Back-end API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/user/sync` | POST | Upserts a user using ETA ID, Auth0 subject, or email, normalises chat history, and returns the latest profile. |
| `/upload-context` | POST (multipart) | Accepts PDF uploads, extracts and summarises text with Gemini, and stores the summary in DynamoDB. |
| `/thread/create_chat_thread` | POST | Creates a new empty chat thread for the user. |
| `/thread/get_chat_thread/` | GET | Returns a normalised thread with messages. |
| `/thread/add_message` | POST | Appends a user message, generates an assistant reply via Gemini, and persists both. |
| `/generate-notes` | POST | Produces notes for the active thread and stores them in the chat history. |
| `/generate-practice-problems` | POST | Produces practice questions grounded in context/history. |
| `/voice-response` | POST | Generates a spoken reply using Gemini + ElevenLabs and returns the MP3 stream with an animation hint (header `X-Animation`). |

All chat-related endpoints expect `PRIMARY_KEY`/`eta_id` plus a DynamoDB `chatID` to identify the user’s thread.

---

## Voice & Animation Flow

1. Front-end posts a question to `/voice-response` with the selected persona and chat context.
2. Flask builds a combined prompt, asks Gemini for the reply text and an emotion keyword, then hands the text to ElevenLabs for synthesis.
3. The response body is an MP3 stream; header `X-Animation` carries the emotion (e.g. `talking`, `gangnamstyle`).
4. The React client stores the MP3 blob, shows a manual play bar, and locks the avatar into the chosen animation until playback completes.

---

## Troubleshooting

- **Voice playback blocked** – Safari requires a user gesture. Press the play button in the inline player when prompted.
- **PDF upload fails** – confirm the file is a PDF (<10 MB) and that `GEMINI_API_KEY` is set. Check the Flask logs for extraction errors (`debug` info is stored next to the context entry in DynamoDB).
- **Auth0 login loops** – ensure `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, and the callback URL match your Auth0 application settings.
- **DynamoDB access denied** – set AWS credentials and region before launching the API, or attach an IAM role with DynamoDB permissions when deploying.

---

## License

This project is provided under the MIT License. See the `LICENSE` file if present or add one before distributing.
