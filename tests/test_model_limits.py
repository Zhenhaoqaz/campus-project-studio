import asyncio
import json

import httpx
import pytest

from backend import model


MESSAGES=[{'role':'user','content':'解释一下 React 组件。'}]


async def collect(messages=None,**kwargs):
    return ''.join([piece async for piece in model.chat(messages or MESSAGES,**kwargs)])


@pytest.fixture
def fake_ollama(monkeypatch):
    original=httpx.AsyncClient
    requests=[]
    def install(parts=None,raw=None,status=200):
        content=raw if raw is not None else '\n'.join(json.dumps(part,ensure_ascii=False) for part in parts)+'\n'
        def handle(request):
            requests.append(json.loads(request.content))
            return httpx.Response(status,content=content.encode('utf-8'),headers={'content-type':'application/x-ndjson'})
        transport=httpx.MockTransport(handle)
        monkeypatch.setattr(model.httpx,'AsyncClient',lambda *args,**kwargs:original(*args,transport=transport,**kwargs))
        return requests
    return install


def test_budget_reserves_output_and_overhead_and_drives_request_context(monkeypatch,fake_ollama):
    monkeypatch.setenv('CAMPUS_MODEL_CONTEXT_TOKENS','2048')
    monkeypatch.setenv('CAMPUS_MODEL_RESERVED_TOKENS','256')
    monkeypatch.setenv('CAMPUS_MODEL_ESTIMATE_SCALE','1')
    budget=model.input_budget(MESSAGES,None,300)
    assert budget['available_input_units']==1492
    assert 0<budget['estimated_input_units']<1492
    requests=fake_ollama([{'message':{'content':'可见回答'},'done':True}])
    assert asyncio.run(collect(max_tokens=300))=='可见回答'
    assert requests[0]['options']['num_ctx']==2048
    assert requests[0]['options']['num_predict']==300
    assert requests[0]['think'] is False


def test_oversized_input_is_rejected_locally_without_truncation(monkeypatch):
    messages=[{'role':'user','content':'课程要求很长。'*3000}]
    original=messages[0]['content']
    monkeypatch.setattr(model.httpx,'AsyncClient',lambda *args,**kwargs:pytest.fail('超限请求不应连接模型'))
    with pytest.raises(ValueError,match='保守估算') as error:
        asyncio.run(collect(messages,max_tokens=1500))
    assert '没有截断原文' in str(error.value)
    assert messages[0]['content']==original


def test_schema_is_counted_towards_input_budget():
    simple=model.input_budget(MESSAGES,None,1500)
    schema={'type':'object','properties':{'任务':{'type':'string','description':'具体说明'*100}}}
    constrained=model.input_budget(MESSAGES,schema,1500)
    assert constrained['estimated_input_units']>simple['estimated_input_units']


@pytest.mark.parametrize('key,value',[
    ('CAMPUS_MODEL_CONTEXT_TOKENS','not-a-number'),
    ('CAMPUS_MODEL_CONTEXT_TOKENS','64'),
    ('CAMPUS_MODEL_RESERVED_TOKENS','20000'),
    ('CAMPUS_MODEL_ESTIMATE_SCALE','nan'),
    ('CAMPUS_MODEL_ESTIMATE_SCALE','.5'),
])
def test_invalid_budget_configuration_is_readable(monkeypatch,key,value):
    monkeypatch.setenv(key,value)
    with pytest.raises(ValueError,match='预算配置无效'):
        model.input_budget(MESSAGES,None,1500)


@pytest.mark.parametrize('max_tokens',[0,-1,True,20000])
def test_invalid_output_budget_is_rejected(max_tokens):
    with pytest.raises(ValueError,match='输出预算无效'):
        model.input_budget(MESSAGES,None,max_tokens)


@pytest.mark.parametrize('messages',[
    [],[{'role':'unknown','content':'test'}],[{'role':'user','content':['not text']}],['not-a-message'],
])
def test_invalid_input_messages_do_not_reach_model(messages):
    with pytest.raises(ValueError,match='消息|文本对话'):
        model.input_budget(messages,None,1500)


