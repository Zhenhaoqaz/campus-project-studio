"""Back up or restore only the two isolated Campus Studio runtime databases.

This is a user-data backup, not the source/materials distribution archive.
No third-party packages or running application imports are required.
"""
from __future__ import annotations

import argparse
from contextlib import closing, contextmanager
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import sqlite3
import stat
import tempfile
import zipfile


FORMAT = "campus-workspace-backup"
FORMAT_VERSION = 1
DATABASES = ("campus_app.sqlite", "campus_knowledge.sqlite")
REQUIRED_TABLES = {
    "campus_app.sqlite": {"projects", "requirements", "tasks", "conversations", "messages", "runs", "plans"},
    "campus_knowledge.sqlite": {"documents", "chunks"},
}
MAX_DATABASE_BYTES = 4 * 1024**3
MAX_MANIFEST_BYTES = 1024**2
ROOT = Path(__file__).resolve().parents[1]


class BackupError(ValueError):
    """A backup was not safe or complete enough to proceed."""


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def hash_file(path: Path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024**2), b""):
            digest.update(block)
    return digest.hexdigest()


def open_readonly(path: Path):
    return sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True, timeout=30)


def inspect_database(path: Path, name: str):
    """Check the snapshot itself rather than trusting the archive's metadata."""
    try:
        with closing(open_readonly(path)) as connection:
            checks = connection.execute("PRAGMA integrity_check").fetchall()
            if checks != [("ok",)]:
                raise BackupError(f"{name} 未通过 SQLite 完整性检查")
            tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if not REQUIRED_TABLES[name].issubset(tables):
                raise BackupError(f"{name} 缺少课题工坊必需的数据表")
            schema = connection.execute(
                "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name"
            ).fetchall()
            schema_hash = hashlib.sha256(
                json.dumps(schema, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            ).hexdigest()
            version = connection.execute("PRAGMA user_version").fetchone()[0]
            return {"sqlite_user_version": version, "schema_sha256": schema_hash}
    except sqlite3.DatabaseError as error:
        raise BackupError(f"{name} 不是可读取的完整 SQLite 数据库") from error


def create_backup(source_data: Path | str, output: Path | str):
    source_data, output = Path(source_data).resolve(), Path(output).resolve()
    if not source_data.is_dir():
        raise BackupError("源数据目录不存在")
    if output.exists():
        raise BackupError("备份文件已存在，请使用新的文件名；不会覆盖旧备份")
    if not output.parent.is_dir():
        raise BackupError("备份输出的父目录不存在，请先创建它")
    for name in DATABASES:
        if not (source_data / name).is_file():
            raise BackupError(f"源数据缺少 {name}，无法创建完整工作空间备份")
    manifest = {
        "format": FORMAT,
        "format_version": FORMAT_VERSION,
        "created_at": utc_now(),
        "sqlite_runtime_version": sqlite3.sqlite_version,
        "databases": [],
    }
    with tempfile.TemporaryDirectory(prefix="campus-backup-", dir=output.parent) as folder:
        stage = Path(folder)
        for name in DATABASES:
            snapshot = stage / name
            # SQLite's backup API includes committed WAL changes without copying live WAL files.
            with closing(open_readonly(source_data / name)) as source, closing(sqlite3.connect(snapshot)) as target:
                source.backup(target, pages=128, sleep=0.05)
            metadata = inspect_database(snapshot, name)
            manifest["databases"].append({
                "name": name,
                "path": "databases/" + name,
                "bytes": snapshot.stat().st_size,
                "sha256": hash_file(snapshot),
                **metadata,
            })
        # Exclusive creation also protects against a same-name output created during snapshotting.
        try:
            with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
                for record in manifest["databases"]:
                    archive.write(stage / record["name"], record["path"])
        except FileExistsError as error:
            raise BackupError("备份文件名已被使用，没有覆盖现有文件") from error
    return {"archive": str(output), "bytes": output.stat().st_size, "manifest": manifest}


def validate_member(info: zipfile.ZipInfo):
    # ZipInfo normalizes backslashes on Windows and truncates NULs; inspect the original too.
    name = info.orig_filename
    path = PurePosixPath(name)
    if (
        not name
        or name != info.filename
        or "\\" in name
        or path.is_absolute()
        or ":" in name
        or any(part in ("..", ".", "") for part in name.split("/"))
    ):
        raise BackupError("备份含有不安全的归档路径，已拒绝还原")
    if info.is_dir() or stat.S_ISLNK(info.external_attr >> 16):
        raise BackupError("备份含有目录或符号链接条目，已拒绝还原")
    limit = MAX_MANIFEST_BYTES if name == "manifest.json" else MAX_DATABASE_BYTES
    if info.file_size > limit:
        raise BackupError("备份条目超过允许大小，已拒绝还原")


def read_manifest(archive: zipfile.ZipFile):
    infos = archive.infolist()
    names = [info.filename for info in infos]
    if len(names) != len(set(names)):
        raise BackupError("备份含有重复归档条目，无法确定应还原哪一份")
    for info in infos:
        validate_member(info)
    expected = {"manifest.json", *("databases/" + name for name in DATABASES)}
    if set(names) != expected:
        raise BackupError("备份文件清单不匹配，只接受 manifest 与两份课题工坊数据库")
    try:
        manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
        if manifest["format"] != FORMAT or type(manifest["format_version"]) is not int or manifest["format_version"] != FORMAT_VERSION:
            raise BackupError("不支持此备份格式或版本")
        records = manifest["databases"]
        if not isinstance(records, list) or len(records) != len(DATABASES):
            raise BackupError("备份数据库清单不完整")
        if {record["name"] for record in records} != set(DATABASES):
            raise BackupError("备份数据库名称不匹配")
        for record in records:
            if record["path"] != "databases/" + record["name"]:
                raise BackupError("备份 manifest 含有无效数据库路径")
            for key in ("sha256", "schema_sha256"):
                value = record[key]
                if not isinstance(value, str) or len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
                    raise BackupError("备份 manifest 的哈希字段无效")
            if type(record["bytes"]) is not int or not 0 < record["bytes"] <= MAX_DATABASE_BYTES:
                raise BackupError("备份 manifest 的数据库大小无效")
            if type(record["sqlite_user_version"]) is not int or record["sqlite_user_version"] < 0:
                raise BackupError("备份 manifest 的数据库版本无效")
        if not isinstance(manifest["created_at"], str):
            raise BackupError("备份缺少创建时间")
        return manifest
    except (KeyError, TypeError, UnicodeError, json.JSONDecodeError) as error:
        raise BackupError("备份 manifest 不完整或格式错误") from error


@contextmanager
def verified_snapshot(archive_path: Path | str, temporary_parent: Path):
    archive_path = Path(archive_path).resolve()
    if not archive_path.is_file():
        raise BackupError("备份文件不存在")
    with tempfile.TemporaryDirectory(prefix="campus-restore-check-", dir=temporary_parent) as folder:
        stage = Path(folder)
        try:
            with zipfile.ZipFile(archive_path, "r") as archive:
                manifest = read_manifest(archive)
                for record in manifest["databases"]:
                    destination = stage / record["name"]
                    with archive.open(record["path"], "r") as source, destination.open("xb") as target:
                        shutil.copyfileobj(source, target, length=1024**2)
                    if destination.stat().st_size != record["bytes"] or hash_file(destination) != record["sha256"]:
                        raise BackupError(f"{record['name']} 的大小或 SHA-256 不匹配，备份可能损坏")
                    metadata = inspect_database(destination, record["name"])
                    if any(metadata[key] != record[key] for key in metadata):
                        raise BackupError(f"{record['name']} 的 schema 或数据库版本与 manifest 不匹配")
        except (zipfile.BadZipFile, RuntimeError) as error:
            raise BackupError("备份 ZIP 无法读取或校验失败") from error
        yield stage, manifest


def verify_backup(archive_path: Path | str):
    archive_path = Path(archive_path).resolve()
    with verified_snapshot(archive_path, archive_path.parent) as (_, manifest):
        return {"verified": True, "archive": str(archive_path), "manifest": manifest}


def restore_backup(archive_path: Path | str, target_data: Path | str):
    requested = Path(target_data)
    if requested.is_symlink():
        raise BackupError("目标数据目录不能是符号链接")
    target = requested.resolve()
    if not target.parent.is_dir():
        raise BackupError("目标数据目录的父目录不存在，请先创建它")
    if target.exists() and (not target.is_dir() or any(target.iterdir())):
        raise BackupError("--target-data 必须是新的空目录；不会覆盖或合并原数据")
    with verified_snapshot(archive_path, target.parent) as (stage, manifest):
        # Validate first, and re-check immediately before writing anything to the target.
        if target.exists():
            if not target.is_dir() or any(target.iterdir()):
                raise BackupError("目标目录在验证期间发生变化，已停止还原")
        else:
            target.mkdir()
        for name in DATABASES:
            # The exclusive target open refuses every file overwrite, including a concurrent write.
            with (stage / name).open("rb") as source, (target / name).open("xb") as destination:
                shutil.copyfileobj(source, destination, length=1024**2)
        with (target / "backup_manifest.json").open("x", encoding="utf-8") as output:
            json.dump({**manifest, "restored_at": utc_now()}, output, ensure_ascii=False, indent=2)
    return {"restored": True, "target_data": str(target), "environment_variable": "CAMPUS_DATA_DIR"}


def main(argv=None):
    parser = argparse.ArgumentParser(description="课题工坊独立运行数据备份与还原")
    sub = parser.add_subparsers(dest="command", required=True)
    backup = sub.add_parser("backup", help="创建运行数据备份，不包含源码、依赖或配置")
    backup.add_argument("--source-data", type=Path, default=ROOT / "data")
    backup.add_argument("--output", required=True, type=Path)
    verify = sub.add_parser("verify", help="只验证备份，不还原")
    verify.add_argument("--archive", required=True, type=Path)
    restore = sub.add_parser("restore", help="校验后还原到新的空目录")
    restore.add_argument("--archive", required=True, type=Path)
    restore.add_argument("--target-data", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        if args.command == "backup":
            result = create_backup(args.source_data, args.output)
        elif args.command == "verify":
            result = verify_backup(args.archive)
        else:
            result = restore_backup(args.archive, args.target_data)
    except (BackupError, OSError) as error:
        parser.exit(2, f"操作未完成：{error}\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    main()
