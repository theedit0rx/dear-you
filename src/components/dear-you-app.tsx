"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  Award,
  BookHeart,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Coins,
  Copy,
  CreditCard,
  Feather,
  Flower2,
  Gift,
  Heart,
  House,
  Images,
  LockKeyhole,
  LogOut,
  Menu,
  Moon,
  PenLine,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AuthDialog } from "@/components/auth-dialog";
import { BondOfTheYearFeature, useCountdown } from "@/components/bond-feature";
import { PhoneShowcase } from "@/components/phone-showcase";
import { CardStudio } from "@/components/card-studio";
import { ExperienceStudio } from "@/components/experience-studio";
import { apiFetch } from "@/lib/client-api";
import type { CardRecord, CompetitionEntryStatus, CompetitionRecord, ExperienceRecord, ProductUser } from "@/lib/types";

type View = "home" | "cards" | "duo" | "competition" | "coins" | "premium" | "settings";
type Toast = { id: number; message: string; kind?: "success" | "error" };
type EntryRecord = { id: string; title: string; status: CompetitionEntryStatus; submittedAt: string | Date };
type CompetitionPayload = { competition: CompetitionRecord | null; approvedEntries: number; myEntry: EntryRecord | null };
type CoinTransaction = { id: string; amount: number; activityKey: string; description: string; createdAt: string | Date };

const navLinks: { key: View; label: string; icon: typeof House }[] = [
  { key: "home", label: "Home", icon: House },
  { key: "cards", label: "Card studio", icon: PenLine },
  { key: "duo", label: "Duo experiences", icon: UsersRound },
  { key: "competition", label: "Bond of the Year", icon: Award },
  { key: "coins", label: "Love Coins", icon: Coins },
];

