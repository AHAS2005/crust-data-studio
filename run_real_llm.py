"""
Run the full pipeline (detection + LLM explanation + cleaning code
generation + safe execution + diff preview) against a real CSV, using
LIVE LLM providers (NVIDIA Nemotron 3 Ultra as primary, Groq as fallback)
instead of the mock.

DESIGN: explanations and cleaning code are generated LAZILY - only when
YOU pick a specific anomaly, not eagerly for all of them upfront. This
is what actually keeps you under free-tier rate limits: a human picking
a few things to look at naturally self-paces API calls, instead of the
script firing 40 requests in the first 10 seconds.

BEFORE RUNNING:
1. Make sure your API key(s) are set as environment variables in your
   terminal - NOT typed inside this file:
     Windows (cmd):  set NVIDIA_API_KEY=your_key_here
                      set GROQ_API_KEY=your_key_here
     Windows (powershell): $env:NVIDIA_API_KEY="your_key_here"
     Mac/Linux:      export NVIDIA_API_KEY=your_key_here
   Get a free NVIDIA key (no credit card) at build.nvidia.com.
2. Run this in the SAME terminal window where you just set that variable.
3. pip install -U openai groq pandas numpy   (if not already done)

USAGE:
   python run_real_llm.py your_file.csv
"""

import sys
import os
import json
from profiling_functions import load_data, generate_health_report
from llm_layer import (
    get_explanation, get_cleaning_code, get_analysis_plan, get_data_summary,
    safe_exec_cleaning_function, compute_diff, check_diff_safety,
    CleaningLedger, load_ledger
)

USE_MOCK = False  # set True to test the flow offline with fake responses
PROVIDER = "auto"  # "auto" tries Nemotron first, falls back to Groq if it
                    # fails (rate limit, outage, etc). Set to "nemotron" or
                    # "groq" to force one specific provider with no fallback.
FIXABLE_ISSUES = {"mixed_numeric_column", "disguised_null"}


def handle_rollback(ledger, ledger_path):
    """
    Lets the user undo an already-approved step WITHOUT quitting the
    program or hand-editing the ledger JSON. Previously the only way to
    undo step 4 after realizing it broke something was to quit, manually
    edit the saved JSON file, and restart - a genuinely painful workflow
    for something the ledger's own remove_step() already made possible
    internally, it just was never exposed here.
    """
    if not ledger.steps:
        print("\nNo approved steps yet - nothing to roll back.")
        return

    print("\nCurrently approved steps:")
    for step in ledger.steps:
        print(f"  {step['step_id']}. [{step['anomaly_target']}] {step['description']}")

    choice = input("\nEnter a step number to remove, or press Enter to cancel: ").strip()
    if not choice:
        return
    if not choice.isdigit() or int(choice) not in [s["step_id"] for s in ledger.steps]:
        print("Invalid step number.")
        return

    ledger.remove_step(int(choice))
    with open(ledger_path, "w") as f:
        f.write(ledger.export_json())
    print(f"Step {choice} removed and ledger saved.")
    print("NOTE: steps replay sequentially against the original raw data - "
          "if any remaining step was written assuming the removed step had "
          "already run (e.g. it expects a column the removed step created "
          "or converted), replaying now may fail or behave differently. "
          "This is expected: the ledger doesn't know about dependencies "
          "between steps, only their order.")


def print_anomaly_menu(anomalies):
    """Free, instant, no LLM involved - just lists what was found."""
    print("\nAnomalies found (choose one to explain or fix, or 'q' to move on):")
    for i, a in enumerate(anomalies, start=1):
        fixable_tag = " [fixable]" if a["issue"] in FIXABLE_ISSUES else ""
        print(f"  {i}. [{a['column']}] {a['issue']}{fixable_tag}")


def handle_explain(anomaly):
    print("\nAsking the LLM to explain this anomaly...")
    try:
        explanation = get_explanation(anomaly, use_mock=USE_MOCK, provider=PROVIDER)
        print(f"\n-> {explanation}")
    except Exception as e:
        print(f"\n[LLM call failed: {e}]")


def handle_fix(anomaly, df, ledger, ledger_path):
    if anomaly["issue"] not in FIXABLE_ISSUES:
        print("\nThis anomaly type doesn't have an automated fix available.")
        return

    print("\nAsking the LLM to generate a cleaning function...")
    try:
        code = get_cleaning_code(anomaly, use_mock=USE_MOCK, provider=PROVIDER)
    except Exception as e:
        print(f"[LLM call failed: {e}]")
        return

    print("\nGenerated code:")
    print("  " + code.replace("\n", "\n  "))

    try:
        preview_df, captured_output = safe_exec_cleaning_function(code, "clean_step", df)
    except TimeoutError as e:
        print(f"[REJECTED - took too long, likely an expensive/runaway operation: {e}]")
        return
    except ValueError as e:
        print(f"[REJECTED - failed safety check: {e}]")
        return
    except Exception as e:
        print(f"[Execution failed: {e}]")
        return

    diff = compute_diff(df, preview_df)
    print("\nDiff preview:")
    print("  " + json.dumps(diff, indent=2).replace("\n", "\n  "))
    if captured_output:
        print(f"\nSelf-reported warning from generated code: {captured_output}")

    # Automated first-pass filter - catches obviously destructive fixes
    # (e.g. accidentally dropping 99% of rows) BEFORE reaching the human
    # approval prompt, rather than presenting them as if they were routine.
    is_safe, rejection_reason = check_diff_safety(diff, df)
    if not is_safe:
        print(f"\n{rejection_reason}")
        print("This fix was auto-rejected and was NOT added to the ledger.")
        return

    approve = input("\nApprove this fix and add it to the ledger? (y/n): ").strip().lower()
    if approve == "y":
        ledger.add_step(
            anomaly_target=anomaly["column"],
            description=f"Auto-generated fix for {anomaly['issue']} in {anomaly['column']}",
            code_string=code,
            function_name="clean_step"
        )
        with open(ledger_path, "w") as f:
            f.write(ledger.export_json())
        print(f"Added to ledger and saved to {ledger_path}.")
    else:
        print("Skipped.")


