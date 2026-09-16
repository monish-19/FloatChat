"""Natural-language intent detection for graph-worthy questions."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class QueryIntent:
    kind: str
    graph_required: bool = False
    variable: str | None = None


def detect_query_intent(question: str) -> QueryIntent:
    """Detect multi-hop anomaly similarity requests without an LLM call."""
    lower = question.lower()
    anomaly = re.search(r"\b(?:anomal(?:y|ies)|outlier|abnormal|event)\b", lower)
    similarity = re.search(
        r"\b(?:similar|similarity|like|matching|correlat(?:e|ed|ion)|same pattern)\b",
        lower,
    )
    topology = re.search(r"\b(?:adjacent|neighbor|nearby|deployed|region|float)\b", lower)
    if anomaly and (similarity or topology):
        variable = None
        for name, pattern in {
            "temperature": r"\b(?:temperature|temp|thermal)\b",
            "salinity": r"\b(?:salinity|salt|saline)\b",
            "oxygen": r"\b(?:oxygen|o2|dissolved oxygen)\b",
            "chlorophyll": r"\b(?:chlorophyll|chla|phytoplankton)\b",
        }.items():
            if re.search(pattern, lower):
                variable = name
                break
        return QueryIntent("anomaly_similarity", graph_required=True, variable=variable)
    return QueryIntent("standard", graph_required=False)
