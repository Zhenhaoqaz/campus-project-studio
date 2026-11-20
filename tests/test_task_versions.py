import importlib
import pytest
from fastapi.testclient import TestClient
from backend import db, rag
from backend.tasks import task_snapshot

server = importlib.import_module('backend.app')


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, 'DB', tmp_path / 'app.sqlite')
    monkeypatch.setattr(rag, 'INDEX', tmp_path / 'knowledge.sqlite')
    with TestClient(server.app) as value:
        yield value


def fixture_task(client):
    pid = client.post('/api/projects', json={'name': '并发编辑演练'}).json()['id']
    rid = client.post(f'/api/projects/{pid}/requirements', json={'text': '核心流程', 'kind': 'teacher'}).json()['id']
    created = client.post(f'/api/projects/{pid}/tasks', json={'title': '联调', 'description': '原说明', 'acceptance': '原验收', 'requirement_ids': [rid]}).json()
    assert created['version'] == client.get(f'/api/projects/{pid}').json()['tasks'][0]['version']
    return pid, created['id']


def read_task(client, pid):
    return client.get(f'/api/projects/{pid}').json()['tasks'][0]


def test_stale_editor_cannot_overwrite_newer_fields_and_receives_current_record(client):
    pid, tid = fixture_task(client)
    original = read_task(client, pid)
    newer = {**original, 'description': '另一窗口的新说明', 'acceptance': '新验收', 'expected_version': original['version']}
    assert client.put(f'/api/projects/{pid}/tasks/{tid}', json=newer).status_code == 200
    current = read_task(client, pid)
    assert current['version'] != original['version']
    stale = client.put(f'/api/projects/{pid}/tasks/{tid}', json={**original, 'status': 'doing', 'expected_version': original['version']})
    assert stale.status_code == 409
    detail = stale.json()['detail']
    assert detail['code'] == 'task_changed' and detail['current'] == current
    assert read_task(client, pid) == current


def test_status_patch_changes_only_status_and_rejects_stale_versions(client):
    pid, tid = fixture_task(client)
    original = read_task(client, pid)
    path = f'/api/projects/{pid}/tasks/{tid}/status'
    changed = client.patch(path, json={'status': 'doing', 'expected_version': original['version']})
    assert changed.status_code == 200
    saved = changed.json()
    assert saved['status'] == 'doing' and saved['version'] != original['version']
    for field in ['title', 'description', 'acceptance', 'requirement_ids', 'dependencies', 'priority']:
        assert saved[field] == original[field]
    assert client.patch(path, json={'status': 'done', 'expected_version': original['version']}).status_code == 409
    assert read_task(client, pid) == saved
    assert client.patch(path, json={'status': 'done', 'expected_version': saved['version'], 'description': '不允许夹带'}).status_code == 422


def test_status_patch_keeps_dependency_rules_and_project_ownership(client):
    pid, tid = fixture_task(client)
    dependent = client.post(f'/api/projects/{pid}/tasks', json={'title': '后续', 'dependencies': [tid]}).json()['id']
    task = client.get(f'/api/projects/{pid}').json()['tasks'][1]
    path = f'/api/projects/{pid}/tasks/{dependent}/status'
    assert client.patch(path, json={'status': 'done', 'expected_version': task['version']}).status_code == 409
    other = client.post('/api/projects', json={'name': '另一项目'}).json()['id']
    assert client.patch(f'/api/projects/{other}/tasks/{dependent}/status', json={'status': 'doing', 'expected_version': task['version']}).status_code == 404
    assert client.patch(path, json={'status': 'doing'}).status_code == 422
    assert client.patch(path, json={'status': 'doing', 'expected_version': 'bad'}).status_code == 422


def test_legacy_put_is_compatible_and_versions_normalize_persisted_links(client):
    pid, tid = fixture_task(client)
    original = read_task(client, pid)
    persisted = db.one('SELECT * FROM tasks WHERE id=?', (tid,))
    assert task_snapshot(persisted)['version'] == original['version']
    assert client.put(f'/api/projects/{pid}/tasks/{tid}', json={'title': '旧脚本仍可编辑', 'acceptance': '人工标准'}).status_code == 200
    saved = read_task(client, pid)
    assert saved['requirement_ids'] == original['requirement_ids']
    assert saved['version'] != original['version']


def test_project_and_requirement_edits_reject_stale_records(client):
    pid, _ = fixture_task(client)
    path = f'/api/projects/{pid}'
    original = client.get(path).json()
    assert client.put(path, json={**original, 'brief': '第二窗口的新简报', 'expected_version': original['version']}).status_code == 200
    stale = client.put(path, json={**original, 'brief': '过期输入', 'expected_version': original['version']})
    assert stale.status_code == 409
    assert stale.json()['detail']['current']['brief'] == '第二窗口的新简报'
    requirement = original['requirements'][0]
    path += '/requirements/' + requirement['id']
    body = {**requirement, 'expected_version': requirement['version']}
    assert client.put(path, json={**body, 'text': '新原文'}).status_code == 200
    stale = client.put(path, json={**body, 'text': '过期原文'})
    assert stale.status_code == 409
    assert stale.json()['detail']['current']['text'] == '新原文'


def test_delete_rechecks_new_links_new_records_and_conversation_rename(client):
    pid, _ = fixture_task(client)
    path = f'/api/projects/{pid}'
    assert client.post(path + '/conversations', json={'title': '原会话'}).status_code == 201
    before = client.get(path).json()
    conversation = before['conversations'][0]
    requirement = before['requirements'][0]
    req_path = path + '/requirements/' + requirement['id']
    conv_path = '/api/conversations/' + conversation['id']
    assert client.post(path + '/tasks', json={'title': '新关联', 'requirement_ids': [requirement['id']]}).status_code == 201
    assert client.delete(req_path, params={'expected_version': requirement['delete_version']}).status_code == 409
    assert client.delete(path, params={'expected_version': before['delete_version']}).status_code == 409
    assert client.patch(conv_path, json={'title': '最新会话', 'expected_version': conversation['version']}).status_code == 200
    assert client.delete(conv_path, params={'expected_version': conversation['delete_version']}).status_code == 409
    current = client.get(path).json()
    assert len(current['tasks']) == 2 and current['conversations'][0]['title'] == '最新会话'
    assert client.delete(req_path, params={'expected_version': current['requirements'][0]['delete_version']}).status_code == 200
    assert all(not task['requirement_ids'] for task in client.get(path).json()['tasks'])
