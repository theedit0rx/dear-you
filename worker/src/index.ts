import type { AuthUser, D1Statement, Env } from "./types";
import {
  clearSessionCookie,
  corsResponse,
  createSession,
  currentUser,
  hashPassword,
  newToken,
  rateLimit,
  readJson,
  responseJson,
  sameAppOrigin,
  sessionCookie,
  sha256,
  verifyPassword,
  writeAudit,
} from "./security";

const now = () => Math.floor(Date.now() / 1000);
const premiumThemes = new Set(["botanical", "night-sky"]);
const allowedThemes = new Set(["letter", "petal", "botanical", "night-sky"]);
const allowedAnimations = new Set(["fade", "float", "sparkle"]);
const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

function error(message: string, status: number) {
  return responseJson({ error: message }, status);
}

function clean(value: unknown, max: number, min = 0): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result.length >= min && result.length <= max ? result : null;
}

function parseJson(value: string, fallback: unknown = []) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function timestampISO(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
}

function bool(value: unknown): boolean {
  return value === true || value === 1;
}

async function userOrNull(request: Request, env: Env) {
  return currentUser(request, env.DB);
}

async function requireActiveUser(request: Request, env: Env): Promise<{ user: AuthUser; response?: never } | { user?: never; response: Response }> {
  const user = await userOrNull(request, env);
  return user ? { user } : { response: error("Sign in to continue.", 401) };
}

function mutationAllowed(request: Request, env: Env): Response | null {
  if (!sameAppOrigin(request, env)) return error("This request could not be verified. Refresh and try again.", 403);
  return null;
}

async function limited(request: Request, env: Env, scope: string, max: number, seconds: number): Promise<Response | null> {
  const result = await rateLimit(request, env.DB, scope, max, seconds);
  return result.allowed ? null : responseJson({ error: "Too many attempts. Please try again later." }, 429, { "retry-after": String(result.retryAfter) });
}

async function readBody(request: Request, maxBytes = 32_000) {
  const body = await readJson(request, maxBytes);
  return body ? { body, error: null } : { body: null, error: error("Send a valid JSON request with the documented fields.", 400) };
}

async function register(request: Request, env: Env) {
  const csrf = mutationAllowed(request, env);
  if (csrf) return csrf;
  const throttled = await limited(request, env, "register", 8, 3600);
  if (throttled) return throttled;
  const parsed = await readBody(request);
  if (parsed.error) return parsed.error;
  const email = clean(parsed.body.email, 320, 3)?.toLowerCase();
  const displayName = clean(parsed.body.displayName, 60, 2);
  const password = typeof parsed.body.password === "string" ? parsed.body.password : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !displayName || password.length < 10 || password.length > 128) return error("Use a valid email, a name, and a password of at least 10 characters.", 400);
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").bind(email).first<{ id: string }>();
  if (existing) return error("An account with this email already exists.", 409);

  const id = crypto.randomUUID();
  const timestamp = now();
  const passwordHash = await hashPassword(password);
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users(id,email,display_name,password_hash,role,status,created_at,updated_at) VALUES(?,?,?,?, 'user','active',?,?)").bind(id, email, displayName, passwordHash, timestamp, timestamp),
      env.DB.prepare("INSERT INTO coin_accounts(user_id,balance,updated_at) VALUES(?,0,?)").bind(id, timestamp),
      env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,details_json,created_at) VALUES(?,?,'account.created','user',?,'{}',?)").bind(crypto.randomUUID(), id, id, timestamp),
    ]);
  } catch {
    return error("An account with this email already exists.", 409);
  }
  const session = await createSession(env.DB, id);
  return responseJson({ user: { id, email, displayName, role: "user", isPremium: false } }, 201, { "set-cookie": sessionCookie(session.token, env) });
}

async function login(request: Request, env: Env) {
  const csrf = mutationAllowed(request, env);
  if (csrf) return csrf;
  const throttled = await limited(request, env, "login", 10, 900);
  if (throttled) return throttled;
  const parsed = await readBody(request);
  if (parsed.error) return parsed.error;
  const email = clean(parsed.body.email, 320, 3)?.toLowerCase();
  const password = typeof parsed.body.password === "string" ? parsed.body.password : "";
  if (!email || password.length < 1 || password.length > 128) return error("Email or password is incorrect.", 401);
  const row = await env.DB.prepare("SELECT id,email,display_name AS displayName,password_hash AS passwordHash,role,status FROM users WHERE email = ? LIMIT 1").bind(email).first<{ id: string; email: string; displayName: string; passwordHash: string; role: AuthUser["role"]; status: string }>();
  const valid = row ? await verifyPassword(password, row.passwordHash) : (await hashPassword(password), false);
  if (!row || !valid) return error("Email or password is incorrect.", 401);
  if (row.status !== "active") return error("This account is currently unavailable. Contact support for help.", 403);
  const session = await createSession(env.DB, row.id);
  const timestamp = now();
  await env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,details_json,created_at) VALUES(?,?,'account.signed_in','user',?,'{}',?)").bind(crypto.randomUUID(), row.id, row.id, timestamp).run();
  const premium = await env.DB.prepare("SELECT 1 AS yes FROM subscriptions WHERE user_id = ? AND status IN ('active','trialing') LIMIT 1").bind(row.id).first();
  return responseJson({ user: { id: row.id, email: row.email, displayName: row.displayName, role: row.role, isPremium: Boolean(premium) } }, 200, { "set-cookie": sessionCookie(session.token, env) });
}

async function logout(request: Request, env: Env) {
  const csrf = mutationAllowed(request, env);
  if (csrf) return csrf;
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("dearyou_session="));
  if (cookie) {
    const token = decodeURIComponent(cookie.slice("dearyou_session=".length));
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  }
  return responseJson({ ok: true }, 200, { "set-cookie": clearSessionCookie(env) });
}

