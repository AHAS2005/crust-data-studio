"""
LLM Layer - Function 9 & 10
Handles: explaining the health report, generating cleaning code via a
Plan-and-Solve pattern, safely executing that code in a sandboxed preview,
and maintaining a reversible "ledger" of approved fixes.

NOTE: This file uses a MOCK LLM call (mock_llm_call) so the entire pipeline
can be built and tested without a live API key. Swap mock_llm_call() for a
real Anthropic/OpenAI API call later - everything else stays the same.
"""

import pandas as pd
import numpy as np
import json
import re
import ast
import io
import os
import contextlib


# ---------------------------------------------------------
# STEP 0: extract code from a real LLM's markdown-wrapped response
# ---------------------------------------------------------

def extract_code_block(llm_response):
    """
    Real LLMs almost always wrap code in markdown fences (```python ... ```)
    even when told not to. Our mock returned raw code, which hid this real
    problem - validating/executing a response that still has fences and
    conversational text around it would fail or behave unpredictably.
    """
    match = re.search(r"```(?:python)?\s*\n(.*?)```", llm_response, re.DOTALL)
    if match:
        return match.group(1).strip()
    # Fallback: no fences found, assume the whole response is code
    return llm_response.strip()


# ---------------------------------------------------------
# SAFETY LAYER: AST-based code validation + restricted execution
# ---------------------------------------------------------

# Kept as a fast first-pass filter, but NOT the only line of defense
# anymore - see validate_code_safety_ast() below for the real guard.
BLOCKED_PATTERNS = [
    r"\bimport\s+os\b", r"\bimport\s+sys\b", r"\bimport\s+subprocess\b",
    r"\bimport\s+shutil\b", r"\bimport\s+socket\b", r"\bimport\s+requests\b",
    r"\bimport\s+pickle\b", r"__import__", r"\bopen\s*\(", r"\beval\s*\(",
    r"\bexec\s*\(", r"\bcompile\s*\(", r"\bglobals\s*\(", r"\blocals\s*\(",
    r"\binput\s*\(", r"__builtins__", r"\bos\.", r"\bsys\.", r"subprocess\.",
]

DANGEROUS_CALL_NAMES = {"exec", "eval", "open", "compile", "globals", "locals",
                         "__import__", "input", "getattr", "setattr", "delattr"}
DANGEROUS_MODULE_NAMES = {"os", "sys", "subprocess", "shutil", "socket",
                           "requests", "pickle", "importlib"}

# Pandas/numpy I/O methods that touch the filesystem, network, or a
# database - blocked by METHOD NAME, not by which variable they're called
# on. This matters because checking "base.id in DANGEROUS_MODULE_NAMES"
# only catches something like os.system(...) - it does NOTHING to stop
# df.to_csv('/etc/passwd') or pd.read_csv('http://attacker.com/steal'),
# since neither "df" nor "pd" is itself a "dangerous module". A DataFrame
# is a completely legitimate object to have in scope, but a handful of
# its METHODS are genuine file/network I/O and have no place in a
# data-cleaning function.
DANGEROUS_IO_METHODS = {
    "to_csv", "to_excel", "to_parquet", "to_pickle", "to_sql", "to_hdf",
    "to_feather", "to_html", "to_clipboard", "to_gbq", "to_stata", "to_orc",
    "to_latex", "to_markdown", "to_xarray", "to_json", "to_xml",
    "read_csv", "read_excel", "read_parquet", "read_sql", "read_pickle",
    "read_hdf", "read_html", "read_feather", "read_clipboard", "read_gbq",
    "read_stata", "read_orc", "read_table", "read_sql_query", "read_sql_table",
    "read_fwf", "read_spss", "read_sas", "read_json", "read_xml",
    # NumPy file I/O - np stays in scope (needed for legitimate array/nan
    # operations throughout cleaning code), so these are blocked the same
    # way as pandas methods: by name, regardless of the "np." prefix,
    # since np isn't in DANGEROUS_MODULE_NAMES and never should be -
    # blocking the whole module would break normal numpy usage.
    "save", "savez", "savez_compressed", "savetxt",
    "load", "loadtxt", "genfromtxt", "fromfile", "fromregex",
}
# NOTE: to_dict/to_numpy/to_list/astype are NOT in this list - those stay
# entirely in memory and were never a risk. to_json/read_json ARE
# included despite being usable without a path argument, because WITH a
# path or URL argument they perform real file/network I/O - safer to
# block the method name outright than to try to inspect its arguments.


def validate_code_safety(code_string):
    """
    FAST first-pass regex filter. Cheap, catches the obvious cases
    immediately - but regex can be defeated by disguised code like
    importlib.import_module("o"+"s"), so this is NOT the real guard.
    See validate_code_safety_ast() for the actual grammatical check.
    """
    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, code_string):
            return False, f"Blocked pattern found: {pattern}"
    return True, None


def validate_code_safety_ast(code_string):
    """
    REAL safety guard: parses the code into a grammatical structure (an
    Abstract Syntax Tree) instead of just scanning text. This catches
    disguised bypasses that regex can't, e.g.:
      - importlib.import_module("o" + "s")
      - __builtins__['__import__']('os')
      - getattr(__builtins__, 'ex' + 'ec')
    because these are structurally recognizable as import/attribute/call
    operations regardless of how the string is assembled.
    """
    try:
        tree = ast.parse(code_string)
    except SyntaxError as e:
        return False, f"Invalid Python syntax: {e}"

    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            return False, "Imports are not allowed in generated cleaning code."

        if isinstance(node, ast.Call):
            # Direct calls like exec(...), open(...)
            if isinstance(node.func, ast.Name) and node.func.id in DANGEROUS_CALL_NAMES:
                return False, f"Forbidden function call: {node.func.id}"
            # Attribute calls like os.system(...), importlib.import_module(...)
            if isinstance(node.func, ast.Attribute):
                base = node.func.value
                if isinstance(base, ast.Name) and base.id in DANGEROUS_MODULE_NAMES:
                    return False, f"Forbidden module call: {base.id}.{node.func.attr}"
                # Block by METHOD NAME regardless of what it's called on -
                # df.to_csv(...) or pd.read_csv(...) both slip past the
                # check above since neither "df" nor "pd" is a "dangerous
                # module", but .to_csv/.read_csv themselves are real
                # filesystem/network I/O no matter which variable holds
                # the dataframe.
                if node.func.attr in DANGEROUS_IO_METHODS:
                    return False, f"Forbidden I/O method call: .{node.func.attr}(...)"

        # Block bare references to dangerous names even without a call
        # (e.g. assigning `x = __builtins__` to use later)
        if isinstance(node, ast.Name) and node.id in ({"__builtins__", "__import__"} | DANGEROUS_MODULE_NAMES):
            return False, f"Forbidden reference: {node.id}"

    return True, None


def _validate_and_prepare_code(code_string):
    """
    Shared validation logic used by BOTH the untrusted (subprocess/preview)
    and trusted (in-process/replay) execution paths - safety checking
    itself doesn't change based on trust level, only HOW the code runs
    afterward does. Returns the cleaned code string (with harmless
    pandas/numpy import lines stripped) or raises ValueError.
    """
    is_safe, reason = validate_code_safety(code_string)
    if not is_safe:
        raise ValueError(f"Refused to execute unsafe code: {reason}")

    cleaned_code = re.sub(
        r"^\s*import\s+(pandas\s+as\s+pd|numpy\s+as\s+np)\s*$",
        "", code_string, flags=re.MULTILINE
    )

    is_safe, reason = validate_code_safety_ast(cleaned_code)
    if not is_safe:
        raise ValueError(f"Refused to execute unsafe code: {reason}")

    return cleaned_code


