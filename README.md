<a id="top"></a>

<div align="center">

  <!-- HERO LOGO / BANNER -->
  <a href="https://crust-data-studio.onrender.com" target="_blank">
    <img src="https://raw.githubusercontent.com/AHAS2005/crust-data-studio/main/frontend/public/logo_transparent_dark.png" alt="CRUST Studio Logo" width="340px" style="max-width: 100%; height: auto;" />
  </a>

  <br/><br/>

  <h1>⚡ CRUST Data Studio</h1>
  
  <p align="center">
    <b>Deterministic Statistical Profiling × AST-Sandboxed LLM Intelligence × Event-Sourced Reversible Pipelines</b>
    <br/>
    <sub>The modern developer's defense system against silent data corruption, hallucinated fixes, and dirty CSV chaos.</sub>
  </p>

  <!-- LIVE DEMO CALLOUT -->
  <p align="center">
    <a href="https://crust-data-studio.onrender.com">
      <img src="https://img.shields.io/badge/⚡%20LAUNCH%20LIVE%20STUDIO-crust--data--studio.onrender.com-00F5D4?style=for-the-badge&logo=render&logoColor=black&labelColor=0f172a" alt="Live Demo" />
    </a>
  </p>

  <!-- TECH & STATUS BADGES -->
  <p align="center">
    <a href="https://github.com/AHAS2005/crust-data-studio"><img src="https://img.shields.io/github/stars/AHAS2005/crust-data-studio?style=for-the-badge&logo=github&color=FEE440&logoColor=black" alt="GitHub Stars" /></a>
    <a href="https://github.com/AHAS2005/crust-data-studio/fork"><img src="https://img.shields.io/github/forks/AHAS2005/crust-data-studio?style=for-the-badge&logo=git&color=9B5DE5&logoColor=white" alt="Forks" /></a>
    <a href="https://github.com/AHAS2005/crust-data-studio/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-00BBF9?style=for-the-badge" alt="License" /></a>
    <img src="https://img.shields.io/badge/Python-3.10%20%7C%203.11%20%7C%203.12%20%7C%203.14-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python Version" />
    <img src="https://img.shields.io/badge/FastAPI-0.115+-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI" />
    <img src="https://img.shields.io/badge/React%2018-Vite-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 18" />
    <img src="https://img.shields.io/badge/Tailwind-CSS%203-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
    <img src="https://img.shields.io/badge/LLM-Groq%20%7C%20NVIDIA%20NIM%20%7C%20Ollama-F15BB5?style=for-the-badge&logo=openai&logoColor=white" alt="LLM Engine" />
  </p>

  <!-- QUICK NAVIGATION BAR -->
  <p align="center">
    <a href="#-the-vibe--problem"><b>Vibe Check</b></a> •
    <a href="#-how-it-works"><b>Architecture</b></a> •
    <a href="#-key-features"><b>Features</b></a> •
    <a href="#-quick-start"><b>Quick Start</b></a> •
    <a href="#-api-docs"><b>API Reference</b></a> •
    <a href="#-security-first"><b>Security</b></a> •
    <a href="#-deploy"><b>Deploy Free</b></a>
  </p>

</div>

---

## 🎯 The Vibe & The Problem

> **"80% of data science is data cleaning, and 99% of blind AI cleaning corrupts your dataset silently."**

Letting an autonomous LLM rewrite your tabular dataset directly is a recipe for disaster — hallucinated numbers, deleted valid outliers, mutated IDs, and catastrophic type casting.

**CRUST** flips the script:
1. **0% AI Hallucinations in Discovery:** Data quality issues are diagnosed using **100% deterministic mathematics and vectorised statistical profiling** (IQR, MAD, boundary checks, duplicate grouping).
2. **AST-Guarded Code Generation:** The LLM only writes targeted, scoped transformation recipes (`def clean_step(df):`).
3. **Execution In Sandbox Subprocess:** Code runs in an isolated Python process protected by Abstract Syntax Tree (AST) validation and execution timeout guards.
4. **Human-In-The-Loop Diff & Safety Checks:** Preview side-by-side row and cell-level diffs with automatic rejection if row loss exceeds safety thresholds ($>50\%$).
5. **Event-Sourced Reversibility:** Raw data is **never** mutated in place. Every accepted change is an event in an immutable recipe ledger that can be rolled back with zero data loss.

