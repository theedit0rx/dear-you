"use client";

import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowRight, Award, Heart, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useCountdown } from "@/components/bond-feature";
import type { CompetitionRecord, ExperienceRecord } from "@/lib/types";

type Props = {
  latestExperience: ExperienceRecord | null;
  competition: CompetitionRecord | null;
  approvedEntries: number;
  onDuo: () => void;
  onBond: () => void;
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function useCycle(count: number, intervalMs: number, paused: boolean) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (paused || count <= 1) return;
    const id = window.setInterval(() => setIndex((value) => (value + 1) % count), intervalMs);
    return () => window.clearInterval(id);
  }, [count, intervalMs, paused]);
  return index % count;
}

const pad = (value: number) => String(value).padStart(2, "0");

const duoScenes = [
  { label: "A MEMORY WE KEEP", key: "memory" as const },
  { label: "A NOTE, FROM THE HEART", key: "note" as const },
  { label: "THE LITTLE SURPRISE", key: "reveal" as const },
];

const exampleExperience = {
  title: "Our little collection",
  recipientName: "someone dear",
  memory: "The afternoon we got wonderfully lost and somehow found the best little bakery.",
  note: "Thank you for making ordinary days feel worth remembering.",
  reveal: "I saved this just for you. Let's make a new memory soon.",
};

