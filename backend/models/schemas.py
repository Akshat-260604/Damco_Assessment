from pydantic import BaseModel
from typing import Optional, Literal, Any


class ColumnInfo(BaseModel):
    name: str
    dtype: str
    semantic_type: Literal["categorical", "numeric", "datetime", "text"]
    null_percentage: float
    unique_count: int
    numeric_stats: Optional[dict] = None
    top_values: Optional[list] = None
    sample_values: list = []


class DataFrameSchema(BaseModel):
    filename: str
    rows: int
    columns: int
    column_info: list[ColumnInfo]


class UploadResponse(BaseModel):
    session_id: str
    files_processed: list[str]
    schema_summary: dict[str, Any]
    suggested_questions: list[str]
    anomaly_summary: dict[str, Any] = {}   # df_name -> { col -> { count, pct, severity } }


class QueryRequest(BaseModel):
    session_id: str
    query: str


class ArtifactContent(BaseModel):
    type: Literal["html"]
    content: str


class SourceCitation(BaseModel):
    dataframe: str
    filename: str
    columns_used: list[str]
    row_count: int


class AnomalyWarning(BaseModel):
    dataframe: str
    column: str
    outlier_count: int
    outlier_pct: float
    severity: Literal["low", "medium", "high"]


class QueryResponse(BaseModel):
    output_type: Literal["metric", "text", "table", "chart", "dashboard", "followup", "comparison"]
    render_mode: Literal["chat", "artifact"]
    aggregation_code: Optional[str] = None
    chat_message: str
    artifact: Optional[ArtifactContent] = None
    insight: str
    execution_result: Optional[Any] = None
    execution_error: Optional[str] = None
    citations: list[SourceCitation] = []
    anomaly_warnings: list[AnomalyWarning] = []