def _exec_function_inprocess(cleaned_code, function_name, df):
    """
    Runs an ALREADY-VALIDATED cleaning function directly in the current
    process - no subprocess, no IPC, no pickling the dataframe across a
    Queue. Shares the same restricted builtins/namespace as the
    subprocess path, just without the process-isolation overhead.
    """
    safe_builtins = {
        "len": len, "range": range, "str": str, "float": float, "int": int,
        "bool": bool, "list": list, "dict": dict, "set": set, "tuple": tuple,
        "min": min, "max": max, "sum": sum, "abs": abs, "round": round,
        "sorted": sorted, "enumerate": enumerate, "zip": zip,
        "isinstance": isinstance, "True": True, "False": False, "None": None,
        "print": print,
    }
    restricted_globals = {"__builtins__": safe_builtins, "pd": pd, "np": np}
    local_namespace = {}
    exec(cleaned_code, restricted_globals, local_namespace)

    if function_name not in local_namespace:
        raise ValueError(f"Generated code did not define expected function '{function_name}'")

    cleaning_function = local_namespace[function_name]
    captured = io.StringIO()
    with contextlib.redirect_stdout(captured):
        result_df = cleaning_function(df)

    if not isinstance(result_df, pd.DataFrame):
        raise ValueError(
            f"'{function_name}' must return a pandas DataFrame, but returned "
            f"{type(result_df).__name__}. Make sure your function ends with 'return df'."
        )

    return result_df, captured.getvalue().strip()


def _run_cleaning_function_in_subprocess(code_string, function_name, df, result_queue):
    """
    Worker target for the timeout-protected execution below. Runs in a
    SEPARATE PROCESS (not just a thread) because Python can't forcibly
    kill a thread mid-execution, but it CAN terminate a whole process -
    this is what actually lets us stop something like a runaway
    df.merge(df, how='cross') on a large dataset instead of just hoping
    it finishes.
    """
    try:
        result_df, captured_output = _exec_function_inprocess(code_string, function_name, df)
        result_queue.put(("success", result_df, captured_output))
    except Exception as e:
        result_queue.put(("error", str(e), None))


def safe_exec_cleaning_function(code_string, function_name, df, make_copy=True, timeout_seconds=8):
    """
    UNTRUSTED path - for a fresh, not-yet-approved LLM-generated function
    (i.e. what the user sees in the diff preview BEFORE clicking approve).

    Executes in a RESTRICTED namespace AND in a separate process with an
    enforced timeout. TIMEOUT PROTECTION matters here specifically:
    AST validation blocks obviously malicious code (os.system, eval,
    etc.) but does NOT catch valid pandas operations that are simply
    expensive - e.g. an LLM-generated df.merge(df, how='cross') on a
    large dataset can exhaust memory in seconds without ever touching a
    "forbidden" function. A subprocess lets us forcibly kill it if it
    runs too long.

    make_copy: if True (default), runs on a fresh copy of df.

    Returns (result_df, captured_output).

    NOTE: this is deliberately NOT used for replaying already-approved
    ledger steps - see CleaningLedger.replay() and
    exec_trusted_cleaning_function() below for why.
    """
    import multiprocessing

    cleaned_code = _validate_and_prepare_code(code_string)
    df_target = df.copy() if make_copy else df

    result_queue = multiprocessing.Queue()
    process = multiprocessing.Process(
        target=_run_cleaning_function_in_subprocess,
        args=(cleaned_code, function_name, df_target, result_queue)
    )
    process.start()
    process.join(timeout=timeout_seconds)

    if process.is_alive():
        # Still running after the timeout - forcibly kill it. This is the
        # actual point of running in a subprocess: a thread can't be
        # force-stopped like this, a process can.
        process.terminate()
        process.join()
        raise TimeoutError(
            f"Cleaning function exceeded {timeout_seconds}s and was terminated. "
            "This usually means the generated code is doing something far more "
            "expensive than expected (e.g. an accidental cross-join or unbounded loop)."
        )

    if result_queue.empty():
        raise RuntimeError("Cleaning function process ended without returning a result (possible crash).")

    status, payload, captured_output = result_queue.get()
    if status == "error":
        raise ValueError(f"Error while executing generated function: {payload}")

    result_df = payload
    return result_df, captured_output


def exec_trusted_cleaning_function(code_string, function_name, df, make_copy=True, timeout_seconds=None):
    """
    TRUSTED path - for replaying steps a human has ALREADY approved
    (i.e. CleaningLedger.replay()). Runs directly in the main process,
    no subprocess, no IPC.

    WHY THIS EXISTS (architectural fix): safe_exec_cleaning_function's
    subprocess/timeout machinery exists to protect against code that
    hasn't been reviewed yet. Once a human has approved a step, the code
    itself is mathematically the same trusted artifact every time it's
    replayed - re-sandboxing it on every single replay forces Python to
    pickle, copy, and deserialize the ENTIRE dataframe across a
    multiprocessing Queue for every step. On a 10-step ledger over a
    500MB dataset, that's ~5GB moved through IPC on every replay, which
    can OOM-crash a machine for no real safety benefit, since nothing
    about the code changed since it was approved.

    Still re-runs validate_code_safety_ast() as cheap defense-in-depth
    (e.g. in case a saved ledger JSON file was tampered with on disk) -
    just skips the expensive process-isolation/timeout wrapper, since
    that specific protection was for UNREVIEWED code, not approved code.

    SAFETY NET: timeout_seconds is None by default (fast in-process path,
    no timeout - correct for the normal case, since the code and data
    were both already validated together at approval time). If provided,
    routes through the SAME subprocess+timeout machinery as the untrusted
    path instead. This matters for one specific scenario: a user resumes
    a saved ledger against a CSV that has grown significantly since the
    steps were approved (drift was detected and the user chose to
    proceed anyway - see load_ledger()'s drift warning). A step that ran
    in milliseconds on the original small file could take much longer,
    or effectively hang, on a much larger one - "trusted" only ever meant
    "this code was reviewed", not "this code's runtime is guaranteed
    regardless of how large the data has since become".
    """
    cleaned_code = _validate_and_prepare_code(code_string)
    df_target = df.copy() if make_copy else df

    if timeout_seconds is None:
        return _exec_function_inprocess(cleaned_code, function_name, df_target)

    # Drifted-data safety net: same subprocess+timeout protection as the
    # untrusted path, just invoked explicitly rather than by default.
    import multiprocessing
    result_queue = multiprocessing.Queue()
    process = multiprocessing.Process(
        target=_run_cleaning_function_in_subprocess,
        args=(cleaned_code, function_name, df_target, result_queue)
    )
    process.start()
    process.join(timeout=timeout_seconds)

    if process.is_alive():
        process.terminate()
        process.join()
        raise TimeoutError(
            f"Trusted replay step exceeded {timeout_seconds}s and was terminated. "
            "This can happen when a step approved on a smaller dataset is replayed "
            "against source data that has since grown significantly."
        )

    if result_queue.empty():
        raise RuntimeError("Replay step process ended without returning a result (possible crash).")

    status, payload, captured_output = result_queue.get()
    if status == "error":
        raise ValueError(f"Error while executing generated function: {payload}")

    return payload, captured_output


# ---------------------------------------------------------
# DIFF PREVIEW: show consequences before approval
# ---------------------------------------------------------

