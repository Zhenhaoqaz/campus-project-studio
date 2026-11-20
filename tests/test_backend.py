import asyncio
import importlib
import json
import pytest
from fastapi.testclient import TestClient
from backend import db,rag
from backend.schemas import PlanSpec,validate_plan,parse_plan,authoritative_requirement_answer

server=importlib.import_module('backend.app')

@pytest.fixture
def client(tmp_path,monkeypatch):
    monkeypatch.setattr(db,'DB',tmp_path/'app.sqlite')
    monkeypatch.setattr(rag,'INDEX',tmp_path/'knowledge.sqlite')
    with TestClient(server.app) as c:
        yield c

def spec(tasks=None):
    return PlanSpec.model_validate({'summary':'可执行的计划','milestones':['阶段一'],'risks':[],'tasks':tasks or [{'key':'T1','title':'实现核心流程','description':'实现最小页面','priority':'high','acceptance':'流程能完成','requirement_ids':['R1'],'dependencies':[]}]})

def test_dependency_cycle_rejected():
    a=spec().model_dump()['tasks'][0]
    b={**a,'key':'T2','title':'第二项任务','dependencies':['T1']}
    a['dependencies']=['T2']
    with pytest.raises(ValueError,match='循环'):
        validate_plan(spec([a,b]),[{'id':'R1','kind':'teacher'}])

def test_fabricated_requirement_rejected():
    with pytest.raises(ValueError,match='不存在的要求'):
        validate_plan(spec(),[{'id':'R2','kind':'teacher'}])

def test_missing_requirements_reported():
    result=validate_plan(spec(),[{'id':'R1','kind':'teacher'},{'id':'R2','kind':'teacher'}])
    assert result['missing_requirements']==['R2']

def test_citation_check():
    assert rag.citation_audit('依据 [S1]',[{'id':'S1'}])['valid']
    assert not rag.citation_audit('依据 [S9]',[{'id':'S1'}])['valid']
    assert not rag.citation_audit('依据 [S1, S99]',[{'id':'S1'}])['valid']

def test_teacher_rule_is_not_inferred_from_technical_advice():
    result=authoritative_requirement_answer('老师要求必须做数据库吗？',[
        {'id':'R1','kind':'teacher','text':'实现一个 Web 应用。'},
        {'id':'S1','kind':'guide','text':'项目可以选择 SQLite。'}])
    assert '没有直接要求“数据库”' in result
    assert '可以选择 SQLite' not in result

def test_technical_must_question_is_not_misrouted_to_course_rules():
    assert authoritative_requirement_answer('React 中必须使用 useEffect 才能更新状态吗？',[]) is None


def test_task_review_mentions_requirements_without_becoming_a_rule_lookup():
    evidence=[{'id':'R1','kind':'teacher','text':'实现一个 Web 应用。'}]
    assert authoritative_requirement_answer('请评审当前任务对老师要求的关联和验收缺口，不要修改任务。',evidence) is None
    assert authoritative_requirement_answer('请重点检查当前已保存的任务「核心流程」：说明老师要求与任务的已保存关联、尚未完成的前置以及验收标准缺口。',evidence) is None
    assert '课程原文' in authoritative_requirement_answer('评审前先告诉我，老师是否必须要求任务有数据库？',evidence)
    assert '课程原文' in authoritative_requirement_answer('这些任务之外，老师必须要求登录吗？',evidence)

def test_fenced_plan_parsed_without_weakening_schema():
    raw='```json\n'+spec().model_dump_json()+'\n```'
    assert parse_plan(raw).tasks[0].key=='T1'

def test_project_requirement_isolation(client):
    p=client.post('/api/projects',json={'name':'另一个课程项目'}).json()
    client.post(f'/api/projects/{p["id"]}/requirements',json={'text':'只属于项目 B 的要求','kind':'teacher','source':'B课程'})
    evidence,_=asyncio.run(rag.retrieve(p['id'],'必须做什么'))
    assert len(evidence)==1 and evidence[0]['text']=='只属于项目 B 的要求'
    assert all(e['project_id']==p['id'] for e in evidence)
    original=client.get('/api/projects/campus-demo').json()
    assert all(r['text']!='只属于项目 B 的要求' for r in original['requirements'])

def test_cross_project_task_update_denied(client):
    task=client.get('/api/projects/campus-demo').json()['tasks'][0]
    p=client.post('/api/projects',json={'name':'B'}).json()
    r=client.put(f'/api/projects/{p["id"]}/tasks/{task["id"]}',json={'title':'不能跨项目改写'})
    assert r.status_code==404
    assert client.get('/api/projects/campus-demo').json()['tasks'][0]['title']==task['title']

def test_stale_plan_rejected_and_apply_idempotent(client):
    pid='campus-demo'
    c=client.post(f'/api/projects/{pid}/conversations',json={}).json()
    p,requirements=server.project_context(pid)
    plan=spec().model_dump()
    plan['tasks'][0]['requirement_ids']=[r['id'] for r in requirements if r['kind']=='teacher']
    plan['context_fingerprint']=server.fingerprint(p,requirements)
    run='test-run'
    db.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?,?)',(run,c['id'],pid,'request-123','plan','completed',None,db.now(),db.now()))
    db.execute('INSERT INTO plans VALUES(?,?,?,?,?,?)',('plan-1',pid,run,db.dump(plan),'proposed',db.now()))
    before=client.get('/api/projects/'+pid).json()['tasks']
    r=client.post(f'/api/projects/{pid}/plans/plan-1/apply')
    assert r.status_code==200 and r.json()['added']==1
    assert client.post(f'/api/projects/{pid}/plans/plan-1/apply').json()['added']==0
    after=client.get('/api/projects/'+pid).json()['tasks']
    for old in before:
        assert next(t for t in after if t['id']==old['id'])['status']==old['status']
    db.execute('INSERT INTO plans VALUES(?,?,?,?,?,?)',('plan-2',pid,run,db.dump(plan),'proposed',db.now()))
    client.post(f'/api/projects/{pid}/requirements',json={'text':'新增确认要求'})
    assert client.post(f'/api/projects/{pid}/plans/plan-2/apply').status_code==409

def test_real_stream_protocol_failure_state(client,monkeypatch):
    async def retrieval(*args,**kwargs):
        return [],{'mode':'test'}
    async def failing_chat(*args,**kwargs):
        yield '部分回答'
        raise ValueError('测试上游中断')
    monkeypatch.setattr(rag,'retrieve',retrieval)
    monkeypatch.setattr(server,'chat',failing_chat)
    c=client.post('/api/projects/campus-demo/conversations',json={}).json()
    r=client.post(f'/api/conversations/{c["id"]}/chat/stream',json={'text':'测试问题','request_id':'failure-test-123'})
    assert r.status_code==200
    assert 'event: message.delta' in r.text and 'event: run.failed' in r.text
    stored=client.get(f'/api/conversations/{c["id"]}/messages').json()
    assert stored['runs'][0]['status']=='failed'
    assert stored['messages'][-1]['status']=='interrupted'

