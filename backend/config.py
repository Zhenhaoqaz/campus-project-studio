import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.getenv('CAMPUS_DATA_DIR', str(ROOT / 'data')))
DATA.mkdir(parents=True, exist_ok=True)
DB = DATA / 'campus_app.sqlite'
INDEX = DATA / 'campus_knowledge.sqlite'
OLLAMA = os.getenv('OLLAMA_URL', 'http://127.0.0.1:11434').rstrip('/')
MODEL = os.getenv('CHAT_MODEL', 'qwen3.5:4b')
EMBED_MODEL = os.getenv('EMBED_MODEL', 'qwen3-embedding:0.6b')
