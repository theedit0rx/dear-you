"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, LockKeyhole, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";
import type { ExperienceRecord } from "@/lib/types";

type Props = { open: boolean; initial?: ExperienceRecord | null; isPremium: boolean; onClose: () => void; onSaved: (experience: ExperienceRecord) => void; onUpgrade: () => void };

export function ExperienceStudio({ open, initial, isPremium, onClose, onSaved, onUpgrade }: Props) {
  const [title, setTitle] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [memory, setMemory] = useState("");
  const [note, setNote] = useState("");
  const [reveal, setReveal] = useState("");
  const [theme, setTheme] = useState("petal");
  const [published, setPublished] = useState(false);
  const [revealPreview, setRevealPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "Our little collection");
    setRecipientName(initial?.recipientName ?? "");
    setMemory(initial?.memory ?? "I still think about the afternoon we got wonderfully lost and somehow found the best little bakery.");
    setNote(initial?.note ?? "Thank you for making the ordinary parts of life feel worth remembering.");
    setReveal(initial?.reveal ?? "I saved this just for you. Let's make a new memory soon.");
    setTheme(initial?.theme ?? "petal");
    setPublished(initial?.published ?? false);
    setRevealPreview(false);
    setError("");
  }, [open, initial]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch(initial ? `/api/experiences/${initial.id}` : "/api/experiences", {
        method: initial ? "PATCH" : "POST",
        body: JSON.stringify({ title, recipientName, memory, note, reveal, theme, published }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Your Duo experience couldn't be saved.");
      onSaved(result.experience as ExperienceRecord);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your experience couldn't be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && <motion.div className="dialog-backdrop studio-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <motion.section role="dialog" aria-modal="true" aria-labelledby="duo-title" className="studio-dialog duo-dialog" initial={{ opacity: 0, y: 22, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.24 }}>
          <header className="studio-header"><div><p className="eyebrow">DUO EXPERIENCE · JUST FOR TWO</p><h2 id="duo-title">A story the two of you can step into.</h2></div><button type="button" className="dialog-close" onClick={onClose} aria-label="Close Duo studio"><X size={18} /></button></header>
          <form className="studio-layout" onSubmit={save}>
            <div className="studio-controls">
              <label className="field-label">Name this experience<input className="studio-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required /></label>
              <label className="field-label">For someone special<input className="studio-input" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Their name" maxLength={80} required /></label>
              <label className="field-label">A memory you share<textarea className="studio-input studio-textarea" value={memory} onChange={(event) => setMemory(event.target.value)} rows={3} maxLength={900} minLength={10} required /></label>
              <label className="field-label">Something you want them to know<textarea className="studio-input studio-textarea" value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={900} minLength={10} required /></label>
              <label className="field-label">A little surprise for the end<textarea className="studio-input studio-textarea" value={reveal} onChange={(event) => setReveal(event.target.value)} rows={2} maxLength={500} minLength={3} required /></label>
              <div className="field-label">Choose your story's mood</div>
              <div className="theme-options duo-themes">
                <button type="button" className={`theme-choice ${theme === "petal" ? "selected" : ""}`} onClick={() => setTheme("petal")}><span className="theme-swatch theme-petal" /><span className="theme-choice-label">Tender petals<small>FREE</small></span>{theme === "petal" && <Check size={15} />}</button>
                <button type="button" className={`theme-choice ${theme === "sunset" ? "selected" : ""}`} onClick={() => setTheme("sunset")}><span className="theme-swatch theme-sunset" /><span className="theme-choice-label">Last light<small>FREE</small></span>{theme === "sunset" && <Check size={15} />}</button>
                <button type="button" className={`theme-choice ${theme === "keepsake" ? "selected" : ""}`} onClick={() => isPremium ? setTheme("keepsake") : onUpgrade()}><span className="theme-swatch theme-keepsake" /><span className="theme-choice-label">Keepsake<small>STUDIO+</small></span>{!isPremium ? <LockKeyhole size={14} /> : theme === "keepsake" ? <Check size={15} /> : null}</button>
              </div>
              <label className="share-choice"><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} /><span><strong>Create a private share link</strong><small>Only people with this link can open the experience.</small></span></label>
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="studio-actions"><button type="submit" className="button-primary" disabled={busy}>{busy ? "Saving your story…" : initial ? "Save changes" : "Make our experience"}<Sparkles size={15} /></button><button type="button" className="button-quiet" onClick={onClose}>Keep dreaming</button></div>
            </div>
            <div className="studio-preview-wrap duo-preview-wrap"><p className="preview-kicker"><span className="preview-live-dot" /> THE STORY SO FAR</p><article className={`duo-live-preview ${theme === "sunset" ? "duo-sunset" : theme === "keepsake" ? "duo-keepsake" : "duo-petal"}`}>
              <span className="duo-preview-number">01 — A LITTLE MEMORY</span><span className="duo-heart" aria-hidden="true">♡</span><p className="duo-preview-for">for {recipientName || "your favorite person"}</p><h3>{title || "Our little collection"}</h3><p className="duo-memory">“{memory || "A memory worth keeping…"}”</p><div className="duo-divider" /><p className="duo-memory">{note || "A note, from the heart."}</p><button type="button" className="reveal-preview" onClick={() => setRevealPreview((value) => !value)}>{revealPreview ? reveal : "Tap to preview the surprise"}<span>{revealPreview ? "↗" : "✦"}</span></button>
            </article><p className="preview-note">The best stories are the ones we share. <span>♡</span></p></div>
          </form>
        </motion.section>
      </motion.div>}
    </AnimatePresence>
  );
}
