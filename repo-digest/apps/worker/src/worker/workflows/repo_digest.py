"""Catch-up digest for a GitHub repo.

Takes a repo handle and a date, lists the PRs merged since that date and the PRs still
waiting on review, summarizes each in one line, and posts the digest to the triggering
user's Slack self-DM. Runs on-behalf-of the triggering user, so the GitHub and Slack
connector credentials resolve to that user.
"""

import json
import re
from datetime import datetime, timedelta
from typing import Any

import pydantic
import structlog
from mistralai import workflows
from mistralai.workflows import Depends
from mistralai.workflows.client import get_mistral_client
from mistralai.workflows.core.auth import RunAs
from mistralai.workflows.plugins.mistralai.connectors import (
    ToolCallClient,
    connector,
    uses_connectors,
)

logger = structlog.get_logger(__name__)

github_connector = connector("github_app")
slack_connector = connector("slack")

SUMMARY_MODEL = "mistral-medium-latest"
SEARCH_PAGE_SIZE = 100
MAX_ITEMS_PER_SECTION = 20
MAX_BODY_CHARS = 1500
MAX_MESSAGE_CHARS = 4900
PR_SEARCH_FIELDS = [
    "number",
    "title",
    "body",
    "state",
    "draft",
    "html_url",
    "user",
    "closed_at",
    "labels",
]
_SLACK_USER_ID = re.compile(r"^U[0-9A-Z]{8,}$")
_SLACK_USER_ID_TEXT = re.compile(r"User ID:\s*(U[0-9A-Z]{8,})")
_SLACK_PERMALINK = re.compile(r"https://[^\s]*slack\.com/archives/[^\s)>]+")


class RepoDigestInput(pydantic.BaseModel):
    """Repo handle (``owner/repo`` or a github.com URL) and catch-up date (``YYYY-MM-DD``)."""

    repo: str
    since: str


class DigestItem(pydantic.BaseModel):
    number: int
    title: str
    url: str
    author: str
    summary: str


class RepoDigestOutput(pydantic.BaseModel):
    repo: str
    since: str
    merged: list[DigestItem]
    waiting_on_review: list[DigestItem]
    digest: str
    slack_permalink: str


def parse_repo_handle(handle: str) -> tuple[str, str]:
    text = handle.strip().rstrip("/")
    text = re.sub(r"^https?://(www\.)?github\.com/", "", text)
    text = re.sub(r"\.git$", "", text)
    parts = [part for part in text.split("/") if part]
    if len(parts) != 2:
        raise ValueError(f"repo must look like 'owner/repo', got {handle!r}")
    return parts[0], parts[1]


def validate_since(since: str) -> str:
    text = since.strip()
    datetime.strptime(text, "%Y-%m-%d")
    return text


def extract_payload(response: Any) -> Any:
    """Unwrap an MCP tool result to the JSON value it carries."""
    if isinstance(response, str):
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            return response
    if isinstance(response, dict):
        if "structuredContent" in response:
            return response["structuredContent"]
        content = response.get("content")
        if isinstance(content, list):
            texts = [part.get("text", "") for part in content if isinstance(part, dict) and part.get("type") == "text"]
            for text in texts:
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    continue
            return texts[0] if texts else None
    return response


def normalize_prs(payload: Any) -> list[dict[str, Any]]:
    items = payload.get("items") if isinstance(payload, dict) else payload
    if not isinstance(items, list):
        return []
    prs = []
    for item in items[:SEARCH_PAGE_SIZE]:
        if not isinstance(item, dict) or item.get("number") is None:
            continue
        user = item.get("user")
        prs.append(
            {
                "number": item["number"],
                "title": (item.get("title") or "").strip(),
                "body": (item.get("body") or "")[:MAX_BODY_CHARS],
                "url": item.get("html_url") or "",
                "author": user.get("login", "") if isinstance(user, dict) else "",
            }
        )
    return prs


