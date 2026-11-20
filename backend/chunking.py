"""Source-preserving chapter and paragraph chunks; no model needed for slicing."""
import re
from bs4 import BeautifulSoup

CHUNKER_VERSION = 'section-paragraph-v2'

def clean_sections(sections):
    """Remove translation/navigation notices without removing technical examples."""
    result=[]
    noise=re.compile(r'此页面由社区从英文翻译而来|了解更多并加入 MDN|^View in English|^Always switch to English|^This page was translated|^Skip to (?:main|content)|^Home Menu About Documentation Download|^About Documentation Download Support Purchase$',re.I)
    for section in sections:
        parts=[p.strip() for p in section['text'].split('\n\n') if p.strip() and not noise.search(p.strip())]
        if parts:
            result.append({**section,'text':'\n\n'.join(parts)})
    return result

def clean(text):
    return re.sub(r'\n{3,}', '\n\n', re.sub(r'[ \t]+', ' ', text)).strip()

def extract_sections(html, title, max_chars=65000):
    soup = BeautifulSoup(html, 'html.parser')
    main = soup.select_one('article.main-page-content') or soup.select_one('.vp-doc') or soup.find('main') or soup.find('article') or soup.body
    if main is None:
        raise ValueError('页面没有可识别的正文')
    for element in main.select('script,style,nav,footer,button,svg,aside,header,noscript'):
        element.decompose()
    sections = []
    heading, anchor, blocks, hierarchy = title, '', [], []
    total = 0
    truncated = False
    def flush():
        if blocks:
            sections.append({'heading':heading,'anchor':anchor,'text':'\n\n'.join(blocks)})
            blocks.clear()
    for element in main.find_all(['h1','h2','h3','h4','p','pre','li','table','blockquote']):
        if any(p.name in ('pre','li','table','blockquote') for p in element.parents if p is not main):
            continue
        text = clean(element.get_text('\n' if element.name=='pre' else ' ', strip=True))
        if not text:
            continue
        if total+len(text) > max_chars:
            truncated = True
            break
        if element.name.startswith('h'):
            flush()
            level = int(element.name[1])
            hierarchy = [(lev,value) for lev,value in hierarchy if lev<level]
            hierarchy.append((level,text))
            heading = ' / '.join(value for _,value in hierarchy)
            anchor = element.get('id','')
        elif len(text)>12 and text not in blocks:
            blocks.append(text)
            total += len(text)
    flush()
    if total<200:
        # Some official SQLite pages use legacy markup without paragraph elements.
        text=clean(main.get_text('\n',strip=True))
        sections=[{'heading':title,'anchor':'','text':text[:max_chars]}]
        total=len(sections[0]['text'])
        truncated=len(text)>max_chars
    sections=clean_sections(sections)
    return {'sections':sections,'characters':sum(len(s['text']) for s in sections),'truncated':truncated,'chunker_version':CHUNKER_VERSION}

def split_text(text, size=900, overlap=120):
    if size<100 or overlap<0 or overlap>=size//2:
        raise ValueError('切片长度或重叠配置无效')
    text=clean(text)
    result=[]
    start=0
    while start<len(text):
        end=min(len(text),start+size)
        if end<len(text):
            lower=start+size//2
            candidates=[text.rfind(separator,lower,end) for separator in ['\n\n','\n','。','；','. ']]
            cut=max(candidates)
            if cut>start:
                end=cut+1
        if text[start:end].strip():
            result.append({'text':text[start:end].strip(),'start':start,'end':end})
        if end>=len(text):
            break
        start=max(start+1,end-overlap)
    return result

def make_chunks(sections, size=900, overlap=120):
    output=[]
    seen=set()
    for section in clean_sections(sections):
        for piece in split_text(section['text'],size,overlap):
            key=re.sub(r'\s+','',piece['text'])
            if len(key)<35 or key in seen:
                continue
            seen.add(key)
            output.append({**piece,'heading':section.get('heading',''),'anchor':section.get('anchor',''), 'ordinal':len(output)})
    return output
