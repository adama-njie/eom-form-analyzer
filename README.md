# Observer Form Analyser

Drop an observer form export in, and the analysis builds itself: coverage, ranked findings, and a
chart for every question, broken down by administrative area.

Built for the EU EOM Gambia 2026 data team, to remove the manual rebuild that a long form currently
needs before it can be read.

**Open it:** <https://adama-njie.github.io/eom-form-analyzer/>

The page loads nothing from the network once it is open, and the form you drop on it is read in the
browser and never uploaded. To work with no connection at all, save the page (Ctrl+S) and open the
saved file, or take `dist/index.html` from a local build: it is the same single file.

---

## Why it exists

The current route is to load the Excel into Power BI and build each visual by hand. With four long
forms, that is several days of work that has to happen in the days when there is least time, and it
has to be redone each time a form is re-exported with more rows.

This tool reads the form's own structure and decides what each question is, so there is nothing to
configure and nothing to rebuild. A new export of the same form, or a completely different form,
works the same way.

## The important property: nothing leaves the machine

The whole tool is one HTML file. It reads the workbook in the browser, computes everything locally,
and makes no network request of any kind. There is no server, no upload, no account and no install.

That is not a convenience, it is the requirement. Observation data is mission-confidential, and a
cloud analytics service is not an acceptable place to put it. You can run this on a mission laptop
with the network cable out and it behaves identically.

## Use

Open `dist/index.html` in any modern browser. Drag the Excel onto the page.

That is the whole workflow. To share the tool, email the HTML file.

Four tabs:

- **Overview** — reports, areas and constituencies covered, reports by team and area, and the
  mean of each overall assessment question.
- **Map** — the real map of The Gambia, shaded by *any* question and *any* answer, at Local
  Government Area or district level. Pick "C.3 problem in the vicinity" and "Yes" and the map shows
  where that problem clusters. Click a place to filter the whole report to it. Places that returned
  no reports are hatched, never shaded at the bottom of the ramp, because "nobody observed here"
  and "nobody reported a problem here" are different statements.
- **Findings** — every question where the answer indicates a problem, ranked by how often it
  occurred, each with the areas that are above the overall rate. This is the triage view, and it is
  the part the current Power BI report does not produce.
- **All questions** — a chart per question, chosen automatically by question type, each with a
  by-area breakdown and a CSV button. Filter by code or text.
- **Data quality** — what the tool detected, which columns it could not map, and which rows had an
  area it could not match. Check this first when something looks wrong.

Filter the entire report by area, team and period from the header.

**Every export asks first.** A full form produces a 44-slide deck, which is right for the data
team and wrong for almost every audience it gets shown to. Pressing PowerPoint, Build report or
Print opens a dialogue: set the title and subtitle, pick which sections to include, and tick the
questions you want. Four presets cover most of it:

| Preset | What it gives you |
| --- | --- |
| Short brief | Coverage, maps and ranked findings. No question pages. |
| Findings and the questions behind them | The brief, plus a page per flagged question. |
| Everything | Every section and every question. |
| Questions only | No front matter, for when that is already written. |

The deck estimate in the dialogue is exact, not approximate. The selection is remembered for the
rest of the session, so exporting the same cut again is two clicks.

**Four outputs**, all built in the browser:

- **PowerPoint** — a full deck: the mission cover, coverage, a ranked findings table, overall
  assessments, then the questions, and a closing slide on how to read it. A question with a
  by-area comparison takes a slide and shows its answers beside the same answers stacked by Local
  Government Area; shorter ones go two to a slide. Includes a map slide at both levels and a
  mapped slide for each of the three leading findings. The question charts are *native PowerPoint
  charts, not images*, so the briefing team can restyle them, fix a label or drop a series without
  coming back for a re-export. Around 70 slides and 100 native charts from a 100-row form.
- **Build report** — a Word document: summary, coverage, ranked findings with a paragraph on each,
  overall assessments, then a section per question with a chart, a by-area comparison and a
  written description, closing with method and limits. Around 390 paragraphs, 7 tables and 99
  charts from a 100-row form, including both national maps and a by-area map for the leading
  findings. Charts here are images rather than native Word charts, because a native Word chart
  carries an embedded spreadsheet and opens badly outside Word.