<div align="right"><a href="#top">⬆ Back to Top</a></div>

---

## ⚡ Interactive Architecture Flow

```text
 ┌────────────────┐       ┌─────────────────────────┐       ┌────────────────────────┐
 │   User CSV     │ ────▶ │  Deterministic Profiler │ ────▶ │  Quality Health Score  │
 │ (upload/drag)  │       │ (Pandas / NumPy Math)   │       │  & Categorised Issues  │
 └────────────────┘       └─────────────────────────┘       └───────────┬────────────┘
                                                                        │
                                                                        ▼
 ┌───────────────────────────────────────────────────────────────────────────────────┐
 │                                Human-in-the-Loop                                  │
 │                                                                                   │
 │   ┌──────────────────────┐    Propose Fix     ┌───────────────────────────────┐   │
 │   │  LLM Engine (BYOK)   │ ─────────────────▶ │    AST Security Guardrail     │   │
 │   │ Groq / NIM / Ollama  │                    │ Blocks OS/Net/File I/O Exploits│   │
 │   └──────────────────────┘                    └──────────────┬────────────────┘   │
 │                                                              │ Sandboxed Subprocess│
 │                                                              ▼                    │
 │   ┌──────────────────────┐   Side-by-Side     ┌───────────────────────────────┐   │
 │   │ Reversible Event-Ledger│ ◀─── Human Approve ───│ Visual Cell Diff Preview      │   │
 │   │ (Instant Rollbacks)  │                    │ (Highlighting & Safety Check) │   │
 │   └──────────┬───────────┘                    └───────────────────────────────┘   │
 └──────────────┼────────────────────────────────────────────────────────────────────┘
                ▼
 ┌────────────────────────────────┐
 │ Production Cleaned Dataset CSV │
 └────────────────────────────────┘
```

<div align="right"><a href="#top">⬆ Back to Top</a></div>

---

## ✨ Key Superpowers

<table>
<tr>
<td width="50%" valign="top">

### 🔍 Deterministic Profiling
- **Zero-AI Diagnostics:** Vectorized algorithms detect missing values, disguised nulls (`?`, `N/A`, `unknown`), mixed numeric columns, duplicate row groups, and date syntax chaos without stochastic model error.
- **Smart Outlier Detection:** Employs Interquartile Range (IQR) and Median Absolute Deviation (MAD) with honest confidence limits.
- **Global Health Score:** Dynamic weighted scoring metric (0-100%) computed in real time.

### 🛡️ AST-Isolated Security Sandbox
- **Static AST Analysis:** Statically evaluates every single line of generated Python before execution, immediately dropping `eval`, `exec`, `os.system`, `subprocess`, socket, or file exports.
- **Process Isolation:** Runs unapproved candidate fixes in separate sub-processes with 8-second execution timeouts to kill runaway `df.merge()` or infinite loops.

</td>
<td width="50%" valign="top">

### 👁️ Split-Pane Visual Diffs
- **Cell-Level Before / After:** Inspect precisely which cells were transformed with real-time green sparkle (`Cleaned`) badges and red warnings.
- **Automated Catastrophe Guards:** Pre-flight checks automatically reject code that drops $>50\%$ of rows or mutates $>90\%$ of total cells.

### ⏪ Event-Sourced Replay Ledger
- **Never Bake the Cake:** Raw data is preserved as an immutable baseline (`df_raw`).
- **One-Click Rollbacks:** Undo step 4 without breaking steps 1-3, or cascade-delete all subsequent steps via deterministic pipeline replay.
- **Audit-Ready:** Export both the final cleaned CSV and the reproducible JSON recipe ledger.

</td>
</tr>
</table>

<div align="right"><a href="#top">⬆ Back to Top</a></div>

---

## 💻 Tech Stack Deep Dive

```
Frontend ────────▶ React 18 • Vite • Tailwind CSS • Lucide Icons
Backend  ────────▶ FastAPI • Uvicorn • Pydantic v2
Engine   ────────▶ Pandas 3.0+ • NumPy • Python AST Engine
AI Layer ────────▶ Groq (Llama 3.3-70B) • NVIDIA NIM (Nemotron) • Ollama / Custom
Hosting  ────────▶ Render Cloud • Docker Ready • Multi-Tenant Isolated Sessions
```

