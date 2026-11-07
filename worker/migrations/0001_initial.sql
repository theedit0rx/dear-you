-- Dear You D1 schema. D1 enforces SQLite foreign keys for migrations and queries.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 2 AND 60),
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','moderator','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','closed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),
  byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 1 AND 5242880),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS media_user_created_idx ON media_assets(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 100),
  recipient_name TEXT NOT NULL DEFAULT '' CHECK(length(recipient_name) <= 80),
  message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 1800),
  theme TEXT NOT NULL DEFAULT 'letter' CHECK(theme IN ('letter','petal','botanical','night-sky')),
  animation TEXT NOT NULL DEFAULT 'fade' CHECK(animation IN ('fade','float','sparkle')),
  media_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)),
  share_token TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cards_user_updated_idx ON cards(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS cards_public_idx ON cards(share_token, published);

CREATE TABLE IF NOT EXISTS experiences (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 100),
  recipient_name TEXT NOT NULL CHECK(length(recipient_name) BETWEEN 1 AND 80),
  memory TEXT NOT NULL CHECK(length(memory) BETWEEN 10 AND 900),
  note TEXT NOT NULL CHECK(length(note) BETWEEN 10 AND 900),
  reveal TEXT NOT NULL CHECK(length(reveal) BETWEEN 3 AND 500),
  theme TEXT NOT NULL DEFAULT 'petal' CHECK(theme IN ('petal','sunset','keepsake')),
  published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)),
  share_token TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS experiences_user_updated_idx ON experiences(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS competitions (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  rules_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(rules_json)),
  criteria_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(criteria_json)),
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL CHECK(ends_at > starts_at),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','judging','closed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS competitions_status_ends_idx ON competitions(status, ends_at);

CREATE TABLE IF NOT EXISTS competition_entries (
  id TEXT PRIMARY KEY NOT NULL,
  competition_id TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 90),
  story TEXT NOT NULL CHECK(length(story) BETWEEN 40 AND 2400),
  relationship TEXT NOT NULL CHECK(length(relationship) BETWEEN 2 AND 60),
  eligibility_attested INTEGER NOT NULL CHECK(eligibility_attested = 1),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','needs_review')),
  moderation_note TEXT CHECK(moderation_note IS NULL OR length(moderation_note) <= 500),
  submitted_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(competition_id, user_id)
);
CREATE INDEX IF NOT EXISTS entries_review_queue_idx ON competition_entries(competition_id, status, submitted_at);
CREATE INDEX IF NOT EXISTS entries_user_idx ON competition_entries(user_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS coin_accounts (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS coin_ledger (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK(amount > 0),
  activity_key TEXT NOT NULL,
  description TEXT NOT NULL CHECK(length(description) <= 180),
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, activity_key)
);
CREATE INDEX IF NOT EXISTS coin_ledger_user_created_idx ON coin_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  status TEXT NOT NULL DEFAULT 'inactive' CHECK(status IN ('inactive','trialing','active','past_due','canceled','unpaid','incomplete','incomplete_expired','paused')),
  current_period_end INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY NOT NULL,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK(target_type IN ('card','experience','entry')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 8 AND 500),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','resolved','dismissed')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_queue_idx ON reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(details_json)),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_actor_idx ON audit_logs(actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key TEXT PRIMARY KEY NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1 CHECK(hits > 0),
  window_started_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_bucket_window_idx ON rate_limit_buckets(window_started_at);

-- A real, free entry program with an explicit closing date and transparent rubric.
INSERT INTO competitions(id, slug, title, description, rules_json, criteria_json, starts_at, ends_at, status, created_at, updated_at)
VALUES (
  'bond-year-2026',
  'bond-of-the-year-2026',
  'Bond of the Year',
  'Celebrate the person who makes ordinary days feel a little more like home. Entry is free. Every eligible story is judged by the same published rubric; Premium, purchases, and Love Coins never affect eligibility, scoring, or ranking.',
  '["Open to active Dear You members who meet the age and location requirements displayed in the official rules.","Submit one original story about a meaningful, real-life bond. Keep it kind and do not include private contact details.","Entries are reviewed by human moderators before appearing publicly. Disqualifications include plagiarism, harassment, unsafe content, and duplicate submissions.","One entry per member. Entry closes at 23:59 UTC on February 14, 2027.","Entry is free. Premium purchases, paid features, and Love Coins never influence judging, scoring, or ranking."]',
  '[{"name":"Thoughtfulness & specificity","description":"A sincere, personal detail that helps the bond feel real.","weight":40},{"name":"Shared-memory storytelling","description":"A clear, engaging moment that shows what the relationship means to you.","weight":35},{"name":"Kindness & respect","description":"A warm, respectful story that honors the people involved.","weight":25}]',
  strftime('%s','2026-01-01T00:00:00Z'),
  strftime('%s','2027-02-15T00:00:00Z'),
  'open',
  strftime('%s','now'),
  strftime('%s','now')
)
ON CONFLICT(slug) DO NOTHING;
