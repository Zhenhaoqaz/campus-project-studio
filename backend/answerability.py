"""Conservative boundaries for facts absent from static project documentation."""
import re

def missing_fact_answer(question, project, evidence):
    teachers=[e for e in evidence if e['kind']=='teacher']
    text=' '.join(e['text'] for e in teachers)
    technical=bool(re.search(r'如何|怎么|怎样|设计|实现|开发|模拟|架构|原理|代码',question))
    reason=None
    answer=None
    if re.search(r'扣几分|扣多少|扣分分值|确定分数|能得几分|评分权重',question) and not re.search(r'(?:扣|权重|分值).{0,15}\d',text):
        reason='missing-grading-rule'
        answer='当前已确认的课程原文没有给出这项功能的具体扣分分值或评分权重，因此无法提供确定分数。可以按已有评价指标检查完成情况；具体扣分应以老师提供的评分细则为准。'
    elif not technical and re.search(r'实时|今天|今晚|明天|现在',question) and re.search(r'排队|人数|窗口|菜单|空位|余量|天气|班车',question):
        reason='no-live-campus-data'
        answer='当前资料库提供项目方法和技术参考，没有连接学校的实时运营数据，无法查出这些即时信息。可以提供经确认的数据来源后继续分析，也可以讨论如何设计这类数据接入功能。'
    elif not technical and re.search(r'学校|校方|教务|校园',question) and re.search(r'正式.*API|API.*地址|访问令牌|token|密钥|密码',question,re.I):
        reason='missing-institution-integration'
        answer='现有资料没有提供学校系统的正式接入地址或访问凭据，不能生成或猜测。请通过学校认可的接入文档和授权渠道确认；这里可以继续帮助整理接口字段、错误处理和集成步骤。'
    elif not technical and re.search(r'验收|教学周|第.{0,4}周',question) and re.search(r'几月|几日|公历|确定.*日期|具体.*日期',question) and not re.search(r'20\d\d[-年/]\d',text):
        reason='missing-academic-calendar'
        answer='仅凭“第几周验收”无法确定公历日期，还需要本课程的开课时间或教学周日历，以及老师确认的安排。当前应保留“具体日期待确认”，不能自行推算成确定的验收日。'
        if project.get('deadline'):
            answer+=f' 项目中另有你设置的截止日期 {project["deadline"]}，它不自动等同于老师确认的验收日期。'
    if not answer:
        return None
    supporting=[]
    if reason=='missing-grading-rule':
        supporting=[e for e in teachers if re.search(r'评价|评分|扣分|分值|权重',e['text'])]
    elif reason=='missing-academic-calendar':
        supporting=[e for e in teachers if re.search(r'验收|教学周',e['text'])]
    if supporting:
        answer+='\n\n### 相关课程原文\n'+'\n'.join(f'- {e["text"]} [{e["id"]}]' for e in supporting)
    return {'answer':answer,'reason':reason,'evidence':supporting}
