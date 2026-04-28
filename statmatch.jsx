/* global React, ReactDOM, html2canvas */
const { useState, useEffect, useMemo, useRef, useCallback } = React;

const FALLBACK_PALETTE = ["#2a2a2a", "#d6a443"];
const STORAGE_KEY = "statmatch_v1";
const MAX_GUESSES = 6;
const CLUE_KEYS = ["height", "conference", "position", "division", "team_full"];
const CLUE_LABELS = ["HEIGHT", "CONFERENCE", "POSITION", "DIVISION", "TEAM"];

const NICKNAME_ALIASES = {
  magic: "Magic Johnson",
  mj: "Michael Jordan",
  "m j": "Michael Jordan",
  ai: "Allen Iverson",
  kd: "Kevin Durant",
  ad: "Anthony Davis",
  pg: "Paul George",
  cp3: "Chris Paul",
  "cp 3": "Chris Paul",
  dbook: "Devin Booker",
  "d book": "Devin Booker",
  joker: "Nikola Jokic",
  giannis: "Giannis Antetokounmpo",
  luka: "Luka Doncic",
  "king james": "LeBron James",
  bron: "LeBron James",
};

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function paletteFor(row) {
  return (window.TEAM_COLORS && window.TEAM_COLORS[row.t]) || FALLBACK_PALETTE;
}

function jerseyNumFor(row) {
  const map = window.JERSEY_NUMBERS || {};
  if (map[row.n] != null) return map[row.n];
  return (hashStr(row.n + row.s) % 45) + 1;
}

function utcDateKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function puzzleNumber(dateKey) {
  const [y, m, day] = dateKey.split("-").map(Number);
  const anchor = Date.UTC(1980, 0, 1);
  const t = Date.UTC(y, m - 1, day);
  return Math.floor((t - anchor) / 86400000);
}

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seasonStartYearFromLabel(seasonLabel) {
  const y = Number(String(seasonLabel || "").slice(0, 4));
  return Number.isFinite(y) ? y : NaN;
}

function currentSeasonStartYearFromDateKey(dateKey) {
  // If it's Oct-Dec, season start is that year; else previous year.
  const [y, m] = dateKey.split("-").map(Number);
  return m >= 10 ? y : y - 1;
}

function tierRank(tier) {
  const o = { AllNBA: 5, AllStar: 4, Starter: 3, Rotation: 2, Qualifier: 1, DeepCut: 0 };
  return o[tier] ?? 0;
}

function buildCareerIndex(seasons) {
  // Derive career-ish aggregates from the seasons table (v1 approximation).
  const byName = new Map();
  for (const r of seasons) {
    const name = r.n;
    if (!name) continue;
    const gp = Number(r.gp || 0);
    const totMin = Number(r.totMin || 0);
    if (!byName.has(name)) byName.set(name, { games: 0, minutes: 0 });
    const a = byName.get(name);
    a.games += gp;
    a.minutes += totMin;
  }
  return byName;
}

function isAllStarSeason(row) {
  return tierRank(row.tier) >= tierRank("AllStar");
}

function filterQualifyingBase(seasons) {
  // Hard floor: no puzzles below 500 total minutes.
  return seasons.filter((r) => (r.totMin || 0) >= 500);
}

