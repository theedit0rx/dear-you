"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Award, Check, ChevronRight, CircleAlert, Clock3, FileText, Flag, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";

type Panel = "overview" | "entries" | "reports" | "users" | "competition" | "audit";
type Entry = { id: string; title: string; story: string; relationship: string; status: string; moderationNote: string | null; submittedAt: string; authorName: string; competitionTitle: string };
type Report = { id: string; targetType: string; targetId: string; reason: string; status: string; createdAt: string; reporterName: string };
type ManagedUser = { id: string; email: string; displayName: string; role: string; status: string; createdAt: string };
type Competition = { id: string; title: string; description: string; status: string; endsAt: string; rules: string[]; criteria: { name: string; description: string; weight: number }[] };

const tabs: { id: Panel; title: string; icon: typeof UsersRound }[] = [
  { id: "overview", title: "Overview", icon: Award },
  { id: "entries", title: "Submissions", icon: FileText },
  { id: "reports", title: "Reports", icon: Flag },
  { id: "users", title: "Members", icon: UsersRound },
  { id: "competition", title: "Competition", icon: CircleAlert },
  { id: "audit", title: "Audit log", icon: Clock3 },
];

async function requestJson<T>(path: string, init?: RequestInit): Promise<{ data?: T; error?: string }> {
  try {
    const response = await apiFetch(path, init);
    const payload = await response.json();
    return response.ok ? { data: payload as T } : { error: payload.error ?? "This action isn't available." };
  } catch { return { error: "We couldn't reach the Dear You API." }; }
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function AdminDashboard() {
  const [panel, setPanel] = useState<Panel>("overview");
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [role, setRole] = useState<"admin" | "moderator" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analytics, setAnalytics] = useState<{ users: number; submissions: number; reports: number; premiumMembers: number } | null>(null);
  const [recentAudit, setRecentAudit] = useState<Record<string, unknown>[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [members, setMembers] = useState<ManagedUser[]>([]);
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("open");
  const [endsAt, setEndsAt] = useState("");
  const [rulesText, setRulesText] = useState("");
  const [criteriaText, setCriteriaText] = useState("");
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");

  const loadPanel = useCallback(async (target: Panel) => {
    setLoading(true); setError(""); setNotice("");
    const paths: Record<Panel, string> = { overview: "/api/admin/overview", entries: "/api/admin/entries", reports: "/api/admin/reports", users: "/api/admin/users", competition: "/api/admin/competition", audit: "/api/admin/audit" };
    const result = await requestJson<Record<string, unknown>>(paths[target]);
    if (result.error) {
      setError(result.error);
      setAuthorized(false);
      setLoading(false);
      return;
    }
    setAuthorized(true);
    const payload = result.data ?? {};
    if (target === "overview") {
      setAnalytics(payload.analytics as typeof analytics);
      setRecentAudit((payload.recentAudit as Record<string, unknown>[]) ?? []);
    }
    if (target === "entries") setEntries((payload.entries as Entry[]) ?? []);
    if (target === "reports") setReports((payload.reports as Report[]) ?? []);
    if (target === "users") setMembers((payload.users as ManagedUser[]) ?? []);
    if (target === "audit") setEvents((payload.events as Record<string, unknown>[]) ?? []);
    if (target === "competition") {
      const item = payload.competition as Competition | null;
      setCompetition(item);
      if (item) {
        setTitle(item.title); setDescription(item.description); setStatus(item.status);
        const date = new Date(item.endsAt);
        setEndsAt(Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
        setRulesText((item.rules ?? []).join("\n")); setCriteriaText(JSON.stringify(item.criteria ?? [], null, 2));
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadPanel(panel); }, [panel, loadPanel]);
  useEffect(() => {
    void requestJson<{ user: { role?: string } | null }>("/api/auth/me").then((result) => {
      const sessionRole = result.data?.user?.role;
      if (sessionRole === "admin" || sessionRole === "moderator") setRole(sessionRole);
    });
  }, []);

  async function moderateEntry(entry: Entry, nextStatus: string) {
    setBusyId(entry.id); setNotice("");
    const result = await requestJson<{ entry: { id: string; status: string } }>(`/api/admin/entries/${entry.id}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus, moderationNote: "Reviewed by the Dear You moderation team." }) });
    if (result.error) setError(result.error);
    else { setEntries((current) => current.map((item) => item.id === entry.id ? { ...item, status: nextStatus } : item)); setNotice("Submission status updated and recorded in the audit log."); }
    setBusyId("");
  }

  async function updateReport(report: Report, nextStatus: string) {
    setBusyId(report.id); setNotice("");
    const result = await requestJson<{ report: { id: string; status: string } }>(`/api/admin/reports/${report.id}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
    if (result.error) setError(result.error);
    else { setReports((current) => current.map((item) => item.id === report.id ? { ...item, status: nextStatus } : item)); setNotice("Report status updated and recorded in the audit log."); }
    setBusyId("");
  }

  async function updateMember(member: ManagedUser) {
    const nextStatus = member.status === "active" ? "suspended" : "active";
    setBusyId(member.id); setNotice("");
    const result = await requestJson<{ user: { id: string; status: string } }>(`/api/admin/users/${member.id}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
    if (result.error) setError(result.error);
    else { setMembers((current) => current.map((item) => item.id === member.id ? { ...item, status: nextStatus } : item)); setNotice("Member status updated. Active sessions were revoked if needed."); }
    setBusyId("");
  }

  async function saveCompetition(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!competition) return;
    let rules: string[];
    let criteria: Competition["criteria"];
    try {
      rules = rulesText.split("\n").map((line) => line.trim()).filter(Boolean);
      criteria = JSON.parse(criteriaText) as Competition["criteria"];
      if (!Array.isArray(criteria)) throw new Error("Rubric should be a JSON array.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Check the competition rubric format."); return; }
    setBusyId("competition"); setError(""); setNotice("");
    const result = await requestJson<{ competition: Competition }>("/api/admin/competition", { method: "PATCH", body: JSON.stringify({ id: competition.id, title, description, status, endsAt: new Date(endsAt).toISOString(), rules, criteria }) });
    if (result.error) setError(result.error);
    else { setCompetition(result.data?.competition ?? competition); setNotice("Competition settings saved and added to the audit log."); }
    setBusyId("");
  }

  if (authorized === false && !loading) return <main className="admin-denied"><div className="brand-lockup"><div className="brand-icon"><Award size={17} /></div><div className="brand-name">dear you<span>ADMINISTRATION</span></div></div><span className="admin-denied-icon"><LockKeyholeIcon /></span><p className="eyebrow">PRIVATE ADMIN AREA</p><h1>This space is for the team.</h1><p>Your account doesn’t have the role required to view or change platform data. This is checked again by every API request.</p><Link href="/" className="button-primary"><ArrowLeft size={15} /> Back to Dear You</Link></main>;

  return <div className="admin-shell"><header className="admin-topbar"><div className="admin-brand"><span className="brand-icon"><Award size={16} /></span><span><strong>dear you</strong><small>ADMINISTRATION</small></span></div><Link href="/" className="admin-back"><ArrowLeft size={14} /> Back to the app</Link></header><div className="admin-layout"><aside className="admin-sidebar"><p className="eyebrow">PLATFORM OPERATIONS</p><nav aria-label="Admin navigation" role="tablist">{tabs.filter((tab) => role !== "moderator" || ["overview", "entries", "reports"].includes(tab.id)).map((tab) => { const Icon = tab.icon; return <button key={tab.id} role="tab" aria-selected={panel === tab.id} className={panel === tab.id ? "admin-tab admin-tab-active" : "admin-tab"} onClick={() => setPanel(tab.id)}><Icon size={16} /><span>{tab.title}</span><ChevronRight size={14} /></button>; })}</nav><div className="admin-sidebar-note"><span><ShieldCheckIcon /></span><p>Every privileged action is recorded. Competition judging stays separate from paid membership.</p></div></aside><main className="admin-main"><div className="admin-heading"><div><p className="eyebrow">DEAR YOU · TRUST & SAFETY</p><h1>{tabs.find((item) => item.id === panel)?.title ?? "Administration"}</h1><p>Role-protected platform tools. Sensitive actions are logged.</p></div><span className="admin-secure-pill"><ShieldCheckIcon /> Server enforced</span></div>{error && <div className="admin-alert" role="alert"><CircleAlert size={15} />{error}</div>}{notice && <div className="admin-notice" role="status"><Check size={15} />{notice}</div>}{loading ? <div className="admin-loading"><span className="loading-spinner" />Loading protected data…</div> : <AnimatePresence mode="wait"><motion.div key={panel} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: .16 }}>
      {panel === "overview" && <section className="admin-overview"><div className="admin-stat-grid">{[["Members",analytics?.users ?? 0,"all accounts"],["Submissions",analytics?.submissions ?? 0,"all statuses"],["Open reports",analytics?.reports ?? 0,"moderation queue"],["Premium",analytics?.premiumMembers ?? 0,"verified memberships"]].map(([label,value,caption])=><article className="admin-stat-card" key={String(label)}><span>{label}</span><strong>{Number(value).toLocaleString()}</strong><small>{caption}</small></article>)}</div><section className="admin-table-card"><div className="admin-table-head"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>What’s been happening.</h2></div><button className="button-outline" onClick={() => setPanel("audit")}>Open audit log <ArrowRight size={13} /></button></div><div className="admin-event-list">{recentAudit.length ? recentAudit.map((event) => <div className="admin-event-row" key={String(event.id)}><span className="admin-event-dot" /><strong>{String(event.action).replaceAll("_"," ")}</strong><span>{String(event.targetType)}</span><time>{dateLabel(String(event.createdAt))}</time></div>) : <p className="admin-empty-inline">No audit events have been recorded yet.</p>}</div></section><section className="admin-fairness-banner"><ShieldCheckIcon /><div><strong>Contest integrity is not a premium feature.</strong><p>Entry is free. Subscription status, coins, and purchases are excluded from every judging and moderation decision.</p></div></section></section>}
      {panel === "entries" && <section className="admin-list-panel"><div className="admin-panel-intro"><p className="eyebrow">HUMAN REVIEW QUEUE</p><h2>Competition submissions</h2><p>Pending stories start private. Approved stories become eligible for the community collection.</p></div>{entries.length ? entries.map((entry) => <article className="admin-entry-card" key={entry.id}><div className="admin-item-head"><span className={`admin-status status-${entry.status}`}>{entry.status.replaceAll("_"," ")}</span><time>{dateLabel(entry.submittedAt)}</time></div><h3>{entry.title}</h3><p className="admin-entry-meta">By {entry.authorName} · {entry.relationship} · {entry.competitionTitle}</p><blockquote>{entry.story}</blockquote>{entry.moderationNote && <p className="admin-note">Previous note: {entry.moderationNote}</p>}<div className="admin-item-actions"><button disabled={busyId===entry.id||entry.status==="approved"} onClick={() => moderateEntry(entry,"approved")}><Check size={13} /> Approve</button><button disabled={busyId===entry.id||entry.status==="needs_review"} onClick={() => moderateEntry(entry,"needs_review")}><Clock3 size={13} /> Needs review</button><button className="admin-danger-action" disabled={busyId===entry.id||entry.status==="rejected"} onClick={() => moderateEntry(entry,"rejected")}><X size={13} /> Reject</button></div></article>) : <div className="admin-empty-state"><FileText size={21} /><p>No submissions have arrived yet.</p></div>}</section>}
      {panel === "reports" && <section className="admin-list-panel"><div className="admin-panel-intro"><p className="eyebrow">COMMUNITY SAFETY</p><h2>Abuse & content reports</h2><p>Review reports against shared cards, Duo stories, and approved contest entries.</p></div>{reports.length ? reports.map((report) => <article className="admin-report-card" key={report.id}><div className="admin-item-head"><span className={`admin-status status-${report.status}`}>{report.status.replaceAll("_"," ")}</span><time>{dateLabel(report.createdAt)}</time></div><div className="admin-report-target"><Flag size={14} />{report.targetType} · <code>{report.targetId}</code></div><p>{report.reason}</p><small>Reported by {report.reporterName}</small><div className="admin-item-actions"><button disabled={busyId===report.id||report.status==="reviewing"} onClick={() => updateReport(report,"reviewing")}><Clock3 size={13} /> Review</button><button disabled={busyId===report.id||report.status==="resolved"} onClick={() => updateReport(report,"resolved")}><Check size={13} /> Resolve</button><button className="admin-danger-action" disabled={busyId===report.id||report.status==="dismissed"} onClick={() => updateReport(report,"dismissed")}><X size={13} /> Dismiss</button></div></article>) : <div className="admin-empty-state"><Flag size={21} /><p>No reports are waiting for a review.</p></div>}</section>}
      {panel === "users" && <section className="admin-table-card"><div className="admin-table-head"><div><p className="eyebrow">ACCOUNT MANAGEMENT</p><h2>Members</h2><p>Role promotion is intentionally unavailable here. Suspend or restore accounts; the server revokes sessions on suspension.</p></div></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Joined</th><th /></tr></thead><tbody>{members.map((member)=><tr key={member.id}><td><strong>{member.displayName}</strong><small>{member.email}</small></td><td>{member.role}</td><td><span className={`admin-status status-${member.status}`}>{member.status}</span></td><td>{dateLabel(member.createdAt)}</td><td><button className={member.status === "active" ? "admin-table-action danger" : "admin-table-action"} disabled={busyId===member.id} onClick={() => updateMember(member)}>{member.status === "active" ? "Suspend" : "Restore"}</button></td></tr>)}</tbody></table>{!members.length && <p className="admin-empty-inline">No members found.</p>}</div></section>}
      {panel === "competition" && <section className="admin-table-card"><div className="admin-table-head"><div><p className="eyebrow">PROGRAM CONTROLS</p><h2>Competition settings</h2><p>Changes to the judging rubric, rules, and deadline are audited. Weights must total 100%.</p></div></div>{competition ? <form className="admin-competition-form" onSubmit={saveCompetition}><label>Display title<input value={title} onChange={(e)=>setTitle(e.target.value)} maxLength={120} required /></label><label>Description<textarea value={description} onChange={(e)=>setDescription(e.target.value)} maxLength={1200} rows={3} required /></label><div className="admin-form-split"><label>Entry status<select value={status} onChange={(e)=>setStatus(e.target.value)}><option value="draft">Draft</option><option value="open">Open</option><option value="judging">Judging</option><option value="closed">Closed</option></select></label><label>Closes at<input type="datetime-local" value={endsAt} onChange={(e)=>setEndsAt(e.target.value)} required /></label></div><label>Official rules <small>One rule per line</small><textarea value={rulesText} onChange={(e)=>setRulesText(e.target.value)} rows={6} required /></label><label>Judging criteria JSON <small>Each weight is an integer; all weights must total 100.</small><textarea className="admin-code-input" value={criteriaText} onChange={(e)=>setCriteriaText(e.target.value)} rows={10} spellCheck={false} required /></label><button className="button-primary" disabled={busyId==="competition"}>{busyId==="competition"?"Saving…":"Save competition settings"}<Check size={14}/></button></form> : <div className="admin-empty-state"><Award size={21}/><p>No competition configuration exists yet.</p></div>}</section>}
      {panel === "audit" && <section className="admin-table-card"><div className="admin-table-head"><div><p className="eyebrow">SENSITIVE ACTION HISTORY</p><h2>Audit log</h2><p>Latest records of account, moderation, media, and billing changes.</p></div></div><div className="admin-audit-list">{events.length ? events.map((event,index)=><article className="admin-audit-row" key={String(event.id??index)}><span className="admin-audit-mark"><Clock3 size={13}/></span><div><strong>{String(event.action).replaceAll("_"," ")}</strong><small>{String(event.actorName??"System")} · {String(event.targetType)} {event.targetId?`· ${String(event.targetId)}`:""}</small></div><time>{dateLabel(String(event.createdAt))}</time></article>) : <p className="admin-empty-inline">No events have been recorded yet.</p>}</div></section>}
    </motion.div></AnimatePresence>}</main></div><footer className="admin-footer">Dear You · Private operations console · Protected by server-side role checks</footer></div>;
}

function LockKeyholeIcon() { return <span aria-hidden="true" className="lock-icon-symbol">⌑</span>; }
function ShieldCheckIcon() { return <span aria-hidden="true" className="shield-icon-symbol">✓</span>; }