export function PhoneShowcase({ latestExperience, competition, approvedEntries, onDuo, onBond }: Props) {
  const reduced = usePrefersReducedMotion();
  const duoScene = useCycle(duoScenes.length, 3800, reduced);
  const bondScene = useCycle(3, 4200, reduced);
  const countdown = useCountdown(competition?.endsAt);

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const springX = useSpring(pointerX, { stiffness: 120, damping: 18, mass: 0.6 });
  const springY = useSpring(pointerY, { stiffness: 120, damping: 18, mass: 0.6 });
  const stageRotateX = useTransform(springY, [-0.5, 0.5], [5, -5]);
  const stageRotateY = useTransform(springX, [-0.5, 0.5], [-7, 7]);
  const backX = useTransform(springX, [-0.5, 0.5], [-16, 16]);
  const frontX = useTransform(springX, [-0.5, 0.5], [16, -16]);

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (reduced) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - rect.left) / rect.width - 0.5);
    pointerY.set((event.clientY - rect.top) / rect.height - 0.5);
  }

  function onPointerLeave() {
    pointerX.set(0);
    pointerY.set(0);
  }

  const experience = latestExperience ?? exampleExperience;
  const isExample = !latestExperience;
  const scene = duoScenes[duoScene];
  const criteria = competition?.criteria?.slice(0, 3) ?? [];
  const units = [
    { label: "days", value: countdown ? String(countdown.days) : "—" },
    { label: "hrs", value: countdown ? pad(countdown.hours) : "—" },
    { label: "min", value: countdown ? pad(countdown.minutes) : "—" },
    { label: "sec", value: countdown ? pad(countdown.seconds) : "—" },
  ];

  return (
    <motion.section
      className="phone-stage"
      aria-labelledby="phone-stage-title"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="phone-stage-copy">
        <p className="eyebrow">TWO SCREENS · ONE FEELING</p>
        <h2 id="phone-stage-title">Made to be opened <em>together.</em></h2>
        <p>
          A Duo story unfolds on one phone, the community celebration glows on the other. Both screens update
          from the real stories and the live Bond of the Year edition.
        </p>
        <ul className="phone-stage-points">
          <li><Heart size={13} fill="currentColor" /> A memory, a note, then one surprise</li>
          <li><Award size={13} /> Free to enter, judged on a published rubric</li>
          <li><ShieldCheck size={13} /> Premium never changes who wins</li>
        </ul>
        <div className="phone-stage-actions">
          <button type="button" className="button-primary" onClick={onDuo}>Start a Duo story <ArrowRight size={15} /></button>
          <button type="button" className="button-text" onClick={onBond}>Enter Bond of the Year <ArrowRight size={13} /></button>
        </div>
      </div>

      <motion.div
        className="phone-stage-stage"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        style={{ rotateX: stageRotateX, rotateY: stageRotateY }}
      >
        {/* Duo phone — sits behind */}
        <motion.div className="phone-track phone-track-duo" style={{ x: backX, rotate: -7 }}>
          <motion.div className="iphone" animate={reduced ? undefined : { y: [0, -10, 0] }} transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}>
            <span className="iphone-btn iphone-btn-action" aria-hidden="true" />
            <span className="iphone-btn iphone-btn-up" aria-hidden="true" />
            <span className="iphone-btn iphone-btn-down" aria-hidden="true" />
            <span className="iphone-btn iphone-btn-power" aria-hidden="true" />
            <div className="iphone-screen screen-duo" aria-label="Duo story preview">
              <div className="ios-status" aria-hidden="true"><span>9:41</span><span className="ios-status-icons"><i /><i /><i /></span></div>
              <div className="ios-island" aria-hidden="true" />
              <div className="screen-body">
                <div className="screen-duo-head">
                  <span className="screen-chip">{isExample ? "EXAMPLE" : "YOUR STORY"}</span>
                  <p className="screen-for">for {experience.recipientName}</p>
                  <h3>{experience.title}</h3>
                </div>
                <div className="screen-duo-dots" aria-hidden="true">
                  {duoScenes.map((item, index) => <span key={item.key} className={index === duoScene ? "dot-active" : ""} />)}
                </div>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${scene.key}-${duoScene}`}
                    className="screen-duo-scene"
                    initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -8, filter: "blur(3px)" }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <span className="screen-label">{scene.label}</span>
                    {scene.key === "reveal" ? (
                      <div className="screen-reveal">
                        <p>{experience.reveal}</p>
                        <motion.span
                          className="screen-burst"
                          aria-hidden="true"
                          initial={{ scale: 0.4, opacity: 0 }}
                          animate={{ scale: [0.4, 1.25, 1], opacity: [0, 1, 0.85] }}
                          transition={{ duration: 1.2, ease: "easeOut" }}
                        ><Sparkles size={16} /></motion.span>
                      </div>
                    ) : (
                      <p className="screen-quote">“{scene.key === "memory" ? experience.memory : experience.note}”</p>
                    )}
                  </motion.div>
                </AnimatePresence>
                <div className="screen-foot"><Heart size={11} fill="currentColor" /> made for a moment between two people</div>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Bond phone — sits in front */}
        <motion.div className="phone-track phone-track-bond" style={{ x: frontX, rotate: 6 }}>
          <motion.div className="iphone" animate={reduced ? undefined : { y: [0, -14, 0] }} transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}>
            <span className="iphone-btn iphone-btn-action" aria-hidden="true" />
            <span className="iphone-btn iphone-btn-up" aria-hidden="true" />
            <span className="iphone-btn iphone-btn-down" aria-hidden="true" />
            <span className="iphone-btn iphone-btn-power" aria-hidden="true" />
            <div className="iphone-screen screen-bond" aria-label="Bond of the Year preview">
              <div className="ios-status" aria-hidden="true"><span>9:41</span><span className="ios-status-icons"><i /><i /><i /></span></div>
              <div className="ios-island" aria-hidden="true" />
              <div className="screen-body">
                <div className="screen-bond-head">
                  <span className="screen-live"><span className="screen-live-dot" />{competition ? "LIVE · FREE" : "UPCOMING"}</span>
                  <h3>Bond of <em>the Year</em></h3>
                  <p>{approvedEntries.toLocaleString()} approved {approvedEntries === 1 ? "story" : "stories"}</p>
                </div>
                <AnimatePresence mode="wait">
                  {bondScene === 0 && (
                    <motion.div key="bond-countdown" className="screen-bond-scene" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.35 }}>
                      <span className="screen-label">{competition ? "ENTRIES CLOSE IN" : "NEXT EDITION"}</span>
                      {competition ? (
                        <div className="screen-countdown" role="timer" aria-label="Time until entries close">
                          {units.map((unit) => <span key={unit.label}><strong>{unit.value}</strong><small>{unit.label}</small></span>)}
                        </div>
                      ) : (
                        <p className="screen-quote">The next edition is being prepared. Free to enter.</p>
                      )}
                    </motion.div>
                  )}
                  {bondScene === 1 && (
                    <motion.div key="bond-rubric" className="screen-bond-scene" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.35 }}>
                      <span className="screen-label">THE PUBLISHED RUBRIC</span>
                      {criteria.length ? (
                        <ul className="screen-rubric">
                          {criteria.map((criterion, index) => (
                            <li key={criterion.name}>
                              <span>{criterion.name}</span>
                              <span className="screen-rubric-bar"><motion.i initial={{ width: 0 }} animate={{ width: `${criterion.weight}%` }} transition={{ duration: 0.9, delay: 0.15 + index * 0.12, ease: [0.16, 1, 0.3, 1] }} /></span>
                              <b>{criterion.weight}%</b>
                            </li>
                          ))}
                        </ul>
                      ) : <p className="screen-quote">The full rubric is published when entries open.</p>}
                    </motion.div>
                  )}
                  {bondScene === 2 && (
                    <motion.div key="bond-cta" className="screen-bond-scene" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.35 }}>
                      <span className="screen-medal"><Award size={22} strokeWidth={1.4} /></span>
                      <p className="screen-quote">Tell one true story about the person who makes life feel like home.</p>
                      <span className="screen-cta">Enter for free <ArrowRight size={12} /></span>
                      <span className="screen-fine">Premium and Love Coins never affect judging.</span>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="screen-foot"><ShieldCheck size={11} /> one entry per member · human reviewed</div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.section>
  );
}