async function authMe(request: Request, env: Env) {
  const user = await userOrNull(request, env);
  return responseJson({ user: user ? { id: user.id, email: user.email, displayName: user.displayName, role: user.role, isPremium: user.isPremium } : null });
}

async function updateAccount(request: Request, env: Env) {
  const csrf = mutationAllowed(request, env);
  if (csrf) return csrf;
  const auth = await requireActiveUser(request, env);
  if (auth.response) return auth.response;
  const parsed = await readBody(request);
  if (parsed.error) return parsed.error;
  const displayName = clean(parsed.body.displayName, 60, 2);
  if (!displayName) return error("Your name should be between 2 and 60 characters.", 400);
  await env.DB.prepare("UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?").bind(displayName, now(), auth.user.id).run();
  await writeAudit(env.DB, auth.user.id, "account.profile_updated", "user", auth.user.id);
  return responseJson({ user: { ...auth.user, displayName } });
}

function cardView(row: Record<string, unknown>) {
  return {
    ...row,
    published: bool(row.published),
    createdAt: row.createdAt == null ? row.createdAt : timestampISO(row.createdAt),
    updatedAt: row.updatedAt == null ? row.updatedAt : timestampISO(row.updatedAt),
  };
}

async function cardsCollection(request: Request, env: Env) {
  const auth = await requireActiveUser(request, env);
  if (auth.response) return auth.response;
  if (request.method === "GET") {
    const result = await env.DB.prepare("SELECT id,title,recipient_name AS recipientName,message,theme,animation,published,share_token AS shareToken,created_at AS createdAt,updated_at AS updatedAt FROM cards WHERE user_id = ? ORDER BY updated_at DESC").bind(auth.user.id).all<Record<string, unknown>>();
    return responseJson({ cards: result.results.map(cardView) });
  }
  if (request.method !== "POST") return error("Method not allowed.", 405);
  const csrf = mutationAllowed(request, env);
  if (csrf) return csrf;
  const throttled = await limited(request, env, `card-create:${auth.user.id}`, 20, 86_400);
  if (throttled) return throttled;
  const parsed = await readBody(request);
  if (parsed.error) return parsed.error;
  const title = clean(parsed.body.title, 100, 2);
  const recipientName = clean(parsed.body.recipientName ?? "", 80);
  const message = clean(parsed.body.message, 1800, 1);
  const theme = clean(parsed.body.theme ?? "letter", 32);
  const animation = clean(parsed.body.animation ?? "fade", 32);
  const published = parsed.body.published === true;
  if (!title || recipientName === null || !message || !theme || !allowedThemes.has(theme) || !animation || !allowedAnimations.has(animation) || (parsed.body.published !== undefined && typeof parsed.body.published !== "boolean")) return error("Check the card details and try again.", 400);
  if (!auth.user.isPremium && (premiumThemes.has(theme) || animation === "sparkle")) return error("That studio treatment is part of Premium Studio.", 402);

  const id = crypto.randomUUID();
  const shareToken = published ? newToken() : null;
  const timestamp = now();
  const rewardId = crypto.randomUUID();
  const statements: D1Statement[] = [
    env.DB.prepare("INSERT INTO cards(id,user_id,title,recipient_name,message,theme,animation,published,share_token,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(id, auth.user.id, title, recipientName, message, theme, animation, published ? 1 : 0, shareToken, timestamp, timestamp),
    env.DB.prepare("INSERT INTO coin_accounts(user_id,balance,updated_at) VALUES(?,0,?) ON CONFLICT(user_id) DO NOTHING").bind(auth.user.id, timestamp),
    env.DB.prepare("INSERT INTO coin_ledger(id,user_id,amount,activity_key,description,created_at) VALUES(?,?,5,'first-card','Your first little note is on its way',?) ON CONFLICT(user_id,activity_key) DO NOTHING").bind(rewardId, auth.user.id, timestamp),
    env.DB.prepare("UPDATE coin_accounts SET balance = balance + 5, updated_at = ? WHERE user_id = ? AND EXISTS(SELECT 1 FROM coin_ledger WHERE id = ?)").bind(timestamp, auth.user.id, rewardId),
    env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,details_json,created_at) VALUES(?,?,'card.created','card',?,?,?)").bind(crypto.randomUUID(), auth.user.id, id, JSON.stringify({ published }), timestamp),
  ];
  try { await env.DB.batch(statements); } catch { return error("Your card could not be saved. Please try again.", 500); }
  const result = await env.DB.prepare("SELECT id,title,recipient_name AS recipientName,message,theme,animation,published,share_token AS shareToken,created_at AS createdAt,updated_at AS updatedAt FROM cards WHERE id = ? AND user_id = ?").bind(id, auth.user.id).first<Record<string, unknown>>();
  const reward = await env.DB.prepare("SELECT id FROM coin_ledger WHERE id = ?").bind(rewardId).first();
  return responseJson({ card: result ? cardView(result) : null, coinReward: Boolean(reward) ? 5 : 0 }, 201);
}

