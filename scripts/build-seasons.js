import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse";

/**
 * Build `data/seasons.js` (window.SEASONS = [...]) from the raw game-level CSV.
 *
 * Input:  ../PlayerStatistics.csv  (relative to this repo root)
 * Output: data/seasons.js
 *
 * Aggregation:
 * - group by (player full name, derived season label, team city)
 * - gp counts unique gameId
 * - ppg/rpg/apg/spg/bpg, mpg computed per-game
 * - fg/tp/ft computed as made/attempted
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const INPUT = path.resolve(REPO_ROOT, "..", "PlayerStatistics.csv");
const OUTPUT = path.resolve(REPO_ROOT, "data", "seasons.js");

function seasonLabelFromGameDate(dateStr) {
  // `gameDate` in this dataset looks like "2026-04-26 21:30:00"
  // NBA seasons start in Oct; Oct-Dec belong to season starting that calendar year.
  // Jan-Jun belong to season starting previous year.
  const d = new Date(dateStr.replace(" ", "T") + "Z");
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const startYear = m >= 10 ? y : y - 1;
  const endYear2 = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYear2}`;
}

function num(v) {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function pct(made, att) {
  return att > 0 ? clamp01(made / att) : 0;
}

function toFixed1(n) {
  return Math.round(n * 10) / 10;
}

function writeSeasonsFile(rows) {
  const lines = [];
  lines.push("// Auto-generated from ../PlayerStatistics.csv");
  lines.push("// Do not edit by hand — run `npm run build:seasons` instead.");
  lines.push("window.SEASONS = [");

  for (const r of rows) {
    // Use stable key order for diffs
    lines.push(
      `  { n: ${JSON.stringify(r.n)}, s: ${JSON.stringify(r.s)}, t: ${JSON.stringify(r.t)}, ppg: ${r.ppg}, rpg: ${r.rpg}, apg: ${r.apg}, spg: ${r.spg}, bpg: ${r.bpg}, fg: ${r.fg}, tp: ${r.tp}, ft: ${r.ft}, mpg: ${r.mpg}, gp: ${r.gp} },`
    );
  }

  lines.push("];");
  lines.push("");

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, lines.join("\n"), "utf8");
}

async function main() {
  if (!fs.existsSync(INPUT)) {
    console.error(`Missing input CSV at: ${INPUT}`);
    process.exit(1);
  }

  const byKey = new Map();
  let rowsSeen = 0;
  let rowsUsed = 0;

  const parser = parse({
    columns: true,
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
  });

  const stream = fs.createReadStream(INPUT);
  stream.pipe(parser);

  const progressTimer = setInterval(() => {
    console.log(
      `…read ${rowsSeen.toLocaleString()} rows, aggregated ${byKey.size.toLocaleString()} player-seasons`
    );
  }, 2000);

  for await (const row of parser) {
    rowsSeen++;

    // Skip records without a sensible date or minutes
    const gameDate = row.gameDate || row.gameDateTimeEst;
    if (!gameDate) continue;

    const fn = (row.firstName || "").trim();
    const ln = (row.lastName || "").trim();
    const name = `${fn} ${ln}`.trim();
    if (!name) continue;

    const teamCity = (row.playerteamCity || "").trim();
    if (!teamCity) continue;

    const gameId = (row.gameId || "").trim();
    if (!gameId) continue;

    const minutes = num(row.numMinutes);
    // Filter out true DNP-like rows; still keep very small stints
    if (minutes <= 0) continue;

    const season = seasonLabelFromGameDate(gameDate);
    const key = `${name}||${season}||${teamCity}`;
    let agg = byKey.get(key);
    if (!agg) {
      agg = {
        n: name,
        s: season,
        t: teamCity,
        games: new Set(),
        pts: 0,
        ast: 0,
        reb: 0,
        stl: 0,
        blk: 0,
        min: 0,
        fgm: 0,
        fga: 0,
        tpm: 0,
        tpa: 0,
        ftm: 0,
        fta: 0,
      };
      byKey.set(key, agg);
    }

    // Count a game once per group
    if (!agg.games.has(gameId)) agg.games.add(gameId);

    agg.pts += num(row.points);
    agg.ast += num(row.assists);
    agg.reb += num(row.reboundsTotal);
    agg.stl += num(row.steals);
    agg.blk += num(row.blocks);
    agg.min += minutes;
    agg.fgm += num(row.fieldGoalsMade);
    agg.fga += num(row.fieldGoalsAttempted);
    agg.tpm += num(row.threePointersMade);
    agg.tpa += num(row.threePointersAttempted);
    agg.ftm += num(row.freeThrowsMade);
    agg.fta += num(row.freeThrowsAttempted);
    rowsUsed++;
  }

  clearInterval(progressTimer);
  console.log(
    `Finished reading ${rowsSeen.toLocaleString()} rows (used ${rowsUsed.toLocaleString()}).`
  );

  const seasons = [];
  for (const agg of byKey.values()) {
    const gp = agg.games.size;
    if (gp <= 0) continue;

    // Qualifier threshold: total season minutes (not MPG).
    // This keeps real rotation roles while filtering "cup of coffee" stints.
    if (agg.min < 500) continue;

    seasons.push({
      n: agg.n,
      s: agg.s,
      t: agg.t,
      ppg: toFixed1(agg.pts / gp),
      rpg: toFixed1(agg.reb / gp),
      apg: toFixed1(agg.ast / gp),
      spg: toFixed1(agg.stl / gp),
      bpg: toFixed1(agg.blk / gp),
      fg: Number(pct(agg.fgm, agg.fga).toFixed(3)),
      tp: Number(pct(agg.tpm, agg.tpa).toFixed(3)),
      ft: Number(pct(agg.ftm, agg.fta).toFixed(3)),
      mpg: toFixed1(agg.min / gp),
      gp,
    });
  }

  // Stable sort: newest seasons first, then name
  seasons.sort((a, b) => {
    if (a.s !== b.s) return a.s < b.s ? 1 : -1;
    return a.n.localeCompare(b.n);
  });

  console.log(`Writing ${seasons.length.toLocaleString()} player-seasons to ${OUTPUT}`);
  writeSeasonsFile(seasons);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