- **Print / PDF** — the chosen sections and questions as a document, two to a page. It prints the
  selection rather than whichever tab is open, so the output does not depend on where you were
  standing when you pressed the button.
- **Export tables** — one CSV with every question's figures, overall and by area, for pasting into a
  report or checking a number without opening the tool.

## How question types are inferred

The forms follow a consistent grammar, which is what makes this automatable:

| Header | Read as |
| --- | --- |
| `C.2 Is there a long line of voters...` | single-answer question |
| `C.3.1 If Yes, please specify:` | first option of a multi-answer block |
| `C.3.1 If Yes, please specify: (Unrest)` | further options of the same block |
| `4=Very good 3=Good 2=Bad 1=Very bad` | a legend, ignored |
| `Chair of Polling and Counting Committee` | sub-item of the preceding question |

The first column of a multi-answer block carries only the question name, so its own option label is
recovered from the values in the column. Types are then inferred from the data: Yes/No becomes a
binary question, a recognised scale becomes an ordinal one and keeps its proper order, times are
bucketed to the hour, and numbers are banded into a distribution.

Numbers are deliberately **not** reduced to a mean, median or mode. An average
queue length of 23.4 is a figure nobody can act on, and the median and the mode
are worse: they describe the middle of a distribution whose tail is the entire
reason the question is asked. What a mission wants to know is how many stations
reported a long queue, so a numeric question is charted as bands, and the one
number kept beside it is the total, because summing an observed count is a real
figure. The mean of a **rating** survives, because a scale has a midpoint and a
count of voters does not.

Bands are chosen to be ones a person would have picked. Eight or fewer distinct
answers and each value is its own band; more than that and a round width is
chosen so the labels read `0 to 999`, not `0 to 827.4`.

Coverage is reported as areas and constituencies, not as a share of the
electorate. With reports from all eight LGAs that share reads 100%, which says
only what the figure beside it already said; "17 of 53 constituencies" says how
much of the country was actually reached.

`NA` and `DK` are **charted**, last and in orange, and held apart from the substantive answers
everywhere a rate is quoted. Dropping them was worse than distorting a percentage: "Did any speaker
use inflammatory language?" was answered No on 18 reports and NA on 15, and the slide read "100%
No", which is not what the data says. The chart now shows both, and the findings table, the maps
and the written report still divide by the reports that gave a real answer, because "a problem on
40% of reports" has to mean 40% of the reports in a position to see one.

## Gambian localisation

The country has **eight Local Government Areas**, named here by their
administrative capitals - Banjul, Kanifing, Brikama, Kerewan, Mansa Konko,
Kuntaur, Janjanbureh and Basse - and **53 constituencies**. The IEC reports
presidential results across seven tabulation areas, combining Kuntaur and Janjanbureh into "Central
River", which is why an earlier version of this tool had seven. Eight is correct for anything an
observer reports against, and the Central River electorate has been split back out from the IEC's
own constituency table: Kuntaur 50,864 and Janjanbureh 68,742, summing to the published 119,606.

**Boundaries are real**, from geoBoundaries gbOpen: ADM1 for the eight LGAs and ADM2 for the 48
districts. `scripts/build_boundaries.py` in the parent project downloads them, simplifies with
Ramer-Douglas-Peucker and rounds to four decimal places, producing a 63KB TypeScript module that
inlines into the single offline HTML file. Drawing uses an equirectangular projection with the x
axis scaled by the cosine of the mid-latitude, which at this size is indistinguishable from a
proper conic projection and needs no mapping library.

A note on the district level: **the 53 constituencies and the 48 districts are different
divisions.** The urban constituencies in Kanifing and the Kombos were split more finely than the
districts they sit in. Constituencies are mapped to districts where the names correspond, and the
interface lists by name the ones that cannot be placed rather than folding them into a neighbour.
Everything other than the district map works at full constituency resolution.

