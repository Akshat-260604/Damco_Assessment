"""
Anomaly detection service.
Uses IQR method to detect outliers in numeric columns.
"""
import logging
from typing import Any
import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)


def detect_anomalies(dataframes: dict[str, pd.DataFrame]) -> dict[str, dict[str, Any]]:
    """
    Scan each numeric column in every DataFrame for outliers using IQR.
    Returns a dict: { df_name -> { col_name -> { count, pct, severity } } }
    """
    result: dict[str, dict[str, Any]] = {}

    for df_name, df in dataframes.items():
        col_anomalies: dict[str, Any] = {}

        numeric_cols = df.select_dtypes(include=[np.number]).columns
        for col in numeric_cols:
            series = df[col].dropna()
            if len(series) < 10:
                continue  # too small to be meaningful

            q1 = series.quantile(0.25)
            q3 = series.quantile(0.75)
            iqr = q3 - q1

            if iqr == 0:
                continue  # constant column

            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr

            outlier_mask = (series < lower) | (series > upper)
            outlier_count = int(outlier_mask.sum())

            if outlier_count == 0:
                continue

            pct = round(outlier_count / len(series) * 100, 1)
            if pct >= 10:
                severity = "high"
            elif pct >= 3:
                severity = "medium"
            else:
                severity = "low"

            col_anomalies[col] = {
                "count": outlier_count,
                "pct": pct,
                "severity": severity,
                "lower_bound": round(float(lower), 4),
                "upper_bound": round(float(upper), 4),
            }
            logger.debug(f"Anomalies in {df_name}.{col}: {outlier_count} ({pct}%)")

        if col_anomalies:
            result[df_name] = col_anomalies

    return result


def get_warnings_for_columns(
    anomalies: dict[str, dict[str, Any]],
    citations: list[dict],
) -> list[dict]:
    """
    Given the session anomalies dict and the citations from a query,
    return a list of AnomalyWarning dicts for columns that were used.
    """
    warnings = []
    for citation in citations:
        df_name = citation.get("dataframe", "")
        columns_used = citation.get("columns_used", [])
        df_anomalies = anomalies.get(df_name, {})
        for col in columns_used:
            if col in df_anomalies:
                a = df_anomalies[col]
                warnings.append({
                    "dataframe": df_name,
                    "column": col,
                    "outlier_count": a["count"],
                    "outlier_pct": a["pct"],
                    "severity": a["severity"],
                })
    return warnings