def check_diff_safety(diff, df_before, max_row_loss_percent=50, max_modified_percent=90):
    """
    Automated sanity check on a proposed fix's diff, run BEFORE the human
    ever sees the approval prompt. compute_diff() gives a human an
    accurate preview, but nothing previously stopped an obviously
    destructive result (e.g. an LLM-generated function that accidentally
    drops 99% of rows) from being presented for approval as if it were
    routine - a rushed or trusting reviewer could approve it without
    fully registering the scale of loss.

    This doesn't replace human review - it's a first-pass filter that
    catches the extreme, obviously-wrong cases automatically, the same
    way a linter catches obvious mistakes before a human reviews a PR.

    Returns (is_safe, reason) - is_safe=False means the fix should be
    auto-rejected without ever reaching the approval prompt.
    """
    total_rows = len(df_before)
    if total_rows == 0:
        return True, None  # nothing to lose from an already-empty dataframe

    rows_dropped = diff.get("rows_dropped", 0)
    row_loss_percent = (rows_dropped / total_rows) * 100

    if row_loss_percent > max_row_loss_percent:
        return False, (
            f"REJECTED: this fix would drop {rows_dropped} of {total_rows} rows "
            f"({row_loss_percent:.1f}%), exceeding the {max_row_loss_percent}% safety "
            "threshold. This usually means the generated code has an overly broad "
            "filter/dropna condition rather than a targeted fix."
        )

    modified_count = diff.get("modified_cell_count")
    # Only check this when it's an actual number - compute_diff() reports
    # an honest STATUS STRING instead of a number when row correspondence
    # can't be verified (e.g. after an index reset), and a string can't
    # be meaningfully compared against a percentage threshold.
    if isinstance(modified_count, int):
        total_cells = total_rows * max(len(diff.get("columns_before", [])), 1)
        if total_cells > 0:
            modified_percent = (modified_count / total_cells) * 100
            if modified_percent > max_modified_percent:
                return False, (
                    f"REJECTED: this fix would modify {modified_count} cells "
                    f"({modified_percent:.1f}% of the dataset), exceeding the "
                    f"{max_modified_percent}% safety threshold. This is unusually broad "
                    "for a fix targeting one specific anomaly - worth checking the "
                    "generated code is actually scoped to the right column/condition."
                )

    return True, None


def compute_diff(df_before, df_after):
    """
    Compares dataframes before/after a proposed cleaning function, so the
    user sees the CONSEQUENCE of a fix before approving it - not just a
    plain-English description they have to trust blindly.
    """
    diff = {
        "rows_before": len(df_before),
        "rows_after": len(df_after),
        "rows_dropped": max(0, len(df_before) - len(df_after)),
        "columns_before": list(df_before.columns),
        "columns_after": list(df_after.columns),
        "dtype_changes": {}
    }

    common_cols = set(df_before.columns) & set(df_after.columns)
    for col in common_cols:
        if str(df_before[col].dtype) != str(df_after[col].dtype):
            diff["dtype_changes"][col] = {
                "before": str(df_before[col].dtype),
                "after": str(df_after[col].dtype)
            }

    # Count modified cell values (best-effort). UPDATED: instead of always
    # attempting a comparison (even a "safe" aligned one that can produce
    # a misleadingly large number when indices don't correspond at all),
    # explicitly check WHICH situation we're in first, and be honest about
    # what can and can't be verified - a clean status string is more
    # trustworthy to show a user than a technically-computed but
    # misleading count.
    if len(df_before) == len(df_after):
        if df_before.index.equals(df_after.index):
            # Perfect index match - safe to compare directly, and faster
            # than align() since there's no reindexing work to do.
            #
            # BUG FIX: naive string comparison treats NaN != NaN as a
            # "change" even when a cell was missing before AND after -
            # pandas' string dtype keeps NaN as an actual null marker even
            # post-astype(str), and NaN never equals NaN. A cell only
            # counts as genuinely modified if the values differ AND it's
            # not simply "both sides are missing".
            modified_cells = 0
            for col in common_cols:
                before_col = df_before[col]
                after_col = df_after[col]
                both_missing = before_col.isna() & after_col.isna()
                differs = before_col.astype(str).values != after_col.astype(str).values
                real_change = differs & ~both_missing.values
                modified_cells += int(real_change.sum())
            diff["modified_cell_count"] = modified_cells
        else:
            # Index changed (e.g. reset_index() after a filter) - row
            # correspondence is compromised. Say so plainly instead of
            # reporting a number that LOOKS precise but isn't trustworthy.
            overlap = df_before.index.intersection(df_after.index)
            if len(overlap) == 0:
                diff["modified_cell_count"] = "unknown (row correspondence lost due to index reset)"
            else:
                diff["modified_cell_count"] = "unknown (index shifted; cannot verify exact cell changes)"
    else:
        diff["modified_cell_count"] = "unknown (row count changed)"

    return diff


def compute_cell_diff_sample(df_before, df_after, max_rows=15):
    """
    Extracts a sample of changed rows and flags exactly which cells were modified
    (for the split-pane before/after UI table with soft red and green highlights).
    """
    def _to_json_val(val):
        if pd.isna(val) or val is None or str(val) == "<NA>":
            return None
        if isinstance(val, (int, np.integer)):
            return int(val)
        if isinstance(val, (float, np.floating)):
            return float(val)
        return str(val)

    def _values_differ(v1, v2):
        na1 = pd.isna(v1) or v1 is None or str(v1) == "<NA>"
        na2 = pd.isna(v2) or v2 is None or str(v2) == "<NA>"
        if na1 and na2:
            return False
        if na1 != na2:
            return True
        return str(v1) != str(v2)

    columns = list(df_after.columns if len(df_after.columns) > 0 else df_before.columns)
    changed_rows = []
    total_changed_rows = 0

    # Case 1: Same row index/order
    if len(df_before) == len(df_after) and df_before.index.equals(df_after.index):
        common_cols = [c for c in columns if c in df_before.columns and c in df_after.columns]
        for idx in df_before.index:
            row_b = df_before.loc[idx]
            row_a = df_after.loc[idx]
            modified_cols = []
            for col in common_cols:
                val_b = row_b[col]
                val_a = row_a[col]
                if _values_differ(val_b, val_a):
                    modified_cols.append(col)
            
            if modified_cols:
                total_changed_rows += 1
                if len(changed_rows) < max_rows:
                    changed_rows.append({
                        "row_index": str(idx),
                        "status": "modified",
                        "modified_columns": modified_cols,
                        "before": {col: _to_json_val(row_b[col]) for col in df_before.columns},
                        "after": {col: _to_json_val(row_a[col]) for col in df_after.columns}
                    })
    else:
        # Case 2: Rows were dropped or indices altered
        dropped_indices = set(df_before.index) - set(df_after.index)
        for idx in dropped_indices:
            total_changed_rows += 1
            if len(changed_rows) < max_rows:
                row_b = df_before.loc[idx]
                changed_rows.append({
                    "row_index": str(idx),
                    "status": "dropped",
                    "modified_columns": list(df_before.columns),
                    "before": {col: _to_json_val(row_b[col]) for col in df_before.columns},
                    "after": {}
                })
        
        # Check modified remaining rows
        # Use index intersection (O(n log n)) instead of list comprehension (O(n²))
        common_indices = df_before.index.intersection(df_after.index)
        common_cols = [c for c in columns if c in df_before.columns and c in df_after.columns]
        for idx in common_indices:
            row_b = df_before.loc[idx]
            row_a = df_after.loc[idx]
            modified_cols = []
            for col in common_cols:
                val_b = row_b[col]
                val_a = row_a[col]
                if _values_differ(val_b, val_a):
                    modified_cols.append(col)
            if modified_cols:
                total_changed_rows += 1
                if len(changed_rows) < max_rows:
                    changed_rows.append({
                        "row_index": str(idx),
                        "status": "modified",
                        "modified_columns": modified_cols,
                        "before": {col: _to_json_val(row_b[col]) for col in df_before.columns},
                        "after": {col: _to_json_val(row_a[col]) for col in df_after.columns}
                    })

    # If no rows changed but user still wants a preview, show first few rows as sample
    sample_preview = []
    if not changed_rows and len(df_after) > 0:
        for idx in list(df_after.index)[:max_rows]:
            sample_preview.append({
                "row_index": str(idx),
                "status": "unchanged",
                "modified_columns": [],
                "before": {col: _to_json_val(df_before.loc[idx, col]) if idx in df_before.index and col in df_before.columns else None for col in columns},
                "after": {col: _to_json_val(df_after.loc[idx, col]) if col in df_after.columns else None for col in columns}
            })

    return {
        "columns": columns,
        "changed_rows": changed_rows,
        "sample_preview": sample_preview,
        "total_changed_rows": total_changed_rows,
        "rows_before": len(df_before),
        "rows_after": len(df_after),
        "rows_dropped": max(0, len(df_before) - len(df_after))
    }


