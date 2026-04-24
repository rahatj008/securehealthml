"use client";

import { useEffect, useState } from "react";
import AppShell from "../../components/AppShell";
import { apiFetch } from "../../lib/api";
import { useAuthGuard } from "../../lib/auth";
import { adminNav } from "../../lib/nav";

type DetectionModel = {
  name: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  rocAuc: number;
  confusionMatrix: number[][];
};

type DetectionResultsResponse = {
  dataset: {
    rows: number;
    trainRows: number;
    testRows: number;
    targetColumn: string;
    droppedColumns: string[];
    savedModelPath: string;
  };
  deployedModel: string;
  currentModel: DetectionModel | null;
  models: DetectionModel[];
};

function formatModelName(value: string) {
  return value
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatPercent(value: number) {
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function formatScore(value: number) {
  return Number(value).toFixed(4);
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="metric-card">
      <span className={`status-pill ${tone}`}>{label}</span>
      <p className="metric-value">{value}</p>
    </div>
  );
}

export default function DetectionResultsPage() {
  const { token, user, ready, logout } = useAuthGuard("admin");
  const [results, setResults] = useState<DetectionResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;

    apiFetch<DetectionResultsResponse>("/admin/detection-results", token)
      .then((data) => {
        setResults(data);
        setError("");
      })
      .catch((err) => setError((err as Error).message || "Failed to load detection results."))
      .finally(() => setLoading(false));
  }, [token]);

  if (!ready || !user) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading...</div>;
  }

  const deployedModel = results?.currentModel;
  const confusionMatrix = deployedModel?.confusionMatrix || [
    [0, 0],
    [0, 0],
  ];

  return (
    <AppShell
      title="Secured Health Records"
      subtitle="Administrator security console"
      userName={user.full_name || user.email}
      userMeta={`Admin | Clearance ${user.clearance}`}
      onLogout={logout}
      nav={adminNav}
    >
      <section className="page-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="page-eyebrow text-blue-600">Detection results</p>
            <h1 className="page-title">
              Review the trained PDF malware detector and compare the saved evaluation results across candidate models.
            </h1>
            <p className="page-copy">
              This page shows offline model performance from the saved training artifact, separate from the live malware
              events shown elsewhere in the admin console.
            </p>
          </div>
          <span className="hero-chip bg-blue-50 text-blue-700">
            Deployed model: {results?.deployedModel ? formatModelName(results.deployedModel) : "Loading"}
          </span>
        </div>
      </section>

      {error ? (
        <div className="alert-card alert-warning">{error}</div>
      ) : null}

      {loading && !results ? (
        <div className="section-card text-sm text-slate-500">Loading detection results...</div>
      ) : null}

      {results && deployedModel ? (
        <>
          <section className="section-card">
            <div className="section-header">
              <div>
                <p className="section-title">Currently deployed model</p>
                <p className="section-copy mt-1">
                  These are the saved test-set metrics for the PDF detector currently in use.
                </p>
              </div>
              <span className="status-pill bg-emerald-50 text-emerald-700">
                {formatModelName(deployedModel.name)}
              </span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard label="Accuracy" value={formatPercent(deployedModel.accuracy)} tone="bg-blue-50 text-blue-700" />
              <MetricCard label="Precision" value={formatPercent(deployedModel.precision)} tone="bg-emerald-50 text-emerald-700" />
              <MetricCard label="Recall" value={formatPercent(deployedModel.recall)} tone="bg-amber-50 text-amber-700" />
              <MetricCard label="F1 Score" value={formatPercent(deployedModel.f1)} tone="bg-slate-100 text-slate-700" />
              <MetricCard label="ROC-AUC" value={formatScore(deployedModel.rocAuc)} tone="bg-rose-50 text-rose-700" />
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <section className="section-card">
              <div className="section-header">
                <div>
                  <p className="section-title">Training snapshot</p>
                  <p className="section-copy mt-1">
                    Dataset size, split, target column, and artifact details from the saved training run.
                  </p>
                </div>
                <span className="status-pill bg-slate-100 text-slate-700">{results.dataset.rows} rows</span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.35rem] bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Train rows</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{results.dataset.trainRows}</p>
                </div>
                <div className="rounded-[1.35rem] bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Test rows</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{results.dataset.testRows}</p>
                </div>
                <div className="rounded-[1.35rem] bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Target column</p>
                  <p className="mt-2 text-base font-semibold text-slate-900">{results.dataset.targetColumn}</p>
                </div>
                <div className="rounded-[1.35rem] bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Dropped columns</p>
                  <p className="mt-2 text-base font-semibold text-slate-900">
                    {results.dataset.droppedColumns.join(", ") || "None"}
                  </p>
                </div>
              </div>
            </section>

            <section className="section-card">
              <div className="section-header">
                <div>
                  <p className="section-title">Confusion matrix</p>
                  <p className="section-copy mt-1">
                    The deployed model’s predictions on the held-out test set.
                  </p>
                </div>
                <span className="status-pill bg-emerald-50 text-emerald-700">Deployed model only</span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  { label: "True negatives", value: confusionMatrix[0][0], tone: "bg-slate-100 text-slate-700" },
                  { label: "False positives", value: confusionMatrix[0][1], tone: "bg-amber-50 text-amber-700" },
                  { label: "False negatives", value: confusionMatrix[1][0], tone: "bg-rose-50 text-rose-700" },
                  { label: "True positives", value: confusionMatrix[1][1], tone: "bg-emerald-50 text-emerald-700" },
                ].map((item) => (
                  <div key={item.label} className="rounded-[1.35rem] border border-slate-100 bg-white px-4 py-4">
                    <span className={`status-pill ${item.tone}`}>{item.label}</span>
                    <p className="mt-4 text-3xl font-semibold text-slate-900">{item.value}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="section-card">
            <div className="section-header">
              <div>
                <p className="section-title">Model comparison</p>
                <p className="section-copy mt-1">
                  Compare the saved evaluation results for each trained model candidate.
                </p>
              </div>
              <span className="status-pill bg-slate-100 text-slate-700">{results.models.length} candidates</span>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {results.models.map((model) => {
                const isDeployed = model.name === results.deployedModel;
                return (
                  <div key={model.name} className="rounded-[1.5rem] border border-slate-100 bg-white px-4 py-4 sm:px-5 sm:py-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-lg font-semibold text-slate-900">{formatModelName(model.name)}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {isDeployed ? "Currently deployed for PDF scanning." : "Saved training candidate for comparison."}
                        </p>
                      </div>
                      <span className={`status-pill ${isDeployed ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                        {isDeployed ? "Deployed" : "Candidate"}
                      </span>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[1.2rem] bg-slate-50 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Accuracy</p>
                        <p className="mt-2 text-xl font-semibold text-slate-900">{formatPercent(model.accuracy)}</p>
                      </div>
                      <div className="rounded-[1.2rem] bg-slate-50 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Precision</p>
                        <p className="mt-2 text-xl font-semibold text-slate-900">{formatPercent(model.precision)}</p>
                      </div>
                      <div className="rounded-[1.2rem] bg-slate-50 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Recall</p>
                        <p className="mt-2 text-xl font-semibold text-slate-900">{formatPercent(model.recall)}</p>
                      </div>
                      <div className="rounded-[1.2rem] bg-slate-50 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">F1 score</p>
                        <p className="mt-2 text-xl font-semibold text-slate-900">{formatPercent(model.f1)}</p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-[1.2rem] bg-blue-50 px-4 py-4 text-sm text-blue-900">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">ROC-AUC</p>
                      <p className="mt-2 text-xl font-semibold">{formatScore(model.rocAuc)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="section-card">
            <div className="section-header">
              <div>
                <p className="section-title">Interpretation</p>
                <p className="section-copy mt-1">
                  Plain-English meaning of the headline metrics used in this project.
                </p>
              </div>
              <span className="status-pill bg-blue-50 text-blue-700">Report-ready summary</span>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {[
                {
                  label: "Accuracy",
                  text: "The overall percentage of PDFs the model classified correctly across the full test set.",
                },
                {
                  label: "Precision",
                  text: "When the model flags a PDF as malicious, precision tells how often that flag is actually correct.",
                },
                {
                  label: "Recall",
                  text: "Recall shows how many truly malicious PDFs the model successfully caught instead of missing.",
                },
                {
                  label: "F1 Score",
                  text: "F1 balances precision and recall so you can judge both false alarms and missed malware together.",
                },
                {
                  label: "ROC-AUC",
                  text: "ROC-AUC measures how well the model separates benign PDFs from malicious ones across thresholds.",
                },
              ].map((item) => (
                <div key={item.label} className="rounded-[1.35rem] bg-slate-50 px-4 py-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">{item.label}</p>
                  <p className="mt-2 leading-6">{item.text}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </AppShell>
  );
}
