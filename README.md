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

- **Overview** — reports, LGAs and constituencies covered, polling stations observed,
  reports by team and area, turnout through the day where the form supports it, and the
  mean of each overall assessment question with the share rated good or better.
- **Map** — the real map of The Gambia, shaded by *any* question and *any* answer, across the
  eight Local Government Areas. Pick "C.3 problem in the vicinity" and "Yes" and the map shows
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

**Boundaries are real**, from geoBoundaries gbOpen: ADM1 for the eight LGAs.
`scripts/build_boundaries.py` in the parent project downloads them, simplifies with
Ramer-Douglas-Peucker and rounds to four decimal places, producing a TypeScript module that
inlines into the single offline HTML file. Drawing uses an equirectangular projection with the x
axis scaled by the cosine of the mid-latitude, which at this size is indistinguishable from a
proper conic projection and needs no mapping library.

**The map is of areas, and only areas.** There is no map below the LGA, because there is nothing
honest to draw one on: the 53 constituencies have no published boundaries, and the 48
administrative districts that do are a different division of the country. The urban constituencies
in Kanifing and the Kombos were split more finely than the districts they sit in, so eleven of
them - the eleven where most reports come from - cannot be placed on a district at all. A map that
needs a footnote to explain its blank half is worse than no map, and coverage by constituency is
a table, which has none of that trouble. The ADM2 shapes are still in the build script if a proper
constituency boundary file ever appears.

Observers may write the LGA name, the IEC's name for it, the code or the constituency, and all
resolve. The common spelling variants in Gambian official documents are folded too: Niumi/Nuimi,
Baddibu/Badibu, Fulladu/Fuladu, Wuli/Wulli, Illiasa/Illiassa, Sanjal/Sanjar.

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
`theme.ts` is that floor and `typefloor.test.ts` holds every size to it. Inside a chart
the floor is four points lower, `CHART_MIN`, and a value written on a mark is two points
lower again, `LABEL_MIN`, and only there: a data label is written on the mark it belongs
to and has only that mark's width, so at 18pt "100%" did not fit the column of a 100%
stacked chart and PowerPoint dropped it rather than drawing it smaller, and at 14pt it
broke "11%" over two lines and set the per cent sign on a line of its own. A
figure that is drawn is worth more than one set two points larger and not drawn at all,
and the label is set in white on a filled mark, which is the highest contrast on the
slide. Where
the floor and the available space conflict, the space gives way: a question
whose title will not fit a half-width column at 24pt is given the whole slide
rather than having its title shrunk or cut. The floor reaches the maps too,
which are canvas images rather than PowerPoint text, so their labels are sized
as a fraction of the drawing width and come out at the same 18pt once the slide
has scaled the image. Banjul and Kanifing are too small to hold a name at that
size, so theirs sit below the country on leader lines, and the deck's finding
maps put their figures in the same callouts.

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

**A question that asks for a percentage is averaged.** B.8 asks for the estimated share
of participants who were women, and the answer is already a rate. Banding it answered a
question nobody asked - how many events were between 40 and 59% female - and could not be
compared across parties without reading twenty numbers off a stacked bar. So a percentage
question gets the figure, the figure by party and the figure by Local Government Area, with
the number of reports on every bar, because an average of two estimates and an average of
twelve look identical otherwise. The bars run against a fixed 0 to 100 track rather than
against the longest of them. The mean is one report one vote: the form records an estimated
share and not a headcount, so an event of two thousand and an event of fifty count the same,
and there is nothing to weight by that would not be invented.

The figure is written on its own. It used to carry "mean of 36 estimates" beside it, which
reads as a hedge rather than as a base, and the base is already on the bars and on the
coverage slide. It is a whole number, as the estimates behind it are, except where rounding
would destroy it: B.10 asks for the estimated share of participants with a disability and
averages half a percent, and "0%" would say nobody was there when several reports said
somebody was.

**An export is named after the title it was given.** It used to be
`observer-analysis-2026-11-24.pptx`, which is the same name for the Chief Observer's deck
and the EMB's, produced the same afternoon, so the second arrives in Downloads as a (1).
The name now follows the dialogue's title, and carries the period where one is filtered -
an all-period export and a campaign-period one are the pair most easily mistaken for each
other - and the date. The title itself starts as the form's own name, read off the sheet,
rather than the workbook's file name: it is printed on a cover as well as on a file, and
neither wants to read "campaign-report-20261124-143212.xlsx".