def test_invalid_citation_is_not_formal_answer(client,monkeypatch):
    async def retrieval(*args,**kwargs):
        return [{'id':'R1','title':'确认要求','text':'要求文本','kind':'teacher','source':''}],{}
    async def invalid_chat(*args,**kwargs):
        yield '虚构依据 [S99]'
    monkeypatch.setattr(rag,'retrieve',retrieval)
    monkeypatch.setattr(server,'chat',invalid_chat)
    c=client.post('/api/projects/campus-demo/conversations',json={}).json()
    r=client.post(f'/api/conversations/{c["id"]}/chat/stream',json={'text':'测试引用','request_id':'citation-test-123'})
    assert 'role.completed' in r.text
    message=client.get(f'/api/conversations/{c["id"]}/messages').json()['messages'][-1]
    assert message['status']=='unverified' and 'S99' not in message['content']

def test_cross_origin_write_blocked(client):
    r=client.post('/api/projects',json={'name':'test'},headers={'Origin':'https://unrelated.example'})
    assert r.status_code==403

def test_export_contains_status_and_sources(client):
    r=client.get('/api/projects/campus-demo/export')
    assert r.status_code==200 and '老师' not in r.headers.get('Content-Disposition','')
    assert '教师验收截图' in r.text and '## 任务' in r.text


def store_plan(client,pid,tasks,plan_id='review-plan'):
    c=client.post(f'/api/projects/{pid}/conversations',json={}).json()
    p,requirements=server.project_context(pid)
    plan=spec(tasks).model_dump()
    plan['context_fingerprint']=server.fingerprint(p,requirements)
    rid='run-'+plan_id
    db.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?,?)',(rid,c['id'],pid,'request-'+plan_id,'plan','completed',None,db.now(),db.now()))
    db.execute('INSERT INTO plans VALUES(?,?,?,?,?,?)',(plan_id,pid,rid,db.dump(plan),'proposed',db.now()))
    return plan_id


def test_duplicate_task_titles_are_rejected_before_dependencies_apply():
    a=spec().model_dump()['tasks'][0]
    a['title']='React API'
    b={**a,'key':'T2','title':'react-api','dependencies':['T1']}
    with pytest.raises(ValueError,match='重复任务名称'):
        validate_plan(spec([a,b]),[{'id':'R1','kind':'teacher'}])


def test_incomplete_plan_is_visible_but_cannot_be_applied(client):
    pid='campus-demo'
    t=spec().model_dump()['tasks'][0]
    t['requirement_ids']=['demo-r1']
    store_plan(client,pid,[t])
    before=len(client.get('/api/projects/'+pid).json()['tasks'])
    preview=client.get(f'/api/projects/{pid}/plans/review-plan/preview').json()
    assert not preview['can_apply']
    assert preview['summary']['teacher_total']==5
    assert preview['summary']['teacher_covered']==1
    assert sum(r['covered'] for r in preview['coverage'])==1
    r=client.post(f'/api/projects/{pid}/plans/review-plan/apply')
    assert r.status_code==409 and '未关联任务' in r.json()['detail']
    assert len(client.get('/api/projects/'+pid).json()['tasks'])==before


def test_preview_reuse_and_dependency_resolution_match_actual_commit(client):
    pid=client.post('/api/projects',json={'name':'计划预览测试'}).json()['id']
    rid=client.post(f'/api/projects/{pid}/requirements',json={'text':'完成可演示项目','kind':'teacher'}).json()['id']
    old=client.post(f'/api/projects/{pid}/tasks',json={'title':'搭建React页面','status':'done','acceptance':'旧验收'}).json()['id']
    a=spec().model_dump()['tasks'][0]
    a.update(key='A',title='搭建 React 页面',requirement_ids=[rid])
    b={**a,'key':'B','title':'验证核心流程','dependencies':['A']}
    store_plan(client,pid,[a,b])
    preview=client.get(f'/api/projects/{pid}/plans/review-plan/preview').json()
    assert preview['can_apply']
    assert preview['summary']=={'added':1,'existing':1,'teacher_total':1,'teacher_covered':1}
    assert preview['existing_tasks'][0]['existing_id']==old
    assert preview['warnings']
    result=client.post(f'/api/projects/{pid}/plans/review-plan/apply').json()
    assert result['added']==1 and result['reused']==1
    tasks=client.get('/api/projects/'+pid).json()['tasks']
    assert len(tasks)==2
    reused=next(t for t in tasks if t['id']==old)
    assert reused['status']=='done' and reused['acceptance']=='旧验收'
    created=next(t for t in tasks if t['id']!=old)
    assert created['dependencies']==[old]


def test_corrupt_stored_plan_cannot_bypass_validation(client):
    pid=client.post('/api/projects',json={'name':'坏计划测试'}).json()['id']
    t=spec().model_dump()['tasks'][0]
    t['requirement_ids']=[]
    t['dependencies']=['nonexistent']
    store_plan(client,pid,[t])
    preview=client.get(f'/api/projects/{pid}/plans/review-plan/preview').json()
    assert not preview['can_apply']
    assert client.post(f'/api/projects/{pid}/plans/review-plan/apply').status_code==409
    assert client.get('/api/projects/'+pid).json()['tasks']==[]


def test_task_names_and_dependency_lifecycle(client):
    pid=client.post('/api/projects',json={'name':'依赖测试'}).json()['id']
    a=client.post(f'/api/projects/{pid}/tasks',json={'title':'React API'}).json()['id']
    assert client.post(f'/api/projects/{pid}/tasks',json={'title':'react-api'}).status_code==409
    assert client.post(f'/api/projects/{pid}/tasks',json={'title':'   '}).status_code==422
    b=client.post(f'/api/projects/{pid}/tasks',json={'title':'测试流程'}).json()['id']
    db.execute('UPDATE tasks SET dependencies=? WHERE id=?',(db.dump([a]),b))
    assert client.delete(f'/api/projects/{pid}/tasks/{a}').status_code==409
    assert client.put(f'/api/projects/{pid}/tasks/{b}',json={'title':'测试流程','status':'done'}).status_code==409
    assert client.put(f'/api/projects/{pid}/tasks/{a}',json={'title':'React API','status':'done'}).status_code==200
    assert client.put(f'/api/projects/{pid}/tasks/{b}',json={'title':'测试流程','status':'done'}).status_code==200