def find_slack_user_id(payload: Any) -> str | None:
    if isinstance(payload, dict):
        user = payload.get("user")
        if isinstance(user, str) and _SLACK_USER_ID.match(user):
            return user
        if isinstance(user, dict) and isinstance(user.get("id"), str) and _SLACK_USER_ID.match(user["id"]):
            return user["id"]
        if isinstance(payload.get("id"), str) and _SLACK_USER_ID.match(payload["id"]):
            return payload["id"]
        for value in payload.values():
            found = find_slack_user_id(value)
            if found:
                return found
    elif isinstance(payload, list):
        for value in payload:
            found = find_slack_user_id(value)
            if found:
                return found
    return None


def resolve_own_slack_user_id(payload: Any) -> str | None:
    """The Slack connector renders profiles as text cards; accept both shapes."""
    structured = find_slack_user_id(payload)
    if structured:
        return structured
    text = payload if isinstance(payload, str) else json.dumps(payload)
    match = _SLACK_USER_ID_TEXT.search(text)
    return match.group(1) if match else None


def extract_slack_permalink(result: Any) -> str:
    """The send tool reports the message link in its text or structured fields."""
    if isinstance(result, dict):
        if result.get("permalink"):
            return str(result["permalink"])
        if result.get("channel") and result.get("ts"):
            return f"{result['channel']}/{result['ts']}"
    text = result if isinstance(result, str) else json.dumps(result)
    match = _SLACK_PERMALINK.search(text)
    return match.group(0) if match else "sent"


def _md_escape(text: str) -> str:
    return text.replace("[", "\\[").replace("]", "\\]").replace("\n", " ").strip()


def _item_line(item: DigestItem) -> str:
    title = _md_escape(item.title) or f"PR #{item.number}"
    author = f" (@{item.author})" if item.author else ""
    return f"• #{item.number} [{title}]({item.url}) — {item.summary}{author}"


def render_digest(
    handle: str,
    since: str,
    merged: list[DigestItem],
    merged_total: int,
    waiting: list[DigestItem],
    waiting_total: int,
) -> str:
    lines = [f":mag: *Repo digest — `{handle}`* (merged since *{since}*)", ""]
    lines.append(f"*Merged ({merged_total})*")
    if merged:
        lines.extend(_item_line(item) for item in merged[:MAX_ITEMS_PER_SECTION])
        if merged_total > len(merged):
            lines.append(f"_…and {merged_total - len(merged)} more_")
    else:
        lines.append("_Nothing merged since that date._")
    lines.append("")
    lines.append(f"*Waiting on review ({waiting_total})*")
    if waiting:
        lines.extend(_item_line(item) for item in waiting[:MAX_ITEMS_PER_SECTION])
        if waiting_total > len(waiting):
            lines.append(f"_…and {waiting_total - len(waiting)} more_")
    else:
        lines.append("_No open PRs waiting on review._")
    message = "\n".join(lines)
    if len(message) > MAX_MESSAGE_CHARS:
        message = message[: MAX_MESSAGE_CHARS - 1] + "…"
    return message


@workflows.activity(name="github-search-pull-requests", start_to_close_timeout=timedelta(seconds=60))
async def github_search_pull_requests(
    query: str,
    owner: str,
    repo: str,
    github: ToolCallClient = Depends(github_connector),  # noqa: B008 - SDK DI pattern
) -> dict[str, Any]:
    response = await github.call_tool(
        tool_name="search_pull_requests",
        arguments={
            "query": query,
            "owner": owner,
            "repo": repo,
            "sort": "updated",
            "order": "desc",
            "perPage": SEARCH_PAGE_SIZE,
            "fields": PR_SEARCH_FIELDS,
        },
    )
    payload = extract_payload(response)
    total = payload.get("total_count") if isinstance(payload, dict) else None
    prs = normalize_prs(payload)
    return {"total_count": int(total) if isinstance(total, int) else len(prs), "prs": prs}


