/**
 * Snapshot and restore the ElevenLabs agent's configuration.
 *
 *   node scripts/elevenlabs-agent.mjs save              -> writes a snapshot, prints its path
 *   node scripts/elevenlabs-agent.mjs restore <file>    -> puts that snapshot back
 *   node scripts/elevenlabs-agent.mjs show              -> the settings we tune, current values
 *
 * Needs ELEVENLABS_API_KEY in the environment or in .env at the repo root.
 *
 * Exists because the voice settings are the kind of thing you change by ear:
 * three of them are matters of taste, and "put it back how it was" has to be
 * one command rather than a memory of five numbers. Snapshots are written
 * outside the repo — the agent config carries the creator's email address, and
 * that does not belong in a git history.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const AGENT = "agent_9601kycv0rkme9ya9wtxt5dkqspg";
const API = `https://api.elevenlabs.io/v1/convai/agents/${AGENT}`;
const DIR = path.join(os.tmpdir(), "medley-elevenlabs");

/** The settings worth watching. Everything else is left exactly as found. */
const WATCHED = [
  ["temperature", (c) => c.agent.prompt.temperature],
  ["tts.stability", (c) => c.tts.stability],
  ["turn.turn_timeout", (c) => c.turn.turn_timeout],
  ["soft timeout secs", (c) => c.turn.soft_timeout_config.timeout_seconds],
  ["llm-generated filler", (c) => c.turn.soft_timeout_config.use_llm_generated_message],
  ["randomize fillers", (c) => c.turn.soft_timeout_config.randomize_fillers],
  ["tool_ids", (c) => JSON.stringify(c.agent.prompt.tool_ids)],
  ["prompt chars", (c) => c.agent.prompt.prompt.length],
];

function key() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  const env = path.join(process.cwd(), ".env");
  if (fs.existsSync(env)) {
    const line = fs
      .readFileSync(env, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("ELEVENLABS_API_KEY="));
    if (line) return line.slice("ELEVENLABS_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  }
  console.error("No ELEVENLABS_API_KEY — set it in the environment or in .env at the repo root.");
  process.exit(1);
}

async function fetchConfig(k) {
  const res = await fetch(API, { headers: { "xi-api-key": k } });
  if (!res.ok) throw new Error(`GET failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

function report(cfg) {
  const c = cfg.conversation_config;
  for (const [label, read] of WATCHED) {
    console.log(`  ${label.padEnd(22)} ${read(c)}`);
  }
}

const [, , command, arg] = process.argv;
const k = key();

if (command === "save") {
  const cfg = await fetchConfig(k);
  fs.mkdirSync(DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(DIR, `agent-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  console.log("Saved:", file);
  report(cfg);
} else if (command === "show") {
  report(await fetchConfig(k));
} else if (command === "restore") {
  if (!arg || !fs.existsSync(arg)) {
    console.error("Point me at a snapshot file. `save` prints the path it wrote.");
    console.error(fs.existsSync(DIR) ? `Snapshots in ${DIR}:` : "No snapshots yet.");
    if (fs.existsSync(DIR)) for (const f of fs.readdirSync(DIR)) console.error("  " + f);
    process.exit(1);
  }
  const saved = JSON.parse(fs.readFileSync(arg, "utf8"));
  // Only the tunable half goes back. Replaying the whole document would also
  // rewrite phone numbers, webhooks and the widget, none of which this touched.
  const c = saved.conversation_config;
  const body = {
    conversation_config: {
      agent: {
        prompt: {
          prompt: c.agent.prompt.prompt,
          temperature: c.agent.prompt.temperature,
          tool_ids: c.agent.prompt.tool_ids,
        },
      },
      turn: {
        turn_timeout: c.turn.turn_timeout,
        soft_timeout_config: c.turn.soft_timeout_config,
      },
      tts: { stability: c.tts.stability },
    },
  };
  const res = await fetch(API, {
    method: "PATCH",
    headers: { "xi-api-key": k, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  console.log("Restored from", arg);
  report(await res.json());
} else {
  console.log("Usage: node scripts/elevenlabs-agent.mjs <save|show|restore <file>>");
  process.exit(1);
}
