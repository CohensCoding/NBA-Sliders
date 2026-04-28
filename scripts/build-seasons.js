import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse";

/**
 * Build `data/seasons.js` (window.SEASONS = [...]) from the raw game-level CSV.
 *
 * Input:  ../PlayerStatistics.csv, ../Players.csv
 * Output: data/seasons.js
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const DATA_DIR = path.resolve(REPO_ROOT, "..");
const INPUT = path.resolve(DATA_DIR, "PlayerStatistics.csv");
const PLAYERS_INPUT = path.resolve(DATA_DIR, "Players.csv");
const OUTPUT = path.resolve(REPO_ROOT, "data", "seasons.js");
const MIN_SEASON_START_YEAR = 1980;
const MIN_TOTAL_MINUTES = 300;

/** Modern franchise → conference / division (v1 approximation) */
const TEAM_GEO = {
  1610612737: { conference: "Eastern", division: "Southeast" }, // ATL
  1610612738: { conference: "Eastern", division: "Atlantic" }, // BOS
  1610612751: { conference: "Eastern", division: "Atlantic" }, // BKN
  1610612766: { conference: "Eastern", division: "Southeast" }, // CHA
  1610612741: { conference: "Eastern", division: "Central" }, // CHI
  1610612739: { conference: "Eastern", division: "Central" }, // CLE
  1610612742: { conference: "Western", division: "Southwest" }, // DAL
  1610612743: { conference: "Western", division: "Northwest" }, // DEN
  1610612765: { conference: "Eastern", division: "Central" }, // DET
  1610612744: { conference: "Western", division: "Pacific" }, // GSW
  1610612745: { conference: "Western", division: "Southwest" }, // HOU
  1610612754: { conference: "Eastern", division: "Central" }, // IND
  1610612746: { conference: "Western", division: "Pacific" }, // LAC
  1610612747: { conference: "Western", division: "Pacific" }, // LAL
  1610612763: { conference: "Western", division: "Southwest" }, // MEM
  1610612748: { conference: "Eastern", division: "Southeast" }, // MIA
  1610612749: { conference: "Eastern", division: "Central" }, // MIL
  1610612750: { conference: "Western", division: "Northwest" }, // MIN
  1610612740: { conference: "Western", division: "Southwest" }, // NOP
  1610612752: { conference: "Eastern", division: "Atlantic" }, // NYK
  1610612760: { conference: "Western", division: "Northwest" }, // OKC
  1610612753: { conference: "Eastern", division: "Southeast" }, // ORL
  1610612755: { conference: "Eastern", division: "Atlantic" }, // PHI
  1610612756: { conference: "Western", division: "Pacific" }, // PHX
  1610612757: { conference: "Western", division: "Northwest" }, // POR
  1610612758: { conference: "Western", division: "Pacific" }, // SAC
  1610612759: { conference: "Western", division: "Southwest" }, // SAS
  1610612761: { conference: "Eastern", division: "Atlantic" }, // TOR
  1610612762: { conference: "Western", division: "Northwest" }, // UTA
  1610612764: { conference: "Eastern", division: "Southeast" }, // WAS
};

function seasonLabelFromGameDate(dateStr) {
  const d = new Date(dateStr.replace(" ", "T") + "Z");
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const startYear = m >= 10 ? y : y - 1;
  const endYear2 = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYear2}`;
}

function seasonStartYear(seasonLabel) {
  const y = Number(String(seasonLabel).slice(0, 4));
  return Number.isFinite(y) ? y : NaN;
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

function heightFromInches(inches) {
  const n = Number(inches);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ft = Math.floor(n / 12);
  const inch = Math.round(n - ft * 12);
  return `${ft}'${inch}\"`;
}

function positionFromFlags(guard, forward, center) {
  const g = num(guard) > 0;
  const f = num(forward) > 0;
  const c = num(center) > 0;
  if (c && !g && !f) return "C";
  if (g && !f && !c) return "PG";
  if (g && f && !c) return "SG";
  if (f && !g && !c) return "PF";
  if (g && f && c) return "SF";
  if (f && c) return "PF";
  if (g && c) return "SG";
  if (f) return "SF";
  if (g) return "PG";
  return null;
}

/** Approximate tier from season box stats only (v1). */
function tierForSeason({ ppg, mpg, gp, totMin }) {
  if (ppg >= 26 && mpg >= 32 && gp >= 55) return "AllNBA";
  if (ppg >= 22 && mpg >= 30 && gp >= 50) return "AllStar";
  if (gp >= 58 && mpg >= 26) return "Starter";
  if (mpg >= 18 && gp >= 40) return "Rotation";
  if (totMin >= 1000) return "Qualifier";
  return "DeepCut";
}

function geoForTeamId(teamId) {
  const id = String(teamId || "").trim();
  return TEAM_GEO[id] || { conference: null, division: null };
}