# ---------------------------------------------------------
# THE LEDGER: reversible, sequential pipeline
# ---------------------------------------------------------

class CleaningLedger:
    """
    Stores the RECIPE, not the baked cake. df_raw is never mutated -
    every approved fix is stored as a step and replayed in order.
    This gives auditability (see every fix ever applied) and rollback
    (delete a step and recompute from df_raw).

    Also stores a hash of df_raw's structure at creation time. When a
    ledger is loaded back later, this hash is compared against the
    CURRENT raw data - if the source CSV changed between sessions (a
    renamed column, added/removed rows), replaying old steps against
    different data could silently produce wrong results or throw a
    confusing KeyError deep in step 3. Catching that mismatch upfront
    and warning the user is much better than a cryptic crash mid-replay.
    """

    def __init__(self, df_raw):
        self.df_raw = df_raw.copy()
        self.steps = []  # list of dicts: step_id, anomaly_target, description, code_string, function_name
        self.raw_data_hash = self._compute_hash(df_raw)

    @staticmethod
    def _compute_hash(df):
        """
        Hashes the STRUCTURE of the data (column names + dtypes + shape),
        not every cell value - hashing every value would be slow on large
        files and isn't necessary to catch the failure mode we care about
        (a step referencing a column that no longer exists, or a row
        count that no longer matches what the steps were built against).
        """
        import hashlib
        structure_signature = f"{list(df.columns)}|{df.shape}|{[str(t) for t in df.dtypes]}"
        return hashlib.sha256(structure_signature.encode()).hexdigest()

    def add_step(self, anomaly_target, description, code_string, function_name):
        # Use a running counter instead of len(self.steps) + 1 - the old
        # approach silently reused step_ids after a remove_step() call
        # (e.g. steps [1,2,3], remove 2 -> [1,3], next add_step would
        # incorrectly create ANOTHER step_id=3, colliding with the
        # existing one). A monotonically increasing counter avoids this.
        self._next_id = getattr(self, "_next_id", 0) + 1
        step = {
            "step_id": self._next_id,
            "anomaly_target": anomaly_target,
            "description": description,
            "code_string": code_string,
            "function_name": function_name
        }
        self.steps.append(step)
        return step

    def remove_step(self, step_id):
        self.steps = [s for s in self.steps if s["step_id"] != step_id]

    def replay(self, timeout_seconds=None):
        """
        Recomputes the current dataframe from df_raw by applying every step
        in order. Copies df_raw ONCE here, then passes make_copy=False to
        each step - previously each step re-copied the entire dataframe
        internally, meaning a 10-step ledger cloned the whole dataset 10
        times on every replay (real memory/performance cost on large data).

        Uses exec_trusted_cleaning_function(), NOT safe_exec_cleaning_function()
        - these steps were already reviewed and approved by a human when
        they were first added to the ledger, so re-running them through
        the subprocess/timeout sandbox on every single replay is wasted
        overhead: it would pickle and copy the entire dataframe across a
        multiprocessing Queue for every step, for no additional safety
        benefit over code that's already been vetted once.

        timeout_seconds: None by default (fast in-process path - correct
        for the normal case). Pass a number (e.g. 30) when replaying a
        ledger whose source data may have drifted/grown since the steps
        were approved (see load_ledger()'s drift warning) - this routes
        through a subprocess with an enforced timeout as a safety net,
        since a step that was fast on the original data isn't guaranteed
        to stay fast on much larger data.

        Also collects each step's captured print-output (self-reported
        warnings from the generated code) so they're not silently lost.
        """
        df_current = self.df_raw.copy()
        step_warnings = []

        for step in self.steps:
            try:
                df_current, captured_output = exec_trusted_cleaning_function(
                    step["code_string"], step["function_name"], df_current,
                    make_copy=False, timeout_seconds=timeout_seconds
                )
            except Exception as e:
                raise RuntimeError(
                    f"Replay failed at step {step['step_id']} ({step['description']}): {e}. "
                    "This can happen if the source data structure changed since this "
                    "step was created (see raw_data_hash check in load_ledger)."
                )
            if captured_output:
                step_warnings.append({"step_id": step["step_id"], "output": captured_output})

        return df_current, step_warnings

    def export_json(self):
        """
        Human-readable audit trail of every transformation applied.
        Includes the raw_data_hash so a later load_ledger() call can
        detect if the source data has drifted since this was saved.
        """
        return json.dumps({
            "raw_data_hash": self.raw_data_hash,
            "steps": self.steps
        }, indent=2)


def load_ledger(ledger_json_path, df_raw):
    """
    Loads a previously-saved ledger and re-attaches it to a (freshly
    loaded) df_raw. Compares the saved raw_data_hash against a hash of
    the CURRENT df_raw - if they don't match, the source CSV has changed
    since this ledger was created (renamed/added/removed columns, or a
    different row count), and blindly replaying old steps could either
    crash confusingly or silently apply fixes to the wrong data.

    Returns (ledger, drift_warning) - drift_warning is None if the hash
    matched, or a string explaining the mismatch if it didn't. The
    caller decides whether to proceed anyway, not this function - we
    warn, we don't refuse, since the user might have a good reason
    (e.g. they know the change is harmless).
    """
    with open(ledger_json_path, "r") as f:
        saved = json.load(f)

    ledger = CleaningLedger(df_raw)
    ledger.steps = saved["steps"]
    # Preserve the next-id counter so future add_step() calls don't collide
    # with loaded step_ids.
    ledger._next_id = max((s["step_id"] for s in saved["steps"]), default=0)

    current_hash = ledger._compute_hash(df_raw)
    saved_hash = saved.get("raw_data_hash")

    drift_warning = None
    if saved_hash and current_hash != saved_hash:
        drift_warning = (
            "WARNING: the source data's structure has changed since this ledger "
            "was saved (different columns, dtypes, or shape). Replaying these "
            "steps may fail or produce unexpected results."
        )

    return ledger, drift_warning


# ---------------------------------------------------------
# PROMPT TEMPLATES (for when a real LLM is plugged in)
# ---------------------------------------------------------

