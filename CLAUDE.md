# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Scrabble board and score detection application. A physical Scrabble board is photographed via webcam, and OpenCV + Tesseract OCR detect the placed letters. Players connect to a shared game room over WebSockets to track scores in real time.

## Repository Structure

```
├── app/          # React Router v7 frontend (TypeScript + TailwindCSS v4)
└── server/       # FastAPI backend (Python, async)
    └── board_detection/  # Standalone OpenCV + Tesseract letter-detection scripts
```

## Frontend (`app/`)

### Commands

```bash
cd app
npm install          # install dependencies
npm run dev          # dev server with HMR at http://localhost:5173
npm run build        # production build → build/
npm run typecheck    # react-router typegen + tsc
npm start            # serve production build (port 3000)
```

### Key architecture

- **React Router v7** with file-based routing (`app/routes.ts`). Routes: `/` (home/lobby) and `/game/:roomCode`.
- **Socket.IO client** (`app/socket.ts`) connects to `ws://127.0.0.1:8001/`. This singleton is imported directly by components — not through React context.
- `GameView` manages all Socket.IO event lifecycle for a room (join/leave/messages). It emits `joinGame`/`leaveGame` and listens for `joined_game`, `join_error`, `left_game`, `leave_error`, `message_to_room`.
- `WebcamCapture` uses `getUserMedia` to stream the camera and capture frames as PNG data URLs for board analysis.

## Backend (`server/`)

### Commands

```bash
cd server
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

The `.venv` uses Python 3.8. Key packages: `fastapi`, `uvicorn`, `python-socketio` (async ASGI mode), `motor` (async MongoDB), `pydantic`, `python-dotenv`.

### Environment

Copy `server/.env` and set values before running:

```
MONGODB_URI=mongodb://user:pass@host:27017
MONGODB_DB=scrabble_tracker
AUTH_SECRET=<long random secret>
```

### Key architecture

- **FastAPI** app in `main.py`; Socket.IO server mounted at `/socket.io` via `socketio.ASGIApp`.
- **Socket.IO events** (defined in `main.py`): `createGame`, `joinGame`, `leaveGame`, `message_to_room`. Active rooms are tracked in the in-memory `active_game_rooms: set[str]`. Room codes are 4-character alphanumeric strings.
- **Auth** (`auth.py`): custom PBKDF2-HMAC-SHA256 password hashing; JWT-style tokens built from `user_id:expiry:hmac_signature` (no external JWT library). Token expiry is 24 hours.
- **Database** (`db.py`): Motor async MongoDB client. Connection opened/closed in FastAPI's `lifespan` context manager. Unique index on `users.email`.
- **Models** (`models.py`): Pydantic v2 models for users, auth, and tokens.

## Board Detection (`server/board_detection/`)

Standalone Python scripts — not yet integrated into the API.

- `board_detection.py`: loads a local image, detects 4 ArUco markers (DICT_6X6_250) placed at board corners, applies perspective warp to produce a 1000×1000px normalized board image, then uses contour filtering + Tesseract OCR (psm 10, uppercase whitelist) to populate a 15×15 letter grid.
- `generate_aruco_markers.py`: generates the 4 ArUco marker images to print and place at board corners.
- Requires `opencv-python`, `numpy`, `pytesseract`, and Tesseract installed on the system.
