# EOM Observer Form Analyser

A single-file, offline web tool for the EU Election Observation Mission to The
Gambia, 2026. An analyst opens one HTML file, drops in an observer form export
(`.xlsx`), and gets the coverage figures, the ranked findings, the maps, a
PowerPoint deck, a Word report, and per-question tables — without the data ever
leaving their laptop.

`README.md` is the long-form account of *why* the tool behaves as it does, and
is worth reading before changing analysis or chart behaviour. This file is the
working brief: the rules, the commands, and the decisions that are easy to undo
by accident.

## Non-negotiables

1. **Observation data never leaves the machine.** No network calls, no
   telemetry, no server, no CDN at runtime. Everything inlines into one HTML
   file via `vite-plugin-singlefile`. Anything that would need a backend is the
   wrong design for this tool.
2. **No observation data in the repository.** `public/`, `sample/` and `dist/`
   are git-ignored and must stay that way. Real exports live outside the repo.
   If you copy a live file in to test something, delete it afterwards and check
   `git status` before committing.
3. **Never state more than the data supports.** A percentage is of the reports
   that answered; "no reports from an area" and "no problems in an area" are
   different statements and must look different. The deck is read by people who
   will repeat what it says in public.

## Commands

```bash
npm install
npm run dev        # Vite dev server
npm run build      # typecheck, then build dist/index.html (the deliverable)
npm test           # vitest, 193 tests
npm run typecheck  # tsc --noEmit
```

`npm run build` must stay the whole gate: TypeScript is strict with
`noUnusedLocals` and `noUnusedParameters`, so dead parameters fail the build
rather than lingering.

### Test fixtures

Four test files run against real form exports that are not in the repository
(`public/gambia.xlsx`, `sample/Form B sample.xlsx`). They skip themselves when
the file is absent, so a fresh clone runs 150 tests and skips 43. Everything
else is synthetic and always runs. `describe.skipIf` still executes the body of
a `describe`, so any fixture read there has to be lazy — see the `load()`
helpers in `engine.test.ts` and `selection.test.ts`.

## Layout

```
src/
  App.tsx              the whole screen UI
  components/          charts.tsx (hand-rolled SVG), maps, export dialogue, print view
  lib/
    schema.ts          infers questions from column headers
    analyse.ts         counts, breakdowns, coverage, findings, geography resolution
    selection.ts       what goes in an export, and what needs a slide to itself
    pptx.ts            the PowerPoint deck
    report.ts          the Word report
    export.ts          CSV/XLSX tables
    narrative.ts       the sentences the Word report writes
    text.ts            prose vs lists, word and phrase counting
    chartImage.ts      canvas rendering (report charts, word clouds)
    mapImage.ts        map rasterisation for the deck
    gambia.ts          LGAs, constituencies, districts, name matching
    period.ts          the campaign period, and the dashboard's view of it
    layout.ts          slide geometry; `place()` throws on anything that would not fit
    theme.ts           every colour and type size in the product
  data/boundaries.ts   real boundary shapes (geoBoundaries gbOpen)
```

Nothing is specific to one country except `gambia.ts`. Point the tool at a form
from another mission and the inference still works; only the maps need Gambian
geography.

## Conventions

- **Comments say why, not what.** Most of the comments in this codebase record
  a bug that was found in a rendered deck. Do not delete them to tidy up.
- **One source of truth per decision.** Colours and type sizes come from
  `theme.ts`; geometry goes through `place()`; answer polarity comes from
  `isInverted`. If you find yourself writing a second copy, fix the first.
- **Every behaviour gets a test**, and the test names read as sentences about
  the product, not about the function.
- **Prose, not shouting.** No emoji anywhere in the product or the code.
- **British English** in anything a user reads.

## Decisions that are easy to undo by accident

- **The gazetteer is the IEC's.** The 53 constituencies and their register
  come from "Total Number of Registered Voters Per Polling Station 2026";
  `REGISTERED_2026` is the only place a voter figure is written and an LGA's
  electorate is the sum of its constituencies. The IEC reports under seven
  regions, so Central River is split back into Kuntaur and Janjanbureh here.
- **A constituency name resolves exactly, by unique prefix, or by one
  letter.** "Latrikunda" can only be Latrikunda Sabiji, and "Kantoro" is
  Kantora; "Brikama" is the start of two constituencies, so it names the area
  and resolves to neither. What does not resolve is shown as written -
  "Westfield", "URR" - on screen and under the deck's table, because
  "constituency not named" reads as missing data when the field was filled in.