Observers may write the LGA name, the IEC's name for it, the code or the constituency, and all
resolve. The common spelling variants in Gambian official documents are folded too: Niumi/Nuimi,
Baddibu/Badibu, Fulladu/Fuladu, Wuli/Wulli, Illiasa/Illiassa, Sanjal/Sanjar. Observers may write the area name, the IEC's name for it, the code, or the constituency, and
all four resolve.

Because the register is attached, coverage can be expressed as the share of the electorate reached
rather than just a count of reports, which matters when Kombo South has 62,399 registered voters and
Janjanbureh has 1,600.

If the district names in a file are not Gambian, the tool groups by whatever the file says and hides
the map. That is how it was tested: against the Jordan 2024 Form B export, which it handles in full.

`../Gambia-Form-B-SAMPLE-dummy-data.xlsx` is a generated Gambian Form B with 100 fabricated entries,
produced by `../scripts/make_gambia_form.py`. It uses the real 53 constituencies and samples them in
proportion to their 2021 electorate, and it asks about marbles, drums and the bell rather than ballot
papers. Every row is labelled as dummy data, in the sheet name, a banner row and a column on every
record. It exists to exercise the tooling before real data arrives.

## How it looks

The deck, the report and the screen share one palette, set in `theme.ts`. The
values were measured out of the mission's own Power BI reports, `Form B
sample.pdf` and `Campaign Report Analysis Nov 29.pdf`, so an exported deck sits
beside the existing ones without looking like it came from somewhere else:
Arial throughout, the Power BI default fills, `#252423` for titles and
`#6C6966` for everything secondary.

**Nothing on a slide is set below 18pt, and no title below 24pt.** `MIN` in
`theme.ts` is that floor and `typefloor.test.ts` holds every size to it. Where
the floor and the available space conflict, the space gives way: a question
whose title will not fit a half-width column at 24pt is given the whole slide
rather than having its title shrunk or cut. The floor reaches the maps too,
which are canvas images rather than PowerPoint text, so their labels are sized
as a fraction of the drawing width and come out at the same 18pt once the slide
has scaled the image. Banjul and Kanifing are too small to hold a name at that
size, so theirs sit below the country on leader lines; on the district map,
where most of the 48 cannot hold a label, the colour scale carries it alone.

**A slide carries the question and its charts, and nothing else.** There is no
running header, no slide number, no count of reports under the title and no
written sentence under the chart. All five were there, and all five were
removed: the reference deck has none of them, repeating the deck's own title
forty times tells a reader nothing they did not know on page one, and a
sentence restating the figures already printed on the marks is read by nobody
while shrinking the chart for everybody. On a mapped finding the question is
the slide's title and the line under the map gives the figures alone: it used
to be the subtitle under "C.7 by LGA" and then be stated again underneath, so
the slide asked the same question twice. The disclaimer that observer reports
are not official results is now stated on the cover and on the closing page,
where it is read once instead of skipped forty times. The written description
still exists in the Word report, which is a document rather than a slide.

**The cover is the mission's.** White, the flag of The Gambia on the left, the
EU flag on the right, the mission's name between them over a rule, then the
election and polling day in blue, the title, who prepared it, and the date it
was last built. The export dialogue asks for the four that vary: title,
prepared by, election and polling day. Both flags are drawn from pptxgenjs shapes
rather than embedded as images: every embedded PNG is weight carried forever by
a tool that has to inline into one offline HTML file, a drawn flag is sharp at
any projector resolution, and the proportions stay right rather than depending
on whichever file someone pasted in. `flags.test.ts` holds them to
specification, down to the Gambian flag's 6:1:4:1:6 bands and the EU's twelve
stars on a circle of a third of the height.

**Questions are packed by what they need.** The reference gives each question
its own page, but its form is a dozen questions long and these are sixty-seven,
and a page holding one four-bar chart with six inches of white under it is not
better than a page holding two. A question with a by-area comparison to show,
or with more bars than sit comfortably in half a page, takes the slide; a short
one shares with the next short one. `needsOwnSlide` is the single rule, used
both to build the deck and to count it, so the figure in the export dialogue is
the number of slides that come out.

Two more rules are worth stating because they are easy to undo:

