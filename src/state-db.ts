type StatementLike = {
  run(...parameters: unknown[]): unknown;
  get(...parameters: unknown[]): Record<string, unknown> | undefined;
  all(...parameters: unknown[]): Array<Record<string, unknown>>;
};

type DatabaseLike = {
  exec(sql: string): void;
  prepare(sql: string): StatementLike;
  close(): void;
};

type DatabaseConstructor = new (path: string) => DatabaseLike;

export type StoredRunCommand = {
  headless: boolean;
  profile?: string;
  cookieUrls: string[];
};

export type DaemonState = StoredRunCommand & {
  pid: number;
  startedAt: string;
  logPath: string;
};

function loadDatabaseConstructor(): DatabaseConstructor {
  const sqlite = require("node:sqlite") as {
    DatabaseSync: DatabaseConstructor;
  };

  return sqlite.DatabaseSync;
}

function openDatabase(dbPath: string): DatabaseLike {
  const DatabaseSync = loadDatabaseConstructor();
  return new DatabaseSync(dbPath);
}

function normalizeCookieUrls(urls: string[]): string[] {
  return [...new Set(urls)].sort((left, right) => left.localeCompare(right));
}

function initializeSchema(database: DatabaseLike) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profile_cookie_urls (
      profile TEXT NOT NULL,
      url TEXT NOT NULL,
      PRIMARY KEY (profile, url)
    );

    CREATE TABLE IF NOT EXISTS daemon_state (
      slot INTEGER PRIMARY KEY CHECK (slot = 1),
      pid INTEGER NOT NULL,
      profile TEXT,
      cookie_urls TEXT NOT NULL,
      headless INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      log_path TEXT NOT NULL
    );
  `);
}

function readJson<T>(value: string | undefined): T | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

export class CloakStateDb {
  constructor(private readonly dbPath: string) {}

  private withDatabase<T>(operation: (database: DatabaseLike) => T): T {
    const database = openDatabase(this.dbPath);
    initializeSchema(database);

    try {
      return operation(database);
    } finally {
      database.close();
    }
  }

  getDefaultProfile(): string | undefined {
    return this.withDatabase((database) => {
      const row = database
        .prepare("SELECT value FROM settings WHERE key = ?")
        .get("default_profile");

      return typeof row?.value === "string" ? row.value : undefined;
    });
  }

  setDefaultProfile(profile: string) {
    this.withDatabase((database) => {
      database
        .prepare(
          [
            "INSERT INTO settings (key, value)",
            "VALUES (?, ?)",
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          ].join(" ")
        )
        .run("default_profile", profile);
    });
  }

  getRememberedCookieUrls(profile: string): string[] {
    return this.withDatabase((database) => {
      const rows = database
        .prepare(
          [
            "SELECT url",
            "FROM profile_cookie_urls",
            "WHERE profile = ?",
            "ORDER BY url COLLATE NOCASE",
          ].join(" ")
        )
        .all(profile);

      return rows
        .map((row) => row.url)
        .filter((value): value is string => typeof value === "string");
    });
  }

  rememberCookieUrls(profile: string, urls: string[]): string[] {
    const normalized = normalizeCookieUrls(urls);

    this.withDatabase((database) => {
      const statement = database.prepare(
        [
          "INSERT INTO profile_cookie_urls (profile, url)",
          "VALUES (?, ?)",
          "ON CONFLICT(profile, url) DO NOTHING",
        ].join(" ")
      );

      for (const url of normalized) {
        statement.run(profile, url);
      }
    });

    return this.getRememberedCookieUrls(profile);
  }

  replaceRememberedCookieUrls(profile: string, urls: string[]): string[] {
    const normalized = normalizeCookieUrls(urls);

    this.withDatabase((database) => {
      database
        .prepare("DELETE FROM profile_cookie_urls WHERE profile = ?")
        .run(profile);

      const insert = database.prepare(
        "INSERT INTO profile_cookie_urls (profile, url) VALUES (?, ?)"
      );

      for (const url of normalized) {
        insert.run(profile, url);
      }
    });

    return normalized;
  }

  getDaemonState(): DaemonState | undefined {
    return this.withDatabase((database) => {
      const row = database
        .prepare(
          [
            "SELECT pid, profile, cookie_urls, headless, started_at, log_path",
            "FROM daemon_state",
            "WHERE slot = 1",
          ].join(" ")
        )
        .get();

      if (!row) {
        return undefined;
      }

      const cookieUrls = readJson<string[]>(
        typeof row.cookie_urls === "string" ? row.cookie_urls : undefined
      );

      if (typeof row.pid !== "number" || !Array.isArray(cookieUrls)) {
        return undefined;
      }

      return {
        pid: row.pid,
        profile: typeof row.profile === "string" ? row.profile : undefined,
        cookieUrls,
        headless: row.headless === 1,
        startedAt:
          typeof row.started_at === "string"
            ? row.started_at
            : new Date(0).toISOString(),
        logPath: typeof row.log_path === "string" ? row.log_path : "",
      };
    });
  }

  setDaemonState(state: DaemonState) {
    this.withDatabase((database) => {
      database
        .prepare(
          [
            "INSERT INTO daemon_state",
            "(slot, pid, profile, cookie_urls, headless, started_at, log_path)",
            "VALUES (1, ?, ?, ?, ?, ?, ?)",
            "ON CONFLICT(slot) DO UPDATE SET",
            "pid = excluded.pid,",
            "profile = excluded.profile,",
            "cookie_urls = excluded.cookie_urls,",
            "headless = excluded.headless,",
            "started_at = excluded.started_at,",
            "log_path = excluded.log_path",
          ].join(" ")
        )
        .run(
          state.pid,
          state.profile ?? null,
          JSON.stringify(normalizeCookieUrls(state.cookieUrls)),
          state.headless ? 1 : 0,
          state.startedAt,
          state.logPath
        );
    });
  }

  clearDaemonState(pid?: number) {
    this.withDatabase((database) => {
      if (typeof pid === "number") {
        database
          .prepare("DELETE FROM daemon_state WHERE slot = 1 AND pid = ?")
          .run(pid);
        return;
      }

      database.prepare("DELETE FROM daemon_state WHERE slot = 1").run();
    });
  }

  getLastDaemonCommand(): StoredRunCommand | undefined {
    return this.withDatabase((database) => {
      const row = database
        .prepare("SELECT value FROM settings WHERE key = ?")
        .get("last_daemon_command");
      const command = readJson<StoredRunCommand>(
        typeof row?.value === "string" ? row.value : undefined
      );

      if (!command || !Array.isArray(command.cookieUrls)) {
        return undefined;
      }

      return {
        headless: Boolean(command.headless),
        profile: command.profile,
        cookieUrls: normalizeCookieUrls(command.cookieUrls),
      };
    });
  }

  setLastDaemonCommand(command: StoredRunCommand) {
    const normalized = {
      headless: Boolean(command.headless),
      profile: command.profile,
      cookieUrls: normalizeCookieUrls(command.cookieUrls),
    };

    this.withDatabase((database) => {
      database
        .prepare(
          [
            "INSERT INTO settings (key, value)",
            "VALUES (?, ?)",
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          ].join(" ")
        )
        .run("last_daemon_command", JSON.stringify(normalized));
    });
  }
}
