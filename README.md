# CRUST — Intelligent Data Profiling & Interactive Cleaning Studio

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![Pandas](https://img.shields.io/badge/Data-Pandas%20%2B%20NumPy-150458?style=flat-square&logo=pandas)](https://pandas.pydata.org)
[![TailwindCSS](https://img.shields.io/badge/UI-Tailwind%20CSS-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com)

**CRUST** is a high-performance, human-in-the-loop data profiling and cleaning platform. It combines deterministic statistical diagnostics with AST-sandboxed LLM intelligence to detect data anomalies, explain root causes, generate verified pandas cleaning scripts, and maintain a fully reversible transformation ledger.

---

## Key Features

- **Automated Data Profiling:** Computes health scores, missing value ratios, duplicate detection, boundary violations, date sequence inconsistencies, and skewness across large datasets.
- **Universal LLM Engine (BYOK):** Connect **any** local or cloud LLM using OpenAI-compatible endpoints:
  - **Local & Private:** Ollama (`llama3.2`, `qwen2.5-coder`), LM Studio, LocalAI, vLLM
  - **Cloud APIs:** OpenAI (`gpt-4o-mini`), OpenRouter, Groq (`llama-3.3-70b`), NVIDIA NIM (`nemotron`)
  - **Zero-Key Offline Sandbox:** Built-in deterministic mock engine for complete offline operation.
- **AST Safety Guardrails:** Every LLM-generated cleaning function is parsed via Python AST before execution to block dangerous calls (`eval`, `exec`, `os.system`, filesystem/network operations) and runs inside a subprocess with enforced timeout limits.
- **Side-by-Side Cell Diffs:** Visual split-pane highlighting modified cells, row changes, and transformation summaries before changes are committed.
- **Reversible Audit Ledger:** Every cleaning step is recorded in an immutable ledger with cascading or single-step rollback support.
- **One-Click Export:** Download cleaned datasets as CSV or export the complete transformation audit trail as JSON.

---

## Quick Start (Local)

### Prerequisites
- Python 3.10+
- (Optional for development) Node.js 18+

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/your-username/crust-data-studio.git
cd crust-data-studio
pip install -r requirements.txt
```

### 2. Launch the Application
```bash
python start_app.py
```
This starts the unified FastAPI server and automatically opens your browser at `http://127.0.0.1:8000`.

---

## Free Cloud Deployment (Render)

CRUST is engineered as a unified service where FastAPI serves both the REST API and the compiled React production frontend.

### Deploy to Render in 3 Minutes:
1. Push this repository to your **GitHub** account.
2. Sign in to [Render.com](https://render.com) and click **New +** -> **Web Service**.
3. Select your repository and configure:
   - **Environment:** `Python 3`
   - **Branch:** `main`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn server:app --host 0.0.0.0 --port $PORT`
   - **Plan:** `Free`
4. Click **Create Web Service**. Your live CRUST app will be available on your `.onrender.com` URL.

---

## Security & Privacy

- **No Stored Keys:** All user API keys and custom model endpoints are stored strictly in the client browser (`localStorage`). No credentials are ever saved to databases or server disks.
- **Restricted Execution:** Python execution is sandboxed with limited builtins and timeouts.

---

## License
MIT License. Free for personal, academic, and commercial use.
