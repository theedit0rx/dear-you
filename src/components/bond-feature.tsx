"use client";

import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, Award, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { CompetitionRecord } from "@/lib/types";

export type CountdownParts = { days: number; hours: number; minutes: number; seconds: number; closed: boolean };

const pad = (value: number) => String(value).padStart(2, "0");

export function useCountdown(target?: string | Date | null): CountdownParts | null {
  const [remaining, setRemaining] = useState<CountdownParts | null>(null);

  useEffect(() => {
    if (!target) {
      setRemaining(null);
      return;
    }
    let frame = 0;
    const update = () => {
      const end = target instanceof Date ? target.getTime() : Date.parse(target);
      if (!Number.isFinite(end)) {
        setRemaining(null);
        return;
      }
      const diff = end - Date.now();
      const clamped = Math.max(diff, 0);
      setRemaining({
        days: Math.floor(clamped / 86_400_000),
        hours: Math.floor((clamped / 3_600_000) % 24),
        minutes: Math.floor((clamped / 60_000) % 60),
        seconds: Math.floor((clamped / 1000) % 60),
        closed: diff <= 0,
      });
    };
    update();
    frame = window.setInterval(update, 1000);
    return () => window.clearInterval(frame);
  }, [target]);

  return remaining;
}

function prettyDeadline(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "TBA";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

type Props = {
  competition: CompetitionRecord | null;
  approvedEntries: number;
  loading: boolean;
  onEnter: () => void;
  onView: () => void;
};

export function BondOfTheYearFeature({ competition, approvedEntries, loading, onEnter, onView }: Props) {
  const countdown = useCountdown(competition?.endsAt);
  const units = [
    { label: "days", value: countdown ? String(countdown.days) : "—" },
    { label: "hrs", value: countdown ? pad(countdown.hours) : "—" },
    { label: "min", value: countdown ? pad(countdown.minutes) : "—" },
    { label: "sec", value: countdown ? pad(countdown.seconds) : "—" },
  ];

  return (
    <motion.section
      className={`bond-feature ${competition ? "" : "bond-feature-soon"}`}
      aria-labelledby="bond-feature-title"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <span className="bond-ambient" aria-hidden="true"><i /><i /><i /><i /><i /></span>
      <div className="bond-feature-layout">
        <div className="bond-feature-copy">
          <div className="bond-feature-topline">
            {competition ? (
              <span className="bond-live-pill"><span className="bond-live-dot" />LIVE NOW · FREE TO ENTER</span>
            ) : (
              <span className="bond-soon-pill">{loading ? "CHECKING THE CALENDAR" : "NEXT EDITION IN PREPARATION"}</span>
            )}
            <span className="bond-entry-count">
              <strong>{loading ? "—" : approvedEntries.toLocaleString()}</strong> {approvedEntries === 1 ? "story" : "stories"} from the community
            </span>
          </div>

          <p className="bond-feature-eyebrow">THE DEAR YOU COMMUNITY CELEBRATION</p>
          <h2 id="bond-feature-title" className="bond-feature-title">
            Bond of<br /><em>the Year</em>
          </h2>
          <p className="bond-feature-lede">
            {competition
              ? competition.description
              : "A once-a-year celebration of the people who make ordinary days feel like home. Free to enter, read by real people, and never decided by what you paid for."}
          </p>

          {competition && (
            <div className="bond-countdown-block">
              <span className="bond-countdown-label">{countdown?.closed ? "Entries have closed" : "Entries close in"}</span>
              <div className="bond-countdown" role="timer" aria-label={`Entries close ${prettyDeadline(competition.endsAt)} at 23:59 UTC`}>
                {units.map((unit) => (
                  <span className="bond-countdown-cell" key={unit.label}>
                    <strong>{unit.value}</strong>
                    <small>{unit.label}</small>
                  </span>
                ))}
              </div>
              <p className="bond-deadline-note">Deadline · {prettyDeadline(competition.endsAt)} · 23:59 UTC</p>
            </div>
          )}

          <div className="bond-cta-row">
            <button type="button" className="bond-primary" onClick={onEnter}>
              {competition ? "Tell your story" : "Be first in line"} <ArrowRight size={16} />
            </button>
            <button type="button" className="bond-ghost" onClick={onView}>Rules &amp; judging <ArrowUpRight size={14} /></button>
          </div>

          <p className="bond-fairness"><ShieldCheck size={14} /> No purchase necessary. Premium Studio and Love Coins never affect eligibility, judging, or ranking.</p>
        </div>

        <div className="bond-feature-art">
          <div className="bond-medal-wrap">
            <span className="bond-medal-ring ring-outer" aria-hidden="true" />
            <span className="bond-medal-ring ring-inner" aria-hidden="true" />
            <div className="bond-medal">
              <Award size={26} strokeWidth={1.4} />
              <span>BOND<br />OF THE<br />YEAR</span>
            </div>
            <span className="bond-free-stamp" aria-hidden="true">FREE<br />ENTRY</span>
          </div>

          {competition?.criteria?.length ? (
            <ul className="bond-criteria" aria-label="Published judging criteria">
              {competition.criteria.map((criterion) => (
                <li key={criterion.name}>
                  <span className="bond-criterion-name" title={criterion.description}>{criterion.name}</span>
                  <span className="bond-criterion-bar" aria-hidden="true"><i style={{ width: `${Math.min(Math.max(criterion.weight, 0), 100)}%` }} /></span>
                  <span className="bond-criterion-weight">{criterion.weight}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="bond-criteria-empty">The full rubric is published the day entries open.</p>
          )}

          <p className="bond-art-note"><Sparkles size={11} /> Human-reviewed · one entry per member</p>
        </div>
      </div>
    </motion.section>
  );
}
