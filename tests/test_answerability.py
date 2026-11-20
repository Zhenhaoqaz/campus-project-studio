import asyncio
from backend.answerability import missing_fact_answer
from backend.query_rewrite import rewrite_search_query

def test_realtime_facts_are_not_guessed_but_design_questions_are_allowed():
    assert missing_fact_answer('今天食堂实时排队人数有多少？',{},[])['reason']=='no-live-campus-data'
    assert missing_fact_answer('如何设计食堂实时排队人数接口？',{},[]) is None

def test_private_credentials_and_grades_not_invented():
    assert missing_fact_answer('学校教务系统的访问令牌是什么？',{},[])['reason']=='missing-institution-integration'
    assert missing_fact_answer('我们这门课不做登录扣几分？',{},[])['reason']=='missing-grading-rule'
    assert missing_fact_answer('如何把访问令牌放到后端配置？',{},[]) is None

def test_project_deadline_not_presented_as_teacher_exam_date():
    result=missing_fact_answer('第十二周验收能确定是几月几日？',{'deadline':'2026-12-01'},[])
    assert result['reason']=='missing-academic-calendar' and '不自动等同' in result['answer']

def test_search_interpretation_resolves_context_without_old_assistant_answers():
    recorded=[]
    async def generator(prompts,**kwargs):
        recorded.extend(prompts)
        yield '{"query":"React 列表记录的稳定 key 与删除后状态错位"}'
    history=[{'role':'user','content':'我使用 React 展示可删除的物品。'},{'role':'assistant','content':'不应被当作事实'}]
    value,meta=asyncio.run(rewrite_search_query('顺序能当身份吗？',history,{'id':'test-rewrite-context'},generator))
    assert 'key' in value and meta['mode']=='interpreted'
    assert '不应被当作事实' not in recorded[-1]['content']

def test_bad_search_interpretation_falls_back_without_failing_question():
    async def broken(*args,**kwargs):
        yield '不是JSON'
    result,meta=asyncio.run(rewrite_search_query('一个有效问题',[],{'id':'test-rewrite-bad'},broken))
    assert result=='一个有效问题' and meta['mode']=='original-fallback'
