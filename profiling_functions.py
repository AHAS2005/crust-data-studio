"""
Data Profiling & Cleaning - Functions 1 to 7
Beginner-friendly version with comments explaining each step.
"""

import pandas as pd
import numpy as np


# ---------------------------------------------------------
# FUNCTION 1: load_data
# ---------------------------------------------------------
def load_data(filepath):
    """
    Loads a CSV file into a pandas dataframe and returns basic info.

    UPDATED (round 3): now resilient to two real-world failure modes:
    1. Non-UTF-8 encoding - tries a short list of common encodings in
       order instead of crashing on the first one that fails.
    2. Malformed rows (wrong number of columns) - instead of the whole
       load crashing on ONE broken row, bad rows are skipped and counted,
       so the user still gets a usable dataframe plus a warning.
    """
    encodings_to_try = ["utf-8", "utf-8-sig", "latin-1", "cp1252"]
    df = None
    used_encoding = None
    bad_lines_skipped = 0

    for encoding in encodings_to_try:
        try:
            # on_bad_lines="warn" (pandas >= 1.3) skips rows with the wrong
            # column count instead of crashing the whole read.
            df = pd.read_csv(filepath, encoding=encoding, on_bad_lines="warn", engine="python")
            used_encoding = encoding
            break
        except UnicodeDecodeError:
            continue  # try the next encoding
        except TypeError:
            # Older pandas versions don't support on_bad_lines - fall back
            df = pd.read_csv(filepath, encoding=encoding, error_bad_lines=False)
            used_encoding = encoding
            break

    if df is None:
        raise ValueError(
            f"Could not read this file with any of the common encodings tried: {encodings_to_try}. "
            "The file may be corrupted or use an unusual encoding."
        )

    info = {
        "rows": df.shape[0],
        "columns": df.shape[1],
        "column_names": list(df.columns),
        "encoding_used": used_encoding
    }

    return df, info


# ---------------------------------------------------------
# FUNCTION 2: detect_column_types
# ---------------------------------------------------------
def _is_hashable(value):
    """Small helper: returns True if a single value can be hashed by pandas/Python."""
    try:
        hash(value)
        return True
    except TypeError:
        return False


def _clean_numeric_series(series):
    """
    Helper for detect_column_types().

    WHY THIS CHANGED: the original version used a single 90% threshold -
    if 90%+ of values converted to numbers, the WHOLE column was called
    "numeric", and pd.to_numeric(errors="coerce") silently turned the
    remaining values into NaN. That's a real data-integrity problem: a
    column that's 92% clean numbers and 8% genuine text like "Pending" or
    "Refused" would have that 8% silently wiped out and replaced with
    missing values - before the health report even ran.

    NEW APPROACH: this function no longer decides the column's type. It
    just does the cleaning/conversion and hands back THREE things:
      - the cleaned numeric series (NaN only where conversion failed)
      - a count of exactly which original values failed to convert, so
        nothing is silently thrown away without a record
      - the success rate, so the caller can decide what to do with it

    detect_column_types() then makes the classification decision using
    this info, instead of one blunt percentage cutoff hiding the details.
    """
    if not pd.api.types.is_object_dtype(series) and not pd.api.types.is_string_dtype(series):
        return None, {}, 0.0

    cleaned_str = (
        series.astype(str)
        .str.replace(r"[$,€£%]", "", regex=True)
        .str.strip()
    )
    converted = pd.to_numeric(cleaned_str, errors="coerce")

    # Which ORIGINAL values failed to convert? (not just "how many")
    failed_mask = converted.isna()
    failed_values = series[failed_mask]
    failed_value_counts = failed_values.value_counts().to_dict()

    success_rate = converted.notna().sum() / len(series) if len(series) > 0 else 0.0

    # Remove "nan" from the failed dict — real NaN cells become the string "nan"
    # after astype(str) but are semantically missing, not a non-numeric value.
    # Including them would produce a false report entry like "nan appears 42 times".
    failed_value_counts.pop("nan", None)
    failed_value_counts.pop("<NA>", None)

    return converted, failed_value_counts, success_rate


