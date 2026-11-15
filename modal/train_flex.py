"""Train a model on Modal: predict how a FLEX droplet test ends.

Target: "Test end" (Extinction / Disruption / Completion), from the test conditions only
(fuel, pressure, ambient composition, initial droplet diameter). Outcome columns such as
burn time and extinction diameter are excluded, because they are measured after the fact.

Run (from the repo root, on your own Modal profile):
    MODAL_PROFILE=<your-profile> modal run modal/train_flex.py

Outputs go to the Modal Volume "flame-models" under flex/. Fetch them with:
    MODAL_PROFILE=<your-profile> modal volume get flame-models flex/ ./from-modal/
"""

from pathlib import Path

import modal

REPO = Path(__file__).resolve().parent.parent
FLEX_CSV = REPO / "data/raw/tables/PSI-69_Experimental table_FLEX.csv"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("pandas==2.2.3", "scikit-learn==1.5.2", "joblib==1.4.2")
    .add_local_file(FLEX_CSV, "/data/flex.csv")
)
volume = modal.Volume.from_name("flame-models", create_if_missing=True)
app = modal.App("flame-train-flex", image=image)

FEATURES = {
    "Ambient pressure; mmHg": "pressure_mmhg",
    "O initial ambient composition; mole fraction": "x_o2",
    "N initial ambient composition; mole fraction": "x_n2",
    "CO initial ambient composition; mole fraction": "x_co2",
    "He initial ambient composition; mole fraction": "x_he",
    "Droplet initial diameter; mm": "d0_mm",
}


# CPU is plenty for ~270 rows. For neural nets or image/video data, add e.g. gpu="A10G".
@app.function(volumes={"/models": volume}, cpu=2, memory=2048, timeout=600)
def train() -> dict:
    import json

    import joblib
    import numpy as np
    import pandas as pd
    from sklearn.dummy import DummyClassifier
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.impute import SimpleImputer
    from sklearn.model_selection import StratifiedKFold, cross_val_score
    from sklearn.pipeline import make_pipeline

    # The PSI CSV is Windows-1252 and uses "–" or blank for missing values.
    df = pd.read_csv("/data/flex.csv", encoding="cp1252")
    X = df[list(FEATURES)].rename(columns=FEATURES)
    X = X.apply(pd.to_numeric, errors="coerce")
    X["fuel_heptane"] = (df["Fuel"] == "Heptane").astype(int)
    y = df["Test end"]

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=0)
    model = make_pipeline(
        SimpleImputer(strategy="median"),
        RandomForestClassifier(n_estimators=300, class_weight="balanced", random_state=0),
    )
    baseline = DummyClassifier(strategy="most_frequent")
    score = lambda m: cross_val_score(m, X, y, cv=cv, scoring="balanced_accuracy")
    s_model, s_base = score(model), score(baseline)

    model.fit(X, y)
    rf = model[-1]
    importances = dict(
        sorted(zip(X.columns, rf.feature_importances_.round(3).tolist()), key=lambda kv: -kv[1])
    )
    metrics = {
        "rows": len(df),
        "classes": y.value_counts().to_dict(),
        "balanced_accuracy_cv": round(float(np.mean(s_model)), 3),
        "balanced_accuracy_cv_std": round(float(np.std(s_model)), 3),
        "baseline_balanced_accuracy": round(float(np.mean(s_base)), 3),
        "feature_importance": importances,
    }

    out = Path("/models/flex")
    out.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, out / "test_end_rf.joblib")
    (out / "metrics.json").write_text(json.dumps(metrics, indent=2))
    volume.commit()
    return metrics


@app.local_entrypoint()
def main():
    import json

    print(json.dumps(train.remote(), indent=2))
