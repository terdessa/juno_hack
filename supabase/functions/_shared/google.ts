/**
 * Google Calendar, reached with a stored refresh token.
 *
 * A refresh token rather than a service account because this points at one
 * doctor's ordinary Google account. Service accounts can only act for a user
 * through domain-wide delegation, which needs a Workspace admin and a verified
 * domain — neither of which a GP with a personal calendar has. The doctor
 * consents once, we keep the refresh token, and it works from then on.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

/** Access tokens last an hour; this instance may handle several syncs. */
let cachedToken: { value: string; expiresAt: number } | null = null;

export interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email?: string; displayName?: string }[];
}

async function accessToken(): Promise<string> {
  // A minute of headroom: a token that expires mid-request is a failed sync.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: requireEnv("GOOGLE_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    // The common causes are worth naming: the token is revoked when the
    // consent is withdrawn, or when a test-mode OAuth app expires it after a
    // week. Both look identical in a log line otherwise.
    throw new Error(
      `Google refused the refresh token (${response.status}): ${raw.slice(0, 200)}. ` +
        "Re-run scripts/google-auth.ts and update GOOGLE_REFRESH_TOKEN.",
    );
  }

  const body = JSON.parse(raw) as { access_token: string; expires_in: number };
  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  return body.access_token;
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  return fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

export function calendarId(): string {
  return Deno.env.get("GOOGLE_CALENDAR_ID") ?? "primary";
}

export interface ListResult {
  events: GoogleEvent[];
  nextSyncToken: string | null;
  /** Google invalidated the token; the caller must resync from scratch. */
  expired: boolean;
}

/**
 * Everything that changed since last time.
 *
 * With a syncToken Google returns only the difference, including deletions as
 * events with status "cancelled". Without one it returns a window — here, from
 * a month ago — which is what the first run and any recovery does.
 */
export async function listEvents(syncToken: string | null): Promise<ListResult> {
  const params = new URLSearchParams({ singleEvents: "true", maxResults: "250" });
  if (syncToken) {
    params.set("syncToken", syncToken);
  } else {
    const from = new Date();
    from.setMonth(from.getMonth() - 1);
    params.set("timeMin", from.toISOString());
  }

  const response = await call(
    `/calendars/${encodeURIComponent(calendarId())}/events?${params}`,
  );

  if (response.status === 410) {
    // "Gone": the token is too old. Not an error — start again without one.
    return { events: [], nextSyncToken: null, expired: true };
  }
  if (!response.ok) {
    throw new Error(`Google list failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
  }

  const body = (await response.json()) as {
    items?: GoogleEvent[];
    nextSyncToken?: string;
  };
  return {
    events: body.items ?? [],
    nextSyncToken: body.nextSyncToken ?? null,
    expired: false,
  };
}

export interface NewEvent {
  summary: string;
  description?: string;
  startAt: string;
  endAt: string;
  attendeeEmail?: string | null;
}

/** Puts an appointment on the doctor's Google Calendar. Returns its event id. */
export async function createEvent(event: NewEvent): Promise<string> {
  const response = await call(`/calendars/${encodeURIComponent(calendarId())}/events`, {
    method: "POST",
    body: JSON.stringify({
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.startAt },
      end: { dateTime: event.endAt },
      // Deliberately not inviting the patient by default: a calendar invite to
      // someone's inbox is a message from the practice, and sending one is the
      // doctor's decision rather than a side effect of a phone call.
      ...(event.attendeeEmail ? { attendees: [{ email: event.attendeeEmail }] } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Google refused the event (${response.status}): ${(await response.text()).slice(0, 200)}`,
    );
  }
  const body = (await response.json()) as { id: string };
  return body.id;
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