@workflows.activity(name="summarize-pull-requests", start_to_close_timeout=timedelta(seconds=180))
async def summarize_pull_requests(prs: list[dict[str, Any]]) -> list[str]:
    fallback = [pr["title"] or f"PR #{pr['number']}" for pr in prs]
    if not prs:
        return []
    try:
        client = get_mistral_client(run_as=RunAs.DEPLOYMENT)
        entries = [
            {"index": i, "number": pr["number"], "title": pr["title"], "body": pr["body"]} for i, pr in enumerate(prs)
        ]
        prompt = (
            "You are writing a repo catch-up digest. For each pull request below, write ONE line "
            "(at most 120 characters) summarizing what it changes, or why it is waiting for review, "
            "based on its title and body. Reply with JSON only: "
            '{"summaries": ["...", ...]} with exactly one entry per input pull request, in the same order.'
            "\n\n" + json.dumps(entries)
        )
        response = await client.chat.complete_async(
            model=SUMMARY_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content
        data = json.loads(content) if isinstance(content, str) else content
        summaries = data.get("summaries") if isinstance(data, dict) else None
        if isinstance(summaries, list) and len(summaries) == len(prs):
            return [str(summary).strip().replace("\n", " ") or fb for summary, fb in zip(summaries, fallback)]
        logger.warning("summary response had no usable summaries list, falling back to titles")
    except Exception as exc:  # noqa: BLE001 - summarization must fall back to titles
        logger.warning("pull request summarization failed, falling back to titles", error=str(exc))
    return fallback


@workflows.activity(
    name="post-slack-self-dm",
    start_to_close_timeout=timedelta(seconds=60),
    retry_policy_max_attempts=1,
)
async def post_slack_self_dm(
    message: str,
    slack: ToolCallClient = Depends(slack_connector),  # noqa: B008 - SDK DI pattern
) -> str:
    me = extract_payload(
        await slack.call_tool(
            tool_name="slack_read_user_profile",
            arguments={"response_format": "detailed", "include_locale": True},
        )
    )
    user_id = resolve_own_slack_user_id(me)
    if not user_id:
        raise ValueError("could not resolve the current Slack user id for the self-DM")
    result = extract_payload(
        await slack.call_tool(
            tool_name="slack_send_message",
            arguments={"channel_id": user_id, "message": message, "unfurl_app_links": True},
        )
    )
    return extract_slack_permalink(result)


@workflows.workflow.define(
    name="repo-digest",
    workflow_display_name="Repo Digest",
    workflow_description=(
        "Lists the PRs merged in a GitHub repo since a given date and the PRs still waiting on "
        "review, summarizes each in one line, and posts the digest to your Slack self-DM."
    ),
    on_behalf_of=True,
)
@uses_connectors(github_connector, slack_connector)
class RepoDigestWorkflow:
    @workflows.workflow.entrypoint
    async def run(self, input: RepoDigestInput) -> RepoDigestOutput:
        owner, repo = parse_repo_handle(input.repo)
        since = validate_since(input.since)
        handle = f"{owner}/{repo}"

        merged_result = await github_search_pull_requests(f"is:merged merged:>={since}", owner, repo)
        waiting_result = await github_search_pull_requests("is:open -is:draft", owner, repo)

        merged_summaries = await summarize_pull_requests(merged_result["prs"])
        waiting_summaries = await summarize_pull_requests(waiting_result["prs"])

        merged = [
            DigestItem(
                number=pr["number"],
                title=pr["title"],
                url=pr["url"],
                author=pr["author"],
                summary=summary,
            )
            for pr, summary in zip(merged_result["prs"], merged_summaries)
        ]
        waiting = [
            DigestItem(
                number=pr["number"],
                title=pr["title"],
                url=pr["url"],
                author=pr["author"],
                summary=summary,
            )
            for pr, summary in zip(waiting_result["prs"], waiting_summaries)
        ]

        digest = render_digest(
            handle,
            since,
            merged,
            merged_result["total_count"],
            waiting,
            waiting_result["total_count"],
        )
        permalink = await post_slack_self_dm(digest)
        return RepoDigestOutput(
            repo=handle,
            since=since,
            merged=merged,
            waiting_on_review=waiting,
            digest=digest,
            slack_permalink=permalink,
        )
