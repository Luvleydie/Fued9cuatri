-- Modelo persistente de NovaCart. Los importes se guardan en centavos.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE CHECK (length(username) BETWEEN 1 AND 100),
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  image TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 2000),
  category TEXT NOT NULL CHECK (length(trim(category)) BETWEEN 1 AND 80),
  price_cents INTEGER NOT NULL CHECK (price_cents BETWEEN 0 AND 100000000),
  stock INTEGER NOT NULL CHECK (stock BETWEEN 0 AND 1000000),
  brand TEXT NOT NULL DEFAULT '' CHECK (length(brand) <= 120),
  thumbnail TEXT NOT NULL DEFAULT '' CHECK (length(thumbnail) <= 2000),
  images_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(images_json) AND json_type(images_json) = 'array'),
  rating REAL CHECK (rating BETWEEN 0 AND 5),
  discount_percentage REAL CHECK (discount_percentage BETWEEN 0 AND 100),
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE INDEX IF NOT EXISTS products_created_by ON products(created_by);
