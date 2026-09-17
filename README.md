# Caption Generator

Internal tool for Re:Act's social media team: drag in a creative, pick a
client, get ready-to-post Instagram/TikTok/Facebook/LinkedIn captions.

See [`CLAUDE.md`](./CLAUDE.md) for architecture, environment variables, how
to add a client, and how to update platform rules.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in ANTHROPIC_API_KEY at minimum
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