def build_explanation_prompt(anomaly):
    """
    Builds a strict, grounded prompt for explaining ONE anomaly in plain
    English. Uses STRUCTURAL INJECTION for critical warnings (like MNAR
    bias) so they can't be casually skipped by the model - they're placed
    in the instruction itself, not just passively sitting in the data.
    """
    system_instruction = (
        "You are a data reporting translator. Your ONLY job is to explain "
        "the provided JSON anomaly in plain English for a non-technical "
        "user. Do not infer causes that are not in the data. Do not invent "
        "solutions beyond what's asked. Cite the exact sample values provided."
    )

    if "warning" in anomaly:
        system_instruction += (
            f"\n\nCRITICAL CONSTRAINT: You MUST explicitly include this "
            f"warning in your explanation, in your own words: \"{anomaly['warning']}\""
        )

    user_content = f"Explain this data quality finding:\n{json.dumps(anomaly, indent=2, default=str)}"

    return {"system": system_instruction, "user": user_content}


def build_cleaning_code_prompt(anomaly, custom_instruction=None):
    """
    Prompts the LLM to generate a DEFENSIVE cleaning function scoped ONLY
    to the specific anomaly - not a broad, over-generalized fix that could
    silently mishandle values outside what was actually observed.
    """
    system_instruction = (
        "You are an expert Python/pandas code generator for data cleaning. Given a JSON description of "
        "ONE specific data anomaly, write a single function named "
        "'clean_step' that takes a dataframe and returns a modified dataframe.\n"
        "Rules:\n"
        "(1) Only handle the specific column and patterns indicated.\n"
        "(2) CRITICAL: When computing reductions like .median(), .mean(), .quantile() or clipping on columns that may have string or object dtype (such as numbers mixed with words or currency), NEVER call .median() or .mean() directly on df[col]. Always safely compute numeric values first: `num_s = pd.to_numeric(df[col], errors='coerce')` and compute the statistic on `num_s` (e.g. `fill_val = num_s.median()`). This prevents fatal 'Cannot perform reduction with string dtype' errors.\n"
        "(3) Return ONLY valid Python code with `def clean_step(df):`, no conversational text or markdown fences."
    )
    user_content = f"Write a cleaning function for this anomaly:\n{json.dumps(anomaly, indent=2, default=str)}"
    if custom_instruction:
        user_content += f"\n\nUSER SPECIFIC CLEANING INSTRUCTION: {custom_instruction}\nPlease follow this instruction directly when writing clean_step(df)."

    return {"system": system_instruction, "user": user_content}


def build_data_summary_prompt(question, report):
    """
    For DESCRIPTIVE questions ("what is this data about?", "describe this
    dataset") the full Plan-and-Solve machinery is overkill - there's no
    multi-step computation needed, just a grounded narrative answer using
    what the detection layer already found. This builds a single prompt
    using the REAL report data (column types, summary stats, anomalies)
    so the answer is grounded in facts already computed, not invented.

    This is deliberately separate from build_analysis_plan_prompt() -
    that one is for genuinely multi-step analytical questions ("what's
    driving the drop in Q3 sales") where a plan-then-code approach adds
    real value. Forcing every question through the plan machinery, even
    simple descriptive ones, was the actual gap a user hit: they asked
    "what is this data about" and got a machine-readable step list
    instead of a sentence answering their actual question.
    """
    system_instruction = (
        "You are a data analyst assistant. Answer the user's question about "
        "their dataset in plain, conversational English - 2-4 sentences. "
        "Ground your answer ONLY in the column names, types, and summary "
        "statistics provided below. Do not invent details not present in "
        "this data. If the question can't be answered from this information "
        "alone, say so clearly instead of guessing."
    )

    context = {
        "columns_and_types": report.get("column_types", {}),
        "dataset_summary": report.get("summary", {}),
        "known_data_quality_issues": [
            {"column": a.get("column"), "issue": a.get("issue")}
            for a in report.get("anomalies", [])
        ],
    }

    user_content = (
        f"Question: {question}\n\n"
        f"Dataset context:\n{json.dumps(context, indent=2, default=str)}"
    )

    return {"system": system_instruction, "user": user_content}


def build_analysis_plan_prompt(question, column_schema):
    """
    Plan-and-Solve pattern: decomposes a vague natural language question
    into a structured list of analysis steps BEFORE any code is written.
    """
    system_instruction = (
        "You are a data analysis planner. Given a user's question and a "
        "schema of available columns, output a JSON array of logical "
        "analysis steps needed to answer it. Do NOT write code yet - only "
        "plan. Each step should be a short, concrete action."
    )
    user_content = (
        f"Question: {question}\n\n"
        f"Available columns and types:\n{json.dumps(column_schema, indent=2)}"
    )
    return {"system": system_instruction, "user": user_content}


# ---------------------------------------------------------
# MOCK LLM (swap this for a real API call later)
# ---------------------------------------------------------