function poolForDayWithFallback(seasons, dateKey, weekdayOverride) {
  const base = filterQualifyingBase(seasons);
  const seasonStartNow = currentSeasonStartYearFromDateKey(dateKey);
  const cutoff30 = seasonStartNow - 29;
  const cutoff15 = seasonStartNow - 14;

  const inLastNYears = (r, cutoff) => seasonStartYearFromLabel(r.s) >= cutoff;

  // Heuristic buckets (since we don't have official awards/all-star data):
  const allStar30 = (r) => isAllStarSeason(r) && inLastNYears(r, cutoff30);
  const allStar15 = (r) => isAllStarSeason(r) && inLastNYears(r, cutoff15);
  const allNbaLike30 = (r) => (r.tier === "AllNBA" || r.ppg >= 26) && inLastNYears(r, cutoff30);

  const nearAllStarOrLowAllStar = (r) => {
    // Great-but-not-constant stars:
    // - high starter seasons that didn't hit our AllStar heuristic
    // - OR borderline AllStar tier with slightly lower profile
    const borderline =
      r.tier === "Starter" && r.mpg >= 30 && (r.ppg >= 17 || r.apg >= 6.5 || r.rpg >= 10);
    const lowAllStar = r.tier === "AllStar" && r.ppg < 22.5 && r.mpg < 33;
    return (borderline || lowAllStar) && inLastNYears(r, cutoff30);
  };

  const rolePlayersAndSixthMen30 = (r) => {
    // Rotation/role archetype: minutes but not lead-scoring profile.
    const role =
      (r.tier === "Rotation" || r.tier === "Qualifier" || r.tier === "DeepCut") &&
      r.mpg >= 16 &&
      r.mpg <= 30 &&
      r.ppg <= 18.5;
    return role && inLastNYears(r, cutoff30);
  };

  const nichePool = (r) => {
    const niche = r.tier === "DeepCut" || r.tier === "Qualifier" || r.mpg <= 20;
    return niche && inLastNYears(r, cutoff30);
  };

  // 0=Sun .. 6=Sat (JS getUTCDay)
  const wd =
    typeof weekdayOverride === "number" && weekdayOverride >= 0 && weekdayOverride <= 6
      ? weekdayOverride
      : new Date(`${dateKey}T12:00:00Z`).getUTCDay();

  // Ordered from easier -> harder. If a pool is empty, fall forward to the next harder pool.
  const pools = {
    1: [ // Monday: all-NBA-ish (last 30)
      (xs) => xs.filter(allNbaLike30),
      (xs) => xs.filter(allStar30),
      (xs) => xs.filter((r) => inLastNYears(r, cutoff30)),
    ],
    2: [ // Tuesday: all-star-ish (last 15)
      (xs) => xs.filter(allStar15),
      (xs) => xs.filter(allStar30),
      (xs) => xs.filter((r) => inLastNYears(r, cutoff15)),
    ],
    3: [ // Wednesday: all-star-ish (last 30)
      (xs) => xs.filter(allStar30),
      (xs) => xs.filter((r) => inLastNYears(r, cutoff30)),
    ],
    4: [ // Thursday: near-all-stars / low all-star count archetype (last 30)
      (xs) => xs.filter(nearAllStarOrLowAllStar),
      (xs) => xs.filter((r) => r.tier === "Starter" && inLastNYears(r, cutoff30)),
      (xs) => xs.filter(allStar30),
    ],
    5: [ // Friday: role players / sixth men (last 30)
      (xs) => xs.filter(rolePlayersAndSixthMen30),
      (xs) => xs.filter((r) => (r.tier === "Rotation" || r.tier === "Qualifier") && inLastNYears(r, cutoff30)),
      (xs) => xs.filter((r) => inLastNYears(r, cutoff30)),
    ],
    6: [ // Saturday: niche, still 500+ minutes
      (xs) => xs.filter(nichePool),
      (xs) => xs.filter((r) => inLastNYears(r, cutoff30)),
    ],
    0: [ // Sunday: niche, still 500+ minutes
      (xs) => xs.filter(nichePool),
      (xs) => xs.filter((r) => inLastNYears(r, cutoff30)),
    ],
  };

  const chain = pools[wd] || [ (xs) => xs ];
  for (const fn of chain) {
    const p = fn(base);
    if (p.length) return p;
  }
  return base;
}

function pickDailyTarget(seasons, dateKey, weekdayOverride) {
  const d = new Date(`${dateKey}T12:00:00Z`);
  const use = poolForDayWithFallback(seasons, dateKey, weekdayOverride);
  const h = hash32(`${dateKey}|statmatch`);
  const idx = use.length ? h % use.length : 0;
  return use[idx];
}