def detect_column_types(df):
    """
    Classifies each column as numeric, mixed_numeric, categorical, date,
    boolean, or text.

    FIX (Task 1, revised): a numeric column formatted with symbols like
    "$1,200" is now correctly recognized as numeric. But we no longer force
    a column into "numeric" just because MOST values converted - if a
    meaningful chunk of values genuinely aren't numbers (e.g. "Pending",
    "Refused"), the column is labeled "mixed_numeric" instead. This keeps
    that leftover text visible in the health report rather than silently
    discarding it, which is what the old 90%-threshold version did.
    """
    column_types = {}

    for col in df.columns:
        series = df[col].dropna()

        if series.empty:
            column_types[col] = "unknown (all missing)"
            continue

        # NEW: guard against unhashable values (e.g. a stray Python dict or
        # list ending up in a cell). pandas' .unique() and .nunique() both
        # need to hash values internally, so an unhashable value crashes
        # the whole function with a cryptic TypeError. Rather than letting
        # that happen - or silently ignoring it - we flag the column so
        # the user can see something genuinely unusual is in their data.
        try:
            series.apply(hash)
        except TypeError:
            column_types[col] = "invalid_mixed_types"
            continue

        # Check boolean first — only flag as boolean if dtype is already bool,
        # OR if the column genuinely contains only Python True/False objects (not 0/1 integers).
        # Without this guard, any binary numeric column (0/1) gets misclassified as boolean
        # and bypasses outlier detection, numeric analysis, etc.
        if pd.api.types.is_bool_dtype(series):
            column_types[col] = "boolean"
            continue
        # Check if values are actual Python booleans (True/False), not just 0/1 ints
        if series.dtype == object:
            unique_vals = set(series.dropna().unique())
            if unique_vals.issubset({True, False}) and any(isinstance(v, bool) for v in unique_vals):
                column_types[col] = "boolean"
                continue

        # Check numeric (the normal, already-clean case)
        if pd.api.types.is_numeric_dtype(series):
            column_types[col] = "numeric"
            continue

        # Check numeric-with-formatting, e.g. "$1,200", "45%"
        _, _, success_rate = _clean_numeric_series(series)
        if success_rate >= 0.98:
            # Effectively everything converts - treat as clean numeric.
            column_types[col] = "numeric"
            continue
        elif success_rate >= 0.5:
            # A real, meaningful mix of numbers and non-numeric text.
            # Flagged separately so nothing gets silently dropped later.
            column_types[col] = "mixed_numeric"
            continue

        # Check date - try converting a sample
        try:
            pd.to_datetime(series.sample(min(10, len(series)), random_state=1))
            column_types[col] = "date"
            continue
        except (ValueError, TypeError):
            pass

        # Check categorical vs free text
        # Rule of thumb: if unique values are a small % of total rows, treat as categorical
        unique_ratio = series.nunique() / len(series)
        if unique_ratio < 0.5:
            column_types[col] = "categorical"
        else:
            column_types[col] = "text"

    return column_types


# ---------------------------------------------------------
# FUNCTION 3: check_missing_values
# ---------------------------------------------------------
def check_missing_values(df):
    """
    Calculates missing value count and percentage per column.
    """
    if len(df) == 0:
        return pd.DataFrame(columns=["missing_count", "missing_percent"])

    missing_count = df.isnull().sum()
    missing_percent = (missing_count / len(df)) * 100

    summary = pd.DataFrame({
        "missing_count": missing_count,
        "missing_percent": missing_percent.round(2)
    })

    # Only show columns that actually have missing values
    summary = summary[summary["missing_count"] > 0]

    return summary


# ---------------------------------------------------------
# FUNCTION 4: check_duplicates
# ---------------------------------------------------------
def check_duplicates(df):
    """
    Finds exact duplicate rows in the dataset.

    FIX: df.duplicated() defaults to keep='first', which flags every
    COPY but never the ORIGINAL row it's a copy of. A sample built purely
    from that mask shows a user rows that look like duplicates with no
    context for what they're duplicating - confusing to read. This now
    also returns duplicate_groups: every row involved in a duplicate set
    (original AND copies together, keep=False), grouped so they can be
    shown side by side.
    """
    duplicate_mask = df.duplicated()  # keep='first' - matches original count semantics
    duplicate_count = duplicate_mask.sum()
    duplicate_rows = df[duplicate_mask]

    # ALL rows involved in a duplicate set, including the original -
    # this is what actually gives a sample enough context to be readable.
    all_involved_mask = df.duplicated(keep=False)
    duplicate_groups = _group_duplicate_rows(df[all_involved_mask]) if all_involved_mask.any() else []

    return {
        "duplicate_count": int(duplicate_count),
        "duplicate_rows": duplicate_rows,
        "duplicate_groups": duplicate_groups
    }


