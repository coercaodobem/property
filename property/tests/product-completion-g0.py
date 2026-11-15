#!/usr/bin/env python3
"""Deterministic, network-free G0 inventory and clean-snapshot verifier."""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "property/docs/evidence/product-completion/G0"
RUNTIME_DIRS = ("property/web", "property/agent", "property/relay")
EVIDENCE_INPUTS = (
    "requirements.json",
    "source-map.json",
    "network-inventory.json",
    "dependency-license-inventory.json",
    "runtime-files.json",
    "workflow-scope.json",
)
NETWORK_PRIMITIVES = (
    "new WebSocket(",
    "fetch(",
    "fetcher(",
    "http.request(",
    "RTCPeerConnection",
)


class GateFailure(Exception):
    pass


def fail(message: str) -> None:
    raise GateFailure(message)


def run(command: list[str], cwd: Path = ROOT) -> str:
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True, check=False)
    if result.returncode:
        fail(f"Command failed ({result.returncode}): {' '.join(command)}: {result.stderr.strip()}")
    return result.stdout.strip()


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"Cannot read JSON {path.relative_to(ROOT)}: {error}")


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def tracked_runtime_paths() -> list[str]:
    if (ROOT / ".git").exists():
        raw = subprocess.run(
            ["git", "ls-files", "-z", "--", *RUNTIME_DIRS],
            cwd=ROOT,
            capture_output=True,
            check=False,
        )
        if raw.returncode:
            fail("git ls-files could not enumerate the release source roots")
        return sorted(item.decode("utf-8") for item in raw.stdout.split(b"\0") if item)
    inventory_path = EVIDENCE / "runtime-files.json"
    if not inventory_path.exists():
        fail("Clean snapshot has no committed runtime-files.json baseline")
    inventory = read_json(inventory_path)
    return sorted(item["path"] for item in inventory.get("files", []))


def filesystem_runtime_paths() -> list[str]:
    paths: list[str] = []
    for relative_root in RUNTIME_DIRS:
        root = ROOT / relative_root
        if not root.is_dir():
            fail(f"Missing runtime source root: {relative_root}")
        for path in root.rglob("*"):
            if path.is_symlink():
                fail(f"Symlink found in a shipped runtime tree: {path.relative_to(ROOT)}")
            if path.is_file():
                paths.append(path.relative_to(ROOT).as_posix())
    return sorted(paths)


def runtime_file_rows(paths: list[str]) -> tuple[list[dict], int, str]:
    rows = []
    total = 0
    tree = hashlib.sha256()
    for relative in paths:
        path = ROOT / relative
        if not path.is_file():
            fail(f"Runtime inventory path is missing: {relative}")
        size = path.stat().st_size
        digest = sha256_file(path)
        rows.append({"path": relative, "bytes": size, "sha256": digest})
        total += size
        tree.update(f"{relative}\0{size}\0{digest}\n".encode("utf-8"))
    return rows, total, tree.hexdigest()


def load_os_release() -> dict[str, str]:
    values: dict[str, str] = {}
    path = Path("/etc/os-release")
    if not path.is_file():
        fail("/etc/os-release is unavailable; Ubuntu execution cannot be confirmed")
    for line in path.read_text(encoding="utf-8").splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            values[key] = value.strip().strip('"')
    return values


def file_text(relative: str) -> str:
    path = ROOT / relative
    if not path.is_file():
        fail(f"Referenced source does not exist: {relative}")
    return path.read_text(encoding="utf-8", errors="replace")


def validate_requirements() -> tuple[dict, int]:
    data = read_json(EVIDENCE / "requirements.json")
    requirements = data.get("requirements")
    if data.get("schema_version") != 1 or not isinstance(requirements, list) or len(requirements) < 15:
        fail("Requirements ledger schema/version or minimum coverage is invalid")
    seen: set[str] = set()
    scopes = {"IN_SCOPE", "PENDING", "OUT_OF_SCOPE"}
    states = {"PARTIAL", "MISSING", "EXPERIMENTAL", "DEV_ONLY", "NOT_RUN", "BASELINE", "PENDING"}
    for row in requirements:
        required = ("id", "area", "promise", "scope_status", "implementation_state", "implementation_action", "source_paths", "case_ids")
        if any(not row.get(key) for key in required):
            fail(f"Incomplete requirements row: {row.get('id', '<no-id>')}")
        if row["id"] in seen:
            fail(f"Duplicate requirements ID: {row['id']}")
        seen.add(row["id"])
        if row["scope_status"] not in scopes or row["implementation_state"] not in states:
            fail(f"Invalid scope/state label in {row['id']}")
        if not row["case_ids"] or any(not re.fullmatch(r"G\d+-\d+", case) for case in row["case_ids"]):
            fail(f"Missing or malformed automated case ID in {row['id']}")
        for source in row["source_paths"]:
            if not (ROOT / source).is_file():
                fail(f"Requirements row {row['id']} points to missing source {source}")
    return data, len(requirements)


