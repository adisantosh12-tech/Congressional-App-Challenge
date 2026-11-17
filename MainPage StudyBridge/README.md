# StudyBridge

## Run locally

Install Node.js, then from this folder run:

```bash
npm start
```

Open `http://localhost:3000`.

Teach Back requires Node.js 18 or newer and an OpenAI API key configured on the server. Keep the key out of frontend files. In PowerShell, set it for the current terminal before starting the app:

```powershell
$env:OPENAI_API_KEY = "your-api-key"
npm start
```

The optional `TEACH_BACK_MODEL` environment variable selects the chat model; it defaults to `gpt-4o-mini`. Each Teach Back message is checked by a separate semantic moderation request before it can reach the AI student. Teach Back messages and moderation results are not stored by this app. They are sent to the configured OpenAI API for processing.

Groups are stored in `data/groups.json` and are shared by every browser that connects to this server. The page also refreshes the shared group list every 10 seconds.

## Put it behind your domain

Deploy this folder to a host that supports a persistent Node.js process. Configure the host to run `npm start`, then point the domain's DNS record to that host. The domain must proxy requests to the Node process so both `/` and `/api/groups` use the same origin.

A static-only host cannot provide shared groups because it cannot run the API or persist `data/groups.json`.
