// Stat-twin matching: z-score normalized weighted Euclidean distance.
(function () {
  const STATS = ["ppg", "rpg", "apg", "spg", "bpg"];

  function computeNormalization(seasons) {
    const stats = {};
    for (const k of STATS) {
      const vals = seasons.map((s) => s[k]);
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const variance =
        vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
      const std = Math.sqrt(variance) || 1;
      stats[k] = { mean, std };
    }
    return stats;
  }

  function zVec(row, norm, keys) {
    return keys.map((k) => (row[k] - norm[k].mean) / norm[k].std);
  }

  // Default per-stat weights (PPG/RPG/APG slightly heavier than steals/blocks)
  const DEFAULT_WEIGHTS = { ppg: 1.2, rpg: 1.1, apg: 1.1, spg: 0.9, bpg: 0.9 };

  function findMatches(query, seasons, norm, opts = {}) {
    const enabled = opts.enabled || STATS;
    const weights = opts.weights || DEFAULT_WEIGHTS;
    const limit = opts.limit || 5;

    const qz = enabled.map(
      (k) => (query[k] - norm[k].mean) / norm[k].std
    );

    const scored = seasons.map((row) => {
      let d2 = 0;
      enabled.forEach((k, i) => {
        const rz = (row[k] - norm[k].mean) / norm[k].std;
        const w = weights[k] || 1;
        d2 += w * (rz - qz[i]) ** 2;
      });
      const dist = Math.sqrt(d2);
      // Tuned scaling: distance ~0 -> 100%, distance ~3 -> ~50%
      const match = Math.max(0, Math.min(100, 100 - dist * 16.5));
      return { row, dist, match };
    });

    scored.sort((a, b) => a.dist - b.dist);
    return scored.slice(0, limit);
  }

  // Reasonable slider ranges based on dataset extremes + headroom
  const RANGES = {
    ppg: { min: 0, max: 38, step: 0.1, label: "PPG", full: "Points / game" },
    rpg: { min: 0, max: 16, step: 0.1, label: "RPG", full: "Rebounds / game" },
    apg: { min: 0, max: 15, step: 0.1, label: "APG", full: "Assists / game" },
    spg: { min: 0, max: 3.2, step: 0.1, label: "SPG", full: "Steals / game" },
    bpg: { min: 0, max: 4.2, step: 0.1, label: "BPG", full: "Blocks / game" },
  };

  window.MATCH = {
    STATS,
    RANGES,
    DEFAULT_WEIGHTS,
    computeNormalization,
    findMatches,
  };
})();
