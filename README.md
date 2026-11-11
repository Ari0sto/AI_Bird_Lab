# AI Bird Lab

AI Bird Lab is a local, AI-powered application for identifying bird species from **photos and audio recordings**. It uses Hugging Face models for recognition, retrieves additional species information from Wikipedia and Wikidata, and stores analysis results in SQLite.

The project uses a multi-service architecture with a **Python AI Server**, a **C# Central Server**, a **TypeScript/Vite web app**, an **Expo/React Native mobile app**, and **RabbitMQ** for demonstration of message exchange between C# and Python. Docker Compose runs the backend services.

A demonstration subscription system uses an Ethereum smart contract on the **Sepolia testnet**. Users can connect a MetaMask wallet and subscribe through the web app. The mobile app reads the same account-level subscription status from the Central Server; it does **not** initiate wallet connections or payments.

## Features

- Bird species recognition from images and audio recordings, with top-3 predictions and confidence scores.
- Additional species information from Wikipedia and Wikidata, when available.
- Analysis history, search, deletion, statistics, and CSV export.
- Registration, login, and protected API access with ASP.NET Core Identity bearer tokens.
- TypeScript/Vite web interface and Expo/React Native mobile app.
- Free tier with **five analysis attempts per user**, shared between image and audio requests.
- MetaMask wallet linking via signed challenge, and paid demonstration subscriptions on **Ethereum Sepolia**.
- Unlimited image and audio analyses while a subscription is active.
- Shared subscription status across the web and mobile apps when signed into the same account.
- Mobile subscription/remaining-attempts status display; subscription purchase is available in the web app.
- Docker Compose deployment of the backend services.
- RabbitMQ message publishing from C# and consumption by a separate Python worker.

## Screenshots

The following screenshots show the AI Bird Lab web interface, including analysis, history, and statistics views. Subscription and mobile screenshots can be added separately.

