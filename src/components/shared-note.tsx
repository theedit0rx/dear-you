"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Flag, Heart, LockKeyhole, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthDialog } from "@/components/auth-dialog";
import { apiFetch } from "@/lib/client-api";
import type { ProductUser } from "@/lib/types";

type CardShare = { id: string; title: string; recipientName: string; message: string; theme: string; animation: string; createdAt?: string };
type ExperienceShare = { id: string; title: string; recipientName: string; memory: string; note: string; reveal: string; theme: string };

export function SharedNote({ token, kind }: { token: string; kind: "card" | "duo" }) {
  const [card, setCard] = useState<CardShare | null>(null);
  const [experience, setExperience] = useState<ExperienceShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportPending, setReportPending] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportError, setReportError] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    let mounted = true;
    apiFetch(`/api/share/${kind === "card" ? "cards" : "experiences"}/${token}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("not found");
        return response.json();
      })
      .then((result) => {
        if (!mounted) return;
        if (kind === "card") setCard(result.card as CardShare);
        else setExperience(result.experience as ExperienceShare);
        setLoading(false);
      })
      .catch(() => { if (mounted) { setUnavailable(true); setLoading(false); } });
    return () => { mounted = false; };
  }, [kind, token]);

  const theme = kind === "card" ? card?.theme ?? "letter" : experience?.theme ?? "petal";
  const themeClass = theme === "petal" ? "theme-petal" : theme === "botanical" ? "theme-botanical" : theme === "night-sky" ? "theme-night" : "theme-letter";
  const recordId = kind === "card" ? card?.id : experience?.id;

  async function askToReport() {
    setReportError("");
    try {
      const response = await apiFetch("/api/auth/me");
      const payload = await response.json();
      if (payload.user) setReportOpen(true);
      else { setReportPending(true); setAuthOpen(true); }
    } catch {
      setReportPending(true); setAuthOpen(true);
    }
  }

  async function sendReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recordId) return;
    setReportBusy(true); setReportError("");
    try {
      const response = await apiFetch("/api/reports", { method: "POST", body: JSON.stringify({ targetType: kind === "card" ? "card" : "experience", targetId: recordId, reason: reportReason }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Your report could not be sent.");
      setReported(true); setReportOpen(false); setReportReason("");
    } catch (reason) {
      setReportError(reason instanceof Error ? reason.message : "Your report could not be sent. Please try again.");
    } finally { setReportBusy(false); }
  }

  function authenticatedForReport(_user: ProductUser) {
    setAuthOpen(false);
    if (reportPending) { setReportOpen(true); setReportPending(false); }
  }

  return <main className="shared-page"><header className="shared-topbar"><Link href="/" className="shared-brand"><span className="brand-icon"><Heart size={16} fill="currentColor" /></span><span>dear you</span></Link><span className="shared-private-label"><LockKeyhole size={12} /> A private little link</span></header>
    <div className="shared-scene">
      {loading ? <div className="shared-loading"><span className="loading-spinner" /><p>Unfolding your note…</p></div> : unavailable ? <section className="shared-unavailable"><span className="unavailable-icon"><Heart size={22} /></span><p className="eyebrow">THIS NOTE IS TAKING A LITTLE REST</p><h1>We couldn’t find this shared moment.</h1><p>It may be private, removed, or the link may have been copied incorrectly.</p><Link href="/" className="button-primary">Make a new little note <ArrowRight size={15} /></Link></section> : kind === "card" && card ? <motion.article className={`shared-card ${themeClass}`} initial={{ opacity: 0, y: 22, rotate: -1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
        <div className="shared-card-paper"><span className="shared-card-overline">A NOTE, JUST FOR YOU</span><motion.span className="shared-card-flower" animate={card.animation === "float" ? { y: [0, -6, 0], rotate: [0, 8, 0] } : { opacity: 1 }} transition={{ duration: 4, repeat: card.animation === "float" ? Infinity : 0, ease: "easeInOut" }} aria-hidden="true">{theme === "night-sky" ? "✦" : "✿"}</motion.span><p className="shared-card-recipient">{card.recipientName ? `dear ${card.recipientName},` : "dear you,"}</p><h1>{card.title}</h1><p className="shared-card-message">{card.message}</p><div className="shared-card-bottom"><span>with all my love</span><Heart size={15} fill="currentColor" /></div></div><div className="shared-card-footer">a little thing, made with a lot of heart <span>♡</span></div>
      </motion.article> : kind === "duo" && experience ? <motion.article className={`shared-duo ${experience.theme === "sunset" ? "duo-sunset" : experience.theme === "keepsake" ? "duo-keepsake" : "duo-petal"}`} initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.58, ease: [0.16, 1, 0.3, 1] }}><div className="shared-duo-header"><span className="duo-preview-number">A STORY FOR TWO · 01</span><span className="duo-heart">♡</span><p>for {experience.recipientName}</p><h1>{experience.title}</h1><div className="shared-duo-rule"><span /> <Heart size={12} fill="currentColor" /> <span /></div></div><div className="shared-duo-content"><p className="shared-section-label"><Sparkles size={13} /> A MEMORY WE KEEP</p><blockquote>“{experience.memory}”</blockquote><div className="duo-divider" /><p className="shared-duo-note">{experience.note}</p><button type="button" className={`duo-reveal-button ${revealed ? "revealed" : ""}`} onClick={() => setRevealed((value) => !value)} aria-expanded={revealed}>{revealed ? <span>{experience.reveal}</span> : <>There's one more thing <Sparkles size={15} /></>}<span className="reveal-chevron">{revealed ? "♡" : "↗"}</span></button></div><div className="shared-card-footer">made for a moment between two people <span>♡</span></div></motion.article> : null}
    </div>
    {!loading && !unavailable && <motion.footer className="shared-cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}><p>Want to make someone feel this seen?</p><Link href="/" className="button-primary">Make a little something <ArrowRight size={15} /></Link></motion.footer>}
    {!loading && !unavailable && recordId && <section className="shared-report-area" aria-label="Report shared content">{reported ? <p className="shared-reported"><Heart size={13} /> Thank you. A moderator will take a look.</p> : reportOpen ? <form className="shared-report-form" onSubmit={sendReport}><label>Tell us what feels wrong<textarea value={reportReason} onChange={(event) => setReportReason(event.target.value)} minLength={8} maxLength={500} rows={3} required placeholder="Please share enough detail for a human moderator to review." /></label>{reportError && <p role="alert">{reportError}</p>}<div><button className="report-submit" type="submit" disabled={reportBusy}>{reportBusy ? "Sending…" : "Send report"}<Send size={13} /></button><button className="report-cancel" type="button" onClick={() => setReportOpen(false)}>Cancel</button></div></form> : <button className="shared-report-button" onClick={askToReport}><Flag size={12} /> Report a concern</button>}</section>}
    <p className="shared-page-footnote">Your shared link is unlisted. Anyone who has it can open this note. <span>·</span> Dear You</p>
    <AnimatePresence><AuthDialog open={authOpen} onClose={() => { setAuthOpen(false); setReportPending(false); }} onSuccess={authenticatedForReport} /></AnimatePresence>
  </main>;
}
