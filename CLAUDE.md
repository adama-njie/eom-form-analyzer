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
npm test           # vitest, 231 tests
npm run typecheck  # tsc --noEmit
```

`npm run build` must stay the whole gate: TypeScript is strict with
`noUnusedLocals` and `noUnusedParameters`, so dead parameters fail the build
rather than lingering.

### Test fixtures

Four test files run against real form exports that are not in the repository
(`public/gambia.xlsx`, `sample/Form B sample.xlsx`). They skip themselves when
the file is absent, so a fresh clone runs 188 tests and skips 43. Everything
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
    gambia.ts          LGAs, constituencies, the register, name matching
    period.ts          the campaign period, and the dashboard's view of it
    layout.ts          slide geometry; `place()` throws on anything that would not fit
    theme.ts           every colour and type size in the product
  data/boundaries.ts   real LGA boundaries (geoBoundaries gbOpen, ADM1)
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
- **Maps are of LGAs only.** There is no constituency map and no district
  map; `mapPng` and `GambiaMap` take rates and nothing else. A map below
  the LGA was tried twice: the 53 constituencies have no published
  boundaries, and the 48 districts that do are a different division, so
  eleven constituencies - the urban ones, which is where the reports are -
  could not be drawn and the map was blank where the mission was working.
  Coverage by constituency is a list on screen, which can show all 53. Do
  not reintroduce the district layer without a real constituency boundary
  file; `scripts/build_boundaries.py` still writes the ADM2 shapes.
- **A file reports against seven regions or eight LGAs, and the file
  says which.** The campaign form asks for the Local Government Area and
  offers all eight. The polling-day forms ask for the region and offer
  seven, because the IEC reports Kuntaur and Janjanbureh together as
  Central River and names it after its administrative capital,
  Janjanbureh. Read as eight, a complete seven-region deployment counts
  "7 / 8" and the map hatches Kuntaur, which on these maps means "nobody
  observed here". The name cannot settle it - both divisions call the
  place Janjanbureh - so `divisionOf` reads the evidence: a report filed
  from Kuntaur, the form's own list of areas in the headers of a question
  split by area, or a Kuntaur constituency filed under Janjanbureh.
  Eight when nothing says otherwise, because reading an eight-area file
  as seven would report a deployment that never reached Kuntaur as
  complete coverage, and the header has the switch for the file that says
  nothing either way. Everything that groups, counts, shades or divides
  by area goes through `dataset.areas`, and the words come from
  `AREA_WORDS[dataset.division]`, so nothing has its own idea of how many
  areas there are.
- **A form from outside The Gambia still works, without the maps.** When the
  area column's answers do not resolve against the gazetteer, `dataset.geo`
  is false: the tool groups by whatever the file says, calls those groups
  districts rather than areas on screen and in both documents, and draws no
  map, with a line saying why. This is why `district` still appears
  throughout `App.tsx`, `pptx.ts`, `report.ts` and `narrative.ts` after the
  district map was removed - it is the generic word, not the Gambian
  division. Do not tidy it away.
- **Coverage by constituency is a screen, not a slide.** The deck's page of
  it is gone: on the polling-day form it was a page of one area's
  constituencies, because the form asks the question in a column per area
  and the page was built from whichever single column resolved most often.
  The grouping is still on the dashboard, where it can be scrolled and
  filtered, and the count is on the coverage slide.
- **A question the form splits into a column per area is one question.**
  "B.2 Polling station constituency - Banjul" through "- Basse" is seven
  columns and a report fills the one its station is in; "A.1 Team number"
  is five. Read column by column they are seven questions, six of them
  nearly empty, and every figure drawn from them is a fraction of the
  truth. `splitBase` in `schema.ts` groups them where no row fills two.
- **A clock time is a time, not the number a workbook stores it as.** A date
  cell read without `cellDates` is an Excel serial, so "A.2 Time of arrival"
  classified as numeric and the deck printed a hundred arrival times as a
  total of 46,361. `readClockTimes` rewrites such a column as "07:40" before
  anything classifies it, and leaves alone any column that dates the report
  itself, because `parseDay` reads the serial and the period filter needs it.
- **A scored question wears the words from its own legend.** The forms put
  the key in a column of its own - "4=Very good 3=Good 2=Bad 1=Very bad" -
  and store the digit, so a rating chart read 1, 2, 3, 4 with the key
  nowhere near it. `parseLegend` reads it once and the whole scale is kept,
  including points nobody used, because "the better half of the scale" is a
  different half otherwise.
- **Turnout is the one thing a polling-day form can say about the day.**
  Each report reads how many had voted on arrival and on departure, against
  that station's own list, and each reading carries a clock time, so the
  reports together draw the curve. The pairing is by the word the two
  questions share - arrival, departure - rather than by question code.
  Each point is the mean of those shares, one station one vote: a national
  turnout would need every station in the country, not the observed ones.
  A count of votes cast is therefore charted as that share and not in
  bands, which would put a station of 2,000 beside one of 300; the list
  itself stays a count, because summing it is a real figure.
- **A worked-out percentage says what it is a share of.** The hedge this
  tool removed was "mean of 36 estimates" beside a figure the form asked
  for as a percentage. "As a share of voters on the voter list" under a
  question headed "Total number of voters who had already voted" is not a
  hedge but the unit, and `Percentage.basis` carries it.
- **A rating question is found by its scale, not by its section letter.**
  It was `/^J\./`, and the opening form rates one thing in section G, so a
  morning's observation reported nothing at all.
- **The coverage slide is the briefing's front page.** Reports, LGAs,
  constituencies, polling stations, teams and the headline rating, four to
  a row and wrapping to a second row, then reports by area, by team and by
  station type. Distinct stations, not reports: two observers at one
  station is one station observed - and where that comes to the same
  number as the reports, which it does on a form filled in once per
  station, the tile is left off rather than printed twice. The station
  type is a ring with the count and the share on it, because two kinds of
  station are a split of one whole and not two quantities to compare. The
  figures come from `stationsObserved`, `stationTypeQuestion` and
  `ratingOf`, so the dashboard shows the same ones. "Constituencies" is
  shown only where the form asks for one; it used to read "0 / 53" on a
  form that never asks, which says the deployment reached none of them.
- **The deck reads in the form's own order.** An overview first - coverage,
  turnout, where the reports came from - and then section A through to the
  end, with each question's pie map or finding map directly after the
  question it maps and the overall assessments last, because they are
  section J. There is no ranked-findings slide: it put C.7 and F.6 on page
  four, before section A had been reached, and the ranking is on the
  dashboard and in the Word report, which are read rather than presented.
- **A decimal is a full stop.** Everything this tool writes itself is
  formatted `en-GB`, and a chart's data labels - which PowerPoint renders
  on opening, in the regional settings of the machine it is opened on -
  carry the `[$-409]` locale prefix in their format code so a mean of 3.31
  is not drawn as "3,31". Chart labels needing no decimal do not get one:
  the turnout curve is whole percentages.
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
  would not be invented. The figure stands alone - "mean of 36 estimates"
  beside it read as a hedge, not as a base - and `meanLabel` is the one
  place it is written: whole numbers, except under 10, where B.10's half a
  percent would otherwise be drawn as 0%.
- **An export is named after the title it was given**, not
  `observer-analysis-<date>`: `exportFileName` slugs the dialogue's title,
  adds the period where one is filtered, then the date. The title starts
  as the form's own name from the sheet (`defaultTitle`), because it is
  printed on a cover as well as on a file.
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
