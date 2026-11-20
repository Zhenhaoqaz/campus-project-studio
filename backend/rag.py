"""Isolated campus retrieval with section-aware, diversified evidence."""
import json
import math
import re
import sqlite3
import time
from collections import Counter
from contextlib import contextmanager
from .config import INDEX, EMBED_MODEL
from .model import embed
from . import db

_corpus_cache = None
_query_cache = {}

@contextmanager
def index_connect():
    connection = sqlite3.connect(INDEX, timeout=30)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    except BaseException:
        connection.rollback()
        raise
    finally:
        connection.close()

def init_index():
    with index_connect() as c:
        c.executescript('''PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,title TEXT NOT NULL,source TEXT NOT NULL,kind TEXT NOT NULL,path TEXT NOT NULL,sha256 TEXT NOT NULL,fetched_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS chunks(id TEXT PRIMARY KEY,doc_id TEXT NOT NULL,text TEXT NOT NULL,vector TEXT NOT NULL,model TEXT NOT NULL,FOREIGN KEY(doc_id) REFERENCES documents(id));''')
        additions = {
            'documents': {'category': "TEXT NOT NULL DEFAULT 'general'", 'metadata': "TEXT NOT NULL DEFAULT '{}'"},
            'chunks': {'heading': "TEXT NOT NULL DEFAULT ''", 'anchor': "TEXT NOT NULL DEFAULT ''", 'ordinal': 'INTEGER NOT NULL DEFAULT 0'},
        }
        for table, fields in additions.items():
            existing = {r['name'] for r in c.execute(f'PRAGMA table_info({table})')}
            for name, declaration in fields.items():
                if name not in existing:
                    c.execute(f'ALTER TABLE {table} ADD COLUMN {name} {declaration}')
        c.execute('CREATE INDEX IF NOT EXISTS chunks_model ON chunks(model,doc_id)')

def stats():
    init_index()
    with index_connect() as c:
        categories = [dict(r) for r in c.execute('''SELECT d.category,COUNT(DISTINCT d.id) documents,COUNT(c.id) chunks
            FROM documents d LEFT JOIN chunks c ON c.doc_id=d.id AND c.model=? GROUP BY d.category ORDER BY documents DESC''', (EMBED_MODEL,))]
        return {
            'documents': c.execute('SELECT COUNT(*) FROM documents').fetchone()[0],
            'chunks': c.execute('SELECT COUNT(*) FROM chunks WHERE model=?', (EMBED_MODEL,)).fetchone()[0],
            'model': EMBED_MODEL, 'backend': 'isolated-sqlite-cosine',
            'categories': categories, 'chunker': 'section-paragraph-v2',
            'indexed_at': c.execute('SELECT MAX(fetched_at) FROM documents').fetchone()[0],
        }

def documents():
    init_index()
    with index_connect() as c:
        return [dict(r) for r in c.execute('''SELECT d.*,COUNT(c.id) AS chunks FROM documents d
            LEFT JOIN chunks c ON c.doc_id=d.id AND c.model=? GROUP BY d.id ORDER BY d.kind,d.category,d.title''', (EMBED_MODEL,))]

def tokenize(text):
    result = re.findall(r'[a-z][a-z0-9]*(?:\.[a-z0-9]+)*', text.lower())
    for run in re.findall(r'[\u4e00-\u9fff]+', text):
        result.extend(run[i:i+2] for i in range(len(run)-1))
        if len(run) == 1:
            result.append(run)
    return result

def tokens(text):
    return set(tokenize(text))

ALIASES = [
    (r'组件', 'component components'), (r'状态|usestate', 'state useState'),
    (r'表单|输入框|必填', 'form input validation'), (r'副作用|useeffect', 'effect useEffect cleanup'),
    (r'响应式|窄屏|手机|媒体查询', 'responsive media queries'),
    (r'流式|事件流|sse', 'server sent events streaming'),
    (r'外键', 'foreign keys'), (r'事务', 'transaction'),
    (r'本地存储|localstorage', 'localStorage storage'),
    (r'网格|三列|grid', 'grid layout'), (r'弹性|flex', 'flexbox'),
    (r'跨域|cors', 'cors cross origin'), (r'键盘|无障碍|可访问', 'accessibility keyboard label'),
    (r'取消|停止.*请求|abort', 'AbortController abort'),
    (r'测试|test', 'testing test'), (r'构建|打包', 'build production'),
]

