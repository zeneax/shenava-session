<h1>Shenava Session · شنوای جلسه</h1>

**A recorded consultation becomes a transcript, a dialogue with the two
speakers told apart, and a draft of the proposal that meeting should produce —
in Persian and English at once.**

Fork it, run it locally, drop in an audio file, read the proposal it writes.

**[نسخهٔ فارسی ←](README.fa.md)** · [read it in a Persian face](https://zeneax.github.io/shenava-session/)

![Shenava Session — the landing page](docs/images/landing-en.png)

> **Status: complete, and taken end to end on a real recording** — chosen,
> cut, transcribed, told apart by speaker, and drafted. The unit suite and the
> typecheck are green. If something breaks on your own audio, [open an
> issue](../../issues) with whatever it was.

---

## What it does

**One — the words.** Your browser cuts the recording into pieces and sends them
one at a time to a transcription model. Each piece is saved the moment it comes
back, so a closed tab halfway through an hour loses nothing.

**Two — who said it.** A model decides which sentences are the consultant's and
which are the client's. It never rewrites anything: it answers with sentence
ranges, and the turns are assembled from the transcriber's own words, so a wrong
answer is only ever a wrong label. You can fix a label, split a turn sentence by
sentence, or swap both sides — none of which calls a model.

**Three — the draft.** A model reads the labelled dialogue and writes the
proposal under the headings its template names — twelve to begin with — in both
languages at once, as finished sentences
you could paste into a document. It is told never to invent a price, a date or a
number: what the meeting left unsettled goes under *open questions*.

**Then it stops.** The draft waits for you. Edit a section by typing, or ask for
one to be written again with an instruction — which comes back as a *proposal*
shown against the lines it would replace, and writes nothing until you accept
it. Redraw the whole thing if you would rather. When you are satisfied, pour it
into a proposal template and download it as Word or a print sheet.

**And the sections are yours.** What a template names is what the model is asked
to write, so adding a clause on the Templates page and redrawing a meeting is
the whole loop — no deploy, no code.

---

## Two ways of cutting the audio

This is the part of the product that is not obvious, so it is worth a paragraph
before you choose.

A transcription request is capped at about 2 MiB. An hour of speech does not
fit, so the recording is cut — and how it is cut decides how long you wait.

**Long pieces, the default** — up to 9 minutes per piece, compressed in your
browser to Opus at 24 kbit/s. Nine minutes comes to about 1.6 MB, still under the cap that one
uncompressed minute nearly fills, which is the whole trick. An hour becomes six
or seven requests and four or five minutes of waiting. **Use this for a real
meeting.** It needs `AudioEncoder` (WebCodecs), which Safari does not yet
provide for Opus — there the option is disabled with a reason rather than
offered and failed, and the form falls back to minute pieces.

**Minute pieces** — 60-second uncompressed WAV pieces, cut at the quietest
moment in the 20 seconds before each minute so a piece rarely ends mid-word,
each one carrying the tail of the one before it as context. An hour is about
sixty requests, twelve to fifteen minutes of waiting. Use it for short
recordings, or when the long mode is unavailable.

Both modes read their tuned constants — the 60 seconds, the prompt, the retry
policy, the timeout curve, the rescue engine, the bidi algorithm that keeps
embedded Latin words where they were spoken — from
[`@mazarix/voice-kernel`](https://www.npmjs.com/package/@mazarix/voice-kernel),
a small MIT package on npm. It is a dependency rather than a copy on purpose:
two programs with their own copies of a number drift apart silently, and no test
can see it.

---

## Your audio is never stored

Not in the database, not in object storage, not on disk. Your browser decodes
and cuts the file locally and uploads one piece at a time to a function that
transcribes that piece and forgets it. The whole file is never uploaded
anywhere.

The **text** is kept — the transcript, the dialogue, the draft — deliberately,
because the text is the product. You come back to it days later, edit it, hand
it to a model, download it. A transcript that is not kept cannot be any of
those things.

---

## Getting it running — step by step

**The short version.** Three commands, and all the configuration happens
inside the middle one:

```bash
npm install     # 1 · get the dependencies
npm run setup   # 2 · it asks for Supabase, then for OpenRouter, and tests both
npm run dev     # 3 · http://localhost:3100
```

`npm run setup` is the whole configuration. It walks you through making the
Supabase project, creating the tables, and pasting in the two keys — asking one
question at a time and **testing every answer against the real service before
it asks the next one.** You do not edit any file by hand, and you do not need
to have anything prepared before you start it.

Budget about ten minutes. Eight of them are Supabase creating your project
while you wait.

**Before you start** you need:

- **Node 20 or newer** — check with `node -v`
- a free **[Supabase](https://supabase.com)** account — the database
- an **[OpenRouter](https://openrouter.ai)** account with a few dollars of
  credit — it pays for every model call

You can make both accounts now, or when the script asks for them. It waits.

---

### Step 1 · Get the code and install it

Press **Fork** at the top of this page, then:

```bash
git clone https://github.com/<your-username>/shenava.git
cd shenava
npm install
```

That is the only step that is purely about the code. Everything from here is
the setup script asking you questions.

---

### Step 2 · Run the setup script

```bash
npm run setup
```

Leave this terminal open and put a browser window next to it. The script now
asks for four things in this order, and nothing is written to disk until the
very end.

#### 2a · Your Supabase project URL

The script pauses on `The Project URL >`. If you do not have a project yet,
make it now while the script waits:

1. Open **[supabase.com/dashboard](https://supabase.com/dashboard)** and press
   **New project**.
2. Give it any name — `shenava` is fine. Set a database password (the app never
   uses it, but save it anyway). Pick the region closest to you, because every
   query in the app makes that round trip.
3. Press **Create new project** and wait two to five minutes. The dashboard says
   when it is ready.
4. In that project, open **Project Settings → API** and copy the **Project
   URL**. It looks like `https://abcdefghijklm.supabase.co`.

Paste it into the script and press Enter. It fetches the project and answers
`✓ Reachable.` before moving on.

#### 2b · Your Supabase service_role key

From the same **Project Settings → API** page, copy the **`service_role`** key —
the long one marked *secret*. **Not the `anon` one.** It bypasses row-level
security, which is why it stays on the server and never goes into a
`NEXT_PUBLIC_` variable.

Paste it in. The script tries it against a real table and answers `✓ The key
works.`

It then offers the **anon key**, which is optional: press Enter to skip it. The
app does not use it — every table has RLS on with no policies, so that key can
read nothing.

#### 2c · The tables — two SQL files to paste

The script now counts the six tables itself. If they are already there it says
so and moves on. If they are not, it stops and asks you to make them:

1. In your Supabase project, open **SQL Editor** in the left sidebar, then
   **New query**.
2. Open [`db/01_schema.sql`](db/01_schema.sql) from this repository, copy the
   **whole** file, paste it in, press **Run**. It creates six tables, three
   functions and the security rules.
3. **New query** again, and do the same with [`db/02_seed.sql`](db/02_seed.sql).
   This one gives you the built-in proposal template and **three fully worked
   sample meetings** — transcript, speaker-labelled dialogue and finished
   proposal draft each — so the app has something to show you before you have
   recorded anything. Three, because one meeting cannot show the range a draft
   has to survive: a bookshop where no figure was ever said, a distributor where
   both sides named figures and settled the weeks, and a law firm that settled
   almost nothing. All three are invented; delete them whenever you like.

Both files are safe to run twice, and you should see `Success. No rows
returned` after each. **The order matters:** `01_schema.sql` first. Running the
seed against a database with no tables is the most common error here.

Go back to the terminal, answer `y`, and the script counts the tables again and
confirms all six.

#### 2d · Your OpenRouter key

OpenRouter is how the app reaches every model — one key for all of them.

1. Make an account at **[openrouter.ai](https://openrouter.ai)**.
2. Open **[openrouter.ai/keys](https://openrouter.ai/keys)** and press **Create
   key**. Copy it now; the page will not show it again.
3. Add a few dollars of credit under **Credits**. An hour-long meeting costs
   roughly **20 cents** end to end — a few cents to transcribe, fifteen to
   twenty to draft.

Paste the key into the script. It calls OpenRouter and prints the credit you
have left, so you know in that second that both the key and the balance are
good.

> Worth knowing in advance: below about **$1** of remaining credit, OpenRouter
> starts answering `402` to concurrent calls. If transcription ever fails on
> every piece at once, check the balance before looking at anything else.

#### 2e · It writes `.env.local`

The script shows you every value it is about to write — keys as
`set · 219 characters`, never the key itself — and asks once before writing.
Answer `y` and it writes `.env.local`, which is gitignored.

It does **not** ask for a dashboard password, and writes `APP_PASSWORD` empty —
see *There is no login* below for why setting one would lock you out rather
than protect you.

Run `npm run setup` again any time to change any of it. It keeps every value
you do not change — Enter at any question keeps what is already there — and it
never prints a key back to the screen.

**If you would rather not use the script:**

```bash
cp .env.example .env.local
```

`.env.example` lists every variable with a comment explaining it. Three are
required: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
`OPENROUTER_API_KEY`. Leave `APP_PASSWORD` empty. You still have to run the two
SQL files from 2c yourself.

---

### Step 3 · Run it

```bash
npm run dev
```

Open **[http://localhost:3100](http://localhost:3100)**. Port 3100 rather than
3000, so it does not collide with whatever else you have running.

Press **Dashboard**. You should see the three sample meetings in the list. Open
one and you can read its transcript, its dialogue with the two speakers told
apart, and its proposal draft in either language — all without a single model
call, because it came from the seed file.

In the header there is a switch for the other language and one for light, dark
or whatever your machine says. It starts on your machine's setting and remembers
a choice, so a reader whose laptop is in dark mode is not stuck with a dark
Shenava Session.

**If something is wrong**, open **Connections** in the left rail. It repeats
every check the setup script made and answers line by line: which variables are
set, whether Supabase and OpenRouter actually respond, and whether all six
tables exist. It is the first place to look whenever anything stops working.

> Next.js reads the environment when it starts. If you change `.env.local`,
> stop the dev server and start it again.

---

### Step 4 · Put your own studio's name in

Open **Settings**. The draft is written against what is on this page, so filling
it in is what makes the output sound like your studio rather than nobody's.

Set your studio's name in both scripts, and write a line or two under *how your
studio writes* — words to avoid, how formal to be, whatever you would tell a new
writer on your team. It goes into the prompt as your own note.

While you are there: the two seats have their own models, the spending ceilings
default to **$3 a day and $30 a month**, and a call that would take you past
either is refused *before it is sent*.

---

### Step 5 · Your first real meeting

Press **New meeting**. Give it a title and the client's name, choose the language
spoken, and pick a recording.

Choosing the file **uploads nothing.** Your browser decodes it, cuts it, and shows
you the plan first — *"39 minutes of audio becomes 5 pieces, about 4 minutes of
waiting"* — with a bar for each piece. Only then does anything leave your machine,
and only one piece at a time.

**Choose the cutting mode deliberately.** *Long pieces* is what you want for a
real meeting: nine minutes per request, six or seven requests for an hour, four to
five minutes of waiting. *Minute pieces* is sixty requests and twelve to fifteen
minutes, and is there for short recordings and for browsers with no Opus encoder
(Safari, at the time of writing — the option disables itself and says so).

Press **Create it and start sending**, and the sending starts on that same page —
the recording is still in the page's memory, so you choose it once and only once.
When the last piece is in, the meeting opens. Leave the tab open until then.

If you close it, nothing is lost: every piece is saved the moment it returns, and
reopening the meeting asks you to point at the same file again and carries on from
where it stopped. It checks the file's fingerprint before sending a single byte.
That second ask is what "the audio is never stored" costs — and it only happens
when the samples are genuinely gone, never on the first pass.

When the transcript lands: **tell the two speakers apart**, then **draft the
proposal**, then read it, fix what you want, approve it, and pour it into a
template. Word and print-sheet downloads are at the bottom.

---

### Step 6 · Deploying it, if you want to

You do not have to — this works perfectly well on your own machine, which is where
most people will keep it.

If you do deploy it (Vercel takes this repository as it is), **two things change
and both matter.** A public deployment carries **your** OpenRouter key, and anyone
who finds the URL and opens the record page is spending your money — so it needs a
way in that this build does not yet have (see the next section). Write the sign-in
before you deploy, not after. And set `OPENROUTER_APP_URL` to the real address,
which is how OpenRouter labels your usage.

## There is no login, and that is on purpose

On your own machine, the only person who can open `localhost:3100` is you. A
password there would be like locking a folder on your own desktop.

**And half a door is worse than none.** `APP_PASSWORD` is read by `allowed()` in
`lib/auth.ts`, which with a value set demands a signed session cookie — but
nothing in this application ever issues one. There is no sign-in page, and
`sessionCookie()` is exported and never called. So setting `APP_PASSWORD` does
not add a login: it refuses every write with `denied` and leaves you no way in.
`npm run setup` therefore writes it empty and does not offer to set it.

**One case still needs a door.** If you deploy this to a public domain — to show
a client, say — the deployment carries **your** OpenRouter key. That case needs
the sign-in written first: a page that checks the password and sets the cookie
`sessionCookie()` already knows how to mint. Until then, keep it on your own
machine.

The whole decision of "who is asking" lives in one function in one file. If you
want real accounts — Supabase Auth, a magic link, several people — that is the
only place to change.

---

## What it costs

Transcription is a few cents an hour of audio. The draft is fifteen to twenty
cents, because it is the pass that needs judgement and gets a better model. Both
seats have their own model, temperature and ceiling on the Settings page.

Every model call is preceded by a check against a daily and a monthly dollar
ceiling and refused before it is sent if it would go over — a limit enforced
after the call is not a limit. The defaults are three dollars a day and thirty a
month, and every call is a row in a ledger you can read.

---

## Repository layout

```
db/        01_schema.sql, 02_seed.sql — paste into the Supabase SQL Editor
scripts/   setup.mjs — `npm run setup`, which asks for each key and tests it
           catch-rejections.mjs — opens each page in a headless Chrome and
           reports anything that rejects (see docs/silent-css-and-dead-clicks.md)
prompts/   the spec, the prompt that builds this from an empty folder, and the
           rules for changing it — each in English and Persian
docs/      the journey of a file, and notes on things that were hard to find
           index.html — the Persian README in a face that can read it
src/       the application
tests/     `npm test` — 106 of them, no browser and no network needed
```

```bash
npm install        # first, once
npm run setup      # then: Supabase, the tables, the OpenRouter key — each one tested
npm run dev        # http://localhost:3100
npm test           # the unit suite
npm run typecheck
```

**If you are about to change how the audio is cut, read
[`docs/the-journey-of-a-file.md`](docs/the-journey-of-a-file.md) first** (or
[the Persian edition](docs/the-journey-of-a-file.fa.md)). It walks one recording
from the moment it is chosen to the moment a draft is waiting, with every number
and the reason for it — including the three ways a piece comes back wrong, which
are most of what that code is for.

---

## The prompt that built this

[`prompts/BUILD-PROMPT.md`](prompts/BUILD-PROMPT.md) is a complete instruction
for a coding agent to build this project from an empty folder — the stack, the
two cutting modes with their real numbers, the three failure modes of live
transcription providers, the template-owned proposal sections, the writer's rules, the
schema, the screens, the setup script and the order of work. Running it produces
this application, including the `AGENTS.md` that tells the next agent how to
change it.

Take it, change the stack, change the sections, and build your own. That is what
it is there for. [`prompts/PRD.md`](prompts/PRD.md) is the specification it is
written against, and [`prompts/AGENTS.md`](AGENTS.md) is what an agent working
inside the finished repository reads.

**Every one of them exists in Persian too** — written as Persian, not
translated: [`BUILD-PROMPT.fa.md`](prompts/BUILD-PROMPT.fa.md),
[`PRD.fa.md`](prompts/PRD.fa.md) and [`AGENTS.fa.md`](prompts/AGENTS.fa.md).
The Persian build prompt is self-sufficient: an agent given only that file, in
an empty folder, arrives at this same application.
[`prompts/README.md`](prompts/README.md) is the map of the folder, and
[`prompts/README.fa.md`](prompts/README.fa.md) the Persian one.

---

## Licence

MIT. See [`LICENSE`](LICENSE).