**There is no constituency map.** There was one, drawn on district boundaries, and it went
through three names before it went altogether. The trouble was never the title: the 53
constituencies have no published boundaries, the 48 districts are a different division, and
eleven constituencies - the urban ones, where most of the reports come from - have no district
to be drawn on. The map was therefore blank exactly where the mission was working, and the
footnote explaining that grew longer than anything the picture said. Coverage by constituency
is a list on screen instead, which can show all 53 without apologising for any of them.

**Coverage by constituency left the deck.** It was a slide, a table of all 53 under their
areas with the register beside the reports, and it worked on the campaign form. On the
polling-day form it was a table of one area's constituencies: that form asks the question
in a column per Local Government Area, and the page was built from whichever single
column resolved most often. The grouping is still on the dashboard, where a reader can
open an area, filter by it and check it against the register, and the count - 39 of 53 -
is on the coverage slide. A page in a briefing deck that is quietly a seventh of the
answer is worse than no page.

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
the 16th; a polling-day form is one day's work and has nothing to split. The exports follow the
screen, as they already did for the area and team filters, and the price of that is that every
one of them says which period it covers: "Campaign period only: events from 16 November 2026"
on the cover of the deck, of the Word report and of the printed view, with the count of the
reports that had to be left out. A deck that silently covered two weeks of a three-week file
would be unanswerable six months later; a deck that says so is one anybody can check against
the file it came from.

**A clock time is a time.** "A.2 Time of arrival" is a real date cell, and a date
cell read without `cellDates` is a serial number - 46361.3194 - which looks numeric to
anything that reads it as text. So the deck printed a hundred observers' arrival times as
a total of 46,361 with bands either side of it, which is the single most wrong-looking
figure this tool has produced. Such a column is now rewritten as the clock time it holds
before anything classifies it, and the question gets the chart it was always meant to
have: one column per hour, the morning on the left.

**Turnout is the one thing a polling-day form can say about the election rather than
about the stations observed.** Every report records how many of that station's voters had
voted when the observer left, and the time they left, each against the station's own voter
list; a few hundred reports therefore draw the shape of the day. The count is paired with
its clock time by the word the two questions share - departure - so a form that words it
differently needs no code change.

The departure reading only, and that is a judgement rather than a convenience. The form
asks the same thing on arrival, but the arrival figure is what the polling staff reported
had happened before anyone from the mission was in the room, and putting both on one curve
gives a single station two points - one on the way in, one on the way out - which on real
data flattens the rise into a straight line across the day. A form that never asks on
departure gets no curve at all, which is the honest outcome: it did not observe one.

Each point is the mean of the shares, one station one vote, and not a national turnout:
that would need every station in the country rather than the ones that were visited. The
same logic makes a count of votes cast a share rather than a band. "How many stations had
served between 200 and 399 voters" puts a station of 2,000 beside a station of 300 and
says nothing about either; the same answer as a share of that station's list is turnout.
That applies to the readings alone, so a count of duty-certificate voters stays a count,
and so does the voter list itself, because summing it is a real figure.

The curve is read after section C rather than in the overview. It is an answer the
observers gave as they left - section I on the Gambian form - and the mission reads the
conditions at the station before the arithmetic of the day; a deck whose questions include
no section C has nowhere to put it but the front, where it was.

**A scored question wears the words from its own legend.** The forms score the overall
assessments 1 to 4 and put the key in a column header of its own - "4=Very good 3=Good
2=Bad 1=Very bad" - so the deck carried five charts of 1, 2, 3 and 4 with the key nowhere
on the slide. The key is read once and the digits are charted as the words. The whole
scale is kept, including points nobody used, because the better half of a four-point
scale is a different half from the better half of the three points that happened to be
answered.

**A scale is held worst first and charted best first.** It is stored in the order it scores
in - Very bad, Bad, Good, Very good - because that is what makes a mean rating mean
anything, and the chart reads the other way round: a briefing looks for how much of the day
was good before it looks for how much of it was not, and the mission's own reference deck
stacks "Muy bueno" at the foot of every column with "Muy malo" on top. Only the drawing
order changes. The mean, the better half of the scale and the colour each point is given
are all still read off the scale itself, which does not move, and the screen takes its
order from the same place as the deck.

**A rating question is mapped on the worse end of its scale.** It used to get a pie on each
area, which for four answers across seven areas holding one or two reports each is a page of
coloured dots. What a mission wants off a map of a rating is where the day was rated badly,
which is the only thing the reference deck maps: one shaded map of Bad and Very bad
together. The midpoint of an odd scale counts as neither, as it does in the better half,
and a form where nobody rated anything badly draws no map at all rather than an empty one.

