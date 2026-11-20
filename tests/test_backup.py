import hashlib
import json
from pathlib import Path
import sqlite3
import warnings
import zipfile

import pytest

from scripts.backup_workspace import (
    BackupError,
    DATABASES,
    REQUIRED_TABLES,
    create_backup,
    restore_backup,
    verify_backup,
)


@pytest.fixture
def workspace(tmp_path):
    data=tmp_path/'source-data'
    data.mkdir()
    for filename in DATABASES:
        with sqlite3.connect(data/filename) as connection:
            for table in REQUIRED_TABLES[filename]:
                connection.execute(f'CREATE TABLE {table}(id TEXT PRIMARY KEY,value TEXT)')
            table='projects' if filename=='campus_app.sqlite' else 'documents'
            connection.execute(f'INSERT INTO {table} VALUES(?,?)',('sample','独立测试内容'))
            connection.execute('PRAGMA user_version=7')
    return data


def rewrite_backup(source,destination,transform,extras=()):
    with zipfile.ZipFile(source) as archive:
        entries={info.filename:archive.read(info.filename) for info in archive.infolist()}
    transform(entries)
    with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED) as archive:
        for name,value in entries.items():
            archive.writestr(name,value)
        for name,value in extras:
            member=zipfile.ZipInfo()
            member.filename=name
            archive.writestr(member,value)
    return destination


def test_backup_includes_committed_wal_and_restores_into_new_directory(workspace,tmp_path):
    (workspace/'.env').write_text('SECRET=should-not-be-in-backup',encoding='utf-8')
    (workspace/'node_modules').mkdir()
    connection=sqlite3.connect(workspace/'campus_app.sqlite')
    try:
        connection.execute('PRAGMA journal_mode=WAL')
        connection.execute('INSERT INTO projects VALUES(?,?)',('wal-row','尚未checkpoint的已提交内容'))
        connection.commit()
        assert (workspace/'campus_app.sqlite-wal').exists()
        result=create_backup(workspace,tmp_path/'snapshot.zip')
    finally:
        connection.close()
    manifest=result['manifest']
    assert manifest['format_version']==1
    assert len(manifest['databases'])==2 and manifest['created_at']
    assert all(record['sqlite_user_version']==7 for record in manifest['databases'])
    with zipfile.ZipFile(result['archive']) as archive:
        assert set(archive.namelist())=={'manifest.json','databases/campus_app.sqlite','databases/campus_knowledge.sqlite'}
    assert verify_backup(result['archive'])['verified']
    target=tmp_path/'restored'
    restored=restore_backup(result['archive'],target)
    assert restored['restored'] and restored['environment_variable']=='CAMPUS_DATA_DIR'
    with sqlite3.connect(target/'campus_app.sqlite') as connection:
        assert connection.execute("SELECT value FROM projects WHERE id='wal-row'").fetchone()[0]=='尚未checkpoint的已提交内容'
    assert (target/'backup_manifest.json').exists()
    assert (workspace/'.env').read_text(encoding='utf-8')=='SECRET=should-not-be-in-backup'


def test_backup_will_not_overwrite_existing_archive(workspace,tmp_path):
    target=tmp_path/'existing.zip'
    target.write_bytes(b'keep-original')
    with pytest.raises(BackupError,match='不会覆盖'):
        create_backup(workspace,target)
    assert target.read_bytes()==b'keep-original'


def test_restore_refuses_nonempty_target_and_preserves_existing_files(workspace,tmp_path):
    archive=tmp_path/'snapshot.zip'
    create_backup(workspace,archive)
    target=tmp_path/'restored'
    target.mkdir()
    (target/'keep.txt').write_text('original',encoding='utf-8')
    with pytest.raises(BackupError,match='新的空目录'):
        restore_backup(archive,target)
    assert list(target.iterdir())==[target/'keep.txt']
    assert (target/'keep.txt').read_text(encoding='utf-8')=='original'


@pytest.mark.parametrize('unsafe',['../escape.txt','/absolute.txt','C:/absolute.txt','databases\\escape.txt','databases/../escape.txt'])
def test_restore_rejects_zip_path_traversal_before_creating_target(workspace,tmp_path,unsafe):
    source=tmp_path/'snapshot.zip'
    create_backup(workspace,source)
    bad=rewrite_backup(source,tmp_path/'unsafe.zip',lambda entries:None,[(unsafe,b'bad')])
    target=tmp_path/'restored'
    with pytest.raises(BackupError,match='不安全'):
        restore_backup(bad,target)
    assert not target.exists()
    assert not (tmp_path/'escape.txt').exists()


def test_restore_rejects_duplicate_archive_members(workspace,tmp_path):
    source=tmp_path/'snapshot.zip'
    create_backup(workspace,source)
    with warnings.catch_warnings():
        warnings.simplefilter('ignore',UserWarning)
        bad=rewrite_backup(source,tmp_path/'duplicate.zip',lambda entries:None,[('manifest.json',b'{}')])
    with pytest.raises(BackupError,match='重复归档'):
        restore_backup(bad,tmp_path/'restored')


def test_restore_rejects_database_hash_change_before_target_write(workspace,tmp_path):
    source=tmp_path/'snapshot.zip'
    create_backup(workspace,source)
    def change(entries):
        entries['databases/campus_app.sqlite']+=b'tamper'
    bad=rewrite_backup(source,tmp_path/'hash-change.zip',change)
    target=tmp_path/'restored'
    with pytest.raises(BackupError,match='SHA-256'):
        restore_backup(bad,target)
    assert not target.exists()


def test_restore_checks_database_integrity_even_with_matching_hash(workspace,tmp_path):
    source=tmp_path/'snapshot.zip'
    create_backup(workspace,source)
    def change(entries):
        broken=b'not a sqlite database'
        entries['databases/campus_app.sqlite']=broken
        manifest=json.loads(entries['manifest.json'])
        record=next(r for r in manifest['databases'] if r['name']=='campus_app.sqlite')
        record['sha256']=hashlib.sha256(broken).hexdigest()
        record['bytes']=len(broken)
        entries['manifest.json']=json.dumps(manifest).encode()
    bad=rewrite_backup(source,tmp_path/'invalid-db.zip',change)
    with pytest.raises(BackupError,match='SQLite'):
        restore_backup(bad,tmp_path/'restored')


def test_restore_checks_schema_and_manifest_version(workspace,tmp_path):
    source=tmp_path/'snapshot.zip'
    create_backup(workspace,source)
    def change_schema(entries):
        manifest=json.loads(entries['manifest.json'])
        manifest['databases'][0]['schema_sha256']='0'*64
        entries['manifest.json']=json.dumps(manifest).encode()
    bad=rewrite_backup(source,tmp_path/'wrong-schema.zip',change_schema)
    with pytest.raises(BackupError,match='schema'):
        verify_backup(bad)
    def change_version(entries):
        manifest=json.loads(entries['manifest.json'])
        manifest['format_version']=999
        entries['manifest.json']=json.dumps(manifest).encode()
    bad=rewrite_backup(source,tmp_path/'wrong-version.zip',change_version)
    with pytest.raises(BackupError,match='版本'):
        verify_backup(bad)


def test_restore_allows_existing_empty_target(workspace,tmp_path):
    source=tmp_path/'snapshot.zip'
    create_backup(workspace,source)
    target=tmp_path/'restored'
    target.mkdir()
    restore_backup(source,target)
    assert {p.name for p in target.iterdir()}=={*DATABASES,'backup_manifest.json'}