- **Coverage by constituency is a table**, grouped by area, with the register
  beside the reports, spread evenly over as many columns as it takes and
  continued on a second slide where it must be.
- **An LGA is named by its administrative capital.** Banjul, Kanifing,
  Brikama, Kerewan, Mansa Konko, Kuntaur, Janjanbureh, Basse. The regional
  names (West Coast, North Bank, Lower River, Upper River) are aliases that
  still resolve on import, and the area question's own answers are resolved
  too, so one slide never shows both spellings.
- **Yes is light blue, No is dark blue, NA is orange — always.** The palette
  does not change with whether Yes is the bad answer on this question. Which
  answer is the worrying one is the findings table's job.
- **NA is charted**, last, and excluded from every rate. A question answered
  No on 18 reports and NA on 15 must not be drawn as "100% No".
- **A question is never broken down by itself.** The party question compared
  across party is one bar per party answering with its own name.
- **A horizontal bar chart in PowerPoint draws its first category at the
  bottom.** `topDown()` reverses the data so charts read top-down. Time
  questions are drawn as columns so the morning is on the left.
- **Word clouds**: prose is counted by word, with recurring two- and
  three-word phrases kept whole; a column of delimited lists ("GRTS, QTV,
  Kerr Fatou") is counted by whole item instead. Nothing is merged by
  similarity — two spellings of a name stay apart.
- **Multi-answer blocks** are matched on the *last* bracketed group in the
  header, so "B.15 Language(s) of the speeches (Mandinka)" keeps its block.
- **Numbers are counted in bands from the start**, not banded at the chart.
  The bands are what `byArea` and `byParty` hold, so a numeric question can be
  compared across party and area.
- **A question that asks for a percentage is averaged, not banded.** B.8 and
  B.9 are already rates, so the figure, the figure by party and the figure by
  LGA is what they get - `isPercentageQuestion` and `percentageOf` in
  `analyse.ts`, drawn by `drawPercentage`, `PercentPanel` and `meanBarsPng`.
  Every bar says how many reports it rests on, the bars run against a fixed
  0-100 track, and the mean is one report one vote: the form records an
  estimated share, not a headcount, so there is nothing to weight by that
  would not be invented.
- **Maps carry a key and no prose.** Title, picture, key. A categorical or
  ordinal question with two to five answers and at least three areas also gets
  a pie map after its own slide, with the pies sized by report count and
  nudged apart where they would overlap.
- **An export says which period it covers.** The header offers all period /
  campaign period / before it, and only when the file straddles the start.
  Reports are placed by the date of the event where the form asks for one
  and by the submission date otherwise; one whose date cannot be read
  belongs to no period and the count is shown. The deck, the Word report and
  print all follow the filter, as they do for area and team, and all three
  print `sel.period` on their cover - a document that covered a different
  stretch of time than its reader assumes is the one failure mode here, so
  nothing may take the filter without printing the line. `CAMPAIGN_START` in
  `period.ts` is the one place the date is written.
- **Constituencies belong under their LGA.** The area question and the
  constituency question are a hierarchy, not two lists: the screen gives each
  area a drill-down and the deck a grouped page, and a group never splits
  across a column. Constituency answers are resolved against the gazetteer so
  spelling variants collapse; unrecognised answers stay as written.
- **Nothing on a slide is set below 18pt**, and a question title below 24pt.
  `typefloor.test.ts` enforces it.

## Verifying a deck

Tests can assert the XML of a generated `.pptx` (see `chartorder.test.ts`),
which is the fast loop. For anything visual, render it:

```bash
soffice --headless --convert-to pdf --outdir out deck.pptx
python -c "import fitz; fitz.open('out/deck.pdf')[12].get_pixmap(dpi=70).save('p13.png')"
```

Then look at the image. Several bugs in this tool's history — a dropped word in
a cloud, a legend with no room, bars in reverse — were invisible in the code and
obvious in the render. Maps and word clouds need a browser canvas, so a deck
built in Node has neither; build through the UI when you need to see them.

## Deployment

The repository is <https://github.com/adama-njie/eom-form-analyzer> and `main`
is published to <https://adama-njie.github.io/eom-form-analyzer/> by
`.github/workflows/pages.yml`, which runs the tests and the build and then
deploys `dist/`. The hosted page is the same single file an analyst would be
emailed: it loads nothing from the network, and a form opened on it is read in
the browser and never uploaded.

Pages itself was switched on by hand once, under Settings → Pages with the
source set to GitHub Actions. `configure-pages` cannot do it: the workflow's
token is not allowed to change that setting, and asking it to (`enablement:
true`) fails the run after a clean build.
