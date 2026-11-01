# AI Bird Lab

AI Bird Lab is a local, AI-powered application for identifying bird species from **photos and audio recordings**. It uses Hugging Face models for recognition, retrieves additional species information from Wikipedia and Wikidata, and stores analysis results in SQLite.

The project uses a multi-service architecture with a **Python AI Server**, a **C# Central Server**, and a **TypeScript web frontend**. The backend services can run together using Docker Compose.

## Features

- Bird species recognition from images and audio recordings.
- Top-3 species predictions with confidence scores.
- Species information from Wikipedia and Wikidata, when available.
- Analysis history with search and deletion.
- Recognition statistics and species distribution charts.
- CSV export of analysis history.
- User registration and login through ASP.NET Core Identity.
- Bearer-token authentication for protected Central Server endpoints.
- Web interface for accessing the application.
- Docker Compose support for the backend services.

## Screenshots

The following screenshots demonstrate the AI Bird Lab web interface, including its analysis, history, and statistics views.

![AI Bird Lab interface — screenshot 1](https://github.com/user-attachments/assets/d547ed88-c1a0-4f7d-b276-78f7c0aaab5e)

![AI Bird Lab interface — screenshot 2](https://github.com/user-attachments/assets/210f71e5-cf57-4e0e-b6f6-01f7295fdb25)

![AI Bird Lab interface — screenshot 3](https://github.com/user-attachments/assets/7eaf388e-2087-4671-97a7-e6bab1d5da0d)

![AI Bird Lab interface — screenshot 4](https://github.com/user-attachments/assets/3c6fa5e3-80cf-4114-8b06-b5c8b5683350)

![AI Bird Lab interface — screenshot 5](https://github.com/user-attachments/assets/928624f3-bc38-4d2d-a226-c5068d2af673)

## Architecture

| Component | Technology | Responsibility |
|---|---|---|
| Central Server | C# / ASP.NET Core (.NET 10) | Authentication, authorization, and API gateway |
| AI Server | Python / FastAPI | Image and audio recognition, species information, and analysis data |
| Web frontend | TypeScript / Vite | User interface and API integration |
| AI database | SQLite | Analysis history and recognition results |
| Authentication database | SQLite | User accounts and authentication data |
| Containerization | Docker / Docker Compose | Backend service deployment |
| Mobile application | Planned | Future mobile client |

### Request flow

1. The user interacts with the web frontend.
2. The frontend sends HTTP requests to the Central Server.
3. The Central Server handles authentication and checks access to protected endpoints.
4. AI-related requests are forwarded to the Python AI Server.
5. The AI Server performs recognition and manages analysis data.
6. Results are returned to the frontend through the Central Server.

The frontend communicates with the Central Server using CORS-enabled HTTP requests.

Authentication and analysis data are stored in separate SQLite databases. Although Central Server endpoints are protected, per-user isolation of AI analysis history is not yet implemented.

## Project structure

```text
AI_Bird_Lab/
├── backend/                    # Python API and AI models
├── central-server/
│   └── BirdLab.CentralServer/  # ASP.NET Core Identity and API gateway
├── frontend/                   # TypeScript / Vite web application
├── data/                       # AI analysis database
├── tests/                      # Backend tests
├── tools/
│   └── ffmpeg/                 # Optional local FFmpeg installation
├── compose.yaml                # Docker Compose configuration
├── requirements.txt
└── README.md
```

Database files, virtual environments, model caches, and local FFmpeg binaries should not be committed to Git.

## Requirements

For local development:

- Windows 10/11 or another supported development environment.
- Python 3.11–3.12.
- .NET 10 SDK.
- Node.js 20+ and npm.
- FFmpeg for audio processing.
- Docker Desktop with Docker Compose for containerized execution.
- Internet access for downloading AI models and retrieving Wikipedia/Wikidata information.
- Sufficient disk space for PyTorch and cached AI models.

Docker can run the backend services without requiring separate local Python and .NET processes.

## Setup and run

### Option 1: Docker Compose (recommended)

From the repository root:

```powershell
docker compose up -d --build
```

Check the running services:

```powershell
docker compose ps
```

Check the Central Server:

```powershell
curl.exe http://localhost:5000/health
```

Check connectivity between the Central Server and AI Server:

```powershell
curl.exe http://localhost:5000/api/ai/health
```

The Central Server is accessible at:

`http://localhost:5000`

The AI Server runs inside the Docker network and is accessed through the Central Server.

To stop the services:

```powershell
docker compose down
```

Persistent database data is stored using Docker volumes.

### Option 2: Run the services locally

#### 1. Python AI Server

Create and activate a virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

For audio processing, install FFmpeg from [ffmpeg.org](https://ffmpeg.org/download.html).

If using a local FFmpeg installation inside the project, add its binaries to PATH:

```powershell
$env:PATH = "$((Get-Location).Path)\tools\ffmpeg\bin;$env:PATH"
ffmpeg -version
```

Start the Python server:

```powershell
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Available endpoints:

- API documentation: `http://127.0.0.1:8000/docs`
- Health check: `http://127.0.0.1:8000/api/health`

#### 2. C# Central Server

Open another PowerShell terminal from the repository root:

```powershell
cd central-server/BirdLab.CentralServer
dotnet restore
```

Configure the AI Server address:

```powershell
$env:AI_SERVER_URL = "http://127.0.0.1:8000"
```

Start the Central Server:

```powershell
dotnet run --urls http://localhost:5000
```

Available endpoints:

- Health check: `http://localhost:5000/health`
- AI Server health proxy: `http://localhost:5000/api/ai/health`
- Protected user endpoint: `http://localhost:5000/api/user/me`

The Central Server automatically creates its authentication SQLite database when required.

### 3. Web frontend

The web frontend is started separately from the backend Docker Compose services.

From the repository root:

```powershell
cd frontend
npm install
npm run dev
```

Open:

`http://localhost:5173`

The frontend communicates with the Central Server at `http://localhost:5000`.

The CORS configuration permits local development from both `localhost:5173` and `127.0.0.1:5173`.

## API overview

### Central Server

Base URL: `http://localhost:5000`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Central Server health check |
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login?useCookies=false` | Authenticate and receive bearer tokens |
| POST | `/api/auth/refresh` | Refresh an access token |
| GET | `/api/user/me` | Retrieve authenticated user information |
| GET | `/api/ai/health` | Check connectivity to the AI Server |
| POST | `/api/ai/analyze/image` | Analyze a bird photograph |
| POST | `/api/ai/analyze/audio` | Analyze a bird audio recording |
| GET | `/api/ai/history` | Retrieve analysis history |
| DELETE | `/api/ai/history/{id}` | Delete an analysis record |
| GET | `/api/ai/stats` | Retrieve recognition statistics |
| GET | `/api/ai/export` | Export analysis history to CSV |

Authentication is required for the protected endpoints.

The application uses **ASP.NET Core Identity** with its built-in bearer-token authentication mechanism. These tokens are not JWTs.

### Python AI Server

Base URL for local execution: `http://127.0.0.1:8000`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | AI Server health check |
| POST | `/api/analyze/image` | Image classification |
| POST | `/api/analyze/audio` | Audio classification |
| GET | `/api/history` | Analysis history |
| DELETE | `/api/history/{id}` | Delete an analysis record |
| GET | `/api/stats` | Recognition statistics |
| GET | `/api/export` | Export analysis data |

The Python API is intended to be accessed through the Central Server when using the integrated application.

## AI models

AI Bird Lab uses the following Hugging Face models:

| Task | Model |
|---|---|
| Object detection | `facebook/detr-resnet-50` |
| Image classification | `dima806/bird_species_image_detection` |
| Audio classification | `dima806/bird_sounds_classification` |

Models are downloaded and cached when first used.

### Limitations

- Recognition is limited to species supported by the selected models.
- Confidence scores do not guarantee identification accuracy.
- Wikipedia and Wikidata information may be incomplete or unavailable.
- Audio processing requires FFmpeg.
- Initial model loading may take time.
- CPU inference may be slower than GPU inference.
- Analysis history is not yet isolated by authenticated user.
- The web frontend currently keeps its access token in memory, so a page refresh requires a new login.
- Recognition results should not be treated as scientifically verified identifications.

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

For Docker-based integration testing, start the backend services and verify both health endpoints before testing authentication and AI analysis through the web interface.

Unit tests that use mocked model responses do not measure real-world recognition accuracy.

## Current status and future development

The following components have been implemented:

- Python AI Server with image and audio recognition.
- C# Central Server with ASP.NET Core Identity.
- HTTP integration between the Central Server and AI Server.
- Docker Compose deployment for backend services.
- Web frontend integration with authentication and protected API requests.
- Analysis history, statistics, and CSV export.

Planned improvements include:

- RabbitMQ integration for message exchange between backend services.
- Mobile application development.
- Per-user isolation of analysis history.
- Improved session management and authentication UX.
- HTTPS and production deployment configuration.
- Additional automated integration testing.

## Project scope

AI Bird Lab is an educational and experimental software project focused on AI inference, backend integration, authentication, containerization, and multi-service architecture.

It is intended for local development and demonstration rather than production deployment.