async function loadPlayersByPersonId() {
  const map = new Map();
  if (!fs.existsSync(PLAYERS_INPUT)) {
    console.warn(`Players.csv not found at ${PLAYERS_INPUT}; height/position will be null.`);
    return map;
  }
  const parser = parse({
    columns: true,
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
  });
  const stream = fs.createReadStream(PLAYERS_INPUT);
  stream.pipe(parser);
  for await (const row of parser) {
    const pid = String(row.personId || "").trim();
    if (!pid) continue;
    map.set(pid, {
      heightInches: row.heightInches,
      guard: row.guard,
      forward: row.forward,
      center: row.center,
    });
  }
  console.log(`Loaded ${map.size.toLocaleString()} player bios from Players.csv`);
  return map;
}

function writeSeasonsFile(rows) {
  const lines = [];
  lines.push("// Auto-generated from ../PlayerStatistics.csv + ../Players.csv");
  lines.push("// Do not edit by hand — run `npm run build:seasons` instead.");
  lines.push("window.SEASONS = [");

  for (const r of rows) {
    const h = r.height == null ? "null" : JSON.stringify(r.height);
    const pos = r.position == null ? "null" : JSON.stringify(r.position);
    const conf = r.conference == null ? "null" : JSON.stringify(r.conference);
    const div = r.division == null ? "null" : JSON.stringify(r.division);
    lines.push(
      `  { n: ${JSON.stringify(r.n)}, s: ${JSON.stringify(r.s)}, t: ${JSON.stringify(r.t)}, ppg: ${r.ppg}, rpg: ${r.rpg}, apg: ${r.apg}, spg: ${r.spg}, bpg: ${r.bpg}, fg: ${r.fg}, tp: ${r.tp}, ft: ${r.ft}, mpg: ${r.mpg}, gp: ${r.gp}, pid: ${JSON.stringify(r.pid)}, team_full: ${JSON.stringify(r.team_full)}, conference: ${conf}, division: ${div}, height: ${h}, position: ${pos}, tier: ${JSON.stringify(r.tier)}, totMin: ${r.totMin} },`
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

  const playersByPid = await loadPlayersByPersonId();

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

    const gameDate = row.gameDate || row.gameDateTimeEst;
    if (!gameDate) continue;

    const fn = (row.firstName || "").trim();
    const ln = (row.lastName || "").trim();
    const name = `${fn} ${ln}`.trim();
    if (!name) continue;

    const teamCity = (row.playerteamCity || "").trim();
    if (!teamCity) continue;

    const teamName = (row.playerteamName || "").trim();
    const teamId = String(row.playerteamId || "").trim();
    const pid = String(row.personId || "").trim();

    const gameId = (row.gameId || "").trim();
    if (!gameId) continue;

    const minutes = num(row.numMinutes);
    if (minutes <= 0) continue;

    const season = seasonLabelFromGameDate(gameDate);
    if (seasonStartYear(season) < MIN_SEASON_START_YEAR) continue;

    const key = `${name}||${season}||${teamCity}`;
    let agg = byKey.get(key);
    if (!agg) {
      agg = {
        n: name,
        s: season,
        t: teamCity,
        teamName,
        teamId,
        personId: pid,
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

    if (!agg.games.has(gameId)) agg.games.add(gameId);
    if (pid && !agg.personId) agg.personId = pid;
    if (teamId && !agg.teamId) agg.teamId = teamId;
    if (teamName && !agg.teamName) agg.teamName = teamName;

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
    if (agg.min < MIN_TOTAL_MINUTES) continue;

    const ppg = toFixed1(agg.pts / gp);
    const mpg = toFixed1(agg.min / gp);
    const totMin = Math.round(agg.min);

    const bio = agg.personId ? playersByPid.get(String(agg.personId)) : null;
    const height = bio ? heightFromInches(bio.heightInches) : null;
    const position = bio
      ? positionFromFlags(bio.guard, bio.forward, bio.center)
      : null;

    const teamCity = agg.t;
    const teamName = agg.teamName || "";
    const team_full = `${teamCity} ${teamName}`.trim();
    const geo = geoForTeamId(agg.teamId);
    const tier = tierForSeason({ ppg, mpg, gp, totMin });

    seasons.push({
      n: agg.n,
      s: agg.s,
      t: teamCity,
      ppg,
      rpg: toFixed1(agg.reb / gp),
      apg: toFixed1(agg.ast / gp),
      spg: toFixed1(agg.stl / gp),
      bpg: toFixed1(agg.blk / gp),
      fg: Number(pct(agg.fgm, agg.fga).toFixed(3)),
      tp: Number(pct(agg.tpm, agg.tpa).toFixed(3)),
      ft: Number(pct(agg.ftm, agg.fta).toFixed(3)),
      mpg,
      gp,
      pid: agg.personId || "",
      team_full,
      conference: geo.conference,
      division: geo.division,
      height,
      position,
      tier,
      totMin,
    });
  }

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
