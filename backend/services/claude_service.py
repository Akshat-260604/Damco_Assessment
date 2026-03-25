import json
import logging
import time
from typing import Any, Optional

import boto3
from botocore.exceptions import ClientError

from config import AWS_ACCESS_KEY_ID, AWS_REGION, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN, BEDROCK_MODEL_ID

logger = logging.getLogger(__name__)


def _get_bedrock_client():
    kwargs: dict[str, Any] = {"service_name": "bedrock-runtime", "region_name": AWS_REGION}
    if AWS_ACCESS_KEY_ID:
        kwargs["aws_access_key_id"] = AWS_ACCESS_KEY_ID
    if AWS_SECRET_ACCESS_KEY:
        kwargs["aws_secret_access_key"] = AWS_SECRET_ACCESS_KEY
    if AWS_SESSION_TOKEN:
        kwargs["aws_session_token"] = AWS_SESSION_TOKEN
    return boto3.client(**kwargs)


def call_bedrock(messages: list[dict], system_prompt: str, retries: int = 3) -> str:
    client = _get_bedrock_client()
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 8192,
        "system": system_prompt,
        "messages": messages,
    }
    last_error: Exception = Exception("Unknown error")
    for attempt in range(retries):
        try:
            response = client.invoke_model(
                modelId=BEDROCK_MODEL_ID,
                body=json.dumps(body),
                contentType="application/json",
                accept="application/json",
            )
            return json.loads(response["body"].read())["content"][0]["text"]
        except ClientError as e:
            last_error = e
            code = e.response["Error"]["Code"]
            if code in ("ThrottlingException", "ServiceUnavailableException"):
                wait = 2 ** attempt
                logger.warning(f"Bedrock throttled (attempt {attempt+1}), retrying in {wait}s")
                time.sleep(wait)
            else:
                logger.error(f"Bedrock ClientError: {e}")
                raise
        except Exception as e:
            last_error = e
            wait = 2 ** attempt
            logger.warning(f"Bedrock error (attempt {attempt+1}): {e}, retrying in {wait}s")
            time.sleep(wait)
    raise last_error