async function cardItem(request: Request, env: Env, id: string) {
  const auth = await requireActiveUser(request, env);
  if (auth.response) return auth.response;
  const current = await env.DB.prepare("SELECT id,title,recipient_name AS recipientName,message,theme,animation,published,share_token AS shareToken FROM cards WHERE id = ? AND user_id = ?").bind(id, auth.user.id).first<Record<string, unknown>>();
  if (!current) return error("This card could not be found.", 404);
  if (request.method === "DELETE") {
    const csrf = mutationAllowed(request, env);
    if (csrf) return csrf;
    await env.DB.batch([
      env.DB.prepare("DELETE FROM cards WHERE id = ? AND user_id = ?").bind(id, auth.user.id),
      env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,details_json,created_at) VALUES(?,?,'card.deleted','card',?,'{}',?)").bind(crypto.randomUUID(), auth.user.id, id, now()),
    ]);
    return responseJson({ ok: true });
  }
  if (request.method !== "PATCH") return error("Method not allowed.", 405);
  const csrf = mutationAllowed(request, env);
  if (csrf) return csrf;
  const parsed = await readBody(request);
  if (parsed.error) return parsed.error;
  const title = clean(parsed.body.title, 100, 2);
  const recipientName = clean(parsed.body.recipientName ?? "", 80);
  const message = clean(parsed.body.message, 1800, 1);
  const theme = clean(parsed.body.theme ?? "letter", 32);
  const animation = clean(parsed.body.animation ?? "fade", 32);
  const published = parsed.body.published === true;
  if (!title || recipientName === null || !message || !theme || !allowedThemes.has(theme) || !animation || !allowedAnimations.has(animation) || typeof parsed.body.published !== "boolean") return error("Check the card details and try again.", 400);
  if (!auth.user.isPremium && (premiumThemes.has(theme) || animation === "sparkle")) return error("That studio treatment is part of Premium Studio.", 402);
  const shareToken = published ? String(current.shareToken ?? newToken()) : null;
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE cards SET title=?,recipient_name=?,message=?,theme=?,animation=?,published=?,share_token=?,updated_at=? WHERE id=? AND user_id=?").bind(title, recipientName, message, theme, animation, published ? 1 : 0, shareToken, timestamp, id, auth.user.id),
    env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,details_json,created_at) VALUES(?,?,'card.updated','card',?,?,?)").bind(crypto.randomUUID(), auth.user.id, id, JSON.stringify({ published }), timestamp),
  ]);
  const updated = await env.DB.prepare("SELECT id,title,recipient_name AS recipientName,message,theme,animation,published,share_token AS shareToken,created_at AS createdAt,updated_at AS updatedAt FROM cards WHERE id=? AND user_id=?").bind(id, auth.user.id).first<Record<string, unknown>>();
  return responseJson({ card: updated ? cardView(updated) : null });
}

async function sharedCard(env: Env, token: string, isExperience = false) {
  const table = isExperience ? "experiences" : "cards";
  const fields = isExperience
     ? "id,title,recipient_name AS recipientName,memory,note,reveal,theme"
     : "id,title,recipient_name AS recipientName,message,theme,animation,created_at AS createdAt";
  const row = await env.DB.prepare(`SELECT ${fields} FROM ${table} WHERE share_token = ? AND published = 1 LIMIT 1`).bind(token).first<Record<string, unknown>>();
  return row ? responseJson({ [isExperience ? "experience" : "card"]: row }, 200, { "cache-control": "private, no-store" }) : error("This note is private or no longer available.", 404);
}

async function experiencesCollection(request: Request, env: Env) {
  const auth = await requireActiveUser(request, env);
  if (auth.response) return auth.response;
  if (request.method === "GET") {
    const result = await env.DB.prepare("SELECT id,title,recipient_name AS recipientName,memory,note,reveal,theme,published,share_token AS shareToken,created_at AS createdAt,updated_at AS updatedAt FROM experiences WHERE user_id=? ORDER BY updated_at DESC").bind(auth.user.id).all<Record<string, unknown>>();
    return responseJson({ experiences: result.results.map((row) => ({ ...row, published: bool(row.published), createdAt: timestampISO(row.createdAt), updatedAt: timestampISO(row.updatedAt) })) });
  }
  if (request.method !== "POST") return error("Method not allowed.", 405);
  const csrf = mutationAllowed(request, env);
  if (csrf) return csrf;
  const throttled = await limited(request, env, `experience-create:${auth.user.id}`, 10, 86_400);
  if (throttled) return throttled;
  const parsed = await readBody(request);
  if (parsed.error) return parsed.error;
  const title = clean(parsed.body.title, 100, 2);
  const recipientName = clean(parsed.body.recipientName, 80, 1);
  const memory = clean(parsed.body.memory, 900, 10);
  const note = clean(parsed.body.note, 900, 10);
  const reveal = clean(parsed.body.reveal, 500, 3);
  const theme = clean(parsed.body.theme ?? "petal", 32);
  const published = parsed.body.published === true;
  if (!title || !recipientName || !memory || !note || !reveal || !theme || !["petal", "sunset", "keepsake"].includes(theme) || (parsed.body.published !== undefined && typeof parsed.body.published !== "boolean")) return error("Check each part of your Duo experience and try again.", 400);
  if (theme === "keepsake" && !auth.user.isPremium) return error("The Keepsake experience is part of Premium Studio.", 402);
  const id = crypto.randomUUID();
  const token = published ? newToken() : null;
  const timestamp = now();
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO experiences(id,user_id,title,recipient_name,memory,note,reveal,theme,published,share_token,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, auth.user.id, title, recipientName, memory, note, reveal, theme, published ? 1 : 0, token, timestamp, timestamp),
      env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,details_json,created_at) VALUES(?,?,'experience.created','experience',?,?,?)").bind(crypto.randomUUID(), auth.user.id, id, JSON.stringify({ published }), timestamp),
    ]);
  } catch { return error("Your experience could not be saved. Please try again.", 500); }
  const experience = await env.DB.prepare("SELECT id,title,recipient_name AS recipientName,memory,note,reveal,theme,published,share_token AS shareToken,created_at AS createdAt FROM experiences WHERE id=?").bind(id).first<Record<string, unknown>>();
  return responseJson({ experience: experience ? { ...experience, published: bool(experience.published) } : null }, 201);
}