def _group_duplicate_rows(dupe_rows_df, max_groups=5):
    """
    Groups rows that are identical to each other, so a sample shows the
    ORIGINAL and its COPIES together as one readable unit, instead of a
    flat list of copies with no context for what they're duplicating.

    PERFORMANCE FIX: the original version used a pure-Python iterrows()
    loop that computed a string-tuple key for EVERY row in dupe_rows_df,
    even though only the first max_groups groups are ever kept - on a
    dataset with hundreds of thousands of duplicate rows, that's a slow
    Python-level pass over the whole set just to throw most of it away.
    Uses pandas' groupby() instead, which forms the groups via a
    C-optimized pass rather than a per-row Python loop - iterrows() is
    now only called on the tiny handful of rows belonging to the first
    max_groups groups, not the entire duplicate set.
    """
    if dupe_rows_df.empty:
        return []

    result = []
    # dropna=False: rows with NaN values should still group together if
    # every other value matches - default groupby drops NaN groups otherwise.
    grouped = dupe_rows_df.groupby(list(dupe_rows_df.columns), dropna=False, sort=False)

    for group_number, (_, group_df) in enumerate(grouped):
        if group_number >= max_groups:
            break  # stop as soon as we have enough groups - no need to
                    # process the remaining groups at all
        rows = [
            {"row_index": int(idx), "values": row.to_dict()}
            for idx, row in group_df.iterrows()
        ]
        result.append({"group_size": len(rows), "rows": rows})

    return result


# ---------------------------------------------------------
# FUNCTION 5: detect_outliers
# ---------------------------------------------------------
def detect_outliers(df, column_types, min_sample_size=30):
    """
    Detects outliers in numeric columns using the IQR method.

    UPDATED (round 2): now also runs on "mixed_numeric" columns - not just
    pure "numeric" ones. A mixed_numeric column (e.g. 95.7% real numbers,
    4.3% real text like "Pending" or a confidentiality code) still has a
    numeric portion worth checking for outliers - we just isolate that
    portion and are transparent in the report about how many rows were
    excluded, instead of skipping the whole column.

    TWO GUARDRAILS ADDED (per second-opinion review, both statistically
    real concerns):
    1. min_sample_size: below ~30 numeric values, IQR's quartiles become
       highly sensitive to single observations - the "outlier fence" is
       built on a shaky foundation. We skip outlier detection rather than
       report a misleadingly confident result on tiny samples.
    2. Zero-variance guard: if the numeric values that remain (often in a
       heavily-suppressed mixed_numeric column) are mostly identical
       (e.g. a repeated placeholder like 0), Q1 == Q3 and IQR == 0. Any
       tiny deviation would then get flagged as an "outlier" even though
       it's not meaningfully unusual - so we skip these too.
    """
    outlier_report = {}

    # Now includes mixed_numeric, not just pure numeric columns
    target_cols = [col for col, ctype in column_types.items() if ctype in ("numeric", "mixed_numeric")]

    for col in target_cols:
        col_type = column_types[col]
        raw_series = df[col].dropna()
        total_non_null = len(raw_series)

        if total_non_null == 0:
            continue

        # If the column is already clean numbers, this leaves it unchanged.
        # If it's formatted text like "$1,200" or has some non-numeric
        # values mixed in, this isolates just the numeric portion.
        if pd.api.types.is_numeric_dtype(raw_series):
            series = raw_series
            non_numeric_ignored = 0
        else:
            cleaned, _, _ = _clean_numeric_series(raw_series)
            series = cleaned.dropna() if cleaned is not None else pd.Series(dtype=float)
            non_numeric_ignored = total_non_null - len(series)

        numeric_count = len(series)

        # Guardrail 1: not enough numeric values left for reliable IQR
        if numeric_count < min_sample_size:
            continue

        q1 = series.quantile(0.25)
        q3 = series.quantile(0.75)
        iqr = q3 - q1

        # Guardrail 2: zero variance - every remaining value is ~identical,
        # so IQR-based fences would flag normal data as outliers
        if iqr == 0:
            continue

        lower_bound = q1 - 1.5 * iqr
        upper_bound = q3 + 1.5 * iqr

        # IMPORTANT: compare against the CLEANED numeric series, not the raw
        # df[col] - if the raw column is still text like "$45,000", comparing
        # it to a number crashes (can't do "$45,000" < 247.5 in Python).
        # We reindex `series` back onto df's index so row positions still match.
        aligned_series = series.reindex(df.index)
        outliers = df[(aligned_series < lower_bound) | (aligned_series > upper_bound)]

        # MAD (Median Absolute Deviation) - a secondary, more robust
        # outlier check computed alongside IQR (not replacing it).
        # WHY: IQR has a known "25% breakdown point" - if more than a
        # quarter of the column's values are genuinely anomalous, the
        # quartiles themselves shift to include them, and IQR goes blind.
        # MAD is built from the median, which doesn't move nearly as much
        # even when a large chunk of the data is anomalous, so comparing
        # the two counts is a cheap way to sanity-check IQR's result.
        median = series.median()
        abs_deviations = (series - median).abs()
        mad = abs_deviations.median()
        # 0.6745 is a standard scaling constant that makes MAD comparable
        # to a standard deviation for normally-distributed data.
        if mad > 0:
            modified_z_scores = 0.6745 * (series - median) / mad
            mad_outlier_count = int((modified_z_scores.abs() > 3.5).sum())
        else:
            mad_outlier_count = None  # can't compute - all values identical to median

        iqr_outlier_ratio = len(outliers) / numeric_count if numeric_count > 0 else 0

        if len(outliers) > 0:
            # Grab a few real values, not just counts/bounds - so an LLM
            # (or a human) reading the report can see WHAT the outliers
            # actually look like, e.g. "$45,000" vs the typical "$1,200".
            sample_values = series.reindex(outliers.index).dropna().head(5).tolist()

            outlier_entry = {
                "column_type": col_type,
                "outlier_count": len(outliers),
                "lower_bound": round(lower_bound, 2),
                "upper_bound": round(upper_bound, 2),
                "outlier_indices": outliers.index.tolist(),
                # NEW: transparency fields - so a user isn't confused when
                # analyzed rows don't match the column's total row count
                "numeric_rows_analyzed": numeric_count,
                "non_numeric_ignored": non_numeric_ignored,
                "numeric_ratio": round(numeric_count / total_non_null, 3) if total_non_null > 0 else 0.0,
                "sample_values": sample_values,
                "mad_outlier_count": mad_outlier_count
            }

            # Flag IQR's breakdown point risk: if IQR and MAD disagree by a
            # lot, or IQR itself flagged >25% of the column, IQR's result
            # may be unreliable - MAD tends to hold up better in that case.
            if iqr_outlier_ratio > 0.25:
                outlier_entry["breakdown_point_warning"] = (
                    f"IQR flagged {iqr_outlier_ratio*100:.1f}% of this column's numeric values as "
                    "outliers, which exceeds IQR's known 25% breakdown point - beyond this, quartiles "
                    "shift to include the anomalies and the method becomes unreliable. "
                    f"MAD (a more robust alternative) found {mad_outlier_count} outliers for comparison."
                )

            outlier_report[col] = outlier_entry

    return outlier_report