def expanded_query(question):
    suffix = [words for pattern, words in ALIASES if re.search(pattern, question, re.I)]
    return question + ('\nTechnical terms: ' + ' '.join(suffix) if suffix else '')

def cosine(a, b):
    if len(a) != len(b):
        return 0.0
    return sum(x*y for x,y in zip(a,b)) / (math.sqrt(sum(x*x for x in a))*math.sqrt(sum(x*x for x in b)) or 1)

def corpus():
    global _corpus_cache
    wal = INDEX.with_name(INDEX.name + '-wal')
    signature = (str(INDEX), EMBED_MODEL, INDEX.stat().st_mtime_ns, INDEX.stat().st_size,
                 wal.stat().st_mtime_ns if wal.exists() else 0, wal.stat().st_size if wal.exists() else 0)
    if _corpus_cache and _corpus_cache['signature'] == signature:
        return _corpus_cache
    with index_connect() as c:
        records = [dict(r) for r in c.execute('''SELECT c.*,d.title,d.source,d.kind,d.category FROM chunks c
            JOIN documents d ON d.id=c.doc_id WHERE c.model=?''', (EMBED_MODEL,))]
    frequencies = Counter()
    for r in records:
        r['vector'] = json.loads(r['vector'])
        r['norm'] = math.sqrt(sum(x*x for x in r['vector'])) or 1
        r['terms'] = Counter(tokenize(r['title']+' '+r['heading']+' '+r['text']))
        r['title_terms'] = tokens(r['title']+' '+r['heading'])
        frequencies.update(r['terms'].keys())
        r['length'] = sum(r['terms'].values())
    _corpus_cache = {'signature':signature,'records':records,'df':frequencies,
                     'avg_length':sum(r['length'] for r in records)/max(1,len(records))}
    return _corpus_cache

def lexical_score(record, query_terms, info):
    score = 0
    for term in query_terms:
        count = record['terms'].get(term, 0)
        if not count:
            continue
        df = info['df'].get(term, 0)
        idf = math.log(1+(len(info['records'])-df+.5)/(df+.5))
        denominator = count + 1.2*(.25+.75*record['length']/max(1,info['avg_length']))
        score += idf*count*2.2/denominator + (idf*.5 if term in record['title_terms'] else 0)
    return 1-math.exp(-score/8)

def rank_shared(info, question, query_vector, k):
    query_terms = tokens(question)
    norm = math.sqrt(sum(x*x for x in query_vector)) or 1
    candidates = []
    for record in info['records']:
        if len(record['vector']) != len(query_vector):
            continue
        semantic = sum(x*y for x,y in zip(query_vector,record['vector']))/(norm*record['norm'])
        lexical = lexical_score(record,query_terms,info)
        score = .78*semantic+.22*lexical
        if semantic < .28 and lexical < .18:
            continue
        candidates.append({**record,'score':round(score,5),'semantic_score':round(semantic,5),'lexical_score':round(lexical,5)})
    candidates.sort(key=lambda r:r['score'],reverse=True)
    selected, per_doc = [], Counter()
    for candidate in candidates:
        if per_doc[candidate['doc_id']] >= 2:
            continue
        same_section = [r for r in selected if r['doc_id']==candidate['doc_id'] and r['heading']==candidate['heading']]
        if any(len(tokens(r['text']) & tokens(candidate['text']))/max(1,min(len(tokens(r['text'])),len(tokens(candidate['text'])))) > .78 for r in same_section):
            continue
        selected.append(candidate)
        per_doc[candidate['doc_id']] += 1
        if len(selected) >= k:
            break
    return selected, len(candidates)