<div align="right"><a href="#top">⬆ Back to Top</a></div>

---

## 🚀 Quick Start (Under 60 Seconds)

You can launch CRUST completely offline without setting up any API keys — it comes with a deterministic offline mock LLM engine right out of the box!

```bash
# 1. Clone the repo
git clone https://github.com/AHAS2005/crust-data-studio.git
cd crust-data-studio

# 2. Install dependencies
pip install -r requirements.txt

# 3. Launch Studio (FastAPI server + compiled React SPA)
python start_app.py
```

### 📺 Expected Terminal Output

```text
=================================================================
  CRUST — Intelligent Data Profiling & Interactive Cleaning Studio
=================================================================
Starting backend API & React frontend on http://127.0.0.1:8000 ...

Opening CRUST in your default browser at http://127.0.0.1:8000 ...
INFO:     Started server process [14820]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

Your default browser will launch automatically at `http://127.0.0.1:8000` with full UI ready to use!

<div align="right"><a href="#top">⬆ Back to Top</a></div>

---

## 🛠️ Step-by-Step Installation & Dev Setup

<details>
<summary><b>👉 Click to expand full Developer & Environment Guide</b></summary>

<br/>

### Prerequisites
- Python 3.10, 3.11, 3.12, or 3.14
- Node.js 18+ *(optional: only needed if developing frontend components)*
- Git

### 1. Virtual Environment Setup (Recommended)

```bash
# Linux/macOS
python3 -m venv venv
source venv/bin/activate

# Windows (PowerShell)
python -m venv venv
.\venv\Scripts\Activate.ps1
```

### 2. Install Python Dependencies
```bash
pip install -r requirements.txt
```

### 3. Frontend Development Server (Live HMR)
If you want to edit React components with hot-module reloading:
```bash
cd frontend
npm install
npm run dev
```
The Vite dev server will spin up on `http://localhost:5173` and proxy API calls seamlessly to FastAPI on port `8000`.

### 4. Compiling Frontend for Production
```bash
cd frontend
npm run build
```
This builds an optimized production distribution bundle into `frontend/dist`, which FastAPI automatically serves on the root URL `/`.

</details>

<div align="right"><a href="#top">⬆ Back to Top</a></div>

---

## 🔑 Bring Your Own Key (BYOK) & Local AI

<details>
<summary><b>👉 Click to expand LLM Configuration Guide (Groq, NIM, Ollama, OpenAI)</b></summary>

<br/>

CRUST is engineered with privacy at its core. **No API keys or private endpoint credentials are ever stored on our server disks or databases.** Keys stay strictly in your browser's encrypted `localStorage` and are transmitted per-request via sanitized headers.

You can configure any of the following directly in the in-app **API Key Modal**:

| Provider | Supported Models | Description |
|---|---|---|
| **Demo Mode** | Built-in Deterministic Engine | Completely offline, zero tokens, zero cost. Perfect for testing. |
| **Groq** | `llama-3.3-70b-versatile`, `llama-3.1-8b-instant` | Blazing fast sub-second inference with automated model fallback. |
| **NVIDIA NIM** | `meta/llama-3.1-70b-instruct`, `nemotron-4-340b` | Enterprise-tier reasoning for complex schema transformations. |
| **Custom / Ollama** | Any model (e.g. `llama3.2`, `qwen2.5-coder`) | Connect to local Ollama (`http://localhost:11434/v1`) or vLLM / OpenAI. |

</details>

<div align="right"><a href="#top">⬆ Back to Top</a></div>

---

## 📚 API Reference

CRUST provides a clean, well-typed REST API built on FastAPI.

<details>
<summary><b>👉 Click to expand Endpoint Documentation</b></summary>

<br/>

### `POST /api/upload`
Upload a CSV dataset to initiate an isolated workspace session.
- **Headers:** `x-session-id: <uuid>`
- **Body:** `multipart/form-data` (`file: dataset.csv`)
- **Returns:** Full statistical health report and column profiling metadata.

### `POST /api/load-sample`
Instantly populates the active session with the built-in messy benchmarking dataset.