**No chart chrome.** Every chart states its values on the marks, which makes the
value axis, its gridlines and its tick marks redundant ink. They are all off,
via the `BARE` spread in `theme.ts`.

**Charts read in the order they were sorted.** PowerPoint draws the first
category of a bar chart at the *bottom* of the axis, so data handed to it in
reading order comes out upside down: charts sorted commonest-first displayed
rarest-first, and a rating scale ran from "Very good" at the bottom to "Very
bad" at the top. Every horizontal bar chart now hands its categories reversed,
in one helper, so the ordering decided in `analyse` is the ordering a reader
sees. A **time** question is drawn as columns instead, running left to right
from early to late, because that is how a day is read and as horizontal bars
the morning sat beneath the evening. `chartorder.test.ts` checks both against
the generated PowerPoint XML rather than against the code that writes it.

**Answers are compared across parties where the form records one.** A campaign
form asks which candidate, party or coalition an event belonged to, and that is
the dimension the mission's other teams ask their questions in: relative cost
by party, type of event by party, participants by party, inflammatory language
by party, inducements by party. The column is found from its wording, and then
every question with a handful of answers is broken down **both** ways, by party
and by Local Government Area, because the two answer different questions: which
parties are doing a thing, and where it is happening. They stack in the
right-hand half of the slide rather than taking a third each, since a stacked
bar needs width for its category names and "Team Gambia Alliance" at 18pt does
not fit a four-inch column. Height is shared between them in proportion to how
many bars each has: split evenly, eight areas got the same inch and a half as
five parties and PowerPoint printed every other area name. A polling-day form
records no party and keeps the area breakdown alone.

**A number is counted in bands, everywhere.** One bar per distinct answer
is useless for a number - forty queue lengths gave forty bars of one - so a
numeric question is charted as bands. It used to be banded for its own chart
and nowhere else, which left the by-party and by-area breakdowns holding raw
values that no chart could line up with, and so a number could not be
compared across anything. Now the bands are the answer, and "what share of
participants were women, by party" is a chart like any other. A question that
asks for a percentage says so in its own wording, and the bands carry it:
"20 to 39%", not "20 to 39", which on a slide could be a count, a share or a
number of people.

**A question with a handful of answers also goes on the map.** A shaded map
can show one answer at a time, so "what type of event was it" needs four maps
or none. A pie on each area shows the whole answer at once, sized by the
reports behind it, because an area with one report should not look as certain
as an area with twelve. It answers a different question from the stacked bar
beside it - whether the caravans are a coastal thing and the rallies upriver -
which a list of area names in alphabetical order cannot. Pies that would cover
each other are pushed apart and joined back to their area by a line; Banjul
and Kanifing are too small to hold one at all, so theirs sit below the country
on a leader, as their labels do on the shaded map.

**A map carries its own key, and nothing else.** The deck used to explain each
map in a line above it and another below. A map of eight shaded areas with a
name and a number written on each needs neither; the one thing those lines
carried that the picture did not - that hatching means a place that returned
nothing, which is not the same as a place that reported nothing - is now a key
drawn on the map itself.

**The campaign period is a view of the screen, not a setting of the deck.** Parties were
allowed to campaign early and observers reported on those events, but the official campaign
period began on 16 November. "What did we see during the campaign" and "what did we see
altogether" are both worth asking of one file, so the header offers all three: the whole
period, from the 16th, and before it. A report is placed by the date of the event where the
form asks for one and by the date it was filed where it does not - an event on the 15th can be
filed on the 17th, and it is the event that belongs to a period. A report whose date is blank
or unreadable belongs to neither side and is left out of both, with the count of them put on
screen rather than quietly absorbed. The dropdown appears only when the file actually straddles
the 16th; a polling-day form is one day's work and has nothing to split. What it does not touch
is the exports: the deck, the report, the printed view and the tables are built from the whole
file, because a document that silently covered three weeks or two depending on a dropdown
somebody left set is a document nobody can check. The area and team filters do flow into them,
as they always have, and the screen says so while a period is chosen.

