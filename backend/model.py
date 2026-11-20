import json
import math
import os
import re
import httpx
from .config import OLLAMA, MODEL, EMBED_MODEL

async def embed(texts):
    async with httpx.AsyncClient(timeout=120, trust_env=False) as client:
        r = await client.post(f'{OLLAMA}/api/embed', json={'model':EMBED_MODEL,'input':texts,'truncate':False,'keep_alive':'5m'})
        r.raise_for_status()
        values = r.json()['embeddings']
        if len(values) != len(texts) or not values:
            raise ValueError('向量返回数量不匹配')
        dimension=len(values[0])
        if not dimension or any(len(v)!=dimension or not all(isinstance(x,(int,float)) and math.isfinite(x) for x in v) or not any(x!=0 for x in v) for v in values):
            raise ValueError('向量维度或数值无效')
        return values

def budget_settings():
    try:
        context=int(os.getenv('CAMPUS_MODEL_CONTEXT_TOKENS','12288'))
        reserve=int(os.getenv('CAMPUS_MODEL_RESERVED_TOKENS','768'))
        scale=float(os.getenv('CAMPUS_MODEL_ESTIMATE_SCALE','1.15'))
    except (TypeError,ValueError) as error:
        raise ValueError('模型上下文预算配置无效，请检查本地环境变量') from error
    if context<512 or reserve<128 or reserve>=context or not math.isfinite(scale) or scale<1 or scale>4:
        raise ValueError('模型上下文预算配置无效，请检查窗口、预留量和估算系数')
    return context,reserve,scale


def estimate_text_units(text):
    """Conservative heuristic units, deliberately not a tokenizer or exact token count."""
    units=0.0
    for item in re.findall(r'[A-Za-z0-9_]+|\s+|.',text,re.S):
        if item.isspace():
            units+=max(1,len(item)/8)
        elif item.isascii() and re.fullmatch(r'[A-Za-z0-9_]+',item):
            units+=max(1,math.ceil(len(item)/3))
        elif item.isascii():
            units+=1
        else:
            units+=1.3
    return units


class ContextTooLong(ValueError):
    pass


def input_budget(messages,schema,max_tokens):
    context,reserve,scale=budget_settings()
    if type(max_tokens) is not int or max_tokens<=0 or max_tokens>=context-reserve:
        raise ValueError('本次回答的输出预算无效，请缩短预期回答或检查上下文配置')
    if not isinstance(messages,list) or not messages:
        raise ValueError('模型请求缺少有效对话消息')
    estimate=64.0
    for message in messages:
        if not isinstance(message,dict) or message.get('role') not in ('system','user','assistant') or not isinstance(message.get('content'),str):
            raise ValueError('模型请求消息格式无效，只支持文本对话')
        estimate+=estimate_text_units(message['content'])+16
    if schema is not None:
        try:
            estimate+=estimate_text_units(json.dumps(schema,ensure_ascii=False))+32
        except (TypeError,ValueError) as error:
            raise ValueError('结构化输出约束无效') from error
    estimated=math.ceil(estimate*scale)
    available=context-max_tokens-reserve
    if estimated>available:
        raise ContextTooLong(f'当前问题、项目要求与历史资料过长（保守估算约 {estimated} 单位，可用约 {available}）。'
                         '请缩短问题或要求、减少资料，或新建会话后重试；系统没有截断原文。')
    return {'context':context,'reserved':reserve,'estimated_input_units':estimated,'available_input_units':available}


class VisibleText:
    """Keep tagged thinking private even when the tag straddles NDJSON chunks."""
    opening='<think>'
    closing='</think>'

    def __init__(self):
        self.pending=''
        self.hidden=False

    def feed(self,text):
        self.pending+=text
        visible=[]
        while self.pending:
            token=self.closing if self.hidden else self.opening
            location=self.pending.lower().find(token)
            if location>=0:
                if not self.hidden:
                    visible.append(self.pending[:location])
                self.pending=self.pending[location+len(token):]
                self.hidden=not self.hidden
                continue
            # Hold only the suffix that may be the start of a private tag.
            keep=0
            for length in range(1,min(len(token)-1,len(self.pending))+1):
                if self.pending[-length:].lower()==token[:length]:
                    keep=length
            body=self.pending[:-keep] if keep else self.pending
            if not self.hidden:
                visible.append(body)
            self.pending=self.pending[-keep:] if keep else ''
            break
        return ''.join(visible)

    def finish(self):
        if self.hidden or self.pending:
            raise ValueError('模型输出包含未闭合的内容标记，本次回答未完成，请重试')


async def chat(messages, *, schema=None, max_tokens=1500):
    budget=input_budget(messages,schema,max_tokens)
    payload = {'model':MODEL,'messages':messages,'stream':True,'think':False,'keep_alive':'5m','options':{'temperature':0.25,'num_predict':max_tokens,'num_ctx':budget['context']}}
    if schema:
        payload['format'] = schema
        payload['options']['temperature'] = 0
    done = False
    saw_message=False
    saw_visible=False
    visible=VisibleText()
    async with httpx.AsyncClient(timeout=httpx.Timeout(300,connect=10),trust_env=False) as client:
        async with client.stream('POST',f'{OLLAMA}/api/chat',json=payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line:
                    continue
                try:
                    part = json.loads(line)
                except json.JSONDecodeError as error:
                    raise ValueError('模型返回了无法解析的数据，本次回答未完成，请重试') from error
                if not isinstance(part,dict):
                    raise ValueError('模型返回的数据格式无效，本次回答未完成')
                if part.get('error'):
                    raise ValueError('模型服务未完成请求')
                if 'done' in part and type(part['done']) is not bool:
                    raise ValueError('模型返回的完成标记无效，本次回答未完成')
                message=part.get('message')
                if message is None:
                    # Some compatible runtimes send only statistics in the final chunk.
                    if not (part.get('done') is True and saw_message):
                        raise ValueError('模型返回缺少有效消息，本次回答未完成')
                    message={}
                if not isinstance(message,dict):
                    raise ValueError('模型返回的消息结构无效，本次回答未完成')
                if 'content' not in message and message and 'thinking' not in message:
                    raise ValueError('模型返回缺少正文内容，本次回答未完成')
                content=message.get('content','')
                if not isinstance(content,str):
                    raise ValueError('模型返回的正文格式无效，本次回答未完成')
                saw_message=saw_message or bool(message)
                # message.thinking is never yielded or serialized as user-visible content.
                if content:
                    text=visible.feed(content)
                    if text:
                        saw_visible=saw_visible or bool(text.strip())
                        yield text
                if part.get('done') is True:
                    if part.get('done_reason') == 'length':
                        raise ValueError('回答达到长度上限，请缩小问题范围后重试')
                    done = True
                    break
    if not done:
        raise ValueError('模型连接提前结束，回答未完成')
    visible.finish()
    if not saw_visible:
        raise ValueError('模型未返回有效正文，请调整问题后重试')