# ---------------------------------------------------------
# FUNCTION 6: check_inconsistent_categories
# ---------------------------------------------------------
def check_inconsistent_categories(df, column_types):
    """
    Finds categorical values that are likely the same thing
    but spelled/formatted differently (case, whitespace).
    """
    inconsistent_report = {}

    categorical_cols = [col for col, ctype in column_types.items() if ctype == "categorical"]

    for col in categorical_cols:
        series = df[col].dropna().astype(str)

        # Normalize: lowercase + strip whitespace
        normalized = series.str.lower().str.strip()

        # Group original values by their normalized form
        groups = {}
        for original, norm in zip(series, normalized):
            groups.setdefault(norm, set()).add(original)

        # Keep only groups where more than one distinct spelling exists
        conflicts = {k: v for k, v in groups.items() if len(v) > 1}

        if conflicts:
            inconsistent_report[col] = conflicts

    return inconsistent_report


def suggest_fuzzy_category_merges(df, column_types, similarity_threshold=0.82, max_unique_to_check=500):
    """
    Finds categorical values that are PROBABLY the same thing but too
    different in spelling for the exact case/whitespace check to catch -
    e.g. "New York" vs "NY", or "Compnay" (typo) vs "Company".

    HOW IT WORKS: uses Python's built-in difflib.SequenceMatcher, which
    scores how similar two strings are (0.0 = totally different, 1.0 =
    identical). No external library needed - this ships with Python.

    WHY A SEPARATE FUNCTION instead of folding into check_inconsistent_categories:
    fuzzy matching is inherently a "maybe" - unlike exact-match grouping,
    it can produce false positives (e.g. "Georgia" the US state vs
    "Georgia" the country are spelled identically but might genuinely be
    different valid values in context). Keeping this separate makes it
    clear to the user these are SUGGESTIONS to review, not certainties.

    SCALING GUARDRAIL: comparing every value to every other value is
    O(n^2) - fine for a few hundred unique values, way too slow for a
    high-cardinality column (e.g. 5,000 unique job titles). If a column
    has more unique values than max_unique_to_check, we skip it and flag
    that it was skipped, rather than silently hanging or timing out.
    """
    import difflib

    fuzzy_report = {}
    categorical_cols = [col for col, ctype in column_types.items() if ctype == "categorical"]

    for col in categorical_cols:
        unique_values = df[col].dropna().astype(str).unique().tolist()

        if len(unique_values) < 2:
            continue

        if len(unique_values) > max_unique_to_check:
            fuzzy_report[col] = {
                "skipped": True,
                "reason": f"{len(unique_values)} unique values exceeds check limit of {max_unique_to_check} (too slow to compare pairwise)"
            }
            continue

        # Simple greedy clustering: compare each value to values not yet
        # grouped, and cluster anything above the similarity threshold.
        already_grouped = set()
        suggested_groups = []

        for i, value_a in enumerate(unique_values):
            if value_a in already_grouped:
                continue

            cluster = [value_a]
            for value_b in unique_values[i + 1:]:
                if value_b in already_grouped:
                    continue
                similarity = difflib.SequenceMatcher(None, value_a.lower(), value_b.lower()).ratio()
                if similarity >= similarity_threshold:
                    cluster.append(value_b)
                    already_grouped.add(value_b)

            if len(cluster) > 1:
                already_grouped.add(value_a)
                suggested_groups.append(cluster)

        if suggested_groups:
            fuzzy_report[col] = {"skipped": False, "suggested_merges": suggested_groups}

    return fuzzy_report