### `POST /api/preview-fix`
Generates and executes a candidate cleaning fix in the AST sandbox without committing changes.
```json
// Request Body
{
  "anomaly": {
    "column": "revenue",
    "issue": "missing_values",
    "missing_count": 5
  },
  "custom_instruction": "Fill missing values with median"
}
```
- **Returns:** Proposed Python code, before/after diff summary, cell-level sample diff, and diff safety status.

### `POST /api/ledger/approve`
Approves the reviewed candidate code and executes an event-sourced pipeline replay against raw data.

### `POST /api/ledger/rollback`
Rolls back a single step or cascades backwards:
```json
{
  "step_id": 3,
  "mode": "cascade"
}
```

### `POST /api/ask`
Natural language query bar for descriptive data summaries or analytical step-by-step plans.

### `GET /api/export-csv`
Downloads the live, transformed dataset as a production-ready CSV file.

### `GET /api/export-ledger`
Exports the entire transformation recipe history as a reproducible JSON audit ledger.

</details>

<div align="right"><a href="#top">⬆ Back to Top</a></div>

---

## 🔒 Security & Privacy Architecture

- 🛡️ **AST Guardrail Validation:** Every piece of code is parsed by `ast.parse()` into an Abstract Syntax Tree before execution. It bans:
  - Dangerous function calls (`exec`, `eval`, `open`, `compile`, `globals`, `locals`, `__import__`).
  - Dangerous modules (`os`, `sys`, `subprocess`, `shutil`, `socket`, `requests`, `pickle`).
  - Dangerous Pandas/NumPy I/O methods (`to_csv`, `to_sql`, `to_parquet`, `read_pickle`, `save`, `load`).
- ⏱️ **Subprocess Hard Timeouts:** Code execution is sandboxed inside an isolated Python process with an 8-second circuit breaker.
- 👥 **Zero-Leak Multi-Tenant Isolation:** Sessions are partitioned in memory by UUID session IDs with a 4-hour automatic TTL eviction cleaner, preventing shared-data leaks across concurrent browser tabs.

<div align="right"><a href="#top">⬆ Back to Top</a></div>

---

## ☁️ Deploy to Render in 3 Minutes

<details>
<summary><b>👉 Click to view One-Click Free Cloud Deployment</b></summary>

<br/>

CRUST is engineered as a unified service where FastAPI serves both the REST API and the compiled React production frontend.

1. Fork or push this repository to your **GitHub** account.
2. Go to [Render.com](https://render.com) and click **New +** ➔ **Web Service**.
3. Link your repository:
   - **Environment:** `Python 3`
   - **Branch:** `main`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn server:app --host 0.0.0.0 --port $PORT`
   - **Instance Type:** `Free`
4. Click **Deploy Web Service** — you are live on the web!

</details>

<div align="right"><a href="#top">⬆ Back to Top</a></div>

---

## 🗺️ Product Roadmap

- [x] Deterministic statistical anomaly engine
- [x] Sandboxed LLM code generation with AST security inspection
- [x] Split-pane before/after visual diff with cell-level highlighting
- [x] Event-sourced recipe ledger with single-step & cascading rollback
- [x] Modern pandas 3.0+ string dtype compliance
- [x] Multi-tenant session isolation for web deployments
- [ ] Direct SQL database connection profiling (PostgreSQL, Snowflake, BigQuery)
- [ ] Multi-table relational integrity checks & foreign key matching
- [ ] Exportable clean data transformation pipelines to PySpark / dbt models

<div align="right"><a href="#top">⬆ Back to Top</a></div>

---

## 🤝 Contributing

Contributions make open source an incredible place to build and innovate!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/EpicNewFeature`)
3. Commit your Changes (`git commit -m 'feat: Add EpicNewFeature'`)
4. Push to the Branch (`git push origin feature/EpicNewFeature`)
5. Open a Pull Request

<div align="right"><a href="#top">⬆ Back to Top</a></div>

---

## 📄 License

Distributed under the **MIT License**. Free for personal, academic, and commercial use. See [`LICENSE`](LICENSE) for details.

<br/>

<div align="center">
  <b>Built with passion by <a href="https://github.com/AHAS2005">AHAS2005</a> & Contributors.</b>
  <br/>
  <sub>If CRUST saved your dataset from silent corruption, drop a ⭐ on GitHub!</sub>
  <br/><br/>
  <a href="#top">⬆ Back to Top</a>
</div>
