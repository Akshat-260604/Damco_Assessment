import io
import re
import chardet
import pandas as pd
from fastapi import HTTPException


def _sanitize_column_name(name: str) -> str:
    name = str(name).strip().lower()
    name = re.sub(r"[^a-z0-9_]", "_", name)
    name = re.sub(r"_+", "_", name)
    name = name.strip("_")
    return name or "column"


def _infer_dtypes(df: pd.DataFrame) -> pd.DataFrame:
    for col in df.columns:
        if df[col].dtype == object:
            try:
                converted = pd.to_datetime(df[col], format='mixed', dayfirst=False)
                df[col] = converted
                continue
            except Exception:
                pass
            try:
                converted = pd.to_numeric(df[col])
                df[col] = converted
                continue
            except Exception:
                pass
    return df


async def parse_file(file_bytes: bytes, filename: str) -> pd.DataFrame:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext == "xlsx":
        df = _parse_xlsx(file_bytes)
    elif ext == "csv":
        df = _parse_csv(file_bytes)
    else:
        raise HTTPException(status_code=422, detail=f"Unsupported file type: .{ext}")

    df.columns = [_sanitize_column_name(c) for c in df.columns]

    seen: dict[str, int] = {}
    new_cols = []
    for col in df.columns:
        if col in seen:
            seen[col] += 1
            new_cols.append(f"{col}_{seen[col]}")
        else:
            seen[col] = 0
            new_cols.append(col)
    df.columns = new_cols

    df = _infer_dtypes(df)

    if df.empty or len(df.columns) == 0:
        raise HTTPException(status_code=422, detail="File contains no data")
    if len(df) == 0:
        raise HTTPException(status_code=422, detail="File contains no rows")

    return df


def _parse_csv(file_bytes: bytes) -> pd.DataFrame:
    detected = chardet.detect(file_bytes)
    encoding = detected.get("encoding") or "utf-8"

    encodings_to_try = [encoding, "utf-8", "latin-1", "cp1252"]
    seen_encodings: set[str] = set()
    unique_encodings = []
    for e in encodings_to_try:
        if e and e.lower() not in seen_encodings:
            seen_encodings.add(e.lower())
            unique_encodings.append(e)

    last_error: Exception = Exception("Unknown parse error")
    for enc in unique_encodings:
        for delimiter in [",", ";", "\t", "|"]:
            try:
                df = pd.read_csv(
                    io.BytesIO(file_bytes),
                    encoding=enc,
                    sep=delimiter,
                    engine="python",
                    on_bad_lines="skip",
                )
                if len(df.columns) > 1 or delimiter == ",":
                    return df
            except Exception as e:
                last_error = e

    raise HTTPException(status_code=422, detail=f"Failed to parse CSV: {last_error}")


def _parse_xlsx(file_bytes: bytes) -> pd.DataFrame:
    try:
        df = pd.read_excel(io.BytesIO(file_bytes), engine="openpyxl")
        return df
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse XLSX: {e}")