**The constituency is read as part of the area, not beside it.** Every form
asks for the Local Government Area and then the constituency inside it, and
the two are a hierarchy: Bakau and Serekunda West are in Kanifing. Flattening
them into one list of 53 places loses that, and 53 bars is not a chart. On
screen each area opens to the constituencies its reports name; the deck gets
a grouped page of the same thing. "Nine reports from Kanifing" and "nine
reports from three of Kanifing's seven constituencies" are different
statements, and the second is the one a deployment is judged on. Answers are
resolved against the gazetteer first, so "Serrekunda West" and "Serekunda
west" are one place rather than two, and anything it does not recognise is
left exactly as the observer wrote it.

**A question is never broken down by itself.** "Which candidate/party/coalition
organised this event" compared across party is five bars, each one a party
answering with its own name, crushed into a single row; the same goes for the
question that names the area. `analyse` leaves the breakdown out where the
question *is* the grouping, which also gives the comparison that does mean
something - which parties campaigned where - the width it needs.

**The team column is whichever one names a team.** Form B asks "A.0 Team
type" and the campaign form asks "A.1 LTO team"; the pattern used to know
only the first, so a campaign export matched nothing, every report fell into
a bucket called "Unspecified", and the coverage slide reported one team where
there were eight. A form that genuinely has no team column now shows no team
breakdown, rather than one row that says nothing.

**An LGA is named by its administrative capital.** Brikama, Kerewan, Mansa
Konko and Basse, not West Coast, North Bank, Lower River and Upper River.
That is what observers write on the form and what the mission uses in its own
documents, and Banjul, Kanifing, Kuntaur and Janjanbureh are their own
capitals already, so all eight now read the same way on a chart, on a map and
in the coverage table. The regional names are kept as aliases, so a file that
uses them - or the IEC's "Central River" - still resolves, and the area
question's own answers are resolved too, rather than being charted in
whichever spelling the file happened to use.

