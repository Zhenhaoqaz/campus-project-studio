"""Stable task snapshots for optimistic editing, without a database migration."""
import hashlib
import json

EDITABLE_FIELDS = ('title', 'description', 'status', 'priority', 'acceptance', 'dependencies', 'requirement_ids')


def task_snapshot(row):
    task = dict(row)
    for name in ('dependencies', 'requirement_ids'):
        if isinstance(task[name], str):
            task[name] = json.loads(task[name])
    content = {'id': task['id'], 'project_id': task['project_id'],
               **{name: task[name] for name in EDITABLE_FIELDS}}
    serialized = json.dumps(content, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    task['version'] = hashlib.sha256(serialized.encode()).hexdigest()
    return task
