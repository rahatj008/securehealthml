from __future__ import annotations

import base64
import io
import json
import os
import re
import socket
import struct
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
import yara


MODULE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = MODULE_DIR.parent
DEFAULT_MODEL_PATH = PROJECT_ROOT / "ai_model_training" / "artifacts" / "pdf_malware_model.joblib"
DEFAULT_FEEDBACK_PATH = MODULE_DIR / "data" / "feedback.jsonl"
DEFAULT_YARA_RULES_PATH = MODULE_DIR / "rules" / "uploads.yar"

PDF_MIME_TYPES = {"application/pdf"}
DOCX_MIME_TYPES = {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
PNG_MIME_TYPES = {"image/png"}
JPEG_MIME_TYPES = {"image/jpeg", "image/jpg"}

PDF_HEADER_RE = re.compile(r"%PDF-[^\r\n]+")
TITLE_RE = re.compile(r"/Title\s*(?:\((.*?)\)|<([0-9A-Fa-f]+)>)", re.IGNORECASE | re.DOTALL)
METADATA_STREAM_RE = re.compile(r"/Metadata\b.*?stream\r?\n(.*?)\r?\nendstream", re.IGNORECASE | re.DOTALL)
XREF_ENTRY_RE = re.compile(r"\n\d{10}\s+\d{5}\s+[fn]\b")
PDF_TEXT_RE = re.compile(r"\bBT\b.*?\b(?:Tj|TJ)\b", re.IGNORECASE | re.DOTALL)

MODEL_BUNDLE: dict[str, Any] | None = None
YARA_RULES: yara.Rules | None = None


def parse_bool(value: str, default: bool = False) -> bool:
    normalized = str(value).strip().lower()
    if not normalized:
        return default
    return normalized in {"1", "true", "yes", "on"}


PDF_MALWARE_THRESHOLD = float(os.getenv("PDF_MALWARE_THRESHOLD", "0.70"))
ENABLE_YARA = parse_bool(os.getenv("ENABLE_YARA", "true"), default=True)
ENABLE_CLAMAV = parse_bool(os.getenv("ENABLE_CLAMAV", "true"), default=True)
CLAMAV_HOST = os.getenv("CLAMAV_HOST", "clamav")
CLAMAV_PORT = int(os.getenv("CLAMAV_PORT", "3310"))
CLAMAV_TIMEOUT_SECONDS = float(os.getenv("CLAMAV_TIMEOUT_SECONDS", "5"))


def get_model_bundle() -> dict[str, Any]:
    global MODEL_BUNDLE
    if MODEL_BUNDLE is None:
        model_path = Path(os.getenv("MODEL_PATH", str(DEFAULT_MODEL_PATH)))
        MODEL_BUNDLE = joblib.load(model_path)
    return MODEL_BUNDLE


def get_yara_rules() -> yara.Rules | None:
    global YARA_RULES
    if not ENABLE_YARA:
        return None
    if YARA_RULES is None:
        rules_path = Path(os.getenv("YARA_RULES_PATH", str(DEFAULT_YARA_RULES_PATH)))
        if not rules_path.exists():
            return None
        YARA_RULES = yara.compile(filepath=str(rules_path))
    return YARA_RULES


def count_keyword(raw_text: str, pattern: str) -> int:
    return len(re.findall(pattern, raw_text, flags=re.IGNORECASE))


def find_pdf_header(raw_text: str) -> str:
    match = PDF_HEADER_RE.search(raw_text[:512])
    if not match:
        return "\tunknown"
    return f"\t{match.group(0)}"


def parse_title_length(raw_text: str) -> float:
    match = TITLE_RE.search(raw_text)
    if not match:
        return 0.0
    literal_title, hex_title = match.groups()
    if literal_title is not None:
        return float(len(literal_title))
    try:
        return float(len(bytes.fromhex(hex_title).decode("utf-8", errors="ignore")))
    except ValueError:
        return 0.0


def estimate_metadata_size(raw_text: str) -> float:
    match = METADATA_STREAM_RE.search(raw_text)
    if not match:
        return 0.0
    return float(len(match.group(1).encode("latin-1", errors="ignore")))


def estimate_xref_length(raw_text: str) -> float:
    xref_match = re.search(r"\bxref\b(.*?)(?:\btrailer\b|\bstartxref\b)", raw_text, flags=re.IGNORECASE | re.DOTALL)
    if not xref_match:
        return 0.0
    return float(len(XREF_ENTRY_RE.findall(xref_match.group(0))))


def bool_to_float(value: bool) -> float:
    return 1.0 if value else 0.0


def merge_unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    merged: list[str] = []
    for item in items:
        normalized = str(item).strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        merged.append(normalized)
    return merged


def pdf_feature_row(file_bytes: bytes) -> dict[str, Any]:
    raw_text = file_bytes.decode("latin-1", errors="ignore")
    page_count = count_keyword(raw_text, r"/Page\b")
    text_flag = "Yes" if PDF_TEXT_RE.search(raw_text) else "No"

    return {
        "PdfSize": float(max(1, round(len(file_bytes) / 1024))),
        "MetadataSize": estimate_metadata_size(raw_text),
        "Pages": float(page_count),
        "XrefLength": estimate_xref_length(raw_text),
        "TitleCharacters": parse_title_length(raw_text),
        "isEncrypted": bool_to_float("/Encrypt" in raw_text),
        "EmbeddedFiles": float(count_keyword(raw_text, r"/EmbeddedFiles\b")),
        "Images": str(count_keyword(raw_text, r"/Subtype\s*/Image\b")),
        "Text": text_flag,
        "Header": find_pdf_header(raw_text),
        "Obj": str(count_keyword(raw_text, r"(?<![\w/])obj(?![\w])")),
        "Endobj": str(count_keyword(raw_text, r"(?<![\w/])endobj(?![\w])")),
        "Stream": float(count_keyword(raw_text, r"(?<![\w/])stream(?![\w])")),
        "Endstream": str(count_keyword(raw_text, r"(?<![\w/])endstream(?![\w])")),
        "Xref": str(count_keyword(raw_text, r"(?<![\w/])xref(?![\w])")),
        "Trailer": float(count_keyword(raw_text, r"(?<![\w/])trailer(?![\w])")),
        "StartXref": str(count_keyword(raw_text, r"(?<![\w/])startxref(?![\w])")),
        "PageNo": str(page_count),
        "Encrypt": float(count_keyword(raw_text, r"/Encrypt\b")),
        "ObjStm": float(count_keyword(raw_text, r"/ObjStm\b")),
        "JS": str(count_keyword(raw_text, r"/JS\b")),
        "Javascript": str(count_keyword(raw_text, r"/JavaScript\b")),
        "AA": str(count_keyword(raw_text, r"/AA\b")),
        "OpenAction": str(count_keyword(raw_text, r"/OpenAction\b")),
        "Acroform": str(count_keyword(raw_text, r"/AcroForm\b")),
        "JBIG2Decode": str(count_keyword(raw_text, r"/JBIG2Decode\b")),
        "RichMedia": str(count_keyword(raw_text, r"/RichMedia\b")),
        "Launch": str(count_keyword(raw_text, r"/Launch\b")),
        "EmbeddedFile": str(count_keyword(raw_text, r"/EmbeddedFile\b")),
        "XFA": str(count_keyword(raw_text, r"/XFA\b")),
        "Colors": float(count_keyword(raw_text, r"/Colors\b")),
    }


def canonical_file_type(content: dict[str, Any] | None) -> str:
    content = content or {}
    filename = str(content.get("filename") or "").lower()
    mime_type = str(content.get("mime_type") or "").lower()

    if filename.endswith(".pdf") or mime_type in PDF_MIME_TYPES:
        return "pdf"
    if filename.endswith(".docx") or mime_type in DOCX_MIME_TYPES:
        return "docx"
    if filename.endswith(".png") or mime_type in PNG_MIME_TYPES:
        return "png"
    if filename.endswith(".jpg") or filename.endswith(".jpeg") or mime_type in JPEG_MIME_TYPES:
        return "jpeg"
    return "unsupported"


def suspicious_pdf_reasons(feature_row: dict[str, Any]) -> list[str]:
    reasons: list[str] = []
    if int(feature_row["JS"]) > 0 or int(feature_row["Javascript"]) > 0:
        reasons.append("pdf_javascript_detected")
    if int(feature_row["OpenAction"]) > 0:
        reasons.append("pdf_open_action_detected")
    if int(feature_row["Launch"]) > 0:
        reasons.append("pdf_launch_action_detected")
    if int(feature_row["EmbeddedFile"]) > 0 or feature_row["EmbeddedFiles"] > 0:
        reasons.append("pdf_embedded_file_detected")
    if int(feature_row["RichMedia"]) > 0:
        reasons.append("pdf_richmedia_detected")
    if int(feature_row["JBIG2Decode"]) > 0:
        reasons.append("pdf_jbig2decode_detected")
    if int(feature_row["XFA"]) > 0:
        reasons.append("pdf_xfa_detected")
    return reasons


def assess_pdf(file_bytes: bytes) -> dict[str, Any]:
    if not PDF_HEADER_RE.search(file_bytes[:512].decode("latin-1", errors="ignore")):
        return {
            "malware": True,
            "malware_score": 1.0,
            "reasons": ["invalid_pdf_header"],
            "features": {"detected_type": "pdf"},
        }

    bundle = get_model_bundle()
    feature_row = pdf_feature_row(file_bytes)
    frame = pd.DataFrame([feature_row], columns=bundle["feature_columns"])
    score = float(bundle["pipeline"].predict_proba(frame)[0][1])
    malware = score >= PDF_MALWARE_THRESHOLD
    reasons = suspicious_pdf_reasons(feature_row)
    if malware and not reasons:
        reasons.append("pdf_model_threshold_exceeded")

    return {
        "malware": malware,
        "malware_score": score,
        "reasons": reasons,
        "features": {
            "detected_type": "pdf",
            "header": feature_row["Header"].strip(),
            "pages": feature_row["Pages"],
            "js": int(feature_row["JS"]),
            "javascript": int(feature_row["Javascript"]),
            "open_action": int(feature_row["OpenAction"]),
            "launch": int(feature_row["Launch"]),
            "embedded_file": int(feature_row["EmbeddedFile"]),
            "xfa": int(feature_row["XFA"]),
            "jbig2decode": int(feature_row["JBIG2Decode"]),
            "model_name": bundle["model_name"],
        },
    }


def assess_docx(file_bytes: bytes) -> dict[str, Any]:
    if not file_bytes.startswith(b"PK"):
        return {
            "malware": True,
            "malware_score": 1.0,
            "reasons": ["invalid_docx_zip_header"],
            "features": {"detected_type": "docx"},
        }

    try:
        archive = zipfile.ZipFile(io.BytesIO(file_bytes))
    except zipfile.BadZipFile:
        return {
            "malware": True,
            "malware_score": 1.0,
            "reasons": ["invalid_docx_zip_structure"],
            "features": {"detected_type": "docx"},
        }

    entries = [name.lower() for name in archive.namelist()]
    required_entries = {"[content_types].xml", "_rels/.rels", "word/document.xml"}
    missing_entries = sorted(required_entries.difference(entries))
    if missing_entries:
        return {
            "malware": True,
            "malware_score": 0.95,
            "reasons": ["invalid_docx_structure", *[f"missing:{item}" for item in missing_entries]],
            "features": {"detected_type": "docx"},
        }

    suspicious_entries = []
    suspicious_markers = (
        "word/vbaproject.bin",
        "word/vbadata.xml",
        "word/activex/",
        "word/embeddings/",
        "oleobject",
        ".exe",
        ".js",
        ".vbs",
        ".ps1",
        ".bat",
        ".cmd",
        ".scr",
        ".dll",
        ".jar",
        ".hta",
        ".msi",
    )
    for entry in entries:
        if entry.startswith("/") or ".." in entry:
            suspicious_entries.append(f"path:{entry}")
            continue
        if any(marker in entry for marker in suspicious_markers):
            suspicious_entries.append(entry)

    total_uncompressed = sum(item.file_size for item in archive.infolist())
    if len(entries) > 250:
        suspicious_entries.append("too_many_entries")
    if total_uncompressed > 50 * 1024 * 1024:
        suspicious_entries.append("uncompressed_size_over_50mb")

    return {
        "malware": bool(suspicious_entries),
        "malware_score": 0.9 if suspicious_entries else 0.02,
        "reasons": [f"docx:{entry}" for entry in suspicious_entries],
        "features": {
            "detected_type": "docx",
            "entry_count": len(entries),
            "total_uncompressed_bytes": total_uncompressed,
        },
    }


def assess_png(file_bytes: bytes) -> dict[str, Any]:
    reasons = []
    if not file_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        reasons.append("invalid_png_signature")
    if b"IEND" not in file_bytes[-64:]:
        reasons.append("missing_png_iend")
    return {
        "malware": bool(reasons),
        "malware_score": 0.95 if reasons else 0.01,
        "reasons": reasons,
        "features": {"detected_type": "png", "size_bytes": len(file_bytes)},
    }


def assess_jpeg(file_bytes: bytes) -> dict[str, Any]:
    reasons = []
    if not file_bytes.startswith(b"\xff\xd8"):
        reasons.append("invalid_jpeg_soi")
    if not file_bytes.endswith(b"\xff\xd9"):
        reasons.append("missing_jpeg_eoi")
    return {
        "malware": bool(reasons),
        "malware_score": 0.95 if reasons else 0.01,
        "reasons": reasons,
        "features": {"detected_type": "jpeg", "size_bytes": len(file_bytes)},
    }


def run_yara_scan(file_bytes: bytes) -> dict[str, Any]:
    rules = get_yara_rules()
    if rules is None:
        return {"status": "disabled", "matches": []}

    matches = rules.match(data=file_bytes)
    serialized_matches = [
        {
            "rule": match.rule,
            "tags": list(match.tags),
            "meta": dict(match.meta),
        }
        for match in matches
    ]
    return {
        "status": "ok",
        "matches": serialized_matches,
    }


def recv_until_nul(sock: socket.socket) -> bytes:
    chunks: list[bytes] = []
    while True:
        chunk = sock.recv(4096)
        if not chunk:
            break
        chunks.append(chunk)
        if b"\x00" in chunk:
            break
    return b"".join(chunks).split(b"\x00", 1)[0]


def run_clamav_scan(file_bytes: bytes) -> dict[str, Any]:
    if not ENABLE_CLAMAV:
        return {"status": "disabled", "infected": False, "signature": None, "message": None}

    try:
        with socket.create_connection((CLAMAV_HOST, CLAMAV_PORT), timeout=CLAMAV_TIMEOUT_SECONDS) as sock:
            sock.settimeout(CLAMAV_TIMEOUT_SECONDS)
            sock.sendall(b"zINSTREAM\0")
            for offset in range(0, len(file_bytes), 65536):
                chunk = file_bytes[offset : offset + 65536]
                sock.sendall(struct.pack(">L", len(chunk)))
                sock.sendall(chunk)
            sock.sendall(struct.pack(">L", 0))
            response = recv_until_nul(sock).decode("utf-8", errors="ignore")
    except Exception as error:
        return {
            "status": "unavailable",
            "infected": False,
            "signature": None,
            "message": str(error),
        }

    if "FOUND" in response:
        signature = response.split(":", 1)[-1].replace("FOUND", "").strip()
        return {
            "status": "ok",
            "infected": True,
            "signature": signature or "clamav_detected_threat",
            "message": response,
        }

    if "ERROR" in response:
        return {
            "status": "error",
            "infected": False,
            "signature": None,
            "message": response,
        }

    return {
        "status": "ok",
        "infected": False,
        "signature": None,
        "message": response,
    }


def apply_secondary_scanners(file_bytes: bytes, base_assessment: dict[str, Any]) -> dict[str, Any]:
    yara_result = run_yara_scan(file_bytes)
    clamav_result = run_clamav_scan(file_bytes)

    yara_reasons = [f"yara:{match['rule']}" for match in yara_result["matches"]]
    clamav_reasons = [f"clamav:{clamav_result['signature']}"] if clamav_result["infected"] else []

    malware = bool(base_assessment.get("malware")) or bool(yara_reasons) or bool(clamav_reasons)
    malware_score = float(base_assessment.get("malware_score", 0.0))
    if yara_reasons:
        malware_score = max(malware_score, 0.97)
    if clamav_reasons:
        malware_score = max(malware_score, 0.99)

    features = {
        **dict(base_assessment.get("features") or {}),
        "yara_status": yara_result["status"],
        "yara_matches": [match["rule"] for match in yara_result["matches"]],
        "clamav_status": clamav_result["status"],
        "clamav_signature": clamav_result["signature"],
    }
    if clamav_result["message"] and clamav_result["status"] != "ok":
        features["clamav_message"] = clamav_result["message"]

    return {
        **base_assessment,
        "malware": malware,
        "malware_score": malware_score,
        "reasons": merge_unique(
            [
                *list(base_assessment.get("reasons") or []),
                *yara_reasons,
                *clamav_reasons,
            ]
        ),
        "features": features,
    }


def neutral_assessment() -> dict[str, Any]:
    return {
        "anomaly": False,
        "anomaly_score": 0.0,
        "malware": False,
        "malware_score": 0.0,
        "auth_risk": False,
        "auth_risk_score": 0.0,
        "reasons": [],
        "features": {},
    }


def merge_assessment(overrides: dict[str, Any]) -> dict[str, Any]:
    response = neutral_assessment()
    response.update(overrides)
    return response


def decode_sample(sample_base64: str | None) -> bytes:
    if not sample_base64:
        return b""
    try:
        return base64.b64decode(sample_base64, validate=True)
    except Exception:
        return b""


def base_assessment_for_type(detected_type: str, file_bytes: bytes) -> dict[str, Any]:
    if detected_type == "pdf":
        return assess_pdf(file_bytes)
    if detected_type == "docx":
        return assess_docx(file_bytes)
    if detected_type == "png":
        return assess_png(file_bytes)
    if detected_type == "jpeg":
        return assess_jpeg(file_bytes)
    return {
        "malware": True,
        "malware_score": 1.0,
        "reasons": ["unsupported_file_type"],
        "features": {"detected_type": "unsupported"},
    }


def assess_payload(payload: dict[str, Any]) -> dict[str, Any]:
    context = str(payload.get("context") or "").lower()
    if context != "file_upload":
        return neutral_assessment()

    content = payload.get("content") or {}
    file_bytes = decode_sample(payload.get("sample_base64"))
    detected_type = canonical_file_type(content)
    if not file_bytes:
        return merge_assessment(
            {
                "malware": True,
                "malware_score": 1.0,
                "reasons": ["missing_upload_bytes"],
                "features": {"detected_type": detected_type},
            }
        )

    base_assessment = base_assessment_for_type(detected_type, file_bytes)
    enriched = apply_secondary_scanners(file_bytes, base_assessment)
    return merge_assessment(enriched)


def record_feedback(payload: dict[str, Any]) -> dict[str, Any]:
    feedback_path = Path(os.getenv("FEEDBACK_LOG_PATH", str(DEFAULT_FEEDBACK_PATH)))
    feedback_path.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "received_at": datetime.now(timezone.utc).isoformat(),
        **payload,
    }
    with feedback_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record) + "\n")
    return {"status": "ok"}