def mock_llm_call(prompt):
    """
    Simulates what a real LLM would return, based on pattern-matching the
    anomaly type in the prompt. This lets us test the ENTIRE pipeline
    (prompt building -> code generation -> safety validation -> sandboxed
    execution -> diff -> ledger) without a live API key.

    TO GO LIVE: replace the body of this function with a real API call
    (e.g. Anthropic's /v1/messages) that sends prompt['system'] and
    prompt['user'], and parses the returned text the same way this does.
    """
    user_text = prompt["user"]
    system_text = prompt.get("system", "")

    # --- Explanation requests ---
    if "Explain this data quality finding" in user_text:
        # Check for a structurally-injected CRITICAL CONSTRAINT in the
        # system prompt (this is what actually tests whether the warning
        # injection mechanism works, not just whether the JSON contains it)
        forced_warning = None
        match = re.search(r'CRITICAL CONSTRAINT:.*?"(.+?)"', system_text)
        if match:
            forced_warning = match.group(1)

        if "mixed_numeric_column" in user_text:
            base = ("This column is mostly numbers, but some rows contain text "
                    "values instead - these were kept as-is rather than being "
                    "silently deleted, so you can decide what to do with them.")
        elif "outliers" in user_text:
            base = ("Some values in this column are unusually high or low "
                    "compared to the rest of the data.")
        elif "disguised_null" in user_text:
            base = "This column contains placeholder text that likely means 'missing data' rather than a real value."
        else:
            base = "This column has a data quality issue worth reviewing."

        if forced_warning:
            base += f" IMPORTANT: {forced_warning}"

        return base

    # --- Cleaning code generation requests ---
    if "Write a cleaning function" in user_text:
        col_match = re.search(r'"column":\s*"([^"]+)"', user_text)
        target_col = col_match.group(1) if col_match else 'revenue'
        val_match = re.search(r'"value":\s*"([^"]+)"', user_text)
        target_val = val_match.group(1) if val_match else 'unknown'
        
        # Check for custom instructions
        instr_lower = user_text.lower()

        if "drop" in instr_lower or "remove" in instr_lower:
            return (
                "def clean_step(df):\n"
                "    import pandas as pd\n"
                f"    col = '{target_col}'\n"
                "    if col in df.columns:\n"
                "        initial_rows = len(df)\n"
                "        df = df.dropna(subset=[col]).copy()\n"
                "        dropped = initial_rows - len(df)\n"
                "        print(f'Dropped {dropped} rows with missing {col}')\n"
                "    return df"
            )

        if "median" in instr_lower:
            return (
                "def clean_step(df):\n"
                "    import pandas as pd\n"
                f"    col = '{target_col}'\n"
                "    if col in df.columns:\n"
                "        num_s = pd.to_numeric(df[col], errors='coerce')\n"
                "        if num_s.notna().any():\n"
                "            fill_val = num_s.median()\n"
                "            df[col] = df[col].fillna(fill_val)\n"
                "            print(f'Filled missing values in {col} with median: {fill_val}')\n"
                "        else:\n"
                "            mode_s = df[col].mode()\n"
                "            fill_val = mode_s.iloc[0] if not mode_s.empty else 'Unknown'\n"
                "            df[col] = df[col].fillna(fill_val)\n"
                "            print(f'Filled missing values in {col} with mode: {fill_val}')\n"
                "    return df"
            )

        if "mean" in instr_lower:
            return (
                "def clean_step(df):\n"
                "    import pandas as pd\n"
                f"    col = '{target_col}'\n"
                "    if col in df.columns:\n"
                "        num_s = pd.to_numeric(df[col], errors='coerce')\n"
                "        if num_s.notna().any():\n"
                "            fill_val = num_s.mean()\n"
                "            df[col] = df[col].fillna(fill_val)\n"
                "            print(f'Filled missing {col} with mean: {fill_val:.2f}')\n"
                "        else:\n"
                "            mode_s = df[col].mode()\n"
                "            fill_val = mode_s.iloc[0] if not mode_s.empty else 'Unknown'\n"
                "            df[col] = df[col].fillna(fill_val)\n"
                "            print(f'Filled missing values in {col} with mode: {fill_val}')\n"
                "    return df"
            )

        if "zero" in instr_lower or "fill with 0" in instr_lower:
            return (
                "def clean_step(df):\n"
                "    import pandas as pd\n"
                f"    col = '{target_col}'\n"
                "    if col in df.columns:\n"
                "        df[col] = df[col].fillna(0)\n"
                "        print(f'Filled missing values in {col} with 0')\n"
                "    return df"
            )

        if "mixed_numeric_column" in user_text:
            return (
                "def clean_step(df):\n"
                "    import pandas as pd\n"
                f"    col = '{target_col}'\n"
                "    if col in df.columns:\n"
                "        cleaned = df[col].astype(str).str.replace('$', '', regex=False).str.replace(',', '', regex=False).str.replace('k', '000', case=False, regex=False)\n"
                "        numeric_version = pd.to_numeric(cleaned, errors='coerce')\n"
                "        failed_count = int(numeric_version.isna().sum() - df[col].isna().sum())\n"
                "        if failed_count > 0:\n"
                "            print(f'Warning: {failed_count} values could not convert to numbers and became NaN')\n"
                "        df[col] = numeric_version\n"
                "    return df"
            )

        if "disguised_null" in user_text:
            return (
                "def clean_step(df):\n"
                "    import pandas as pd\n"
                f"    col = '{target_col}'\n"
                "    if col in df.columns:\n"
                f"        mask = df[col].astype(str).isin(['{target_val}', 'unknown', 'none', '?', 'null', 'N/A'])\n"
                "        replaced = int(mask.sum())\n"
                "        df.loc[mask, col] = pd.NA\n"
                "        if replaced > 0:\n"
                "            print(f'Replaced {replaced} disguised nulls in {col} with NA')\n"
                "    return df"
            )

        if "missing_values" in user_text:
            return (
                "def clean_step(df):\n"
                "    import pandas as pd\n"
                f"    col = '{target_col}'\n"
                "    if col in df.columns:\n"
                "        num_s = pd.to_numeric(df[col], errors='coerce')\n"
                "        if num_s.notna().any():\n"
                "            fill_val = num_s.median()\n"
                "            df[col] = df[col].fillna(fill_val)\n"
                "            print(f'Filled missing values in {col} with median ({fill_val})')\n"
                "        else:\n"
                "            mode_series = df[col].mode()\n"
                "            fill_val = mode_series.iloc[0] if not mode_series.empty else 'Unknown'\n"
                "            df[col] = df[col].fillna(fill_val)\n"
                "            print(f'Filled missing values in {col} with mode ({fill_val})')\n"
                "    return df"
            )

        if "outliers" in user_text:
            return (
                "def clean_step(df):\n"
                "    import pandas as pd\n"
                f"    col = '{target_col}'\n"
                "    if col in df.columns:\n"
                "        num_s = pd.to_numeric(df[col], errors='coerce')\n"
                "        if num_s.notna().any():\n"
                "            q1 = num_s.quantile(0.25)\n"
                "            q3 = num_s.quantile(0.75)\n"
                "            iqr = q3 - q1\n"
                "            lower = q1 - 1.5 * iqr\n"
                "            upper = q3 + 1.5 * iqr\n"
                "            if pd.api.types.is_numeric_dtype(df[col]):\n"
                "                clipped = df[col].clip(lower=lower, upper=upper)\n"
                "                df[col] = clipped\n"
                "            print(f'Capped outliers in {col} to [{lower:.1f}, {upper:.1f}]')\n"
                "    return df"
            )

        if "suggested_fuzzy_merges" in user_text or "inconsistent_category_spelling" in user_text:
            # Try to build dynamic replacements from the anomaly's suggested_fuzzy_merges field
            replacements = {}
            if isinstance(anomaly_data, dict):
                for merge_group in anomaly_data.get("suggested_fuzzy_merges", []):
                    if isinstance(merge_group, list) and len(merge_group) >= 2:
                        # Use the first value as canonical (usually the most common)
                        canonical = str(merge_group[0])
                        for variant in merge_group[1:]:
                            replacements[str(variant)] = canonical

            if replacements:
                replacements_repr = repr(replacements)
                return (
                    "def clean_step(df):\n"
                    "    import pandas as pd\n"
                    f"    col = '{target_col}'\n"
                    "    if col in df.columns:\n"
                    f"        replacements = {replacements_repr}\n"
                    "        df[col] = df[col].replace(replacements)\n"
                    "        print(f'Standardized inconsistent categories in {col}')\n"
                    "    return df"
                )
            else:
                # Fallback: normalize case and strip whitespace
                return (
                    "def clean_step(df):\n"
                    "    import pandas as pd\n"
                    f"    col = '{target_col}'\n"
                    "    if col in df.columns:\n"
                    "        df[col] = df[col].astype(str).str.strip().str.title()\n"
                    "        print(f'Normalized category casing and whitespace in {col}')\n"
                    "    return df"
                )

        # Generic fallback
        return (
            "def clean_step(df):\n"
            f"    col = '{target_col}'\n"
            "    if col in df.columns and pd.api.types.is_numeric_dtype(df[col]):\n"
            "        df[col] = df[col].fillna(df[col].median())\n"
            "    return df"
        )

    # --- Direct data summary requests (descriptive questions) ---
    if "Dataset context:" in user_text:
        # Return a generic, honest offline-mode response rather than fictional column names
        return (
            "[OFFLINE DEMO MODE] The AI assistant is running without a live LLM connection. "
            "To get real, dataset-specific answers about your data's columns, trends, and quality issues, "
            "please configure a live LLM provider in the Settings (⚙) panel — "
            "NVIDIA NIM, Groq, or any custom OpenAI-compatible endpoint works. "
            "In offline mode only mock responses are available."
        )

    # --- Analysis plan requests ---
    if "Question:" in user_text:
        # Return a generic honest offline response
        return json.dumps([
            {"step": "[OFFLINE DEMO MODE] Configure a live LLM provider in Settings to get a real analysis plan."},
            {"step": "Supported providers: NVIDIA NIM (free tier available), Groq (free tier available), or any custom OpenAI-compatible endpoint."}
        ])

    return "No mock response defined for this prompt pattern."


