import sqlite3
from pathlib import Path
sql=Path(__file__).resolve().parents[1].joinpath('sql/001.sql').read_text()
statements=[x.strip() for x in '\n'.join(l for l in sql.splitlines() if not l.lstrip().startswith('--')).split(';') if x.strip()]
for s in statements:
    assert s.upper().startswith(('CREATE TABLE IF NOT EXISTS VLADWATCH_', 'CREATE INDEX IF NOT EXISTS IX_VLADWATCH_')),s
con=sqlite3.connect(':memory:')
con.executescript(sql)
con.executescript(sql)
tables=[x[0] for x in con.execute("select name from sqlite_master where type='table' and name like 'vladwatch_%'")]
assert len(tables)==4,tables
print('VLADWATCH_SQL_IDEMPOTENT_NAMESPACED',len(tables),len(statements))