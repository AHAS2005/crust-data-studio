from profiling_functions import load_data, generate_health_report
import json

# Just change this one line to point at your file
filepath = "messy_classification_dataset.csv"

df, info = load_data(filepath)
print("Loaded:", info)

report = generate_health_report(df)
print(json.dumps(report, indent=2, default=str))