**The headline rating gets a page against the clock.** How the day went is what the deck
opens on; when it went that way is what a mission asks next, and the reference deck gives it
a page. The hour is the one the observer left, the same reading the turnout curve is drawn
from, because that is when they had seen the whole of their visit. It is drawn as counts
rather than shares - an hour holding two reports and an hour holding forty are not the same
evidence, and the columns say so by their height - with the hour's own total above the
column. The first rating question only: five of these would be five pages saying the same
thing five ways.

**A slide does not explain its own chart.** The line under the heading - "Each bar is all
of the reports that answered that question" - was prose where the page needed room, and
the room it took came off the bottom, where the names under the columns are: on a
fourteen-point axis with the plot area stated by hand, "National" and "Mansa Konko" were
drawn with their descenders cut off. The sub-line survives only where it states a unit:
which answer a map shades and what the share is of, what a turnout figure is a share of,
what a mean score is out of. A figure whose unit is not written says more than the data
supports; a sentence describing the chart beside it says less than the chart does.

**A section's page is the section's own questions.** The page that puts a whole section on
one chart takes the top-level codes only - E.4, not E.4.1. On the polling-day form,
section E has nine questions of which three are answered Yes or No: E.1.2, E.4 and E.5. As
a page headed "Section E" that is three of nine, opening on a sub-question of E.1 with
E.1 itself nowhere on it, and a reader turning to it for the section does not find the
section. A follow-up is also asked only of the reports whose parent answer led to it, so
its bar rests on a different base from the bars around it on a chart that invites them to
be read against one another. Follow-ups keep their own pages, where the base is printed.

**A follow-up follows the question it follows up.** The export writes the columns of
"F.7.1 If Yes, please specify" after F.8, so the deck drew F.7, then F.8, and then went
back for F.7.1 - a reader met a page of specified answers three pages after the question
that asked for them. The form's own numbering says where a follow-up belongs, so one is
moved to directly after its parent and everything else keeps the order the file has.

**N/A is an answer, and "n/a" was being read as a blank.** The polling-day form offers
N/A on some of its questions - "G.11 Are duty certificate voters added to the voter list?"
is Yes, No or N/A - and six of nine observers answered it. The tool had "n/a" in its list
of values that mean no answer, so those six reports were indistinguishable from six that
never reached the question, and the deck drew G.11 against a base of three. A question
most reports could not answer is a result; a question most reports did not reach is a
different one, and the difference is the whole point of printing the base. N/A is now
charted like any other answer, last and in orange, and left out of every rate, which is
what the tool already did with "NA" and "DK". A column holding nothing but N/A is still
dropped, because every rate it could carry is nought out of nought.

**A scale keeps all of its points, including the ones nobody used.** Section G asks eight
questions on the same scale - Never, Sometimes, Mostly, Always - and on a nine-report
export seven of them were answered on three of those points while the eighth was answered
Never exactly once. Read as the points that were used, that made the eighth question a
scale of its own: it was left off the page that puts the whole section on one chart, which
is precisely the question a reader of that page is looking for, and "Mostly" was drawn in
a different colour on it, because a point's colour is its position along its own scale.
The scale is now the whole scale wherever the answers fit one, which is the same reason
the legend's own scale is kept whole: the better half of a four-point scale is a different
half from the better half of three.

**A column of bare digits is a rating only where a legend says so.** "1 2 3 4 5" is one of
the scales the tool knows, because that is how the forms store a rating. It is also how a
form stores a count of people: "E.1 How many polling staff members are present" offers 0
to 5 from a dropdown, and the deck drew it in the rating palette, 1 shaded as the worst
answer on the slide and the five answers stacked across the regions as though a station
with one member of staff were a station rated Very bad. Beside it sat "E.1.1 How many of
the polling staff are female", which happened to be answered 0 somewhere and so was read
as the count it is, and drawn as a bar chart. The digit scale now applies only where the
legend names every digit in the column. A number the tool cannot name is a number.

**A question the form splits into a column per area is one question.** The polling-day
form asks for the constituency seven times, one column per Local Government Area, and a
report fills the one its station is in. Read column by column they are seven questions,
six of them nearly empty, and the tool took its constituency figures from whichever
single column resolved most often - so a hundred reports from seven areas were reported
as covering 7 of 53 constituencies when they covered 39.

