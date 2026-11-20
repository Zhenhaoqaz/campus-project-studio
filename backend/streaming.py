"""Batch actual upstream deltas, and persist each displayed event atomically."""
import time
from . import db

class TextAccumulator:
    def __init__(self, interval=.08, size=48, clock=time.monotonic):
        self.clock=clock
        self.interval=interval
        self.size=size
        self.content=''
        self.pending=''
        self.last=clock()
        self.sent=False

    def add(self, delta):
        self.content+=delta
        self.pending+=delta
        if not self.sent or len(self.pending)>=self.size or self.clock()-self.last>=self.interval:
            return self.flush()
        return None

    def flush(self):
        if not self.pending:
            return None
        pending=self.pending
        self.pending=''
        self.last=self.clock()
        self.sent=True
        return pending

def save_message_event(run_id, message_id, content, status, kind, payload):
    timestamp=db.now()
    with db.connect() as connection:
        connection.execute('UPDATE messages SET content=?,status=? WHERE id=? AND run_id=?',
                           (content,status,message_id,run_id))
        connection.execute('INSERT INTO events(run_id,type,data,created_at) VALUES(?,?,?,?)',
                           (run_id,kind,db.dump(payload),timestamp))
