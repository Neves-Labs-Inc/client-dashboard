// Mailpit's HTTP API (docker compose locally, a service container in CI).
const MAILPIT_API = "http://127.0.0.1:8025/api/v1";
// SMTP delivery to Mailpit is asynchronous to the API, so searches retry.
const POLL_INTERVAL_MS = 100;
const POLL_ATTEMPTS = 30;

type Address = { Name: string; Address: string };

export type MailpitMessage = {
  ID: string;
  From: Address;
  To: Address[];
  Subject: string;
  Text: string;
  HTML: string;
};

// Every message Mailpit holds for `to`, newest first.
export async function listMailpitMessages(to: string): Promise<string[]> {
  const query = new URLSearchParams({ query: `to:"${to}"` });
  const response = await fetch(`${MAILPIT_API}/search?${query}`);
  if (!response.ok) {
    throw new Error(`Mailpit search failed: ${response.status}`);
  }

  const body = (await response.json()) as { messages: { ID: string }[] };
  return body.messages.map((message) => message.ID);
}

// The one message sent to `to`, waiting for it to arrive.
export async function findMailpitMessage(to: string): Promise<MailpitMessage> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const ids = await listMailpitMessages(to);
    if (ids.length > 0) {
      const response = await fetch(`${MAILPIT_API}/message/${ids[0]}`);
      return (await response.json()) as MailpitMessage;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`No Mailpit message arrived for ${to}`);
}

export async function deleteMailpitMessages(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  await fetch(`${MAILPIT_API}/messages`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ IDs: ids }),
  });
}