async function experienceItem(request: Request, env: Env, id: string) {
  const auth = await requireActiveUser(request, env);
  if (auth.response) return auth.response;
  const current = await env.DB.prepare("SELECT id,share_token AS shareToken FROM experiences WHERE id=? AND user_id=? LIMIT 1").bind(id, auth.user.id).first<{ id: string; shareToken: string | null }>();
  if (!current) return error("This experience could not be found.", 404);
  if (request.method === "DELETE") {
    const csrf = mutationAllowed(request, env);
    if (csrf) return csrf;
    const timestamp = now();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM experiences WHERE id=? AND user_id=?").bind(id, auth.user.id),
      env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,details_json,created_at) VALUES(?,?,'experience.deleted','experience',?,'{}',?)").bind(crypto.randomUUID(), auth.user.id, id, timestamp),
    ]);
    return responseJson({ ok: true });
  }
  if (request.method !== "PATCH") return error("Method not allowed.", 405);
  const csrf = mutationAllowed(request, env);
  if (csrf) return csrf;
  const parsed = await readBody(request);
  if (parsed.error) return parsed.error;
  const title = clean(parsed.body.title, 100, 2);
  const recipientName = clean(parsed.body.recipientName, 80, 1);
  const memory = clean(parsed.body.memory, 900, 10);
  const note = clean(parsed.body.note, 900, 10);
  const reveal = clean(parsed.body.reveal, 500, 3);
  const theme = clean(parsed.body.theme ?? "petal", 32);
  const published = parsed.body.published === true;
  if (!title || !recipientName || !memory || !note || !reveal || !theme || !["petal", "sunset", "keepsake"].includes(theme) || typeof parsed.body.published !== "boolean") return error("Check each part of your Duo experience and try again.", 400);
  if (theme === "keepsake" && !auth.user.isPremium) return error("The Keepsake experience is part of Premium Studio.", 402);
  const shareToken = published ? current.shareToken ?? newToken() : null;
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE experiences SET title=?,recipient_name=?,memory=?,note=?,reveal=?,theme=?,published=?,share_token=?,updated_at=? WHERE id=? AND user_id=?").bind(title, recipientName, memory, note, reveal, theme, published ? 1 : 0, shareToken, timestamp, id, auth.user.id),
    env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,details_json,created_at) VALUES(?,?,'experience.updated','experience',?,?,?)").bind(crypto.randomUUID(), auth.user.id, id, JSON.stringify({ published }), timestamp),
  ]);
  const experience = await env.DB.prepare("SELECT id,title,recipient_name AS recipientName,memory,note,reveal,theme,published,share_token AS shareToken,created_at AS createdAt,updated_at AS updatedAt FROM experiences WHERE id=? AND user_id=?").bind(id, auth.user.id).first<Record<string, unknown>>();
  return responseJson({ experience: experience ? { ...experience, published: bool(experience.published), createdAt: timestampISO(experience.createdAt), updatedAt: timestampISO(experience.updatedAt) } : null });
}

async function competitionsCollection(request: Request, env: Env) {
  const competition = await env.DB.prepare("SELECT id,slug,title,description,rules_json AS rules,criteria_json AS criteria,starts_at AS startsAt,ends_at AS endsAt FROM competitions WHERE status='open' AND starts_at<=? AND ends_at>? ORDER BY ends_at LIMIT 1").bind(now(), now()).first<Record<string, unknown>>();
  if (!competition) return responseJson({ competition: null, approvedEntries: 0, myEntry: null });
  const [countRow, user] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS value FROM competition_entries WHERE competition_id=? AND status='approved'").bind(competition.id).first<{ value: number }>(),
    userOrNull(request, env),
  ]);
  let myEntry: Record<string, unknown> | null = null;
  if (user) myEntry = await env.DB.prepare("SELECT id,title,status,submitted_at AS submittedAt FROM competition_entries WHERE competition_id=? AND user_id=? LIMIT 1").bind(competition.id, user.id).first<Record<string, unknown>>();
  return responseJson({
    competition: { ...competition, rules: parseJson(String(competition.rules)), criteria: parseJson(String(competition.criteria)), startsAt: new Date(Number(competition.startsAt) * 1000).toISOString(), endsAt: new Date(Number(competition.endsAt) * 1000).toISOString() },
    approvedEntries: countRow?.value ?? 0,
    myEntry: myEntry ? { ...myEntry, submittedAt: new Date(Number(myEntry.submittedAt) * 1000).toISOString() } : null,
  });
}

async function submitEntry(request: Request, env: Env) {
  const csrf = mutationAllowed(request, env);
  if (csrf) return csrf;
  const auth = await requireActiveUser(request, env);
  if (auth.response) return auth.response;
  const throttled = await limited(request, env, `competition-entry:${auth.user.id}`, 4, 86_400);
  if (throttled) return throttled;
  const parsed = await readBody(request);
  if (parsed.error) return parsed.error;
  const competitionId = clean(parsed.body.competitionId, 80, 1);
  const title = clean(parsed.body.title, 90, 3);
  const relationship = clean(parsed.body.relationship, 60, 2);
  const story = clean(parsed.body.story, 2400, 40);
  if (!competitionId || !title || !relationship || !story || parsed.body.eligibilityAttested !== true) return error("Complete the entry and eligibility attestation before sending it.", 400);
  const competition = await env.DB.prepare("SELECT id FROM competitions WHERE id=? AND status='open' AND starts_at<=? AND ends_at>? LIMIT 1").bind(competitionId, now(), now()).first<{ id: string }>();
  if (!competition) return error("This competition is not accepting entries right now.", 409);
  const id = crypto.randomUUID();
  const timestamp = now();
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO competition_entries(id,competition_id,user_id,title,story,relationship,eligibility_attested,status,submitted_at,updated_at) VALUES(?,?,?,?,?,?,1,'pending',?,?)").bind(id, competitionId, auth.user.id, title, story, relationship, timestamp, timestamp),
      env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,details_json,created_at) VALUES(?,?,'competition.entry_submitted','competition_entry',?,?,?)").bind(crypto.randomUUID(), auth.user.id, id, JSON.stringify({ competitionId }), timestamp),
    ]);
  } catch { return error("You’ve already submitted an entry for this competition, or your entry could not be saved.", 409); }
  return responseJson({ entry: { id, title, status: "pending", submittedAt: new Date(timestamp * 1000).toISOString() }, note: "Your entry is received and awaiting a human review. Paid features do not affect judging." }, 201);
}