# ---------------------------------------------------------
# FUNCTION 7: check_date_formats
# ---------------------------------------------------------
def check_date_formats(df, column_types):
    """
    Detects if a date column contains multiple different date formats,
    AND checks for genuine MM/DD vs DD/MM ambiguity.

    UPDATED (round 3): the old version just checked for "-" vs "/" in the
    string, which is naive - "2024-01-05" and "01-05-2024" both contain a
    dash but mean different things. This version uses dateutil to actually
    PARSE each value and record its real (year, month, day) structure, so
    it can detect the more dangerous case: a column with BOTH
    "13/01/2024" (unambiguous - must be DD/MM, no month 13) AND "01/13/2024"
    (unambiguous - must be MM/DD, no month 13 either way you slice THIS one)
    mixed together, which means the date logic is genuinely inconsistent,
    not just cosmetically different.
    """
    from dateutil import parser as date_parser

    date_format_report = {}
    date_cols = [col for col, ctype in column_types.items() if ctype == "date"]

    for col in date_cols:
        series = df[col].dropna().astype(str)

        formats_found = set()
        day_over_12_seen = False          # proof some value MUST be DD/MM (day > 12)
        day_under_or_equal_12_seen = False # there's also a value where first num ≤ 12 (ambiguous)
        month_position_varies = False
        parsed_structures = []

        for value in series:
            if "-" in value:
                formats_found.add("dash-separated (e.g. YYYY-MM-DD)")
            elif "/" in value:
                formats_found.add("slash-separated (e.g. MM/DD/YYYY or DD/MM/YYYY)")
            else:
                formats_found.add("other/unrecognized format")

            # Try to actually parse it and see if the first numeric part
            # is unambiguously a day (i.e. > 12, so it can't be a month)
            parts = value.replace("-", "/").split("/")
            if len(parts) == 3 and parts[0].isdigit():
                first_num = int(parts[0])
                if first_num > 12:
                    day_over_12_seen = True
                else:
                    day_under_or_equal_12_seen = True

        # Try parsing a sample with dateutil to double check these are
        # real, valid dates and not just date-shaped text
        sample = series.sample(min(20, len(series)), random_state=1)
        successfully_parsed = 0
        for value in sample:
            try:
                date_parser.parse(value)
                successfully_parsed += 1
            except (ValueError, OverflowError):
                pass
        parse_success_rate = successfully_parsed / len(sample) if len(sample) > 0 else 0

        issues = {}
        if len(formats_found) > 1:
            issues["mixed_separator_formats"] = list(formats_found)
        # Only flag MM/DD vs DD/MM ambiguity if the column has BOTH values with first
        # number ≤12 AND values with first number >12 — that's genuine ambiguity.
        # A consistently DD/MM formatted column where all days >12 is NOT ambiguous.
        if (day_over_12_seen and day_under_or_equal_12_seen and
                "slash-separated (e.g. MM/DD/YYYY or DD/MM/YYYY)" in formats_found):
            issues["mm_dd_vs_dd_mm_ambiguity"] = (
                "This column has slash-separated dates where some values have a first number ≤12 "
                "(could be either MM or DD) and some have a first number >12 (must be DD). "
                "This means the ordering (MM/DD vs DD/MM) cannot be determined automatically."
            )
        if parse_success_rate < 0.9:
            issues["low_parse_confidence"] = f"Only {parse_success_rate*100:.0f}% of a sample parsed as valid dates"

        if issues:
            date_format_report[col] = issues

    return date_format_report


