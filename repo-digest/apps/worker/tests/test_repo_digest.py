"""Unit tests for the digest helpers and an end-to-end run of the repo-digest workflow with faked connectors."""

import asyncio
import json
from datetime import timedelta
from types import SimpleNamespace
from typing import Any

import pytest
from mistralai.workflows.plugins.mistralai.connectors import ToolCallClient
from mistralai.workflows.testing import create_test_worker
from worker.workflows import repo_digest
from worker.workflows.repo_digest import RepoDigestWorkflow

WORKFLOW_EXECUTION_TIMEOUT = timedelta(seconds=20)

MERGED_PAYLOAD = {
    "total_count": 2,
    "incomplete_results": False,
    "items": [
        {
            "number": 101,
            "title": "Add SSO login",
            "body": "Adds SAML SSO login flow for enterprise customers.",
            "state": "closed",
            "draft": False,
            "html_url": "https://github.com/octo/hello/pull/101",
            "user": {"login": "ada"},
            "closed_at": "2026-11-03T10:00:00Z",
            "labels": [{"name": "feature"}],
        },
        {
            "number": 99,
            "title": "Fix flaky retry test",
            "body": "Stabilizes the retry test by removing the race.",
            "state": "closed",
            "draft": False,
            "html_url": "https://github.com/octo/hello/pull/99",
            "user": {"login": "grace"},
            "closed_at": "2026-11-02T09:00:00Z",
            "labels": [],
        },
    ],
}

OPEN_PAYLOAD = {
    "total_count": 1,
    "incomplete_results": False,
    "items": [
        {
            "number": 42,
            "title": "Refactor config loader",
            "body": "Splits the config loader into per-source readers.",
            "state": "open",
            "draft": False,
            "html_url": "https://github.com/octo/hello/pull/42",
            "user": {"login": "linus"},
            "closed_at": None,
            "labels": [{"name": "refactor"}],
        }
    ],
}


def test_parse_repo_handle_accepts_handle_url_and_git_suffix() -> None:
    assert repo_digest.parse_repo_handle("octo/hello") == ("octo", "hello")
    assert repo_digest.parse_repo_handle("https://github.com/octo/hello") == ("octo", "hello")
    assert repo_digest.parse_repo_handle("https://github.com/octo/hello.git/") == ("octo", "hello")


def test_parse_repo_handle_rejects_bad_input() -> None:
    for bad in ("octo", "https://github.com/octo", "a/b/c", ""):
        with pytest.raises(ValueError):
            repo_digest.parse_repo_handle(bad)


def test_validate_since() -> None:
    assert repo_digest.validate_since(" 2026-11-01 ") == "2026-11-01"
    with pytest.raises(ValueError):
        repo_digest.validate_since("01-11-2026")
    with pytest.raises(ValueError):
        repo_digest.validate_since("2026-13-40")


def test_extract_payload_unwraps_mcp_text_content() -> None:
    response = {"content": [{"type": "text", "text": json.dumps({"ok": True})}]}
    assert repo_digest.extract_payload(response) == {"ok": True}
    assert repo_digest.extract_payload({"structuredContent": {"a": 1}}) == {"a": 1}
    assert repo_digest.extract_payload('{"b": 2}') == {"b": 2}
    assert repo_digest.extract_payload("not json") == "not json"


def test_normalize_prs_reads_items_and_skips_junk() -> None:
    prs = repo_digest.normalize_prs({"items": MERGED_PAYLOAD["items"] + [{"no_number": True}, "junk"]})
    assert [pr["number"] for pr in prs] == [101, 99]
    assert prs[0]["author"] == "ada"
    assert prs[0]["url"] == "https://github.com/octo/hello/pull/101"
    assert repo_digest.normalize_prs({"items": "nope"}) == []


def test_find_slack_user_id() -> None:
    assert repo_digest.find_slack_user_id({"user": {"id": "U0A7XN48C3C"}}) == "U0A7XN48C3C"
    assert repo_digest.find_slack_user_id({"user": "U0A7XN48C3C"}) == "U0A7XN48C3C"
    assert repo_digest.find_slack_user_id({"ok": True, "profile": {"id": "nope"}}) is None