def test_normal_deltas_and_metadata_only_final_chunk(fake_ollama):
    fake_ollama([{'message':{'content':'你好'},'done':False},{'message':{'content':'，同学'},'done':False},{'done':True,'eval_count':4}])
    assert asyncio.run(collect())=='你好，同学'


def test_thinking_field_and_split_think_tags_never_reach_answer(fake_ollama):
    fake_ollama([
        {'message':{'thinking':'内部推理字段'},'done':False},
        {'message':{'content':'<thi'},'done':False},
        {'message':{'content':'nk>不能显示的分析</th'},'done':False},
        {'message':{'content':'ink>可见'},'done':False},
        {'message':{'content':'答案','thinking':'也不能显示'},'done':True},
    ])
    assert asyncio.run(collect())=='可见答案'


@pytest.mark.parametrize('parts,reason',[
    ([{'message':{'content':''},'done':True}],'有效正文'),
    ([{'message':{'content':'   '},'done':True}],'有效正文'),
    ([{'message':{'thinking':'只有思考'},'done':True}],'有效正文'),
    ([{'done':True}],'有效消息'),
    ([{'message':{'role':'assistant'},'done':True}],'正文内容'),
    ([{'message':'not-an-object','done':True}],'消息结构'),
    ([{'message':{'content':None},'done':True}],'正文格式'),
    ([{'message':{'content':['text']},'done':True}],'正文格式'),
    ([{'message':{'content':'部分正文'},'done':False}],'提前结束'),
    ([{'message':{'content':'正文'},'done':'true'}],'完成标记'),
    ([{'message':{'content':'部分正文'},'done':True,'done_reason':'length'}],'长度上限'),
    ([{'message':{'content':'<think>没有闭合'},'done':True}],'未闭合'),
    ([{'error':'do not echo internal error'}],'未完成请求'),
])
def test_invalid_or_incomplete_outputs_are_not_completed(fake_ollama,parts,reason):
    fake_ollama(parts)
    with pytest.raises(ValueError,match=reason):
        asyncio.run(collect())


@pytest.mark.parametrize('raw',['{broken json}\n','["not", "an", "object"]\n'])
def test_malformed_ndjson_has_clear_error(fake_ollama,raw):
    fake_ollama(raw=raw)
    with pytest.raises(ValueError,match='无法解析|格式无效'):
        asyncio.run(collect())


def test_terminal_event_stops_reading_extra_chunks(fake_ollama):
    fake_ollama([{'message':{'content':'正式回答'},'done':True},{'message':{'content':'不应附加的内容'},'done':False}])
    assert asyncio.run(collect())=='正式回答'
from backend.discussion import scoped_prompt
from backend.model import ContextTooLong


@pytest.mark.parametrize('total', [10, 50, 100])
@pytest.mark.parametrize('length', [12, 400])
def test_scoped_budget_preserves_exact_selection_and_requirement(monkeypatch, total, length):
    monkeypatch.setenv('CAMPUS_MODEL_CONTEXT_TOKENS', '12288')
    monkeypatch.setenv('CAMPUS_MODEL_RESERVED_TOKENS', '768')
    text='必须原样保留的课程原文。'*30
    evidence=[{'id':'R1','text':text}]+[
        {'id':f'T{i}','text':'任务说明'*length} for i in range(1,total+1)]
    scope={'used':total,'total':total,'explicit':False}
    if length==400 or total==100:
        with pytest.raises(ContextTooLong,match='缩小任务范围'):
            scoped_prompt({}, '范围检查', '检查任务', evidence, [], scope, 1400)
    selected=evidence[:3]
    optional={'id':'S1','text':'补充技术说明'*1200}
    history=[{'role':'user','content':'早期问题'*2600},{'role':'assistant','content':'旧回答'}]
    prompt, retained, receipt=scoped_prompt(
        {},'范围检查','检查任务',selected+[optional],history,{**scope,'used':2,'explicit':True},1400)
    assert retained==selected and text in prompt[0]['content']
    assert receipt['used']==2 and receipt['total']==total
    assert receipt['history_used']==0 and receipt['history_total']==2
    assert receipt['sources_used']==0 and receipt['sources_total']==1
    assert receipt['estimated_input_units']<=receipt['available_input_units']