SYSTEM_PROMPT_TEMPLATE = """\
You are an expert Business Intelligence analyst with deep knowledge of pandas and data visualization.

════════════════════════════════════════════════════════
OUTPUT FORMAT — MANDATORY
════════════════════════════════════════════════════════
Your ENTIRE response must be ONE valid JSON object.
- No text before or after the JSON
- No markdown, no code fences, no explanations
- All JSON values must be JSON literals (strings, numbers, booleans, null, arrays, objects)
- Python code lives ONLY inside the "aggregation_code" string — nowhere else
- NEVER put Python expressions or variable names as JSON values

FORBIDDEN (breaks the system):
  {{"total": round(total_revenue, 2)}}   ← Python expression as a JSON value

CORRECT:
  {{"aggregation_code": "result = df['revenue'].sum()"}}   ← Python as a string value

════════════════════════════════════════════════════════
JSON SCHEMA
════════════════════════════════════════════════════════
{{
  "output_type": "metric | text | table | chart | dashboard | followup",
  "render_mode": "chat | artifact",
  "aggregation_code": "<python string> | null",
  "chat_message": "<plain English — 1-3 sentences>",
  "artifact": {{ "type": "html", "content": "<complete HTML string>" }} | null,
  "insight": "<exactly 2 sentences>",
  "sources": [
    {{ "dataframe": "<df_name>", "columns_used": ["<col1>", "<col2>"] }}
  ]
}}

════════════════════════════════════════════════════════
DECISION RULES
════════════════════════════════════════════════════════

1. output_type
   metric     → single computed number (sum, count, average, %)
   text       → qualitative answer, no computation needed
   table      → top-N list, multi-row result
   chart      → one visualisation
   dashboard  → multiple KPI cards + charts combined
   comparison → side-by-side comparison of two or more groups/periods/segments
   followup   → query is ambiguous, ask for clarification

2. render_mode
   chat     → metrics, short text, tables < 5 rows
   artifact → charts, dashboards, tables ≥ 5 rows, comparisons, formatted reports

3. aggregation_code
   - Write pandas code when data computation is required
   - Available DataFrames: {dataframe_names}
   - Code MUST assign final result to a variable named `result`
   - For metrics:    result = df['col'].sum()
   - For tables:     result = df.groupby('a')['b'].sum().reset_index()
   - For charts:     result = df.groupby('a')['b'].sum().reset_index().to_dict(orient='records')
   - Set null if no computation needed (pure text answers)

4. chat_message for metrics
   - Use "RESULT_VALUE" as a placeholder — the backend will replace it with the real computed value
   - Example: "The total revenue is RESULT_VALUE."
   - Example: "There are RESULT_VALUE unique products in the dataset."

5. artifact HTML (when render_mode = "artifact")
   - Complete self-contained HTML — no external data fetches
   - IMPORTANT: To use real Python-calculated data in the HTML chart, use the literal string `RESULT_DATA` as a placeholder in your JavaScript.
   - Example: `const data = RESULT_DATA;`
   - The backend will magically string-replace `RESULT_DATA` with the JSON array/dict from your Python `result` variable before sending it to the user.
   - Do NOT hardcode hallucinated or fake data in the HTML! Always use `RESULT_DATA`.
   - CDN: https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js
   - Fonts: https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap
   - Color palette:
       background  #0a0b0f   surface  #111318   accent   #e8ff47
       text        #f0f2f8   muted    #7a8099   border   #1f2937
   - Fonts: headings → Bebas Neue, body → DM Sans, numbers → DM Mono
   - Charts: maintainAspectRatio: false, container height in CSS
   - Style: border-radius 12px, box-shadow, hover effects
   - Dashboards: CSS grid, metric KPI cards on top row, charts below

6. insight
   - Exactly 2 sentences
   - Sentence 1: what the data shows
   - Sentence 2: actionable business recommendation

7. sources
   - List every DataFrame you read or computed from
   - For each, list only the column names you actually referenced in aggregation_code or used to answer the question
   - If no computation was needed, list the DataFrames that were relevant to the answer
   - Example: [{{"dataframe": "df_sales", "columns_used": ["revenue", "region"]}}]

════════════════════════════════════════════════════════
DATA SCHEMA
════════════════════════════════════════════════════════
{schema}

════════════════════════════════════════════════════════
EXAMPLES
════════════════════════════════════════════════════════

── METRIC ──
Query: "What is total revenue?"
{{
  "output_type": "metric",
  "render_mode": "chat",
  "aggregation_code": "result = float(df_sales['revenue'].sum())",
  "chat_message": "The total revenue is RESULT_VALUE.",
  "artifact": null,
  "insight": "Total revenue is the primary business health indicator. Tracking monthly trends against this baseline will highlight growth or decline early."
}}

── CHART ──
Query: "Show revenue by region as a bar chart"
{{
  "output_type": "chart",
  "render_mode": "artifact",
  "aggregation_code": "result = df_sales.groupby('region')['revenue'].sum().sort_values(ascending=False).reset_index().to_dict(orient='records')",
  "chat_message": "Here is a bar chart showing revenue broken down by region.",
  "artifact": {{
    "type": "html",
    "content": "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'><title>Revenue by Region</title><link href='https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap' rel='stylesheet'><script src='https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'></script><style>*{{box-sizing:border-box;margin:0;padding:0}}body{{background:#0a0b0f;color:#f0f2f8;font-family:'DM Sans',sans-serif;padding:24px}}.card{{background:#111318;border-radius:12px;padding:24px;box-shadow:0 4px 24px rgba(0,0,0,.4)}}.title{{font-family:'Bebas Neue',sans-serif;font-size:28px;color:#e8ff47;margin-bottom:16px}}.chart-wrap{{position:relative;height:380px}}</style></head><body><div class='card'><div class='title'>Revenue by Region</div><div class='chart-wrap'><canvas id='c'></canvas></div></div><script>const d=RESULT_DATA;new Chart(document.getElementById('c'),{{type:'bar',data:{{labels:d.map(x=>x.region),datasets:[{{data:d.map(x=>x.revenue),backgroundColor:'#e8ff47',borderRadius:6,hoverBackgroundColor:'#f5ff8a'}}]}},options:{{responsive:true,maintainAspectRatio:false,plugins:{{legend:{{display:false}},tooltip:{{callbacks:{{label:(c)=>'$'+c.parsed.y.toLocaleString()}}}}}},scales:{{y:{{grid:{{color:'#1f2937'}},ticks:{{color:'#7a8099',callback:(v)=>'$'+v.toLocaleString()}}}},x:{{grid:{{display:false}},ticks:{{color:'#7a8099'}}}}}}}}}})</script></body></html>"
  }},
  "insight": "North region leads revenue generation, contributing the largest share. Replicating North's strategies — particularly product mix and pricing — in underperforming regions could unlock significant growth."
}}

── DASHBOARD ──
Query: "Give me a summary dashboard"
{{
  "output_type": "dashboard",
  "render_mode": "artifact",
  "aggregation_code": "import pandas as pd\\nmetrics = {{\\n  'total_revenue': round(float(df_sales['revenue'].sum()), 2),\\n  'total_orders': int(len(df_sales)),\\n  'avg_order_value': round(float(df_sales['revenue'].mean()), 2),\\n  'unique_customers': int(df_sales['customer_id'].nunique()) if 'customer_id' in df_sales.columns else 0\\n}}\\nrev_by_cat = df_sales.groupby('category')['revenue'].sum().sort_values(ascending=False).head(5).reset_index()\\nresult = {{'metrics': metrics, 'rev_by_cat': rev_by_cat.to_dict(orient='records')}}",
  "chat_message": "I've built a summary dashboard with key KPIs and a revenue breakdown by category.",
  "artifact": {{
    "type": "html",
    "content": "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'><title>Dashboard</title><link href='https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap' rel='stylesheet'><script src='https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'></script><style>*{{box-sizing:border-box;margin:0;padding:0}}body{{background:#0a0b0f;color:#f0f2f8;font-family:'DM Sans',sans-serif;padding:24px;display:flex;flex-direction:column;gap:20px}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px}}.kpi{{background:#111318;border-radius:12px;padding:20px;box-shadow:0 4px 24px rgba(0,0,0,.4)}}.kpi-label{{font-size:12px;color:#7a8099;text-transform:uppercase;letter-spacing:.05em}}.kpi-value{{font-family:'DM Mono',monospace;font-size:28px;color:#e8ff47;margin-top:6px}}.card{{background:#111318;border-radius:12px;padding:24px;box-shadow:0 4px 24px rgba(0,0,0,.4)}}.title{{font-family:'Bebas Neue',sans-serif;font-size:24px;color:#e8ff47;margin-bottom:16px}}.chart-wrap{{position:relative;height:320px}}</style></head><body><div class='grid'><div class='kpi'><div class='kpi-label'>Total Revenue</div><div id='k_rev' class='kpi-value'>-</div></div><div class='kpi'><div class='kpi-label'>Total Orders</div><div id='k_ord' class='kpi-value'>-</div></div><div class='kpi'><div class='kpi-label'>Avg Order Value</div><div id='k_aov' class='kpi-value'>-</div></div><div class='kpi'><div class='kpi-label'>Unique Customers</div><div id='k_cus' class='kpi-value'>-</div></div></div><div class='card'><div class='title'>Revenue by Category</div><div class='chart-wrap'><canvas id='c'></canvas></div></div><script>const result=RESULT_DATA;document.getElementById('k_rev').innerText='$'+(result.metrics.total_revenue/1000000).toFixed(2)+'M';document.getElementById('k_ord').innerText=result.metrics.total_orders.toLocaleString();document.getElementById('k_aov').innerText='$'+result.metrics.avg_order_value;document.getElementById('k_cus').innerText=result.metrics.unique_customers.toLocaleString();const d=result.rev_by_cat;new Chart(document.getElementById('c'),{{type:'bar',data:{{labels:d.map(x=>x.category),datasets:[{{data:d.map(x=>x.revenue),backgroundColor:'#e8ff47',borderRadius:6,hoverBackgroundColor:'#f5ff8a'}}]}},options:{{responsive:true,maintainAspectRatio:false,plugins:{{legend:{{display:false}}}},scales:{{y:{{grid:{{color:'#1f2937'}},ticks:{{color:'#7a8099',callback:(v)=>'$'+v.toLocaleString()}}}},x:{{grid:{{display:false}},ticks:{{color:'#7a8099'}}}}}}}}}})</script></body></html>"
  }},
  "insight": "Revenue is concentrated in top categories, suggesting strong category leadership. Expanding mid-tier categories with targeted promotions could diversify revenue risk and improve overall margins."
}}"""
def _build_system_prompt(schema: dict, dataframe_names: list[str]) -> str:
    schema_str = json.dumps(schema, indent=2, default=str)
    df_names_str = ", ".join(dataframe_names) if dataframe_names else "none"
    return SYSTEM_PROMPT_TEMPLATE.format(schema=schema_str, dataframe_names=df_names_str)


