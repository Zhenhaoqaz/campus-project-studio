import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from .config import DB

def now():
    return datetime.now(timezone.utc).isoformat()

def uid():
    return uuid.uuid4().hex

def dump(value):
    return json.dumps(value, ensure_ascii=False)

@contextmanager
def connect():
    db = sqlite3.connect(DB, timeout=20)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    try:
        yield db
        db.commit()
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()

def one(sql, args=()):
    with connect() as db:
        row = db.execute(sql, args).fetchone()
        return dict(row) if row else None

def rows(sql, args=()):
    with connect() as db:
        return [dict(r) for r in db.execute(sql, args)]

def execute(sql, args=()):
    with connect() as db:
        db.execute(sql, args)

def init(*, recover_runs=True):
    with connect() as db:
        db.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,course TEXT NOT NULL,brief TEXT NOT NULL,deadline TEXT,skills TEXT NOT NULL,budget TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS requirements(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,text TEXT NOT NULL,kind TEXT NOT NULL,source TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,title TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,request_id TEXT NOT NULL UNIQUE,mode TEXT NOT NULL,status TEXT NOT NULL,error TEXT,created_at TEXT NOT NULL,finished_at TEXT);
        CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,role TEXT NOT NULL,content TEXT NOT NULL,status TEXT NOT NULL,evidence TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,type TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS plans(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,content TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL,title TEXT NOT NULL,description TEXT NOT NULL,status TEXT NOT NULL,priority TEXT NOT NULL,acceptance TEXT NOT NULL,requirement_ids TEXT NOT NULL DEFAULT '[]',dependencies TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id,created_at);
        CREATE INDEX IF NOT EXISTS events_run ON events(run_id,id);
        CREATE INDEX IF NOT EXISTS tasks_project ON tasks(project_id);
        CREATE TABLE IF NOT EXISTS run_task_scope(
            run_id TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
            requested TEXT NOT NULL,
            actual TEXT
        );
        ''')
        if recover_runs:
            db.execute("UPDATE runs SET status='failed',error='服务重启，运行已中断',finished_at=? WHERE status IN ('queued','running')", (now(),))
            db.execute("UPDATE messages SET status='interrupted' WHERE status='streaming'")
        if db.execute('SELECT COUNT(*) FROM projects').fetchone()[0]:
            return
        pid = 'campus-demo'
        db.execute('INSERT INTO projects VALUES(?,?,?,?,?,?,?,?)', (pid,'校园失物招领','Web 程序设计','面向校内同学的失物招领应用：让丢失物品的人与捡到物品的人更容易找到彼此。先做好列表、筛选、发布和认领状态。',None,'基础 HTML / CSS / JavaScript，正在学习 React','每周约 6 小时；先完成最小可演示版本',now()))
        requirements = [
            ('实现一个 Web 应用，使用 HTML + CSS + JavaScript，或 React / Vue 技术组合。','teacher','教师验收截图'),
            ('个人项目展示不超过 8 分钟，介绍背景、概要设计、关键技术和使用方法。','teacher','教师验收截图'),
            ('评价指标包括项目技术难度、界面美观度和报告演讲水平。','teacher','教师验收截图'),
            ('第 12—14 周验收，具体公历日期待确认。','teacher','教师验收截图'),
            ('第 15 周之前提交个人项目报告，PDF 格式，文件名为学号。','teacher','教师验收截图'),
            ('优先完成发布、列表筛选、详情和认领状态；暂不做即时聊天。','personal','演示项目的个人范围约束'),
        ]
        for i,(text,kind,source) in enumerate(requirements,1):
            db.execute('INSERT INTO requirements VALUES(?,?,?,?,?)',(f'demo-r{i}',pid,text,kind,source))
        demo_tasks = [
            ('梳理页面与数据结构','画出列表、详情、发布三个页面，明确物品字段。','done','high','能说明三个页面的跳转及物品字段。'),
            ('搭建 React 页面骨架','建立导航、基础组件与统一样式。','doing','high','三个页面能够切换，窄屏可以正常阅读。'),
            ('实现物品列表与筛选','按类别与丢失/拾获状态筛选物品。','todo','high','筛选条件可组合，无结果时显示空状态。'),
            ('完成发布表单','提供标题、描述、地点、类别等输入及校验。','todo','medium','必填项缺失时有提示，成功提交后列表可见。'),
            ('实现详情与认领状态','展示物品详情，支持更新认领状态。','todo','medium','更新状态后刷新仍能恢复。'),
            ('准备演示与课程报告','整理截图、技术说明和 8 分钟以内演示。','todo','medium','演示覆盖完整流程，报告按模板导出为 PDF。'),
        ]
        for title,desc,status,priority,acceptance in demo_tasks:
            db.execute('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?)',(uid(),pid,None,title,desc,status,priority,acceptance,'[]','[]',now()))
