import pytest
from backend import db
from backend.streaming import TextAccumulator,save_message_event

def test_first_delta_immediate_and_later_deltas_batched():
    clock=[0.0]
    buffer=TextAccumulator(clock=lambda:clock[0])
    assert buffer.add('你')=='你'
    assert buffer.add('好') is None
    clock[0]=.1
    assert buffer.add('，同学')=='好，同学'
    assert buffer.content=='你好，同学'
    assert buffer.flush() is None

def test_pending_text_not_lost_at_stream_end_or_failure():
    buffer=TextAccumulator(clock=lambda:0)
    assert buffer.add('第一块')=='第一块'
    assert buffer.add('最后一块') is None
    assert buffer.flush()=='最后一块'
    assert buffer.content=='第一块最后一块'

def test_message_and_event_commit_or_rollback_together(tmp_path,monkeypatch):
    monkeypatch.setattr(db,'DB',tmp_path/'atomic.sqlite')
    db.init()
    db.execute('INSERT INTO conversations VALUES(?,?,?,?)',('conv','campus-demo','原子验证',db.now()))
    db.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?,?)',('run','conv','campus-demo','atomic-test','chat','running',None,db.now(),None))
    db.execute('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)',('msg','conv','run','assistant','旧内容','streaming','[]',db.now()))
    save_message_event('run','msg','新内容','streaming','message.delta',{'text':'新内容'})
    assert db.one('SELECT content FROM messages WHERE id=?',('msg',))['content']=='新内容'
    assert db.one('SELECT COUNT(*) n FROM events')['n']==1
    db.execute("CREATE TRIGGER fail_event BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'simulated storage failure'); END")
    with pytest.raises(Exception,match='simulated storage failure'):
        save_message_event('run','msg','不应单独保存','complete','role.completed',{})
    assert db.one('SELECT content FROM messages WHERE id=?',('msg',))['content']=='新内容'
    assert db.one('SELECT COUNT(*) n FROM events')['n']==1

def test_readonly_setup_does_not_interrupt_active_runs(tmp_path,monkeypatch):
    monkeypatch.setattr(db,'DB',tmp_path/'active.sqlite')
    db.init()
    db.execute('INSERT INTO conversations VALUES(?,?,?,?)',('conv','campus-demo','仍在生成',db.now()))
    db.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?,?)',('run','conv','campus-demo','active-test','chat','running',None,db.now(),None))
    db.init(recover_runs=False)
    assert db.one('SELECT status FROM runs WHERE id=?',('run',))['status']=='running'
    db.init()
    assert db.one('SELECT status FROM runs WHERE id=?',('run',))['status']=='failed'
