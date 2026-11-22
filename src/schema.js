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
  // Kézzel megadott speciális napok: áthelyezett pihenőnap (off) vagy ledolgozandó munkanap (work)
  `CREATE TABLE IF NOT EXISTS special_days (
    date TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('off','work')),
    label TEXT NOT NULL DEFAULT ''
  )`,
  // Gyors tétel-sablonok: típus, időtartam, megjegyzés és a címzettek (target: '' | 'all' | 'g<munkakör azonosító>')
  `CREATE TABLE IF NOT EXISTS entry_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('credit','use')),
    minutes INTEGER NOT NULL CHECK (minutes > 0),
    note TEXT NOT NULL DEFAULT '',
    target TEXT NOT NULL DEFAULT ''
  )`,
  // Szabadságok (napokban): a szabadidőtől (túlóra) teljesen külön nyilvántartás
  `CREATE TABLE IF NOT EXISTS leaves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id INTEGER NOT NULL REFERENCES workers(id),
    date TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (worker_id, date)
  )`,
  `CREATE INDEX IF NOT EXISTS leaves_date ON leaves(date)`,
  `CREATE TABLE IF NOT EXISTS leave_budget (
    worker_id INTEGER NOT NULL REFERENCES workers(id),
    year INTEGER NOT NULL,
    entitlement INTEGER NOT NULL DEFAULT 0,
    carry INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (worker_id, year)
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