**Seven regions or eight areas, and the file decides.** The campaign form asks observers
for the Local Government Area and offers all eight. The polling-day forms - opening,
voting, closing, counting - ask for the region and offer seven: the IEC reports Kuntaur
and Janjanbureh together as Central River, and names it after its administrative capital,
which is Janjanbureh. Counted against eight, a deployment that reached every region read
"7 of 8 areas" and the map hatched Kuntaur - and hatching, on these maps, means nobody
observed there, which was not true.

The name cannot settle it, because both divisions call the place Janjanbureh: on one form
it is half of Central River and on the other it is all of it. So the file has to say so
itself, and three things can. A report filed from Kuntaur, which only the eight-area list
offers. The form's own list of areas, which a question split into a column per area prints
in its headers - "B.2 Polling station constituency - Kanifing" and six more, Kuntaur
absent. Or a Kuntaur constituency filed under Janjanbureh, which can only happen where
Janjanbureh means the region.

Eight is the answer when nothing says otherwise, and the header has a switch for the file
that says nothing either way. The two errors are not equal: reading an eight-area file as
seven would report a deployment that never reached Kuntaur as complete coverage, and a
coverage figure that overstates itself is the one mistake this tool must not make.

In region mode Central River is drawn as one shape with both its LGAs' electorates behind
it, labelled "Janjanbureh (Central River)" on the map, because that shape is twice the
size of the Janjanbureh on a campaign deck and two decks in one briefing should not leave
a reader wondering which is which. The cover says which division the document counts, next
to the period it covers.

**The deck is read in the order the form is written.** An overview comes first - what was
observed, how far voting got through the day, where the reports came from - and then
section A, section B and so on to the end, with each question's map on the page after the
question it maps and the overall assessments last, where section J is. It used to open
with the ranked findings, so a reader met C.7 and F.6 on page four and section A on page
eight; the ranking is still on the dashboard and in the Word report, which are read at a
desk rather than presented in a room. A briefing deck that jumps about is one the
presenter has to apologise for.

**A question of a few answers is drawn as shares, and then as a map.** The shares page
is the nation, the kind of polling station, and then a column per area, each one a
full-height 100% stacked column; the map follows it. There used to be a page before both
of them, counting the answers as a ring with the same answers stacked across the areas
beside it, and it was dropped because the page after it said the same thing better. A
count cannot be compared between places of different size: an area holding eighty reports
and an area holding nine are not comparable, and the bar that is twice as long is twice as
long because twice as many observers were sent there. The columns are of reports rather
than of answers, so NA is a segment of the column like any other and every column reaches
the top; that is a composition, not the rate the findings table and the maps print, which
is always of the reports that could answer. Each column carries the number of reports
behind it, written above the column, because a share of nine and a share of eighty are
drawn at the same height and are not the same evidence - and because "Mansa Konko (1)" is
half again as long as "Mansa Konko", and what the names need is what decides how much of
the page is left for the columns. The counting page survives for the questions
the shares page cannot hold - a question of more than five answers, a number in bands, a
cloud of words - and for a question broken down by party, which is a comparison the shares
page does not draw.

The three panels draw their columns against the same height, because the whole point of
the page is that they can be read across. A chart takes its legend and its category names
out of its own plot area, so the panel of seven area names - too long to sit side by side,
and turned through 45 degrees - drew columns an inch shorter than the one headed
"National" beside it, and a reader comparing the two was comparing two different scales.
The legend is therefore drawn once under all three and belongs to the slide rather than to
a chart, and the plot area itself is stated rather than left to be fitted: the same
rectangle in every panel, whatever the names below it do. Sizing each box as the columns
plus the room its names need came close and no closer, because the room a label gets is
PowerPoint's own measurement of it, which is not the tool's. The reservation below the
plot is now generous, since a stated plot area will not grow and a name given too little
room is cut off rather than wrapped - "Mansa Konko" came out as "Mansa K...". The area
names run further down the slide than "National" does, which is what the mission's own
reports do, and the columns above them are the same height.

**Every yes/no question is now on a map.** It used to be the three questions the findings
ranked highest, which meant a map was drawn only where a keyword in the question text had
matched the tool's list of words that describe a problem. "Is there a long queue of voters
waiting outside?" matches none of them, so the question a mission most wants to see
geographically was the one question the deck never put on the map. Any question with two
answers is now shaded across the areas - on No where No is the worrying answer, on Yes
where Yes is - and anything with three to five answers gets a pie on each area, as before.
Every shaded map is the deck's blue, pale where the share is low and deep where it is
high. A flagged question used to be shaded in the orange the deck spends on a problem, so
two maps of the same shape were different colours for a reason no reader could see; the
ramp already says which areas are high.
The map of where the reports came from moved too: it is the answer to the question that
asks which area the station was in, so it now follows that question instead of opening the
deck ahead of section A.

