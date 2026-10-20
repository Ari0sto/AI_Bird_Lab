# AI Bird Lab

**AI Bird Lab** is a local web application for recognizing, classifying, and analyzing bird species from photos and audio recordings using Hugging Face machine learning models.

The application allows you to analyze bird images and songs, retrieve information about predicted species from Wikipedia and Wikidata, save recognition history, view statistics, and export results to CSV.

## Features

- **Photo analysis:** bird recognition in JPG and PNG images.
- **Audio analysis:** bird song classification from WAV, MP3, FLAC, OGG, and M4A files.
- **AI models:** usage of Hugging Face Transformers for local inference.
- **Top-3 predictions:** three most likely species with confidence scores.
- **Bird information:** scientific name, family, habitat, diet, and description from Wikipedia/Wikidata.
- **SQLite:** saving recognition history with search and delete capabilities.
- **Statistics:** total number of analyses, most frequent species, maximum and minimum confidence.
- **CSV export:** saving history to `bird_analysis.csv`.
- **Web GUI:** interface built with TypeScript, HTML, and CSS.

## Technologies

| Component | Technology |
|---|---|
| Backend | Python, FastAPI |
| Frontend | TypeScript, HTML, CSS, Vite |
| Machine Learning | Hugging Face, Transformers, PyTorch |
| Image Classification | Vision Transformer (ViT) |
| Bird Detection | DETR |
| Audio Classification | Wav2Vec2 |
| Audio Processing | FFmpeg |
| Database | SQLite |
| Information API | Wikipedia, Wikidata |
| Statistics | Chart.js |

## Server Architecture

AI Bird Lab is being extended into a multi-service architecture.

### Components

| Component | Technology | Status |
|---|---|---|
| Central Server | C# / ASP.NET Core (.NET 10) | Basic server implemented |
| AI Server | Python / FastAPI | Operational |
| Database | SQLite | Operational |
| Web Application | TypeScript / Vite | Existing prototype |
| Mobile Application | TBD | Planned |

### Central Server
The Central Server is developed using ASP.NET Core.

**Current functionality:**
- Independent application startup.
- HTTP API available on port 5000.
- Basic endpoint for verifying server operation.

**Start:**
```powershell
cd central-server/BirdLab.CentralServer
dotnet run --urls http://localhost:5000
```
**Test endpoint (default project template):**
http://localhost:5000/weatherforecast

### AI Server
The existing Python FastAPI backend serves as the AI Server.

**Its functionality includes:**
- Bird image classification.
- Bird audio classification.
- Information retrieval using Wikipedia and Wikidata.
- SQLite storage of analysis results.

The AI Server runs independently on port 8000.
**API documentation:**
http://localhost:8000/docs

Use the existing backend startup instructions to launch the AI Server.

### Database
The project currently uses SQLite.
The existing database and data storage remain managed by the Python backend. Migration to Microsoft SQL Server is not required.

### Future Development
Planned improvements include:
- REST API communication between Central Server and AI Server.
- Centralized request handling and business logic.
- Database access architecture refinement.
- Integration with Web and Mobile applications.

*Note: Central Server and AI Server can currently be started independently. Communication between them has not yet been implemented.*

## AI Models Used

**Photo recognition:**

- `facebook/detr-resnet-50` — bird detection in an image.
- `dima806/bird_species_image_detection` — bird species classification based on ViT.

**Audio recognition:**

- `dima806/bird_sounds_classification` — bird sound classification based on Wav2Vec2.

Models are automatically downloaded from Hugging Face upon first use and stored in a local cache.

**Important:** models are trained on limited sets of bird species. Classification results may be inaccurate, especially for species not present in the training data.

## Project Structure

```text
AI_Bird_Lab/
│
├── backend/
│   ├── __init__.py
│   ├── main.py
│   ├── settings.py
│   ├── classifier.py
│   ├── wiki.py
│   └── storage.py
│
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.ts
│       ├── api.ts
│       └── styles.css
│
├── tests/
│   └── test_backend.py
│
├── tools/
│   └── ffmpeg/
│       └── bin/
│           ├── ffmpeg.exe
│           ├── ffprobe.exe
│           └── ffplay.exe
│
├── data/
│   └── birds.sqlite3
│
├── requirements.txt
├── .gitignore
└── README.md
```

The `tools/ffmpeg/` and `data/` folders are local and are not included in the GitHub repository. The user installs FFmpeg manually, and the SQLite database is created automatically.

