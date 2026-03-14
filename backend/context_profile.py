from __future__ import annotations

from typing import Any, Dict, Optional

DOC_HOSTS = (
    "docs.google.com",
    "notion.so",
    "notion.site",
    "coda.io",
    "quip.com",
)

FORM_HOSTS = (
    "forms.google.com",
    "typeform.com",
    "airtable.com",
    "tally.so",
)

CHAT_APP_KEYWORDS = (
    "slack",
    "discord",
    "messages",
    "signal",
    "telegram",
    "teams",
)

IDE_APP_KEYWORDS = (
    "cursor",
    "code",
    "visual studio code",
    "terminal",
    "iterm",
    "pycharm",
    "webstorm",
    "intellij",
)


def normalize_context(context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = context or {}
    return {
        "app_name": payload.get("app_name") or "Unknown",
        "bundle_id": payload.get("bundle_id") or None,
        "window_title": payload.get("window_title") or None,
        "page_title": payload.get("page_title") or None,
        "url_host": payload.get("url_host") or None,
    }


def derive_context_quality(context: Dict[str, Any], warning: Optional[str] = None) -> str:
    app_name = context.get("app_name")
    has_app = bool(app_name and app_name != "Unknown")
    has_window = bool(context.get("window_title"))
    has_browser = bool(context.get("page_title") or context.get("url_host"))

    if has_app and has_browser:
        return "full"
    if has_app or has_window:
        return "app_only"
    if warning:
        return "transcript_only"
    return "empty"


def derive_target_type(context: Dict[str, Any]) -> Optional[str]:
    app_name = (context.get("app_name") or "").lower()
    bundle_id = (context.get("bundle_id") or "").lower()
    window_title = (context.get("window_title") or "").lower()
    page_title = (context.get("page_title") or "").lower()
    url_host = (context.get("url_host") or "").lower()

    combined = " ".join(filter(None, [app_name, bundle_id, window_title, page_title]))

    if any(host in url_host for host in FORM_HOSTS):
        return "form"
    if any(host in url_host for host in DOC_HOSTS):
        return "browser_doc"
    if any(keyword in combined for keyword in CHAT_APP_KEYWORDS):
        return "chat"
    if any(keyword in combined for keyword in IDE_APP_KEYWORDS):
        return "ide"
    if "form" in combined or "survey" in combined:
        return "form"
    return "generic" if combined or url_host else None


def has_meaningful_context(context: Optional[Dict[str, Any]]) -> bool:
    if not context:
        return False

    normalized = normalize_context(context)
    return any([
        normalized.get("app_name") and normalized["app_name"] != "Unknown",
        normalized.get("window_title"),
        normalized.get("page_title"),
        normalized.get("url_host"),
    ])
