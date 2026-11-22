"""Storage and evidence for the managed requirement loop."""

import contextlib
import hashlib
import json
import os
import re
import tempfile
import stat
import subprocess
from pathlib import Path

import yaml


class LoopError(ValueError):
    pass


YAML_LIMIT = 16 * 1024 * 1024
EVIDENCE_LIMIT = 4 * 1024 * 1024
EVIDENCE_TOTAL_LIMIT = 32 * 1024 * 1024
EVIDENCE_REFERENCE_LIMIT = 128


def digest(value):
    data = json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False)
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def file_hash(path):
    checksum = hashlib.sha256()
    if not stat.S_ISREG(path.stat().st_mode):
        raise LoopError("No se puede calcular la huella de un archivo no regular")
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(65536), b""):
            checksum.update(chunk)
    return checksum.hexdigest()


class StrictLoader(yaml.SafeLoader):
    def construct_mapping(self, node, deep=False):
        mapping = {}
        for key_node, value_node in node.value:
            key = self.construct_object(key_node, deep=deep)
            if key in mapping:
                raise LoopError(f"Clave YAML duplicada: {key}")
            mapping[key] = self.construct_object(value_node, deep=deep)
        return mapping


def read_yaml(path):
    return yaml.load(checked_bytes(path, YAML_LIMIT).decode("utf-8-sig"), Loader=StrictLoader)


def write_yaml(path, data):
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as stream:
        temporary = Path(stream.name)
        try:
            yaml.safe_dump(data, stream, sort_keys=False, allow_unicode=True)
            stream.flush()
            if stream.tell() > YAML_LIMIT:
                raise LoopError("Estado YAML excede el límite permitido")
            os.fsync(stream.fileno())
        except BaseException:
            stream.close()
            temporary.unlink()
            raise
    try:
        os.replace(temporary, path)
        if os.name != "nt":
            descriptor = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
    finally:
        temporary.unlink(missing_ok=True)


@contextlib.contextmanager
def locked(path):
    if path.exists() and not stat.S_ISREG(path.stat().st_mode):
        raise LoopError("El archivo de exclusión debe ser regular")
    with path.open("a+b") as stream:
        if os.name == "nt":
            import msvcrt

            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl

            fcntl.flock(stream, fcntl.LOCK_EX)
        try:
            yield
        finally:
            if os.name == "nt":
                stream.seek(0)
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream, fcntl.LOCK_UN)


def resolve_file(root, name):
    if not isinstance(name, str) or not name or "\\" in name:
        raise LoopError("Se requiere una ruta relativa con separadores /")
    candidate = root / name
    relative = Path(name)
    if (
        relative.is_absolute() or relative.drive or ".." in relative.parts
        or any(part in {".git", ".env", "handoff.yaml", "loop-state.yaml"}
               or part.startswith(".env.") for part in relative.parts)
    ):
        raise LoopError(f"Ruta de evidencia no permitida: {name}")
    canonical_path(root, candidate)
    try:
        resolved = candidate.resolve(strict=True)
    except OSError as error:
        raise LoopError(f"No se encontró el artefacto: {name}") from error
    if (
        not resolved.is_relative_to(root) or not stat.S_ISREG(resolved.stat().st_mode)
        or resolved.relative_to(root).as_posix() != name
    ):
        raise LoopError(f"Ruta de evidencia no canónica: {name}")
    return resolved


def canonical_path(root, path):
    if not path.is_relative_to(root) or path.resolve() != path or path.is_symlink():
        raise LoopError("Ruta de trabajo no canónica")
    for part in (path, *path.parents):
        if part == root:
            break
        try:
            info = part.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT:
            raise LoopError("Ruta de trabajo con enlace o punto de reanálisis")
    return path


