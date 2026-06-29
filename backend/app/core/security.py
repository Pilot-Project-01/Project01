"""Admin authentication for the read (scoring) endpoints.

Candidate writes (creating a session, posting events) stay public — the browser
needs them and they carry no read capability. The admin reads (listing sessions,
exporting a trace) expose every candidate's data, so they require a bearer token.

Fail closed: if ADMIN_API_TOKEN is unset, every admin request is rejected. A
misconfigured deployment serves nothing rather than serving everything.
"""

import secrets

from fastapi import Depends, Header, HTTPException

from app.core.config import Settings, get_settings


def require_admin(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    token = settings.admin_api_token
    if not token:
        # No token configured → deny. Never fall open.
        raise HTTPException(
            status_code=503,
            detail="Admin API is not configured",
            headers={"code": "admin_unconfigured"},
        )

    prefix = "Bearer "
    presented = (
        authorization[len(prefix):]
        if authorization and authorization.startswith(prefix)
        else ""
    )
    # Constant-time compare to avoid leaking the token via timing.
    if not presented or not secrets.compare_digest(presented, token):
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