![AI Bird Lab interface — screenshot 1](https://github.com/user-attachments/assets/d547ed88-c1a0-4f7d-b276-78f7c0aaab5e)

![AI Bird Lab interface — screenshot 2](https://github.com/user-attachments/assets/210f71e5-cf57-4e0e-b6f6-01f7295fdb25)

![AI Bird Lab interface — screenshot 3](https://github.com/user-attachments/assets/7eaf388e-2087-4671-97a7-e6bab1d5da0d)

![AI Bird Lab interface — screenshot 4](https://github.com/user-attachments/assets/3c6fa5e3-80cf-4114-8b06-b5c8b5683350)

![AI Bird Lab interface — screenshot 5](https://github.com/user-attachments/assets/928624f3-bc38-4d2d-a226-c5068d2af673)

## Architecture

| Component | Technology | Responsibility |
|---|---|---|
| Central Server | C# / ASP.NET Core (.NET 10) | Authentication, per-user quotas, wallet linking, subscription checks, AI API proxy, and RabbitMQ publisher |
| AI Server | Python / FastAPI | Image and audio recognition, species information, and analysis data |
| Web frontend | TypeScript / Vite | User interface, MetaMask wallet connection, subscription purchase, and AI API integration |
| Message broker | RabbitMQ | Durable queue for demonstration messages |
| Message consumer | Python / pika | Separate worker that receives and acknowledges messages |
| AI database | SQLite | Analysis history and recognition results |
| Authentication database | SQLite | User accounts and authentication data |
| Containerization | Docker / Docker Compose | Backend service deployment |
| Mobile application | Expo / React Native | Authentication, AI analysis, and account subscription/quota status |
| Blockchain | Ethereum Sepolia / Solidity | Testnet subscription contract and on-chain membership checks |

### AI request flow

1. The user interacts with the web or mobile app.
2. The client sends HTTP requests to the Central Server.
3. The Central Server authenticates users and authorizes protected requests.
4. AI-related requests are forwarded to the Python AI Server.
5. The AI Server performs recognition and manages analysis data.
6. Results are returned through the Central Server to the requesting client.

The web frontend communicates with the Central Server using CORS-enabled HTTP requests. The mobile app calls the same API. Authentication and analysis data are stored in separate SQLite databases. **Analysis history is not yet isolated per authenticated user.**

### Subscription and quota flow

1. A registered user starts with **five free AI analyses** across photo and audio requests.
2. In the **web app**, the user connects MetaMask and signs a server-issued challenge. Signature verification binds the wallet address to the authenticated account; signing does not spend ETH.
3. The user purchases a subscription through the Solidity contract deployed on the **Sepolia testnet**, using **Sepolia test ETH**. The demonstrated subscription price is **0.001 Sepolia ETH** (check the deployed contract for its authoritative settings).
4. The Central Server reads subscription status from the deployed contract. When active, the user can analyze images and audio without consuming free attempts.
5. The **mobile app** uses the same Central Server and account, so a subscription purchased on the web also applies to mobile analysis. Mobile displays the status and free quota but does **not** contain a MetaMask payment flow.

The Central Server, rather than either client, decides whether a request consumes a free attempt or is covered by an active subscription. Subscription checks require the configured Sepolia RPC endpoint to be reachable.

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
│   ├── BirdLab.CentralServer/     # ASP.NET Core Identity and API gateway
│   └── BirdLab.CentralServer.Tests/ # xUnit API, service and database tests
├── frontend/                      # TypeScript / Vite web app
├── mobile/                        # Expo / React Native mobile app
├── blockchain/                    # Solidity contract, Hardhat project, deployment artifacts
├── data/                          # Local AI history (ignored by Git)
├── tests/                         # Python backend unit tests
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
- Node.js 20+ and npm to run the web or mobile frontend locally.
- Expo Go on a compatible physical device (or a configured Android emulator) for the mobile client.
- MetaMask and **Sepolia test ETH** to demonstrate wallet linking and web subscriptions.
- A Sepolia RPC endpoint and the address of the deployed subscription contract for blockchain features.
- Internet access for the first AI model download and Wikipedia/Wikidata lookups.
- Sufficient disk space for PyTorch and cached models.

For running the servers directly on Windows, also install Python 3.11–3.12, the .NET 10 SDK, and FFmpeg for audio processing. Docker's AI Server image already installs FFmpeg.

## Setup and run

### Option 1: Docker Compose (recommended)

1. Create a local environment file in the repository root:

   ```powershell
   Copy-Item .env.example .env
   ```

   Edit `.env` and set `RABBITMQ_USER` and `RABBITMQ_PASSWORD`. These values are used by the RabbitMQ broker, Central Server, and Python worker. They are **not** AI Bird Lab user credentials.

   To enable Sepolia subscriptions, also configure `SEPOLIA_RPC_URL` and `BIRD_CONTRACT_ADDRESS` (the deployed contract address). Ensure `compose.yaml` passes both variables to the Central Server. Set these values to your **own deployment**; a fresh clone does not automatically create or deploy a contract. Never commit `.env`, RPC URLs with private API credentials, private keys, seed phrases, or wallet keystores.

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

### Run the mobile app (Expo)

With Docker Compose running, launch the Expo app in another PowerShell terminal:

```powershell
cd mobile
npm install
npx expo start --tunnel --clear
```

Open the QR code in Expo Go. `--tunnel` provides access to the **Expo development server**, not to the backend API. The phone must also be able to reach the Central Server.

For testing on a physical phone when local-network access to port 5000 is unavailable, start an **independent backend tunnel** in another terminal:

```powershell
ngrok http 5000
```

Set the mobile app's API base URL (for example, `EXPO_PUBLIC_API_URL`, where that setting is read by the project's API configuration) to the **current ngrok HTTPS forwarding URL**, then restart Expo:

```dotenv
EXPO_PUBLIC_API_URL=https://YOUR-NGROK-DOMAIN.ngrok-free.app
```

```powershell
npx expo start --tunnel --clear
```

The backend tunnel's URL is a development setting, not a permanent production endpoint. Do not commit a temporary ngrok URL or expose a development server to untrusted users. If using a local network address instead, the phone and PC must be able to reach one another, and Docker's port binding/firewall settings must permit access.

**Subscription behavior on mobile:** sign into the **same AI Bird Lab account** that purchased a subscription through the web app. Mobile displays the active subscription and provides unlimited analysis while the Central Server confirms it on Sepolia. Wallet pairing and subscription purchase are currently **web-only**.

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

The Central Server creates its local SQLite authentication database as needed. For local Sepolia subscription checks (outside Docker), set `SEPOLIA_RPC_URL` and `BIRD_CONTRACT_ADDRESS` in the Central Server process environment as well. **The RabbitMQ demo endpoint additionally requires a running broker and matching `RABBITMQ_HOST`, `RABBITMQ_USER`, and `RABBITMQ_PASSWORD` environment variables.** For the complete integration, use Docker Compose.

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
| GET | `/api/ai/quota` | Current free-analysis quota and subscription-aware access status |
| POST | `/api/wallet/challenge` | Issue a wallet-signing challenge |
| POST | `/api/wallet/verify` | Verify wallet signature and link wallet to account |
| GET | `/api/wallet/status` | Linked-wallet and subscription status |
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

- Subscriptions are implemented on the **Sepolia testnet**, not Ethereum mainnet; Sepolia ETH has no real monetary value.
- Wallet connection and subscription purchase are **web-only**; the mobile app displays subscription state and uses the account-level entitlement.
- Blockchain subscription checks depend on availability of the configured Sepolia RPC service.

- Recognition is limited to the species supported by the selected models; confidence does not guarantee accuracy.
- Wikipedia and Wikidata information may be incomplete or unavailable.
- Audio processing requires FFmpeg.
- Initial model loading may take time, and CPU inference may be slow.
- Analysis history is not yet isolated by authenticated user.
- The web frontend currently keeps its access token in memory, so refreshing the page requires logging in again.
- The RabbitMQ integration demonstrates message exchange; it does not run bird recognition asynchronously.
- Results are not scientifically verified species identifications.

## Testing

The project includes automated tests for its five main components. All **298 tests passed** in the latest local test runs.

| Component | Test framework | Passing tests | Measured coverage |
|---|---|---:|---|
| Python AI Server | `unittest` + Coverage.py | 113 | 100% statements, 99% combined with branches |
| C# Central Server | xUnit + Coverlet | 49 | 52.17% raw Cobertura line rate; approximately 75.5% excluding generated OpenAPI code |
| Solidity contracts | Hardhat | 22 | 100% |
| Web frontend | Vitest + V8 Coverage | 40 | 86.56% lines; 80.24% branches |
| Expo / React Native mobile | Jest + `jest-expo` | 74 | 58.66% lines; 38.87% branches |
| **Total** | | **298** | Coverage is reported by component, not as a single project-wide percentage |

Coverage values are from the final local runs. Automated tests use mocks for external services where appropriate; passing unit tests do not establish live RPC, model inference, or end-to-end service availability.

### Run automated tests (PowerShell)

Run these commands from the **repository root** (`AI_Bird_Lab`), using a separate terminal or returning to the root before each group.

**Python AI Server:**

```powershell
python -m pip install coverage
python -m coverage run --branch --source=backend -m unittest discover -s tests -p "test_*.py"
python -m coverage report -m
```

**C# Central Server:**

```powershell
cd central-server/BirdLab.CentralServer.Tests
dotnet restore
dotnet test --collect:"XPlat Code Coverage"
cd ../..
```

The Cobertura XML report is created under `central-server/BirdLab.CentralServer.Tests/TestResults/`. The raw report includes generated OpenAPI source; compare coverage of application code separately if reporting that adjusted figure.

**Blockchain (Hardhat):**

```powershell
cd blockchain
npm ci
npx hardhat test
cd ..
```

**Web frontend:**

```powershell
cd frontend
npm ci
npm test -- --coverage
cd ..
```

**Mobile (Expo / Jest):**

```powershell
cd mobile
npm ci
npm test -- --coverage --collectCoverageFrom="src/**/*.{ts,tsx}"
cd ..
```

`npm ci` assumes the corresponding `package-lock.json` is committed and in sync with `package.json`; otherwise run `npm install` locally, verify the lockfile, and commit it. Coverage output and other generated test artifacts are ignored by Git.

### Manual integration checks

For integration testing, start Docker Compose, check both health endpoints, test authentication and AI analysis through the web frontend, and verify RabbitMQ publishing and consumption as described above. Unit tests using mocked model responses do not measure real-world recognition accuracy.

For subscription and mobile integration, verify:

1. A free account can analyze up to five images/audio recordings in total.
2. A web user can connect MetaMask, sign the challenge, and purchase a **Sepolia** subscription.
3. The server reports an active subscription and permits both photo and audio analysis without decrementing the free quota.
4. The **same account** on Mobile App displays subscription status and can perform photo/audio analyses.
5. A free account on Mobile App shows its remaining free attempts.

The web payment flow and subscription-aware image/audio analysis have been manually exercised during development; the mobile client was also manually tested for status display and analysis. These checks are not a substitute for automated integration tests or production/security testing.

## Current status and future development

Implemented:

- Python AI Server with image and audio recognition.
- C# Central Server with ASP.NET Core Identity and an HTTP proxy to the AI Server.
- Docker Compose deployment for the backend services.
- Web frontend with authentication, image/audio analysis, history, statistics, and CSV export.
- Expo/React Native mobile app with authentication, image/audio analysis, and subscription/quota status.
- Five free analysis attempts per user and an account-level Sepolia subscription for unlimited analysis.
- MetaMask wallet linking and testnet subscription payment through the web app.
- RabbitMQ message broker, C# publisher endpoint, and Python consumer worker.

Planned improvements:

- Optional wallet connection and subscription payment directly inside the mobile app.
- Per-user isolation of analysis history.
- Improved session management and authentication UX.
- HTTPS and production deployment hardening.
- Additional automated integration testing.

## Project scope

AI Bird Lab is an educational and experimental software project focused on AI inference, backend integration, authentication, containerization, blockchain integration, and multi-service architecture. The payment mechanism uses **testnet funds only**. It is intended for local development and demonstration rather than production deployment.