**A section of questions asked the same way opens on one page.** Section F asks ten
questions and every one of them is answered Yes or No; as ten pages of two bars each, the
one that stands out is found only by a reader who turns all ten. Read as one chart - a row
per question, each row a full-width 100% stacked bar - the section states itself: a
question answered No on a third of reports is visible beside nine answered No on a
twentieth, without a number being read. The questions' own pages still follow. What makes
two questions comparable is their scale and not the answers that happened to be given: a
question answered No on every report has an answer set of one, and keyed on that it would
be split onto a chart of its own - which is exactly the question a reader wants in the row
above the others.

**The teams are a chart per team type.** The form asks for the team number once per team
type, so the columns are the types and the answers inside them are the teams. Read as one
chart they are sixty bars in no order; read as a chart per type, with every team of that
type beside the others doing the same job, the page answers what it is there for - which
teams are reporting, and which have not reported at all. Thirteen teams to a column,
because a category name needs about one and a half times its own type size of chart height
before PowerPoint quietly starts printing every other one, and a team missing from the
axis reads as a team that filed nothing. The columns are found in the headers rather than
in one question: a form where two observers each write their own number fills two columns
on one report, which is the signature of columns that only share a stem, and the tool
leaves those apart on purpose - but they are still one page to the person reading it.

**A mean score is written to one decimal place.** Two decimals said more than the scale
knows: a mean of 3.44 out of 4 is drawn from reports that each answered 3 or 4, and the
second decimal moves with a single report. One place, in the one function that writes it,
so the deck, the dashboard, the Word report and its sentences all print the same figure.

**A decimal is a full stop, even on a German laptop.** Everything the tool writes itself
is formatted as en-GB. A chart's data labels are not written by the tool at all: PowerPoint
renders them when the file is opened, using the regional settings of the machine it is
opened on, so a mean rating of 3.31 arrives as "3,31" wherever the comma is the decimal
separator. The format codes now carry a locale prefix asking for English, and the labels
that never needed a decimal - the turnout curve - no longer have one.

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

**The constituencies and the register are the IEC's own.** Both come from "Total Number of
Registered Voters Per Polling Station 2026": 53 constituencies under seven reporting regions,
1,119,143 voters, summed from every stream of every station. Central River is split back into
Kuntaur and Janjanbureh, because an observer reports against an LGA and there are eight of
them. The register is held per constituency and an LGA's electorate is the sum of its own, so
there is one number to check rather than two.

**A constituency name resolves exactly, by unique prefix, or by one letter - and otherwise
not at all.** Observers write what they write: "Kantoro" for Kantora, "Foni Jarol" for Foni
Jarrol, "Latrikunda" for Latrikunda Sabiji, "Serrekunda West" and "Serekunda west" for the
same place. Those all resolve. "Brikama" is the start of both Brikama North and Brikama
South, so it names the area rather than a constituency and used to be filed under whichever
of the two the lookup reached first - a report placed in a constituency nobody reported from.
It now resolves to neither. And an entry that is a neighbourhood ("Westfield"), a region
("URR") or an area ("Kanifing") is left alone and shown as written, on screen and under the
deck's table, because "constituency not named" reads as a gap in the data when the field was
filled in on every one of them.

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

**Yes is dark blue, No is light blue and NA is orange. Always.** They used to
depend on whether the question was one where Yes is the bad answer, so "Was
security provided for the candidate?" drew Yes in orange while "Were media
present?" drew it in blue, and a reader moving between two slides had to
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

**A tick box is a share of the reports, not of the ticks.** One report ticks several options,
so the ticks add up to more than the reports: Mandinka on three reports of four is 75%, and
dividing by the ticks drew it as 43% - three of the seven boxes ticked, which answers a
question nobody asked and reads as the smaller figure. The deck charts that share, with the
number of reports ticking each option in the option's own name and the base written over the
chart, which is the reference report's own treatment of "unauthorised persons present". The
share is of every report in the export rather than of the ones that reached the question: a
follow-up asked only of the reports that answered Yes would otherwise be a share of a
different denominator on every page, and two of them could not be read against each other.

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