def test_unverified_history_and_current_question_do_not_pollute_retrieval(client):
    pid='campus-demo'
    cid=client.post(f'/api/projects/{pid}/conversations',json={}).json()['id']
    for rid in ['prior-history','current-history']:
        db.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?,?)',(rid,cid,pid,'request-'+rid,'chat','completed',None,db.now(),db.now()))
    for rid,role,content,status in [('prior-history','user','如何划分组件','complete'),('prior-history','assistant','错误回答不应回灌','unverified'),('current-history','user','那如何更新状态','complete')]:
        db.execute('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)',(db.uid(),cid,rid,role,content,status,'[]',db.now()))
    history=server.recent_history(cid,'current-history')
    assert history==[{'role':'user','content':'如何划分组件'}]
    query=server.retrieval_query('那如何更新状态',history)
    assert query.count('那如何更新状态')==1 and '错误回答' not in query
    assert server.retrieval_query('接口返回404，为什么catch没执行？',history)=='接口返回404，为什么catch没执行？'
    assert server.retrieval_query('那如何更新状态',[*history,{'role':'user','content':'那如何更新状态'}]).count('那如何更新状态')==1


def test_request_id_cannot_be_reused_for_different_content(client,monkeypatch):
    async def retrieval(*args,**kwargs):
        return [],{}
    async def answer(*args,**kwargs):
        yield '简短回答'
    monkeypatch.setattr(rag,'retrieve',retrieval)
    monkeypatch.setattr(server,'chat',answer)
    cid=client.post('/api/projects/campus-demo/conversations',json={}).json()['id']
    path=f'/api/conversations/{cid}/chat/stream'
    body={'text':'原始问题','request_id':'idempotency-request'}
    assert client.post(path,json=body).status_code==200
    assert client.post(path,json=body).status_code==200
    assert len(client.get(f'/api/conversations/{cid}/messages').json()['messages'])==2
    assert client.post(path,json={**body,'text':'不同问题'}).status_code==409
    assert client.post(path,json={**body,'mode':'plan'}).status_code==409


def test_confirmed_teacher_requirements_remain_available_when_models_are_offline(client,monkeypatch):
    async def offline(*args,**kwargs):
        raise RuntimeError('Ollama 检索不可用，不应调用')
    async def forbidden_chat(*args,**kwargs):
        raise RuntimeError('原文直出不应调用生成模型')
        yield
    monkeypatch.setattr(rag,'retrieve',offline)
    monkeypatch.setattr(server,'chat',forbidden_chat)
    cid=client.post('/api/projects/campus-demo/conversations',json={}).json()['id']
    result=client.post(f'/api/conversations/{cid}/chat/stream',json={'text':'老师要求必须做登录和数据库吗？','request_id':'offline-authority-request'})
    assert result.status_code==200
    assert 'confirmed-requirements' in result.text and 'run.completed' in result.text
    history=client.get(f'/api/conversations/{cid}/messages').json()
    assert history['runs'][0]['status']=='completed'
    message=history['messages'][-1]
    assert message['status']=='complete'
    assert '没有直接要求“登录、数据库”' in message['content']
    assert len(message['evidence'])==6
    assert all(e['project_id']=='campus-demo' for e in message['evidence'])


def test_missing_teacher_requirements_can_be_reported_offline(client,monkeypatch):
    async def offline(*args,**kwargs):
        raise RuntimeError('不应触发联网检索')
    monkeypatch.setattr(rag,'retrieve',offline)
    pid=client.post('/api/projects',json={'name':'尚未录入课程要求'}).json()['id']
    cid=client.post(f'/api/projects/{pid}/conversations',json={}).json()['id']
    result=client.post(f'/api/conversations/{cid}/chat/stream',json={'text':'老师要求必须用数据库吗？','request_id':'offline-empty-requirements'})
    assert 'run.completed' in result.text
    history=client.get(f'/api/conversations/{cid}/messages').json()
    assert '尚未确认老师要求' in history['messages'][-1]['content']


def test_requirement_edit_preserves_id_and_blocks_cross_project_edit(client):
    pid=client.post('/api/projects',json={'name':'要求编辑'}).json()['id']
    other=client.post('/api/projects',json={'name':'其他项目'}).json()['id']
    rid=client.post(f'/api/projects/{pid}/requirements',json={'text':'旧要求','kind':'teacher','source':'课程说明'}).json()['id']
    payload={'text':'更新后的要求','kind':'personal','source':'本人确认'}
    assert client.put(f'/api/projects/{other}/requirements/{rid}',json=payload).status_code==404
    assert client.get('/api/projects/'+pid).json()['requirements'][0]['text']=='旧要求'
    result=client.put(f'/api/projects/{pid}/requirements/{rid}',json=payload)
    assert result.status_code==200 and result.json()['id']==rid
    saved=client.get('/api/projects/'+pid).json()['requirements'][0]
    expected={'id':rid,'project_id':pid,**payload}
    assert {key:saved[key] for key in expected}==expected
    assert saved['version']==result.json()['version']


def test_requirement_edit_invalidates_old_plan_without_losing_association(client):
    pid=client.post('/api/projects',json={'name':'要求版本'}).json()['id']
    rid=client.post(f'/api/projects/{pid}/requirements',json={'text':'旧教师要求','kind':'teacher'}).json()['id']
    task=spec().model_dump()['tasks'][0]
    task['requirement_ids']=[rid]
    store_plan(client,pid,[task])
    assert client.get(f'/api/projects/{pid}/plans/review-plan/preview').json()['can_apply']
    client.put(f'/api/projects/{pid}/requirements/{rid}',json={'text':'修改后的教师要求','kind':'teacher'})
    preview=client.get(f'/api/projects/{pid}/plans/review-plan/preview').json()
    assert preview['stale'] and not preview['can_apply']
    assert preview['coverage'][0]['requirement_id']==rid
    assert client.post(f'/api/projects/{pid}/plans/review-plan/apply').status_code==409