def test_render_digest_lists_both_sections_with_links() -> None:
    items = [
        repo_digest.DigestItem(
            number=101, title="Add SSO", url="https://github.com/octo/hello/pull/101", author="ada", summary="SSO login"
        )
    ]
    message = repo_digest.render_digest("octo/hello", "2026-11-01", items, 5, [], 0)
    assert "*Merged (5)*" in message
    assert "[Add SSO](https://github.com/octo/hello/pull/101) — SSO login (@ada)" in message
    assert "…and 4 more" in message
    assert "*Waiting on review (0)*" in message
    assert "No open PRs" in message


class _FakeChat:
    def __init__(self, responses: list[list[str]]) -> None:
        self._responses = list(responses)

    async def complete_async(self, **_kwargs: Any) -> Any:
        content = json.dumps({"summaries": self._responses.pop(0)})
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


def _fake_mistral_client(responses: list[list[str]]) -> Any:
    return SimpleNamespace(chat=_FakeChat(responses))


async def test_repo_digest_end_to_end(temporal_env: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    posted: dict[str, Any] = {}

    async def fake_call_tool(self: Any, tool_name: str, arguments: dict[str, Any] | None = None) -> Any:
        args = arguments or {}
        if tool_name == "search_pull_requests":
            payload = MERGED_PAYLOAD if "is:merged" in args.get("query", "") else OPEN_PAYLOAD
            assert args["owner"] == "octo" and args["repo"] == "hello"
            return {"content": [{"type": "text", "text": json.dumps(payload)}]}
        if tool_name == "slack_read_user_profile":
            return {"ok": True, "user": {"id": "U0A7XN48C3C", "profile": {"real_name": "Sean"}}}
        if tool_name == "slack_send_message":
            posted.update(args)
            return {"ok": True, "permalink": "https://example.slack.com/archives/D123/p1700000000.000001"}
        raise AssertionError(f"unexpected connector tool call: {tool_name}")

    monkeypatch.setattr(ToolCallClient, "call_tool", fake_call_tool)
    fake_client = _fake_mistral_client([["SSO login flow", "Stabilized retry test"], ["Refactor of config loading"]])
    monkeypatch.setattr(repo_digest, "get_mistral_client", lambda: fake_client)

    async with create_test_worker(
        temporal_env,
        workflows=[RepoDigestWorkflow],
        activities=[
            repo_digest.github_search_pull_requests,
            repo_digest.summarize_pull_requests,
            repo_digest.post_slack_self_dm,
        ],
    ):
        handle = await temporal_env.client.start_workflow(
            "repo-digest",
            {"repo": "https://github.com/octo/hello", "since": "2026-11-01"},
            id="test-repo-digest",
            task_queue="test-task-queue",
            execution_timeout=WORKFLOW_EXECUTION_TIMEOUT,
        )
        result = await asyncio.wait_for(handle.result(), timeout=30)

    assert result["repo"] == "octo/hello"
    assert result["since"] == "2026-11-01"
    assert [item["number"] for item in result["merged"]] == [101, 99]
    assert [item["number"] for item in result["waiting_on_review"]] == [42]
    assert [item["summary"] for item in result["merged"]] == ["SSO login flow", "Stabilized retry test"]
    assert result["waiting_on_review"][0]["summary"] == "Refactor of config loading"
    assert result["slack_permalink"] == "https://example.slack.com/archives/D123/p1700000000.000001"
    assert posted["channel_id"] == "U0A7XN48C3C"
    assert "*Merged (2)*" in posted["message"]
    assert "*Waiting on review (1)*" in posted["message"]
    assert "https://github.com/octo/hello/pull/101" in posted["message"]
    assert "https://github.com/octo/hello/pull/42" in posted["message"]
    assert posted["message"] == result["digest"]


async def test_summarize_pull_requests_falls_back_to_titles_on_model_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def boom(**_kwargs: Any) -> Any:
        raise RuntimeError("model unavailable")

    monkeypatch.setattr(
        repo_digest, "get_mistral_client", lambda: SimpleNamespace(chat=SimpleNamespace(complete_async=boom))
    )
    prs = [{"number": 7, "title": "Fix thing", "body": "", "url": "u", "author": "a"}]
    assert await repo_digest.summarize_pull_requests(prs) == ["Fix thing"]
    assert await repo_digest.summarize_pull_requests([]) == []
