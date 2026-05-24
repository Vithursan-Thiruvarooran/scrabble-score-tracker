# Scrabble Score Tracker

Real-time Scrabble score tracking with physical board recognition via webcam. Two players connect to a shared game room, drag tiles onto a live board view, and scores are calculated automatically — including word multipliers, cross-words, and bingo bonuses. A webcam pipeline using ArUco markers and Tesseract OCR can optionally read the physical board state directly.

---

## Features

- **Real-time multiplayer** — game state synced instantly over WebSockets; both players see every move as it happens
- **Live score preview** — pending tile placement shows the calculated score (including cross-words and premium squares) before committing
- **Drag-and-drop board** — tiles drag from rack to board with valid-play highlighting and blank-tile letter selection
- **Word challenge system** — dispute opponent plays with a timed acceptance window
- **Full move set** — place, exchange, pass, and resign flows with confirmation dialogs
- **PWA** — installable on mobile (iOS/Android), push notifications for your turn, and a one-tap update prompt when a new version is deployed
- **Physical board detection** *(standalone)* — ArUco marker corners + perspective warp + Tesseract OCR to populate the 15×15 grid from a photo

---

## Architecture

```
scrabble-score-tracker/
├── app/          # React Router v7 frontend
└── server/       # FastAPI backend
    └── board_detection/   # Standalone CV pipeline (not yet wired into the API)
```

**Frontend (`app/`)** — React 19 + React Router v7 + TypeScript + TailwindCSS v4. Socket.IO client connects to the backend. Scoring logic is mirrored from the backend so scores can be previewed client-side without a round-trip.

**Backend (`server/`)** — FastAPI + Python-socketio (async ASGI). Game state is persisted in MongoDB via Motor. Redis holds ephemeral session/state. Push notifications use the Web Push / VAPID protocol.

**Board detection (`server/board_detection/`)** — standalone scripts that detect 4 ArUco markers placed at physical board corners, apply a perspective warp to produce a normalised 1000×1000 px image, then run Tesseract OCR (PSM 10, uppercase whitelist) on each cell.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router v7, TypeScript, TailwindCSS v4 |
| Drag and drop | @dnd-kit/core |
| Realtime | Socket.IO (client + server) |
| Backend | FastAPI, Python 3.8+, Uvicorn |
| Database | MongoDB (Motor async driver) |
| Cache / state | Redis |
| Auth | Custom PBKDF2-HMAC-SHA256 + HMAC token (no external JWT lib) |
| Push notifications | pywebpush + VAPID |
| Board detection | OpenCV, NumPy, Tesseract OCR |
| PWA | Service worker (push, update prompt), Web App Manifest |

---

## Prerequisites

- **Node.js** ≥ 18
- **Python** 3.8+
- **MongoDB** — local instance or Atlas
- **Redis** — local instance or managed
- **Tesseract OCR** — only needed for the board detection scripts

---

## Getting Started

### 1. Clone

```bash
git clone https://github.com/your-username/scrabble-score-tracker.git
cd scrabble-score-tracker
```

### 2. Backend

```bash
cd server
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # then fill in values (see below)
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

### 3. Frontend

```bash
cd app
npm install
cp .env.example .env            # then fill in values (see below)
npm run dev                     # http://localhost:5173
```

---

## Environment Variables

### `app/.env`

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend base URL, e.g. `http://localhost:8001` |
| `VITE_VAPID_PUBLIC_KEY` | VAPID public key for push notification subscription |

### `server/.env`

| Variable | Description | Default |
|---|---|---|
| `MONGODB_URI` | MongoDB connection string | — |
| `MONGODB_DB` | Database name | `scrabble_tracker` |
| `AUTH_SECRET` | Long random secret for HMAC token signing | — |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `REDIS_STATE_TTL` | Game state TTL in seconds | — |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed origins | `http://localhost:5173` |
| `VAPID_PUBLIC_KEY` | VAPID public key (base64url) | — |
| `VAPID_PRIVATE_KEY` | VAPID private key (base64url) | — |
| `VAPID_CONTACT_EMAIL` | Contact email for VAPID | — |
| `APP_BASE_PATH` | Sub-path when deployed behind a reverse proxy, e.g. `/scrabble` | — |
| `TOKEN_EXPIRY_SECONDS` | Auth token lifetime | `86400` (24 h) |
| `LOG_LEVEL` | Python log level | `INFO` |

#### Generating VAPID keys

```bash
pip install pywebpush
python -c "from py_vapid import Vapid; v = Vapid(); v.generate_keys(); print('Public:', v.public_key); print('Private:', v.private_key)"
```

---

## Frontend Scripts

```bash
npm run dev        # Vite dev server with HMR → http://localhost:5173
npm run build      # Production build → build/
npm run typecheck  # react-router typegen + tsc
npm start          # Serve production build on port 3000
```

---

## Board Detection (Standalone)

The scripts in `server/board_detection/` work independently of the API.

**Setup:**

```bash
pip install opencv-python numpy pytesseract
# Also install Tesseract on your system:
# macOS:  brew install tesseract
# Ubuntu: sudo apt install tesseract-ocr
```

**Usage:**

1. Run `generate_aruco_markers.py` to generate the 4 corner marker images and print them.
2. Place the printed markers at the four corners of the physical Scrabble board.
3. Take a photo of the board and run:

```bash
python board_detection.py --image path/to/board.jpg
```

The script outputs a 15×15 letter grid to stdout.

---

## Project Structure

```
app/
├── app/
│   ├── components/
│   │   ├── game/          # Board, rack, toolbar, dialogs
│   │   ├── dashboard/     # Lobby, game list
│   │   └── auth/          # Login / register
│   ├── context/           # Auth, notifications, SW update
│   ├── hooks/             # useGameRoom, useSocketStatus, …
│   ├── routes/            # File-based React Router routes
│   ├── services/          # API + game state types
│   └── utils/             # Tile values, scoring logic
└── public/
    ├── sw.js              # Service worker (push + update)
    └── manifest.json      # PWA manifest

server/
├── main.py                # FastAPI app + lifespan
├── sockets/game.py        # Socket.IO event handlers
├── routes/                # REST endpoints (auth, game, users, push)
├── services/              # Game state, scoring, dictionary, push
├── models/                # Pydantic models
├── db/                    # Motor MongoDB client
└── board_detection/       # Standalone CV pipeline
```