def combine_queries(primary, interpreted, k):
    """Keep both readings of the question; a model rewrite cannot replace the original."""
    scores={}
    records={}
    for channel,weight,items in [('original',.55,primary),('interpreted',.45,interpreted)]:
        for rank,item in enumerate(items,1):
            key=item['id']
            scores[key]=scores.get(key,0)+weight/(40+rank)
            if key not in records:
                records[key]={**item,'matched_queries':[]}
            records[key]['matched_queries'].append(channel)
    selected=[]
    per_doc=Counter()
    def accept(item):
        if item['id'] in {r['id'] for r in selected} or per_doc[item['doc_id']]>=2:
            return
        if any(r['doc_id']==item['doc_id'] and r['heading']==item['heading'] and
               len(tokens(r['text']) & tokens(item['text']))/max(1,min(len(tokens(r['text'])),len(tokens(item['text']))))>.78 for r in selected):
            return
        selected.append(records[item['id']])
        per_doc[item['doc_id']]+=1
    # Reserve an original result when it has a meaningful semantic match.
    if primary and primary[0]['semantic_score']>=.4:
        accept(primary[0])
    if interpreted and len(selected)<k:
        accept(interpreted[0])
    for key in sorted(scores,key=lambda key:scores[key],reverse=True):
        if len(selected)>=k:
            break
        accept(records[key])
    return selected

async def retrieve(project_id, question, k=5, alternate_query=None):
    started = time.monotonic()
    init_index()
    requirements = db.rows('SELECT * FROM requirements WHERE project_id=? ORDER BY rowid', (project_id,))
    evidence = [{'id':f'R{i+1}','doc_id':r['id'],'title':r['source'],'kind':r['kind'],
                 'text':r['text'],'source':'','score':1,'project_id':project_id,'category':'project'}
                for i,r in enumerate(requirements)]
    info = corpus()
    if not info['records']:
        return evidence, {'mode':'project-requirements-only','warning':'共享资料尚未建立索引'}
    k=max(1,min(k,8))
    queries=[question[:4000]]
    if alternate_query and alternate_query.strip()!=question.strip():
        queries.append(alternate_query[:4000])
    missing=[q for q in queries if (EMBED_MODEL,q) not in _query_cache]
    if missing:
        vectors=await embed([f'Instruct: Retrieve technical documentation relevant to the question.\nQuery: {q}' for q in missing])
        for q,vector in zip(missing,vectors):
            if len(_query_cache)>=128:
                _query_cache.pop(next(iter(_query_cache)))
            _query_cache[(EMBED_MODEL,q)]=vector
    selected,candidate_count=rank_shared(info,question,_query_cache[(EMBED_MODEL,queries[0])],12 if len(queries)>1 else k)
    if len(queries)>1:
        alternative,_=rank_shared(info,queries[1],_query_cache[(EMBED_MODEL,queries[1])],12)
        selected=combine_queries(selected,alternative,k)
    for i,r in enumerate(selected,1):
        source = r['source'] + ('#'+r['anchor'] if r['source'] and r['anchor'] else '')
        evidence.append({'id':f'S{i}','doc_id':r['doc_id'],'chunk_id':r['id'],'title':r['title'],
                         'kind':r['kind'],'text':r['text'],'source':source,'score':r['score'],
                         'heading':r['heading'],'category':r['category'],'semantic_score':r['semantic_score'],
                         'matched_queries':r.get('matched_queries',['original'])})
    return evidence, {'mode':'semantic-lexical-diversified','model':EMBED_MODEL,'shared_chunks':len(selected),
                      'indexed_chunks':len(info['records']),'candidates':candidate_count,
                      'distinct_documents':len({r['doc_id'] for r in selected}),
                      'query_channels':len(queries),'elapsed_ms':round((time.monotonic()-started)*1000)}

def prose_parts(text):
    return re.split(r'(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)',text)

def normalize_record_citations(text,evidence):
    aliases={item['doc_id']:item['id'] for item in evidence if item.get('project_id') and item.get('doc_id')}
    parts=prose_parts(text)
    for index in range(0,len(parts),2):
        parts[index]=re.sub(r'\[([A-Za-z0-9_-]{3,100})\]',lambda match:'['+aliases[match[1]]+']' if match[1] in aliases else match[0],parts[index])
    return ''.join(parts)

def citation_audit(text, evidence):
    allowed = {e['id'] for e in evidence}
    prose='\n'.join(prose_parts(text)[::2])
    groups = re.findall(r'\[((?:R|S|T)\d+(?:\s*[,，、]\s*(?:R|S|T)\d+)*)\]',prose)
    cited = {identifier for group in groups for identifier in re.findall(r'(?:R|S|T)\d+',group)}
    return {'valid':not(cited-allowed),'cited':sorted(cited&allowed),'invalid':sorted(cited-allowed),'has_citations':bool(cited&allowed)}
