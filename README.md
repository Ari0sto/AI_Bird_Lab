# AI Bird Lab

AI Bird Lab is a local application for recognizing bird species from **photos and audio recordings**. It uses Hugging Face models, enriches predictions with Wikipedia/Wikidata information, and stores analysis history in SQLite.

The project is evolving into a multi-service system. **The Central Server and AI Server currently run independently; communication between them is not yet implemented.**

## Features

- Bird detection and **top-3 species predictions** for images and recordings.
- Species information from Wikipedia/Wikidata (when available).
- Analysis history, search, deletion, statistics, and CSV export.
- A working frontend prototype (TypeScript/Vite).
- Local user registration, login, token refresh, and protected API access on the Central Server.

## Architecture

| Component | Technology | Current role |
|---|---|---|
| Central Server | C# / ASP.NET Core (.NET 10) | Authentication and protected endpoints; port **5000** |
| AI Server | Python / FastAPI | Bird recognition, species information, history; port **8000** |
| AI data | SQLite (`data/birds.sqlite3`) | Managed by the Python backend |
| Authentication data | SQLite (`auth.db`) | Managed by the C# Central Server |
| Web frontend | TypeScript / Vite | Existing prototype; port **5173** |
| Mobile app | Not selected | Planned, not implemented |

Central Server → AI Server integration is **planned**, not implemented. The existing frontend is a prototype, not the future integrated Web App. The SQLite databases are separate; no MSSQL or Docker is required.

### Project layout

```text
AI_Bird_Lab/
├── backend/                   # Python API and AI models
├── central-server/
│   └── BirdLab.CentralServer/ # ASP.NET Core Identity API
├── frontend/                  # Existing Vite prototype
├── data/                      # Local AI history database (ignored by Git)
├── tests/                     # Backend tests
├── tools/ffmpeg/              # Optional local FFmpeg binaries (ignored by Git)
├── requirements.txt
└── README.md
```

## Requirements

- Windows 10/11, Python **3.11–3.12**, and **.NET 10 SDK**.
- Node.js **20+** and npm **only if running the existing frontend**.
- **FFmpeg** for audio processing.
- Internet access for the first AI model download and Wikipedia/Wikidata requests.
- Sufficient disk space for PyTorch and downloaded models; CPU processing is supported but may be slow.

## Setup and run

Use separate PowerShell terminals for each server. Start commands below from the repository root unless stated otherwise.

### 1. Python AI Server

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

For audio processing, download FFmpeg from [ffmpeg.org](https://ffmpeg.org/download.html) and place the executable files in `tools/ffmpeg/bin/`, or use an existing system installation. If using the local copy, run this in **every new AI Server terminal** from the project root:

```powershell
$env:PATH = "$((Get-Location).Path)\tools\ffmpeg\bin;$env:PATH"
ffmpeg -version
```

Start the server:

```powershell
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

- API documentation: http://127.0.0.1:8000/docs
- Health check: http://127.0.0.1:8000/api/health

### 2. C# Central Server

Open another PowerShell terminal:

```powershell
cd central-server/BirdLab.CentralServer
dotnet restore
dotnet run --urls http://localhost:5000
```

- Health check: http://localhost:5000/health
- Protected endpoint: http://localhost:5000/api/user/me (returns **401** without a valid token)

The Central Server creates its local `auth.db` on startup. It is excluded from Git.

### 3. Existing frontend (optional)

From the repository root, in another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173. The frontend prototype uses the existing Python API; integration with the new Central Server is future work.

## API overview

**Central Server** (`http://localhost:5000`):

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Server status |
| POST | `/api/auth/register` | Register user |
| POST | `/api/auth/login?useCookies=false` | Login and receive Identity bearer tokens |
| POST | `/api/auth/refresh` | Refresh access token |
| GET | `/api/user/me` | Current user (**authentication required**) |

Uses **ASP.NET Core Identity**, including password hashing and its own bearer-token format (**not JWT**). Registration, login, rejection of invalid credentials, protected access, token refresh, duplicate registration, and persistence across restarts were tested locally.

**AI Server** (`http://127.0.0.1:8000`):

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Server status |
| POST | `/api/analyze/image` | Classify image |
| POST | `/api/analyze/audio` | Classify audio |
| GET | `/api/history` | Analysis history |
| DELETE | `/api/history/{id}` | Delete record |
| GET | `/api/stats` | Statistics |
| GET | `/api/export` | Export CSV |

## AI models and limitations

- **Detection:** `facebook/detr-resnet-50` (DETR).
- **Photo classification:** `dima806/bird_species_image_detection` (ViT).
- **Audio classification:** `dima806/bird_sounds_classification` (Wav2Vec2).

Models are downloaded and cached on first use. Recognition is limited to the species supported by these models; confidence is not proof of accuracy. Species data may be incomplete if Wikipedia/Wikidata lack information or are unreachable. Bird recognition is **not intended as a scientifically verified identification**.

## Tests

From the repository root:

```powershell
python -m unittest discover -s tests -v
```

To verify the Central Server build:

```powershell
cd central-server/BirdLab.CentralServer
dotnet build
```

Backend unit tests use mocks and do not measure real-world model accuracy.

## Current scope

This is a **local development project**. The Central Server provides basic authentication, but its tokens are not yet used to protect Python AI endpoints. HTTPS, confirmation emails, deployment hardening, Docker, and full Web/Mobile integration are outside the current scope.