def validate_source_map() -> tuple[dict, int]:
    data = read_json(EVIDENCE / "source-map.json")
    entries = data.get("entrypoints")
    if data.get("schema_version") != 1 or not isinstance(entries, list) or len(entries) < 5:
        fail("Source map schema/version or entrypoint coverage is invalid")
    ids: set[str] = set()
    for entry in entries:
        if not entry.get("id") or entry["id"] in ids:
            fail(f"Missing or duplicate source-map entry ID: {entry.get('id')}")
        ids.add(entry["id"])
        for source in [entry.get("path", ""), *entry.get("supporting_paths", [])]:
            if not source or not (ROOT / source).is_file():
                fail(f"Source map points to missing file: {source}")
    profile = data.get("test_profile", {})
    if profile.get("operating_system") != "Ubuntu Linux x86_64 only" or profile.get("human_review") is not False or profile.get("other_operating_systems_executed") is not False:
        fail("Source-map test profile violates the authorized execution scope")
    return data, len(entries)


def validate_network_inventory() -> tuple[dict, int]:
    data = read_json(EVIDENCE / "network-inventory.json")
    destinations = data.get("destinations")
    if data.get("schema_version") != 1 or not isinstance(destinations, list) or len(destinations) < 12:
        fail("Network inventory schema/version or destination coverage is invalid")
    ids: set[str] = set()
    covered_files: set[str] = set()
    markers: set[tuple[str, str]] = set()
    for row in destinations:
        if not row.get("id") or row["id"] in ids:
            fail(f"Missing or duplicate network inventory ID: {row.get('id')}")
        ids.add(row["id"])
        for key in ("traffic", "destination", "trigger", "data_exposure", "offline_test_rule"):
            if not row.get(key):
                fail(f"Incomplete network inventory row {row['id']}: {key}")
        for item in row.get("source_markers", []):
            source = item.get("path", "")
            marker = item.get("marker", "")
            source_text = file_text(source)
            if not marker or marker not in source_text:
                fail(f"Network inventory marker missing: {source}: {marker}")
            covered_files.add(source)
            markers.add((source, marker))
    for entry in read_json(EVIDENCE / "source-map.json")["entrypoints"]:
        if any(network_id not in ids for network_id in entry.get("network_ids", [])):
            fail(f"Source-map entry {entry['id']} references unknown network IDs")

    # Inventory the source locations that initiate traffic. User-configured URLs
    # are represented by their guarded code path and documented destination class.
    scanner_tokens = ("new WebSocket(", "fetch(", "fetcher(", "http.request(", "RTCPeerConnection")
    scanned = [p for p in tracked_runtime_paths() if p.endswith((".js", ".mjs")) and "/vendor/" not in p and "/chess/vendor/" not in p]
    for relative in scanned:
        content = file_text(relative)
        if any(token in content for token in scanner_tokens) and relative not in covered_files:
            fail(f"Runtime network primitive has no classified destination: {relative}")

    html_files = [p for p in tracked_runtime_paths() if p.startswith("property/web/") and p.endswith(".html")]
    for relative in html_files:
        text = file_text(relative)
        for source in re.findall(r"<script\b[^>]*\bsrc=[\"']([^\"']+)[\"']", text, flags=re.IGNORECASE):
            if re.match(r"(?:https?:)?//", source, flags=re.IGNORECASE):
                fail(f"External executable script source is not allowed: {relative}: {source}")
            local = source.split("?", 1)[0].split("#", 1)[0]
            if local and not (ROOT / "property/web" / local.removeprefix("./")).is_file():
                fail(f"Local script reference is missing: {relative}: {source}")
        for module in re.findall(r"\bimport\(\s*[\"']([^\"']+)[\"']\s*\)", text, flags=re.IGNORECASE):
            if re.match(r"(?:https?:)?//", module, flags=re.IGNORECASE):
                fail(f"External dynamic module is not allowed: {relative}: {module}")
    for relative in (p for p in tracked_runtime_paths() if p.startswith("property/web/") and p.endswith(".js") and "/vendor/" not in p):
        for module in re.findall(r"\bimport\(\s*[\"']([^\"']+)[\"']\s*\)", file_text(relative)):
            if re.match(r"(?:https?:)?//", module, flags=re.IGNORECASE):
                fail(f"External dynamic module is not allowed: {relative}: {module}")
    return data, len(destinations)


