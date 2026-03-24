"""
Share router — POST /api/share and GET /api/share/{share_id}
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any

from services.share_store import share_store
from services.session_store import session_store

router = APIRouter(prefix="/api/share", tags=["share"])


class ShareRequest(BaseModel):
    session_id: str


class ShareResponse(BaseModel):
    share_id: str


class ShareData(BaseModel):
    share_id: str
    messages: list[dict[str, Any]]
    schema: dict[str, Any]
    files: list[str]
    created_at: float


@router.post("", response_model=ShareResponse)
async def create_share(request: ShareRequest):
    """Snapshot the current session into a shareable report."""
    session = session_store.get_session(request.session_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail="Session not found or expired. Please re-upload your files.",
        )
    if not session.conversation_history:
        raise HTTPException(
            status_code=422,
            detail="No conversation to share yet. Ask at least one question first.",
        )

    files = list(session.dataframes.keys())
    share_id = share_store.create_share(
        messages=list(session.conversation_history),
        schema=session.schema,
        files=files,
    )
    return ShareResponse(share_id=share_id)


@router.get("/{share_id}", response_model=ShareData)
async def get_share(share_id: str):
    """Retrieve a shared report snapshot."""
    snapshot = share_store.get_share(share_id)
    if snapshot is None:
        raise HTTPException(
            status_code=404,
            detail="Shared report not found or has expired (links expire after 7 days).",
        )
    return ShareData(
        share_id=snapshot.share_id,
        messages=snapshot.messages,
        schema=snapshot.schema,
        files=snapshot.files,
        created_at=snapshot.created_at,
    )
