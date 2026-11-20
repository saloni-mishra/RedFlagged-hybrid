import json

from knowledge import retrieve_context
from rules import analyze_rules


def dispatch(payload_json: str) -> str:
    """Run a rule-engine or knowledge request and return JSON text."""
    payload = json.loads(payload_json)
    action = payload.get("action", "analyze")

    if action == "retrieve_context":
        return json.dumps(
            {"context": retrieve_context(payload.get("text", "") or "")},
            ensure_ascii=False,
        )

    lang = payload.get("lang")
    if lang not in (None, "en", "hi"):
        lang = None

    return json.dumps(
        analyze_rules(payload.get("text", "") or "", lang),
        ensure_ascii=False,
    )
