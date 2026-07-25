/**
 * Turning a transcript into something a doctor can read in five seconds.
 *
 * The dashboard shows a summary, a mood, an answer per question asked, and a
 * few flags. All four come from one forced tool call so the model can't reply
 * with prose we'd then have to parse.
 *
 * Model choice: Haiku 4.5, same as the dashboard agent. This is extraction from
 * a short transcript rather than reasoning, and the doctor is watching the row
 * for the result — the speed is worth more here than Opus's judgement.
 */

import Anthropic from "npm:@anthropic-ai/sdk@0.114";

const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 2048;

export type Mood = "positive" | "neutral" | "low" | "distressed";
export type FollowUpType = "in-person" | "phone" | "none";

export const CALL_TAGS = [
  "depression-detected",
  "anxiety-detected",
  "safeguarding-concern",
  "reschedule-requested",
  "human-call-requested",
  "medication-issue",
  "no-answer",
] as const;
export type CallTag = (typeof CALL_TAGS)[number];

export interface Turn {
  role: "agent" | "patient";
  text: string;
}

export interface CallOutcome {
  summary: string;
  mood: Mood;
  answers: Record<string, string>;
  tags: CallTag[];
  follow_up_type: FollowUpType;
}

const OUTCOME_TOOL = {
  name: "record_call_outcome",
  description: "Record what the call established. Call this exactly once.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: {
        type: "string",
        description:
          "Two or three sentences a GP can read at a glance. Lead with anything " +
          "clinically actionable. Name the patient. No preamble.",
      },
      mood: {
        type: "string",
        enum: ["positive", "neutral", "low", "distressed"],
        description: "How the patient sounded overall, not how the call went.",
      },
      answers: {
        type: "object",
        description:
          "One entry per question that was asked, keyed by the question text " +
          "exactly as given. Value is the patient's answer in their own terms, " +
          "condensed. Use \"Not answered\" if they didn't answer it.",
        additionalProperties: { type: "string" },
      },
      tags: {
        type: "array",
        items: { type: "string", enum: [...CALL_TAGS] },
        description:
          "Only flags the transcript actually supports. Empty array is the " +
          "right answer for a routine call — do not reach for a flag.",
      },
      follow_up_type: {
        type: "string",
        enum: ["in-person", "phone", "none"],
        description:
          "What this patient needs next. 'none' unless the call gave a reason.",
      },
    },
    required: ["summary", "mood", "answers", "tags", "follow_up_type"],
  },
};

const SYSTEM = `You read transcripts of automated follow-up calls made on behalf of a GP
practice and record what they established.

You are writing for a busy GP who did not hear the call. Be specific and
concrete: "BP averaging 128/82, no cough" beats "reports good readings". Quote
numbers, doses and timeframes the patient gave.

Never infer a clinical finding the patient did not report, and never soften one
they did. If the patient said something concerning, it goes in the summary
first. If they were vague, say they were vague rather than filling the gap.

Flags are for things a human needs to see, not for describing the call. Apply
safeguarding-concern, depression-detected or anxiety-detected only on real
evidence in the patient's own words.`;

export async function extractOutcome(args: {
  apiKey: string;
  patientName: string;
  purpose: string;
  questions: string[];
  transcript: Turn[];
}): Promise<CallOutcome> {
  const anthropic = new Anthropic({ apiKey: args.apiKey });

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    tools: [OUTCOME_TOOL],
    // Forced: the only acceptable output is the structured record.
    tool_choice: { type: "tool", name: OUTCOME_TOOL.name },
    messages: [
      {
        role: "user",
        content: [
          `Patient: ${args.patientName}`,
          `Reason for the call: ${args.purpose}`,
          "",
          "Questions the agent was asked to put to them:",
          ...args.questions.map((q, i) => `${i + 1}. ${q}`),
          "",
          "Transcript:",
          ...args.transcript.map(
            (t) => `${t.role === "agent" ? "Agent" : args.patientName}: ${t.text}`,
          ),
        ].join("\n"),
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) throw new Error("Extraction returned no structured outcome.");

  return normalise(toolUse.input as Record<string, unknown>, args.questions);
}

/**
 * The model is forced into the schema but not into good manners: it can key
 * `answers` by a paraphrase of the question, which would leave the dashboard
 * pairing answers with nothing. Anything unrecognised is dropped rather than
 * shown against the wrong question.
 */
function normalise(raw: Record<string, unknown>, questions: string[]): CallOutcome {
  const answers: Record<string, string> = {};
  const given = raw.answers && typeof raw.answers === "object" ? raw.answers : {};
  for (const [key, value] of Object.entries(given as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    const match = questions.find((q) => q === key) ?? questions.find((q) => looselyEqual(q, key));
    if (match) answers[match] = value;
  }

  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is CallTag => CALL_TAGS.includes(t as CallTag))
    : [];

  return {
    summary: typeof raw.summary === "string" ? raw.summary : "No summary produced.",
    mood: isMood(raw.mood) ? raw.mood : "neutral",
    answers,
    tags,
    follow_up_type: isFollowUp(raw.follow_up_type) ? raw.follow_up_type : "none",
  };
}

function looselyEqual(a: string, b: string): boolean {
  const strip = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return strip(a) === strip(b);
}

function isMood(value: unknown): value is Mood {
  return value === "positive" || value === "neutral" || value === "low" || value === "distressed";
}

function isFollowUp(value: unknown): value is FollowUpType {
  return value === "in-person" || value === "phone" || value === "none";
}