async function coins(request: Request, env: Env) {
  const auth = await requireActiveUser(request, env);
  if (auth.response) return auth.response;
  const [account, rows] = await Promise.all([
    env.DB.prepare("SELECT balance FROM coin_accounts WHERE user_id=?").bind(auth.user.id).first<{ balance: number }>(),
    env.DB.prepare("SELECT id,amount,activity_key AS activityKey,description,created_at AS createdAt FROM coin_ledger WHERE user_id=? ORDER BY created_at DESC LIMIT 50").bind(auth.user.id).all<Record<string, unknown>>(),
  ]);
  return responseJson({ balance: account?.balance ?? 0, transactions: rows.results.map((row) => ({ ...row, createdAt: new Date(Number(row.createdAt) * 1000).toISOString() })), earningPolicy: [{ activity: "Your first saved card", coins: 5, limit: "Once per account" }] });
}

async function createReport(request: Request, env: Env) {
  const csrf = mutationAllowed(request, env);
  if (csrf) return csrf;
  const auth = await requireActiveUser(request, env);
  if (auth.response) return auth.response;
  const throttled = await limited(request, env, `report:${auth.user.id}`, 8, 86_400);
  if (throttled) return throttled;
  const parsed = await readBody(request);
  if (parsed.error) return parsed.error;
  const targetType = clean(parsed.body.targetType, 24, 1);
  const targetId = clean(parsed.body.targetId, 80, 1);
  const reason = clean(parsed.body.reason, 500, 8);
  if (!targetType || !["card", "experience", "entry"].includes(targetType) || !targetId || !reason) return error("Check the report details and try again.", 400);
  const table = targetType === "card" ? "cards" : targetType === "experience" ? "experiences" : "competition_entries";
  const statusCondition = targetType === "entry" ? "status='approved'" : "published=1";
  const found = await env.DB.prepare(`SELECT id FROM ${table} WHERE id=? AND ${statusCondition} LIMIT 1`).bind(targetId).first();
  if (!found) return error("That shared item could not be found.", 404);
  const id = crypto.randomUUID();
  const timestamp = now();
  await env.DB.prepare("INSERT INTO reports(id,reporter_id,target_type,target_id,reason,status,created_at) VALUES(?,?,?,?,?,'open',?)").bind(id, auth.user.id, targetType, targetId, reason, timestamp).run();
  await writeAudit(env.DB, auth.user.id, "content.reported", targetType, targetId, { reportId: id });
  return responseJson({ ok: true, message: "Thank you. Our moderation team will review this report." }, 201);
}

function adminAllowed(user: AuthUser) { return user.role === "admin" || user.role === "moderator"; }

async function adminOverview(request: Request, env: Env) {
  const auth = await requireActiveUser(request, env);
  if (auth.response) return auth.response;
  if (!adminAllowed(auth.user)) return error("Administrator access is required.", 403);
  const [userCount, entryCount, reportCount, premiumCount, events] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS value FROM users").first<{ value: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS value FROM competition_entries").first<{ value: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS value FROM reports").first<{ value: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS value FROM subscriptions WHERE status IN ('active','trialing')").first<{ value: number }>(),
    env.DB.prepare("SELECT id,action,target_type AS targetType,created_at AS createdAt FROM audit_logs ORDER BY created_at DESC LIMIT 12").all<Record<string, unknown>>(),
  ]);
  return responseJson({ analytics: { users: userCount?.value ?? 0, submissions: entryCount?.value ?? 0, reports: reportCount?.value ?? 0, premiumMembers: premiumCount?.value ?? 0 }, recentAudit: events.results.map((row) => ({ ...row, createdAt: new Date(Number(row.createdAt) * 1000).toISOString() })) });
}

async function adminEntries(request: Request, env: Env) {
  const auth = await requireActiveUser(request, env);
  if (auth.response) return auth.response;
  if (!adminAllowed(auth.user)) return error("Moderation access is required.", 403);
  if (request.method === "GET") {
    const rows = await env.DB.prepare("SELECT e.id,e.title,e.story,e.relationship,e.status,e.moderation_note AS moderationNote,e.submitted_at AS submittedAt,u.display_name AS authorName,c.title AS competitionTitle FROM competition_entries e JOIN users u ON u.id=e.user_id JOIN competitions c ON c.id=e.competition_id ORDER BY e.submitted_at DESC LIMIT 100").all<Record<string, unknown>>();
    return responseJson({ entries: rows.results.map((row) => ({ ...row, submittedAt: new Date(Number(row.submittedAt) * 1000).toISOString() })) });
  }
  return error("Method not allowed.", 405);
}

async function moderateEntry(request: Request, env: Env, id: string) {
  const csrf = mutationAllowed(request, env);
  if (csrf) return csrf;
  const auth = await requireActiveUser(request, env);
  if (auth.response) return auth.response;
  if (!adminAllowed(auth.user)) return error("Moderation access is required.", 403);
  const parsed = await readBody(request);
  if (parsed.error) return parsed.error;
  const status = clean(parsed.body.status, 20, 1);
  const note = clean(parsed.body.moderationNote ?? "", 500);
  if (!status || !["approved", "rejected", "needs_review"].includes(status) || note === null) return error("Choose a valid moderation status.", 400);
  const result = await env.DB.prepare("UPDATE competition_entries SET status=?,moderation_note=?,updated_at=? WHERE id=?").bind(status, note || null, now(), id).run();
  if (!result.meta?.changes) return error("Submission not found.", 404);
  await writeAudit(env.DB, auth.user.id, "competition.entry_moderated", "competition_entry", id, { status });
  return responseJson({ entry: { id, status } });
}

