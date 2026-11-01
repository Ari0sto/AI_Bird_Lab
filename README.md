# AI Bird Lab

AI Bird Lab is a local, AI-powered application for identifying bird species from **photos and audio recordings**. It uses Hugging Face models for recognition, retrieves additional species information from Wikipedia and Wikidata, and stores analysis results in SQLite.

The project uses a multi-service architecture with a **Python AI Server**, a **C# Central Server**, a **TypeScript web frontend**, and **RabbitMQ** for demonstration of message exchange between C# and Python. Docker Compose runs the backend services.

## Features

- Bird species recognition from images and audio recordings, with top-3 predictions and confidence scores.
- Additional species information from Wikipedia and Wikidata, when available.
- Analysis history, search, deletion, statistics, and CSV export.
- Registration, login, and protected API access with ASP.NET Core Identity bearer tokens.
- TypeScript/Vite web interface.
- Docker Compose deployment of the backend services.
- RabbitMQ message publishing from C# and consumption by a separate Python worker.

## Screenshots

The following screenshots show the AI Bird Lab web interface, including analysis, history, and statistics views.

![AI Bird Lab interface — screenshot 1](https://github.com/user-attachments/assets/d547ed88-c1a0-4f7d-b276-78f7c0aaab5e)

![AI Bird Lab interface — screenshot 2](https://github.com/user-attachments/assets/210f71e5-cf57-4e0e-b6f6-01f7295fdb25)

![AI Bird Lab interface — screenshot 3](https://github.com/user-attachments/assets/7eaf388e-2087-4671-97a7-e6bab1d5da0d)

![AI Bird Lab interface — screenshot 4](https://github.com/user-attachments/assets/3c6fa5e3-80cf-4114-8b06-b5c8b5683350)

![AI Bird Lab interface — screenshot 5](https://github.com/user-attachments/assets/928624f3-bc38-4d2d-a226-c5068d2af673)

## Architecture

| Component | Technology | Responsibility |
|---|---|---|
| Central Server | C# / ASP.NET Core (.NET 10) | Authentication, authorization, AI API proxy, and RabbitMQ publisher |
| AI Server | Python / FastAPI | Image and audio recognition, species information, and analysis data |
| Web frontend | TypeScript / Vite | User interface and API integration |
| Message broker | RabbitMQ | Durable queue for demonstration messages |
| Message consumer | Python / pika | Separate worker that receives and acknowledges messages |
| AI database | SQLite | Analysis history and recognition results |
| Authentication database | SQLite | User accounts and authentication data |
| Containerization | Docker / Docker Compose | Backend service deployment |
| Mobile application | Planned | Future mobile client |

### AI request flow

1. The user interacts with the web frontend.
2. The frontend sends HTTP requests to the Central Server.
3. The Central Server authenticates users and authorizes protected requests.
4. AI-related requests are forwarded to the Python AI Server.
5. The AI Server performs recognition and manages analysis data.
6. Results are returned through the Central Server to the frontend.

The frontend communicates with the Central Server using CORS-enabled HTTP requests. Authentication and analysis data are stored in separate SQLite databases. **Analysis history is not yet isolated per authenticated user.**

### RabbitMQ demonstration flow

1. An authenticated client sends `POST /api/rabbitmq/send` to the Central Server.
2. The C# server publishes a JSON message to the durable `birdlab.demo` queue.
3. RabbitMQ delivers the message to the separate Python worker.
4. The worker prints the received JSON to its logs and acknowledges processing.

**RabbitMQ is a separate demonstration feature.** Bird recognition still uses synchronous HTTP requests; image and audio analysis are not queued.

## Project structure

```text
AI_Bird_Lab/
├── backend/                       # Python AI API
│   ├── Dockerfile                 # AI Server image
│   ├── rabbitmq_worker.py         # RabbitMQ consumer
│   └── worker.Dockerfile          # Lightweight worker image
├── central-server/
│   └── BirdLab.CentralServer/     # ASP.NET Core Identity and API gateway
├── frontend/                      # TypeScript / Vite web app
├── data/                          # Local AI history (ignored by Git)
├── tests/                         # Python backend tests
├── tools/ffmpeg/                  # Optional local FFmpeg binaries (ignored by Git)
├── compose.yaml
├── .env.example                   # Example local configuration
├── requirements.txt
└── README.md
```

Local databases, virtual environments, model caches, `.env`, and local FFmpeg binaries are excluded from Git.

## Requirements

For Docker-based execution:

- Docker Desktop with Docker Compose.
- Node.js 20+ and npm to run the web frontend locally.
- Internet access for the first AI model download and Wikipedia/Wikidata lookups.
- Sufficient disk space for PyTorch and cached models.

For running the servers directly on Windows, also install Python 3.11–3.12, the .NET 10 SDK, and FFmpeg for audio processing. Docker's AI Server image already installs FFmpeg.

## Setup and run

### Option 1: Docker Compose (recommended)

1. Create a local environment file in the repository root:

   ```powershell
   Copy-Item .env.example .env
   ```

   Edit `.env` and set `RABBITMQ_USER` and `RABBITMQ_PASSWORD`. Do not commit `.env`. These values are used by the RabbitMQ broker, Central Server, and Python worker. They are **not** AI Bird Lab user credentials.

2. Start Docker Desktop, then run from the repository root:

   ```powershell
   docker compose config --quiet
   docker compose up -d --build
   docker compose ps
   ```

3. Check both backend health endpoints:

   ```powershell
   curl.exe http://localhost:5000/health
   curl.exe http://localhost:5000/api/ai/health
   ```

4. Start the frontend in a separate PowerShell terminal:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

   Open `http://localhost:5173` (or the URL shown by Vite).

The Central Server is available at `http://localhost:5000`. The AI Server is reached through the internal Docker network. The RabbitMQ Management UI is available at `http://localhost:15672`; sign in with the credentials configured in `.env`.

To stop the backend services without deleting stored data:

```powershell
docker compose down
```

**Do not use `docker compose down -v` unless you intentionally want to delete the persisted Docker volumes**, including AI history, authentication data, and RabbitMQ data.

**Note:** RabbitMQ stores its users in a persistent volume. Changing credentials in `.env` after the first initialization does not automatically update an existing RabbitMQ user. Update the existing credentials through RabbitMQ administration instead of deleting all volumes.

### Option 2: Run the AI and Central Servers locally

#### 1. Python AI Server

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

For audio processing, install FFmpeg from [ffmpeg.org](https://ffmpeg.org/download.html). If using the optional local copy in `tools/ffmpeg/bin`, set PATH in each new AI Server terminal:

```powershell
$env:PATH = "$((Get-Location).Path)\tools\ffmpeg\bin;$env:PATH"
ffmpeg -version
```

Start the API:

```powershell
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

- API documentation: `http://127.0.0.1:8000/docs`
- Health check: `http://127.0.0.1:8000/api/health`

#### 2. C# Central Server

In another terminal from the repository root:

```powershell
cd central-server/BirdLab.CentralServer
dotnet restore
$env:AI_SERVER_URL = "http://127.0.0.1:8000"
dotnet run --urls http://localhost:5000
```

- Health check: `http://localhost:5000/health`
- AI Server health proxy: `http://localhost:5000/api/ai/health`
- Protected user endpoint: `http://localhost:5000/api/user/me`

The Central Server creates its local SQLite authentication database as needed. **The RabbitMQ demo endpoint additionally requires a running broker and matching `RABBITMQ_HOST`, `RABBITMQ_USER`, and `RABBITMQ_PASSWORD` environment variables.** For the complete integration, use Docker Compose.

#### 3. Web frontend

From the repository root, in another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The frontend communicates with the Central Server at `http://localhost:5000`. Local CORS configuration permits `localhost:5173` and `127.0.0.1:5173`.

## API overview

### Central Server

Base URL: `http://localhost:5000`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Central Server health check |
| POST | `/api/auth/register` | Register a user |
| POST | `/api/auth/login?useCookies=false` | Authenticate and receive bearer tokens |
| POST | `/api/auth/refresh` | Refresh an access token |
| GET | `/api/user/me` | Authenticated user information |
| GET | `/api/ai/health` | AI Server connectivity check |
| POST | `/api/ai/analyze/image` | Analyze a bird photograph |
| POST | `/api/ai/analyze/audio` | Analyze a bird audio recording |
| GET | `/api/ai/history` | Retrieve analysis history |
| DELETE | `/api/ai/history/{id}` | Delete an analysis record |
| GET | `/api/ai/stats` | Recognition statistics |
| GET | `/api/ai/export` | Export history as CSV |
| POST | `/api/rabbitmq/send` | Publish a demo message to RabbitMQ (authentication required) |

Protected endpoints use **ASP.NET Core Identity** bearer tokens, **not JWTs**.

### Python AI Server

Base URL for local execution: `http://127.0.0.1:8000`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | AI Server health check |
| POST | `/api/analyze/image` | Image classification |
| POST | `/api/analyze/audio` | Audio classification |
| GET | `/api/history` | Analysis history |
| DELETE | `/api/history/{id}` | Delete a record |
| GET | `/api/stats` | Recognition statistics |
| GET | `/api/export` | Export analysis data |

When using the integrated web application, the Python API is accessed through the Central Server.

## RabbitMQ message test

With the Docker services running, log in using an **AI Bird Lab account** to obtain an access token:

```powershell
$email = Read-Host "Email"
$securePassword = Read-Host "Password" -AsSecureString
$password = [System.Net.NetworkCredential]::new("", $securePassword).Password

$login = Invoke-RestMethod `
    -Uri "http://localhost:5000/api/auth/login?useCookies=false" `
    -Method Post `
    -ContentType "application/json" `
    -Body (@{ email = $email; password = $password } | ConvertTo-Json)

Remove-Variable password
$token = $login.accessToken
```

Publish a demonstration message:

```powershell
$body = @{ message = "Hello from C# Central Server!" } | ConvertTo-Json

Invoke-RestMethod `
    -Uri "http://localhost:5000/api/rabbitmq/send" `
    -Method Post `
    -Headers @{ Authorization = "Bearer $token" } `
    -ContentType "application/json" `
    -Body $body
```

The endpoint returns a `published` status and a message ID when publishing succeeds. Verify that Python actually received the message:

```powershell
docker compose logs --tail 30 rabbitmq-worker
```

Expected log content includes `RabbitMQ message received` and the text `Hello from C# Central Server!`.

Open RabbitMQ Management at `http://localhost:15672`, then select **Queues and Streams** and find `birdlab.demo`. The queue may show zero ready messages because the worker has already acknowledged them.

## AI models

| Task | Hugging Face model |
|---|---|
| Object detection | `facebook/detr-resnet-50` |
| Image classification | `dima806/bird_species_image_detection` |
| Audio classification | `dima806/bird_sounds_classification` |

Models are downloaded and cached on first use.

### Limitations

- Recognition is limited to the species supported by the selected models; confidence does not guarantee accuracy.
- Wikipedia and Wikidata information may be incomplete or unavailable.
- Audio processing requires FFmpeg.
- Initial model loading may take time, and CPU inference may be slow.
- Analysis history is not yet isolated by authenticated user.
- The web frontend currently keeps its access token in memory, so refreshing the page requires logging in again.
- The RabbitMQ integration demonstrates message exchange; it does not run bird recognition asynchronously.
- Results are not scientifically verified species identifications.

## Testing

Run Python backend unit tests from the repository root:

```powershell
python -m unittest discover -s tests -v
```

Verify the Central Server build:

```powershell
cd central-server/BirdLab.CentralServer
dotnet build
```

Verify the frontend build:

```powershell
cd frontend
npm run build
```

For integration testing, start Docker Compose, check both health endpoints, test authentication and AI analysis through the web frontend, and verify RabbitMQ publishing and consumption as described above. Unit tests using mocked model responses do not measure real-world recognition accuracy.

## Current status and future development

Implemented:

- Python AI Server with image and audio recognition.
- C# Central Server with ASP.NET Core Identity and an HTTP proxy to the AI Server.
- Docker Compose deployment for the backend services.
- Web frontend with authentication, image/audio analysis, history, statistics, and CSV export.
- RabbitMQ message broker, C# publisher endpoint, and Python consumer worker.

Planned improvements:

- Mobile application development.
- Per-user isolation of analysis history.
- Improved session management and authentication UX.
- HTTPS and production deployment hardening.
- Additional automated integration testing.

## Project scope

AI Bird Lab is an educational and experimental software project focused on AI inference, backend integration, authentication, containerization, and multi-service architecture. It is intended for local development and demonstration rather than production deployment.