def main():
    if len(sys.argv) < 2:
        print("Usage: python run_real_llm.py your_file.csv")
        sys.exit(1)

    filepath = sys.argv[1]

    print(f"Loading {filepath} ...")
    df, info = load_data(filepath)
    print(f"Loaded: {info}\n")

    print("Running detection layer (no LLM involved, free and instant) ...")
    report = generate_health_report(df)
    print(f"Found {len(report['anomalies'])} anomalies.")

    # --- Resume a previous ledger if one exists for this file ---
    ledger_path = filepath.replace(".csv", "_ledger.json")
    proceeded_despite_drift = False  # tracks whether we need a safety-net
                                      # timeout on the final replay below
    if os.path.exists(ledger_path):
        resume = input(f"\nFound a saved ledger at {ledger_path}. Resume it? (y/n): ").strip().lower()
        if resume == "y":
            ledger, drift_warning = load_ledger(ledger_path, df)
            if drift_warning:
                print(f"\n{drift_warning}")
                print("If the data grew significantly larger, a previously-fast "
                      "approved step could take much longer or hang when replayed "
                      "against it - a safety timeout will be applied if you continue.")
                proceed = input("Continue anyway? (y/n): ").strip().lower()
                if proceed != "y":
                    ledger = CleaningLedger(df)
                else:
                    proceeded_despite_drift = True
            print(f"Resumed ledger with {len(ledger.steps)} previously approved fix(es).")
        else:
            ledger = CleaningLedger(df)
    else:
        ledger = CleaningLedger(df)

    # --- Lazy, on-demand loop: nothing calls the LLM until you ask ---
    anomalies = report["anomalies"]
    while True:
        print_anomaly_menu(anomalies)
        print(f"  (currently {len(ledger.steps)} approved step(s) in the ledger - "
              f"enter 'r' to review/roll one back)")
        choice = input("\nEnter a number, 'r' to rollback a step, or 'q' to finish: ").strip().lower()
        if choice == "q":
            break
        if choice == "r":
            handle_rollback(ledger, ledger_path)
            continue
        if not choice.isdigit() or not (1 <= int(choice) <= len(anomalies)):
            print("Invalid choice.")
            continue

        anomaly = anomalies[int(choice) - 1]
        action = input("  (e)xplain or (f)ix this one? ").strip().lower()
        if action == "e":
            handle_explain(anomaly)
        elif action == "f":
            handle_fix(anomaly, df, ledger, ledger_path)
        else:
            print("  Invalid action.")

    # --- Apply the ledger and show final result ---
    if ledger.steps:
        print("\n" + "=" * 60)
        print("FINAL RESULT")
        print("=" * 60)
        # Fast path (no timeout) in the normal case. Safety-net timeout
        # only when the user chose to proceed despite a data-drift warning
        # above, since that's the one scenario where an approved step's
        # runtime is no longer guaranteed to match what it was at approval time.
        replay_timeout = 60 if proceeded_despite_drift else None
        final_df, all_warnings = ledger.replay(timeout_seconds=replay_timeout)
        print(f"\nApplied {len(ledger.steps)} approved fix(es).")
        if all_warnings:
            print("Warnings collected during cleaning:")
            for w in all_warnings:
                print(f"  Step {w['step_id']}: {w['output']}")

        output_path = filepath.replace(".csv", "_cleaned.csv")
        final_df.to_csv(output_path, index=False)
        print(f"\nCleaned file saved to: {output_path}")
    else:
        print("\nNo fixes were approved - nothing to save.")

    # --- Optional natural language question ---
    print("\n" + "=" * 60)
    print("ASK A QUESTION ABOUT YOUR DATA (optional)")
    print("=" * 60)
    question = input("Type a question (or press Enter to skip): ").strip()
    if question:
        question_type = input(
            "  Is this (d)escriptive (e.g. 'what is this data about') "
            "or (a)nalytical (e.g. 'what's driving the drop in Q3')? "
        ).strip().lower()

        if question_type == "a":
            schema = report["column_types"]
            plan = get_analysis_plan(question, schema, use_mock=USE_MOCK, provider=PROVIDER)
            print("\nSuggested analysis plan (steps to investigate this - "
                  "not yet auto-executed, this part is still a documented "
                  "work-in-progress):")
            if isinstance(plan, list):
                for step in plan:
                    print(f"  - {step.get('step', step.get('description', step))}")
            else:
                print(f"  [Could not parse plan: {plan}]")
        else:
            # Default to a direct, grounded answer for descriptive
            # questions - this is what most casual questions actually want.
            answer = get_data_summary(question, report, use_mock=USE_MOCK, provider=PROVIDER)
            print(f"\n-> {answer}")


if __name__ == "__main__":
    main()