def checked_bytes(path, limit, root=None):
    if root is not None:
        canonical_path(root, path)
    expected = path.lstat()
    if (
        not stat.S_ISREG(expected.st_mode) or expected.st_size > limit
        or getattr(expected, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT
    ):
        raise LoopError("Archivo no regular o supera el límite permitido")
    flag = getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_BINARY", 0) | getattr(os, "O_NONBLOCK", 0)
    with os.fdopen(os.open(path, os.O_RDONLY | flag), "rb") as stream:
        opened = os.fstat(stream.fileno())
        if not stat.S_ISREG(opened.st_mode) or not os.path.samestat(expected, opened):
            raise LoopError("El archivo cambió al abrirlo")
        data = stream.read(limit + 1)
        after = os.fstat(stream.fileno())
    if root is not None:
        canonical_path(root, path)
    current = path.lstat()
    if (
        len(data) > limit or not os.path.samestat(opened, current)
        or (opened.st_size, opened.st_mtime_ns, opened.st_ctime_ns)
        != (after.st_size, after.st_mtime_ns, after.st_ctime_ns)
        or (expected.st_size, expected.st_mtime_ns, expected.st_ctime_ns)
        != (current.st_size, current.st_mtime_ns, current.st_ctime_ns)
    ):
        raise LoopError("El archivo cambió durante su lectura o supera el límite")
    return data


def requirement_specs(root, requirement):
    directory = canonical_path(root, root / "specs/features")
    matches = [
        canonical_path(root, path) for path in directory.iterdir()
        if path.name.casefold() == f"{requirement.lower()}.md"
    ]
    if len(matches) > 1:
        raise LoopError(f"Especificaciones ambiguas para {requirement}")
    if matches and not matches[0].is_file():
        raise LoopError(f"Especificación no válida para {requirement}")
    return matches


class EvidenceBudget:
    def __init__(self, scan_text):
        self.scan_text = scan_text
        self.references = 0
        self.size = 0

    def read(self, root, path):
        self.references += 1
        if self.references > EVIDENCE_REFERENCE_LIMIT:
            raise LoopError("Demasiadas referencias de evidencia")
        data = checked_bytes(path, min(EVIDENCE_LIMIT, EVIDENCE_TOTAL_LIMIT - self.size), root)
        self.size += len(data)
        try:
            content = data.decode("utf-8-sig")
        except UnicodeDecodeError as error:
            raise LoopError("La evidencia con líneas debe ser texto UTF-8 depurado") from error
        self.scan_text(content)
        return data


def verify_reference(root, ref, budget):
    if not isinstance(ref, dict) or set(ref) != {"path", "locator", "sha256"}:
        raise LoopError("Evidencia requiere path, locator y sha256")
    path = resolve_file(root, ref["path"])
    data = budget.read(root, path)
    if ref["sha256"] != hashlib.sha256(data).hexdigest():
        raise LoopError(f"Huella de evidencia incompatible: {ref['path']}")
    locator = ref["locator"]
    match = re.fullmatch(r"L([1-9][0-9]*)(?:-L([1-9][0-9]*))?", locator) if isinstance(locator, str) else None
    if match is None:
        raise LoopError("Localizador de evidencia inválido. Use L1 o L1-L2")
    start = int(match[1])
    end = int(match[2] or match[1])
    line_count = data.count(b"\n") + bool(data and not data.endswith(b"\n"))
    if end < start or line_count < end:
        raise LoopError(f"Localizador fuera del artefacto: {ref['path']}:{locator}")


def snapshot(root, names):
    return {name: file_hash(resolve_file(root, name)) for name in sorted(set(names))}


def changed(root, files):
    for name, expected in files.items():
        try:
            path = canonical_path(root, root / name)
            actual = None if not path.exists() else file_hash(path)
        except (LoopError, OSError):
            return True
        if actual != expected:
            return True
    return False


def git(root, *args):
    try:
        completed = subprocess.run(
            ["git", "-C", str(root), *args], capture_output=True, check=True, timeout=15,
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise LoopError("No se pudo verificar la línea base de Git") from error
    return completed.stdout


def product_baseline(root):
    git_root = Path(os.fsdecode(git(root, "rev-parse", "--show-toplevel")).strip()).resolve()
    if git_root != root:
        raise LoopError("El workspace debe coincidir con la raíz Git")
    return git(root, "rev-parse", "--verify", "HEAD^{commit}").decode("ascii").strip()


def product_inventory(root, baseline, requirement):
    require_clean_index(root)
    if not isinstance(baseline, str) or not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", baseline):
        raise LoopError("Línea base Git inválida")
    flags = ("--no-ext-diff", "--no-textconv", "--no-renames", "--name-only", "-z", baseline, "--")
    options = () if os.name == "nt" else ("-c", "core.fileMode=true")
    tracked = git(root, *options, "diff", *flags)
    untracked = git(root, "ls-files", "--others", "--exclude-standard", "-z")
    control = f"docs/implementacion/requerimientos/{requirement}"
    control_files = {
        "project-manifest.yaml", "handoff.yaml", ".requirement-handoff.lock",
        f"{control}/loop-state.yaml", f"{control}/.loop-state.lock",
    }
    control_directories = (f"{control}/evidence/", f"{control}/results/")
    paths = (os.fsdecode(item) for item in (tracked + untracked).split(b"\0") if item)
    return sorted({
        path for path in paths if path not in control_files and not path.startswith(control_directories)
    })


def require_clean_index(root):
    if git(root, "diff", "--cached", "--no-ext-diff", "--no-textconv", "--name-only", "-z", "HEAD", "--"):
        raise LoopError("El índice Git contiene cambios staged; la revisión usa el worktree")


def product_modes(root, names):
    index_modes = {}
    if os.name == "nt":
        for entry in git(root, "ls-files", "--stage", "-z").split(b"\0"):
            if entry:
                metadata, name = entry.split(b"\t", 1)
                mode, _, stage = metadata.split()
                if stage == b"0":
                    index_modes[os.fsdecode(name)] = mode.decode("ascii")
    modes = {}
    for name in names:
        path = canonical_path(root, root / name)
        if not path.exists():
            modes[name] = None
            continue
        info = path.stat()
        if not stat.S_ISREG(info.st_mode):
            raise LoopError("Archivo de producto no regular")
        mode = index_modes.get(name, "100644") if os.name == "nt" else (
            "100755" if info.st_mode & stat.S_IXUSR else "100644"
        )
        if mode not in {"100644", "100755"}:
            raise LoopError("Modo Git de producto no admitido")
        modes[name] = mode
    return modes


def snapshot_product(root, names):
    result = {}
    for name in names:
        path = canonical_path(root, root / name)
        result[name] = file_hash(path) if path.exists() else None
    return result