# ---------------------------------------------------------
# FUNCTION 8: generate_health_report
# ---------------------------------------------------------
def _detect_disguised_nulls(df, column_types):
    """
    Helper for generate_health_report().

    WHY THIS EXISTS: real datasets often use placeholder values to mean
    "missing" instead of an actual blank cell - things like "N/A", "-",
    "unknown", "none", or sentinel numbers like -999. pandas' isnull()
    has no idea these mean "missing" - it only catches true NaN/blank cells.
    This scans for common placeholder patterns and reports them GROUPED
    (e.g. "500 rows have '-999' in this column") instead of listing every
    row individually, so the report stays small and readable.
    """
    known_placeholders = {"n/a", "na", "-", "--", "none", "null", "unknown", "unk", "?", ""}
    disguised_nulls = []

    for col in df.columns:
        series = df[col].astype(str).str.strip().str.lower()
        value_counts = series.value_counts()

        for value, count in value_counts.items():
            if value in known_placeholders and count > 0:
                disguised_nulls.append({
                    "column": col,
                    "issue": "disguised_null",
                    "value": value,
                    "frequency": int(count)
                })

    return disguised_nulls


def _detect_mixed_numeric_leftovers(df, column_types):
    """
    Helper for generate_health_report().

    WHY THIS EXISTS: detect_column_types() now labels a column
    "mixed_numeric" instead of forcing it into "numeric" when a real
    chunk of values aren't numbers (e.g. "Pending", "Refused" mixed in
    with dollar amounts). This function surfaces exactly WHICH non-numeric
    values are in there and how often - so nothing is silently dropped,
    and a human (or LLM) can decide whether that's a data entry error or
    a legitimate status value that deserves its own column.
    """
    mixed_report = []
    mixed_cols = [col for col, ctype in column_types.items() if ctype == "mixed_numeric"]

    for col in mixed_cols:
        series = df[col].dropna()
        _, failed_value_counts, success_rate = _clean_numeric_series(series)

        # Report only the most frequent leftover values, not all of them
        top_failures = sorted(failed_value_counts.items(), key=lambda x: x[1], reverse=True)[:5]

        mixed_report.append({
            "column": col,
            "issue": "mixed_numeric_column",
            "percent_numeric": round(success_rate * 100, 1),
            "non_numeric_samples": [{"value": v, "frequency": int(c)} for v, c in top_failures]
        })

    return mixed_report


def check_logical_date_order(df, column_types):
    """
    A minimal cross-column check: if the dataframe has column names that
    look like a start/end pair (e.g. "start_date"/"end_date",
    "admission_date"/"discharge_date"), check that start is never after end.

    SCOPE NOTE: this is intentionally a small, hardcoded check for the
    single most common cross-column issue - not a general rule engine.
    A full rule engine (arbitrary user-defined constraints) was considered
    but scoped out as overkill for this project's current stage.

    PERFORMANCE FIX: originally looped row-by-row with df.loc[i, col] and
    dateutil.parser.parse() per cell - an O(n) Python-level loop that
    bypasses pandas' vectorized C-level operations entirely and visibly
    hangs on large files. Replaced with pd.to_datetime() (itself
    vectorized) plus one vectorized comparison across the whole column.
    """
    date_cols = [col for col, ctype in column_types.items() if ctype == "date"]
    issues = []

    start_keywords = ["start", "begin", "admission", "check_in", "created"]
    end_keywords = ["end", "finish", "discharge", "check_out", "closed"]
    seen_pairs = set()

    for start_col in date_cols:
        for end_col in date_cols:
            if start_col == end_col:
                continue
            pair_key = (start_col, end_col)
            if pair_key in seen_pairs:
                continue
            seen_pairs.add(pair_key)

            start_is_start = any(k in start_col.lower() for k in start_keywords)
            end_is_end = any(k in end_col.lower() for k in end_keywords)

            if start_is_start and end_is_end:
                # Vectorized parse - pandas handles the whole column in
                # one C-level pass instead of one Python call per row.
                # errors="coerce" turns unparseable values into NaT
                # rather than raising, matching the original's "skip rows
                # that don't parse cleanly" behavior.
                start_parsed = pd.to_datetime(df[start_col], errors="coerce")
                end_parsed = pd.to_datetime(df[end_col], errors="coerce")

                # A single vectorized comparison across every row at once.
                # Rows where either side is NaT are automatically excluded,
                # since any comparison involving NaT evaluates to False -
                # same "skip unparseable rows" behavior, with no loop.
                violations = int((start_parsed > end_parsed).sum())

                if violations > 0:
                    issues.append({
                        "start_column": start_col,
                        "end_column": end_col,
                        "issue": "start_after_end",
                        "violation_count": violations
                    })

    return issues


