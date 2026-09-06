"""
Launcher for CRUST Web Application
Starts the FastAPI server which serves both the API and the compiled React frontend,
and automatically opens your browser.

Usage:
    python start_app.py
"""

import os
import sys
import webbrowser
import threading
import time
import uvicorn

def open_browser():
    time.sleep(1.2)
    print("\nOpening CRUST in your default browser at http://127.0.0.1:8000 ...")
    webbrowser.open("http://127.0.0.1:8000")

def free_port(port=8000):
    """If port 8000 is occupied by a previously running process on Windows, cleanly terminate it."""
    try:
        import subprocess
        cmd = f"Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"
        res = subprocess.run(["powershell", "-NoProfile", "-Command", cmd], capture_output=True, text=True)
        pids = [p.strip() for p in res.stdout.splitlines() if p.strip().isdigit()]
        for pid in pids:
            if int(pid) != os.getpid():
                subprocess.run(["taskkill", "/F", "/PID", pid], capture_output=True)
                time.sleep(0.6)
    except Exception:
        pass

if __name__ == "__main__":
    print("=" * 65)
    print("  CRUST — Intelligent Data Profiling & Interactive Cleaning Studio")
    print("=" * 65)
    print("Starting backend API & React frontend on http://127.0.0.1:8000 ...")
    
    # Ensure port 8000 is free
    free_port(8000)

    # Launch browser in a background thread
    threading.Thread(target=open_browser, daemon=True).start()

    # Run Uvicorn server
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=False)