# ---------------------------------------------------------
# LIVE LLM CALL (Groq) - secondary fallback provider
# ---------------------------------------------------------

def live_llm_call_groq(prompt, model="llama-3.3-70b-versatile", max_retries=3, api_key=None):
    """
    Sends the prompt to the Groq API and returns the raw text response.
    Requires `pip install groq`. Uses api_key if supplied, otherwise GROQ_API_KEY env var.
    """
    import time

    try:
        from groq import Groq
    except ImportError:
        raise ImportError(
            "groq is not installed. Run: pip install groq "
            "(only needed if you're calling live_llm_call_groq - "
            "mock_llm_call works without it)."
        )

    key = api_key or os.environ.get("GROQ_API_KEY")
    if not key:
        raise RuntimeError(
            "GROQ_API_KEY not set. Please provide a Groq key in Settings or set the GROQ_API_KEY environment variable."
        )

    client = Groq(api_key=key)

    system_text = prompt.get("system", "")
    user_text = prompt["user"]

    messages = []
    if system_text:
        messages.append({"role": "system", "content": system_text})
    messages.append({"role": "user", "content": user_text})

    last_error = None
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.0,
            )
            return response.choices[0].message.content
        except Exception as e:
            last_error = e
            error_text = str(e)
            if "429" in error_text or "rate_limit" in error_text.lower():
                wait_time = 20 * (attempt + 1)
                print(f"  [Groq rate limit hit - waiting {wait_time}s before retry {attempt + 1}/{max_retries}]")
                time.sleep(wait_time)
                continue
            else:
                raise RuntimeError(f"Groq API call failed: {error_text}")

    raise RuntimeError(f"Groq API call failed after {max_retries} retries: {last_error}")


def live_llm_call_nemotron(prompt, model="nvidia/llama-3.1-nemotron-70b-instruct", max_retries=3, api_key=None):
    """
    Sends the prompt to NVIDIA's Nemotron 70B via NVIDIA NIM.
    Uses api_key if supplied, otherwise NVIDIA_API_KEY env var.
    """
    import time

    try:
        from openai import OpenAI
    except ImportError:
        raise ImportError(
            "openai package is not installed. Run: pip install openai "
            "(only needed if you're calling live_llm_call_nemotron - "
            "mock_llm_call works without it)."
        )

    key = api_key or os.environ.get("NVIDIA_API_KEY")
    if not key:
        raise RuntimeError(
            "NVIDIA_API_KEY not set. Please provide an NVIDIA key in Settings or get one free at build.nvidia.com."
        )

    client = OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=key)

    system_text = prompt.get("system", "")
    user_text = prompt["user"]

    messages = []
    if system_text:
        messages.append({"role": "system", "content": system_text})
    messages.append({"role": "user", "content": user_text})

    models_to_try = [model]
    if model != "nvidia/llama-3.1-nemotron-70b-instruct":
        models_to_try.append("nvidia/llama-3.1-nemotron-70b-instruct")

    last_error = None
    for current_model in models_to_try:
        for attempt in range(max_retries):
            try:
                response = client.chat.completions.create(
                    model=current_model,
                    messages=messages,
                    temperature=0.0,
                    timeout=30.0,
                )
                return response.choices[0].message.content
            except Exception as e:
                last_error = e
                error_text = str(e)
                if "429" in error_text or "rate_limit" in error_text.lower():
                    wait_time = 10 * (attempt + 1)
                    print(f"  [NVIDIA NIM rate limit hit on {current_model} - waiting {wait_time}s before retry {attempt + 1}/{max_retries}]")
                    time.sleep(wait_time)
                    continue
                elif "timeout" in error_text.lower() or "timed out" in error_text.lower():
                    print(f"  [{current_model} timed out. Attempting next candidate...]")
                    break
                else:
                    if len(models_to_try) > 1 and current_model != models_to_try[-1]:
                        print(f"  [{current_model} failed ({error_text[:80]}). Trying fallback {models_to_try[-1]}...]")
                        break
                    raise RuntimeError(f"NVIDIA NIM API call failed: {error_text}")

    raise RuntimeError(f"NVIDIA NIM API call failed after retries: {last_error}")


def live_llm_call_custom(prompt, base_url, model, api_key=None, max_retries=2, timeout=40.0):
    """
    Sends the prompt to any user-specified OpenAI-compatible endpoint
    (Ollama, LM Studio, OpenRouter, DeepSeek, OpenAI, vLLM, Groq, NVIDIA NIM, etc.).
    """
    import time
    from openai import OpenAI

    url = (base_url or "").strip().rstrip("/")
    if not url:
        raise ValueError("Custom Base URL / Endpoint cannot be empty.")

    mod = (model or "").strip()
    if not mod:
        raise ValueError("Custom Model Name cannot be empty.")

    # For local servers (Ollama, LM Studio), API key is not required, but OpenAI client needs a non-empty string.
    key = (api_key or "").strip() or "local-no-key"

    client = OpenAI(base_url=url, api_key=key, timeout=timeout)

    system_text = prompt.get("system", "")
    user_text = prompt.get("user", "")

    messages = []
    if system_text:
        messages.append({"role": "system", "content": system_text})
    messages.append({"role": "user", "content": user_text})

    last_error = None
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model=mod,
                messages=messages,
                temperature=0.0,
            )
            return response.choices[0].message.content
        except Exception as e:
            last_error = e
            error_text = str(e)
            if "429" in error_text or "rate_limit" in error_text.lower():
                time.sleep(2 * (attempt + 1))
                continue
            raise RuntimeError(f"Custom LLM ({mod} @ {url}) call failed: {error_text}")

    raise RuntimeError(f"Custom LLM ({mod}) call failed after {max_retries} retries: {last_error}")


def extract_json_block(llm_response):
    """
    Same problem as extract_code_block() but for JSON responses.
    """
    match = re.search(r"```(?:json)?\s*\n(.*?)```", llm_response, re.DOTALL)
    if match:
        return match.group(1).strip()
    return llm_response.strip()


# ---------------------------------------------------------
# UNIFIED WRAPPERS: Supports Bring-Your-Own-Key per request
# ---------------------------------------------------------

def _dispatch_llm_call(
    prompt, 
    use_mock=True, 
    provider="nemotron", 
    nvidia_api_key=None, 
    groq_api_key=None,
    custom_base_url=None,
    custom_model=None,
    custom_api_key=None
):
    """
    Dispatches the LLM call using either mock, custom (any OpenAI-compatible URL + model),
    Nemotron, Groq, or auto fallback.
    Accepts per-request user API keys for multi-user isolation.
    """
    if use_mock or provider == "mock":
        return mock_llm_call(prompt)

    if provider == "custom":
        return live_llm_call_custom(
            prompt,
            base_url=custom_base_url,
            model=custom_model,
            api_key=custom_api_key
        )

    if provider == "auto":
        providers_in_order = [
            ("Nemotron", lambda p: live_llm_call_nemotron(p, api_key=nvidia_api_key)),
            ("Groq", lambda p: live_llm_call_groq(p, api_key=groq_api_key)),
        ]
        errors = []
        for name, call_fn in providers_in_order:
            try:
                return call_fn(prompt)
            except Exception as e:
                errors.append(f"{name}: {e}")
                print(f"  [{name} failed - trying next provider...]")
        raise RuntimeError("All providers failed. " + " | ".join(errors))

    if provider == "groq":
        return live_llm_call_groq(prompt, api_key=groq_api_key)
    if provider == "nemotron":
        return live_llm_call_nemotron(prompt, api_key=nvidia_api_key)
    raise ValueError(f"Unknown provider '{provider}' - use 'custom', 'nemotron', 'groq', 'mock', or 'auto'.")