def generate_health_report(df):
    """
    Combines all detection functions into ONE structured, compact report.

    DESIGN CHOICE: anomalies are GROUPED (e.g. one entry saying "500 rows
    have this problem") rather than listed row-by-row. This keeps the
    report small enough to realistically hand to an LLM later without
    blowing past its context window or causing it to lose track of what
    matters. This report only DETECTS problems - it does not fix anything.

    UPDATED: anomalies now include a few real SAMPLE VALUES, not just
    counts. A count alone ("9038 outliers") doesn't tell an LLM or a human
    whether those are billion-dollar aggregates or data-entry typos -
    seeing a few actual values does.
    """
    column_types = detect_column_types(df)
    missing_summary = check_missing_values(df)
    duplicates = check_duplicates(df)
    outliers = detect_outliers(df, column_types)
    inconsistent_categories = check_inconsistent_categories(df, column_types)
    fuzzy_category_suggestions = suggest_fuzzy_category_merges(df, column_types)
    date_format_issues = check_date_formats(df, column_types)
    date_order_issues = check_logical_date_order(df, column_types)
    disguised_nulls = _detect_disguised_nulls(df, column_types)
    mixed_numeric_issues = _detect_mixed_numeric_leftovers(df, column_types)

    total_missing_percent = round((df.isnull().sum().sum() / df.size) * 100, 2) if df.size > 0 else 0

    # Build a flat, grouped list of anomalies - easy to scan, easy to send to an LLM later
    anomalies = []

    for col, count_row in missing_summary.iterrows():
        anomalies.append({
            "column": col,
            "issue": "missing_values",
            "frequency": int(count_row["missing_count"]),
            "percent": float(count_row["missing_percent"])
        })

    for col, report in outliers.items():
        anomaly = {
            "column": col,
            "issue": "outliers",
            "frequency": report["outlier_count"],
            "bounds": [report["lower_bound"], report["upper_bound"]],
            "sample_values": report["sample_values"],
            "numeric_rows_analyzed": report["numeric_rows_analyzed"],
            "non_numeric_ignored": report["non_numeric_ignored"],
            "numeric_ratio": report["numeric_ratio"]
        }

        # MNAR (Missing Not At Random) caution: if a meaningful chunk of
        # this column's values were excluded (not pure "numeric" type),
        # warn that the outlier result only reflects the numeric subset -
        # and that subset may not be a random sample. E.g. confidentiality
        # codes or "Refused" answers are often applied selectively to
        # extreme values (very large or very sensitive numbers), which can
        # skew Q1/Q3 and make this outlier result misleading if treated as
        # if it covered the whole column.
        if report["non_numeric_ignored"] > 0:
            anomaly["warning"] = (
                f"Outlier detection only covers {report['numeric_ratio']*100:.1f}% of this "
                f"column ({report['non_numeric_ignored']} non-numeric rows were excluded). "
                "If those excluded values aren't random (e.g. confidentiality codes or "
                "refused answers tend to hide extreme values), these outlier bounds may "
                "not represent the full column accurately."
            )

        anomalies.append(anomaly)

    for col, groups in inconsistent_categories.items():
        anomalies.append({
            "column": col,
            "issue": "inconsistent_category_spelling",
            "groups_found": len(groups),
            "examples": [list(v) for v in list(groups.values())[:3]]  # cap examples, don't dump everything
        })

    for col, issues in date_format_issues.items():
        anomalies.append({
            "column": col,
            "issue": "date_format_problems",
            "details": issues
        })

    for col, fuzzy_result in fuzzy_category_suggestions.items():
        if fuzzy_result.get("skipped"):
            anomalies.append({
                "column": col,
                "issue": "fuzzy_match_skipped",
                "reason": fuzzy_result["reason"]
            })
        else:
            anomalies.append({
                "column": col,
                "issue": "suggested_fuzzy_merges",
                "note": "These are SUGGESTIONS to review, not certainties - similar spelling doesn't always mean same meaning.",
                "suggested_merges": fuzzy_result["suggested_merges"]
            })

    for issue in date_order_issues:
        anomalies.append({
            "column": f"{issue['start_column']} / {issue['end_column']}",
            "issue": "start_date_after_end_date",
            "violation_count": issue["violation_count"]
        })

    anomalies.extend(disguised_nulls)
    anomalies.extend(mixed_numeric_issues)

    # NEW: surface columns with unhashable/invalid mixed types (e.g. a
    # stray dict or list in a cell) as a visible anomaly, not just a
    # silent type label - the user needs to know something structurally
    # unusual is happening in that column.
    for col, ctype in column_types.items():
        if ctype == "invalid_mixed_types":
            bad_values = df[col].dropna().apply(
                lambda v: (not _is_hashable(v))
            )
            sample_bad = df[col].dropna()[bad_values].head(3).tolist()
            anomalies.append({
                "column": col,
                "issue": "invalid_mixed_types",
                "description": "Column contains unhashable values (e.g. dict/list) mixed with normal data - cannot be reliably typed",
                "sample_values": [str(v) for v in sample_bad]
            })

    # Surface WHICH rows are duplicates, not just how many - a bare count
    # forces the user to go dig through check_duplicates() separately to
    # actually see them, which defeats the point of a self-contained report.
    # Show duplicate GROUPS (original + its copies together) instead of
    # just the copies alone - a copy with no visible original is
    # confusing to read, since there's no context for what it duplicates.
    duplicate_sample = duplicates.get("duplicate_groups", [])

    report = {
        "summary": {
            "total_rows": df.shape[0],
            "total_columns": df.shape[1],
            "overall_missing_percent": total_missing_percent,
            "duplicate_row_count": duplicates["duplicate_count"],
            "duplicate_row_sample": duplicate_sample
        },
        "column_types": column_types,
        "anomalies": anomalies
    }

    return report


