# Social Media Caption Generator — Claude Skill
![telegram-cloud-photo-size-4-5963180594780900430-y](https://github.com/user-attachments/assets/0d350edc-81f0-43b7-a153-8dcd2eba38cf)

> **Social media caption generator for Claude Code.** Turn any text, script,
> screenshot, or competitor post into ready-to-post captions for all 7 major
> platforms — optimized for the signals each algorithm actually rewards.

**This is the actual Claude skill I use to caption every post on [@theromanknox](https://www.instagram.com/theromanknox) (300K+ followers).**
One prompt in. Captions for Instagram, TikTok, Threads, Facebook, YouTube Shorts out.

---

## What it does

Send it anything:

- A script or raw notes
- A screenshot or image of your post
- A competitor's viral post (it'll write something better)
- A brief description of your content
- A link to an article you're repurposing

You get back **ready-to-copy captions for 7 formats**, each using a different proven formula:

1. **Instagram Reels** — hook-first, optimized for DM shares
2. **Instagram Carousel** — longer, save-optimized
3. **TikTok** — 80-char hook, completion-rate language
4. **Threads** — conversation starter, reply-optimized
5. **Facebook Page/Personal** — trigger-word-free for max reach
6. **Facebook Group** — community tone, discussion question
7. **YouTube Shorts** — title + description, search-keyword-optimized

Each caption comes with a breakdown: formula name, hook type, CTA type, and which algorithm signal it optimizes for.

---

## Why every platform needs a different caption

Most creators copy-paste the same caption to every platform. That's why their reach dies on 6 of the 7.

Every algorithm rewards different signals in 2026:

| Platform | #1 signal | Dead signal |
|---|---|---|
| Instagram Reels | DM shares | Likes |
| Instagram Carousel | Saves | Likes |
| TikTok | Completion rate (70%+) | Hashtag spam |
| Threads | Replies | Cross-posted content |
| Facebook Page | 40-80 char posts | Trigger words (-70% reach) |
| Facebook Group | Discussion questions | Links |
| YouTube Shorts | Title SEO + retention | Clickbait |

This skill bakes all of that into the output. No `#fyp`. No `#viral`. No engagement bait. No Facebook trigger words. No copy-paste.

---

## Install

```bash
# Clone into your Claude skills folder
cd ~/.claude/skills
git clone https://github.com/rediumvex/social-media-caption-generator-claude.git social-captions
```

Restart Claude Code. The skill is available as `/social-captions`.

### If you use gstack

```bash
cd ~/.claude/skills/gstack
git clone https://github.com/rediumvex/social-media-caption-generator-claude.git social-captions
```

---

## Usage

Just send Claude the material — it figures out the rest:

```
/social-captions here's my reel script: [paste script]
```

```
/social-captions [paste screenshot of your carousel]
```

```
/social-captions competitor post crushing right now: [url or text]
```

```
/social-captions topic: "how to use Claude skills for SEO blog posts"
```

You get back all 7 platforms, each with:

- Ready-to-paste caption text
- 3-5 niche hashtags (never generic)
- Formula breakdown
- Hook type
- CTA type
- Signal being optimized

Then you pick, tweak, post.

---

## What's inside (highlights)

The skill encodes the full 2026 algorithm playbook:

- **30+ caption formulas** across reach, engagement, sales, and growth goals
- **Hook library** — provocation, curiosity, value, emotion, TikTok-specific
- **Platform-specific length rules** (IG Reels 80-200 chars, FB Page 40-80, TikTok 100-300, etc.)
- **Anti-patterns** — engagement bait, shadow ban triggers, format crimes
- **Power words** library by category (urgency, trust, exclusivity, emotion)
- **Facebook trigger word replacements** — "FREE" → "complimentary", etc.
- **Signal hierarchy** — shares > saves > comments > watch time > likes

All based on what's actually shipping results in 2026, not 2020 best practices.

---

## Who built this

I'm **Roman Knox**. I run the Instagram [@theromanknox](https://www.instagram.com/theromanknox) — 300K+ followers posting daily about AI, Claude Code, n8n, and automation.

I built this skill because I was spending 30 minutes per post writing captions for each platform separately. Now it's one prompt, 7 platforms, done.

- 🎓 **[Join Knox Community on Skool](https://www.skool.com/knox/about)** — n8n library, cold outreach systems, Claude skills, and the weekly live sessions
- 📸 Instagram — [@theromanknox](https://www.instagram.com/theromanknox)
- 🤖 My other Claude skills — [SEO Blog Writer](https://github.com/rediumvex/seo-blog-writer-claude), [AI Video Generator](https://github.com/rediumvex/ai-video-generator-claude), [Meta Ads Doctor](https://github.com/rediumvex/meta-facebook-ads-optimizer-claude)

---

## License

MIT — do whatever you want with it. Fork it, modify it, ship it in your product. If it helps, a ⭐ on the repo is appreciated.
