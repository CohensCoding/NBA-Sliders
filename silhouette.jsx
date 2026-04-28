/* global React */
// Abstract editorial line-art basketball figures.
// No fills on the body — single-weight ink strokes only. Think magazine
// illustration: open-circle head, clean stick-figure body, ball drawn as
// a simple line circle, jersey number rendered as a typographic element
// floating beside the figure rather than printed on a torso.
//
// Exposes window.SilhouettePortrait (kept name for compatibility).

(function () {
  const INK = "#1a1815";
  const STROKE_W = 2.25;
  const HEAD_R = 9;

  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function lumOf(c1) {
    const [r, g, b] = hexToRgb(c1);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  // ─── Stroke primitive ───
  function S({ d, w = STROKE_W }) {
    return (
      <path
        d={d}
        stroke={INK}
        strokeWidth={w}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  // ─── Jersey: flat color block on the torso, bounded by ink strokes ───
  // Drawn as a single closed shape so the body silhouette stays consistent
  // with the line-art language. The number is rendered on top in a contrasting
  // ink. shoulderL/R are the shoulder endpoints; hipL/R are the hip endpoints.
  function Jersey({ shoulderL, shoulderR, hipL, hipR, c1, c2, num }) {
    const txt = lumOf(c1) > 0.6 ? "#1a1a1a" : "#f5efe0";
    const cx = (shoulderL.x + shoulderR.x) / 2;
    const cy = (shoulderL.y + hipL.y) / 2 + 4;
    const numStr = String(num);
    // Tank-top neckline: small dip in the middle of the shoulder line
    const necklineDrop = 5;
    const neckMidL = { x: cx - 5, y: shoulderL.y + necklineDrop };
    const neckMidR = { x: cx + 5, y: shoulderR.y + necklineDrop };
    const d = `
      M ${shoulderL.x} ${shoulderL.y}
      L ${neckMidL.x} ${neckMidL.y}
      L ${neckMidR.x} ${neckMidR.y}
      L ${shoulderR.x} ${shoulderR.y}
      L ${hipR.x} ${hipR.y}
      L ${hipL.x} ${hipL.y} Z`;
    return (
      <g>
        {/* fill */}
        <path d={d} fill={c1} />
        {/* hem accent stripe */}
        <path
          d={`M ${hipL.x} ${hipL.y - 3} L ${hipR.x} ${hipR.y - 3} L ${hipR.x} ${hipR.y} L ${hipL.x} ${hipL.y} Z`}
          fill={c2}
        />
        {/* ink outline (matches body line weight) */}
        <path d={d} fill="none" stroke={INK} strokeWidth={STROKE_W} strokeLinejoin="round" />
        {/* number */}
        <text
          x={cx}
          y={cy + 3}
          textAnchor="middle"
          fontFamily="'Playfair Display', serif"
          fontWeight="900"
          fontSize={numStr.length > 1 ? 18 : 22}
          fill={txt}
          style={{ letterSpacing: "-0.04em" }}
        >
          {numStr}
        </text>
      </g>
    );
  }

  // ─── Open-circle head with thin neck stroke ───
  function Head({ cx, cy, neckTo }) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={HEAD_R} stroke={INK} strokeWidth={STROKE_W} fill="none" />
        {neckTo && <S d={`M ${cx} ${cy + HEAD_R} L ${neckTo.x} ${neckTo.y}`} />}
      </g>
    );
  }

  // ─── Ball: just an outline circle with two seam curves ───
  function Ball({ cx, cy, r = 9 }) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} stroke={INK} strokeWidth={STROKE_W} fill="none" />
        <path
          d={`M ${cx - r} ${cy} L ${cx + r} ${cy}
              M ${cx - r * 0.7} ${cy - r * 0.7} Q ${cx} ${cy} ${cx - r * 0.7} ${cy + r * 0.7}`}
          stroke={INK}
          strokeWidth={STROKE_W * 0.7}
          fill="none"
          strokeLinecap="round"
        />
      </g>
    );
  }

  // ─── Pose 1: Jump shot ───
  function PoseShoot({ c1, c2, num }) {
    return (
      <g>
        <Head cx={100} cy={56} neckTo={{ x: 100, y: 72 }} />
        {/* shooting arm up & extended */}
        <S d="M 116 80 L 132 60 L 142 38" />
        {/* guide arm bent */}
        <S d="M 84 80 L 70 70 L 78 54" />
        {/* legs */}
        <S d="M 88 128 L 80 168 L 76 196" />
        <S d="M 112 128 L 118 168 L 124 196" />
        {/* jersey covers spine + shoulders + hips */}
        <Jersey
          shoulderL={{ x: 84, y: 80 }}
          shoulderR={{ x: 116, y: 80 }}
          hipL={{ x: 88, y: 128 }}
          hipR={{ x: 112, y: 128 }}
          c1={c1} c2={c2} num={num}
        />
        {/* ball at release */}
        <Ball cx={148} cy={30} r={9} />
      </g>
    );
  }

  // ─── Pose 2: Dunk (airborne, both arms up) ───
  function PoseDunk({ c1, c2, num }) {
    return (
      <g>
        <Head cx={100} cy={48} neckTo={{ x: 100, y: 64 }} />
        {/* both arms straight up */}
        <S d="M 84 72 L 80 40 L 78 14" />
        <S d="M 116 72 L 120 40 L 122 14" />
        {/* tucked legs (mid-air) */}
        <S d="M 88 120 L 80 152 L 92 178" />
        <S d="M 112 120 L 124 152 L 112 184" />
        <Jersey
          shoulderL={{ x: 84, y: 72 }}
          shoulderR={{ x: 116, y: 72 }}
          hipL={{ x: 88, y: 120 }}
          hipR={{ x: 112, y: 120 }}
          c1={c1} c2={c2} num={num}
        />
        {/* ball at top */}
        <Ball cx={100} cy={10} r={10} />
        {/* implied rim line */}
        <S d="M 145 14 L 195 14" w={1.5} />
      </g>
    );
  }

  // ─── Pose 3: Driving / dribbling ───
  function PoseDrive({ c1, c2, num }) {
    return (
      <g>
        <Head cx={94} cy={56} neckTo={{ x: 96, y: 72 }} />
        {/* off-arm extended forward */}
        <S d="M 80 80 L 56 92 L 38 90" />
        {/* dribble arm down */}
        <S d="M 116 78 L 138 110 L 154 138" />
        {/* stride legs */}
        <S d="M 90 130 L 76 168 L 64 196" />
        <S d="M 114 130 L 132 162 L 148 192" />
        <Jersey
          shoulderL={{ x: 80, y: 80 }}
          shoulderR={{ x: 116, y: 78 }}
          hipL={{ x: 90, y: 130 }}
          hipR={{ x: 114, y: 130 }}
          c1={c1} c2={c2} num={num}
        />
        {/* ball mid-bounce */}
        <Ball cx={158} cy={150} r={9} />
        <S d="M 158 165 Q 158 175 158 184" w={1.2} />
        <ellipse cx="158" cy="190" rx="6" ry="1.5" fill="rgba(0,0,0,0.20)" />
      </g>
    );
  }

  // ─── Pose 4: Chest pass ───
  function PosePass({ c1, c2, num }) {
    return (
      <g>
        <Head cx={100} cy={56} neckTo={{ x: 100, y: 72 }} />
        {/* both arms forward to the left, like releasing a pass */}
        <S d="M 84 80 L 64 100 L 44 110" />
        <S d="M 116 80 L 124 100 L 134 110" />
        {/* planted legs */}
        <S d="M 88 130 L 82 170 L 78 196" />
        <S d="M 112 130 L 118 170 L 122 196" />
        <Jersey
          shoulderL={{ x: 84, y: 80 }}
          shoulderR={{ x: 116, y: 80 }}
          hipL={{ x: 88, y: 130 }}
          hipR={{ x: 112, y: 130 }}
          c1={c1} c2={c2} num={num}
        />
        {/* ball leaving hands */}
        <Ball cx={30} cy={114} r={9} />
        <S d="M 56 110 L 50 110" w={1.5} />
        <S d="M 60 104 L 54 104" w={1.5} />
        <S d="M 60 116 L 54 116" w={1.5} />
      </g>
    );
  }

  // ─── Pose 5: Defensive stance ───
  function PoseDefense({ c1, c2, num }) {
    return (
      <g>
        <Head cx={100} cy={58} neckTo={{ x: 100, y: 74 }} />
        {/* arms wide */}
        <S d="M 82 82 L 50 92 L 24 100" />
        <S d="M 118 82 L 150 92 L 176 100" />
        {/* wide bent legs */}
        <S d="M 86 124 L 64 162 L 50 196" />
        <S d="M 114 124 L 136 162 L 150 196" />
        <Jersey
          shoulderL={{ x: 82, y: 82 }}
          shoulderR={{ x: 118, y: 82 }}
          hipL={{ x: 86, y: 124 }}
          hipR={{ x: 114, y: 124 }}
          c1={c1} c2={c2} num={num}
        />
      </g>
    );
  }

  // ─── Pose 6: Layup ───
  function PoseLayup({ c1, c2, num }) {
    return (
      <g>
        <Head cx={94} cy={50} neckTo={{ x: 98, y: 66 }} />
        {/* lead arm reaching up & across */}
        <S d="M 118 74 L 142 48 L 168 28" />
        {/* trailing arm down */}
        <S d="M 80 76 L 60 100 L 42 116" />
        {/* scissored mid-air legs */}
        <S d="M 90 124 L 102 154 L 122 168" />
        <S d="M 114 124 L 96 158 L 76 174" />
        <Jersey
          shoulderL={{ x: 80, y: 76 }}
          shoulderR={{ x: 118, y: 74 }}
          hipL={{ x: 90, y: 124 }}
          hipR={{ x: 114, y: 124 }}
          c1={c1} c2={c2} num={num}
        />
        {/* ball at fingertips */}
        <Ball cx={176} cy={22} r={9} />
        {/* implied backboard */}
        <S d="M 195 4 L 195 46" w={1.5} />
      </g>
    );
  }

  const POSES = [PoseShoot, PoseDunk, PoseDrive, PosePass, PoseDefense, PoseLayup];

  function SilhouettePortrait({ row, size = 320, paletteFor, jerseyNumFor, hashStr }) {
    if (!row) {
      return (
        <svg viewBox="0 0 200 250" style={{ width: size, height: size * 1.25 }}>
          <rect width="200" height="250" fill="#e8e2d4" />
          <text x="100" y="140" textAnchor="middle"
                fontFamily="'Playfair Display', serif" fontSize="72"
                fill="#bcb29c" fontWeight="900">?</text>
        </svg>
      );
    }
    const [c1, c2] = paletteFor(row);
    const num = jerseyNumFor(row);
    const safeKey = (row.n + row.s).replace(/\W/g, "");
    const Pose = POSES[hashStr(row.n + row.s) % POSES.length];
    const numStr = String(num);

    // Number color: the team's primary, but darken if it's too light against
    // the warm cream background.
    const numColor = lumOf(c1) > 0.7 ? c2 : c1;

    return (
      <svg
        viewBox="0 0 200 250"
        style={{ width: size, height: size * 1.25 }}
        aria-label={`${row.n}, ${row.s} ${row.t}`}
      >
        <defs>
          <linearGradient id={`bg-${safeKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f3ecdc" />
            <stop offset="60%" stopColor="#ece2cd" />
            <stop offset="100%" stopColor="#e2d6ba" />
          </linearGradient>
        </defs>

        <rect width="200" height="250" fill={`url(#bg-${safeKey})`} />

        {/* Oversized typographic number — editorial composition element */}
        <text
          x="174"
          y="158"
          textAnchor="end"
          fontFamily="'Playfair Display', serif"
          fontStyle="italic"
          fontWeight="900"
          fontSize="160"
          fill={numColor}
          opacity="0.16"
          style={{ letterSpacing: "-0.05em" }}
        >
          {numStr}
        </text>

        {/* horizon line */}
        <line x1="0" y1="200" x2="200" y2="200" stroke={INK} strokeWidth="0.75" opacity="0.4" />

        {/* the figure */}
        <Pose c1={c1} c2={c2} num={num} />

        {/* small numeral marker by the figure — printed as a thin label */}
        <g transform="translate(28,72)">
          <line x1="0" y1="0" x2="0" y2="22" stroke={numColor} strokeWidth="2" />
          <text
            x="6"
            y="10"
            fontFamily="'JetBrains Mono', monospace"
            fontSize="8"
            fill={INK}
            style={{ letterSpacing: "0.18em" }}
          >
            № {numStr}
          </text>
          <text
            x="6"
            y="20"
            fontFamily="'JetBrains Mono', monospace"
            fontSize="7"
            fill={INK}
            opacity="0.55"
            style={{ letterSpacing: "0.18em" }}
          >
            {row.t.toUpperCase()}
          </text>
        </g>

        {/* caption strip */}
        <rect x="0" y="230" width="200" height="20" fill="#1a1a1a" />
        <text x="10" y="244" fontFamily="'JetBrains Mono', monospace" fontSize="9"
              fill="#f5efe0" style={{ letterSpacing: "0.18em" }}>
          № {numStr} · {row.s}
        </text>
        <text x="190" y="244" textAnchor="end" fontFamily="'JetBrains Mono', monospace"
              fontSize="9" fill={c2} style={{ letterSpacing: "0.18em" }}>
          {row.t.toUpperCase()}
        </text>
      </svg>
    );
  }

  window.SilhouettePortrait = SilhouettePortrait;
})();