def _build_messages(conversation_history: list[dict], query: str) -> list[dict]:
    messages = []
    for item in conversation_history:
        role = item.get("role", "user")
        content = item.get("content", "")
        if isinstance(content, dict):
            content = json.dumps(content)
        messages.append({"role": role, "content": str(content)})
    messages.append({"role": "user", "content": query})
    return messages


def _parse_response(raw: str) -> dict[str, Any]:
    raw = raw.strip()

    if raw.startswith("```"):
        lines = raw.split("\n")
        inner = lines[1:-1] if lines[-1].strip().startswith("```") else lines[1:]
        raw = "\n".join(inner).strip()

    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        raw = raw[start : end + 1]

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.warning(f"JSON parse failed ({e}). Raw[:300]: {raw[:300]}")
        data = {"output_type": "text", "render_mode": "chat", "aggregation_code": None, "chat_message": "I had trouble formatting my response. Please try rephrasing your question.", "artifact": None, "insight": ""}

    defaults: dict[str, Any] = {
        "output_type": "text",
        "render_mode": "chat",
        "aggregation_code": None,
        "chat_message": "",
        "artifact": None,
        "insight": "",
        "sources": [],
    }
    for k, v in defaults.items():
        data.setdefault(k, v)

    return data


def _inject_result_value(chat_message: str, execution_result: Optional[dict]) -> str:
    """Replace the RESULT_VALUE placeholder with the real computed scalar."""
    if "RESULT_VALUE" not in chat_message or execution_result is None:
        return chat_message

    result_type = execution_result.get("type")
    value = execution_result.get("data")

    if result_type == "scalar" and value is not None:
        if isinstance(value, float) and value == int(value):
            formatted = f"{int(value):,}"
        elif isinstance(value, float):
            formatted = f"{value:,.2f}"
        else:
            formatted = f"{value:,}" if isinstance(value, int) else str(value)
    elif result_type == "series" and isinstance(value, dict):
        formatted = str(value)
    elif result_type == "dataframe" and isinstance(value, list):
        if len(value) == 1:
            formatted = str(value[0])
        else:
            formatted = f"[DataFrame with {len(value)} rows]"
    elif result_type == "error":
        err_msg = execution_result.get("error", "Unknown Code Error")
        formatted = f"[Error: {err_msg}]"
    elif value is not None:
        formatted = str(value)
    else:
        formatted = "None"

    return chat_message.replace("RESULT_VALUE", formatted)


async def process_query(
    query: str,
    schema: dict,
    conversation_history: list[dict],
    dataframe_names: list[str],
    execution_result: Optional[dict] = None,
) -> dict[str, Any]:
    system_prompt = _build_system_prompt(schema, dataframe_names)
    messages = _build_messages(conversation_history, query)
    raw = call_bedrock(messages, system_prompt)
    parsed = _parse_response(raw)

    if execution_result:
        parsed["chat_message"] = _inject_result_value(
            parsed.get("chat_message", ""), execution_result
        )

    return parsed
