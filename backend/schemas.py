from typing import Literal, Annotated
from datetime import date
from pydantic import BaseModel, Field, ConfigDict
import json
import re
import unicodedata

def normalize_task_title(title):
    """Ignore presentation differences when comparing task identities."""
    value=unicodedata.normalize('NFKC',title).casefold()
    return ''.join(c for c in value if c.isalnum())

def parse_plan(text):
    # Some older model runtimes ignore the format option and return a fenced object.
    stripped=re.sub(r'^\s*```(?:json)?\s*','',text.strip(),flags=re.I)
    stripped=re.sub(r'\s*```\s*$','',stripped)
    return PlanSpec.model_validate_json(stripped)

def authoritative_requirement_answer(question,evidence):
    # Mentioning requirements while reviewing tasks is not a request to repeat rules.
    task_review=re.search(r'评审|已保存(?:关联|验收|依赖|前置)|检查(?:当前|这些|已保存|我的).{0,18}任务|任务.{0,16}(?:关联|验收|依赖|前置)',question)
    rule_lookup=re.search(r'原文|必须|强制|硬性|规定|(?:老师|教师).{0,8}(?:是否|要求做|要求了|要求有|要求必须)',question)
    if task_review and not rule_lookup:
        return None
    authority=re.search(r'老师|教师|课程要求|验收要求|作业要求|评分标准|课程规定|硬性要求',question)
    project_obligation=(re.search(r'必须|一定要|强制|硬性|规定',question) and re.search(r'作业|课程|验收|项目',question))
    if not authority and not project_obligation:
        return None
    teachers=[e for e in evidence if e['kind']=='teacher']
    if not teachers:
        return '当前项目尚未确认老师要求，无法判断哪些功能属于硬性要求。请先添加课程原文；技术资料和 AI 建议不能代替老师要求。'
    lines=['### 以已确认的课程原文为准','以下内容直接来自当前项目中标记为“老师要求”的记录：','']
    lines.extend(f'- {e["text"]} [{e["id"]}]' for e in teachers)
    text=' '.join(e['text'] for e in teachers)
    topics=[name for name,aliases in [('登录',['登录','注册']),('数据库',['数据库','MySQL','SQLite']),('后台管理',['后台管理']),('文件上传',['文件上传','文档上传'])] if any(a.lower() in question.lower() for a in aliases) and not any(a.lower() in text.lower() for a in aliases)]
    if topics:
        lines+=['','### 关于你问的功能',f'上述课程原文没有直接要求“{"、".join(topics)}”。是否采用应根据具体功能决定，不能把技术建议写成老师的硬性规定。']
    lines+=['','> 这是已确认要求的原文汇总，不扩大解释。个人约束与方法建议仍需分别看待；原文未明确的内容应向老师确认。']
    return '\n'.join(lines)

Version = Annotated[str, Field(pattern=r'^[0-9a-f]{64}$')]

class ProjectInput(BaseModel):
    model_config=ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1,max_length=80)
    course: str = Field(default='未指定课程',max_length=80)
    brief: str = Field(default='',max_length=6000)
    deadline: date | None = None
    skills: str = Field(default='',max_length=600)
    budget: str = Field(default='',max_length=600)
    expected_version: Version | None = None

class RequirementInput(BaseModel):
    model_config=ConfigDict(str_strip_whitespace=True)
    text: str = Field(min_length=1,max_length=1800)
    kind: Literal['teacher','personal','suggestion'] = 'personal'
    source: str = Field(default='用户确认',max_length=120)
    expected_version: Version | None = None

class TaskInput(BaseModel):
    model_config=ConfigDict(str_strip_whitespace=True)
    title: str = Field(min_length=1,max_length=160)
    description: str = Field(default='',max_length=2400)
    status: Literal['todo','doing','done'] = 'todo'
    priority: Literal['high','medium','low'] = 'medium'
    acceptance: str = Field(default='',max_length=1400)
    dependencies: list[Annotated[str,Field(min_length=1,max_length=100)]] | None = Field(default=None,max_length=80)
    requirement_ids: list[Annotated[str,Field(min_length=1,max_length=100)]] | None = Field(default=None,max_length=80)
    expected_version: str | None = Field(default=None,min_length=64,max_length=64,pattern=r'^[0-9a-f]{64}$')

class TaskStatusInput(BaseModel):
    model_config=ConfigDict(str_strip_whitespace=True,extra='forbid')
    status: Literal['todo','doing','done']
    expected_version: str = Field(min_length=64,max_length=64,pattern=r'^[0-9a-f]{64}$')

class ConversationInput(BaseModel):
    model_config=ConfigDict(str_strip_whitespace=True)
    title: str = Field(default='新的对话',min_length=1,max_length=80)
    expected_version: Version | None = None

class ChatInput(BaseModel):
    model_config=ConfigDict(str_strip_whitespace=True)
    text: str = Field(min_length=1,max_length=4000)
    request_id: str = Field(min_length=8,max_length=100)
    mode: Literal['chat','planner','reviewer','plan'] = 'chat'
    task_ids: list[Annotated[str, Field(min_length=1,max_length=100)]] | None = None

class PlanTask(BaseModel):
    model_config=ConfigDict(str_strip_whitespace=True,extra='forbid')
    key: str = Field(min_length=1,max_length=30)
    title: str = Field(min_length=1,max_length=120)
    description: str = Field(max_length=1600)
    priority: Literal['high','medium','low']
    acceptance: str = Field(min_length=1,max_length=1000)
    requirement_ids: list[str]
    dependencies: list[str]

class PlanSpec(BaseModel):
    model_config=ConfigDict(str_strip_whitespace=True,extra='forbid')
    summary: str = Field(min_length=1,max_length=1500)
    milestones: list[str] = Field(min_length=1,max_length=6)
    risks: list[str] = Field(max_length=10)
    tasks: list[PlanTask] = Field(min_length=1,max_length=12)

class PlanRevisionInput(PlanSpec):
    context_fingerprint: str = Field(min_length=64,max_length=64,pattern=r'^[0-9a-f]{64}$')

def validate_plan(plan,requirements):
    tasks=plan.tasks
    keys={t.key for t in tasks}
    if len(keys)!=len(tasks):
        raise ValueError('计划中有重复任务编号')
    titles=[normalize_task_title(t.title) for t in tasks]
    if any(not t for t in titles):
        raise ValueError('任务名称必须包含有效文字')
    if len(set(titles))!=len(titles):
        raise ValueError('计划中有重复任务名称，请合并后重新整理')
    allowed={r['id'] for r in requirements}
    for t in tasks:
        if set(t.requirement_ids)-allowed:
            raise ValueError('计划引用了不存在的要求')
        if set(t.dependencies)-keys:
            raise ValueError('任务依赖编号不存在')
    graph={t.key:t.dependencies for t in tasks}
    seen=set()
    active=set()
    def visit(key):
        if key in active:
            raise ValueError('任务依赖存在循环')
        if key in seen:
            return
        active.add(key)
        for other in graph[key]:
            visit(other)
        active.remove(key)
        seen.add(key)
    for key in keys:
        visit(key)
    covered={r for t in tasks for r in t.requirement_ids}
    missing=[r['id'] for r in requirements if r['kind']=='teacher' and r['id'] not in covered]
    teacher_ids={r['id'] for r in requirements if r['kind']=='teacher'}
    return {'missing_requirements':missing,'valid':True,'complete':not missing,
            'teacher_total':len(teacher_ids),'teacher_covered':len(teacher_ids)-len(missing)}
