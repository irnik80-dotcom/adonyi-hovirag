CREATE TABLE IF NOT EXISTS workers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A tétel soha nem módosul és nem törlődik. Hibát sztornó tétel javít.
-- minutes: előjeles egész perc (+ jóváírás, - felhasználás).
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id INTEGER NOT NULL REFERENCES workers(id),
  date TEXT NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes <> 0),
  kind TEXT NOT NULL CHECK (kind IN ('opening','credit','use','reversal')),
  note TEXT NOT NULL DEFAULT '',
  reverses_id INTEGER REFERENCES entries(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS entries_one_reversal ON entries(reverses_id) WHERE reverses_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS entries_worker ON entries(worker_id, date, id);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