## Installation and Setup

### 1. System Requirements

Recommended configuration:

- Windows 10/11, 64-bit.
- Python 3.11 or 3.12.
- Node.js 20+ and npm.
- FFmpeg for audio processing.
- Internet connection for initial model downloads and retrieving information from Wikipedia/Wikidata.
- Several gigabytes of free space for Python dependencies and AI models.

The application can run on CPU. A dedicated graphics card is not strictly required, though processing on a CPU may take longer.

### 2. Downloading the Project

Clone the repository:

```powershell
git clone https://github.com/Ari0sto/AI_Bird_Lab.git
cd AI_Bird_Lab
```

Alternatively, you can download the project as a ZIP archive from GitHub and extract it.

### 3. Creating a Python Virtual Environment

In the project root folder, run:

```powershell
python -m venv .venv
```

Activate the environment:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install dependencies:

```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

If PowerShell restricts the execution of the activation script, you can use Python directly from the virtual environment:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

**Note:** Initial installation of PyTorch and Transformers may require downloading a significant amount of data.

### 4. Installing FFmpeg on Windows

FFmpeg is required for processing audio files. It converts incoming recordings into a format compatible with the audio model: mono PCM WAV at a 16 kHz sample rate.

For this project, it is recommended to install FFmpeg **locally within the project folder**, rather than globally on Windows.

**Step 1. Download FFmpeg**

Go to the official website:

https://ffmpeg.org/download.html

Select Windows and proceed to the gyan.dev builds.

Download the `ffmpeg-release-essentials.zip` archive.

**Step 2. Extract FFmpeg**

Create a directory inside the project:

```text
tools/ffmpeg/bin/
```

Copy the executable files from the `bin` folder of the extracted archive into it.

The final path should look like this:

```text
AI_Bird_Lab/
└── tools/
    └── ffmpeg/
        └── bin/
            ├── ffmpeg.exe
            ├── ffprobe.exe
            └── ffplay.exe
```

**Step 3. Verify FFmpeg**

Open PowerShell in the project root folder and run:

```powershell
.\tools\ffmpeg\bin\ffmpeg.exe -version
```

If installed correctly, the terminal will display the FFmpeg version and build information.

**Step 4. Add FFmpeg to the current terminal's PATH**

Before starting the Backend, run:

```powershell
$env:PATH = "$((Get-Location).Path)\tools\ffmpeg\bin;$env:PATH"
```

Verify:

```powershell
ffmpeg -version
```

If the FFmpeg version is displayed, the program is accessible to Python.

**Important:** this command only changes the `PATH` in the current terminal. Once you open a new terminal, you must run it again before starting the Backend.

A global installation of FFmpeg or modifying Windows system variables is not required.

### 5. Starting the Backend

In your first PowerShell terminal, open the project root folder.

Activate the virtual environment:

```powershell
.\.venv\Scripts\Activate.ps1
```

If FFmpeg is installed locally, add it to the `PATH`:

```powershell
$env:PATH = "$((Get-Location).Path)\tools\ffmpeg\bin;$env:PATH"
```

Start FastAPI:

```powershell
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

The Backend will be available at:

http://127.0.0.1:8000

Swagger API Documentation:

http://127.0.0.1:8000/docs

Server health check:

http://127.0.0.1:8000/api/health

Expected response:

```json
{
  "status": "ok"
}
```

### 6. Starting the Frontend

Open a second PowerShell terminal.

Navigate to the `frontend` folder:

```powershell
cd frontend
```

Install dependencies:

```powershell
npm install
```

Start Vite:

```powershell
npm run dev
```

The application will be available at:

http://127.0.0.1:5173

The Backend and Frontend must run simultaneously in different terminals.

To verify the production build of the frontend, run:

```powershell
npm run build
```

The build result will appear in `frontend/dist`. In the current configuration, FastAPI does not serve this directory directly.

## Usage

### Photo Analysis

1. Open the photo analysis tab.
2. Upload a bird photo in JPG or PNG format (up to 12 MB).
3. Start the recognition process.
4. Wait for the image to be processed.
5. View the top three most likely species and their confidence scores.
6. Explore the information card for the predicted species.

Before classification, the DETR model checks for the presence of a bird in the image. If no bird is detected, the application will notify you.

### Audio Analysis

