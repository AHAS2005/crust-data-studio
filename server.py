"""
FastAPI Server for Data Profiling & LLM-Assisted Cleaning Studio
Integrates profiling_functions.py and llm_layer.py with support for:
- File uploads and built-in sample dataset loading
- Health report and Global Health Score calculation
- Bring-Your-Own-Key (BYOK) per-request headers (NVIDIA Nemotron / Groq / Mock)
- AST-sandboxed code generation and execution
- Split-pane cell-level before/after diff extraction
- Reversible ledger and cascading rollback
- Natural language descriptive answers and analytical plans
- Cleaned CSV and ledger JSON export
"""

import os
import io
import json
import tempfile
import pandas as pd
import numpy as np
from fastapi import FastAPI, UploadFile, File, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, Dict, Any, List

from profiling_functions import load_data, generate_health_report
from llm_layer import (
    get_explanation, get_cleaning_code, get_data_summary, get_analysis_plan,
    safe_exec_cleaning_function, compute_diff, compute_cell_diff_sample,
    check_diff_safety, CleaningLedger, test_api_key
)

app = FastAPI(title="CRUST API — Intelligent Data Profiling & Cleaning Studio")

# Allow all origins for seamless local Vite integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global in-memory session state
state = {
    "df_raw": None,
    "df_current": None,
    "ledger": None,
    "report": None,
    "filename": "No dataset loaded",
    "raw_info": None
}


import math

def clean_for_json(obj):
    """Recursively replaces NaN, Inf, -Inf, and pandas nulls with safe primitives for strict JSON compliance."""
    if isinstance(obj, bool):
        return bool(obj)
    elif isinstance(obj, dict):
        return {k: clean_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_for_json(item) for item in obj]
    elif isinstance(obj, (float, np.floating)):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return float(obj)
    elif isinstance(obj, (int, np.integer)):
        return int(obj)
    elif pd.isna(obj):
        return None
    return obj


def calculate_health_score(report: dict) -> int:
    """Calculates an intuitive 0-100% health score based on anomalies, nulls, and duplicates."""
    if not report or not report.get("summary"):
        return 100
    
    summary = report["summary"]
    total_rows = max(1, summary.get("total_rows", 1))
    missing_pct = float(summary.get("overall_missing_percent", 0.0))
    duplicate_rows = int(summary.get("duplicate_row_count", 0))
    anomalies = report.get("anomalies", [])
    
    if len(anomalies) == 0 and missing_pct == 0 and duplicate_rows == 0:
        return 100

    deductions = 0
    # Missing values penalty (up to 30 pts)
    deductions += min(30, missing_pct * 1.5)
    # Duplicate rows penalty (up to 20 pts)
    deductions += min(20, (duplicate_rows / total_rows) * 100)
    # Number of distinct anomalies penalty (up to 40 pts)
    deductions += min(40, len(anomalies) * 3)

    score = max(10, int(round(100 - deductions)))
    return score


class ExplainRequest(BaseModel):
    anomaly: Dict[str, Any]

class PreviewFixRequest(BaseModel):
    anomaly: Dict[str, Any]
    custom_instruction: Optional[str] = None

class ApproveFixRequest(BaseModel):
    anomaly_target: str
    description: str
    code_string: str
    function_name: str = "clean_step"

class RollbackRequest(BaseModel):
    step_id: int
    mode: str = "cascade"  # "cascade" or "single"

class AskRequest(BaseModel):
    question: str
    mode: str = "descriptive"  # "descriptive" or "analytical"

class TestKeyRequest(BaseModel):
    provider: str
    api_key: Optional[str] = ""
    base_url: Optional[str] = None
    model: Optional[str] = None

class TestChatRequest(BaseModel):
    provider: str
    api_key: Optional[str] = ""
    message: Optional[str] = "hi"
    base_url: Optional[str] = None
    model: Optional[str] = None