async function getPayload<T>(path: string): Promise<T | null> {
  try {
    const response = await apiFetch(path);
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

function prettyDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "Coming soon" : new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function shortDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "Just now" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "friend";
}

const padTwo = (value: number) => String(value).padStart(2, "0");

export function DearYouApp() {
  const [user, setUser] = useState<ProductUser | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [activeView, setActiveView] = useState<View>("home");
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [experiences, setExperiences] = useState<ExperienceRecord[]>([]);
  const [competitionData, setCompetitionData] = useState<CompetitionPayload | null>(null);
  const [competitionLoading, setCompetitionLoading] = useState(true);
  const [coinBalance, setCoinBalance] = useState(0);
  const [coinTransactions, setCoinTransactions] = useState<CoinTransaction[]>([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [experienceOpen, setExperienceOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CardRecord | null>(null);
  const [editingExperience, setEditingExperience] = useState<ExperienceRecord | null>(null);
  const [pendingStudio, setPendingStudio] = useState<"card" | "duo" | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [darkTheme, setDarkTheme] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [entryTitle, setEntryTitle] = useState("");
  const [entryRelationship, setEntryRelationship] = useState("");
  const [entryStory, setEntryStory] = useState("");
  const [eligibilityAttested, setEligibilityAttested] = useState(false);
  const [entryBusy, setEntryBusy] = useState(false);
  const [entryError, setEntryError] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string, kind: Toast["kind"] = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, kind });
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  useEffect(() => {
    let mounted = true;
    getPayload<{ user: ProductUser | null }>("/api/auth/me").then((payload) => {
      if (!mounted) return;
      setUser(payload?.user ?? null);
      setUserLoading(false);
    });
    getPayload<CompetitionPayload>("/api/competitions").then((payload) => {
      if (!mounted) return;
      setCompetitionData(payload);
      setCompetitionLoading(false);
    });
    try { setDarkTheme(window.localStorage.getItem("dear-you-theme") === "dark"); } catch { setDarkTheme(false); }
    return () => { mounted = false; if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  useEffect(() => {
    if (!user) {
      setCards([]);
      setExperiences([]);
      setCoinBalance(0);
      setCoinTransactions([]);
      return;
    }
    let mounted = true;
    Promise.all([
      getPayload<{ cards: CardRecord[] }>("/api/cards"),
      getPayload<{ experiences: ExperienceRecord[] }>("/api/experiences"),
      getPayload<{ balance: number; transactions: CoinTransaction[] }>("/api/coins"),
      getPayload<CompetitionPayload>("/api/competitions"),
    ]).then(([cardPayload, experiencePayload, coinPayload, compPayload]) => {
      if (!mounted) return;
      setCards(cardPayload?.cards ?? []);
      setExperiences(experiencePayload?.experiences ?? []);
      setCoinBalance(coinPayload?.balance ?? 0);
      setCoinTransactions(coinPayload?.transactions ?? []);
      if (compPayload) setCompetitionData(compPayload);
    });
    return () => { mounted = false; };
  }, [user]);

  useEffect(() => {
    document.documentElement.dataset.theme = darkTheme ? "dark" : "light";
    try { window.localStorage.setItem("dear-you-theme", darkTheme ? "dark" : "light"); } catch { /* Theme remains in memory. */ }
  }, [darkTheme]);

  function selectView(view: View) {
    setActiveView(view);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function createCard(initial: CardRecord | null = null) {
    setEditingCard(initial);
    if (!user) {
      setPendingStudio("card");
      setAuthOpen(true);
      return;
    }
    setCardOpen(true);
  }

  function createExperience(initial: ExperienceRecord | null = null) {
    setEditingExperience(initial);
    if (!user) {
      setPendingStudio("duo");
      setAuthOpen(true);
      return;
    }
    setExperienceOpen(true);
  }

  function handleAuthenticated(account: ProductUser) {
    setUser(account);
    notify(`Welcome${account.displayName ? `, ${firstName(account.displayName)}` : " back"}. Your corner is ready.`);
    if (pendingStudio === "card") setCardOpen(true);
    if (pendingStudio === "duo") setExperienceOpen(true);
    setPendingStudio(null);
  }

  function handleCardSaved(card: CardRecord, reward: number) {
    setCards((current) => current.some((item) => item.id === card.id) ? current.map((item) => item.id === card.id ? card : item) : [card, ...current]);
    if (reward > 0) {
      setCoinBalance((value) => value + reward);
      setCoinTransactions((current) => [{ id: `local-${Date.now()}`, amount: reward, activityKey: "first-card", description: "Your first little note is on its way", createdAt: new Date().toISOString() }, ...current]);
      notify("Your card is saved — and 5 Love Coins are yours for making someone's day.");
    } else notify(card.published ? "Your card is saved and its private link is ready." : "Your card is saved safely as a private draft.");
    setEditingCard(null);
  }

  function handleExperienceSaved(experience: ExperienceRecord) {
    setExperiences((current) => current.some((item) => item.id === experience.id) ? current.map((item) => item.id === experience.id ? experience : item) : [experience, ...current]);
    notify(experience.published ? "Your Duo experience is saved and ready to share." : "Your Duo experience is safe as a private draft.");
    setEditingExperience(null);
  }

  async function deleteCard(card: CardRecord) {
    if (!window.confirm("Delete this card? This can't be undone.")) return;
    const response = await apiFetch(`/api/cards/${card.id}`, { method: "DELETE" });
    if (!response.ok) { const result = await response.json().catch(() => ({})); notify(result.error ?? "The card could not be deleted.", "error"); return; }
    setCards((current) => current.filter((item) => item.id !== card.id));
    notify("The card was deleted.");
  }

  async function deleteExperience(experience: ExperienceRecord) {
    if (!window.confirm("Delete this Duo experience? This can't be undone.")) return;
    const response = await apiFetch(`/api/experiences/${experience.id}`, { method: "DELETE" });
    if (!response.ok) { const result = await response.json().catch(() => ({})); notify(result.error ?? "The experience could not be deleted.", "error"); return; }
    setExperiences((current) => current.filter((item) => item.id !== experience.id));
    notify("The experience was deleted.");
  }

  async function copyLink(type: "cards" | "duo", token: string) {
    const link = `${window.location.origin}/${type === "cards" ? "c" : "duo"}/${token}`;
    try {
      await navigator.clipboard.writeText(link);
      notify("Your private link has been copied.");
    } catch {
      notify(link, "success");
    }
  }

  async function signOut() {
    const response = await apiFetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) { notify("We couldn't sign you out just now. Please try again.", "error"); return; }
    setUser(null);
    setActiveView("home");
    notify("You’re signed out. Your drafts will be here when you return.");
  }

  async function submitEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) { setAuthOpen(true); return; }
    if (!competitionData?.competition) return;
    setEntryBusy(true);
    setEntryError("");
    try {
      const response = await apiFetch("/api/competitions/entries", {
        method: "POST",
        body: JSON.stringify({ competitionId: competitionData.competition.id, title: entryTitle, relationship: entryRelationship, story: entryStory, eligibilityAttested }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Your entry could not be sent.");
      setCompetitionData((current) => current ? { ...current, myEntry: result.entry as EntryRecord } : current);
      setEntryTitle(""); setEntryRelationship(""); setEntryStory(""); setEligibilityAttested(false);
      notify("Your story is in. Thank you for sharing something meaningful.");
    } catch (reason) {
      setEntryError(reason instanceof Error ? reason.message : "Your entry could not be sent. Please try again.");
    } finally {
      setEntryBusy(false);
    }
  }

  async function startCheckout() {
    if (!user) { setAuthOpen(true); return; }
    try {
      const response = await apiFetch("/api/billing/checkout", { method: "POST", body: JSON.stringify({}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Checkout isn't available yet.");
      if (typeof result.url !== "string") throw new Error("The payment provider did not return a checkout link.");
      window.location.assign(result.url);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "Premium checkout isn't configured yet. No payment has been taken.", "error");
    }
  }

  const heading = {
    cards: ["YOUR LITTLE STUDIO", "Cards made of feeling", "A quiet space to shape a note that sounds like you."],
    duo: ["SOMETHING JUST FOR TWO", "Make a memory together", "A private little story with a note, a memory, and one lovely surprise."],
    competition: ["THE COMMUNITY EDITION", "Bond of the Year", "A free celebration of the people who make life feel like home."],
    coins: ["A LITTLE THANK-YOU", "Your Love Coins", "Earned through thoughtful things, never bought to win."],
    premium: ["FOR THE EXTRA-LITTLE DETAILS", "Premium Studio", "More room to play. Never more say in what matters."],
    settings: ["YOUR LITTLE CORNER", "Account settings", "The details that make this space feel like yours."],
  }[activeView as Exclude<View, "home">];

  return (
    <div className={`dear-you-app ${darkTheme ? "theme-dark" : ""}`}>
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup"><div className="brand-icon"><Heart size={17} fill="currentColor" /></div><div className="brand-name">dear you<span>made to be remembered</span></div><button className="sidebar-close mobile-only" onClick={() => setMobileNavOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
        <div className="sidebar-divider" />
        <p className="sidebar-label">YOUR SPACE</p>
        <nav className="side-nav" aria-label="Main navigation">
          {navLinks.map((link) => {
            const Icon = link.icon;
            return <button key={link.key} className={`side-link ${activeView === link.key ? "side-link-active" : ""}`} onClick={() => selectView(link.key)}><Icon size={17} strokeWidth={1.8} /><span>{link.label}</span>{link.key === "competition" && <span className={competitionData?.competition ? "nav-live-pill" : "nav-free-pill"}>{competitionData?.competition ? "LIVE" : "FREE"}</span>}</button>;
          })}
          <button className={`side-link ${activeView === "premium" ? "side-link-active" : ""}`} onClick={() => selectView("premium")}><Sparkles size={17} strokeWidth={1.8} /><span>Premium Studio</span><span className="nav-plus-pill">PLUS</span></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note"><div className="sidebar-note-top"><span>JUST BECAUSE</span><Heart size={13} /></div><p>Small gestures have a way of staying.</p><button onClick={() => createCard()}>Make someone's day <ArrowRight size={13} /></button></div>
          <button className={`side-link ${activeView === "settings" ? "side-link-active" : ""}`} onClick={() => user ? selectView("settings") : setAuthOpen(true)}><Settings size={17} strokeWidth={1.8} /><span>Account settings</span></button>
          {(user?.role === "admin" || user?.role === "moderator") && <a className="side-link" href="/admin"><ShieldCheck size={17} /><span>{user.role === "admin" ? "Admin dashboard" : "Moderation"}</span><ArrowUpRight size={13} /></a>}
          <button className="sidebar-profile" onClick={() => user ? selectView("settings") : setAuthOpen(true)}>
            {user ? <span className="avatar avatar-user">{firstName(user.displayName).slice(0, 1).toUpperCase()}</span> : <span className="avatar avatar-guest"><Heart size={14} /></span>}
            <span className="sidebar-profile-name">{user ? user.displayName : "Your little corner"}<small>{user ? user.isPremium ? "Premium member" : "Free member" : "Sign in or make an account"}</small></span><ChevronDown size={14} className="profile-chevron" />
          </button>
        </div>
      </aside>

      {mobileNavOpen && <button className="mobile-nav-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}

      <div className="app-main-column">
        <header className="topbar">
          <button className="mobile-menu-button mobile-only" onClick={() => setMobileNavOpen(true)} aria-label="Open menu"><Menu size={21} /></button>
          <div className="topbar-message"><span className="topbar-dot" /> A softer kind of social</div>
          <div className="topbar-actions">
            <button className="icon-button theme-toggle" onClick={() => setDarkTheme((value) => !value)} aria-label={darkTheme ? "Switch to light theme" : "Switch to dark theme"}>{darkTheme ? <Sun size={17} /> : <Moon size={17} />}</button>
            {user ? <button className="topbar-account" onClick={() => selectView("settings")}><span className="avatar avatar-small">{firstName(user.displayName).slice(0, 1).toUpperCase()}</span><span>{firstName(user.displayName)}</span></button> : <button className="topbar-signin" onClick={() => setAuthOpen(true)}>Sign in <ArrowRight size={14} /></button>}
          </div>
        </header>

        <main id="main-content" className="app-content">
          {activeView !== "home" && heading && <motion.header className="view-heading" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={activeView}><div><p className="eyebrow">{heading[0]}</p><h1>{heading[1]}</h1><p>{heading[2]}</p></div>{activeView === "cards" && <button className="button-primary" onClick={() => createCard()}><Plus size={16} /> Make a card</button>}{activeView === "duo" && <button className="button-primary" onClick={() => createExperience()}><Plus size={16} /> Create a Duo</button>}</motion.header>}

          {activeView === "home" && <HomeView latestExperience={experiences[0] ?? null} user={user} userLoading={userLoading} cardCount={cards.length} competition={competitionData} competitionLoading={competitionLoading} onCreateCard={() => createCard()} onCreateDuo={() => createExperience()} onNavigate={selectView} onSignIn={() => setAuthOpen(true)} />}
          {activeView === "cards" && <CardsView cards={cards} user={user} onCreate={() => createCard()} onEdit={(card) => createCard(card)} onDelete={deleteCard} onShare={(token) => copyLink("cards", token)} onSignIn={() => setAuthOpen(true)} />}
          {activeView === "duo" && <ExperiencesView experiences={experiences} user={user} onCreate={() => createExperience()} onEdit={(item) => createExperience(item)} onDelete={deleteExperience} onShare={(token) => copyLink("duo", token)} onSignIn={() => setAuthOpen(true)} />}
          {activeView === "competition" && <CompetitionView user={user} data={competitionData} loading={competitionLoading} entryTitle={entryTitle} onTitle={setEntryTitle} relationship={entryRelationship} onRelationship={setEntryRelationship} story={entryStory} onStory={setEntryStory} attested={eligibilityAttested} onAttested={setEligibilityAttested} busy={entryBusy} error={entryError} onSubmit={submitEntry} onSignIn={() => setAuthOpen(true)} />}
          {activeView === "coins" && <CoinsView user={user} balance={coinBalance} transactions={coinTransactions} onSignIn={() => setAuthOpen(true)} />}
          {activeView === "premium" && <PremiumView user={user} onCheckout={startCheckout} onSignIn={() => setAuthOpen(true)} />}
          {activeView === "settings" && <SettingsView user={user} onUpdate={(updated) => setUser((current) => current ? { ...current, ...updated } : current)} onSignOut={signOut} onSignIn={() => setAuthOpen(true)} onPremium={() => selectView("premium")} notify={notify} />}
        </main>

        <footer className="site-footer"><span>Made with a little more meaning. <Heart size={12} fill="currentColor" /></span><span>Kindness is always free · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></span></footer>
      </div>

      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={handleAuthenticated} />
      <CardStudio open={cardOpen} initial={editingCard} isPremium={Boolean(user?.isPremium)} onClose={() => { setCardOpen(false); setEditingCard(null); }} onSaved={handleCardSaved} onUpgrade={() => { setCardOpen(false); setEditingCard(null); setActiveView("premium"); }} />
      <ExperienceStudio open={experienceOpen} initial={editingExperience} isPremium={Boolean(user?.isPremium)} onClose={() => { setExperienceOpen(false); setEditingExperience(null); }} onSaved={handleExperienceSaved} onUpgrade={() => { setExperienceOpen(false); setEditingExperience(null); setActiveView("premium"); }} />
      <AnimatePresence>{toast && <motion.div key={toast.id} className={`toast toast-${toast.kind ?? "success"}`} role="status" aria-live="polite" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}><span className="toast-icon">{toast.kind === "error" ? <CircleHelp size={16} /> : <Check size={16} />}</span>{toast.message}<button onClick={() => setToast(null)} aria-label="Dismiss message"><X size={14} /></button></motion.div>}</AnimatePresence>
    </div>
  );
}

type HomeProps = { latestExperience: ExperienceRecord | null; user: ProductUser | null; userLoading: boolean; cardCount: number; competition: CompetitionPayload | null; competitionLoading: boolean; onCreateCard: () => void; onCreateDuo: () => void; onNavigate: (view: View) => void; onSignIn: () => void };

function HomeView({ latestExperience, user, userLoading, cardCount, competition, competitionLoading, onCreateCard, onCreateDuo, onNavigate, onSignIn }: HomeProps) {
  return <motion.div className="home-view" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
    <section className="hero-card">
      <div className="hero-copy">
        <div className="hero-label"><span className="hero-label-dot" /> A LITTLE LOVE, MADE DIGITAL</div>
        <h1>{user ? <>A little more <em>meaning</em>, {firstName(user.displayName)}.</> : <>Make their ordinary feel <em>unforgettable.</em></>}</h1>
        <p>Turn the things you wish you’d said into something they can keep. Thoughtful cards, just-for-two surprises, and memories made to be shared.</p>
        <div className="hero-actions"><button className="button-primary button-primary-large" onClick={onCreateCard}>Make a little card <ArrowRight size={17} /></button><button className="button-text" onClick={() => onNavigate("duo")}>Explore Duo <ArrowUpRight size={15} /></button></div>
        <div className="hero-footnote"><span><Heart size={13} fill="currentColor" /></span><span>Free to make. Lovely to give.</span><span className="hero-foot-separator">·</span><span>{userLoading ? "" : user ? `${cardCount} ${cardCount === 1 ? "little note" : "little notes"} saved` : "No perfect words required"}</span></div>
      </div>
      <div className="hero-image" role="img" aria-label="Hands writing a thoughtful note on warm stationery">
        <div className="hero-image-scrim" />
        <div className="hero-note-float"><span className="hero-note-icon"><Flower2 size={16} /></span><span>for no reason at all<small>is the best reason</small></span></div>
        <div className="hero-image-caption"><span>THE ART OF SAYING IT</span><span>01 — A NOTE THAT STAYS</span></div>
        <span className="hero-sticker" aria-hidden="true">a little<br />closer <Heart size={15} fill="currentColor" /></span>
      </div>
      <span className="hero-orbit hero-orbit-one" aria-hidden="true" /><span className="hero-orbit hero-orbit-two" aria-hidden="true" />
    </section>

    <BondOfTheYearFeature
      competition={competition?.competition ?? null}
      approvedEntries={competition?.approvedEntries ?? 0}
      loading={competitionLoading}
      onEnter={() => onNavigate("competition")}
      onView={() => onNavigate("competition")}
    />

    <PhoneShowcase
      latestExperience={latestExperience}
      competition={competition?.competition ?? null}
      approvedEntries={competition?.approvedEntries ?? 0}
      onDuo={onCreateDuo}
      onBond={() => onNavigate("competition")}
    />

    <section className="home-intro-row"><div><p className="eyebrow">A FEW WAYS TO SAY IT</p><h2>Made for your kind of close.</h2></div><p>Not another feed to scroll. Just a small, lovely place to make someone's day.</p></section>

    <section className="home-tools-grid" aria-label="Dear You experiences">
      <button className="tool-card tool-card-card" onClick={onCreateCard}><span className="tool-icon tool-icon-rose"><PenLine size={18} /></span><span className="tool-card-meta"><span>01 · THE LITTLE LETTER</span><ArrowUpRight size={16} /></span><h3>A card, with your words on it.</h3><p>Choose a feeling, add the thing you mean, and make a note that sounds like you.</p><span className="tool-link">Open card studio <ArrowRight size={13} /></span><span className="tool-illustration illustration-envelope" aria-hidden="true"><span>♡</span></span></button>
      <button className="tool-card tool-card-duo" onClick={onCreateDuo}><span className="tool-icon tool-icon-peach"><UsersRound size={18} /></span><span className="tool-card-meta"><span>02 · JUST FOR TWO</span><ArrowUpRight size={16} /></span><h3>A little story you share.</h3><p>A memory, a message, and one sweet reveal, wrapped in a private link.</p><span className="tool-link">Make a Duo experience <ArrowRight size={13} /></span><span className="duo-circles" aria-hidden="true"><span>you</span><i>♡</i><span>them</span></span></button>
      <button className="tool-card tool-card-bond" onClick={() => onNavigate("competition")}><span className="tool-icon tool-icon-lilac"><Award size={18} /></span><span className="tool-card-meta"><span>03 · THE COMMUNITY EDITION</span><ArrowUpRight size={16} /></span><h3>Celebrate your forever person.</h3><p>A free, human-reviewed celebration of the bond that makes life warmer.</p><span className="tool-link">{competitionLoading ? "Explore the community" : competition?.competition ? "Meet Bond of the Year" : "Explore the competition"}<ArrowRight size={13} /></span><span className="bond-stamp"><span>BOND<br />OF THE<br />YEAR</span><Heart size={13} fill="currentColor" /></span></button>
    </section>

    <section className="home-bottom-grid">
      <div className="home-quote-card"><div className="quote-decoration" aria-hidden="true">“</div><p className="eyebrow">A THOUGHT TO KEEP</p><blockquote>The people who make you feel most like yourself deserve to know.</blockquote><div className="quote-footer"><span className="quote-line" /><span>Start with one small note</span><button onClick={onCreateCard} aria-label="Start a card"><ArrowRight size={15} /></button></div></div>
      <div className="home-coin-card"><span className="coin-icon-large"><Coins size={20} /></span><div className="coin-copy"><p className="eyebrow">LOVE COINS</p><h3>{user ? "A little thank-you, earned." : "Thoughtfulness is the whole point."}</h3><p>{user ? `${cardCount ? "Your first-card thank-you is in your wallet." : "Save your first card to earn 5 Love Coins."}` : "Real little rewards for real little things. Never for judging."}</p><button onClick={() => user ? onNavigate("coins") : onSignIn()}>{user ? "See your balance" : "Make a free account"}<ArrowRight size={13} /></button></div><div className="coin-art" aria-hidden="true"><span>♡</span></div></div>
    </section>

    <section className="home-signoff"><span className="signoff-scribble">made to mean more</span><span className="signoff-divider" /><span>A little less scroll. A little more soul.</span><Heart size={13} fill="currentColor" /></section>
    <div className="media-credit">Editorial photo by <a href="https://www.pexels.com/photo/person-writing-on-brown-paper-3826660/" target="_blank" rel="noreferrer">cottonbro studio / Pexels</a>.</div>
  </motion.div>;
}

type CollectionProps<T> = { user: ProductUser | null; onSignIn: () => void };

function EmptyCollection({ icon: Icon, title, copy, button, onAction, onSignIn }: { icon: typeof BookHeart; title: string; copy: string; button: string; onAction: () => void; onSignIn: () => void }) {
  return <div className="empty-collection"><span className="empty-icon"><Icon size={23} /></span><p className="eyebrow">A BLANK PAGE, IN THE BEST WAY</p><h2>{title}</h2><p>{copy}</p><button className="button-primary" onClick={onAction}>{button}<ArrowRight size={15} /></button><button className="empty-note" onClick={onSignIn}>Your saved work stays private to your account.</button></div>;
}

function CardsView({ cards, user, onCreate, onEdit, onDelete, onShare, onSignIn }: { cards: CardRecord[]; user: ProductUser | null; onCreate: () => void; onEdit: (card: CardRecord) => void; onDelete: (card: CardRecord) => void; onShare: (token: string) => void; onSignIn: () => void }) {
  if (!user) return <EmptyCollection icon={BookHeart} title="Your next favorite note starts here." copy="Sign in to keep drafts safe, come back to edit them, and make a private link when it's time to share." button="Start a free account" onAction={onSignIn} onSignIn={onSignIn} />;
  if (!cards.length) return <EmptyCollection icon={Feather} title="There's room for your first little note." copy="No pressure to find perfect words. A sincere one is plenty." button="Make a card" onAction={onCreate} onSignIn={onSignIn} />;
  return <section className="collection-section"><div className="collection-toolbar"><span>{cards.length} {cards.length === 1 ? "card" : "cards"} · saved privately to your account</span><button className="button-outline" onClick={onCreate}><Plus size={15} /> New card</button></div><div className="saved-card-grid">{cards.map((card, index) => <motion.article key={card.id} className="saved-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.24) }}><div className={`saved-card-art ${themeClass(card.theme)}`}><span className="saved-card-art-mark">{card.theme === "night-sky" ? "✦" : "✿"}</span><span className="saved-card-preview-label">A NOTE, JUST FOR YOU</span><p>{card.message}</p><span className="saved-card-art-signoff">with all my love</span></div><div className="saved-card-info"><div><span className={`status-pill ${card.published ? "status-shared" : "status-draft"}`}>{card.published ? <><span className="status-dot" /> Shared link active</> : <><LockKeyhole size={11} /> Private draft</>}</span><p className="saved-card-date">Updated {shortDate(card.updatedAt ?? card.createdAt)}</p></div><h3>{card.title}</h3><p className="saved-card-to">{card.recipientName ? `For ${card.recipientName}` : "A note for someone dear"}</p><div className="saved-card-actions"><button onClick={() => onEdit(card)}><PenLine size={13} /> Edit</button>{card.published && card.shareToken ? <button onClick={() => onShare(card.shareToken!)}><Copy size={13} /> Copy link</button> : <button onClick={() => onEdit(card)}><ArrowUpRight size={13} /> Make a link</button>}<button className="delete-action" onClick={() => onDelete(card)} aria-label={`Delete ${card.title}`}><X size={14} /></button></div></div></motion.article>)}</div></section>;
}

function ExperiencesView({ experiences, user, onCreate, onEdit, onDelete, onShare, onSignIn }: { experiences: ExperienceRecord[]; user: ProductUser | null; onCreate: () => void; onEdit: (experience: ExperienceRecord) => void; onDelete: (experience: ExperienceRecord) => void; onShare: (token: string) => void; onSignIn: () => void }) {
  if (!user) return <EmptyCollection icon={UsersRound} title="Make a story that belongs to two." copy="Sign in to create a private, interactive experience with a memory, a message, and a surprise reveal." button="Start a free account" onAction={onSignIn} onSignIn={onSignIn} />;
  if (!experiences.length) return <EmptyCollection icon={Heart} title="Start with a memory you both know." copy="Build a tiny shared story, then send a private link when it feels just right." button="Create a Duo experience" onAction={onCreate} onSignIn={onSignIn} />;
  return <section className="collection-section"><div className="collection-toolbar"><span>{experiences.length} {experiences.length === 1 ? "experience" : "experiences"} · yours to share</span><button className="button-outline" onClick={onCreate}><Plus size={15} /> New experience</button></div><div className="duo-list">{experiences.map((item, index) => <motion.article key={item.id} className={`duo-saved-card ${item.theme === "sunset" ? "duo-sunset" : item.theme === "keepsake" ? "duo-keepsake" : "duo-petal"}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.05, 0.25) }}><div className="duo-saved-art"><span className="duo-preview-number">A STORY FOR TWO</span><span className="duo-heart">♡</span><h3>{item.title}</h3><p>for {item.recipientName}</p><span className="duo-art-line" /><span className="duo-art-quote">“{item.memory}”</span></div><div className="duo-saved-info"><span className={`status-pill ${item.published ? "status-shared" : "status-draft"}`}>{item.published ? <><span className="status-dot" /> Private link active</> : <><LockKeyhole size={11} /> Private draft</>}</span><p className="saved-card-date">Created {shortDate(item.createdAt)}</p><h3>{item.title}</h3><p>A little story for {item.recipientName}.</p><div className="saved-card-actions"><button onClick={() => onEdit(item)}><PenLine size={13} /> Edit story</button>{item.published && item.shareToken ? <button onClick={() => onShare(item.shareToken!)}><Copy size={13} /> Copy link</button> : <button onClick={() => onEdit(item)}><ArrowUpRight size={13} /> Make a link</button>}<button className="delete-action" onClick={() => onDelete(item)} aria-label={`Delete ${item.title}`}><X size={14} /></button></div></div></motion.article>)}</div></section>;
}

function CompetitionView({ user, data, loading, entryTitle, onTitle, relationship, onRelationship, story, onStory, attested, onAttested, busy, error, onSubmit, onSignIn }: { user: ProductUser | null; data: CompetitionPayload | null; loading: boolean; entryTitle: string; onTitle: (value: string) => void; relationship: string; onRelationship: (value: string) => void; story: string; onStory: (value: string) => void; attested: boolean; onAttested: (value: boolean) => void; busy: boolean; error: string; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onSignIn: () => void }) {
  const competition = data?.competition;
  const countdown = useCountdown(data?.competition?.endsAt);
  if (loading) return <div className="loading-panel"><span className="loading-spinner" /><p>Finding the right words…</p></div>;
  if (!competition) return <div className="empty-collection"><span className="empty-icon"><Award size={23} /></span><p className="eyebrow">NEXT CHAPTER, SOON</p><h2>The next Bond of the Year is being prepared.</h2><p>When entries open, the rules, dates, and judging rubric will be here. Every season stays free to enter.</p></div>;
  const alreadyEntered = Boolean(data?.myEntry);
  return <div className="competition-page">
    <section className="competition-hero"><div className="competition-hero-art"><div className="competition-art-ring ring-one" /><div className="competition-art-ring ring-two" /><div className="competition-medal"><Award size={34} /><span>THE<br />BOND<br />AWARD</span></div><span className="competition-art-caption">a celebration of closeness</span></div><div className="competition-hero-copy"><span className="live-badge"><span className="live-badge-dot" /> ACCEPTING STORIES · FREE TO ENTER</span><p className="eyebrow">THE DEAR YOU COMMUNITY EDITION</p><h2>{competition.title}</h2><p>{competition.description}</p><div className="competition-deadline"><span className="deadline-icon"><Award size={17} /></span><span><small>ENTRY CLOSES</small><strong>{prettyDate(competition.endsAt)} · 23:59 UTC</strong>{countdown && <span className={`competition-ticker ${countdown.closed ? "ticker-closed" : ""}`}>{countdown.closed ? "Entries have closed for this edition" : <>Closes in <b>{countdown.days}</b>d <b>{padTwo(countdown.hours)}</b>h <b>{padTwo(countdown.minutes)}</b>m <b>{padTwo(countdown.seconds)}</b>s</>}</span>}</span></div><div className="competition-proof"><span><strong>{data?.approvedEntries ?? 0}</strong> approved stories</span><span className="proof-separator">·</span><span>one entry per person</span></div></div></section>
    <section className="competition-trust-note"><ShieldCheck size={18} /><p><strong>Premium never enters the picture.</strong> Every story is assessed with the same rubric by human reviewers. Purchases, paid features, and Love Coins never affect eligibility, judging, or ranking.</p></section>
    <div className="competition-detail-grid"><section className="competition-form-card"><div className="section-mini-head"><div><p className="eyebrow">YOUR STORY, YOUR WORDS</p><h3>{alreadyEntered ? "Your entry is with our team." : "Tell us about your person."}</h3></div><span className="free-stamp">FREE<br />ENTRY</span></div>
      {alreadyEntered && data?.myEntry ? <div className="entry-status-card"><span className={`entry-status-icon entry-${data.myEntry.status}`}>{data.myEntry.status === "approved" ? <Check size={17} /> : <ShieldCheck size={17} />}</span><div><strong>{data.myEntry.title}</strong><span>{statusLabel(data.myEntry.status)}</span><small>Sent {shortDate(data.myEntry.submittedAt)} · A human moderator will review it.</small></div></div>
        : user ? <form className="entry-form" onSubmit={onSubmit}><label className="field-label">Give your story a title<input className="studio-input" value={entryTitle} onChange={(event) => onTitle(event.target.value)} maxLength={90} minLength={3} placeholder="The person who always shows up" required /></label><label className="field-label">Who is this person to you?<input className="studio-input" value={relationship} onChange={(event) => onRelationship(event.target.value)} maxLength={60} minLength={2} placeholder="My sister, my oldest friend…" required /></label><label className="field-label">Share a moment that says it all<textarea className="studio-input studio-textarea" value={story} onChange={(event) => onStory(event.target.value)} maxLength={2400} minLength={40} rows={6} placeholder="A small, true moment can say everything. Tell us what happened, what it meant, and why you'll remember it." required /></label><div className="story-count">{story.length} / 2,400 characters · at least 40, please</div><label className="eligibility-check"><input type="checkbox" checked={attested} onChange={(event) => onAttested(event.target.checked)} required /><span>I confirm I’m 18 or older and eligible to enter where I live. This story is my own, and I’m happy for it to be reviewed under the published rules.</span></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button-primary" type="submit" disabled={busy || !attested}>{busy ? "Sending your story…" : "Send my free entry"}<ArrowRight size={15} /></button><p className="entry-form-footnote">Your entry starts private and stays pending until human review. No coins are awarded for contest activity.</p></form>
        : <div className="entry-signin-prompt"><p>You’ll need a free Dear You account to submit one story. Entries are reviewed by people, not paid placement.</p><button className="button-primary" onClick={onSignIn}>Sign in to enter <ArrowRight size={15} /></button></div>}
      </section>
      <div className="competition-side-column"><section className="judging-card"><p className="eyebrow">HOW STORIES ARE JUDGED</p><h3>The rubric, out in the open.</h3><p className="judging-intro">Every approved entry is assessed against the same criteria by human reviewers.</p><div className="criteria-list">{competition.criteria.map((criterion, index) => <div key={criterion.name} className="criterion-item"><span className={`criterion-number criterion-${index + 1}`}>0{index + 1}</span><div><strong>{criterion.name}</strong><p>{criterion.description}</p></div><span className="criterion-weight">{criterion.weight}%</span><div className="criterion-meter"><span style={{ width: `${criterion.weight}%` }} /></div></div>)}</div><p className="criteria-footnote">Scores use the published weights. Moderator review protects safety and eligibility, never paid status.</p></section>
      <section className="rules-card"><p className="eyebrow">THE KINDNESS RULES</p><h3>Before you share.</h3><ol>{competition.rules.map((rule, index) => <li key={`${index}-${rule.slice(0, 16)}`}><span>{String(index + 1).padStart(2, "0")}</span>{rule}</li>)}</ol><p className="rules-note"><LockKeyhole size={13} /> Only approved entries are shown publicly.</p></section></div>
    </div>
    <p className="competition-legal-note">This is a community recognition program, not a purchase-based promotion. No purchase necessary. Premium membership has no effect on participation or evaluation.</p>
  </div>;
}

function statusLabel(status: CompetitionEntryStatus) {
  switch (status) { case "approved": return "Approved for the community collection"; case "rejected": return "Not selected for publication"; case "needs_review": return "A moderator is taking a closer look"; default: return "Pending a kind human review"; }
}

function CoinsView({ user, balance, transactions, onSignIn }: { user: ProductUser | null; balance: number; transactions: CoinTransaction[]; onSignIn: () => void }) {
  if (!user) return <EmptyCollection icon={Coins} title="A little thank-you, never a shortcut." copy="Sign in to see your balance and the full, auditable history of how your Love Coins were earned." button="Sign in to your account" onAction={onSignIn} onSignIn={onSignIn} />;
  return <div className="coins-page"><section className="coins-balance-card"><div className="coin-orbit" aria-hidden="true"><span>♡</span><i /><i /><i /></div><div className="coins-balance-copy"><p className="eyebrow">YOUR LOVE COINS</p><h2>{balance.toLocaleString()} <span>coins</span></h2><p>Little rewards for thoughtful things. Never for winning, ranking, or skipping the line.</p></div><span className="coins-balance-seal"><Coins size={17} /><span>earned<br />not bought</span></span></section><div className="coins-content-grid"><section className="ledger-card"><div className="section-mini-head"><div><p className="eyebrow">THE LITTLE LEDGER</p><h3>Every coin, accounted for.</h3></div><span className="ledger-lock"><LockKeyhole size={13} /> Server recorded</span></div>{transactions.length ? <div className="ledger-list">{transactions.map((item) => <article className="ledger-row" key={item.id}><span className="ledger-activity-icon"><Heart size={14} /></span><span className="ledger-row-copy"><strong>{item.description}</strong><small>{shortDate(item.createdAt)} · {item.activityKey === "first-card" ? "creative activity" : "platform activity"}</small></span><span className="ledger-amount">+{item.amount}<small>coins</small></span></article>)}</div> : <div className="ledger-empty"><span><Feather size={18} /></span><p>Your first Love Coin activity is waiting for a little note.</p><small>Coins are recorded only by the server; there are no ways to buy or edit your balance.</small></div>}</section><aside className="earning-rules-card"><p className="eyebrow">HOW COINS ARE EARNED</p><h3>Keep it simple. Keep it fair.</h3><div className="earning-rule"><span className="earning-rule-icon"><PenLine size={16} /></span><span><strong>Save your first card</strong><small>One-time thank-you</small></span><b>+5</b></div><p className="earning-separation"><ShieldCheck size={14} /> Competition entries never earn coins. Coins can’t be bought, transferred, or used to influence judging.</p><button className="button-text" onClick={onSignIn}>Our fairness promise <ArrowRight size={13} /></button></aside></div></div>;
}

function PremiumView({ user, onCheckout, onSignIn }: { user: ProductUser | null; onCheckout: () => void; onSignIn: () => void }) {
  return <div className="premium-page"><section className="premium-intro-card"><div className="premium-intro-copy"><span className="premium-overline"><Sparkles size={13} /> THE LITTLE DETAILS, TURNED UP</span><h2>More ways to make it <em>yours.</em></h2><p>A few more creative tools for when your idea wants a little extra room. The good stuff stays free, and nothing here changes how a community story is judged.</p><button className="button-primary" onClick={user ? onCheckout : onSignIn}>{user?.isPremium ? <><Check size={15} /> You're part of Studio+</> : <>Explore Premium Studio <ArrowRight size={15} /></>}</button><span className="premium-checkout-note"><LockKeyhole size={12} /> Secure checkout · Test mode until setup is complete</span></div><div className="premium-art"><div className="premium-card-back" /><div className="premium-card-front"><Sparkles size={18} /><span>made<br />of feeling</span><Heart size={15} fill="currentColor" /></div><span className="premium-art-orbit" /></div></section><div className="premium-compare"><section className="plan-card plan-free"><div className="plan-card-head"><span className="plan-icon free-icon"><Heart size={17} /></span><span className="plan-badge">ALWAYS FREE</span></div><h3>The lovely essentials.</h3><p>Everything you need to send a little more meaning.</p><ul><li><Check size={15} /> Personal cards & private drafts</li><li><Check size={15} /> Shareable links, whenever you're ready</li><li><Check size={15} /> Duo stories, memories & surprise reveals</li><li><Check size={15} /> Bond of the Year — free to enter</li><li><Check size={15} /> Fair Love Coins activity rewards</li></ul></section><section className="plan-card plan-premium"><div className="plan-card-head"><span className="plan-icon premium-icon"><Sparkles size={17} /></span><span className="plan-badge premium-badge">STUDIO+</span></div><h3>A little more room to create.</h3><p>Extra textures and tools. No extra say in community spaces.</p><ul><li><Sparkles size={15} /> Premium card moods & typography</li><li><Sparkles size={15} /> Sparkle motion and extra polish</li><li><Sparkles size={15} /> Keepsake Duo story theme</li><li><Sparkles size={15} /> New creative extras as the studio grows</li><li><ShieldCheck size={15} /> Never affects entry, judging, or ranks</li></ul><button className="button-premium" onClick={user ? onCheckout : onSignIn}>{user?.isPremium ? "Membership active" : "Continue to secure checkout"}<ArrowRight size={14} /></button></section></div><p className="premium-footnote">No price or membership is shown as active until verified by the payment provider. Checkout is deliberately unavailable until the owner configures Stripe test credentials and a price.</p></div>;
}

function SettingsView({ user, onUpdate, onSignOut, onSignIn, onPremium, notify }: { user: ProductUser | null; onUpdate: (user: Partial<ProductUser>) => void; onSignOut: () => void; onSignIn: () => void; onPremium: () => void; notify: (message: string, kind?: Toast["kind"]) => void }) {
  const [name, setName] = useState(user?.displayName ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(user?.displayName ?? ""), [user?.displayName]);
  if (!user) return <EmptyCollection icon={Settings} title="Your space, your pace." copy="Sign in to manage your profile, membership, and saved little things." button="Sign in" onAction={onSignIn} onSignIn={onSignIn} />;
  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try {
      const response = await apiFetch("/api/account", { method: "PATCH", body: JSON.stringify({ displayName: name }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Your profile couldn't be updated.");
      onUpdate(payload.user);
      notify("Your profile has been updated.");
    } catch (reason) { notify(reason instanceof Error ? reason.message : "Your profile couldn't be updated.", "error"); }
    finally { setBusy(false); }
  }
  return <div className="settings-page"><section className="settings-card"><div className="settings-avatar">{firstName(user.displayName).slice(0, 1).toUpperCase()}</div><div className="settings-card-intro"><p className="eyebrow">YOUR PROFILE</p><h2>A little space for you.</h2><p>Your saved work is private until you decide to share a link.</p></div><form className="settings-form" onSubmit={saveProfile}><label className="field-label">Your name<input className="studio-input" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} minLength={2} required /></label><label className="field-label">Email address<input className="studio-input input-readonly" value={user.email} readOnly /><small>Email updates aren't available until verification email is configured.</small></label><button type="submit" className="button-primary" disabled={busy}>{busy ? "Saving…" : "Save profile"}<Check size={15} /></button></form></section><aside className="membership-card"><p className="eyebrow">YOUR MEMBERSHIP</p><div className="membership-status"><span className={user.isPremium ? "membership-icon premium-icon" : "membership-icon free-icon"}>{user.isPremium ? <Sparkles size={16} /> : <Heart size={16} />}</span><span><strong>{user.isPremium ? "Premium Studio" : "Dear You, for free"}</strong><small>{user.isPremium ? "Active subscription verified by Stripe" : "Free membership"}</small></span></div><p>Cards, Duo stories, and the community competition are here for everyone. Premium is extra creative expression, nothing more.</p><button className="button-outline" onClick={onPremium}>{user.isPremium ? "Explore your studio" : "See Premium Studio"}<ArrowRight size={14} /></button><button className="settings-logout" onClick={onSignOut}><LogOut size={15} /> Sign out of Dear You</button></aside><div className="settings-safety"><ShieldCheck size={17} /><div><strong>Your account, your things.</strong><p>Session cookies are HttpOnly and same-site. Drafts are private by default; admins and moderators have server-enforced roles.</p></div></div></div>;
}

function themeClass(theme: string) {
  switch (theme) { case "petal": return "theme-petal"; case "botanical": return "theme-botanical"; case "night-sky": return "theme-night"; default: return "theme-letter"; }
}