def test_task_links_preserved_for_old_clients_and_explicitly_clearable(client):
    pid=client.post('/api/projects',json={'name':'可维护依赖'}).json()['id']
    rid=client.post(f'/api/projects/{pid}/requirements',json={'text':'必须完成核心流程'}).json()['id']
    a=client.post(f'/api/projects/{pid}/tasks',json={'title':'前置工作'}).json()['id']
    b=client.post(f'/api/projects/{pid}/tasks',json={'title':'后续工作','dependencies':[a,a],'requirement_ids':[rid,rid]}).json()['id']
    assert client.put(f'/api/projects/{pid}/tasks/{b}',json={'title':'后续工作已改名'}).status_code==200
    row=next(t for t in client.get('/api/projects/'+pid).json()['tasks'] if t['id']==b)
    assert row['dependencies']==[a] and row['requirement_ids']==[rid]
    assert client.put(f'/api/projects/{pid}/tasks/{b}',json={'title':'后续工作已改名','dependencies':None,'requirement_ids':None}).status_code==200
    row=next(t for t in client.get('/api/projects/'+pid).json()['tasks'] if t['id']==b)
    assert row['dependencies']==[a] and row['requirement_ids']==[rid]
    assert client.put(f'/api/projects/{pid}/tasks/{b}',json={'title':'后续工作已改名','dependencies':[],'requirement_ids':[]}).status_code==200
    row=next(t for t in client.get('/api/projects/'+pid).json()['tasks'] if t['id']==b)
    assert row['dependencies']==[] and row['requirement_ids']==[]
    assert client.delete(f'/api/projects/{pid}/tasks/{a}').status_code==200


def test_task_links_cannot_cross_projects_or_create_cycles(client):
    pid=client.post('/api/projects',json={'name':'主项目'}).json()['id']
    other=client.post('/api/projects',json={'name':'其他项目'}).json()['id']
    rid=client.post(f'/api/projects/{other}/requirements',json={'text':'其他课程要求'}).json()['id']
    foreign=client.post(f'/api/projects/{other}/tasks',json={'title':'其他项目任务'}).json()['id']
    assert client.post(f'/api/projects/{pid}/tasks',json={'title':'无效引用','requirement_ids':[rid]}).status_code==422
    assert client.post(f'/api/projects/{pid}/tasks',json={'title':'无效依赖','dependencies':[foreign]}).status_code==422
    assert client.get('/api/projects/'+pid).json()['tasks']==[]
    a=client.post(f'/api/projects/{pid}/tasks',json={'title':'第一步'}).json()['id']
    b=client.post(f'/api/projects/{pid}/tasks',json={'title':'第二步','dependencies':[a]}).json()['id']
    c=client.post(f'/api/projects/{pid}/tasks',json={'title':'第三步','dependencies':[b]}).json()['id']
    assert client.put(f'/api/projects/{pid}/tasks/{a}',json={'title':'第一步','dependencies':[a]}).status_code==409
    result=client.put(f'/api/projects/{pid}/tasks/{a}',json={'title':'第一步','dependencies':[c]})
    assert result.status_code==409 and '循环依赖' in result.json()['detail']
    row=next(t for t in client.get('/api/projects/'+pid).json()['tasks'] if t['id']==a)
    assert row['dependencies']==[]


def test_completed_predecessor_cannot_reopen_under_completed_dependents(client):
    pid=client.post('/api/projects',json={'name':'进度一致性'}).json()['id']
    a=client.post(f'/api/projects/{pid}/tasks',json={'title':'基础工作','status':'done'}).json()['id']
    b=client.post(f'/api/projects/{pid}/tasks',json={'title':'后续验收','status':'done','dependencies':[a]}).json()['id']
    c=client.post(f'/api/projects/{pid}/tasks',json={'title':'最终展示','status':'done','dependencies':[b]}).json()['id']
    result=client.put(f'/api/projects/{pid}/tasks/{a}',json={'title':'基础工作','status':'doing'})
    assert result.status_code==409
    assert '后续验收' in result.json()['detail'] and '最终展示' in result.json()['detail']
    assert all(t['status']=='done' for t in client.get('/api/projects/'+pid).json()['tasks'])
    assert client.put(f'/api/projects/{pid}/tasks/{c}',json={'title':'最终展示','status':'doing'}).status_code==200
    assert client.put(f'/api/projects/{pid}/tasks/{b}',json={'title':'后续验收','status':'doing'}).status_code==200
    assert client.put(f'/api/projects/{pid}/tasks/{a}',json={'title':'基础工作','status':'doing'}).status_code==200


def test_requirement_deletion_clears_only_current_project_task_links(client):
    pid=client.post('/api/projects',json={'name':'可删除要求'}).json()['id']
    other=client.post('/api/projects',json={'name':'其他项目'}).json()['id']
    rid=client.post(f'/api/projects/{pid}/requirements',json={'text':'过时要求'}).json()['id']
    tid=client.post(f'/api/projects/{pid}/tasks',json={'title':'任务','requirement_ids':[rid]}).json()['id']
    assert client.delete(f'/api/projects/{other}/requirements/{rid}').status_code==404
    assert client.get('/api/projects/'+pid).json()['tasks'][0]['requirement_ids']==[rid]
    assert client.delete(f'/api/projects/{pid}/requirements/{rid}').status_code==200
    p=client.get('/api/projects/'+pid).json()
    assert p['requirements']==[] and p['tasks'][0]['requirement_ids']==[]
    assert client.put(f'/api/projects/{pid}/tasks/{tid}',json={'title':'仍可编辑的任务'}).status_code==200


def revision_payload(client,pid,plan_id='review-plan',tasks=None):
    content=spec(tasks).model_dump()
    content['context_fingerprint']=client.get(f'/api/projects/{pid}/plans/{plan_id}/preview').json()['context_fingerprint']
    return content


def test_manual_plan_revision_creates_new_version_and_preserves_original(client):
    pid=client.post('/api/projects',json={'name':'人工补齐计划'}).json()['id']
    rid=client.post(f'/api/projects/{pid}/requirements',json={'text':'能够演示核心流程','kind':'teacher'}).json()['id']
    task=spec().model_dump()['tasks'][0]
    task['requirement_ids']=[]
    store_plan(client,pid,[task])
    original=db.one('SELECT * FROM plans WHERE id=?',('review-plan',))
    revised={**task,'title':'实现并演示核心流程','description':'完成列表与提交操作，准备完整演示路径','acceptance':'能够从输入到结果完成一条完整演示','requirement_ids':[rid]}
    body=revision_payload(client,pid,tasks=[revised])
    result=client.put(f'/api/projects/{pid}/plans/review-plan',json=body)
    assert result.status_code==201
    proposal=result.json()
    assert proposal['id']!='review-plan' and proposal['status']=='proposed'
    assert proposal['run_id']==original['run_id']
    assert proposal['content']['revision_of']=='review-plan'
    assert proposal['content']['edited_by']=='user'
    assert proposal['content']['requirements'][0]['id']==rid
    assert proposal['content']['validation']['complete']
    assert db.one('SELECT * FROM plans WHERE id=?',('review-plan',))==original
    assert client.get('/api/projects/'+pid).json()['tasks']==[]
    assert client.post(f'/api/projects/{pid}/plans/{proposal["id"]}/apply').json()['added']==1