def get_llm_credentials(
    x_nvidia_api_key: Optional[str] = None,
    x_groq_api_key: Optional[str] = None,
    x_llm_provider: Optional[str] = None,
    x_custom_url: Optional[str] = None,
    x_custom_model: Optional[str] = None,
    x_custom_key: Optional[str] = None
):
    provider = x_llm_provider or "auto"
    use_mock = (provider == "mock")
    return {
        "use_mock": use_mock,
        "provider": provider,
        "nvidia_api_key": x_nvidia_api_key or os.environ.get("NVIDIA_API_KEY"),
        "groq_api_key": x_groq_api_key or os.environ.get("GROQ_API_KEY"),
        "custom_base_url": x_custom_url or os.environ.get("CUSTOM_LLM_URL"),
        "custom_model": x_custom_model or os.environ.get("CUSTOM_LLM_MODEL"),
        "custom_api_key": x_custom_key or os.environ.get("CUSTOM_LLM_KEY"),
    }


@app.get("/api/status")
def get_status():
    if state["df_raw"] is None:
        return clean_for_json({
            "loaded": False,
            "filename": None,
            "total_rows": 0,
            "total_columns": 0,
            "health_score": 100,
            "step_count": 0,
            "steps": [],
            "report": None
        })
    return clean_for_json({
        "loaded": True,
        "filename": state["filename"],
        "total_rows": len(state["df_current"]),
        "total_columns": len(state["df_current"].columns),
        "health_score": calculate_health_score(state["report"]),
        "step_count": len(state["ledger"].steps) if state["ledger"] else 0,
        "steps": state["ledger"].steps if state["ledger"] else [],
        "report": state["report"]
    })


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a CSV file.")

    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, f"upload_{file.filename}")
    content = await file.read()
    with open(temp_path, "wb") as f:
        f.write(content)

    try:
        df, info = load_data(temp_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {e}")
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass

    state["df_raw"] = df.copy()
    state["df_current"] = df.copy()
    state["ledger"] = CleaningLedger(df)
    state["filename"] = file.filename
    state["raw_info"] = info
    state["report"] = generate_health_report(df)

    return clean_for_json({
        "filename": file.filename,
        "info": info,
        "report": state["report"],
        "health_score": calculate_health_score(state["report"]),
        "steps": []
    })


@app.post("/api/load-sample")
def load_sample_dataset():
    sample_path = "messy_classification_dataset.csv"
    if not os.path.exists(sample_path):
        raise HTTPException(status_code=404, detail="Sample dataset not found.")

    df, info = load_data(sample_path)
    state["df_raw"] = df.copy()
    state["df_current"] = df.copy()
    state["ledger"] = CleaningLedger(df)
    state["filename"] = "messy_classification_dataset.csv"
    state["raw_info"] = info
    state["report"] = generate_health_report(df)

    # Check if a sample ledger exists to offer context
    ledger_path = "messy_classification_dataset_ledger.json"
    steps = []
    if os.path.exists(ledger_path):
        try:
            with open(ledger_path, "r") as f:
                data = json.load(f)
                steps = data.get("steps", [])
        except Exception:
            steps = []

    return clean_for_json({
        "filename": state["filename"],
        "info": info,
        "report": state["report"],
        "health_score": calculate_health_score(state["report"]),
        "steps": steps
    })


@app.post("/api/reset")
def reset_workspace():
    state["df_raw"] = None
    state["df_current"] = None
    state["ledger"] = None
    state["report"] = None
    state["filename"] = "No dataset loaded"
    state["raw_info"] = None
    return clean_for_json({"success": True, "status": "ok", "message": "Workspace reset successfully"})


@app.post("/api/explain")
def explain_anomaly(
    req: ExplainRequest,
    x_nvidia_api_key: Optional[str] = Header(None),
    x_groq_api_key: Optional[str] = Header(None),
    x_llm_provider: Optional[str] = Header(None),
    x_custom_url: Optional[str] = Header(None),
    x_custom_model: Optional[str] = Header(None),
    x_custom_key: Optional[str] = Header(None)
):
    creds = get_llm_credentials(
        x_nvidia_api_key, x_groq_api_key, x_llm_provider,
        x_custom_url, x_custom_model, x_custom_key
    )
    try:
        explanation = get_explanation(
            req.anomaly,
            use_mock=creds["use_mock"],
            provider=creds["provider"],
            nvidia_api_key=creds["nvidia_api_key"],
            groq_api_key=creds["groq_api_key"],
            custom_base_url=creds["custom_base_url"],
            custom_model=creds["custom_model"],
            custom_api_key=creds["custom_api_key"]
        )
        return {"explanation": explanation}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/preview-fix")
def preview_fix(
    req: PreviewFixRequest,
    x_nvidia_api_key: Optional[str] = Header(None),
    x_groq_api_key: Optional[str] = Header(None),
    x_llm_provider: Optional[str] = Header(None),
    x_custom_url: Optional[str] = Header(None),
    x_custom_model: Optional[str] = Header(None),
    x_custom_key: Optional[str] = Header(None)
):
    if state["df_current"] is None:
        raise HTTPException(status_code=400, detail="No dataset loaded.")

    creds = get_llm_credentials(
        x_nvidia_api_key, x_groq_api_key, x_llm_provider,
        x_custom_url, x_custom_model, x_custom_key
    )

    try:
        code = get_cleaning_code(
            req.anomaly,
            use_mock=creds["use_mock"],
            provider=creds["provider"],
            nvidia_api_key=creds["nvidia_api_key"],
            groq_api_key=creds["groq_api_key"],
            custom_instruction=req.custom_instruction,
            custom_base_url=creds["custom_base_url"],
            custom_model=creds["custom_model"],
            custom_api_key=creds["custom_api_key"]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM code generation failed: {e}")

    try:
        preview_df, captured_output = safe_exec_cleaning_function(
            code, "clean_step", state["df_current"], make_copy=True, timeout_seconds=8
        )
    except TimeoutError as e:
        raise HTTPException(status_code=400, detail=f"Execution timed out (infinite loop protection): {e}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Security AST guardrail rejected code: {e}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Execution failed: {e}")

    diff = compute_diff(state["df_current"], preview_df)
    is_safe, rejection_reason = check_diff_safety(diff, state["df_current"])
    cell_diff = compute_cell_diff_sample(state["df_current"], preview_df, max_rows=15)

    return clean_for_json({
        "code": code,
        "diff": diff,
        "cell_diff": cell_diff,
        "is_safe": is_safe,
        "rejection_reason": rejection_reason,
        "warning": captured_output
    })


@app.post("/api/ledger/approve")
def approve_fix(req: ApproveFixRequest):
    if state["df_current"] is None or state["ledger"] is None:
        raise HTTPException(status_code=400, detail="No active dataset or ledger.")

    state["ledger"].add_step(
        anomaly_target=req.anomaly_target,
        description=req.description,
        code_string=req.code_string,
        function_name=req.function_name
    )

    # Replay all approved steps sequentially from raw data
    df_replayed, warnings = state["ledger"].replay()
    state["df_current"] = df_replayed
    state["report"] = generate_health_report(df_replayed)

    return clean_for_json({
        "steps": state["ledger"].steps,
        "report": state["report"],
        "health_score": calculate_health_score(state["report"]),
        "warnings": warnings
    })


@app.post("/api/ledger/rollback")
def rollback_step(req: RollbackRequest):
    if state["df_raw"] is None or state["ledger"] is None:
        raise HTTPException(status_code=400, detail="No active dataset.")

    existing_steps = state["ledger"].steps
    if not existing_steps:
        raise HTTPException(status_code=400, detail="No approved steps in ledger.")

    target_id = req.step_id
    if req.mode == "cascade":
        # Remove the target step and every step approved AFTER it
        state["ledger"].steps = [s for s in existing_steps if s["step_id"] < target_id]
    else:
        # Single step removal
        state["ledger"].remove_step(target_id)

    # Replay against raw
    df_replayed, warnings = state["ledger"].replay()
    state["df_current"] = df_replayed
    state["report"] = generate_health_report(df_replayed)

    return clean_for_json({
        "steps": state["ledger"].steps,
        "report": state["report"],
        "health_score": calculate_health_score(state["report"]),
        "warnings": warnings
    })


@app.post("/api/ask")
def ask_question(
    req: AskRequest,
    x_nvidia_api_key: Optional[str] = Header(None),
    x_groq_api_key: Optional[str] = Header(None),
    x_llm_provider: Optional[str] = Header(None),
    x_custom_url: Optional[str] = Header(None),
    x_custom_model: Optional[str] = Header(None),
    x_custom_key: Optional[str] = Header(None)
):
    if state["report"] is None:
        raise HTTPException(status_code=400, detail="Please upload a dataset first.")

    creds = get_llm_credentials(
        x_nvidia_api_key, x_groq_api_key, x_llm_provider,
        x_custom_url, x_custom_model, x_custom_key
    )

    try:
        if req.mode == "analytical":
            schema = state["report"].get("column_types", {})
            plan = get_analysis_plan(
                req.question, schema,
                use_mock=creds["use_mock"],
                provider=creds["provider"],
                nvidia_api_key=creds["nvidia_api_key"],
                groq_api_key=creds["groq_api_key"],
                custom_base_url=creds["custom_base_url"],
                custom_model=creds["custom_model"],
                custom_api_key=creds["custom_api_key"]
            )
            return clean_for_json({"mode": "analytical", "plan": plan})
        else:
            answer = get_data_summary(
                req.question, state["report"],
                use_mock=creds["use_mock"],
                provider=creds["provider"],
                nvidia_api_key=creds["nvidia_api_key"],
                groq_api_key=creds["groq_api_key"],
                custom_base_url=creds["custom_base_url"],
                custom_model=creds["custom_model"],
                custom_api_key=creds["custom_api_key"]
            )
            return clean_for_json({"mode": "descriptive", "answer": answer})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/data-preview")
def get_data_preview(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=10, le=200),
    modified_only: bool = Query(False),
    search: str = Query("")
):
    if state["df_current"] is None:
        raise HTTPException(status_code=400, detail="No dataset loaded.")

    df_curr = state["df_current"]
    df_raw = state["df_raw"]
    columns = list(df_curr.columns)

    modified_columns = set()
    modified_row_indices = set()
    cell_changes_by_row = {}

    if df_raw is not None and len(df_raw) > 0 and len(df_curr) > 0:
        common_indices = [idx for idx in df_curr.index if idx in df_raw.index]
        common_cols = [c for c in columns if c in df_raw.columns]

        def _val_diff(v1, v2):
            na1 = pd.isna(v1) or v1 is None or str(v1) == "<NA>"
            na2 = pd.isna(v2) or v2 is None or str(v2) == "<NA>"
            if na1 and na2:
                return False
            if na1 != na2:
                return True
            return str(v1) != str(v2)

        for idx in common_indices:
            row_c = df_curr.loc[idx]
            row_r = df_raw.loc[idx]
            for col in common_cols:
                if _val_diff(row_c[col], row_r[col]):
                    modified_columns.add(col)
                    modified_row_indices.add(idx)
                    if idx not in cell_changes_by_row:
                        cell_changes_by_row[idx] = {}
                    cell_changes_by_row[idx][col] = None if pd.isna(row_r[col]) else str(row_r[col])

    target_indices = list(df_curr.index)
    if modified_only:
        target_indices = [idx for idx in target_indices if idx in modified_row_indices]

    if search:
        s_lower = search.lower()
        matched = []
        for idx in target_indices:
            row_vals = " ".join([str(df_curr.loc[idx, col]) for col in columns]).lower()
            if s_lower in row_vals:
                matched.append(idx)
        target_indices = matched

    total_matched = len(target_indices)
    total_pages = max(1, (total_matched + page_size - 1) // page_size)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paged_indices = target_indices[start_idx:end_idx]

    rows = []
    for idx in paged_indices:
        row_data = df_curr.loc[idx]
        is_mod = idx in modified_row_indices
        raw_vals = cell_changes_by_row.get(idx, {})
        mod_cols = list(raw_vals.keys())
        
        row_vals = {}
        for col in columns:
            v = row_data[col]
            if pd.isna(v) or v is None or str(v) == "<NA>":
                row_vals[col] = None
            elif isinstance(v, (int, np.integer)):
                row_vals[col] = int(v)
            elif isinstance(v, (float, np.floating)):
                row_vals[col] = float(v)
            else:
                row_vals[col] = str(v)

        rows.append({
            "_index": str(idx),
            "_is_modified": is_mod,
            "_modified_cols": mod_cols,
            "_raw_vals": raw_vals,
            "values": row_vals
        })

    return clean_for_json({
        "columns": columns,
        "rows": rows,
        "total_rows": len(df_curr),
        "total_matched": total_matched,
        "total_pages": total_pages,
        "current_page": page,
        "page_size": page_size,
        "modified_columns": list(modified_columns),
        "modified_row_count": len(modified_row_indices),
        "filename": state["filename"]
    })


@app.get("/api/export-csv")
def export_csv():
    if state["df_current"] is None:
        raise HTTPException(status_code=400, detail="No dataset available.")

    csv_buffer = io.StringIO()
    state["df_current"].to_csv(csv_buffer, index=False)
    csv_buffer.seek(0)

    filename = state["filename"].replace(".csv", "_cleaned.csv")
    return StreamingResponse(
        iter([csv_buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.get("/api/export-ledger")
def export_ledger():
    if state["ledger"] is None:
        raise HTTPException(status_code=400, detail="No ledger available.")

    ledger_json = state["ledger"].export_json()
    filename = state["filename"].replace(".csv", "_ledger.json")
    return StreamingResponse(
        iter([ledger_json]),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.post("/api/test-key")
def validate_key(req: TestKeyRequest):
    res = test_api_key(
        provider=req.provider,
        api_key=req.api_key,
        base_url=req.base_url,
        model=req.model
    )
    return res


@app.post("/api/test-chat")
def test_chat_endpoint(req: TestChatRequest):
    import time
    start = time.time()
    provider = req.provider or "mock"
    key = (req.api_key or "").strip()
    msg = (req.message or "").strip() or "hi"

    if provider == "mock":
        reply = f"Hello! CRUST offline demo engine received your message: '{msg}'. All systems operational."
        return clean_for_json({
            "success": True,
            "reply": reply,
            "provider": "mock",
            "latency_ms": int((time.time() - start) * 1000)
        })

    prompt = {
        "system": "You are a concise, helpful assistant inside CRUST Data Studio. Reply politely in 1-2 sentences.",
        "user": msg
    }

    try:
        if provider == "custom":
            from llm_layer import live_llm_call_custom
            reply = live_llm_call_custom(
                prompt,
                base_url=req.base_url,
                model=req.model,
                api_key=key
            )
        elif provider in ("nemotron", "nvidia"):
            from llm_layer import live_llm_call_nemotron
            reply = live_llm_call_nemotron(prompt, api_key=key)
        elif provider == "groq":
            from llm_layer import live_llm_call_groq
            reply = live_llm_call_groq(prompt, api_key=key)
        else:
            raise ValueError(f"Unknown provider '{provider}'")

        latency = int((time.time() - start) * 1000)
        return clean_for_json({
            "success": True,
            "reply": reply,
            "provider": provider,
            "latency_ms": latency
        })
    except Exception as e:
        latency = int((time.time() - start) * 1000)
        err_msg = str(e)
        if "timed out" in err_msg.lower() or "timeout" in err_msg.lower():
            err_msg = "Request timed out waiting for remote model. The provider cloud queue may be under heavy load."
        elif "401" in err_msg or "403" in err_msg or "unauthorized" in err_msg.lower() or "forbidden" in err_msg.lower():
            err_msg = f"Invalid {provider.upper()} API key (Authentication failed). Please check your key at the provider dashboard."
        return JSONResponse(
            status_code=400,
            content=clean_for_json({
                "success": False,
                "error": err_msg,
                "provider": provider,
                "latency_ms": latency
            })
        )


# Mount compiled production frontend build (if present)
frontend_dist = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.exists(frontend_dist):
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/")
    async def serve_root():
        index_file = os.path.join(frontend_dist, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"message": "CRUST API running. Frontend build not found."}

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="API route not found")
        # Check if requested path is an actual file in frontend_dist (e.g. logo.png, icons, etc.)
        target_file = os.path.join(frontend_dist, full_path)
        if full_path and os.path.isfile(target_file):
            return FileResponse(target_file)
        index_file = os.path.join(frontend_dist, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend build not found")


if __name__ == "__main__":
    import uvicorn
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host=host, port=port)
