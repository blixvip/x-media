"use client";

import { useEffect, useState } from "react";
import styles from "./x-radar.module.css";

const STORAGE_KEY = "x-master:algorithm-basics:v1";

const BASICS = [
  {
    id: "audience",
    title: "Choose one clear audience",
    rule: "Write so one kind of person instantly knows the post is for them. Consistent subjects help X match you with viewers who have similar interests.",
    follow: "Name the reader and one problem, desire, or curiosity.",
    avoid: "Trying to interest everybody at once.",
  },
  {
    id: "opening",
    title: "Lead with the value",
    rule: "The first line should make a specific promise, claim, or observation. It must earn the next second without hiding the point.",
    follow: "Put the useful or surprising part first.",
    avoid: "Warm-up sentences, vague hype, or empty hooks.",
  },
  {
    id: "proof",
    title: "Deliver proof quickly",
    rule: "Fulfill the opening with an example, result, number, screenshot, or clear reasoning. Satisfaction matters more than a click alone.",
    follow: "Show the evidence a reader needs to believe or use the post.",
    avoid: "Bait-and-switch claims or unsupported certainty.",
  },
  {
    id: "action",
    title: "Create one natural action",
    rule: "Give the right reader one honest next move: reply, save, repost, open your profile, or follow for continued expertise.",
    follow: "Ask a precise question only when a real answer helps the conversation.",
    avoid: "Begging for likes, replies, reposts, and follows at once.",
  },
  {
    id: "attention",
    title: "Make attention worth it",
    rule: "Readable structure and useful media can earn dwell, expands, video views, and shares. Every extra element should improve understanding.",
    follow: "Use short paragraphs, concrete language, and media that carries information.",
    avoid: "Padding, unreadable screenshots, or video with no payoff.",
  },
  {
    id: "timing",
    title: "Join live conversations",
    rule: "Publish while the subject is useful now. Replies and quotes should add a fact, example, useful disagreement, or sharp question.",
    follow: "Contribute early where your audience is already paying attention.",
    avoid: "Late summaries or generic replies that add no new value.",
  },
  {
    id: "trust",
    title: "Protect reader trust",
    rule: "X predicts negative actions too: not interested, no dwell, mute, block, and report. Repetition and manipulation train the wrong response.",
    follow: "Be accurate, correct mistakes, vary the substance, and respect safety rules.",
    avoid: "Spam, copied posts, rage bait, fake urgency, or engagement manipulation.",
  },
] as const;

const MODEL_STEPS = ["Audience match", "Predicted action", "Rank", "Feedback"];
const EXAMPLES = [
  "For developers shipping their first agent: show one failure you hit and the fix that made it reliable.",
  "Instead of ‘A few thoughts on agents’, try ‘My agent kept repeating failed commands. One retry limit fixed it.’",
  "Attach the relevant log or a before-and-after screenshot. Explain what you changed and what the result does not establish.",
  "Ask ‘Which failure do your agents repeat most?’ when you want to compare real experiences.",
  "Crop a screenshot to the detail you discuss. For a demo, show the result early and caption the steps.",
  "On a launch post, add a tested use case or a concrete question. Check the original announcement before quoting a claim.",
  "If your benchmark was wrong, correct the post and explain the measurement. Do not repost the same claim to chase another audience.",
];

function readProgress() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    const valid = new Set(BASICS.map((basic) => basic.id));
    return value.filter((id): id is string => typeof id === "string" && valid.has(id as (typeof BASICS)[number]["id"]));
  } catch {
    return [];
  }
}

