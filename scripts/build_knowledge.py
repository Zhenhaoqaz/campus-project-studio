"""校园项目资料包：按章节采集、切片和向量化，暂存成功后再更新独立索引。"""
import argparse
import asyncio
import hashlib
import json
import os
import sqlite3
import sys
from pathlib import Path
import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from backend import rag
from backend.config import DATA, EMBED_MODEL
from backend.db import now
from backend.model import embed
from backend.chunking import CHUNKER_VERSION, extract_sections, make_chunks, split_text, clean_sections
from knowledge_sources import SOURCES, GUIDES, CATEGORY_LABELS

async def fetch_source(client, source, folder, refresh):
    doc_id,title,url,category = source
    cache=folder/f'{doc_id}.sections.json'
    if cache.exists() and not refresh:
        body=json.loads(cache.read_text(encoding='utf-8'))
        if body.get('chunker_version')==CHUNKER_VERSION:
            return {**body,'id':doc_id,'title':title,'source':url,'category':category,'kind':'official'}
    for attempt in range(3):
        try:
            response=await client.get(url)
            response.raise_for_status()
            body=extract_sections(response.text,title)
            if body['characters']<200:
                raise ValueError('正文过短')
            body.update({'source':str(response.url),'fetched_at':now()})
            cache.write_text(json.dumps(body,ensure_ascii=False,indent=2),encoding='utf-8')
            text='\n\n'.join(s['heading']+'\n'+s['text'] for s in body['sections'])
            (folder/f'{doc_id}.txt').write_text(text,encoding='utf-8')
            return {**body,'id':doc_id,'title':title,'category':category,'kind':'official'}
        except (httpx.HTTPError,ValueError):
            if attempt==2:
                if cache.exists():
                    body=json.loads(cache.read_text(encoding='utf-8'))
                    return {**body,'id':doc_id,'title':title,'source':url,'category':category,'kind':'official','cached_after_error':True}
                raise
            await asyncio.sleep(attempt+1)

async def main(refresh=False):
    live=rag.INDEX
    staging=live.with_name('campus_knowledge.next.sqlite')
    if not staging.exists() and live.exists():
        with sqlite3.connect(live) as original, sqlite3.connect(staging) as target:
            original.backup(target)
        original.close()
        target.close()
    rag.INDEX=staging
    rag.init_index()
    folder=DATA/'campus_materials'
    folder.mkdir(exist_ok=True)
    records,failures=[],[]
    limit=asyncio.Semaphore(4)
    # Public sources follow the host's existing proxy configuration; model calls remain local.
    async with httpx.AsyncClient(timeout=40,follow_redirects=True,trust_env=True,headers={'User-Agent':'CampusMaterials/2.0 reference collector'}) as client:
        async def fetch_one(source):
            async with limit:
                try:
                    record=await fetch_source(client,source,folder,refresh)
                    print(f'collected {source[0]}: {record["characters"]} chars / {len(record["sections"])} sections',flush=True)
                    return record
                except Exception as exc:
                    failures.append({'id':source[0],'url':source[2],'error':type(exc).__name__})
                    print(f'collection failed {source[0]}: {type(exc).__name__}',flush=True)
                    return None
        fetched=await asyncio.gather(*(fetch_one(source) for source in SOURCES))
        records.extend(r for r in fetched if r)
    for key,(title,text,category) in GUIDES.items():
        doc_id='guide-'+key if not key.startswith('guide-') else key
        sections=[{'heading':title,'anchor':'','text':text}]
        (folder/f'{doc_id}.txt').write_text(text,encoding='utf-8')
        records.append({'id':doc_id,'title':title,'source':'','kind':'guide','category':category,'sections':sections,'characters':len(text),'truncated':False,'fetched_at':now()})
    for record in records:
        doc_id=record['id']
        record['sections']=clean_sections(record['sections'])
        record['characters']=sum(len(s['text']) for s in record['sections'])
        (folder/f'{doc_id}.txt').write_text('\n\n'.join(s['heading']+'\n'+s['text'] for s in record['sections']),encoding='utf-8')
        chunks=make_chunks(record['sections'])
        digest=hashlib.sha256(json.dumps(record['sections'],ensure_ascii=False).encode()).hexdigest()
        build_key=hashlib.sha256((digest+CHUNKER_VERSION+EMBED_MODEL).encode()).hexdigest()
        with rag.index_connect() as c:
            old=c.execute('SELECT metadata FROM documents WHERE id=?',(doc_id,)).fetchone()
            count=c.execute('SELECT COUNT(*) FROM chunks WHERE doc_id=? AND model=?',(doc_id,EMBED_MODEL)).fetchone()[0]
        if old and json.loads(old['metadata']).get('build_key')==build_key and count==len(chunks):
            print(f'cached {doc_id}: {count}',flush=True)
            continue
        vectors=[]
        for start in range(0,len(chunks),12):
            batch=chunks[start:start+12]
            for attempt in range(3):
                try:
                    vectors.extend(await embed([record['title']+'\n'+p['heading']+'\n'+p['text'] for p in batch]))
                    break
                except httpx.HTTPError:
                    if attempt==2:
                        raise
                    await asyncio.sleep(attempt+1)
        metadata={'build_key':build_key,'chunker_version':CHUNKER_VERSION,'characters':record['characters'],'sections':len(record['sections']),'truncated':record['truncated'],'embedding_model':EMBED_MODEL}
        with rag.index_connect() as c:
            c.execute('DELETE FROM chunks WHERE doc_id=?',(doc_id,))
            c.execute('''INSERT OR REPLACE INTO documents(id,title,source,kind,path,sha256,fetched_at,category,metadata)
                VALUES(?,?,?,?,?,?,?,?,?)''',(doc_id,record['title'],record['source'],record['kind'],str((folder/f'{doc_id}.txt').relative_to(ROOT)),digest,record['fetched_at'],record['category'],json.dumps(metadata,ensure_ascii=False)))
            for chunk,vector in zip(chunks,vectors):
                cid=f'{doc_id}:{chunk["ordinal"]}'
                c.execute('''INSERT INTO chunks(id,doc_id,text,vector,model,heading,anchor,ordinal) VALUES(?,?,?,?,?,?,?,?)''',
                    (cid,doc_id,chunk['text'],json.dumps(vector),EMBED_MODEL,chunk['heading'],chunk['anchor'],chunk['ordinal']))
        print(f'indexed {doc_id}: {len(chunks)} chunks',flush=True)
    with rag.index_connect() as c:
        c.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    summary=rag.stats()
    with rag.index_connect() as c:
        c.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    rag.INDEX=live
    os.replace(staging,live)
    manifest={'name':'校园项目资料包','created_at':now(),'stats':summary,'chunking':{'version':CHUNKER_VERSION,'size':900,'overlap':120},'categories':CATEGORY_LABELS,'failures':failures,
              'sources':[{'id':r['id'],'title':r['title'],'url':r['source'],'kind':r['kind'],'category':r['category'],'characters':r['characters'],'sections':len(r['sections']),'truncated':r['truncated']} for r in records]}
    (folder/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    (folder/'README.md').write_text('# 校园项目资料包\n\n包含官方 Web 技术参考资料与项目规划建议，支持资料检索、方案整理和任务协作。官方资料保留来源与章节；自编模板标为建议。独立索引不影响其他资料集合。\n\n详情见 manifest.json 中来源、分类、切片配置与采集记录。模型生成向量，本地程序负责切片。\n',encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--refresh',action='store_true')
    asyncio.run(main(parser.parse_args().refresh))