def test_applied_plan_can_be_copied_for_revision_without_changing_applied_tasks(client):
    pid=client.post('/api/projects',json={'name':'应用后继续改进'}).json()['id']
    task=spec().model_dump()['tasks'][0]
    task['requirement_ids']=[]
    store_plan(client,pid,[task])
    client.post(f'/api/projects/{pid}/plans/review-plan/apply')
    original_tasks=client.get('/api/projects/'+pid).json()['tasks']
    body=revision_payload(client,pid,tasks=[{**task,'title':'补充错误状态测试'}])
    result=client.put(f'/api/projects/{pid}/plans/review-plan',json=body)
    assert result.status_code==201
    assert db.one('SELECT status FROM plans WHERE id=?',('review-plan',))['status']=='applied'
    assert client.get('/api/projects/'+pid).json()['tasks']==original_tasks
    assert result.json()['content']['edited_by']=='user'


def test_manual_plan_revision_rejects_stale_editor_fingerprint(client):
    pid=client.post('/api/projects',json={'name':'编辑期间变更'}).json()['id']
    task=spec().model_dump()['tasks'][0]
    task['requirement_ids']=[]
    store_plan(client,pid,[task])
    body=revision_payload(client,pid,tasks=[task])
    client.post(f'/api/projects/{pid}/requirements',json={'text':'编辑期间新增了要求','kind':'teacher'})
    result=client.put(f'/api/projects/{pid}/plans/review-plan',json=body)
    assert result.status_code==409 and '编辑期间发生变化' in result.json()['detail']
    assert len(client.get('/api/projects/'+pid).json()['plans'])==1


def test_manual_plan_revision_can_save_incomplete_draft_but_not_apply_it(client):
    pid=client.post('/api/projects',json={'name':'分步人工修订'}).json()['id']
    first=client.post(f'/api/projects/{pid}/requirements',json={'text':'核心流程完整','kind':'teacher'}).json()['id']
    client.post(f'/api/projects/{pid}/requirements',json={'text':'提交项目报告','kind':'teacher'})
    task=spec().model_dump()['tasks'][0]
    task['requirement_ids']=[first]
    store_plan(client,pid,[task])
    result=client.put(f'/api/projects/{pid}/plans/review-plan',json=revision_payload(client,pid,tasks=[task]))
    assert result.status_code==201
    new_id=result.json()['id']
    assert not result.json()['content']['validation']['complete']
    assert not client.get(f'/api/projects/{pid}/plans/{new_id}/preview').json()['can_apply']
    assert client.post(f'/api/projects/{pid}/plans/{new_id}/apply').status_code==409


def test_manual_plan_revision_rejects_invalid_dependencies_and_cross_project_plan(client):
    pid=client.post('/api/projects',json={'name':'修订校验'}).json()['id']
    other=client.post('/api/projects',json={'name':'其他项目'}).json()['id']
    task=spec().model_dump()['tasks'][0]
    task['requirement_ids']=[]
    store_plan(client,pid,[task])
    body=revision_payload(client,pid,tasks=[{**task,'dependencies':['T99']}])
    result=client.put(f'/api/projects/{pid}/plans/review-plan',json=body)
    assert result.status_code==422 and '依赖编号不存在' in result.json()['detail']
    assert client.put(f'/api/projects/{other}/plans/review-plan',json=body).status_code==404
    assert len(client.get('/api/projects/'+pid).json()['plans'])==1


def test_stale_plan_preview_returns_current_hash_for_explicit_human_recheck(client):
    pid=client.post('/api/projects',json={'name':'旧计划人工核对'}).json()['id']
    rid=client.post(f'/api/projects/{pid}/requirements',json={'text':'旧课程要求','kind':'teacher'}).json()['id']
    task=spec().model_dump()['tasks'][0]
    task['requirement_ids']=[rid]
    store_plan(client,pid,[task])
    before=client.get(f'/api/projects/{pid}/plans/review-plan/preview').json()
    client.put(f'/api/projects/{pid}/requirements/{rid}',json={'text':'新的课程要求','kind':'teacher'})
    after=client.get(f'/api/projects/{pid}/plans/review-plan/preview').json()
    assert after['stale'] and after['context_fingerprint']!=before['context_fingerprint']
    body=spec([{**task,'description':'已按新的课程要求调整工作','acceptance':'按新要求完成核对'}]).model_dump()
    body['context_fingerprint']=after['context_fingerprint']
    result=client.put(f'/api/projects/{pid}/plans/review-plan',json=body)
    assert result.status_code==201
    assert result.json()['content']['requirements'][0]['text']=='新的课程要求'


def test_manual_revision_cannot_only_add_requirement_numbers(client):
    pid=client.post('/api/projects',json={'name':'人工核对最低保护'}).json()['id']
    rid=client.post(f'/api/projects/{pid}/requirements',json={'text':'提交完整报告','kind':'teacher'}).json()['id']
    task=spec().model_dump()['tasks'][0]
    task['requirement_ids']=[]
    store_plan(client,pid,[task])
    linked={**task,'requirement_ids':[rid]}
    body=revision_payload(client,pid,tasks=[linked])
    result=client.put(f'/api/projects/{pid}/plans/review-plan',json=body)
    assert result.status_code==422 and '不能只补编号' in result.json()['detail']
    body['tasks'][0]['description']='  '+task['description']+' \n'
    assert client.put(f'/api/projects/{pid}/plans/review-plan',json=body).status_code==422
    body['tasks'][0]['acceptance']='完成报告并核对规定格式、文件命名和提交时间'
    assert client.put(f'/api/projects/{pid}/plans/review-plan',json=body).status_code==201


def test_manual_revision_new_task_requires_work_and_acceptance(client):
    pid=client.post('/api/projects',json={'name':'新增任务的工作说明'}).json()['id']
    task=spec().model_dump()['tasks'][0]
    task['requirement_ids']=[]
    store_plan(client,pid,[task])
    added={**task,'key':'T2','title':'准备报告','description':''}
    body=revision_payload(client,pid,tasks=[task,added])
    result=client.put(f'/api/projects/{pid}/plans/review-plan',json=body)
    assert result.status_code==422 and '具体工作与验收标准' in result.json()['detail']
    assert len(client.get('/api/projects/'+pid).json()['plans'])==1