def get_explanation(anomaly, use_mock=True, provider="nemotron", nvidia_api_key=None, groq_api_key=None,
                    custom_base_url=None, custom_model=None, custom_api_key=None):
    """Returns a plain-English explanation string for one anomaly."""
    prompt = build_explanation_prompt(anomaly)
    return _dispatch_llm_call(
        prompt, use_mock, provider, 
        nvidia_api_key=nvidia_api_key, groq_api_key=groq_api_key,
        custom_base_url=custom_base_url, custom_model=custom_model, custom_api_key=custom_api_key
    )


def get_cleaning_code(anomaly, use_mock=True, provider="nemotron", nvidia_api_key=None, groq_api_key=None, 
                      custom_instruction=None, custom_base_url=None, custom_model=None, custom_api_key=None):
    """
    Returns CLEAN, extracted Python code (no markdown fences, no conversational text)
    ready for validate_code_safety_ast() / exec.
    """
    prompt = build_cleaning_code_prompt(anomaly, custom_instruction=custom_instruction)
    raw_response = _dispatch_llm_call(
        prompt, use_mock, provider, 
        nvidia_api_key=nvidia_api_key, groq_api_key=groq_api_key,
        custom_base_url=custom_base_url, custom_model=custom_model, custom_api_key=custom_api_key
    )
    return extract_code_block(raw_response)


def get_data_summary(question, report, use_mock=True, provider="nemotron", nvidia_api_key=None, groq_api_key=None,
                     custom_base_url=None, custom_model=None, custom_api_key=None):
    """
    Direct, grounded narrative answer for descriptive questions about the dataset.
    """
    prompt = build_data_summary_prompt(question, report)
    return _dispatch_llm_call(
        prompt, use_mock, provider, 
        nvidia_api_key=nvidia_api_key, groq_api_key=groq_api_key,
        custom_base_url=custom_base_url, custom_model=custom_model, custom_api_key=custom_api_key
    )


def get_analysis_plan(question, column_schema, use_mock=True, provider="nemotron", nvidia_api_key=None, groq_api_key=None,
                      custom_base_url=None, custom_model=None, custom_api_key=None):
    """
    Returns a parsed Python list of plan steps.
    """
    prompt = build_analysis_plan_prompt(question, column_schema)
    raw_response = _dispatch_llm_call(
        prompt, use_mock, provider, 
        nvidia_api_key=nvidia_api_key, groq_api_key=groq_api_key,
        custom_base_url=custom_base_url, custom_model=custom_model, custom_api_key=custom_api_key
    )
    json_text = extract_json_block(raw_response)
    try:
        return json.loads(json_text)
    except json.JSONDecodeError as e:
        return {"error": f"Model returned invalid JSON: {e}", "raw_response": raw_response}


def test_api_key(provider, api_key=None, base_url=None, model=None):
    """
    Validates a user-provided API key or custom endpoint by sending a minimal test completion.
    Used by the frontend to confirm personal keys and endpoints are working.
    """
    if provider == "mock":
        return {"valid": True, "provider": "mock", "message": "Demo Mock Mode active (no key needed)"}

    if provider == "custom":
        url = (base_url or "").strip().rstrip("/")
        mod = (model or "").strip()
        key = (api_key or "").strip() or "local-no-key"

        if not url:
            return {"valid": False, "provider": "custom", "error": "Endpoint URL is required (e.g., http://localhost:11434/v1 or https://api.openai.com/v1)."}
        if not mod:
            return {"valid": False, "provider": "custom", "error": "Model Name is required (e.g., llama3.2, gpt-4o-mini, deepseek-chat)."}

        try:
            from openai import OpenAI
            client = OpenAI(base_url=url, api_key=key, timeout=12.0)
            client.chat.completions.create(
                model=mod,
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=2,
            )
            return {"valid": True, "provider": "custom", "message": f"Successfully connected to '{mod}' at {url}!"}
        except Exception as e:
            err_msg = str(e)
            if "Connection refused" in err_msg or "Cannot connect" in err_msg or "Failed to connect" in err_msg:
                return {"valid": False, "provider": "custom", "error": f"Connection refused at {url}. Is your local LLM (e.g. Ollama/LM Studio) running?"}
            if "401" in err_msg or "403" in err_msg or "Unauthorized" in err_msg:
                return {"valid": False, "provider": "custom", "error": "Authentication failed (401/403). Please verify your API Key."}
            if "404" in err_msg or "model_not_found" in err_msg.lower():
                return {"valid": False, "provider": "custom", "error": f"Model '{mod}' not found on server {url}. Please check the exact model name."}
            if "timed out" in err_msg.lower() or "timeout" in err_msg.lower():
                return {"valid": False, "provider": "custom", "error": f"Connection to {url} timed out (server didn't respond within 12s)."}
            return {"valid": False, "provider": "custom", "error": f"Connection test failed: {err_msg}"}

    key = (api_key or "").strip()
    if not key:
        return {"valid": False, "provider": provider, "error": "API key cannot be empty. Please enter your key."}

    if provider in ("nemotron", "nvidia"):
        try:
            from openai import OpenAI
            client = OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=key, timeout=15.0)
            # Use the fast 70b Nemotron endpoint for near-instant (1-2s) auth verification
            # instead of queuing on the 550B cluster
            client.chat.completions.create(
                model="nvidia/llama-3.1-nemotron-70b-instruct",
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=2,
            )
            return {"valid": True, "provider": "nemotron", "message": "NVIDIA Nemotron connected successfully!"}
        except Exception as e:
            err_msg = str(e)
            if "401" in err_msg or "403" in err_msg or "Unauthorized" in err_msg or "Forbidden" in err_msg or "invalid_api_key" in err_msg.lower() or "Authorization failed" in err_msg:
                return {"valid": False, "provider": "nemotron", "error": "Invalid NVIDIA API key (403 Forbidden). Please check your key at build.nvidia.com."}
            if "timed out" in err_msg.lower() or "timeout" in err_msg.lower():
                return {"valid": False, "provider": "nemotron", "error": "NVIDIA connection timed out (NIM cloud queue is busy). You can still click 'Save Configuration' to use it, or switch to Groq / Demo mode."}
            return {"valid": False, "provider": "nemotron", "error": f"NVIDIA connection failed: {err_msg}"}

    if provider == "groq":
        try:
            from groq import Groq
            client = Groq(api_key=key, timeout=20.0)
            client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=2,
            )
            return {"valid": True, "provider": "groq", "message": "Groq connected successfully!"}
        except Exception as e:
            err_msg = str(e)
            if "401" in err_msg or "403" in err_msg or "invalid_api_key" in err_msg.lower():
                return {"valid": False, "provider": "groq", "error": "Invalid Groq API key (401 Unauthorized). Please check your key at console.groq.com."}
            if "timed out" in err_msg.lower() or "timeout" in err_msg.lower():
                return {"valid": False, "provider": "groq", "error": "Groq connection timed out. Please test with 'hi' in the chatbox below or retry."}
            return {"valid": False, "provider": "groq", "error": f"Groq connection failed: {err_msg}"}

    return {"valid": False, "error": f"Unknown provider '{provider}'"}
