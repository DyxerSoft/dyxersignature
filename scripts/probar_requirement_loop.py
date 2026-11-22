"""Regression tests for trusted input, revision invalidation and reconciliation."""

import contextlib
from copy import deepcopy
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from ejecutar_requirement_loop import ROOT, main, read_result, read_rubrics
from requirement_loop import (
    AUDIT_LIMIT, CONFLICT_LIMIT, CYCLES, GATES, LIMITS, ORGANIZER, READY, ROLES, bind, migrate, new_id,
    reserve, schedule, stale_role, submit,
)
from requirement_loop_storage import (
    EVIDENCE_LIMIT, EVIDENCE_REFERENCE_LIMIT, YAML_LIMIT, LoopError, checked_bytes,
    file_hash, git, product_baseline, product_inventory, read_yaml,
)


class RequirementLoopTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.req = "TEST-001"
        relative = Path("docs/implementacion/requerimientos/_template/loop-state.yaml")
        self.template = self.root / relative
        self.template.parent.mkdir(parents=True)
        shutil.copyfile(ROOT / relative, self.template)
        for relative in ("project-manifest.yaml", "config/requirement-rubrics-v1.yaml"):
            path = self.root / relative
            path.parent.mkdir(exist_ok=True)
            shutil.copyfile(ROOT / relative, path)
        self.spec = self.root / f"specs/features/{self.req}.md"
        self.spec.parent.mkdir(parents=True)
        self.spec.write_text("spec fixture\n", encoding="utf-8")
        self.product = self.root / "product.py"
        self.product.write_text("value = 1\n", encoding="utf-8")
        git(self.root, "init", "--quiet")
        git(self.root, "add", "--", ".")
        git(self.root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "baseline")
        (self.root / ".git/info/exclude").write_text("scripts/\n.requirement-handoff.lock\n", encoding="utf-8")
        self.product.write_text("value = 2\n", encoding="utf-8")
        self.reference = {
            "path": self.spec.relative_to(self.root).as_posix(), "locator": "L1",
            "sha256": file_hash(self.spec),
        }
        self.rubrics = read_rubrics(self.root)
        self.state = read_yaml(self.template)
        self.state["requirement"] = self.req
        migrate(self.state, self.rubrics)

    def cli(self, *args, expected=0):
        output = io.StringIO()
        argv = ["ejecutar_requirement_loop.py", "--requirement", self.req, *args]
        with contextlib.redirect_stdout(output), patch.object(sys, "argv", argv):
            self.assertEqual(main(self.root), expected)
        return json.loads(output.getvalue())

    def producer(self, index):
        dispatch = reserve(self.root, self.state, [])
        role = ROLES[index]
        self.assertEqual(dispatch["role"], role)
        session = f"producer-{index}"
        bind(self.state, dispatch["dispatch_id"], role, session)
        result = {
            "event_id": new_id(), "dispatch_id": dispatch["dispatch_id"],
            "outcome": READY[index], "artifacts": [self.reference],
        }
        if index == 1:
            result["product_sources"] = ["product.py"]
        if index == 2:
            result["gate"] = "pass"
        if index == 4:
            result["gates"] = dict.fromkeys(GATES, True)
        return session, result

    def validate_project(self):
        scripts = self.root / "scripts"
        scripts.mkdir(exist_ok=True)
        for name in ("validar_requirement_loop", "ejecutar_requirement_loop", "requirement_loop", "requirement_loop_storage"):
            shutil.copyfile(ROOT / f"scripts/{name}.py", scripts / f"{name}.py")
        return subprocess.run(
            [sys.executable, "-X", "utf8", "-B", str(scripts / "validar_requirement_loop.py")],
            capture_output=True, encoding="utf-8",
        )

    def evaluation(self, index):
        dispatch = reserve(self.root, self.state, [])
        session = f"review-{index}" if index != 4 else ORGANIZER
        if index != 4:
            bind(self.state, dispatch["dispatch_id"], dispatch["role"], session)
        fields = ("requirement_id", "task_id", "dispatch_id", "revision", "attempt", "rubric_id", "rubric_version")
        evaluation = {key: dispatch[key] for key in fields}
        evaluation.update(
            evaluation_id=new_id(), role=dispatch["subject"], reviewer=dispatch["role"],
            criteria=[
                {
                    "criterion_id": key, "passed": True,
                    "evidence": {"references": [self.reference], "justification": "Fixture"},
                }
                for key in self.rubrics[dispatch["subject"]]["criteria"]
            ],
        )
        return session, {"event_id": new_id(), "dispatch_id": dispatch["dispatch_id"], "evaluation": evaluation}

    def test_security_exception_requires_policy(self):
        schedule(self.state, ROLES[2], "SECURITY_REWORK")
        session, payload = self.producer(2)
        payload.update(gate="not_applicable", exception=self.reference)
        policy = {
            "security_review_required": False,
            "security_exceptions": {self.req: {"mode": "permanent", "authorization": self.reference}},
        }
        self.assertEqual(submit(self.root, self.state, self.rubrics, session, payload, policy), "rejected")
        self.state["security_initial"]["required"] = False
        self.state["security"]["required"] = False
        self.assertIsNone(self.state["dispatch"])
        replacement = reserve(self.root, self.state, [])
        bind(self.state, replacement["dispatch_id"], ROLES[2], "authorized-security")
        payload.update(event_id=new_id(), dispatch_id=replacement["dispatch_id"])
        self.assertEqual(submit(self.root, self.state, self.rubrics, "authorized-security", payload, policy), "accepted")
        self.assertEqual(stale_role(self.root, self.state, {"security_review_required": True}), ROLES[2])

    def test_developer_delivery_requires_product_inventory(self):
        schedule(self.state, ROLES[1], "CODE_REWORK")
        session, payload = self.producer(1)
        del payload["product_sources"]
        self.assertEqual(submit(self.root, self.state, self.rubrics, session, payload), "rejected")
        self.assertEqual(self.state["deliveries"], {})

    def test_developer_inventory_includes_git_add_remove_rename_and_untracked(self):
        baseline = product_baseline(self.root)
        self.spec.rename(self.spec.with_name("renamed.md"))
        self.template.unlink()
        (self.root / "new.py").write_text("new = True\n", encoding="utf-8")
        (self.root / "untracked.py").write_text("untracked = True\n", encoding="utf-8")
        actual = product_inventory(self.root, baseline, self.req)
        self.assertEqual(set(actual), {
            "product.py", "specs/features/TEST-001.md", "specs/features/renamed.md",
            "docs/implementacion/requerimientos/_template/loop-state.yaml",
            "new.py", "untracked.py",
        })
        self.template.write_text("fixture changed\n", encoding="utf-8")
        schedule(self.state, ROLES[1], "CODE_REWORK")
        session, payload = self.producer(1)
        note = self.spec.with_name("renamed.md")
        payload["artifacts"] = [{"path": note.relative_to(self.root).as_posix(), "locator": "L1", "sha256": file_hash(note)}]
        payload["product_sources"] = actual[:-1]
        original = deepcopy(self.state)
        self.assertEqual(submit(self.root, self.state, self.rubrics, session, payload), "rejected")
        payload["product_sources"] = actual
        self.assertEqual(submit(self.root, original, self.rubrics, session, payload), "accepted")
        delivery = original["deliveries"][ROLES[1]]
        self.assertIsNone(delivery["files"]["specs/features/TEST-001.md"])
        self.assertEqual(delivery["product_baseline"], baseline)

    def test_staged_only_bytes_and_staged_mode_block_reservation_and_completion(self):
        git(self.root, "add", "--", "product.py")
        self.product.write_text("value = 1\n", encoding="utf-8")
        with self.assertRaisesRegex(LoopError, "staged"):
            reserve(self.root, self.state, [])
        self.assertEqual(self.state["iteration"], 0)
        git(self.root, "restore", "--staged", "--", "product.py")
        self.product.write_text("value = 2\n", encoding="utf-8")
        for index in range(len(ROLES)):
            session, payload = self.producer(index)
            self.assertEqual(submit(self.root, self.state, self.rubrics, session, payload), "accepted")
            session, payload = self.evaluation(index)
            if index == 4:
                unchanged_path = self.spec.relative_to(self.root).as_posix()
                git(self.root, "update-index", "--chmod=+x", "--", unchanged_path)
                mode_diff = git(self.root, "diff", "--cached", "--summary", "--", unchanged_path)
                self.assertIn(b"mode change 100644 => 100755", mode_diff)
                with self.assertRaisesRegex(LoopError, "staged"):
                    submit(self.root, self.state, self.rubrics, session, payload)
                self.assertEqual(self.state["state"], "VALIDATING")
                git(self.root, "restore", "--staged", "--", unchanged_path)
            self.assertEqual(submit(self.root, self.state, self.rubrics, session, payload), "accepted")
        self.assertEqual(self.state["state"], "COMPLETED")

    @unittest.skipIf(os.name == "nt", "Windows no expone chmod ejecutable del worktree en Git")
    def test_unstaged_mode_change_invalidates_review(self):
        schedule(self.state, ROLES[1], "CODE_REWORK")
        session, payload = self.producer(1)
        self.assertEqual(submit(self.root, self.state, self.rubrics, session, payload), "accepted")
        self.assertEqual(self.state["deliveries"][ROLES[1]]["product_modes"], {"product.py": "100644"})
        self.product.chmod(0o755)
        self.assertEqual(stale_role(self.root, self.state), ROLES[1])

    def test_revision_exception_excludes_other_dispatch(self):
        self.state["security_initial"]["required"] = False
        self.state["security"]["required"] = False
        schedule(self.state, ROLES[2], "SECURITY_REWORK")
        session, payload = self.producer(2)
        payload.update(gate="not_applicable", exception=self.reference)
        policy = {
            "security_review_required": False,
            "security_exceptions": {self.req: {
                "mode": "revision", "authorization": self.reference,
                "revision": self.state["dispatch"]["revision"],
            }},
        }
        first = deepcopy(self.state)
        self.assertEqual(submit(self.root, first, self.rubrics, session, payload, policy), "accepted")
        rejected = deepcopy(policy)
        rejected["security_exceptions"][self.req]["revision"] = {"delivery": "past", "inputs": "past"}
        self.assertEqual(submit(self.root, self.state, self.rubrics, session, payload, rejected), "rejected")
        self.assertEqual(stale_role(self.root, first, rejected), ROLES[2])

    def test_audit_exhaustion_keeps_evaluation_retry_transition(self):
        session, payload = self.producer(0)
        self.assertEqual(submit(self.root, self.state, self.rubrics, session, payload), "accepted")
        session, payload = self.evaluation(0)
        payload["evaluation"]["score"] = 9
        self.state["bounded_audit"] = AUDIT_LIMIT
        self.assertEqual(submit(self.root, self.state, self.rubrics, session, payload), "rejected")
        self.assertIsNone(self.state["dispatch"])
        self.assertEqual(self.state["history"][-1]["event"], "result_retry")
        self.assertEqual(reserve(self.root, self.state, [])["attempt"], 2)

    def test_evidence_limits_and_secret_content(self):
        session, payload = self.producer(0)
        marker = "password=" + "fixture-marker"
        secret = self.root / "secret.md"
        secret.write_text(marker, encoding="utf-8")
        payload["artifacts"] = [{"path": "secret.md", "locator": "L1", "sha256": file_hash(secret)}]
        for reference in (payload["artifacts"], [self.reference] * (EVIDENCE_REFERENCE_LIMIT + 1)):
            with self.subTest(reference_count=len(reference)):
                state = deepcopy(self.state)
                self.assertEqual(submit(self.root, state, self.rubrics, session, payload | {"artifacts": reference}), "rejected")
                self.assertNotIn(marker, str(state))
        big = self.root / "big.md"
        big.write_bytes(b"x" * (EVIDENCE_LIMIT + 1))
        ref = {"path": "big.md", "locator": "L1", "sha256": file_hash(big)}
        state = deepcopy(self.state)
        self.assertEqual(submit(self.root, state, self.rubrics, session, payload | {"artifacts": [ref]}), "rejected")
        big.write_bytes(b"x" * EVIDENCE_LIMIT)
        ref["sha256"] = file_hash(big)
        state = deepcopy(self.state)
        self.assertEqual(submit(self.root, state, self.rubrics, session, payload | {"artifacts": [ref] * 9}), "rejected")
        with big.open("wb") as stream:
            stream.truncate(YAML_LIMIT + 1)
        with self.assertRaises(LoopError):
            read_yaml(big)

    def test_checked_read_detects_replacement(self):
        original = os.fstat
        source = self.root / "replace.md"
        replacement = self.root / "replacement.md"
        source.write_bytes(b"old\n")
        replacement.write_bytes(b"new\n")
        attempts = []

        def replace_on_open(descriptor):
            result = original(descriptor)
            if not attempts:
                try:
                    os.replace(replacement, source)
                except PermissionError:
                    attempts.append("denied")
                else:
                    attempts.append("replaced")
            return result

        with patch("requirement_loop_storage.os.fstat", side_effect=replace_on_open):
            try:
                data = checked_bytes(source, 1024, self.root)
            except LoopError:
                self.assertEqual(attempts, ["replaced"])
            else:
                self.assertEqual(attempts, ["denied"])
                self.assertEqual(data, b"old\n")

    def test_checked_read_rejects_symlinks(self):
        link = self.root / "evidence-link.md"
        try:
            link.symlink_to(self.spec)
        except OSError as error:
            self.skipTest(f"El entorno no permite crear enlaces simbólicos: {error.winerror if os.name == 'nt' else error.errno}")
        with self.assertRaises(LoopError):
            checked_bytes(link, 1024, self.root)

    def test_rework_identical_artifacts_create_new_delivery_revision(self):
        session, payload = self.producer(0)
        self.assertEqual(submit(self.root, self.state, self.rubrics, session, payload), "accepted")
        previous = self.state["deliveries"][ROLES[0]]
        session, result = self.evaluation(0)
        result["evaluation"]["criteria"][-1].update(passed=False, action="Repita la entrega")
        self.assertEqual(submit(self.root, self.state, self.rubrics, session, result), "accepted")
        self.assertEqual(self.state["state"], "ANALYSIS_REWORK")
        dispatch = reserve(self.root, self.state, [])
        bind(self.state, dispatch["dispatch_id"], dispatch["role"], "analysis-rework")
        payload.update(event_id=new_id(), dispatch_id=dispatch["dispatch_id"])
        self.assertEqual(submit(self.root, self.state, self.rubrics, "analysis-rework", payload), "accepted")
        current = self.state["deliveries"][ROLES[0]]
        self.assertEqual(current["files"], previous["files"])
        self.assertNotEqual(current["revision"], previous["revision"])

    def test_completed_reopens_on_status_after_product_drift(self):
        from ejecutar_requirement_loop import get_state_path
        from requirement_loop_storage import digest, write_yaml

        for index in range(len(ROLES)):
            for create in (self.producer, self.evaluation):
                session, payload = create(index)
                self.assertEqual(submit(self.root, self.state, self.rubrics, session, payload), "accepted")
        self.assertEqual(self.state["state"], "COMPLETED")
        path = get_state_path(self.root, self.req)
        path.parent.mkdir()
        self.state["integrity"] = digest(self.state)
        write_yaml(path, self.state)
        manifest_path = self.root / "project-manifest.yaml"
        manifest = read_yaml(manifest_path)
        manifest["workflow"]["current_feature"] = self.req
        write_yaml(manifest_path, manifest)
        self.product.write_text("value = 3\n", encoding="utf-8")
        validation = self.validate_project()
        self.assertEqual(validation.returncode, 1, validation.stdout)
        self.assertIn("Revisión obsoleta", validation.stdout)
        self.assertEqual(read_yaml(path)["state"], "COMPLETED")
        after = self.cli("status")
        self.assertEqual(after["state"], "CODE_REWORK")
        self.assertEqual(set(after["approvals"]), {ROLES[0]})
        self.assertTrue(any(item["event"] == "completed" for item in after["history"]))
        with path.open("a", encoding="utf-8") as stream:
            stream.write("state: COMPLETED\n")
        validation = self.validate_project()
        self.assertEqual(validation.returncode, 1)
        self.assertIn("Clave YAML duplicada", validation.stderr)

    def test_invalid_evaluations_cannot_advance(self):
        session, result = self.producer(0)
        self.assertEqual(submit(self.root, self.state, self.rubrics, session, result), "accepted")
        session, result = self.evaluation(0)
        invalid = {
            "boolean": lambda data: data["criteria"][0].update(passed=1),
            "duplicate": lambda data: data["criteria"].__setitem__(0, data["criteria"][1]),
            "missing": lambda data: data["criteria"].pop(),
            "evidence": lambda data: data["criteria"][0]["evidence"].update(references=[]),
            "reviewer": lambda data: data.update(reviewer=ROLES[0]),
            "score": lambda data: data.update(score=9),
            "revision": lambda data: data.update(revision={"delivery": "obsolete", "inputs": "obsolete"}),
        }
        for name, change in invalid.items():
            with self.subTest(reason=name):
                state, payload = deepcopy((self.state, result))
                change(payload["evaluation"])
                self.assertEqual(submit(self.root, state, self.rubrics, session, payload), "rejected")
                self.assertEqual(state["approvals"], {})
                self.assertEqual(state["evaluation_pending"], {"subject": ROLES[0], "retry": 1})

    def test_gates_pending_prevent_completion_with_five_passes(self):
        for index in range(len(ROLES)):
            session, payload = self.producer(index)
            if index == 4:
                payload["gates"]["no_known_flaky"] = False
            self.assertEqual(submit(self.root, self.state, self.rubrics, session, payload), "accepted")
            session, payload = self.evaluation(index)
            self.assertEqual(submit(self.root, self.state, self.rubrics, session, payload), "accepted")
        self.assertEqual(self.state["state"], "VALIDATING")
        self.assertNotIn(ROLES[-1], self.state["approvals"])
        self.assertEqual(sum(record.get("evaluation", {}).get("score", 0) == 10 for record in self.state["history"]), 5)

    def test_limits_require_review_before_extra_dispatch(self):
        for role in ROLES:
            with self.subTest(role=role):
                state = deepcopy(self.state)
                schedule(state, role, "PENDING")
                if role in LIMITS:
                    cap = state["limits"][LIMITS[role]]
                    state["cycles"][CYCLES[role]] = cap - 1
                else:
                    state["iteration"] = state["limits"]["total_iterations"] - 1
                self.assertIsNotNone(reserve(self.root, state, []))
                before = (state["iteration"], state["cycles"].copy())
                schedule(state, role, "PENDING")
                self.assertIsNone(reserve(self.root, state, []))
                self.assertEqual(state["state"], "HUMAN_REVIEW_REQUIRED")
                self.assertEqual(before, (state["iteration"], state["cycles"]))

    def test_drift_keeps_checkpoint_until_reconciliation(self):
        self.cli("init")
        dispatch = self.cli("reserve")
        self.cli("bind", dispatch["dispatch_id"], ROLES[0], "native-a")
        self.cli("pause", dispatch["dispatch_id"], "quota")
        self.spec.write_text("changed\n", encoding="utf-8")
        paused = self.cli("resume", "--capacity", "available")
        self.assertEqual(paused["stale_role"], ROLES[0])
        self.assertEqual(paused["dispatch_id"], dispatch["dispatch_id"])
        self.assertEqual(self.cli("reserve", expected=1)["status"], "stale")
        self.assertEqual(self.cli("status")["iteration"], 1)
        uncertain = self.cli("pause", dispatch["dispatch_id"], "uncertain_dispatch")
        self.assertEqual(uncertain["stale_role"], ROLES[0])
        self.assertEqual(self.cli("resume", "--capacity", "available"), uncertain)
        reopened = self.cli("resume", "--capacity", "reconciled")
        self.assertEqual(reopened["state"], "ANALYSIS_REWORK")
        after = self.cli("status")
        self.assertIsNone(after["dispatch"])
        self.assertEqual(after["deliveries"], {})
        self.assertEqual(after["iteration"], 1)

    def test_valid_result_replays_after_quota_returns(self):
        self.cli("init")
        dispatch = self.cli("reserve")
        dispatch_id = dispatch["dispatch_id"]
        self.cli("bind", dispatch_id, ROLES[0], "native-a")
        self.cli("pause", dispatch_id, "quota")
        result = {
            "event_id": "analysis-delivery", "dispatch_id": dispatch_id,
            "outcome": READY[0], "artifacts": [self.reference],
        }
        (self.root / "analysis.json").write_text(json.dumps(result), encoding="utf-8")
        before = self.cli("status")
        response = self.cli("submit", "native-a", "analysis.json", expected=1)
        self.assertEqual(response["status"], "rejected")
        self.assertEqual(self.cli("status"), before)
        self.assertEqual(self.cli("resume", "--capacity", "available"), dispatch)
        self.assertEqual(self.cli("submit", "native-a", "analysis.json")["status"], "accepted")
        after = self.cli("status")
        self.assertEqual(after["iteration"], before["iteration"])
        self.assertEqual(after["deliveries"][ROLES[0]]["dispatch_id"], dispatch_id)
        self.assertEqual(self.cli("submit", "native-a", "analysis.json")["status"], "accepted")
        self.assertEqual(self.cli("status"), after)

    def test_reconciled_rebinding_retires_old_session(self):
        self.cli("init")
        dispatch = self.cli("reserve")
        dispatch_id = dispatch["dispatch_id"]
        self.cli("bind", dispatch_id, ROLES[0], "native-a")
        with self.assertRaises(LoopError):
            self.cli("bind", dispatch_id, ROLES[0], "native-b")
        self.cli("pause", dispatch_id, "uncertain_dispatch")
        self.assertEqual(self.cli("resume", "--capacity", "available")["cause"], "uncertain_dispatch")
        self.assertEqual(
            self.cli("resume", "--capacity", "reconciled", "--retire-session", "native-a"),
            dispatch,
        )
        with self.assertRaises(LoopError):
            self.cli("bind", dispatch_id, ROLES[0], "native-a")
        self.cli("bind", dispatch_id, ROLES[0], "native-b")
        after = self.cli("status")
        self.assertEqual(after["iteration"], 1)
        self.assertEqual(
            [(entry["event"], entry["session"]) for entry in after["history"] if "session" in entry],
            [("bound", "native-a"), ("session_retired", "native-a"), ("bound", "native-b")],
        )

    def test_dedup_isolated_and_conflicts_bounded(self):
        session, payload = self.producer(0)
        self.assertEqual(submit(self.root, self.state, self.rubrics, "outsider", payload), "rejected")
        self.assertEqual(self.state["events"], {})
        self.assertEqual(submit(self.root, self.state, self.rubrics, session, payload), "accepted")
        before = self.state["generation"]
        self.assertEqual(submit(self.root, self.state, self.rubrics, session, payload), "accepted")
        self.assertEqual(self.state["generation"], before)
        self.state["bounded_conflicts"] = CONFLICT_LIMIT - 1
        for extra in ("first", "second"):
            self.assertEqual(submit(self.root, self.state, self.rubrics, session, payload | {"extra": extra}), "conflict")
        self.assertEqual(self.state["generation"], before + 1)

    def test_result_path_json_and_text_rejections(self):
        with self.assertRaises(LoopError):
            read_result(self.root, ROOT / "project-manifest.yaml")
        oversized = self.root / "large.json"
        oversized.write_bytes(b" " * (256 * 1024 + 1))
        with self.assertRaises(LoopError):
            read_result(self.root, oversized)
        self.cli("init")
        dispatch = self.cli("reserve")
        self.cli("bind", dispatch["dispatch_id"], ROLES[0], "native-a")
        bad = self.root / "bad.json"
        bad.write_text("{", encoding="utf-8")
        self.assertEqual(self.cli("submit", "native-a", "bad.json", expected=1)["status"], "rejected")
        after = self.cli("status")
        self.assertEqual(after["history"][-1]["event"], "rejected")
        self.assertIsNone(after["dispatch"])

        session, payload = self.producer(0)
        marker = "password=" + "fixture-marker"
        self.assertEqual(submit(self.root, self.state, self.rubrics, session, payload | {"note": marker}), "rejected")
        self.assertNotIn(marker, str(self.state))
        self.assertEqual(self.state["history"][-1]["event"], "rejected")


if __name__ == "__main__":
    unittest.main(verbosity=2)

