---
version: 1
slug: "src-screens-home-tsx"
primary_target: "src/screens/Home.tsx"
related_targets: ["src/App.tsx"]
---

# Home

Mode: Operate. Mobile-first app screen; also the app shell, auth, child profiles, session timer, add-book sheet and minimal finish flow ship with it.

## Brief

- Reader opens Wink just before or after reading, phone in one hand. Job: start or stop a session in 3 taps or fewer and glance at today's progress.
- Stop triggers one visible chain: book band fill → goal band → week spines → reader number.
- Check-ins every 3 hours, on by default at the start of every session; turning them off (on the timer or from the first check-in) lasts that session only.
- Offline-first: sessions save on device instantly, sync to Supabase when online. Runs in "this device only" mode when Supabase env is absent.
- Auth: email magic link, Google, email + password. Age question comes before any email is collected; under-13 routes to a parent creating the account and adding a child profile (no login of its own). Friends hidden in child profiles.
- Out of scope now: Library, Discover, Friends, book detail, badges, full reflection ritual (their tabs show an honest coming-soon state).
- Open: genre inks proposed by the build, pending user approval; consent verification method pending legal review.

## Direction contract

THESIS: The book is the screen. The reader's current book fills Home as one tall tri-band paperback cover whose bottom band is the Start reading control. It refuses the category default: a dashboard of cover-thumbnail cards, stat tiles and progress rings.

OWN-WORLD: The 1935 paperback tri-band grid. Flat genre-colored bands above and below a white title band; eight genre inks plus an unclassified grey; near-black ink; a humanist sans in the Johnston/Gill line, spaced caps in bands, bold mixed case for titles; numbered spines; a small price-line register for facts ("p. 142 of 384"). No gradients, no decorative shadow, no cream paper.

STORY: The reader sees their book, taps its band, reads, taps Stop, enters a page, watches one chain of fills confirm the session counted, and puts the phone down.

FIRST VIEWPORT: Phone 390×844: a strip of spines for other current books along the top (hidden with one book); the cover takes about two-thirds of the height — top band (genre in caps, Wink mark, reader number), white band (title at display scale, author, small cover thumb, format and page line), bottom band = Start reading, full width, ≥88px tall, in the thumb zone. Below: goal band, seven week spines, reader number line. Desktop: cover left at book proportion, progress right, nav rail left.

FORM: Tri-Band Paperback, position 5 on the ordered list (re-roll 1), seed key 4c82e618. Signature interaction: the cover hinges open at its spine into the session page. Motion grammar: bands fill with exponential ease-out, numbers roll digit by digit, spines slide into slots, celebration size scales with significance; all governed by Full / Reduced / Off.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