def test_project_editor_receives_requirements_and_matching_context_version(client):
    pid=client.post('/api/projects',json={'name':'版本一致的编辑快照'}).json()['id']
    rid=client.post(f'/api/projects/{pid}/requirements',json={'text':'当前要求','kind':'teacher'}).json()['id']
    snapshot=client.get('/api/projects/'+pid).json()
    p,reqs=server.project_context(pid)
    assert snapshot['context_fingerprint']==server.fingerprint(p,reqs)
    client.put(f'/api/projects/{pid}/requirements/{rid}',json={'text':'更新后的要求','kind':'teacher'})
    latest=client.get('/api/projects/'+pid).json()
    assert latest['requirements'][0]['text']=='更新后的要求'
    assert latest['context_fingerprint']!=snapshot['context_fingerprint']


def test_reused_task_cannot_claim_requirement_links_that_application_would_discard(client):
    pid=client.post('/api/projects',json={'name':'关联实际落地'}).json()['id']
    rid=client.post(f'/api/projects/{pid}/requirements',json={'text':'完整核心流程','kind':'teacher'}).json()['id']
    tid=client.post(f'/api/projects/{pid}/tasks',json={'title':'实现核心流程','status':'done','acceptance':'原验收'}).json()['id']
    task={**spec().model_dump()['tasks'][0],'requirement_ids':[rid]}
    store_plan(client,pid,[task])
    preview=client.get(f'/api/projects/{pid}/plans/review-plan/preview').json()
    assert not preview['can_apply'] and preview['summary']['teacher_covered']==0
    assert preview['coverage'][0]['unapplied_task_keys']==['T1']
    assert client.post(f'/api/projects/{pid}/plans/review-plan/apply').status_code==409
    assert client.put(f'/api/projects/{pid}/tasks/{tid}',json={
        'title':'实现核心流程','status':'done','acceptance':'原验收','requirement_ids':[rid]
    }).status_code==200
    assert client.get(f'/api/projects/{pid}/plans/review-plan/preview').json()['can_apply']
    result=client.post(f'/api/projects/{pid}/plans/review-plan/apply').json()
    assert result['added']==0 and result['reused']==1
    current=client.get('/api/projects/'+pid).json()['tasks'][0]
    assert current['status']=='done' and current['acceptance']=='原验收' and current['requirement_ids']==[rid]


def test_chat_retrieval_keeps_user_query_without_an_extra_generation(client,monkeypatch):
    queries=[]
    generations=[]
    async def retrieval(pid,question,**kwargs):
        queries.append((question,kwargs))
        return [],{}
    async def answer(prompts,**kwargs):
        generations.append(prompts)
        yield '请检查 Fetch 返回的 Response.ok。'
    monkeypatch.setattr(rag,'retrieve',retrieval)
    monkeypatch.setattr(server,'chat',answer)
    cid=client.post('/api/projects/campus-demo/conversations',json={}).json()['id']
    question='接口返回404，为什么catch没有执行？'
    result=client.post(f'/api/conversations/{cid}/chat/stream',json={'text':question,'request_id':'original-retrieval-check'})
    assert result.status_code==200
    assert queries==[(question,{})]
    assert len(generations)==1 and generations[0][-1]['content']==question


def test_role_task_scope_is_authoritative_in_stream_history_export_and_retry(client,monkeypatch):
    pid=client.post('/api/projects',json={'name':'独立范围'}).json()['id']
    root=f'/api/projects/{pid}'
    req=client.post(root+'/requirements',json={'text':'课程原文甲','kind':'teacher'}).json()
    first=client.post(root+'/tasks',json={'title':'未选记录甲'}).json()
    chosen=client.post(root+'/tasks',json={'title':'所选记录乙','requirement_ids':[req['id']]}).json()
    evidence=[{'id':'R1','kind':'teacher','doc_id':req['id'],'project_id':pid,'text':req['text']}]
    prompts=[]

    async def retrieve(*args,**kwargs):
        return evidence,{}

    async def generate(messages,**kwargs):
        prompts.append(messages)
        yield '保存记录 [T2]' if '所选记录乙' in messages[0]['content'] else '缺少任务记录'

    monkeypatch.setattr(rag,'retrieve',retrieve)
    monkeypatch.setattr(server,'chat',generate)
    cid=client.post(root+'/conversations',json={}).json()['id']
    conversation=f'/api/conversations/{cid}'
    path=conversation+'/chat/stream'
    body={'text':'只核对这项的已保存关联，对应哪项老师要求？','request_id':'scoped-replay','mode':'reviewer','task_ids':[chosen['id']]}
    response=client.post(path,json=body)
    assert response.status_code==200 and 'event: message.delta' in response.text
    reply=client.get(conversation+'/messages').json()['messages'][-1]
    assert [item['id'] for item in reply['evidence']]==['R1','T2']
    assert reply['task_scope']['used']==1 and reply['task_scope']['total']==2
    assert '未选记录甲' not in prompts[0][0]['content']
    exported=client.get(root+'/export?format=json').json()
    assert exported['messages'][-1]['task_scope']==reply['task_scope']
    assert client.post(path,json={**body,'task_ids':[chosen['id'],chosen['id']]}).headers['x-run-id']==response.headers['x-run-id']
    assert client.post(path,json={**body,'task_ids':[first['id']]}).status_code==409
    assert client.post(path,json={**body,'request_id':'scope-invalid','task_ids':['other-project-id']}).status_code==422
    assert client.post(path,json={**body,'request_id':'scope-empty','task_ids':[]}).status_code==200
    empty=client.get(conversation+'/messages').json()
    assert empty['messages'][-1]['task_scope']['used']==0
    assert empty['runs'][0]['task_ids']==[]
    assert [item['id'] for item in empty['messages'][-1]['evidence']]==['R1']


