/* global React, ReactDOM */
const { useState, useEffect, useMemo, useRef, useCallback } = React;

// ─── Team-aware palette + jersey number ───
const FALLBACK_PALETTE = ["#2a2a2a", "#d6a443"];
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function paletteFor(row) {
  return (window.TEAM_COLORS && window.TEAM_COLORS[row.t]) || FALLBACK_PALETTE;
}
function initialsFor(name) {
  const parts = name.replace(/'/g, "").split(/\s+/);
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}
function jerseyNumFor(row) {
  const map = window.JERSEY_NUMBERS || {};
  if (map[row.n] != null) return map[row.n];
  return (hashStr(row.n + row.s) % 45) + 1;
}

// ─── Portrait — silhouette-based player illustration ───
// Implementation lives in silhouette.jsx (window.SilhouettePortrait) so this
// file stays manageable. We pass the helpers it needs as props.
function Portrait({ row, size = 320 }) {
  const SP = window.SilhouettePortrait;
  if (!SP) {
    return (
      <svg viewBox="0 0 200 250" style={{ width: size, height: size * 1.25 }}>
        <rect width="200" height="250" fill="#e8e2d4" />
      </svg>
    );
  }
  return <SP row={row} size={size} paletteFor={paletteFor} jerseyNumFor={jerseyNumFor} hashStr={hashStr} />;
}


// ─── Animated number that eases toward the target value ───
// Uses a ref for "current display" so rapid value changes (user dragging the
// slider) don't restart from a stale snapshot — that's what was causing the
// weird "jumps to 22 then 1" behavior.
function TickerNum({ value, decimals = 1, duration = 220, snapDelta = 1.5 }) {
  const [, force] = useState(0);
  const displayRef = useRef(value);
  const targetRef = useRef(value);
  const rafRef = useRef(null);

  useEffect(() => {
    targetRef.current = value;
    // If the user is dragging quickly (big jumps), snap to avoid overshoot
    // animations stacking up. For small target changes, ease smoothly.
    if (Math.abs(value - displayRef.current) > snapDelta) {
      displayRef.current = value;
      cancelAnimationFrame(rafRef.current);
      force((n) => n + 1);
      return;
    }
    cancelAnimationFrame(rafRef.current);
    const start = performance.now();
    const from = displayRef.current;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      displayRef.current = from + (targetRef.current - from) * eased;
      force((n) => n + 1);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration, snapDelta]);

  return <span>{displayRef.current.toFixed(decimals)}</span>;
}

// ─── Slider row ───
function StatSlider({ stat, value, range, onChange }) {
  const pct = ((value - range.min) / (range.max - range.min)) * 100;
  return (
    <div className="slider-row">
      <div className="slider-meta">
        <div className="slider-label">
          <span className="stat-code">{range.label}</span>
          <span className="stat-full">{range.full}</span>
        </div>
        <div className="slider-value">
          <TickerNum value={value} decimals={1} />
        </div>
      </div>
      <div className="slider-track-wrap">
        <input
          type="range"
          min={range.min}
          max={range.max}
          step={range.step}
          value={value}
          onChange={(e) => onChange(stat, parseFloat(e.target.value))}
          className="slider-input"
          style={{ "--pct": `${pct}%` }}
        />
        <div className="slider-track-bg" />
        <div className="slider-track-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="slider-extents">
        <span>{range.min}</span>
        <span>{range.max}</span>
      </div>
    </div>
  );
}

// ─── Match-confidence bar ───
function MatchBar({ pct }) {
  return (
    <div className="match-bar">
      <div className="match-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Small "other match" card ───
function MiniMatch({ entry, onPick }) {
  const { row, match } = entry;
  const [c1, c2] = paletteFor(row);
  const num = jerseyNumFor(row);
  return (
    <button className="mini-match" onClick={() => onPick(row)}>
      <div className="mini-portrait" style={{ background: c1 }}>
        <div className="mini-stripe" style={{ background: c2 }} />
        <div className="mini-jersey-num" style={{ color: c2 }}>{num}</div>
        <div className="mini-mono">{initialsFor(row.n)}</div>
      </div>
      <div className="mini-meta">
        <div className="mini-name">{row.n}</div>
        <div className="mini-sub">
          {row.s} · {row.t}
        </div>
        <div className="mini-stats">
          {row.ppg.toFixed(1)} / {row.rpg.toFixed(1)} / {row.apg.toFixed(1)}
        </div>
        <div className="mini-pct">
          <span>{match.toFixed(1)}%</span>
          <MatchBar pct={match} />
        </div>
      </div>
    </button>
  );
}

// ─── Background treatment renderer ───
function Background({ kind }) {
  if (kind === "court") {
    return (
      <svg className="bg-svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
        <rect width="1600" height="1000" fill="var(--paper)" />
        <g stroke="var(--rule)" strokeWidth="2" fill="none" opacity="0.55">
          <rect x="60" y="60" width="1480" height="880" />
          <line x1="800" y1="60" x2="800" y2="940" />
          <circle cx="800" cy="500" r="120" />
          <circle cx="800" cy="500" r="40" />
          <rect x="60" y="320" width="280" height="360" />
          <rect x="1260" y="320" width="280" height="360" />
          <circle cx="340" cy="500" r="90" />
          <circle cx="1260" cy="500" r="90" />
          <path d="M 60 230 Q 400 500 60 770" />
          <path d="M 1540 230 Q 1200 500 1540 770" />
        </g>
      </svg>
    );
  }
  if (kind === "noise") {
    return (
      <svg className="bg-svg" preserveAspectRatio="none">
        <filter id="bgnoise">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0.10
                                  0 0 0 0 0.08
                                  0 0 0 0 0.06
                                  0 0 0 0.18 0" />
        </filter>
        <rect width="100%" height="100%" fill="var(--paper)" />
        <rect width="100%" height="100%" filter="url(#bgnoise)" />
      </svg>
    );
  }
  if (kind === "gradient") {
    return (
      <div
        className="bg-svg"
        style={{
          background:
            "radial-gradient(circle at 25% 30%, oklch(0.96 0.04 60), oklch(0.92 0.05 35) 60%, oklch(0.86 0.06 25))",
        }}
      />
    );
  }
  // solid
  return <div className="bg-svg" style={{ background: "var(--paper)" }} />;
}

// ─── Main App ───
function App() {
  const seasons = window.SEASONS;
  const seasonCountLabel = useMemo(
    () => (seasons?.length ?? 0).toLocaleString(),
    [seasons]
  );
  const norm = useMemo(
    () => window.MATCH.computeNormalization(seasons),
    [seasons]
  );
  const STATS = window.MATCH.STATS;
  const RANGES = window.MATCH.RANGES;

  const initial = { ppg: 22.4, rpg: 5.1, apg: 6.2, spg: 1.6, bpg: 0.6 };
  const [values, setValues] = useState(initial);
  const [animating, setAnimating] = useState(false);

  // Tweaks
  const tweakDefaults = /*EDITMODE-BEGIN*/{
    "background": "solid"
  }/*EDITMODE-END*/;
  const [tweaks, setTweak] = window.useTweaks(tweakDefaults);

  const setStat = useCallback((k, v) => {
    setValues((s) => ({ ...s, [k]: v }));
  }, []);

  const matches = useMemo(
    () =>
      window.MATCH.findMatches(values, seasons, norm, {
        enabled: STATS,
        limit: 6,
      }),
    [values, seasons, norm]
  );
  const primary = matches[0];
  const others = matches.slice(1, 5);

  const reset = () => setValues({ ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0 });

  // Random: pick a real season and animate sliders to its values
  const animTokenRef = useRef(0);
  const random = () => {
    const target = seasons[Math.floor(Math.random() * seasons.length)];
    const from = { ...values };
    const to = {
      ppg: target.ppg,
      rpg: target.rpg,
      apg: target.apg,
      spg: target.spg,
      bpg: target.bpg,
    };
    const dur = 900;
    const start = performance.now();
    const token = ++animTokenRef.current;
    setAnimating(true);
    const tick = (now) => {
      if (animTokenRef.current !== token) return;
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = {};
      for (const k of STATS) next[k] = from[k] + (to[k] - from[k]) * eased;
      setValues(next);
      if (t < 1) requestAnimationFrame(tick);
      else setAnimating(false);
    };
    requestAnimationFrame(tick);
  };

  const pickRow = (row) => {
    const target = { ppg: row.ppg, rpg: row.rpg, apg: row.apg, spg: row.spg, bpg: row.bpg };
    const from = { ...values };
    const dur = 600;
    const start = performance.now();
    const token = ++animTokenRef.current;
    const tick = (now) => {
      if (animTokenRef.current !== token) return;
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = {};
      for (const k of STATS) next[k] = from[k] + (target[k] - from[k]) * eased;
      setValues(next);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  return (
    <div className={`app bg-${tweaks.background}`}>
      <Background kind={tweaks.background} />

      <header className="masthead">
        <div className="masthead-left">
          <div className="kicker">Volume 01 · Issue 04</div>
          <div className="wordmark">
            <span className="word-stat">STAT</span>
            <span className="word-twin">TWIN</span>
          </div>
          <div className="tagline">Find the player-season hidden in the numbers.</div>
        </div>
        <div className="masthead-right">
          <div className="dateline">EDITORIAL · APRIL 2026</div>
          <div className="issue-no">№ 004 / FOUR</div>
        </div>
      </header>

      <div className="rule-double" />

      <main className="layout">
        {/* LEFT: featured player card */}
        <section className="feature">
          <div className="feature-tag">FEATURED MATCH</div>
          <div className="feature-card">
            <div className="portrait-wrap">
              <Portrait row={primary?.row} size={300} />
              <div className="match-stamp">
                <div className="stamp-pct">
                  <TickerNum value={primary?.match || 0} decimals={1} />
                  <span className="stamp-symbol">%</span>
                </div>
                <div className="stamp-label">MATCH</div>
              </div>
            </div>
            <div className="feature-info">
              <div className="feature-eyebrow">Closest historical fit</div>
              <h1 className="feature-name">{primary?.row.n}</h1>
              <div className="feature-meta">
                <span className="feature-season">{primary?.row.s}</span>
                <span className="dot">·</span>
                <span className="feature-team">{primary?.row.t}</span>
              </div>
              <div className="actual-line">
                <div className="actual-label">ACTUAL STAT LINE</div>
                <div className="actual-stats">
                  <div className="actual-stat"><b>{primary?.row.ppg.toFixed(1)}</b><span>PPG</span></div>
                  <div className="actual-stat"><b>{primary?.row.rpg.toFixed(1)}</b><span>RPG</span></div>
                  <div className="actual-stat"><b>{primary?.row.apg.toFixed(1)}</b><span>APG</span></div>
                  <div className="actual-stat"><b>{primary?.row.spg.toFixed(1)}</b><span>SPG</span></div>
                  <div className="actual-stat"><b>{primary?.row.bpg.toFixed(1)}</b><span>BPG</span></div>
                </div>
              </div>
              <div className="shooting-line">
                <div className="shoot-item"><span>FG</span> <b>{(primary?.row.fg * 100).toFixed(1)}%</b></div>
                <div className="shoot-item"><span>3P</span> <b>{(primary?.row.tp * 100).toFixed(1)}%</b></div>
                <div className="shoot-item"><span>FT</span> <b>{(primary?.row.ft * 100).toFixed(1)}%</b></div>
                <div className="shoot-item"><span>MPG</span> <b>{primary?.row.mpg.toFixed(1)}</b></div>
                <div className="shoot-item"><span>GP</span> <b>{primary?.row.gp}</b></div>
              </div>
              <MatchBar pct={primary?.match || 0} />
            </div>
          </div>

          <div className="others">
            <div className="others-heading">
              <span className="others-rule" />
              <span className="others-text">OTHER CLOSE MATCHES</span>
              <span className="others-rule" />
            </div>
            <div className="others-grid">
              {others.map((m) => (
                <MiniMatch key={m.row.n + m.row.s} entry={m} onPick={pickRow} />
              ))}
            </div>
          </div>
        </section>

        {/* RIGHT: sliders */}
        <aside className="controls">
          <div className="controls-header">
            <span className="controls-label">THE STAT LINE</span>
            <span className="controls-sub">DRAG TO RECREATE</span>
          </div>
          <div className="sliders">
            {STATS.map((s) => (
              <StatSlider
                key={s}
                stat={s}
                value={values[s]}
                range={RANGES[s]}
                onChange={setStat}
              />
            ))}
          </div>
          <div className="controls-actions">
            <button className="btn btn-ghost" onClick={reset}>RESET</button>
            <button className="btn btn-primary" onClick={random} disabled={animating}>
              {animating ? "DEALING…" : "RANDOM PLAYER / SEASON"}
            </button>
          </div>
          <div className="controls-footnote">
            Distance computed across {seasonCountLabel} qualifying player-seasons
            (≥ 300 total minutes) using z-score normalized weighted Euclidean.
          </div>
        </aside>
      </main>

      <footer className="colophon">
        <span>STAT TWIN · A SLIDER STUDY</span>
        <span className="dot">·</span>
        <span>{seasonCountLabel} SEASONS INDEXED (≥ 300 MIN)</span>
        <span className="dot">·</span>
        <span>SET IN PLAYFAIR & INTER</span>
      </footer>

      <window.TweaksPanel title="Tweaks">
        <window.TweakSection title="Background treatment">
          <window.TweakRadio
            value={tweaks.background}
            onChange={(v) => setTweak("background", v)}
            options={[
              { value: "solid", label: "Paper" },
              { value: "court", label: "Court" },
              { value: "noise", label: "Grain" },
              { value: "gradient", label: "Wash" },
            ]}
          />
        </window.TweakSection>
      </window.TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
