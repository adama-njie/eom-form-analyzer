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
npm test           # vitest, 295 tests
npm run typecheck  # tsc --noEmit
```

`npm run build` must stay the whole gate: TypeScript is strict with
`noUnusedLocals` and `noUnusedParameters`, so dead parameters fail the build
rather than lingering.

### Test fixtures

Four test files run against real form exports that are not in the repository
(`public/gambia.xlsx`, `sample/Form B sample.xlsx`). They skip themselves when
the file is absent, so a fresh clone runs 252 tests and skips 43. Everything
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
- **A column of bare digits is a rating only where a legend says so.**
  "1 2 3 4 5" is one of the scales the tool knows, because the forms
  store a rating as the digit. A count of people answers in the same
  digits, so "E.1 How many polling staff members are present" was drawn
  in the rating palette with 1 shaded as the worst answer on the slide,
  beside "E.1.1 How many of the polling staff are female", which held a
  0 and so was read as the count it is. `classify` now takes the digit
  scale only where the legend names every digit in the column, and a
  number the tool cannot name stays a number.
- **A scale keeps all its points, including the ones nobody used.**
  `matchScale` returns the whole scale, not the points that were
  answered. Section G asks eight questions on Never / Sometimes /
  Mostly / Always; seven were answered on three of those points and the
  eighth was answered Never once, which made it a scale of its own. It
  was dropped from the page that puts the section on one chart - a
  group of one is not a section - and "Mostly" was a different colour
  on it, because `colourFor` places a point along its own scale. The
  better half of a scale is a different half too. The legend is applied
  on the answers the column holds rather than on the scale, so a
  four-point legend still names a column of digits read against the
  five-point one.
- **A count is charted the most first, on one blue ramp.** Five staff
  members present is a full complement and the thing a briefing looks
  for, so the chart opens on it, exactly as a rating chart opens on
  Very good; `displayCounts` reverses a count's bands the way it
  reverses a scale, and `chartScale` is what every colouring site reads
  so the screen and the deck agree. The colour is `COUNT`, one blue
  from light to deep, and not the categorical palette, which put 1 in
  the deep blue and 2 in the orange a flagged answer wears - colour
  saying something about a quantity that the quantity did not say. One
  hue rather than the rating ramp, because the tool does not know which
  end of a count is the good one: a full team is good news and four
  unauthorised persons in the room are not. It stops at the deck's own
  light blue rather than going paler, because a chart's data labels are
  one colour for the whole chart - PowerPoint allows no other - and 9%
  in white on a pale blue column is the one thing on the page nobody
  can read.
- **Six values is five and a tail.** The shares page holds five
  answers, and "E.3 How many citizen observers are present" was
  answered 0, 1, 2, 3, 4 and 9 on eleven reports, so one station with
  nine cost the question that page altogether. `bandsFor` gathers the
  tail into "4 or more" instead. Only for a count of things in a
  polling station - whole numbers, none above twenty - because six
  distinct voter-list totals are six sizes of station and "3,300 or
  more" said about one report is not a band. The station with nine is
  still in the exported table.
- **A scale is held worst first and charted best first.** `displayCounts`
  reverses it for the chart, and `sectionOverviews` does the same for the
  section's page, so a column stacks Very good at the foot and Very bad
  on top, as the mission's own reference deck draws every one of them.
  `question.scale` does not move: `meanScore`, the better half of the
  scale and `colourFor`'s place along it are all read off it. The screen
  takes its order from `displayCounts` too, so the dashboard and the deck
  read the same way round.
- **The map of a rating is followed by the stations behind it.**
  `poorReports` and `addStationTableSlide`: the area, the constituency
  and the station name, worst first, ten rows to a page, with a column
  the form does not ask for left out rather than filled with blanks. The
  constituency is read through its question rather than through
  `dataset.constituencyColumn`, because the polling-day form asks it in
  a column per area and the settled column is blank for every report
  filed from anywhere else. The table needs no canvas, so it is drawn
  whether or not the maps are.
- **So is a follow-up to a Yes/No question.** `namesStations` and
  `answeredReports`, drawn by the same table. "D.1.1 If No to D.1 the
  delay was" is asked only of the reports that said the station did not
  open on time, so its answers are a list of the stations that opened
  late and by how much; the deck counted them and never said which they
  were. The longest answer first, by the number its band starts with,
  because the page is read from the top. It has to be a question with a
  fixed set of answers and a form that names its stations: a follow-up
  asking for a number is a different page, and one offering a tick box
  per option is a block rather than a column, which is why this draws
  one table across both Gambian forms and not seven. The last column is
  headed from the question's own wording - "the delay was:" is
  "Delay" - and anything that will not shorten to a heading is headed
  "Answer" rather than repeating the question.
- **A rating question is mapped on the worse end of its scale.**
  `mapKindFor` returns `poor` for it rather than `pie`: four answers pied
  across seven areas holding one or two reports each is a page of
  coloured dots, and what a mission wants off a map of a rating is where
  the day was rated badly - which is what the reference deck maps and
  nothing else. `poorLabels` is the strict bottom half, so the midpoint
  of an odd scale is neither good nor bad, and a form where nobody rated
  anything badly draws no map rather than an empty one.
- **The headline rating gets a page against the clock.** How the day went
  is what the deck opens on; when it went that way is the question a
  mission asks next. `ratingByHour` groups the ratings by the hour of the
  departure reading - the same clock the turnout curve uses, because that
  is when the observer had seen the whole of their visit - and
  `addRatingHourSlide` draws it as stacked counts with the hour's own
  total just over its own column - `axisTop` states the top of the axis
  so the figure can be placed there, and written along one line at the
  head of the chart it sat an inch above the short columns. The clock
  carries no axis title: a clock reads as one, and a line of small
  print under a chart is the first thing a projector loses. The first rating question only: five of these
  would be five pages saying the same thing five ways.
- **A scored question wears the words from its own legend.** The forms put
  the key in a column of its own - "4=Very good 3=Good 2=Bad 1=Very bad" -
  and store the digit, so a rating chart read 1, 2, 3, 4 with the key
  nowhere near it. `parseLegend` reads it once and the whole scale is kept,
  including points nobody used, because "the better half of the scale" is a
  different half otherwise.
- **Turnout is the one thing a polling-day form can say about the day.**
  Every report records how many of a station's voters had voted when the
  observer left and the time they left, so the reports together draw the
  curve. The count is paired with its clock time by the word the two
  questions share - departure - rather than by question code, and the
  page is read after section C rather than in the overview.
  **The departure reading only.** The form asks the same thing on
  arrival, but that figure is what the staff reported had happened before
  the mission was in the room, and counting both would put every station
  on the curve twice, once on the way in and once on the way out; it
  flattened the real curve into a straight line across the day. A form
  that never asks on departure therefore gets no curve, which is correct:
  it has not observed one. `READING_MOMENT` is where that is decided.
  Each point is the mean of those shares, one station one vote: a national
  turnout would need every station in the country, not the observed ones.
  A count of votes cast is charted as that share and not in bands, which
  would put a station of 2,000 beside one of 300 - but only where it is a
  reading taken against a clock time, so "people who voted with a duty
  certificate" stays the count it is. The voter list itself also stays a
  count, because summing it is a real figure.
- **A worked-out percentage says what it is a share of.** The hedge this
  tool removed was "mean of 36 estimates" beside a figure the form asked
  for as a percentage. "As a share of voters on the voter list" under a
  question headed "Total number of voters who had already voted" is not a
  hedge but the unit, and `Percentage.basis` carries it.
- **A count the form asks for as part of another count is that share.**
  "E.1.1 How many of the polling staff are female" counted in its own
  right says how many observers wrote the digit 4, which is partly a
  picture of how big the stations were: two of five and two of four
  stand in the same bar, and a station staffed by one can never reach
  the fourth bar at all. `parentCount` finds the whole and
  `shareOfParent` draws the share, which replaces the composition page
  rather than joining it. Three things have to agree before one number
  is read as part of another, because reading it wrongly invents a
  denominator: the code says it is a follow-up, both are counts, and
  the wording either points back at the parent ("how many of these")
  or names what it is a part of ("of the polling staff") in a word the
  parent used too. "How many of the party agents were accredited" under
  "How many citizen observers are present" is not a part of it.
  **Summed, not averaged**, which is where it parts company with
  `percentageOf` and `shareOfRegister`: those average a per-report
  share because the reports hold estimates, and because summing over
  the observed stations would read as a figure for the country. Here
  both numbers are headcounts an observer took standing in the room,
  so "25 of the 47 polling staff observed were women" is complete and
  true of exactly the set it names. `Percentage.counted` carries the
  two numbers and `basisLine` writes them beside the unit, because 53%
  reads the same whether it is 25 of 47 or 2 of 4. A report counting
  more parts than it has wholes is dropped and the base falls by one,
  which is the honest record of it - the polling-day export has one.
  A share summed this way is also split by station type, which a mean
  of estimates is not: the pages around it in section E are split that
  way already.
- **A rating question is found by its scale, not by its section letter.**
  It was `/^J\./`, and the opening form rates one thing in section G, so a
  morning's observation reported nothing at all.
- **The coverage slide is the briefing's front page.** Polling stations
  visited, LGAs,
  constituencies, polling stations and the headline rating - both the
  share in the better half of its scale and the mean out of that scale,
  because a day rated Good on every report and a day rated Very good on
  every report are both 100% - four to a row and wrapping to a second row, then reports by area, by team and by
  station type. The count of teams is not among them: the size of the
  deployment is the mission's own figure, known before a report was
  filed, and the chart lower down the slide names every team that filed.
  Where the form scores nothing there is no rating to open on, and the
  count of teams keeps the row full. The first tile is the count of
  reports, named for the stations where a form is filled in once per
  station, which is what a briefing opens on; where two observers filed
  from one station the two figures differ and both are shown. Distinct stations, not reports: two observers at one
  station is one station observed - and where that comes to the same
  number as the reports, which it does on a form filled in once per
  station, the tile is left off rather than printed twice. The station
  type is a ring with the count and the share on it, because two kinds of
  station are a split of one whole and not two quantities to compare. The
  figures come from `stationsObserved`, `stationTypeQuestion` and
  `ratingOf`, so the dashboard shows the same ones. "Constituencies" is
  shown only where the form asks for one; it used to read "0 / 53" on a
  form that never asks, which says the deployment reached none of them.
- **The deck reads in the form's own order.** Coverage first, and then
  section A through to the end, with the turnout curve after section C -
  it is drawn from the reading each observer took as they left, so it
  answers section I rather than the overview, and `TURNOUT_AFTER` is
  where that is written. A deck whose questions include no section C has
  nowhere to put it but the front, where it was. The overall assessments
  are last, because they are section J. There is no
  ranked-findings slide: it put C.7 and F.6 on page four, before section A
  had been reached, and the ranking is on the dashboard and in the Word
  report, which are read rather than presented.
- **A question of a few answers is its shares and then its map.** The
  page that counted the answers - a ring, with the same answers stacked
  across the areas beside it - is not drawn where the shares page is,
  because the shares page says the same thing in the one form that bears
  comparison between places of different size, and the two pages running
  one after the other were a briefing reading itself twice.
  `needsCountsPage` is that decision, read by the deck and by the export
  dialogue, which counts the pages before the analyst presses the button.
  A question the shares page cannot hold keeps its counting page - more
  than five answers, a number in ranges, a cloud of words - and so does
  a question broken down by party, which the shares page does not draw.
  A count of a few things - "E.1 How many polling staff members are
  present", answered 1 to 5 and banded one value to a band - is a
  composition like any other and gets the shares page instead of its
  counting page, as every question of a few answers does: a bar chart
  of those answers with the same answers stacked across the areas
  beside it is the shares page again. A number banded into ranges does
  not: an
  area does not hold more or less of "4,000 to 4,999", and a station's
  own number is an identifier. Nor does a question asked as a
  percentage, which is averaged and has its own page. The
  order is fixed in `addQuestionSlides`: the question's own page, then the
  map, and the shares after it where the question had a page of counts.
- **Which map a question gets is `mapKindFor`'s decision, and only its.**
  The question naming the area is followed by the map of where the
  reports came from, which is why that map is no longer in the overview;
  a yes/no question is shaded on the answer that matters, which
  `isInverted` knows; anything else with two to five answers gets a pie on
  each area. Every binary question is mapped, not only the three the
  findings ranked highest: "Is there a long queue outside?" matches no
  problem keyword, so the one question a reader most wants on a map was
  the one question never put there.
- **A question's shares are the nation, the kind of station, and each
  area, as 100% stacked columns.** `sharesAcross`, drawn by
  `addSharesSlide`, which is the reference deck's page for a question.
  Counts cannot be compared between an area holding eighty reports and
  one holding nine, and the columns are of reports rather than of
  answers, so NA is a segment and every column is full height - a
  composition, not the rate the findings table and the maps print. Every
  column carries its own base above it, as a figure of the slide's own,
  because "Mansa Konko (1)" is half again as long as "Mansa Konko" and
  the names are what decide how much of the page is left for the
  columns, and there is no line under the heading explaining the page:
  a slide that describes its own chart spends on prose the room the
  names below the chart need, and the names were being cut off at the
  foot of it. The sub-line is kept only where it states a unit - which
  answer a map shades, what a turnout figure is a share of, what a mean
  is out of - because a figure whose unit is not written says more than
  the data supports. Every panel's columns are drawn against the same height,
  which is the whole point of the page: a chart takes its legend and its
  category names out of its own plot area, so the legend is the slide's
  own - `addLegendRow` - and the plot area is stated rather than fitted,
  `layout` with `layoutTarget` inner, the same rectangle in every panel
  whatever the names below it do. Sizing each box as the columns plus
  the band `labelBand` asks for came close and no closer: the room a
  label gets is PowerPoint's own measurement of it. `labelBand` still
  sets the rotation and reserves the room the names need under the plot,
  generously, because a stated plot area will not grow and a name with
  too little room is cut off - "Mansa Konko" was drawn as "Mansa K...".
- **A section's page is the section's own questions, not its
  follow-ups.** `sectionOverviews` takes only the top-level codes -
  E.4, not E.4.1. A page headed "Section E" that opened on E.1.2 and
  jumped to E.4 was three of the section's nine questions, and a reader
  looking for E.1 on it did not find it; a follow-up is also asked only
  of the reports whose parent answer led to it, so its bar rests on a
  different base from the bars around it. Follow-ups keep their own
  pages.
- **A follow-up follows the question it follows up.** `nestFollowUps`
  in `schema.ts` puts a question whose code is another's with a part
  added directly after it, whatever the column order is: this export
  writes the F.7.1 block after F.8, so the deck drew F.7, F.8 and then
  went back for F.7.1, and a reader met the answers without the
  question they answer. Everything else keeps the order the file has.
- **A section fills its pages evenly.** Thirteen questions at twelve to
  a page is a page of twelve and a page of one, and D.14 alone under a
  heading reading "Section D" looks like a mistake rather than a
  continuation. `sectionOverviews` divides by the pages it needs, so
  the same two pages hold seven and six. `SECTION_ROWS` is still the
  most one page may hold.
- **A section of questions asked the same way opens on one page.** Ten
  questions answered Yes or No are ten pages of two bars, and a reader
  who has to turn ten of them to find the one that stands out will not
  find it; read as one chart - a row per question, each row a full-width
  100% stacked bar - the section states itself. `sectionOverviews` groups
  by the scale rather than by the answers that were given, because a
  question answered No on every report has an answer set of one and would
  otherwise be split onto a page of its own, which is precisely the
  question worth seeing beside the others. Twelve rows to a page, then
  the section continues on another.
- **A team that filed nothing is still on the page.** `withSilentTeams`
  fills the gaps between the lowest and the highest team number that
  filed, because a team missing from the axis reads as a team that does
  not exist when what it means is that nothing has come in from it -
  which is what this page is read for during a deployment. LTO 03 and
  LTO 06 were simply absent between 02 and 08. Only where the
  numbering says so: one prefix, numbers of one width, and fewer gaps
  than teams that filed, because "STO 0401" and "STO 0601" are a region
  and a team rather than teams one and two hundred and one, and filling
  that range would invent two hundred teams. Nothing is added past the
  highest number seen: how many teams there are is the mission's own
  figure and this page has never known it.
- **The teams are a chart per team type.** The form asks for the team
  number once per team type, so the columns are the types and the answers
  in them are the teams: sixty bars on one axis is a wall, and the
  comparison worth drawing is each team beside the others doing the same
  job. `teamColumns` reads those columns from the headers rather than
  from one question, because a report that fills two of them - a team of
  two observers writing both their numbers - makes `splitBase` leave them
  apart, correctly, and they are still one page to a reader. Thirteen
  teams to a column, because a category name needs about 1.6 times its
  type size of chart height before PowerPoint starts printing every other
  one, and a team missing from the axis reads as a team that filed
  nothing.
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
- **Yes is dark blue, No is light blue, NA is orange — always.** The palette
  does not change with whether Yes is the bad answer on this question. Which
  answer is the worrying one is the findings table's job.
- **A shaded map is the deck's blue, pale to deep.** `ACCENT_DEEP` on the
  deck, in the Word report and on screen, with the ramp carrying the rate.
  A flagged question used to be shaded in orange, so two maps of the same
  shape were different colours for a reason no reader could see.
  **Except the map of a rating**, which is `FLAG`: it is the only map a
  rating question gets, it is always of the worse end of the scale, and
  the line under the title says which answers it shades - so the colour
  is a property of the kind of map and not of the question, which is
  what made the old orange unreadable. `mapShade` is the one place
  either is chosen.
- **NA is charted**, last, and excluded from every rate. A question answered
  No on 18 reports and NA on 15 must not be drawn as "100% No". **And
  "N/A" is one of them, not a blank.** It was in `BLANKS`, so the six
  observers who answered N/A to "G.11 Are duty certificate voters added
  to the voter list?" were indistinguishable from six who never reached
  the question, and the deck printed it against a base of three out of
  nine. A question most reports could not answer and a question most
  reports did not reach are different results. A column holding nothing
  but N/A is still dropped: every rate it could carry is nought out of
  nought.
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
- **A tick box is a share of the reports, not of the ticks.** One report
  ticks several options, so the ticks outnumber the reports: Mandinka on
  three reports of four is 75%, and dividing by the ticks drew it as
  43%, which answers a question nobody asked. `analyse` sets a multi
  block's `pct` against `reports`, and the deck charts that share with
  the base written over the chart - the reference deck's own treatment
  of "unauthorised persons". The count, the base and the share are
  written together after the bar - "2 of 9 (22%)" - because a
  PowerPoint data label holds one number and the count used to sit in
  the option's name at the far end of the row: the plot area is stated
  and the axis top is `axisTop` of the longest bar, so where each bar
  ends is known and the figures can be written there. The base is in
  every label rather than in a line under the title, which was prose
  where the chart needed the room; the axis stops above the longest bar
  rather than at 100%, because a block whose commonest answer was
  ticked on two reports in thirteen was five stubs in an acre of
  white.
  The share is of every report in the export rather than of the ones
  that reached the question, so a follow-up asked only of the reports
  that answered Yes is not a share of a different denominator on every
  page.
- **Numbers are counted in bands from the start**, not banded at the chart.
  The bands are what `byArea` and `byParty` hold, so a numeric question can be
  compared across party and area.
- **A question that asks for a percentage is averaged, not banded.** B.8 and
  B.9 are already rates, so the figure, the figure by party and the figure by
  LGA is what they get - `isPercentageQuestion` and `percentageOf` in
  `analyse.ts`, drawn by `drawPercentage`, `PercentPanel` and `meanBarsPng`.
  Every bar says how many reports it rests on, the bars run against a fixed
  0-100 track, and the mean is one report one vote - and every percentage
  anywhere in the deck is a whole number, including the share of reports
  a tick box is drawn as. A figure too small to round to 1% is written
  "<1%" rather than "0%", which would say nobody where several reports
  said somebody: the form records an
  estimated share, not a headcount, so there is nothing to weight by that
  would not be invented. The figure stands alone - "mean of 36 estimates"
  beside it read as a hedge, not as a base - and `meanLabel` is the one
  place it is written: whole numbers, except under 10, where B.10's half a
  percent would otherwise be drawn as 0%.
- **A deck is named "Analysis of" the form.** `defaultTitle` prefixes
  the sheet's own name, because the cover and the file are read by
  someone who would otherwise expect the questionnaire. The cover no
  longer carries the line about which division of the country the deck
  counts; `AREA_WORDS` names it on every page that groups by area.
- **An export is named after the title it was given**, not
  `observer-analysis-<date>`: `exportFileName` slugs the dialogue's title,
  adds the period where one is filtered, then the date. The title starts
  as the form's own name from the sheet (`defaultTitle`), because it is
  printed on a cover as well as on a file.
- **Maps carry a key and no prose.** Title, picture, key - and, on a
  shaded map, the one line saying which answer is shaded and what the
  share is of, which is the unit and not a sentence about the map. A pie
  map's pies are sized by report count and nudged apart where they would
  overlap.
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
  Inside a chart the floor is `CHART_MIN`, four points lower, and a value
  written on a mark is `LABEL_MIN`, two points lower again: a data label
  has only the width of the mark it is on, and at 18pt "100%" did not fit
  a column of a 100% stacked chart, so PowerPoint drew nothing at all,
  and at 14pt it broke "11%" over two lines and set the per cent sign on
  a line of its own. `typefloor.test.ts` enforces all three.
- **A mean score is written to one decimal place.** `scoreLabel`, in the
  deck, on the dashboard, in the Word report and in its sentences. Two
  decimals said more than the scale knows: a mean of 3.44 out of 4 is
  drawn from reports that each answered 3 or 4, and the second decimal
  moves with a single report.
- **A category name is wrapped, not cut.** `wrapText` breaks a question
  over the lines the axis has room for, because a category axis label is
  one string and PowerPoint gives it whatever width it decides the axis
  is worth: "C.3 Did you observe any particular problem ..." left the
  reader to guess which problem. The break is written into the label so
  PowerPoint honours it rather than deciding for itself.

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
