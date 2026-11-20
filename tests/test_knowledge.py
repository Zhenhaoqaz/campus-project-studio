from backend.chunking import extract_sections,make_chunks,split_text
from backend.rag import citation_audit,expanded_query,rank_shared,combine_queries,normalize_record_citations
import pytest

def test_heading_and_source_anchor_preserved():
    article='<main><nav>不应入库的目录内容</nav><h1>布局</h1><h2 id="grid">网格布局</h2><p>'+('网格布局应根据屏幕设置列。'*15)+'</p><h2 id="flex">弹性布局</h2><p>'+('弹性布局控制主轴与交叉轴。'*15)+'</p></main>'
    extracted=extract_sections(article,'布局')
    chunks=make_chunks(extracted['sections'])
    assert {c['anchor'] for c in chunks}=={'grid','flex'}
    assert all('目录' not in c['text'] for c in chunks)
    assert not any('网格布局' in c['text'] and '弹性布局' in c['text'] for c in chunks)

def test_split_covers_long_text_and_stays_bounded():
    text=''.join(f'第{i}段正文内容。\n' for i in range(250))
    chunks=split_text(text,450,60)
    assert len(chunks)>3 and all(len(c['text'])<=450 for c in chunks)
    assert chunks[0]['start']==0 and chunks[-1]['end']==len(text.strip())
    assert all(a['end']>=b['start'] for a,b in zip(chunks,chunks[1:]))

def test_bad_overlap_rejected():
    with pytest.raises(ValueError):
        split_text('x'*1000,400,300)

def test_translation_notice_is_not_a_knowledge_chunk():
    sections=[{'heading':'MDN','text':'此页面由社区从英文翻译而来。了解更多并加入 MDN。\n\nView in English Always switch to English'},
              {'heading':'标签关联','text':'label 使用 for 属性与 input 的 id 关联，点击标签能聚焦对应输入控件。'*3}]
    chunks=make_chunks(sections)
    assert len(chunks)==1 and chunks[0]['heading']=='标签关联'

def test_repeated_paragraph_not_duplicated():
    body='有实际内容的段落，需要保留来源和章节标识，不能重复灌入索引。'*4
    result=make_chunks([{'heading':'同一节','text':body},{'heading':'重复节','text':body}])
    assert len(result)==1

def test_query_expands_bilingual_technical_terms():
    query=expanded_query('如何取消请求并校验表单？')
    assert 'AbortController' in query and 'validation' in query

def test_grouped_citations_reject_unknown_ids():
    assert not citation_audit('资料 [S1, S9]',[{'id':'S1'}])['valid']

def test_query_interpretation_cannot_remove_original_evidence():
    original={'id':'a','doc_id':'http','heading':'HTTP status','text':'Fetch 对 HTTP 404 仍返回Response，需要检查ok属性。','semantic_score':.7}
    interpreted={'id':'b','doc_id':'react','heading':'Error UI','text':'React 可以在界面中展示错误状态。','semantic_score':.8}
    result=combine_queries([original],[interpreted],5)
    assert result[0]['id']=='a' and {r['id'] for r in result}=={'a','b'}
    assert result[0]['matched_queries']==['original']


def test_known_project_record_citations_normalize_without_touching_code():
    evidence=[{'id':'R6','doc_id':'demo-r6','project_id':'demo'}]
    text='原文 [demo-r6]，示例 `[demo-r6]`。\n```js\nconst x = [S99];\n```'
    normalized=normalize_record_citations(text,evidence)
    assert normalized.startswith('原文 [R6]') and '`[demo-r6]`' in normalized
    audit=citation_audit(normalized,evidence)
    assert audit['valid'] and audit['cited']==['R6']
    assert not citation_audit(normalized+'未知资料 [S99]',evidence)['valid']
