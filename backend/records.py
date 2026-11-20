"""Versioned snapshots for record edits and their deletion impact."""
import hashlib
import json

from fastapi import HTTPException


def digest(value):
    text = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(text.encode()).hexdigest()


def project_record(row):
    record = dict(row)
    return {**record, 'version': digest(record)}


def requirement_record(conn, row):
    record = dict(row)
    linked = [
        task['id'] for task in conn.execute(
            'SELECT id,requirement_ids FROM tasks WHERE project_id=? ORDER BY id',
            (record['project_id'],))
        if record['id'] in json.loads(task['requirement_ids'])
    ]
    return {**record, 'version': digest(record), 'delete_version': digest([record, linked]),
            'linked_task_count': len(linked)}


def conversation_record(conn, row):
    record = dict(row)
    cid = record['id']
    runs = [tuple(item) for item in conn.execute(
        'SELECT id,status FROM runs WHERE conversation_id=? ORDER BY id', (cid,))]
    plans = [tuple(item) for item in conn.execute(
        'SELECT p.id,p.status FROM plans p JOIN runs r ON r.id=p.run_id '
        'WHERE r.conversation_id=? ORDER BY p.id', (cid,))]
    last_event = conn.execute(
        'SELECT MAX(e.id) FROM events e JOIN runs r ON r.id=e.run_id WHERE r.conversation_id=?',
        (cid,)).fetchone()[0]
    return {**record, 'version': digest(record), 'delete_version': digest([record, runs, plans, last_event])}


def project_delete_version(conn, pid):
    records = []
    for table in ('projects', 'requirements', 'tasks', 'plans'):
        column = 'id' if table == 'projects' else 'project_id'
        records.append([dict(row) for row in conn.execute(
            f'SELECT * FROM {table} WHERE {column}=? ORDER BY id', (pid,))])
    records.append([conversation_record(conn, row) for row in conn.execute(
        'SELECT * FROM conversations WHERE project_id=? ORDER BY id', (pid,))])
    return digest(records)


def check_version(current, expected, code):
    if expected is not None and expected != current['version']:
        message = ('记录或删除影响已变化。请刷新后核对，再决定是否删除。'
                   if code == 'delete_changed' else '其他窗口已更新记录。请比较改动后重新保存。')
        raise HTTPException(409, {'code': code, 'message': message, 'current': current})