def test_exports_preserve_task_context_revision_provenance_and_source_structure(client):
    pid=client.post('/api/projects',json={'name':'可追溯导出'}).json()['id']
    rid=client.post(f'/api/projects/{pid}/requirements',json={'text':'需要可观察的演示流程','kind':'teacher'}).json()['id']
    first=client.post(f'/api/projects/{pid}/tasks',json={'title':'准备演示数据','description':'保留演示起点','acceptance':'能够重复开始'}).json()['id']
    client.post(f'/api/projects/{pid}/tasks',json={'title':'演练完整流程','description':'操作发布到结果','acceptance':'8分钟内讲清楚','dependencies':[first],'requirement_ids':[rid]})
    task={**spec().model_dump()['tasks'][0],'requirement_ids':[rid]}
    store_plan(client,pid,[task])
    revised=client.put(f'/api/projects/{pid}/plans/review-plan',json=revision_payload(client,pid,tasks=[{**task,'description':'落实演示步骤'}])).json()
    plan=db.one('SELECT * FROM plans WHERE id=?',('review-plan',))
    run=db.one('SELECT * FROM runs WHERE id=?',(plan['run_id'],))
    evidence=[{'id':'S1','doc_id':'docs','title':'公开资料','kind':'official','heading':'边界说明','text':'保留来源文字','source':'https://example.org/docs#boundary'}]
    db.execute('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)',(db.uid(),run['conversation_id'],run['id'],'assistant','依据 [S1]','complete',db.dump(evidence),db.now()))
    exported=client.get(f'/api/projects/{pid}/export?format=json').json()
    assert exported['messages'][0]['evidence']==evidence
    assert exported['plans'][0]['content']['revision_of']=='review-plan'
    assert exported['exported_at']
    markdown=client.get(f'/api/projects/{pid}/export?format=md').text
    assert '前置任务：准备演示数据' in markdown and '关联要求：需要可观察的演示流程' in markdown
    assert revised['id'] in markdown and '人工修订' in markdown and '基于版本：review-plan' in markdown
    assert '边界说明' in markdown and 'https://example.org/docs#boundary' in markdown
    assert '列出不代表均被回答引用' in markdown
    assert client.get(f'/api/projects/{pid}/export?format=pdf').status_code==422


def test_incomplete_generated_plan_keeps_valid_risk_list_at_schema_limit(client,monkeypatch):
    pid=client.post('/api/projects',json={'name':'完整风险列表'}).json()['id']
    client.post(f'/api/projects/{pid}/requirements',json={'text':'报告需要说明关键技术','kind':'teacher'})
    task={**spec().model_dump()['tasks'][0],'requirement_ids':[]}
    content=spec([task]).model_dump()
    content['risks']=[f'需检查的风险{i}' for i in range(10)]
    async def retrieval(*args,**kwargs):
        return [],{}
    async def answer(*args,**kwargs):
        yield json.dumps(content,ensure_ascii=False) if kwargs.get('schema') else '规划与评审的建议'
    monkeypatch.setattr(rag,'retrieve',retrieval)
    monkeypatch.setattr(server,'chat',answer)
    cid=client.post(f'/api/projects/{pid}/conversations',json={}).json()['id']
    response=client.post(f'/api/conversations/{cid}/chat/stream',json={'text':'制定计划','mode':'plan','request_id':'risk-list-boundary-check'})
    assert 'event: plan.proposed' in response.text and 'event: run.completed' in response.text
    saved=client.get('/api/projects/'+pid).json()['plans'][0]
    checked=PlanSpec.model_validate({key:saved['content'][key] for key in PlanSpec.model_fields})
    assert len(checked.risks)==10 and '风险9' in checked.risks[-1] and '尚未关联' in checked.risks[-1]
    preview=client.get(f'/api/projects/{pid}/plans/{saved["id"]}/preview').json()
    assert not preview['can_apply'] and preview['summary']['teacher_total']==1


