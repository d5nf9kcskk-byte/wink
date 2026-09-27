---
version: 1
slug: "src-screens-streak-tsx"
primary_target: "src/screens/Streak.tsx"
related_targets: ["src/components/WeekSpines.tsx"]
---

# Streak — your reading year

Mode: Operate. A full page at #/streak inside the established Tri-Band Paperback world (DESIGN.md governs every token). Reached from Home's streak heading ("Your year ›"); the week spines stay on Home too.

## Brief

- Reader wants to see their streak in detail: which days they read, how long, and with which book.
- Whole-year view (user pinned), current calendar year, with a way back to earlier years that have reading.
- Tap any day → that day's card: date, total minutes, pages, and each book read (genre ink band, title, minutes, pages, sessions), plus how the day counted (read / free repair / forgiven / missed).
- From a day, add a session that wasn't timed: book (from the shelf, reading or finished), start time, minutes, optional page (or audiobook position) reached → addPastSession. Past days and earlier today only.
- Summary: current streak, longest streak, days read this year, free repairs saved (and days to the next one while under 3). Never guilt; missed days are neutral.
- Reading level stays personal (never a rank); no leaderboard here.

## Direction contract

THESIS: The year is a bookcase. Four quarter-shelves each hold thirteen week-spines; every spine is seven day segments in the ink of that day's longest-read book, so a year of reading reads as a shelf of colour at a glance. It refuses the category default: a generic heatmap calendar of intensity squares.

OWN-WORLD: DESIGN.md's Tri-Band Paperback, unchanged: flat genre inks, white title bands, Cabin caps in bands, price-line facts, shelf rules, numbered spines, no shadows or gradients, radius ≤3px. Missed days are empty outline segments; free repairs are unclassified ink marked as reprints; forgiven days are dashed; today carries the ink keyline.

STORY: The reader opens their year, sees the shelves fill with colour, taps a day, reads which books carried it and for how long, and logs a session they forgot — the shelf updates in place.

FIRST VIEWPORT: Phone 390×844: a back control and the page title band; the streak band (current streak at display scale, longest streak, days read this year, repairs saved); then the four shelves (Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec), each a row of 13 week-spines on a shelf rule, month initials beneath, this week's spine keylined. The selected day's card docks below the shelves: a date band in the day's ink, a white band listing books with minutes and pages, and an Add a session band at its foot. Desktop: shelves left, day card right, both top-aligned.

FORM: Four Shelves of Week Spines, surface roll position 7 on the ordered list (lead of the dealt hand 7, 3, 2), seed key c40c7534. Signature interaction: tapping a day segment lifts it (a short slide up from its spine) as the day card slides in beneath; adding a session drops the new colour into that day's segment. All motion obeys Full / Reduced / Off.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