def validate_dependency_inventory() -> tuple[dict, int]:
    data = read_json(EVIDENCE / "dependency-license-inventory.json")
    components = data.get("runtime_components")
    test_tools = data.get("test_toolchain")
    if data.get("schema_version") != 1 or not isinstance(components, list) or len(components) < 8 or not isinstance(test_tools, list):
        fail("Dependency/license inventory schema or coverage is invalid")
    ids: set[str] = set()
    for component in components:
        if not component.get("id") or component["id"] in ids:
            fail(f"Missing or duplicate dependency inventory ID: {component.get('id')}")
        ids.add(component["id"])
        if not component.get("license") or "unknown" in component["license"].lower():
            fail(f"Missing/unknown license statement for {component['id']}")
        for evidence in component.get("evidence_paths", []):
            if not (ROOT / evidence).is_file():
                fail(f"Missing license/provenance evidence for {component['id']}: {evidence}")
        if component.get("runtime_downloads") is not False:
            fail(f"Runtime download is not disabled/classified for {component['id']}")
    return data, len(components)


def validate_workflow_scope(write: bool) -> dict:
    """Prove that a normal modelo-mvp push cannot launch other-OS tests."""
    paths = {
        "property-checks": ".github/workflows/property-checks.yml",
        "property-offline-platforms": ".github/workflows/property-offline-platforms.yml",
        "pages": ".github/workflows/property-pages.yml",
        "upstream-build": ".github/workflows/build.yml",
        "upstream-release": ".github/workflows/create-release.yml",
        "desktop-smoke": ".github/workflows/smoke-test-desktop.yml",
    }
    sources = {key: file_text(path) for key, path in paths.items()}
    checks = {
        "property-checks": (
            "branches: [modelo-mvp]" in sources["property-checks"]
            and "native-relay-deferred:\n    if: ${{ github.event_name == 'workflow_dispatch' && github.event.inputs.run_deferred_platforms == 'true' }}"
            in sources["property-checks"]
            and "os: [windows-latest, macos-15]" in sources["property-checks"]
        ),
        "property-offline-platforms": (
            "branches: [modelo-mvp]" in sources["property-offline-platforms"]
            and "github.event.inputs.run_deferred_platforms == 'true'" in sources["property-offline-platforms"]
            and "contains(github.event.head_commit.message, '[run-g12-now]')" in sources["property-offline-platforms"]
        ),
        "pages": (
            "branches: [modelo-mvp]" in sources["pages"]
            and "runs-on: ubuntu-latest" in sources["pages"]
        ),
        "upstream-build": (
            "branches: [main]" in sources["upstream-build"]
            and "branches: [modelo-mvp]" not in sources["upstream-build"]
        ),
        "upstream-release": (
            "push:\n    tags:" in sources["upstream-release"]
            and "push:\n    branches:" not in sources["upstream-release"]
        ),
        "desktop-smoke": (
            "workflow_dispatch:" in sources["desktop-smoke"]
            and "pull_request:" in sources["desktop-smoke"]
            and "push:" not in sources["desktop-smoke"].split("permissions:", 1)[0]
        ),
    }
    failed = [key for key, passed in checks.items() if not passed]
    if failed:
        fail(f"Workflow scope could launch an out-of-scope platform job: {failed}")
    value = {
        "schema_version": 1,
        "normal_push_branch": "modelo-mvp",
        "non_ubuntu_execution": "deferred; no normal push or pull request from this task",
        "dispatch_inputs_used": False,
        "g12_marker_used": False,
        "workflows": [
            {
                "id": key,
                "path": paths[key],
                "sha256": sha256_file(ROOT / paths[key]),
                "scope_check": "PASS",
            }
            for key in paths
        ],
    }
    report_path = EVIDENCE / "workflow-scope.json"
    if write:
        write_json(report_path, value)
    else:
        saved = read_json(report_path)
        if saved != value:
            fail("Workflow-scope evidence differs from the current workflows")
    return value


