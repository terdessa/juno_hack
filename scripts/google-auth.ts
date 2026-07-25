/**
 * One-time Google consent, to get a refresh token.
 *
 *   deno run --allow-net --allow-env scripts/google-auth.ts
 *
 * Opens Google's consent screen, catches the redirect on localhost, and prints
 * the refresh token. It never leaves your machine — copy it straight into the
 * Supabase secret, not into a chat window or a file in this repo.
 *
 * The loopback redirect is deliberate: Google removed the copy-a-code-from-the-
 * browser flow, and a local listener is the only interactive option left that
 * doesn't need a deployed web app.
 */

const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const PORT = 8765;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/calendar";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first, e.g.\n" +
      "  GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... deno run --allow-net --allow-env scripts/google-auth.ts",
  );
  Deno.exit(1);
}

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPE,
    // Both are required to be given a refresh token at all: offline asks for
    // one, consent forces a fresh grant even if you have authorised before.
    access_type: "offline",
    prompt: "consent",
  });

console.log("\nOpen this in your browser and approve:\n");
console.log(authUrl);
console.log(`\nWaiting for the redirect on ${REDIRECT} …\n`);

const code = await new Promise<string>((resolve, reject) => {
  const server = Deno.serve({ port: PORT, onListen: () => {} }, (req) => {
    const received = new URL(req.url).searchParams.get("code");
    if (!received) {
      const error = new URL(req.url).searchParams.get("error");
      if (error) {
        reject(new Error(`Google returned: ${error}`));
        return new Response("Denied. You can close this tab.", { status: 400 });
      }
      return new Response("Waiting for the authorisation code…");
    }
    resolve(received);
    // Shut the listener down once we have what we came for.
    queueMicrotask(() => void server.shutdown());
    return new Response(
      "<h2>Done.</h2><p>Close this tab and go back to your terminal.</p>",
      { headers: { "Content-Type": "text/html" } },
    );
  });
});

const response = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT,
    grant_type: "authorization_code",
  }),
});

const body = await response.json();
if (!response.ok || !body.refresh_token) {
  console.error("\nNo refresh token came back:\n", body);
  console.error(
    "\nIf you see a token but no refresh_token, Google has already granted one " +
      "to this client. Remove Medley at https://myaccount.google.com/permissions " +
      "and run this again.",
  );
  Deno.exit(1);
}

console.log("\n=== GOOGLE_REFRESH_TOKEN ===\n");
console.log(body.refresh_token);
console.log("\nPaste that into Supabase → Edge Functions → Secrets.");
console.log("Do not commit it, and do not paste it into a chat.\n");