# ---------------------------------------------------------
# QUICK TEST — run this file directly to see it in action
# ---------------------------------------------------------
if __name__ == "__main__":
    # Create a small messy sample dataset to test on
    sample_data = {
        "revenue": [100, 200, 150, 5000, 130, np.nan, 140, 160],
        "country": ["USA", "usa", "Canada", "CANADA", "UK", "uk ", "USA", "Canada"],
        "signup_date": ["2024-01-05", "2024-01-06", "01/07/2024", "2024-01-08",
                         "2024-01-09", "01/10/2024", "2024-01-11", "2024-01-12"],
        "customer_id": [1, 2, 3, 4, 5, 6, 6, 8]  # note: duplicate id (6)
    }
    df = pd.DataFrame(sample_data)
    df.to_csv("sample_messy_data.csv", index=False)

    print("=== Function 1: load_data ===")
    df, info = load_data("sample_messy_data.csv")
    print(info)

    print("\n=== Function 2: detect_column_types ===")
    col_types = detect_column_types(df)
    print(col_types)

    print("\n=== Function 3: check_missing_values ===")
    print(check_missing_values(df))

    print("\n=== Function 4: check_duplicates ===")
    dup_result = check_duplicates(df)
    print(f"Duplicate count: {dup_result['duplicate_count']}")

    print("\n=== Function 5: detect_outliers ===")
    print(detect_outliers(df, col_types))

    print("\n=== Function 6: check_inconsistent_categories ===")
    print(check_inconsistent_categories(df, col_types))

    print("\n=== Function 7: check_date_formats ===")
    print(check_date_formats(df, col_types))

    print("\n\n########################################")
    print("BUG FIX PROOF: numeric column with currency formatting")
    print("########################################")

    # This is the exact bug we found on the real government CSV:
    # a numeric column stored with symbols, which used to get
    # misclassified as "categorical" and silently broke outlier detection.
    money_data = {
        "revenue": ["$1,200", "$1,150", "$1,300", "$45,000", "$1,180", "$1,220", "$1,190", "$1,210"],
        "region": ["North", "South", "East", "West", "North", "South", "East", "West"]
    }
    money_df = pd.DataFrame(money_data)

    print("\nRaw values in 'revenue' column:", list(money_df["revenue"]))

    # BEFORE: simulate the OLD behavior (no cleaning attempt) to show the bug
    old_style_check = pd.api.types.is_numeric_dtype(money_df["revenue"].dropna())
    print(f"\nBEFORE FIX -> pandas' strict numeric check alone says numeric? {old_style_check}")
    print("BEFORE FIX -> this column would have been classified as 'categorical' or 'text'")
    print("BEFORE FIX -> which means detect_outliers() would have SKIPPED it entirely")

    # AFTER: run it through our actual, fixed function
    money_col_types = detect_column_types(money_df)
    print(f"\nAFTER FIX -> detect_column_types() result: {money_col_types}")

    money_outliers = detect_outliers(money_df, money_col_types)
    print(f"AFTER FIX -> detect_outliers() result: {money_outliers}")
    print("\nThe $45,000 value should now be correctly flagged as an outlier.")

    print("\n\n########################################")
    print("FUNCTION 8: generate_health_report (grouped JSON report)")
    print("########################################")
    import json
    health_report = generate_health_report(df)
    print(json.dumps(health_report, indent=2, default=str))