1. Open the audio analysis tab.
2. Upload a WAV, MP3, FLAC, OGG, or M4A file (up to 20 MB).
3. Start the recognition process.
4. FFmpeg will automatically convert the recording to the required format.
5. The audio model will analyze the recording and output the top three most likely species.

Audio analysis uses segments up to 5 seconds long taken from the first 60 seconds of the recording.

The quality of the result depends on the volume, background noise, length of the recording, and the specific set of species the model was trained on.

### Bird Information

After recognition, the application queries Wikipedia and Wikidata.

The information card may contain:

- Scientific name.
- Family.
- Habitat or endemic status.
- Main diet.
- Brief description.
- Links to sources.

If information is missing or cannot be reliably obtained, the corresponding field displays:

`Information not found`

The application does not generate biological facts on its own.

An identifiable `User-Agent` is used for HTTP requests to Wikimedia. If deploying the app independently, you must provide valid contact details.

### Recognition History

Results of successful analyses are saved in a local SQLite database:

```text
data/birds.sqlite3
```

Available features:

- View recognition history.
- Search by bird name.
- Delete records.
- Results are saved persistently across application restarts.

The original photos and audio recordings are not saved in the database.

### Statistics

A statistics dashboard is available in the application, featuring:

- Total number of recognitions.
- Most frequently identified species.
- Maximum confidence score.
- Minimum confidence score.
- Species distribution chart.

Visualization is implemented using Chart.js.

### CSV Export

The recognition history can be exported to a file:

`bird_analysis.csv`

The CSV contains the following fields:

```text
image_name
predicted_species
confidence
analysis_date
description
```

The file uses UTF-8 encoding with a BOM for compatibility with Excel.

## REST API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Server health check |
| POST | `/api/analyze/image` | Photo analysis |
| POST | `/api/analyze/audio` | Audio analysis |
| GET | `/api/history` | Retrieve history |
| DELETE | `/api/history/{id}` | Delete a record |
| GET | `/api/stats` | Retrieve statistics |
| GET | `/api/export` | Export to CSV |

Interactive API documentation is available at:

http://127.0.0.1:8000/docs

## Limitations

**Recognition Accuracy**

AI models do not guarantee correct species identification. High confidence is not proof of an accurate classification.

**Limited Set of Species**

Photo and audio models are trained on specific datasets. Some common species may be misidentified or absent from the supported classes.

The audio model classifies 50 bird species and is not designed for the universal recognition of all bird species worldwide.

**Low Confidence**

If all confidence values are low, the result should be treated as a guess rather than a reliable identification.

**External API Availability**

Wikipedia and Wikidata require an internet connection. In the event of network errors, certain information fields may remain empty.

**Incomplete Data**

Not all species have a complete set of structured data in Wikidata. For example, the family might be known, while diet information is missing.

**Performance**

Initial processing may take a significant amount of time due to model weight loading. Subsequent operations use a local cache.

## Error Handling

The application includes error handling for common issues:

- Corrupted image and audio files.
- Unsupported formats.
- No bird detected in the photo.
- Audio is too short or silent.
- Missing FFmpeg installation.
- Hugging Face unavailability during model downloads.
- Wikipedia and Wikidata errors.
- Backend unavailability.
- Invalid user input.

Errors from external information services do not lead to the loss of a successfully obtained classification result.

## Testing

To run automated Backend tests from the project root:

```powershell
python -m unittest discover -s tests -v
```

Automated tests use mocked calls to models and external APIs. They verify application logic but do not evaluate the actual recognition quality of real photos or audio recordings.

To verify the Frontend:

```powershell
cd frontend
npm run build
```

It is recommended to additionally perform manual testing for recognition, history, statistics, and CSV export functionality.

## Sources

- Hugging Face Transformers: https://huggingface.co/docs/transformers
- Hugging Face Bird Image Model: https://huggingface.co/dima806/bird_species_image_detection
- Hugging Face Bird Audio Model: https://huggingface.co/dima806/bird_sounds_classification
- FastAPI: https://fastapi.tiangolo.com/
- FFmpeg: https://ffmpeg.org/
- Wikipedia API: https://www.mediawiki.org/wiki/API:Main_page
- Wikidata API: https://www.wikidata.org/wiki/Wikidata:Data_access
- Chart.js: https://www.chartjs.org/

## Project Purpose

AI Bird Lab is an educational and portfolio project demonstrating the integration of computer vision, audio processing, pre-trained AI models, external information APIs, an SQLite database, and a web interface.

The application is not intended for the scientific identification of birds without further expert verification of the results.