export function XAlgorithmBasics() {
  const [completed, setCompleted] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCompleted(readProgress());
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(completed)); } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStorageFailed(true);
    }
  }, [completed, ready]);

  function toggle(id: string) {
    setCompleted((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return <article className={styles.algorithmPage} aria-labelledby="basics-heading">
    <header className={styles.algorithmHero}>
      <div className={styles.algorithmHeroCopy}>
        <p className={styles.algorithmKicker}>X ALGORITHM · 100% BASICS</p>
        <h1 id="basics-heading">Win the prediction, not the hack.</h1>
        <p>X ranks each post for each viewer. Your job: make the right person stop, care, and take one positive action—without causing regret.</p>
      </div>
      <div className={styles.algorithmProgress} aria-busy={!ready}>
        <div><strong>{completed.length} of {BASICS.length} basics complete</strong><button type="button" aria-label="Reset basics progress" disabled={!completed.length} onClick={() => setCompleted([])}>Reset</button></div>
        <progress max={BASICS.length} value={completed.length}>{completed.length} of {BASICS.length}</progress>
        <span role="status">{completed.length === BASICS.length ? "Foundation complete. Use the post gate every time." : "Check each rule only when it is part of your routine."}</span>
        {storageFailed && <span role="status">Progress works for this visit. Browser storage is unavailable.</span>}
      </div>
    </header>

    <section className={styles.algorithmModel} aria-labelledby="model-heading">
      <div><p className={styles.algorithmKicker}>THE WHOLE MODEL</p><h2 id="model-heading">X predicts what one viewer will do next.</h2></div>
      <ol>{MODEL_STEPS.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span><strong>{step}</strong></li>)}</ol>
      <p>There is no universal best post or permanent magic weight. X combines predicted positive and negative actions, then filters and reranks the candidates.</p>
    </section>

    <div className={styles.algorithmBody}>
      <section className={styles.basicsLesson} aria-labelledby="seven-basics-heading">
        <header><p className={styles.algorithmKicker}>FOLLOW THESE</p><h2 id="seven-basics-heading">The seven basics</h2></header>
        <ol>{BASICS.map((basic, index) => <li key={basic.id} className={completed.includes(basic.id) ? styles.basicComplete : undefined}>
          <span className={styles.basicNumber}>{String(index + 1).padStart(2, "0")}</span>
          <div><h3>{basic.title}</h3><p>{basic.rule}</p><dl><div><dt>Do</dt><dd>{basic.follow}</dd></div><div><dt>Avoid</dt><dd>{basic.avoid}</dd></div></dl><details><summary>See example →</summary><p>{EXAMPLES[index]}</p></details></div>
          <label><input type="checkbox" checked={completed.includes(basic.id)} onChange={() => toggle(basic.id)} aria-label={`Mark basic ${index + 1} complete: ${basic.title}`} /><span>{completed.includes(basic.id) ? "Following" : "Learned"}</span></label>
        </li>)}</ol>
      </section>

      <aside className={styles.algorithmSidebar}>
        <section className={styles.postGate} aria-labelledby="post-gate-heading">
          <p className={styles.algorithmKicker}>20-SECOND GATE</p><h2 id="post-gate-heading">Before every post</h2>
          <ol><li>Who exactly is this for?</li><li>Is the value clear in line one?</li><li>Did I deliver proof or a useful detail?</li><li>Is there one natural action?</li><li>Will the reader feel satisfied even if they never engage?</li></ol>
          <p>If any answer is “no,” rewrite before posting.</p>
        </section>
        <section className={styles.starterCadence} aria-labelledby="cadence-heading">
          <p className={styles.algorithmKicker}>STARTER CADENCE</p><h2 id="cadence-heading">Build signal, not volume</h2>
          <dl><div><dt>Daily</dt><dd>Publish one useful original. Add three substantive replies in the same audience. Reply to people who engage.</dd></div><div><dt>Weekly</dt><dd>Review what earned replies, saves, profile visits, and follows. Repeat the subject and delivery—not the exact post.</dd></div></dl>
          <small>This cadence is an operator habit, not an X ranking requirement.</small>
        </section>
      </aside>
    </div>

    <section className={styles.algorithmMyths} aria-labelledby="myths-heading">
      <header><p className={styles.algorithmKicker}>IGNORE THE MYTHS</p><h2 id="myths-heading">What the published system actually says</h2></header>
      <dl><div><dt>“One report cancels hundreds of likes.”</dt><dd>False. Published weights multiply predicted probabilities, not raw engagement counts.</dd></div><div><dt>“More posts always means more reach.”</dt><dd>False. Repeated authors are diversified, while seen, duplicate, old, or ineligible posts can be filtered.</dd></div><div><dt>“Likes are the algorithm.”</dt><dd>Incomplete. The model predicts replies, reposts, shares, clicks, dwell, follows, media actions, and negative feedback too.</dd></div><div><dt>“A format hack works for everyone.”</dt><dd>False. Retrieval and ranking use each viewer’s recent behavior, network, and interests.</dd></div></dl>
    </section>

    <footer className={styles.algorithmSources}>
      <div><strong>Source boundary</strong><p>Based on current public X guidance and xAI’s open-source For You system. Exact production models, weights, and experiments can change.</p></div>
      <nav aria-label="X algorithm sources"><a href="https://help.x.com/en/rules-and-policies/recommendations" target="_blank" rel="noreferrer">X recommendation guide</a><a href="https://github.com/xai-org/x-algorithm" target="_blank" rel="noreferrer">Open X algorithm source</a></nav>
    </footer>
  </article>;
}