function normalizeGuess(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function resolveAlias(raw) {
  const k = normalizeGuess(raw);
  return NICKNAME_ALIASES[k] || raw.trim();
}

function buildPlayerIndex(seasons) {
  const set = new Set();
  for (const r of seasons) {
    if (r.n) set.add(r.n);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function scoreName(query, name) {
  const q = normalizeGuess(query);
  const n = name.toLowerCase();
  if (!q) return 0;
  if (n === q) return 1e6;
  if (n.startsWith(q)) return 1e5 - n.length;
  const idx = n.indexOf(q);
  if (idx === -1) return -1;
  return 1e4 - idx * 10 - n.length;
}

function suggestPlayers(allNames, query, limit = 5) {
  const raw = String(query || "").trim();
  const q0 = normalizeGuess(raw);
  if (!q0) return [];
  const resolved = resolveAlias(raw);
  if (normalizeGuess(resolved) !== q0 && resolved.trim()) {
    const exact = allNames.filter((n) => normalizeGuess(n) === normalizeGuess(resolved));
    if (exact.length) return exact.slice(0, limit);
  }
  const scored = [];
  for (const name of allNames) {
    const s = scoreName(raw, name);
    if (s > 0) scored.push({ name, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map((x) => x.name);
}

function loadStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStats();
    const o = JSON.parse(raw);
    if (!o || o.v !== 1) return defaultStats();
    return {
      ...defaultStats(),
      ...o,
      lastCompletedUtcDate: o.lastCompletedUtcDate ?? null,
      distribution: { ...defaultStats().distribution, ...(o.distribution || {}) },
      byDate: { ...(o.byDate || {}) },
    };
  } catch {
    return defaultStats();
  }
}

function defaultStats() {
  return {
    v: 1,
    streak: 0,
    maxStreak: 0,
    totalPlayed: 0,
    totalWins: 0,
    lastCompletedUtcDate: null,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    byDate: {},
  };
}

function saveStats(s) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function nextUtcMidnightLabel(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
  return next.toISOString();
}

function Portrait({ row, size = 220 }) {
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

function MysteryPortrait({ size = 200 }) {
  const row = { n: "?", s: "", t: "" };
  return (
    <div className="sm-mystery-portrait">
      <Portrait row={row} size={size} />
    </div>
  );
}

function ModeNav({ current }) {
  return (
    <nav className="sm-mode-nav" aria-label="Site modes">
      <a href="/" className={current === "match" ? "sm-mode sm-mode-active" : "sm-mode"}>
        Stat Match
      </a>
      <span className="sm-mode-sep">·</span>
      <a href="/explore" className={current === "twin" ? "sm-mode sm-mode-active" : "sm-mode"}>
        Explore
      </a>
    </nav>
  );
}

function StatLine({ row, compact }) {
  return (
    <div className={compact ? "sm-statline sm-statline-compact" : "sm-statline"}>
      <div className="sm-statline-row">
        {["ppg", "rpg", "apg", "spg", "bpg"].map((k) => (
          <div key={k} className="sm-statcell">
            <span className="sm-statcell-v">{row[k]?.toFixed?.(1) ?? row[k]}</span>
            <span className="sm-statcell-l">{k.toUpperCase()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClueStrip({ target, cluesRevealed }) {
  return (
    <div className="sm-clues">
      {CLUE_KEYS.map((key, i) => {
        const open = i < cluesRevealed;
        const val = target[key];
        const display =
          val == null || val === ""
            ? "—"
            : key === "team_full"
              ? String(val)
              : String(val);
        return (
          <div key={key} className={`sm-clue ${open ? "sm-clue-open" : ""}`}>
            <div className="sm-clue-label">{CLUE_LABELS[i]}</div>
            <div className="sm-clue-val">{open ? display : "—"}</div>
          </div>
        );
      })}
    </div>
  );
}

function GuessDots({ used, max }) {
  return (
    <div className="sm-dots" aria-label={`Guesses used ${used} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`sm-dot ${i < used ? "sm-dot-used" : ""}`} />
      ))}
    </div>
  );
}

function emojiGridFromGuesses(guesses, targetName) {
  return guesses
    .map((g) => (normalizeGuess(g) === normalizeGuess(targetName) ? "🟩" : "🟥"))
    .join("");
}

function heightToInches(h) {
  // "6'7\"" -> 79
  if (!h) return null;
  const m = String(h).match(/(\d+)\s*'\s*(\d+)/);
  if (!m) return null;
  const ft = Number(m[1]);
  const inch = Number(m[2]);
  if (!Number.isFinite(ft) || !Number.isFinite(inch)) return null;
  return ft * 12 + inch;
}

function bestGuessRowForPlayer(seasons, playerName, targetSeasonLabel) {
  const want = normalizeGuess(playerName);
  const rows = seasons.filter((r) => normalizeGuess(r.n) === want);
  if (!rows.length) return null;
  // Prefer the same season as the puzzle if available (makes team/division feedback meaningful).
  const sameSeason = rows.filter((r) => r.s === targetSeasonLabel);
  const pool = sameSeason.length ? sameSeason : rows;
  // Pick the highest-minute season as "representative".
  pool.sort((a, b) => (b.totMin || 0) - (a.totMin || 0));
  return pool[0];
}

function compareAttr(key, guessRow, targetRow) {
  const gv = guessRow?.[key] ?? null;
  const tv = targetRow?.[key] ?? null;
  if (gv == null || gv === "" || tv == null || tv === "") return { status: "unknown", gv, tv };

  if (key === "height") {
    const gi = heightToInches(gv);
    const ti = heightToInches(tv);
    if (gi == null || ti == null) return { status: "unknown", gv, tv };
    if (gi === ti) return { status: "correct", gv, tv };
    if (Math.abs(gi - ti) <= 1) return { status: "close", gv, tv };
    return { status: "wrong", gv, tv };
  }

  const g = String(gv);
  const t = String(tv);
  return { status: g === t ? "correct" : "wrong", gv, tv };
}

function GuessFeedbackTable({ seasons, guesses, target }) {
  if (!guesses.length) return null;
  return (
    <div className="sm-guess-grid" role="table" aria-label="Guess feedback">
      <div className="sm-guess-head" role="row">
        <div className="sm-guess-nameh" role="columnheader">GUESS</div>
        {CLUE_LABELS.map((l) => (
          <div key={l} className="sm-guess-colh" role="columnheader">{l}</div>
        ))}
      </div>
      {guesses.map((g, gi) => {
        const row = bestGuessRowForPlayer(seasons, g, target.s);
        const cells = CLUE_KEYS.map((k) => compareAttr(k, row, target));
        return (
          <div key={`${gi}-${g}`} className="sm-guess-row" role="row">
            <div className="sm-guess-name" role="cell">
              <span className="sm-prev-x" aria-hidden>×</span>
              {g}
            </div>
            {cells.map((c, i) => (
              <div
                key={CLUE_KEYS[i]}
                role="cell"
                className={`sm-guess-cell sm-guess-${c.status}`}
                title={c.status === "unknown" ? "Unknown" : c.status}
              >
                {c.status === "correct" ? "✓" : c.status === "close" ? "≈" : c.status === "wrong" ? "×" : "—"}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function StatMatchApp() {
  const seasons = window.SEASONS || [];
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  // Temporary: default to test mode so the homepage always lets you play fresh rounds.
  // Later, we can flip this back to true daily-only by default.
  const publicEnabled = urlParams.get("public") === "1" || urlParams.get("public") === "true";
  const testEnabled = !publicEnabled;
  const [dayOverride, setDayOverride] = useState(() => {
    const v = urlParams.get("day");
    const n = v == null ? null : Number(v);
    return Number.isFinite(n) ? n : null;
  });
  const [roundNonce, setRoundNonce] = useState(0);

  const dateKey = useMemo(() => utcDateKey(), []);
  const puzzleNo = useMemo(() => puzzleNumber(dateKey), [dateKey]);
  const target = useMemo(() => {
    if (!testEnabled) return pickDailyTarget(seasons, dateKey, null);
    // In test mode, reroll uses a nonce but stays inside the selected day pool.
    const pool = poolForDayWithFallback(seasons, dateKey, dayOverride);
    const h = hash32(`${dateKey}|test|${dayOverride ?? "auto"}|${roundNonce}`);
    const idx = pool.length ? h % pool.length : 0;
    return pool[idx] || pickDailyTarget(seasons, dateKey, null);
  }, [seasons, dateKey, testEnabled, dayOverride, roundNonce]);

  const playerNames = useMemo(() => buildPlayerIndex(seasons), [seasons]);

  const initialStats = useMemo(() => loadStats(), []);
  const savedTodayInitial = initialStats.byDate[dateKey];

  const [stats, setStats] = useState(initialStats);

  const [phase, setPhase] = useState(!testEnabled && savedTodayInitial ? "result" : "play"); // play | result
  const [guesses, setGuesses] = useState(() => (!testEnabled ? savedTodayInitial?.guesses || [] : []));
  const [won, setWon] = useState(() => (!testEnabled ? !!savedTodayInitial?.won : false));
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [cardFlipped, setCardFlipped] = useState(false);
  const cardFrontRef = useRef(null);

  const wrongCount = guesses.filter((g) => normalizeGuess(g) !== normalizeGuess(target.n)).length;
  const cluesRevealed = Math.min(5, wrongCount);
  const guessesUsed = guesses.length;

  const recordFinish = useCallback(
    (didWin, guessList) => {
      if (testEnabled) return; // don't affect streak stats in test mode
      setStats((prev) => {
        const next = { ...prev };
        const already = prev.byDate[dateKey];
        if (already) return prev;
        next.totalPlayed += 1;
        if (didWin) {
          next.totalWins += 1;
          const n = guessList.length;
          next.distribution[n] = (next.distribution[n] || 0) + 1;
          const last = prev.lastCompletedUtcDate;
          if (last) {
            const dayDiff = (Date.parse(`${dateKey}T12:00:00Z`) - Date.parse(`${last}T12:00:00Z`)) / 86400000;
            if (dayDiff === 1) next.streak = (prev.streak || 0) + 1;
            else if (dayDiff > 1) next.streak = 1;
            else next.streak = prev.streak || 1;
          } else {
            next.streak = 1;
          }
          next.maxStreak = Math.max(next.maxStreak || 0, next.streak);
        } else {
          next.streak = 0;
        }
        next.lastCompletedUtcDate = dateKey;
        next.byDate = {
          ...prev.byDate,
          [dateKey]: { won: didWin, guesses: guessList, guessesUsed: guessList.length },
        };
        saveStats(next);
        return next;
      });
    },
    [dateKey]
  );

  const startNewRound = () => {
    setPhase("play");
    setWon(false);
    setGuesses([]);
    setInput("");
    setSuggestions([]);
    setCardFlipped(false);
    setRoundNonce((n) => n + 1);
  };

  const submitGuess = useCallback(
    (nameRaw) => {
      const name = resolveAlias(nameRaw).trim();
      if (!name || phase !== "play") return;
      if (guesses.length >= MAX_GUESSES) return;
      if (guesses.some((g) => normalizeGuess(g) === normalizeGuess(name))) return;
      const known = playerNames.some((n) => normalizeGuess(n) === normalizeGuess(name));
      if (!known) return;

      const nextGuesses = [...guesses, name];
      setGuesses(nextGuesses);
      setInput("");
      setSuggestions([]);

      if (normalizeGuess(name) === normalizeGuess(target.n)) {
        setWon(true);
        setPhase("result");
        recordFinish(true, nextGuesses);
        return;
      }
      if (nextGuesses.length >= MAX_GUESSES) {
        setWon(false);
        setPhase("result");
        recordFinish(false, nextGuesses);
      }
    },
    [guesses, phase, target.n, recordFinish, playerNames]
  );

  useEffect(() => {
    setSuggestions(suggestPlayers(playerNames, input, 5));
  }, [input, playerNames]);

  const shareText = useMemo(() => {
    const em = emojiGridFromGuesses(guesses, target.n);
    const outcome = won ? `${guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
    const host =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin.replace(/^https?:\/\//, "")
        : "nba-sliders.vercel.app";
    return `Stat Match №${puzzleNo} · ${outcome} ${em} — ${host}`;
  }, [guesses, target.n, won, puzzleNo]);

  const copyShare = () => {
    navigator.clipboard?.writeText?.(shareText);
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Stat Match", text: shareText });
      } catch {
        /* ignore */
      }
    } else {
      copyShare();
    }
  };

  const saveCardPng = async () => {
    const el = cardFrontRef.current;
    if (!el || !window.html2canvas) return;
    const canvas = await window.html2canvas(el, { scale: 2, backgroundColor: "#f5efe0" });
    const a = document.createElement("a");
    a.download = `stat-match-${dateKey}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  const fmtDateHeader = dateKey.replace(/-/g, " · ");

  return (
    <div className="app sm-app bg-solid">
      <div className="sm-bg" />

      <header className="sm-header">
        {testEnabled && (
          <div className="sm-testbar" role="region" aria-label="Test mode controls">
            <div className="sm-testbar-left">
              <span className="sm-testbadge">TEST</span>
              <label className="sm-testlbl">
                Day
                <select
                  className="sm-testselect"
                  value={dayOverride == null ? "" : String(dayOverride)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDayOverride(v === "" ? null : Number(v));
                    startNewRound();
                  }}
                >
                  <option value="">Auto (today)</option>
                  <option value="1">Monday</option>
                  <option value="2">Tuesday</option>
                  <option value="3">Wednesday</option>
                  <option value="4">Thursday</option>
                  <option value="5">Friday</option>
                  <option value="6">Saturday</option>
                  <option value="0">Sunday</option>
                </select>
              </label>
            </div>
            <button type="button" className="btn btn-ghost sm-testbtn" onClick={startNewRound}>
              New round
            </button>
          </div>
        )}
        <div className="sm-header-row">
          <div className="sm-wordmark">
            <span className="word-stat">STAT</span>
            <span className="word-twin sm-wordmatch">MATCH</span>
          </div>
          <div className="sm-issue">
            <div className="sm-issue-k">DAILY</div>
            <div className="sm-issue-no">№ {puzzleNo}</div>
            <div className="sm-issue-d">{fmtDateHeader}</div>
          </div>
        </div>
      </header>

      <main className="sm-main">
        {phase === "play" && (
          <>
            <section className="sm-card sm-mystery-card">
              <div className="sm-mystery-top">
                <MysteryPortrait size={180} />
                <div className="sm-mystery-meta">
                  <div className="sm-mystery-eyebrow">MYSTERY PLAYER</div>
                  <div className="sm-mystery-season">{target.s} season</div>
                  <p className="sm-mystery-hint">Guess the player from the stat line. Six tries.</p>
                </div>
              </div>
              <StatLine row={target} compact />
              <ClueStrip target={target} cluesRevealed={cluesRevealed} />
              <GuessDots used={guessesUsed} max={MAX_GUESSES} />
              <div className="sm-search-wrap">
                <input
                  className="sm-search"
                  type="text"
                  autoComplete="off"
                  placeholder="Type a player name…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && suggestions[0]) submitGuess(suggestions[0]);
                  }}
                />
                {suggestions.length > 0 && (
                  <ul className="sm-suggest">
                    {suggestions.map((n) => (
                      <li key={n}>
                        <button type="button" className="sm-suggest-btn" onClick={() => submitGuess(n)}>
                          {n}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <GuessFeedbackTable seasons={seasons} guesses={guesses} target={target} />
            </section>
          </>
        )}

        {phase === "result" && (
          <section className="sm-result">
            <div
              className={`sm-flip ${cardFlipped ? "sm-flip-on" : ""}`}
              onClick={() => setCardFlipped((f) => !f)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setCardFlipped((f) => !f);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="Flip card"
            >
              <div className="sm-flip-inner">
                <div className="sm-flip-face sm-flip-front" ref={cardFrontRef}>
                  <div className="sm-tcard">
                    <div className="sm-tcard-portrait">
                      <Portrait row={target} size={200} />
                    </div>
                    <div className="sm-tcard-body">
                      <div className="sm-tcard-name">{target.n}</div>
                      <div className="sm-tcard-meta">
                        {target.s} · {target.team_full || target.t}
                      </div>
                      <StatLine row={target} compact />
                    </div>
                  </div>
                  <div className="sm-taphint">Tap to flip</div>
                </div>
                <div className="sm-flip-face sm-flip-back">
                  <div className="sm-back-h">
                    {won ? `Solved in ${guesses.length} guesses` : "Did not solve"}
                  </div>
                  <div className="sm-back-grid" aria-label="Guess results">
                    {guesses.map((g, i) => (
                      <div key={i} className="sm-back-row">
                        <span>{normalizeGuess(g) === normalizeGuess(target.n) ? "✓" : "✗"}</span>
                        <span>{g}</span>
                      </div>
                    ))}
                  </div>
                  <div className="sm-emoji-row" aria-hidden>
                    {guesses.map((g, i) => (
                      <span key={i}>{normalizeGuess(g) === normalizeGuess(target.n) ? "🟩" : "🟥"}</span>
                    ))}
                  </div>
                  <div className="sm-stats-mini">
                    <div>Streak {stats.streak}</div>
                    <div>Best {stats.maxStreak}</div>
                    <div>
                      Played {stats.totalPlayed} · Wins {stats.totalWins}
                    </div>
                  </div>
                  <div className="sm-dist">
                    {Object.entries(stats.distribution).map(([k, v]) => (
                      <div key={k}>
                        {k}/6: {v}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="sm-share-row">
              <button type="button" className="btn btn-primary sm-share-btn" onClick={copyShare}>
                Copy result
              </button>
              <button type="button" className="btn btn-ghost sm-share-btn" onClick={nativeShare}>
                Share…
              </button>
              <button type="button" className="btn btn-ghost sm-share-btn" onClick={saveCardPng}>
                Save card
              </button>
            </div>
            <p className="sm-next">Next puzzle after midnight UTC ({nextUtcMidnightLabel(dateKey).slice(0, 16)}Z).</p>
            <p className="sm-cross">
              <a href="/explore">Try the explorer →</a>
            </p>
          </section>
        )}
      </main>

      <footer className="colophon sm-footer">
        <span>STAT MATCH · (HIDDEN)</span>
        <span className="dot">·</span>
        <a
          href="https://www.linkedin.com/in/jake-cohen-b564764b/"
          target="_blank"
          rel="noreferrer"
          className="credit-link"
        >
          BUILT BY COHEN
        </a>
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<StatMatchApp />);
