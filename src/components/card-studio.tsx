"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, LockKeyhole, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";
import type { CardRecord } from "@/lib/types";

const themes = [
  { id: "letter", name: "The little letter", tag: "FREE", className: "theme-letter" },
  { id: "petal", name: "Soft petals", tag: "FREE", className: "theme-petal" },
  { id: "botanical", name: "Wild garden", tag: "STUDIO+", className: "theme-botanical" },
  { id: "night-sky", name: "Afterglow", tag: "STUDIO+", className: "theme-night" },
];

type Props = {
  open: boolean;
  initial?: CardRecord | null;
  isPremium: boolean;
  onClose: () => void;
  onSaved: (card: CardRecord, coinReward: number) => void;
  onUpgrade: () => void;
};

export function CardStudio({ open, initial, isPremium, onClose, onSaved, onUpgrade }: Props) {
  const [title, setTitle] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState("letter");
  const [animation, setAnimation] = useState("fade");
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "A little note for you");
    setRecipientName(initial?.recipientName ?? "");
    setMessage(initial?.message ?? "Some people make the whole world feel a little softer. I’m so glad I found you.");
    setTheme(initial?.theme ?? "letter");
    setAnimation(initial?.animation ?? "fade");
    setPublished(initial?.published ?? false);
    setError("");
  }, [open, initial]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch(initial ? `/api/cards/${initial.id}` : "/api/cards", {
        method: initial ? "PATCH" : "POST",
        body: JSON.stringify({ title, recipientName, message, theme, animation, published }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Your card couldn't be saved.");
      onSaved(result.card as CardRecord, Number(result.coinReward ?? 0));
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your card couldn't be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="dialog-backdrop studio-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
          <motion.section role="dialog" aria-modal="true" aria-labelledby="studio-title" className="studio-dialog" initial={{ opacity: 0, y: 22, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.24 }}>
            <header className="studio-header"><div><p className="eyebrow">THE CARD STUDIO</p><h2 id="studio-title">{initial ? "Give it your finishing touch." : "A small thing, made with love."}</h2></div><button type="button" className="dialog-close" onClick={onClose} aria-label="Close card studio"><X size={18} /></button></header>
            <form onSubmit={save} className="studio-layout">
              <div className="studio-controls">
                <label className="field-label">A name for your card<input className="studio-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required /></label>
                <label className="field-label">Made for <span className="optional-label">(optional)</span><input className="studio-input" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Their lovely name" maxLength={80} /></label>
                <label className="field-label">Your message<textarea className="studio-input studio-textarea" value={message} onChange={(event) => setMessage(event.target.value)} rows={5} maxLength={1800} required /></label>
                <div className="field-label">Choose a feeling</div>
                <div className="theme-options" role="group" aria-label="Card themes">
                  {themes.map((item) => {
                    const locked = item.tag === "STUDIO+" && !isPremium;
                    return <button type="button" key={item.id} onClick={() => locked ? onUpgrade() : setTheme(item.id)} className={`theme-choice ${theme === item.id ? "selected" : ""}`} aria-pressed={theme === item.id}>
                      <span className={`theme-swatch ${item.className}`}><span className="theme-swatch-dot" /></span><span className="theme-choice-label">{item.name}<small>{item.tag}</small></span>{locked ? <LockKeyhole size={14} /> : theme === item.id ? <Check size={15} /> : null}
                    </button>;
                  })}
                </div>
                <label className="field-label">A little movement</label>
                <div className="animation-options">
                  <button type="button" className={animation === "fade" ? "active" : ""} onClick={() => setAnimation("fade")}>Soft fade</button>
                  <button type="button" className={animation === "float" ? "active" : ""} onClick={() => setAnimation("float")}>Gentle float</button>
                  <button type="button" className={animation === "sparkle" ? "active" : ""} onClick={() => isPremium ? setAnimation("sparkle") : onUpgrade()}>{isPremium ? "Little sparkles" : <><LockKeyhole size={12} /> Sparkles</>}</button>
                </div>
                <label className="share-choice"><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} /><span><strong>Create a private share link</strong><small>Your card stays a draft unless you choose to share it.</small></span></label>
                {error && <p className="form-error" role="alert">{error}</p>}
                <div className="studio-actions"><button className="button-primary" type="submit" disabled={busy}>{busy ? "Saving your card…" : initial ? "Save changes" : "Save my card"}<Sparkles size={15} /></button><button type="button" className="button-quiet" onClick={onClose}>Not just yet</button></div>
              </div>
              <div className="studio-preview-wrap"><p className="preview-kicker"><span className="preview-live-dot" /> LIVE PREVIEW</p><article className={`card-preview ${theme === "petal" ? "preview-petal" : theme === "botanical" ? "preview-botanical" : theme === "night-sky" ? "preview-night" : "preview-letter"}`}>
                <span className="preview-overline">A NOTE, JUST FOR YOU</span><span className="preview-flower" aria-hidden="true">{theme === "botanical" ? "✿" : theme === "night-sky" ? "✦" : "✿"}</span><p className="preview-to">{recipientName ? `dear ${recipientName},` : "dear you,"}</p><h3>{title || "A little note for you"}</h3><p className="preview-message">{message || "Your words will find their way here…"}</p><span className="preview-signoff">with all my love</span>
              </article><p className="preview-note">A little note, ready when you are. <span>♡</span></p></div>
            </form>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
