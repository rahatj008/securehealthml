from __future__ import annotations

import argparse
import json
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from xgboost import XGBClassifier


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a PDF malware classifier.")
    parser.add_argument(
        "--data-path",
        default=str(BASE_DIR / "PDFMalware2022.parquet"),
        help="Path to the parquet/csv dataset.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(BASE_DIR / "artifacts"),
        help="Directory where the trained model and metrics will be saved.",
    )
    parser.add_argument(
        "--target-col",
        default="Class",
        help="Name of the target label column.",
    )
    parser.add_argument(
        "--test-size",
        type=float,
        default=0.2,
        help="Fraction of the dataset to use for the test split.",
    )
    parser.add_argument(
        "--random-state",
        type=int,
        default=42,
        help="Random state for reproducibility.",
    )
    return parser.parse_args()


def load_dataset(data_path: Path) -> pd.DataFrame:
    suffix = data_path.suffix.lower()
    if suffix == ".parquet":
        return pd.read_parquet(data_path)
    if suffix == ".csv":
        return pd.read_csv(data_path)
    raise ValueError(f"Unsupported dataset format: {suffix}")


def normalize_target(series: pd.Series) -> pd.Series:
    normalized = series.astype(str).str.strip().str.lower().map(
        {
            "malicious": 1,
            "benign": 0,
            "1": 1,
            "0": 0,
            "true": 1,
            "false": 0,
        }
    )
    if normalized.isna().any():
        unknown = sorted(series[normalized.isna()].astype(str).unique())
        raise ValueError(f"Unrecognized target labels: {unknown}")
    return normalized.astype(int)


def split_columns(frame: pd.DataFrame) -> tuple[list[str], list[str]]:
    numeric_columns = frame.select_dtypes(include=["number", "bool"]).columns.tolist()
    categorical_columns = [column for column in frame.columns if column not in numeric_columns]
    return numeric_columns, categorical_columns


def build_preprocessor(numeric_columns: list[str], categorical_columns: list[str]) -> ColumnTransformer:
    numeric_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
        ]
    )
    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore")),
        ]
    )

    return ColumnTransformer(
        transformers=[
            ("numeric", numeric_pipeline, numeric_columns),
            ("categorical", categorical_pipeline, categorical_columns),
        ]
    )


def evaluate_model(model: Pipeline, x_test: pd.DataFrame, y_test: pd.Series) -> dict[str, object]:
    predicted = model.predict(x_test)
    probabilities = model.predict_proba(x_test)[:, 1]
    metrics = {
        "accuracy": float(accuracy_score(y_test, predicted)),
        "precision": float(precision_score(y_test, predicted)),
        "recall": float(recall_score(y_test, predicted)),
        "f1": float(f1_score(y_test, predicted)),
        "roc_auc": float(roc_auc_score(y_test, probabilities)),
        "confusion_matrix": confusion_matrix(y_test, predicted).tolist(),
        "classification_report": classification_report(y_test, predicted, output_dict=True),
    }
    return metrics


def main() -> None:
    args = parse_args()
    data_path = Path(args.data_path)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    df = load_dataset(data_path)
    if args.target_col not in df.columns:
        raise ValueError(f"Target column '{args.target_col}' not found in dataset.")

    # FileName is a sample identifier/hash and should not be used for learning.
    drop_columns = [column for column in df.columns if column.lower() in {"filename"}]
    feature_frame = df.drop(columns=[args.target_col, *drop_columns]).copy()
    target = normalize_target(df[args.target_col])

    numeric_columns, categorical_columns = split_columns(feature_frame)
    preprocessor = build_preprocessor(numeric_columns, categorical_columns)

    x_train, x_test, y_train, y_test = train_test_split(
        feature_frame,
        target,
        test_size=args.test_size,
        random_state=args.random_state,
        stratify=target,
    )

    negative_count = int((y_train == 0).sum())
    positive_count = int((y_train == 1).sum())
    scale_pos_weight = negative_count / positive_count if positive_count else 1.0

    candidate_models: dict[str, object] = {
        "random_forest": RandomForestClassifier(
            n_estimators=300,
            random_state=args.random_state,
            class_weight="balanced",
            n_jobs=1,
        ),
        "xgboost": XGBClassifier(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            eval_metric="logloss",
            random_state=args.random_state,
            tree_method="hist",
            scale_pos_weight=scale_pos_weight,
            n_jobs=1,
        ),
    }

    all_results: dict[str, dict[str, object]] = {}
    best_model_name = ""
    best_model_pipeline: Pipeline | None = None
    best_score = float("-inf")

    for model_name, estimator in candidate_models.items():
        pipeline = Pipeline(
            steps=[
                ("preprocessor", preprocessor),
                ("model", estimator),
            ]
        )
        pipeline.fit(x_train, y_train)
        metrics = evaluate_model(pipeline, x_test, y_test)
        all_results[model_name] = metrics

        if metrics["roc_auc"] > best_score:
            best_score = float(metrics["roc_auc"])
            best_model_name = model_name
            best_model_pipeline = pipeline

    if best_model_pipeline is None:
        raise RuntimeError("No model was trained.")

    model_path = output_dir / "pdf_malware_model.joblib"
    metrics_path = output_dir / "training_metrics.json"

    joblib.dump(
        {
            "model_name": best_model_name,
            "pipeline": best_model_pipeline,
            "feature_columns": feature_frame.columns.tolist(),
            "numeric_columns": numeric_columns,
            "categorical_columns": categorical_columns,
            "dropped_columns": drop_columns,
            "target_column": args.target_col,
        },
        model_path,
    )

    summary = {
        "dataset_path": str(data_path),
        "dataset_rows": int(len(df)),
        "dataset_columns": df.columns.tolist(),
        "target_column": args.target_col,
        "dropped_columns": drop_columns,
        "train_rows": int(len(x_train)),
        "test_rows": int(len(x_test)),
        "best_model": best_model_name,
        "results": all_results,
        "saved_model_path": str(model_path),
    }
    metrics_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"Dataset: {data_path}")
    print(f"Rows: {len(df)}")
    print(f"Best model: {best_model_name}")
    print(f"Saved model: {model_path}")
    print(f"Saved metrics: {metrics_path}")
    for model_name, metrics in all_results.items():
        print(
            f"{model_name}: "
            f"accuracy={metrics['accuracy']:.4f}, "
            f"precision={metrics['precision']:.4f}, "
            f"recall={metrics['recall']:.4f}, "
            f"f1={metrics['f1']:.4f}, "
            f"roc_auc={metrics['roc_auc']:.4f}"
        )


if __name__ == "__main__":
    main()
