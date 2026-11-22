// Az adatbázis váza. Minden indításkor lefut, de csak létrehoz, soha nem töröl (IF NOT EXISTS).
// A tétel soha nem módosul és nem törlődik. Hibát sztornó tétel javít.
// minutes: előjeles egész perc (+ jóváírás, - felhasználás).
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS workers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id INTEGER NOT NULL REFERENCES workers(id),
    date TEXT NOT NULL,
    minutes INTEGER NOT NULL CHECK (minutes <> 0),
    kind TEXT NOT NULL CHECK (kind IN ('opening','credit','use','reversal')),
    note TEXT NOT NULL DEFAULT '',
    reverses_id INTEGER REFERENCES entries(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS entries_one_reversal ON entries(reverses_id) WHERE reverses_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS entries_worker ON entries(worker_id, date, id)`,
  `CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL DEFAULT (datetime('now')),
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT ''
  )`,
  // Aláírt kimutatások nyilvántartása (a papír aláírása megtörtént). Nem könyvelési tétel, törölhető.
  `CREATE TABLE IF NOT EXISTS signatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id INTEGER NOT NULL REFERENCES workers(id),
    from_date TEXT NOT NULL,
    to_date TEXT NOT NULL,
    signed_on TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS signatures_worker ON signatures(worker_id, to_date)`,
  // Beállítások (jelszó-hash, munkamenet-verzió). A jelszó-hash soha nem kerül a mentésbe.
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  // Sikertelen belépések (brute-force védelem)
  `CREATE TABLE IF NOT EXISTS login_failures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  // Offline rögzített tételek ismételt beküldése ne duplázzon
  `CREATE TABLE IF NOT EXISTS client_requests (
    client_id TEXT PRIMARY KEY,
    ids TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  // Dolgozói csoportok (munkakör szerint). Egy dolgozó több csoportban is lehet.
  `CREATE TABLE IF NOT EXISTS staff_group_members (
    worker_id INTEGER NOT NULL REFERENCES workers(id),
    group_id INTEGER NOT NULL,
    PRIMARY KEY (worker_id, group_id)
  )`,
  // Parkoltatott (például GYES-en lévő) dolgozó adatai. A dolgozó active értéke ilyenkor 2.
  `CREATE TABLE IF NOT EXISTS worker_park (
    worker_id INTEGER PRIMARY KEY REFERENCES workers(id),
    note TEXT NOT NULL DEFAULT '',
    since TEXT NOT NULL,
    until TEXT
  )`,
  // Értesítésre feliratkozott eszközök (Web Push)
  `CREATE TABLE IF NOT EXISTS push_subs (
    endpoint TEXT PRIMARY KEY,
    p256dh TEXT NOT NULL DEFAULT '',
    auth TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
];

export const GROUPS_TABLE = `CREATE TABLE IF NOT EXISTS staff_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
)`;
export const DEFAULT_GROUPS = ['Pedagógusok', 'Pedagógiai asszisztensek', 'Dajkák', 'Egyéb'];

// Gyakori megjegyzések. Az alapértékeket csak a tábla első létrehozásakor töltjük be.
export const TEMPLATES_TABLE = `CREATE TABLE IF NOT EXISTS note_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL
)`;
export const DEFAULT_TEMPLATES = ['Szülői értekezlet', 'Nyílt nap', 'Helyettesítés', 'Rendezvény', 'Ünnepség'];