def test_invalid_generated_plan_preserves_diagnostics_without_creating_tasks(client,monkeypatch):
    pid=client.post('/api/projects',json={'name':'输出失败可诊断'}).json()['id']
    async def retrieval(*args,**kwargs):
        return [],{}
    async def answer(*args,**kwargs):
        yield '{"summary":"缺少任务字段"}' if kwargs.get('schema') else '规划与评审草稿'
    monkeypatch.setattr(rag,'retrieve',retrieval)
    monkeypatch.setattr(server,'chat',answer)
    cid=client.post(f'/api/projects/{pid}/conversations',json={}).json()['id']
    response=client.post(f'/api/conversations/{cid}/chat/stream',json={'text':'生成计划','mode':'plan','request_id':'invalid-plan-observability'})
    events=[json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
    diagnostics=[event['data'] for event in events if event['type']=='plan.validation_failed']
    assert [item['attempt'] for item in diagnostics]==[1,2]
    assert all('缺少任务字段' in item['candidate_output'] for item in diagnostics)
    assert any(problem['field']=='tasks' for problem in diagnostics[-1]['problems'])
    current=client.get('/api/projects/'+pid).json()
    assert current['plans']==[] and current['tasks']==[] and 'event: run.failed' in response.text


def test_role_discussions_keep_history_and_real_tasks_without_creating_plans(client,monkeypatch):
    pid=client.post('/api/projects',json={'name':'角色讨论的独立项目'}).json()['id']
    client.post(f'/api/projects/{pid}/tasks',json={'title':'先验证列表筛选','status':'doing','acceptance':'组合筛选有空状态'})
    before=client.get('/api/projects/'+pid).json()
    prompts=[]
    async def retrieval(*args,**kwargs):return [{'id':'S1','kind':'guide','title':'方法','text':'先确认最小范围','source':''}],{}
    async def answer(messages,**kwargs):
        prompts.append(messages)
        yield '先验证核心路径并保留检查记录。[S1][T1]'
    monkeypatch.setattr(rag,'retrieve',retrieval);monkeypatch.setattr(server,'chat',answer)
    cid=client.post(f'/api/projects/{pid}/conversations',json={}).json()['id']
    for mode,question in [('planner','先讨论最小功能范围'),('reviewer','那请检查刚才的安排是否缺少验收标准')]:
        result=client.post(f'/api/conversations/{cid}/chat/stream',json={'text':question,'mode':mode,'request_id':'discussion-test-'+mode})
        assert result.status_code==200 and 'event: run.completed' in result.text and 'event: plan.proposed' not in result.text
    history=client.get(f'/api/conversations/{cid}/messages').json()
    assert [item['role'] for item in history['messages']]==['user','planner','user','reviewer']
    assert history['runs'][0]['mode']=='reviewer'
    task_sources=[item for item in history['messages'][-1]['evidence'] if item['kind']=='task']
    assert len(task_sources)==1 and task_sources[0]['id']=='T1' and '先验证列表筛选' in task_sources[0]['text']
    assert '先验证列表筛选' in prompts[0][0]['content'] and '组合筛选有空状态' in prompts[1][0]['content']
    assert any(message['role']=='assistant' and '先验证核心路径' in message['content'] for message in prompts[1][1:-1])
    after=client.get('/api/projects/'+pid).json()
    assert after['tasks']==before['tasks'] and after['plans']==[]
    conflict=client.post(f'/api/conversations/{cid}/chat/stream',json={'text':'先讨论最小功能范围','mode':'reviewer','request_id':'discussion-test-planner'})
    assert conflict.status_code==409


def test_task_evidence_stays_project_scoped_and_unknown_task_citations_are_rejected(client):
    first=client.post('/api/projects',json={'name':'讨论项目甲'}).json()['id']
    second=client.post('/api/projects',json={'name':'讨论项目乙'}).json()['id']
    client.post(f'/api/projects/{first}/tasks',json={'title':'甲的任务','status':'doing','acceptance':'甲的标准'})
    client.post(f'/api/projects/{second}/tasks',json={'title':'乙的任务','status':'done','acceptance':'乙的标准'})
    evidence=server.current_task_evidence(first)
    assert len(evidence)==1 and evidence[0]['id']=='T1' and evidence[0]['project_id']==first
    assert '甲的任务' in evidence[0]['text'] and '乙的任务' not in evidence[0]['text']
    assert '列表排列不代表依赖关系' in evidence[0]['text']
    assert rag.citation_audit('已有记录 [T1]',evidence)['valid']
    assert not rag.citation_audit('虚构记录 [T1,T9]',evidence)['valid']


def test_task_evidence_maps_saved_associations_to_local_requirement_refs(client):
    pid=client.post('/api/projects',json={'name':'执行检查项目'}).json()['id']
    other=client.post('/api/projects',json={'name':'另一个项目'}).json()['id']
    client.post(f'/api/projects/{other}/requirements',json={'text':'不能混入的要求','kind':'teacher'})
    personal=client.post(f'/api/projects/{pid}/requirements',json={'text':'先完成页面','kind':'personal'}).json()['id']
    teacher=client.post(f'/api/projects/{pid}/requirements',json={'text':'必须能展示核心流程','kind':'teacher'}).json()['id']
    client.post(f'/api/projects/{pid}/tasks',json={'title':'核心流程','status':'done','requirement_ids':[teacher,personal]})
    before=client.get(f'/api/projects/{pid}').json()
    evidence=server.current_task_evidence(pid)
    text=evidence[0]['text']
    assert 'R2（老师要求）、R1（个人约束）' in text
    assert '已完成（用户记录）' in text and '验收标准：未填写' in text
    assert '关联不代表已通过验收' in text and '不能混入的要求' not in text
    assert evidence[0]['saved_task']['requirements']==[{'id':'R2','kind':'teacher'},{'id':'R1','kind':'personal'}]
    assert evidence[0]['saved_task']['status']=='done'
    assert teacher not in text and personal not in text
    supplied=server.current_task_evidence(pid,[{'id':'R7','doc_id':teacher,'kind':'teacher','project_id':pid},
        {'id':'R8','doc_id':personal,'kind':'personal','project_id':other}])[0]
    assert supplied['saved_task']['requirements']==[{'id':'R7','kind':'teacher'}]
    assert supplied['saved_task']['unread_requirement_count']==1
    assert 'R7（老师要求）' in supplied['text'] and 'R8' not in supplied['text']
    assert '本轮要求快照中未读取的关联' in supplied['text']
    assert client.get(f'/api/projects/{pid}').json()==before
    client.delete(f'/api/projects/{pid}/requirements/{teacher}')
    updated=server.current_task_evidence(pid)[0]['text']
    assert '老师要求' not in updated and 'R1（个人约束）' in updated
    assert evidence[0]['saved_task']['requirements'][0]['id']=='R2'


def test_role_message_preserves_structured_task_snapshot_after_later_edits(client,monkeypatch):
    pid=client.post('/api/projects',json={'name':'任务快照不追随当前编辑'}).json()['id']
    rid=client.post(f'/api/projects/{pid}/requirements',json={'text':'可演示核心流程','kind':'teacher'}).json()['id']
    tid=client.post(f'/api/projects/{pid}/tasks',json={'title':'原任务','acceptance':'原验收','requirement_ids':[rid]}).json()['id']
    async def retrieval(*args,**kwargs):
        return [{'id':'R1','doc_id':rid,'kind':'teacher','text':'可演示核心流程','source':'','title':'原文','project_id':pid}],{}
    async def answer(prompt,**kwargs):
        assert '已保存要求关联：R1' in prompt[0]['content']
        assert 'saved_task' not in prompt[0]['content'], 'UI 快照不能重复占用模型上下文'
        yield '可以先核对原验收标准。[T1]'
    monkeypatch.setattr(rag,'retrieve',retrieval);monkeypatch.setattr(server,'chat',answer)
    cid=client.post(f'/api/projects/{pid}/conversations',json={}).json()['id']
    result=client.post(f'/api/conversations/{cid}/chat/stream',json={'text':'检查当前任务的验收缺口','mode':'reviewer','request_id':'snapshot-persistence'})
    assert 'event: run.completed' in result.text
    previous=client.get(f'/api/conversations/{cid}/messages').json()['messages'][-1]['evidence'][-1]['saved_task']
    client.put(f'/api/projects/{pid}/tasks/{tid}',json={'title':'改过的任务','status':'doing','acceptance':'新验收','requirement_ids':[]})
    current=server.current_task_evidence(pid)[0]['saved_task']
    saved=client.get(f'/api/conversations/{cid}/messages').json()['messages'][-1]['evidence'][-1]['saved_task']
    assert saved==previous and saved['title']=='原任务' and saved['requirements']==[{'id':'R1','kind':'teacher'}]
    assert current['title']=='改过的任务' and current['requirements']==[] and current['acceptance']=='新验收'
    exported=client.get(f'/api/projects/{pid}/export?format=json').json()
    assert exported['messages'][-1]['evidence'][-1]['saved_task']==previous
    markdown=client.get(f'/api/projects/{pid}/export').text
    assert '本轮任务记录快照（由程序整理）：原任务' in markdown
    assert '本轮要求关联：R1' in markdown and '本轮验收标准：原验收' in markdown


@pytest.mark.parametrize('mode',['planner','reviewer'])
def test_role_discussions_use_confirmed_course_text_without_models(client,monkeypatch,mode):
    async def offline(*args,**kwargs):raise AssertionError('原文问答不应调用向量服务')
    async def forbidden(*args,**kwargs):
        raise AssertionError('原文问答不应调用模型')
        yield
    monkeypatch.setattr(rag,'retrieve',offline);monkeypatch.setattr(server,'chat',forbidden)
    cid=client.post('/api/projects/campus-demo/conversations',json={}).json()['id']
    result=client.post(f'/api/conversations/{cid}/chat/stream',json={'text':'老师必须要求登录吗？','mode':mode,'request_id':'offline-role-'+mode})
    assert 'event: run.completed' in result.text
    last=client.get(f'/api/conversations/{cid}/messages').json()['messages'][-1]
    assert last['role']==mode and last['status']=='complete' and '没有直接要求“登录”' in last['content']
