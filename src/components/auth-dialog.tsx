"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Heart, X } from "lucide-react";
import { useState } from "react";
import { apiFetch } from "@/lib/client-api";
import type { ProductUser } from "@/lib/types";

type Props = { open: boolean; onClose: () => void; onSuccess: (user: ProductUser) => void };

export function AuthDialog({ open, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch(`/api/auth/${mode === "register" ? "register" : "login"}`, {
        method: "POST",
        body: JSON.stringify(mode === "register" ? { displayName: name, email, password } : { email, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "We couldn't complete that request.");
      onSuccess(result.user as ProductUser);
      onClose();
      setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="dialog-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
          <motion.section role="dialog" aria-modal="true" aria-labelledby="auth-title" className="auth-dialog" initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.22 }}>
            <button type="button" className="dialog-close" onClick={onClose} aria-label="Close sign in dialog"><X size={18} /></button>
            <div className="auth-mark"><Heart size={17} fill="currentColor" /></div>
            <p className="eyebrow">A softer corner of the internet</p>
            <h2 id="auth-title">{mode === "register" ? "Make room for a little more meaning." : "Welcome back, dear heart."}</h2>
            <p className="auth-copy">{mode === "register" ? "Create a free account to save your cards, keep drafts, and share when it feels right." : "Your notes and little surprises are right where you left them."}</p>
            <form onSubmit={submit} className="auth-form">
              {mode === "register" && <label>Your name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="What should we call you?" minLength={2} maxLength={60} required /></label>}
              <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" maxLength={320} required /></label>
              <label>Password<input type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "register" ? "At least 10 characters" : "Your password"} minLength={mode === "register" ? 10 : 1} maxLength={128} required /></label>
              {error && <p role="alert" className="form-error">{error}</p>}
              <button className="button-primary auth-submit" disabled={busy} type="submit">{busy ? "One moment…" : mode === "register" ? "Create your free account" : "Sign in"}<ArrowRight size={16} /></button>
            </form>
            <p className="auth-switch">{mode === "register" ? "Already have a little corner here?" : "New to Dear You?"} <button type="button" onClick={() => { setMode(mode === "register" ? "login" : "register"); setError(""); }}>{mode === "register" ? "Sign in" : "Create an account"}</button></p>
            <p className="auth-legal">By continuing, you agree to keep this a kind place. Your drafts stay private until you choose to share them.</p>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