**Prose questions get a word cloud.** A long form has three kinds of text
column: identifiers (a constituency, a station code, a date), prose ("In a
short paragraph, describe the main messages of the event") and lists ("Gambia
Police, Ecowas, Armed forces, Police Intervention Unit"). Counting the distinct
values of the second is pointless, because every answer is unique and ninety
bars of one is not a chart. `isProse` separates them, and prose gets the cloud
the reference campaign report uses for exactly these questions. Function words
and the form's own vocabulary are dropped, since otherwise the three largest
words are the question. Type size goes as the square root of frequency, because
area is what a reader judges, and the largest size is capped so that a long
entry still fits across the canvas - uncapped, "Police Intervention Unit" was
four times wider than the slide, the spiral never found a spot for it, and the
commonest answer to the question was missing from its own cloud.

**A list of names is counted as names.** Half the free-text columns on a
campaign form are not prose at all: they are lists, written with whatever
separator the observer reached for - a comma, a slash, an ampersand, a plus,
or "and" spelt out, sometimes behind a heading ("Television & Digital: GRTS,
QTV, Kerr Fatou"). Counted as words they came out as Intervention(4), Unit(4),
Kerr(3), Fatou(3): fragments of names, which in an observation report is worse
than useless. `isList` recognises them - half the answers carry a separator and
the pieces are short, which is what prose with commas in it is not - and counts
whole items instead, once per report, with a leading count ("8 police
officers"), a leading heading and a parenthetical aside stripped off. Nothing
is stemmed or merged by similarity: "Forayaa" and "Foroyaa" stay apart, because
quietly merging two spellings invents a number nobody can trace back to a form.

**Recurring phrases in prose are kept whole.** A word cloud counts words, and for most
of these questions that is right: "candidate", "roads" and "health" are themes
however they were phrased. But some answers name things, and splitting a name
destroys it. "Which security forces were present?" was answered "Police
Intervention Unit" and came out as Intervention(4) and Unit(4), two words that
mean nothing apart; "which outlet?" was answered "Kerr Fatou" and came out as
Kerr(3) and Fatou(3). So a group of two or three adjacent words is kept as one
entry where it occurs at least twice and accounts for most of the uses of its
rarest word. "Police Intervention Unit" qualifies, and the other sixteen
mentions of "police" still stand on their own; "NPP candidate" does not,
because both words are common separately and the pairing is incidental. A
phrase never spans a comma or a function word, so "Army, police" and "arrival
in Basse" stay apart, and a repeated word is emphasis rather than a phrase.

**Colour is only spent where it carries something.** A bar chart of plain counts
is one colour, not eight. Every bar already has its name beside it, so a hue per
bar suggests a grouping that is not there, and on a banded numeric question it
contradicts the order the bands are in. Colour is used for a rating scale, for
the slices of a ring, which cannot be told apart otherwise, and for Yes, No and
NA, which have fixed colours of their own.

**Yes is light blue, No is dark blue and NA is orange. Always.** They used to
depend on whether the question was one where Yes is the bad answer, so "Was
security provided for the candidate?" drew Yes in orange while "Were media
present?" drew it in light blue, and a reader moving between two slides had to
go back to the legend to be sure which was which. Which answer is the worrying
one is the findings table's job; the palette's job is to be predictable. NA
was grey, which reads as absence and is honest, but on a projector a grey
slice beside two blues is the one thing nobody in the room can see - and on
these questions NA is often the largest answer on the chart.

## Two things worth knowing about the implementation

**Slide geometry is checked at build time.** pptxgenjs calls its default widescreen layout
`LAYOUT_16x9`, which is 10 x 5.63 inches rather than the 13.33 x 7.5 that normally means. The first
deck was laid out for the larger canvas and half of every slide fell off the edge. The size is now
declared once in `layout.ts`, and every box goes through `place`, which throws if it would not fit.
A deck that would overflow fails the build instead of looking wrong in the room.

**A flagged answer is not always "Yes".** "Were any unauthorised persons
present?" and "Is the station accessible?" are both questions where one answer
indicates a problem, and it is the opposite answer in each. `isInverted` is the
one place that decides, and the findings ranking and the maps both use it. The
charts deliberately do not: they colour Yes and No the same way on every
question, because consistency across forty slides is worth more than a hint
that the ranked findings state outright.

**A question's own brackets are not an option.** Multi-answer blocks are found
by matching a column's header stem against the next column's, with the option
in brackets at the end: "B.15 Language(s) of the speeches (Mandinka)". The
option used to be read as the *first* bracketed group, which on that question
is the "(s)" of "Language(s)", so every column got a different stem, the block
never formed, and the question was charted as its first column alone - one bar
reading "No speech delivered" and not one of the seven languages. It is the
last bracketed group, with one level of nesting allowed inside it so that
"(Voting booth(s))" still parses. `multiblock.test.ts` covers both.

**Report charts render synchronously.** `canvas.toBlob` is asynchronous and browsers throttle its
callback in a background tab, so a report of 140 charts would stall if the window were minimised
partway through. The renderer uses `toDataURL` instead and decodes the base64 itself.

## Verification

`npm test` runs the engine against the real Jordan Form B export and checks it reproduces the
figures in the published Power BI report, including:

- 527 reports, 18 districts, team split STO 184 / LSTO 150 / LTO 144
- B.3 polling centre type: Urban 320 (61%), Rural 207 (39%)
- B.4 qualified centre: Yes 96, No 431
- E.4 unauthorised persons: Yes 24, No 503
- F.9.1 missing material: ballot papers 10, protocols 5, voting booth 1

The point of testing against a form the tool was not written for is that it is the only way to know
the grammar assumptions hold. The Gambian forms will differ in wording and geography.

## Before using it on live data

- Check the **Data quality** tab. If a question is typed wrongly there, its chart is wrong too.
- The findings ranking uses keyword matching on question wording to decide which answers indicate a
  problem. It is a triage aid. Confirm anything before it goes in a report.
- Area matching is only as good as what observers type. The Data quality tab reports how many rows
  could not be matched.

## Development

```bash
npm install
npm run dev     # local development
npm test        # engine tests against the Jordan sample
npm run build   # produces the single self-contained dist/index.html
```

`sample/` and `public/` are git-ignored: mission observation data does not belong in version
control, and the Jordan export used by the tests must not be redistributed.