async function adminUsers(request: Request, env: Env) {
  const auth = await requireActiveUser(request, env);
  if (auth.response) return auth.response;
  if (auth.user.role !== "admin") return error("Administrator access is required.", 403);
  const rows = await env.DB.prepare("SELECT id,email,display_name AS displayName,role,status,created_at AS createdAt FROM users ORDER BY created_at DESC LIMIT 100").all<Record<string, unknown>>();
  return responseJson({ users: rows.results.map((row) => ({ ...row, createdAt: new Date(Number(row.createdAt) * 1000).toISOString() })) });
}

async function updateAdminUser(request: Request, env: Env, id: string) {
  const csrf = mutationAllowed(request, env);
  if (csrf) return csrf;
  const auth = await requireActiveUser(request, env);
  if (auth.response) return auth.response;
  if (auth.user.role !== "admin" || auth.user.id === id) return error("Administrator access is required.", 403);
  const parsed = await readBody(request);
  if (parsed.error) return parsed.error;
  const status = clean(parsed.body.status, 20, 1);
  if (!status || !["active", "suspended", "closed"].includes(status)) return error("Choose a valid account status.", 400);
  const result = await env.DB.prepare("UPDATE users SET status=?,updated_at=? WHERE id=?").bind(status, now(), id).run();
  if (!result.meta?.changes) return error("This account could not be found.", 404);
  if (status !== "active") await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(id).run();
  await writeAudit(env.DB, auth.user.id, "admin.user_status_changed", "user", id, { status });
  return responseJson({ user: { id, status } });
}

async function adminAudit(request: Request, env: Env) {
  const auth = await requireActiveUser(request, env);
  if (auth.response) return auth.response;
  if (auth.user.role !== "admin") return error("Administrator access is required.", 403);
  const rows = await env.DB.prepare("SELECT a.id,a.action,a.target_type AS targetType,a.target_id AS targetId,a.details_json AS details,a.created_at AS createdAt,u.display_name AS actorName FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 100").all<Record<string, unknown>>();
  return responseJson({ events: rows.results.map((row) => ({ ...row, details: parseJson(String(row.details)), createdAt: new Date(Number(row.createdAt) * 1000).toISOString() })) });
}

async function adminReports(request: Request, env: Env) {
  const auth = await requireActiveUser(request, env);
  if (auth.response) return auth.response;
  if (!adminAllowed(auth.user)) return error("Moderation access is required.", 403);
  const rows = await env.DB.prepare("SELECT r.id,r.target_type AS targetType,r.target_id AS targetId,r.reason,r.status,r.created_at AS createdAt,u.display_name AS reporterName FROM reports r JOIN users u ON u.id=r.reporter_id ORDER BY r.created_at DESC LIMIT 100").all<Record<string, unknown>>();
  return responseJson({ reports: rows.results.map((row) => ({ ...row, createdAt: timestampISO(row.createdAt) })) });
}

async function moderateReport(request: Request, env: Env, id: string) {
  const csrf = mutationAllowed(request, env);
  if (csrf) return csrf;
  const auth = await requireActiveUser(request, env);
  if (auth.response) return auth.response;
  if (!adminAllowed(auth.user)) return error("Moderation access is required.", 403);
  const parsed = await readBody(request);
  if (parsed.error) return parsed.error;
  const status = clean(parsed.body.status, 24, 1);
  if (!status || !["reviewing", "resolved", "dismissed"].includes(status)) return error("Choose a valid report status.", 400);
  const result = await env.DB.prepare("UPDATE reports SET status=? WHERE id=?").bind(status, id).run();
  if (!result.meta?.changes) return error("Report not found.", 404);
  await writeAudit(env.DB, auth.user.id, "moderation.report_updated", "report", id, { status });
  return responseJson({ report: { id, status } });
}

async function adminCompetition(request: Request, env: Env) {
  const auth = await requireActiveUser(request, env);
  if (auth.response) return auth.response;
  if (auth.user.role !== "admin") return error("Administrator access is required.", 403);
  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT id,title,description,status,ends_at AS endsAt,rules_json AS rules,criteria_json AS criteria FROM competitions ORDER BY created_at DESC LIMIT 1").first<Record<string, unknown>>();
    if (!row) return responseJson({ competition: null });
    return responseJson({ competition: { ...row, endsAt: timestampISO(row.endsAt), rules: parseJson(String(row.rules)), criteria: parseJson(String(row.criteria)) } });
  }
  if (request.method !== "PATCH") return error("Method not allowed.", 405);
  const csrf = mutationAllowed(request, env);
  if (csrf) return csrf;
  const parsed = await readBody(request);
  if (parsed.error) return parsed.error;
  const id = clean(parsed.body.id, 80, 1);
  const title = clean(parsed.body.title, 120, 3);
  const description = clean(parsed.body.description, 1200, 10);
  const status = clean(parsed.body.status, 16, 1);
  const endMilliseconds = typeof parsed.body.endsAt === "string" ? Date.parse(parsed.body.endsAt) : NaN;
  const rules = parsed.body.rules;
  const criteria = parsed.body.criteria;
  if (!id || !title || !description || !status || !["draft", "open", "judging", "closed"].includes(status) || !Number.isFinite(endMilliseconds) || endMilliseconds <= Date.now()) return error("Check the competition title, status, and future deadline.", 400);
  if (!Array.isArray(rules) || rules.length > 12 || !rules.every((rule) => typeof rule === "string" && rule.trim().length >= 5 && rule.trim().length <= 500)) return error("Add up to 12 clear competition rules.", 400);
  if (!Array.isArray(criteria) || criteria.length < 1 || criteria.length > 8 || !criteria.every((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).name === "string" && typeof (item as Record<string, unknown>).description === "string" && Number.isInteger((item as Record<string, unknown>).weight) && Number((item as Record<string, unknown>).weight) >= 0 && Number((item as Record<string, unknown>).weight) <= 100)) return error("Add valid judging criteria and integer weights.", 400);
  if ((criteria as Array<{ weight: number }>).reduce((total, item) => total + item.weight, 0) !== 100) return error("Judging criteria weights must add up to 100.", 400);
  const endsAt = Math.floor(endMilliseconds / 1000);
  const result = await env.DB.prepare("UPDATE competitions SET title=?,description=?,status=?,ends_at=?,rules_json=?,criteria_json=?,updated_at=? WHERE id=?")
    .bind(title, description, status, endsAt, JSON.stringify(rules.map((rule: string) => rule.trim())), JSON.stringify(criteria), now(), id).run();
  if (!result.meta?.changes) return error("Competition not found.", 404);
  await writeAudit(env.DB, auth.user.id, "admin.competition_updated", "competition", id, { status });
  return responseJson({ competition: { id, title, description, status, endsAt: new Date(endsAt * 1000).toISOString(), rules, criteria } });
}