def environment_facts() -> dict:
    release = load_os_release()
    machine = platform.machine().lower()
    if release.get("ID") != "ubuntu" or machine not in ("x86_64", "amd64"):
        fail(f"G0 must run on Ubuntu x86_64; found {release.get('ID')} {machine}")
    node_version = run(["node", "--version"])
    match = re.fullmatch(r"v(\d+)\.(\d+)\.(\d+)", node_version)
    if not match or int(match.group(1)) < 22:
        fail(f"Node.js 22 or newer is required; found {node_version}")
    facts = {
        "os": release.get("PRETTY_NAME", "Ubuntu"),
        "os_id": release["ID"],
        "kernel": platform.release(),
        "architecture": machine,
        "node": node_version,
        "python": platform.python_version(),
        "git": run(["git", "--version"]) if (ROOT / ".git").exists() else "not present in clean archive",
    }
    return facts


def validate_runtime_files(write: bool) -> tuple[dict, int, int, str]:
    paths = tracked_runtime_paths()
    actual = filesystem_runtime_paths()
    if paths != actual:
        missing = sorted(set(paths) - set(actual))
        extra = sorted(set(actual) - set(paths))
        fail(f"Runtime tree differs from tracked snapshot; missing={missing[:5]}, extra={extra[:5]}")
    rows, total, tree_sha = runtime_file_rows(paths)
    value = {"schema_version": 1, "roots": list(RUNTIME_DIRS), "file_count": len(rows), "total_bytes": total, "tree_sha256": tree_sha, "files": rows}
    path = EVIDENCE / "runtime-files.json"
    if write:
        write_json(path, value)
    else:
        saved = read_json(path)
        if saved != value:
            fail("Runtime file hashes/count/size differ from runtime-files.json")
        value = saved
    return value, len(rows), total, tree_sha


