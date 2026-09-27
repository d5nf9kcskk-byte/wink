# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated (the user chose "your recommendation"). Chosen:

- **React + TypeScript + Vite**, built to static files and deployed to **GitHub Pages** through GitHub Actions. SPA routes need the GitHub Pages `404.html` fallback (or hash routing).
- **Motion** (motion.dev) for springs, shared-element and layout transitions (opening a book), and drag-to-reorder (TBR queue). Plain CSS transitions and the View Transitions API cover the simple cases.
- **Supabase** for accounts, cloud sync and social data: Auth, Postgres with row-level security, and Edge Functions later for supporter-tier payments. The static site talks to it directly, so GitHub Pages hosting still works.
- **Book data:** Open Library and Google Books APIs for search, covers and metadata. Free and legal sources are Project Gutenberg (Gutendex), Standard Ebooks and LibriVox. Physical copies link to Bookshop.org.

Why: this app is heavy on animation, public, and needs accounts. React has the deepest ecosystem for both accessible components and animation. Motion's layout, shared-element and reorder primitives map directly onto Wink's signature moments. Supabase gives free-tier auth and sync without running a server.

## Users

- **Primary:** the general public. Habitual readers who read across ebook, audiobook and physical formats and want to track reading, keep a library, and find their next book. Many are switching from Goodreads or The StoryGraph.
- **Young readers (all ages are allowed):** kids use Wink through a kid-safe mode that limits or supervises social features.
- **Parents or guardians:** they set up and supervise kid-safe accounts.
- Personas beyond this have not been researched yet.

## Product Purpose

Wink tracks the books a reader is reading, logs reading sessions, and keeps a digital library of everything they've read. After a reader finishes a book and rates it on a star scale, Wink recommends what to read next, weighted by how much they liked it. A search surface opens a detail view for any book: overview, summary, other readers' reviews, genre, and the free or cheapest way to get it as an ebook, audiobook, physical copy, or special edition. Badges and rewards mark minutes logged and books finished. Opening a book, earning a badge and finishing a book each come with a playful animation.

Success means readers log with almost no friction, keep coming back because it feels rewarding rather than guilt-driven, and trust Wink's recommendations and buy links.

## Positioning

Wink connects the full reading loop in one animated app: log, finish, rate, get recommendations, get the book. Star ratings and reflections feed recommendations directly, and every book shows the cheapest legal way to get it in every format, including free public-domain and library options. Competitors each own one piece: StoryGraph's mood data, Bookly's timer, BookBub's deals, Libby's lending. None connects rating to recommendation to acquisition, and none pairs it with humane gamification and no paywall on core features or on a reader's own data.

## Operating Context

- Reading mostly happens away from the screen, with physical books, audiobooks while commuting, and e-readers. Readers open Wink to start or stop a session timer, or to backfill a session they forgot to time.
- Finishing a book is a ritual moment: rate it, reflect, get recommendations.
- Discovery happens while browsing: search, detail pages, recommendation rows.
- Acquisition hands off to outside sources: library lending, public-domain sites, retailers.
- Kid-safe accounts are used with a parent or guardian involved.

## Capabilities and Constraints

**Core features (from the user's brief):**
- Currently-reading tracking
- Reading session log
- Digital library of read books
- Star ratings after finishing a book, which drive recommendations
- Book search and a detail page with overview, summary, readers' reviews and genre
- Free or cheapest acquisition across ebook, audiobook, physical and special editions
- Badges and rewards for minutes read and books finished
- Signature animations

**Candidate backlog:** the best 20 features from the research round, listed in the Evidence section below. They are accepted as candidates. Phasing and launch scope are undecided.

**Technical constraints:**
- Static hosting only (GitHub Pages). Anything server-side runs on Supabase.
- Accounts and cloud sync exist from version 1.
- Book data comes from public APIs. No scraping of Goodreads, Amazon or other sites.
- "Other readers' reviews" come from Wink's own users, plus whatever the licensed APIs provide.

**Legal and ethical constraints:**
- Acquisition links are legitimate sources only: public domain, library lending, and real retailers. Nothing piracy-adjacent.
- Under-13 accounts fall under US COPPA and need verifiable parental consent.

**Business model:** free, with an optional supporter tier. The tier adds extras only. It never locks core features or a reader's own data, and export is always available.

**Planned later (decided by the user):** an opt-in, friends-only reading leaderboard, off by default and never shown to child profiles. It waits on the Friends feature. Until then, the reading level is personal only and must never look like a rank.

**Open decisions:**
- Launch scope and phasing of the 20 candidate features
- What the supporter tier contains, and which payment processor to use
- How kid-safe mode verifies parental consent, and exactly which features it limits (needs legal review before launch)
- How public reviews are moderated (Goodreads review-bombing is the cautionary case)
- Whether to use Bookshop.org's affiliate program
- Whether and how AI features are used

## Brand Commitments

- The name is **Wink**.
- Fun animations are a core promise, especially when opening books and earning badges.
- Ratings use a star scale.
- No logo, voice guide or other visual identity exists yet.

## Evidence on Hand

- **The Wink Idea Atlas:** https://claude.ai/artifact/TnngYomRPmdMVr7rDv8aS8. Covers research on 21 competing apps, "steal these / avoid these" field notes, and the best 20 features ranked with rationale and animation ideas.
- `research/competitor-research.txt`: good ideas, bad ideas and gaps for each of the 21 apps, drawn from real user reviews.
- `research/ideas-scored-100.json`: all 100 generated ideas with usability, desirability and feasibility scores and reviewer notes.
- `research/top-20.json`: the final 20 as structured data.
- **Absent:** users, testimonials, reviews of Wink, press, usage metrics, logo, and pricing. Future work must not make these up.

## Product Principles

1. **Logging takes three taps or fewer.** Manual-entry friction is the top complaint about reading trackers, so the core loop has to feel effortless.
2. **Reward presence, never punish absence.** Streaks forgive missed days, nothing guilt-trips the reader, and streak repairs are never sold.
3. **Your reading is yours.** Core features and a reader's full history are never paywalled, export is always available, and privacy defaults to private.
4. **Delight through motion, and motion is always optional.** Every signature animation respects a Full / Reduced / Off intensity setting and `prefers-reduced-motion`.
5. **Useful alone, better together.** Recommendations work from a reader's own ratings on day one. Social features add to Wink but never hold it up, and they stay safe for kid-safe accounts.

## Accessibility & Inclusion

- **Target:** WCAG 2.2 AA across the app. That includes keyboard operation, screen-reader support, contrast, and reduced motion.
- **Motion Intensity Control** (Full / Reduced / Off, default Reduced when the operating system asks for reduced motion) is required, not optional.
- Kid-safe mode needs age-appropriate copy and supervised social features.