async function uploadMedia(request: Request, env: Env) {
  const csrf = mutationAllowed(request, env);
  if (csrf) return csrf;
  const auth = await requireActiveUser(request, env);
  if (auth.response) return auth.response;
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[contentType];
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!ext || length < 1 || length > MAX_MEDIA_BYTES) return error("Use a JPEG, PNG, or WebP image up to 5 MB.", 400);
  const body = await request.arrayBuffer();
  if (body.byteLength < 1 || body.byteLength > MAX_MEDIA_BYTES) return error("This image is too large.", 413);
  const id = crypto.randomUUID();
  const key = `users/${auth.user.id}/${id}.${ext}`;
  const timestamp = now();
  try {
    await env.MEDIA.put(key, body, { httpMetadata: { contentType, cacheControl: "private, no-store" }, customMetadata: { ownerId: auth.user.id } });
    await env.DB.prepare("INSERT INTO media_assets(id,user_id,object_key,content_type,byte_size,created_at) VALUES(?,?,?,?,?,?)").bind(id, auth.user.id, key, contentType, body.byteLength, timestamp).run();
  } catch {
    await env.MEDIA.delete(key).catch(() => undefined);
    return error("The image could not be saved. Please try again.", 503);
  }
  await writeAudit(env.DB, auth.user.id, "media.uploaded", "media", id, { contentType, bytes: body.byteLength });
  return responseJson({ media: { id, url: `/api/media/${id}` } }, 201);
}