def verify_all(write: bool, remote_sha: str | None = None) -> dict:
    environment = environment_facts()
    requirements, requirement_count = validate_requirements()
    source_map, entrypoint_count = validate_source_map()
    network, network_count = validate_network_inventory()
    dependencies, dependency_count = validate_dependency_inventory()
    workflow_scope = validate_workflow_scope(write)

    base_commit = None
    branch = "archive-snapshot"
    remote_url = "not present in clean archive"
    remote_tracking = "not present in clean archive"
    tracked_clean = None
    if (ROOT / ".git").exists():
        base_commit = run(["git", "rev-parse", "HEAD"])
        branch = run(["git", "branch", "--show-current"])
        remote_url = run(["git", "remote", "get-url", "property"])
        remote_tracking = run(["git", "rev-parse", "refs/remotes/property/modelo-mvp"])
        tracked_status = run(["git", "status", "--porcelain", "--untracked-files=no"])
        runtime_status = run(["git", "status", "--porcelain", "--untracked-files=all", "--", *RUNTIME_DIRS])
        tracked_clean = not tracked_status
        if branch != "modelo-mvp":
            fail(f"Expected modelo-mvp branch; found {branch}")
        if remote_url.rstrip("/") != "https://github.com/coercaodobem/property.git":
            fail(f"The property remote points to the wrong repository: {remote_url}")
        if remote_tracking != base_commit:
            fail(f"Local branch and cached property/modelo-mvp disagree: {base_commit} vs {remote_tracking}")
        if tracked_status:
            fail("Tracked source changes exist while recording the G0 baseline")
        if runtime_status:
            fail(f"Untracked/modified runtime source exists: {runtime_status.splitlines()[:5]}")
        if remote_sha is not None and remote_sha != base_commit:
            fail(f"Live remote SHA supplied for this run does not match local HEAD: {remote_sha} vs {base_commit}")
    else:
        saved_manifest = read_json(EVIDENCE / "manifest.json")
        base_commit = saved_manifest.get("source_commit")
        branch = saved_manifest.get("branch", branch)
        remote_url = saved_manifest.get("property_remote_url", remote_url)
        remote_tracking = saved_manifest.get("remote_tracking_commit", remote_tracking)
        tracked_clean = saved_manifest.get("tracked_worktree_clean")

    runtime_files, runtime_count, runtime_bytes, runtime_tree_sha = validate_runtime_files(write)

    plan_en = file_text("property/docs/product-completion-plan.md")
    plan_pt = file_text("property/docs/product-completion-plan.pt-BR.md")
    if "Ubuntu Linux x86_64 only" not in plan_en or "somente Ubuntu Linux x86_64" not in plan_pt:
        fail("The execution plan does not constrain its test host to Ubuntu x86_64")
    if "No human review" not in plan_en or "Não há revisão humana" not in plan_pt:
        fail("The plan does not exclude human review in both languages")
    if "offline in an isolated local lab" not in plan_en or "offline em laboratório local isolado" not in plan_pt:
        fail("The plan does not require offline functional checks in both languages")

    checks = [
        {"case_id": "G0-01", "result": "PASS", "assertion": "Ubuntu x86_64 and Node.js >=22; model-mvp branch and coercaodobem/property remote verified.", "observed": {"branch": branch, "remote_url": remote_url, "source_commit": base_commit, "remote_tracking_commit": remote_tracking, "tracked_worktree_clean": tracked_clean, "environment": environment}},
        {"case_id": "G0-02", "result": "PASS", "assertion": "Requirements ledger has unique, sourced, actioned, scoped rows and automated case IDs.", "observed": {"requirements": requirement_count}},
        {"case_id": "G0-03", "result": "PASS", "assertion": "All product entry points and supporting source paths exist in the clean source tree.", "observed": {"entrypoints": entrypoint_count}},
        {"case_id": "G0-04", "result": "PASS", "assertion": "Runtime network destinations, initiators, triggers, exposure, and offline substitution rules are inventoried; external executable loads are rejected.", "observed": {"destination_classes": network_count}},
        {"case_id": "G0-05", "result": "PASS", "assertion": "Vendored/runtime components have license/provenance evidence and no runtime downloads are declared.", "observed": {"components": dependency_count}},
        {"case_id": "G0-06", "result": "PASS", "assertion": "Every tracked file under web/agent/relay matches its recorded SHA-256 and the runtime tree contains no untracked files or symlinks.", "observed": {"runtime_files": runtime_count, "runtime_bytes": runtime_bytes, "tree_sha256": runtime_tree_sha}},
        {"case_id": "G0-07", "result": "PASS", "assertion": "The authorized plan restricts execution to offline Ubuntu x86_64; workflow conditions defer non-Ubuntu jobs and no dispatch or marker will be used.", "observed": {"human_review": False, "other_operating_systems_executed": False, "non_ubuntu_jobs_deferred": True, "workflow_count": len(workflow_scope["workflows"])}},
    ]
    manifest = {
        "schema_version": 1,
        "gate": "G0",
        "result": "PASS",
        "source_commit": base_commit,
        "branch": branch,
        "property_remote_url": remote_url,
        "remote_tracking_commit": remote_tracking,
        "remote_head_verified_before_inventory": remote_sha or (remote_tracking if remote_tracking == base_commit else None),
        "tracked_worktree_clean": tracked_clean,
        "scope": {"os": "Ubuntu Linux x86_64 only", "functional_test_network": "offline isolated local network", "human_review": False, "other_os_execution": False, "public_relays_or_mainnet": False},
        "environment": environment,
        "runtime_inventory": {"file_count": runtime_count, "total_bytes": runtime_bytes, "tree_sha256": runtime_tree_sha},
        "requirements_count": requirement_count,
        "entrypoints_count": entrypoint_count,
        "network_destination_classes": network_count,
        "dependency_components_count": dependency_count,
        "case_results": checks,
        "note": "Static/inventory gate only. No product functional test, public-relay request, wallet RPC, other-OS execution, or human review was performed by G0.",
    }
    if write:
        write_json(EVIDENCE / "manifest.json", manifest)
        write_json(EVIDENCE / "execution-report.json", {"gate": "G0", "result": "PASS", "case_results": checks})
    else:
        saved = read_json(EVIDENCE / "manifest.json")
        if saved.get("result") != "PASS" or saved.get("runtime_inventory") != manifest["runtime_inventory"]:
            fail("Saved G0 manifest does not prove the current source inventory")
        if saved.get("requirements_count") != requirement_count or saved.get("network_destination_classes") != network_count:
            fail("Saved G0 manifest does not match current ledger/network inventory")
        report = read_json(EVIDENCE / "execution-report.json")
        if report.get("gate") != "G0" or report.get("result") != "PASS" or len(report.get("case_results", [])) != 7:
            fail("G0 execution report is missing a complete fixed case set")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true", help="Generate the deterministic inventory and G0 report")
    mode.add_argument("--verify", action="store_true", help="Verify the saved inventory against this tree")
    parser.add_argument("--remote-sha", help="Live SHA obtained with git ls-remote before offline G0 checks")
    args = parser.parse_args()
    try:
        manifest = verify_all(args.write, args.remote_sha)
    except GateFailure as error:
        print(f"G0 FAIL: {error}", file=sys.stderr)
        return 1
    print(json.dumps({"gate": "G0", "result": "PASS", "source_commit": manifest["source_commit"], "runtime_files": manifest["runtime_inventory"]["file_count"], "tree_sha256": manifest["runtime_inventory"]["tree_sha256"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