async function privateMedia(request: Request, env: Env, id: string) {
  const auth = await requireActiveUser(request, env);
  if (auth.response) return auth.response;
  const asset = await env.DB.prepare("SELECT object_key AS objectKey,content_type AS contentType FROM media_assets WHERE id=? AND user_id=? LIMIT 1").bind(id, auth.user.id).first<{ objectKey: string; contentType: string }>();
  if (!asset) return error("This image could not be found.", 404);
  const object = await env.MEDIA.get(asset.objectKey);
  if (!object) return error("This image could not be found.", 404);
  const headers = new Headers({ "content-type": asset.contentType, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-disposition": "inline" });
  object.writeHttpMetadata(headers);
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

async function checkout(request: Request, env: Env) {
  const csrf = mutationAllowed(request, env);
  if (csrf) return csrf;
  const auth = await requireActiveUser(request, env);
  if (auth.response) return auth.response;
  if (!env.STRIPE_SECRET_KEY?.startsWith("sk_test_") || !env.STRIPE_PRICE_ID) return error("Premium checkout is not configured yet. No payment has been taken.", 503);
  const throttled = await limited(request, env, `checkout:${auth.user.id}`, 4, 3600);
  if (throttled) return throttled;
  const origin = env.APP_ORIGIN;
  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("line_items[0][price]", env.STRIPE_PRICE_ID);
  form.set("line_items[0][quantity]", "1");
  form.set("client_reference_id", auth.user.id);
  form.set("customer_email", auth.user.email);
  form.set("metadata[userId]", auth.user.id);
  form.set("metadata[product]", "dear-you-premium");
  form.set("subscription_data[metadata][userId]", auth.user.id);
  form.set("success_url", `${origin}/?purchase=confirmation`);
  form.set("cancel_url", `${origin}/?purchase=cancelled`);
  form.set("allow_promotion_codes", "false");
  try {
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form });
    const result = await response.json() as { url?: string };
    if (!response.ok || !result.url) return error("The payment provider could not start checkout. No membership change was made.", 502);
    return responseJson({ url: result.url });
  } catch { return error("The payment provider could not start checkout. No membership change was made.", 502); }
}

function safeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

async function verifyStripeSignature(body: string, header: string, secret: string): Promise<boolean> {
  const fields = Object.fromEntries(header.split(",").map((part) => part.split("=", 2))) as Record<string, string>;
  const timestamp = Number(fields.t);
  const signature = fields.v1;
  if (!timestamp || typeof signature !== "string" || !signature || Math.abs(now() - timestamp) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  const expected = Uint8Array.from(signature.match(/.{2}/g) ?? [], (hex) => Number.parseInt(hex, 16));
  return safeEqual(new Uint8Array(signed), expected);
}

async function syncStripeSubscription(env: Env, subscription: Record<string, unknown>, hintedUserId?: string | null) {
  const subscriptionId = String(subscription.id ?? "");
  if (!subscriptionId) return;
  const existing = await env.DB.prepare("SELECT user_id AS userId FROM subscriptions WHERE stripe_subscription_id=? LIMIT 1").bind(subscriptionId).first<{ userId: string }>();
  const userId = hintedUserId || existing?.userId;
  if (!userId) return;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : String((subscription.customer as { id?: string } | null)?.id ?? "");
  const items = subscription.items as { data?: Array<{ price?: { id?: string }; current_period_end?: number }> } | undefined;
  const firstItem = items?.data?.[0];
  const priceId = firstItem?.price?.id ?? null;
  const currentPeriodEnd = firstItem?.current_period_end ?? null;
  const status = String(subscription.status ?? "inactive");
  const timestamp = now();
  await env.DB.prepare(`INSERT INTO subscriptions(id,user_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,status,current_period_end,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id=excluded.stripe_customer_id,stripe_subscription_id=excluded.stripe_subscription_id,stripe_price_id=excluded.stripe_price_id,status=excluded.status,current_period_end=excluded.current_period_end,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(), userId, customerId, subscriptionId, priceId, status, currentPeriodEnd, timestamp, timestamp).run();
  await writeAudit(env.DB, userId, "billing.subscription_synced", "subscription", subscriptionId, { status });
}

async function stripeWebhook(request: Request, env: Env) {
  if (!env.STRIPE_SECRET_KEY?.startsWith("sk_test_") || !env.STRIPE_WEBHOOK_SECRET) return error("Webhook verification is not configured.", 503);
  const signature = request.headers.get("stripe-signature");
  if (!signature) return error("Invalid webhook signature.", 400);
  const body = await request.text();
  if (!(await verifyStripeSignature(body, signature, env.STRIPE_WEBHOOK_SECRET))) return error("Invalid webhook signature.", 400);
  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try { event = JSON.parse(body) as typeof event; } catch { return error("Invalid event payload.", 400); }
  try {
    const object = event.data?.object;
    if (event.type === "checkout.session.completed" && object?.mode === "subscription" && object.subscription) {
      const subscriptionId = typeof object.subscription === "string" ? object.subscription : String((object.subscription as { id?: string }).id);
      const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
      if (!response.ok) return error("The verified subscription could not be retrieved. Please retry delivery.", 502);
      const subscription = await response.json() as Record<string, unknown>;
      await syncStripeSubscription(env, subscription, String(object.client_reference_id ?? (object.metadata as Record<string, string> | undefined)?.userId ?? ""));
    } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(String(event.type)) && object) {
      await syncStripeSubscription(env, object);
    }
    return responseJson({ received: true });
  } catch { return error("The verified event could not be recorded. Please retry delivery.", 500); }
}

async function route(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  const method = request.method.toUpperCase();
  if (method === "GET" && pathname === "/api/health") {
    await env.DB.prepare("SELECT 1 AS ok").first();
    return responseJson({ ok: true, service: "dear-you-api" });
  }
  if (method === "POST" && pathname === "/api/auth/register") return register(request, env);
  if (method === "POST" && pathname === "/api/auth/login") return login(request, env);
  if (method === "POST" && pathname === "/api/auth/logout") return logout(request, env);
  if (method === "GET" && pathname === "/api/auth/me") return authMe(request, env);
  if (method === "PATCH" && pathname === "/api/account") return updateAccount(request, env);
  if (pathname === "/api/cards") return cardsCollection(request, env);
  const cardMatch = pathname.match(/^\/api\/cards\/([a-f0-9-]{36})$/i);
  if (cardMatch) return cardItem(request, env, cardMatch[1]);
  const sharedCardMatch = pathname.match(/^\/api\/share\/cards\/([A-Za-z0-9_-]{24,64})$/);
  if (method === "GET" && sharedCardMatch) return sharedCard(env, sharedCardMatch[1]);
  if (pathname === "/api/experiences") return experiencesCollection(request, env);
  const experienceMatch = pathname.match(/^\/api\/experiences\/([a-f0-9-]{36})$/i);
  if (experienceMatch) return experienceItem(request, env, experienceMatch[1]);
  const sharedExperienceMatch = pathname.match(/^\/api\/share\/experiences\/([A-Za-z0-9_-]{24,64})$/);
  if (method === "GET" && sharedExperienceMatch) return sharedCard(env, sharedExperienceMatch[1], true);
  if (method === "GET" && pathname === "/api/competitions") return competitionsCollection(request, env);
  if (method === "POST" && pathname === "/api/competitions/entries") return submitEntry(request, env);
  if (method === "GET" && pathname === "/api/coins") return coins(request, env);
  if (method === "POST" && pathname === "/api/reports") return createReport(request, env);
  if (method === "POST" && pathname === "/api/media") return uploadMedia(request, env);
  const mediaMatch = pathname.match(/^\/api\/media\/([a-f0-9-]{36})$/i);
  if (method === "GET" && mediaMatch) return privateMedia(request, env, mediaMatch[1]);
  if (method === "POST" && pathname === "/api/billing/checkout") return checkout(request, env);
  if (method === "POST" && pathname === "/api/billing/webhook") return stripeWebhook(request, env);
  if (pathname === "/api/admin/overview" && method === "GET") return adminOverview(request, env);
  if (pathname === "/api/admin/entries" && method === "GET") return adminEntries(request, env);
  const entryMatch = pathname.match(/^\/api\/admin\/entries\/([a-f0-9-]{36})$/i);
  if (entryMatch && method === "PATCH") return moderateEntry(request, env, entryMatch[1]);
  if (pathname === "/api/admin/users" && method === "GET") return adminUsers(request, env);
  const userMatch = pathname.match(/^\/api\/admin\/users\/([a-f0-9-]{36})$/i);
  if (userMatch && method === "PATCH") return updateAdminUser(request, env, userMatch[1]);
  if (pathname === "/api/admin/audit" && method === "GET") return adminAudit(request, env);
  if (pathname === "/api/admin/reports" && method === "GET") return adminReports(request, env);
  const reportMatch = pathname.match(/^\/api\/admin\/reports\/([a-f0-9-]{36})$/i);
  if (reportMatch && method === "PATCH") return moderateReport(request, env, reportMatch[1]);
  if (pathname === "/api/admin/competition" && (method === "GET" || method === "PATCH")) return adminCompetition(request, env);
  return error("Not found.", 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method.toUpperCase() === "OPTIONS") {
      if (request.headers.get("origin") && request.headers.get("origin") !== env.APP_ORIGIN) return corsResponse(request, env, error("Origin not allowed.", 403));
      return corsResponse(request, env, new Response(null, { status: 204 }));
    }
    try {
      const response = await route(request, env);
      return corsResponse(request, env, response);
    } catch {
      return corsResponse(request, env, error("Something went wrong. Please try again.", 500));
    }
  },
};
