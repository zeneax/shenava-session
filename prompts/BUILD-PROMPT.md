# Build prompt — Shenava Session

Hand this whole file to a capable coding agent (Claude Code, or any agent that
can write files and run commands) in an **empty folder**. It is written to be
sufficient on its own: everything the agent needs to decide is decided here, and
where a number matters the number is given.

If you only want to understand the product, read [`PRD.md`](PRD.md) instead.
This file is the instruction; that one is the specification. The Persian edition
of this instruction is [`BUILD-PROMPT.fa.md`](BUILD-PROMPT.fa.md), and it is
written as Persian rather than translated — either one on its own builds the
same application.

This file is kept in step with the repository it built. Everything below
describes Shenava Session as it now stands, including the four or five decisions that
were made differently once and corrected.

---

## The prompt

> Build **Shenava Session** — a web application that turns a recorded consultation into
> a transcript, a speaker-labelled dialogue, and a draft of the proposal that
> meeting should produce, in Persian and English at once.
>
> Work in this empty folder. Read the whole of this instruction before writing
> the first file, then work in the order given in **Order of work** at the end.
>
> ### Stack, fixed
>
> Next.js 16 (App Router, TypeScript, React Server Components), Tailwind CSS 4,
> Supabase Postgres reached through `@supabase/supabase-js` with the service
> role key on the server only, `next-intl` for Persian and English with Persian
> as the default and right-to-left, `zod` for every payload boundary, the `docx`
> package for Word output, `lucide-react` for icons, and
> `@mazarix/voice-kernel` from npm (MIT) for the transcription constants.
>
> Two things about Next 16 in particular: the request-time middleware file is
> now `src/proxy.ts`, not `middleware.ts` — the convention was renamed, while
> the import stays `next-intl/middleware`, because next-intl has no `/proxy`
> entry point. And read the guides under `node_modules/next/dist/docs/` rather
> than working from memory of an older version; several conventions moved.
>
> Run the dev server on **port 3100**, not 3000, so it does not collide with
> whatever else the person has running.
>
> Model calls go to **OpenRouter** over its OpenAI-compatible chat completions
> endpoint. One key, `OPENROUTER_API_KEY`. Do not add a provider SDK.
>
> ### The product, in three passes
>
> **Pass one, the words.** The browser reads an audio file, cuts it into pieces,
> and uploads the pieces one at a time to a route that transcribes each one and
> writes it down immediately. When the last piece lands the transcript is
> assembled from the pieces in order.
>
> **Pass two, who said it.** A model reads the transcript and decides which
> sentences are the consultant's and which are the client's. It must not rewrite
> anything. Cut the transcript into numbered sentences server-side and have the
> model answer with ranges — `{"from":12,"to":19,"side":"client"}` — then
> assemble the turns from the transcriber's own words. Feed it about 16,000
> characters at a time, showing each chunk the identities settled so far and the
> tail of the chunk before it. A wrong answer must only ever be a wrong label.
>
> **Pass three, the draft.** A model reads the labelled dialogue and writes the
> proposal draft under the headings listed below, **in both languages at once**,
> as finished formal sentences that could stand in the proposal unchanged. Then
> it stops: the draft is `pending` and a person decides.
>
> ### Pass one in detail — this is the part that is not obvious
>
> A transcription request is capped at about 2 MiB of body and its answer is
> capped by an output token ceiling. An hour of speech breaks both. Build **two
> cutting modes**, chosen on the create form, and do not store which was used —
> infer it from the pieces' lengths so a resumed upload plans the same cuts:
>
> **Mode A, minute pieces.** Pieces of at most `timing.recording.maxSeconds`
> from `@mazarix/voice-kernel` — 60 seconds — sent as uncompressed WAV at the
> kernel's sample rate. Do not cut at the 60-second mark: cut at the quietest
> moment in the 20 seconds before it, found by root-mean-square over short
> frames, so a piece almost never ends mid-word. Send each piece with the tail
> of the previous piece appended to its prompt as context, so a sentence cut at
> a boundary is continued rather than begun again. An hour is about sixty
> requests and twelve to fifteen minutes of waiting.
>
> **Mode B, long pieces.** Pieces of up to **9 minutes**, encoded in the browser
> with `AudioEncoder` (WebCodecs) to **Opus at 24,000 bit/s** and wrapped in an
> **Ogg container you write by hand** — WebCodecs gives you raw packets and
> nothing in the browser will page them for you. Nine minutes at that bitrate is
> about 1.6 MB, under the same cap that one uncompressed minute nearly fills;
> that is the whole point of the mode. An hour becomes six or seven requests and
> four or five minutes of waiting. Two consequences you must build: **raise the
> output ceiling for a piece longer than a minute** (nine minutes of Persian is
> roughly ten thousand tokens — a route that sends a long piece under a short
> ceiling gets a truncated answer that reads like bad transcription rather than
> like an error), and **disable the mode with a visible sentence** when
> `AudioEncoder` is absent or cannot do Opus, which is Safari's case. Do not
> offer it and fail.
>
> **Mode B is the default and is offered first**, because it is what a real
> meeting wants; a browser with no Opus encoder falls back to mode A, since the
> default must never be the disabled option.
>
> **Every tuned number in this pipeline comes from `@mazarix/voice-kernel` and
> nothing may hard-code one.** The prompt, the retry policy, the timeout curve,
> the rescue engine, the bidi algorithm that keeps embedded Latin words where
> they were spoken — read them from the package. A local copy is how two
> programs silently start transcribing differently, and no test can see it.
>
> ### Three failures the route must handle
>
> These were all found against live providers. Treat them as requirements, not
> as edge cases.
>
> **A safety filter stops the answer.** The provider returns
> `finish_reason: "content_filter"` — or `native_finish_reason: "SAFETY"`, so
> read both — with a couple of words of text, zero usage and zero cost. Unless
> you look for it, that is indistinguishable from a successfully transcribed
> quiet minute. It happened on 9 of 37 pieces of ordinary business speech at
> temperature 0, and the same audio cut differently passes, so it is the content
> that flips the coin. Handle it: make a stopped answer its own return value,
> **halve the piece on the server** and ask for each half — PCM16 WAV splits at
> a byte with no decoding, Ogg splits at a page boundary — and keep whatever
> words arrived if a half is stopped too. Record `filtered:split` or
> `filtered:partial` on the piece row. Optionally send the same bytes to the
> second engine the kernel names.
>
> **A fragment is not an answer.** Under about two characters per second of
> audio, ask once more. Still short: mark the piece `short` and let the person
> retry, keeping the third answer whatever its length — by then a genuinely
> quiet stretch is the likelier explanation.
>
> **The answer is cut off at the ceiling.** On a `length` finish, ask again with
> half again the room. Do not parse what was never finished: a truncated JSON
> reads as "unreadable" and sends you looking in the wrong place.
>
> ### Every seat's output ceiling is computed, and lives in one testable file
>
> This is the same mistake made three times, so make it impossible once. Put
> `outputCeilingFor(durationMs, floor)`, `spansCeilingFor(sentences, floor)` and
> `ceilingFor(promptLength, floor)` in **one file with no imports at all** —
> because the modules that call them are marked `server-only`, and `server-only`
> does not resolve outside Next, which would put these numbers beyond the reach
> of a test. Scale the transcriber by the audio (about 40 output tokens a second
> of speech), the speaker pass by the sentence count (about 40 a sentence), and
> the writer by the length of what it was given (about a token a character),
> each never below the configured floor and never above one hard maximum.
>
> An answer stopped at its ceiling does not arrive labelled as such. It arrives
> as a truncated transcript that reads like bad dictation, or as half a JSON
> object that reads as "this model does not return reliable JSON". Both send you
> to the model settings; neither is the model. The tell is in the ledger:
> `tokens_out` of exactly the configured ceiling, twice, to the token.
>
> ### Audio is never stored
>
> Not in the database, not in object storage, not on disk. The browser decodes
> and cuts locally and uploads one piece at a time to a function that
> transcribes it and forgets it; the whole file is never uploaded anywhere. The
> **text** is stored, deliberately, because the text is the product. Say both
> sentences in the README.
>
> One consequence you must build rather than apologise for: sending starts on
> the create page, while the samples are still in that page's memory, so the
> file is chosen exactly once on the ordinary path. If the tab was closed and
> the meeting is reopened with pieces still pending, ask for **the same file**
> again and check its sha256 against the one on the meeting row before sending a
> byte. Say why the second ask happens.
>
> ### The database
>
> Six tables, every name prefixed `shenava_` so the schema can be pasted into a
> Supabase project that already has tables of its own:
>
> **`shenava_settings`**, one row id 1 — the studio's name in both scripts and
> its voice as free text; the transcriber's model, fallback model and output
> ceiling; the writer's model, temperature and output ceiling; a daily and a
> monthly dollar ceiling; retention in days. Default the transcriber to a fast
> multimodal model and the writer to one with judgement — the seats want
> different models, which is why they have separate columns rather than one.
>
> **`shenava_meetings`** — title, client name, language; the audio's *shape*
> (name, bytes, sha256, duration, piece count) but never the audio; transcript;
> dialogue as jsonb; notes as jsonb; the model and timestamp behind each;
> `draft_status` in `pending|approved|rejected`; template and proposal
> references; running cost.
>
> **`shenava_segments`** — one row per piece: index, start and end
> milliseconds, status, text, model, cost, attempts, error, finished time,
> unique on (meeting, index). **This must be a separate table, not a column**,
> and each piece must be written the moment it returns: a tab closed halfway
> through an hour loses nothing, and reopening the meeting carries on from the
> first piece still pending.
>
> **`shenava_runs`** — the ledger: one row per model call, tagged by seat
> (`transcriber|speakers|writer|section`), dated by the call, with token counts
> and cost and whether it succeeded. Read the spending ceilings from **here**,
> not from the figure on the meeting row: a meeting redrawn next month must not
> count against last month's ceiling.
>
> **`shenava_templates`** — a template is the shape of the document a draft is
> poured into: sections with keys, headings in both languages, and a kind
> (`lines|text|phases`); plus `house_lines`, the lines your proposals always end
> with, which the writer is told about so it never proposes them itself.
>
> **`shenava_proposals`** — what an approved draft becomes: a number, a
> language, a client, and the template's sections filled in.
>
> Three functions beside them: `shenava_spend_status()`, read before every model
> call; `shenava_cost_by_seat(days)` for reading the ledger back; and
> `shenava_clear_out()`, which drops meetings past `retention_days`, where zero
> means keep forever. Plus a touch trigger for `updated_at`.
>
> Enable Row Level Security on all six and write **no policies**, which locks
> the anon key out of everything; all access is server-side through the service
> role key. Ship the DDL as `db/01_schema.sql`, idempotent, paste-able into the
> Supabase SQL Editor in one go, with the reasoning in comments. Ship
> `db/02_seed.sql` with the built-in template and **one fully worked sample
> meeting** — transcript, dialogue and draft all present — so that a fresh fork
> shows the entire product on first load, before any key is set. Invent the
> company in the sample; do not use a real one.
>
> ### Spending
>
> Before every model call, read a `shenava_spend_status()` function and refuse
> the call if it would take the day or the month past its ceiling. A limit
> enforced after the call is not a limit. Compute cost from the provider's own
> token counts against a per-model price table and write the ledger row whether
> the call succeeded or not — a failed call that consumed tokens still cost
> money. Default the ceilings to $3 a day and $30 a month.
>
> ### The draft's sections
>
> Two keys settle what the document is — `title`, the engagement in a few words,
> and `engagement`, one of `project|consulting|training|retainer|unknown`, which
> is what chooses the suggested template. Then the sections its TEMPLATE names — **twelve by default**, in this
> order, with these headings in both languages, each wanting exactly what is
> described:
>
> `summary` — «خلاصهٔ پیشنهاد» / Summary. Two or three sentences: what the
> client needs, what is proposed, and what is different for them afterwards.
>
> `understanding` — «درک ما از نیاز شما» / What we heard. The client's situation
> as **they** described it: their business, their team, their tools, what goes
> wrong today and what it costs them. Their words where possible, their numbers
> exactly.
>
> `goals` — «اهداف این همکاری» / Goals of this engagement. What the client wants
> to be true afterwards. Outcomes, not features.
>
> `phases` — «مراحل و زمان‌بندی» / Phases and timeline. The stages the
> consultant proposed and the client accepted, each a title and a line of
> detail, with a `when` only if the meeting settled it — plus a `scheduleNote`,
> one line on the overall timing, only if it was discussed.
>
> `method` — «روش اجرا، مشارکت و پشتیبانی» / How we work, together, and
> afterwards. Discovery, iterations, what the client's side provides, how
> handover and support happen.
>
> `deliverables` — «خروجی‌های تحویلی» / Deliverables. What the client will hold
> at the end. One per line, concrete.
>
> `budget` — «بودجه و زمان، آن‌طور که گفته شد» / Budget and timing, as said.
> **Only** what was actually said about money and time, by whom, in their terms.
>
> `exclusions` — «آنچه در این پیشنهاد نیست» / What is not in this proposal. What
> was named as out of scope, and what the client said must not change.
>
> `assumptions` — «پیش‌فرض‌ها» / Assumptions. Accesses, data, a person on their
> side, a tool staying as it is — said or plainly implied.
>
> `whyUs` — «چرا ما» / Why us. Why this studio and why this way — **only**
> from what the consultant said in the room about how they work, what they have
> built before, or why they proposed it in this shape. Never a year count, a
> client list or a credential the meeting did not contain. Empty is a correct
> answer: a studio's standing lines belong on its template.
>
> `nextSteps` — «گام‌های بعدی» / Next steps. What the two sides agreed to do
> next, in order.
>
> `openQuestions` — «پرسش‌های باز» / Open questions. Everything the meeting left
> unsettled that the proposal will need, phrased as questions.
>
> Plus a working list the reader also sees: `facts`, short lines of who said
> what — every number, name, date and tool — each prefixed CLIENT or CONSULTANT.
> The model writes the facts **first**, then both editions from that list and
> from nothing else.
>
> Three sections a proposal also prints are deliberately **not** here: why us,
> the terms, and the priced packages. Those are the studio's own lines, they
> live on the template as house lines, and the writer is told about them so it
> never proposes them itself.
>
> The notes keys are the template's section keys, so pouring an approved draft
> into a template is a copy and not a mapping. Clamp every length rather than
> rejecting: a model cannot count characters, least of all in Persian, and a
> good set of notes with one over-long line is a good set of notes. A missing
> section arrives empty rather than failing the parse.
>
> ### The writer's rules, which go in its prompt
>
> Every line under a section is a finished, formal, fluent sentence that could
> stand in the proposal unchanged — not a note, not a fragment, not a heading.
>
> **Never invent a price, a timeline, a percentage, a headcount or a deadline.**
> A number that was said is kept exactly; a number that was not said means the
> section stays quieter and the question goes to `openQuestions`. This is the
> rule the whole product is judged on — so put the wording of it in a file with
> no imports, and have a test assert the phrasing, so that softening it has to
> be a deliberate act with a failing test in front of it.
>
> Read the **client's** lines for understanding, goals, budget and exclusions,
> and the **consultant's** lines for phases, method and deliverables — and write
> down only what the client did not object to. A proposal the client already
> argued against in the meeting is not a proposal.
>
> Where the meeting says plain automation would do, or that something should not
> change, write that down. It is often the most useful line in the draft.
>
> The two editions are not translations of each other: each is written in its own
> language for its own reader. Persian is Persian prose — short sentences,
> «است» and «می‌شود», never «می‌باشد», no English sentence structure. Real
> industry terms keep their Latin spelling inside Persian (Postgres, TypeScript);
> consumer brands are written in Persian (تلگرام، گوگل).
>
> The studio's name and voice come from `shenava_settings`, never from the code.
> No exclamation marks, no emoji, no "transform", no "revolutionary", no
> "AI-powered" as a benefit.
>
> Return JSON only. Validate it with zod and store what validation returned, not
> what the model sent.
>
> ### Screens
>
> **`/` — the landing page**, public, one page, bilingual, Persian
> right-to-left. What it does; the three passes as a diagram; the two modes side
> by side with their real numbers (60 s WAV, ~60 requests, 12–15 min against
> 9 min Opus at 24 kbit/s, ~7 requests, 4–5 min); what a meeting costs; a link
> to the sample meeting; and two buttons — open the dashboard, and fork it.
> Animate it: a waveform resolving into lines of text, the three passes arriving
> on scroll, counters that count. Make it good; it is the first thing anyone
> sees and the reason they fork it. Point the fork button at the repository
> itself, and check where it lands — a fork URL that is one path segment wrong
> opens an empty page and nobody reports it.
>
> **`/app` — meetings.** The list: title, client, when, status, cost, draft
> status. Newest first. A meeting can be deleted from here, with a confirmation.
>
> **`/app/new` — new meeting.** Title, client, language, mode, file. Choosing
> the file plans the cuts **in the browser** and shows what it will do — "7
> pieces, about 4 minutes" — before anything is sent. Sending then starts on
> this same page: the samples are already here, so the file is chosen once.
>
> **`/app/m/[id]` — one meeting**, the working surface, revealed in stages:
> the pieces as a strip with their state while it transcribes; the transcript
> with an editor; the dialogue with either side alone, a side button on each
> turn, sentence-level splitting of a turn, and swap-both-sides; the draft
> section by section, each with *edit* and *write again*; a box for an
> instruction and *draw it again*; and at the bottom the **suggested template**
> with *pour the draft into this*, plus Word and print-sheet downloads of the
> transcript, the dialogue or the notes.
>
> Three corrections in pass two, **none of which calls a model**: pressing the
> other side on a turn moves that turn and nothing else; a turn of several
> sentences opens sentence by sentence and splits in place, keeping what comes
> before and after on its own side (the usual miss is a one-word answer
> swallowed by the turn around it, and «بله» is exactly the sentence a reader
> reaches for — so the editing splitter must not glue short fragments onto
> their neighbour, even though the splitter that numbers sentences for the model
> should); and swap-sides moves the whole meeting for a pass that had the two
> people the wrong way round from the start. Do **not** merge adjacent turns of
> the same side after an edit: two paragraphs marked *Consultant* read exactly
> like one, and leaving them apart keeps every earlier turn at the index the
> page just used, so a second edit lands where the reader pointed.
>
> **`/app/settings`** — the studio's name and voice, the two seats, the
> ceilings, retention. One server action saves it, and on refusal it returns the
> validation's own issues so the screen names the field that was wrong rather
> than saying "could not save".
>
> **`/app/connections`** — the Supabase URL and keys and the OpenRouter key,
> read from the environment and shown as *set* or *missing*, **never their
> values**, with a **test** button that really calls all three and answers green
> or red per line; and the schema file to paste, with a check for whether the
> tables exist yet. This page must repeat every check the setup script makes,
> because it is where a person goes when something stops working later.
>
> **`/app/templates`** — the built-in template and your own. A template's
> SECTIONS are edited here and they are not a printing choice: what a template
> names is what the writer is asked to produce. Each carries a key, a heading in
> both languages, what it holds (`text` | `lines` | `phases`), whether an empty
> one is dropped, and a **brief** — the one sentence the model is given for that
> section. Adding a clause here and redrawing a meeting writes that clause.
> Plus the house lines. A key is added or removed, never renamed: it is what a
> stored draft holds its lines under, and a key the template no longer names is
> dropped on read, so renaming orphans every draft silently. Derive the key from
> the heading when a section is added and show it read-only after that.
>
> ### Keys, the setup script, and the door
>
> No key in code, in the database, or in the browser.
> `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
> `OPENROUTER_API_KEY` are required; `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
> `OPENROUTER_APP_NAME` and `OPENROUTER_APP_URL` are optional. Ship
> `.env.example` with every one of them and a comment saying what it is for.
>
> **Write a setup script**, `npm run setup`, and make it the whole of
> configuration. It asks for one value at a time and **tests each answer against
> the real service before asking the next question** — fetches the Supabase
> project, tries the service key against a real table, counts the six tables and
> stops to have the two SQL files pasted if they are missing, calls OpenRouter
> and prints the remaining credit. It writes `.env.local` only at the end, after
> showing every value it is about to write — a key as `set · 219 characters`,
> never the key itself — and it never prints a key back. Re-running it keeps
> every answer the person does not change.
>
> The reason for the script rather than "edit this file": a wrong value in an
> environment file is not discovered when it is written. It is discovered later,
> as a page that will not load, at which point the file looks perfectly
> reasonable and you are debugging the wrong half of the problem.
>
> **The door.** `APP_PASSWORD` is empty by default, meaning no login at all,
> which is correct on `localhost`: the only person who can open the page is the
> person sitting at the machine. Put the whole decision of "who is asking" in one
> function in one file — `allowed()` in `lib/auth.ts` — so that real accounts can
> be added later without touching anything else.
>
> Be honest about what a half-built door does. If `allowed()` demands a signed
> session cookie whenever `APP_PASSWORD` is set, and you have not built a
> sign-in page that issues one, then setting it does not protect anything: it
> refuses every write and leaves no way in. So either write the sign-in page, or
> say plainly — in `.env.example`, in the README, and by having the setup script
> write it empty without offering to set it — that this build has no login and
> the variable must stay empty until one exists. Keep `sessionCookie()` written
> and exported, so the page that is missing has something to mint from.
>
> Then say the rest of it plainly in the README: a public deployment carries your
> own OpenRouter key, and anyone who opens the record page is spending your
> money, so write the door before deploying rather than after.
>
> ### Design
>
> Do not ship a template. Pick a real direction and hold it on every page: a
> type scale, a small palette with tokens on `:root`, dark and light both
> defined and both tested, generous spacing, and motion that is purposeful and
> under 300 ms.
>
> **Check the palette as PAIRS, not as colours.** A role is only readable
> against a particular surface, and a design like this has three per edition —
> the ground, the raised panel, the sunken well. Every role must clear 4.5:1
> against all three in both editions, and the worst pairing is the one that
> decides a value. The two that catch people out invert between editions: in the
> light one the worst surface is the SUNKEN well, darker than the ground; in the
> dark one it is the RAISED panel, the lightest thing there. Nothing in a build
> checks this — `tsc` does not read CSS and the tests do not render — so run the
> script in `docs/the-colours-are-measured.md` whenever a token moves.
>
> **Give the reader a light / dark / system switch**, setting `data-theme` on
> the root from an inline script before the first paint. A stylesheet with both
> editions and no switch leaves the operating system deciding alone, and a
> reader in dark mode with no way to ask for light reports it as "the
> application is too dark" — which sounds like a palette problem and is not.
>
> **Size the type for Persian, not for Latin.** Persian spends on dots and loops
> what a Latin face spends on nothing, so 12px Persian is smaller than 12px
> English in every way that matters. Put the scale in the theme block so one
> edit moves every string; a hundred edits across forty files will not stay
> consistent.
>
> Persian is the default language and right-to-left: test every
> page in Persian at **320 pixels wide** and fix any horizontal scroll. Watch
> for absolutely positioned elements (a screen-reader-only label is
> `position: absolute`) inside a horizontal scroller — they are laid out by an
> ancestor outside it, so the scroller does not clip them and the document
> widens instead. Give any such scroller `position: relative`.
>
> Both message catalogues must hold the same key set, and nothing user-facing
> may be a string literal in a component. A key whose value is an object cannot
> be asked for as a string: `t("mode")` beside a `mode: { … }` block throws at
> render while the page still answers 200, so give the label its own key.
>
> Three failures on this side answer 200 and look like nothing, so build against
> them from the start: a Tailwind 4 arbitrary value the browser discards without
> a word; a navigation into a dynamic route that shows no sign of having been
> clicked because there is no `loading.tsx` above it; and a long await inside
> `useTransition`, which entangles every navigation in the application. Add a
> headless-browser script that opens each page and reports anything that
> rejects, and an `instrumentation-client.ts` that catches a rejection whose
> value is not an `Error` before Next's overlay coerces it into
> `[object Object]` with the handler's own stack — in development only, and
> ignoring what a browser extension injected, because the first hour of that was
> spent on a wallet extension's JSON-RPC error.
>
> ### How the tests are run, and what that constrains
>
> `npm test` is `node --test tests/*.test.ts` — run directly against the
> TypeScript, with no bundler in front of it. Two consequences shape the layout
> of `src/lib`:
>
> A relative import inside `src/lib` **carries its `.ts` extension**
> (`from "./text.ts"`), because node's ESM resolver does not guess one.
> Turbopack and `tsc` both accept the explicit form, so set
> `allowImportingTsExtensions` in `tsconfig.json` and use it everywhere.
>
> Pure logic must not live in a module marked `server-only`: that package does
> not resolve outside Next, so anything importing it is unreachable from a test.
> Mark a module `server-only` when it holds a key, a database client or a
> `next/*` import — not because it happens to run on the server today. The
> ceilings, the settings shape, the proposal guide, the Word writer and the
> print sheet are all outside it for exactly this reason.
>
> Aim for about a hundred tests and no browser or network in any of them. Have
> one of them build a real .docx and read its XML back: that test found a bug
> the typecheck could not — the draft's own title was not reaching the document.
>
> ### Write `AGENTS.md` yourself — the rules that reach the next agent
>
> The last act of building this is a file at the root called `AGENTS.md` (and a
> `CLAUDE.md` that only includes it), which anyone — person or agent — reads
> before changing this code. What goes in it is not a guess; it is this, because
> this is what a later reader cannot get out of the code:
>
> **Say the documentation exists and is to be read rather than inferred from the
> code**, and name the files: the README in both languages, the specification in
> both languages, this instruction, and the walkthrough of one recording that is
> read before touching the cutting code.
>
> **Write down the five non-negotiable rules.** The kernel owns the tuned
> numbers and no local copy is allowed. `planSegments` stays a pure function of
> the samples — no clock, no randomness, nothing read off the device — because
> resumption depends on the same file producing the same cuts, and breaking it
> shows up as a transcript with a hole in it. The audio is never stored. The
> draft never invents a figure. The section list belongs to the template — what
> a template names is what the writer is asked for — and the prohibition against
> inventing a figure does not: it is composed into the prompt separately, where
> no template can reach it.
>
> **Say that both languages move together:** one key set across both
> catalogues, Persian written as Persian rather than translated, and the
> `t("mode")` trap beside a `mode: { … }` block, which throws at render while
> the page still answers 200.
>
> **Write down what the tests constrain, with a code example:** the `.ts`
> extension on a relative import inside `src/lib`, and that pure logic must not
> live inside a `server-only` module — naming the files that are kept outside it
> for exactly that reason.
>
> **Say what runs before a commit:** `npm run typecheck && npm test`, then the
> Persian pages at 320 pixels, with the absolutely-positioned-descendant trap.
>
> **And say where notes go:** in `docs/`, and only for something that cost real
> time **because nothing in the repository could have told you what was wrong** —
> with the symptom, the actual cause, and the command that would find it again.
> A bug that was merely hard needs no note.
>
> Write the Persian edition of that file too, beside the prompts, and keep the
> two in step.
>
> ### Order of work
>
> 1. The project, the environment example, the schema and the seed, the
>    connections page. Stop here and confirm it runs on port 3100 and the sample
>    meeting renders with no OpenRouter key set.
> 2. The pure logic, with unit tests as you go: the splitter and the quietest
>    cut; the WAV writer and the byte-level halving; the Opus encoder and the
>    Ogg container and its page-level halving; the sentence cutter and
>    ranges-to-turns and the two splitters; the notes schema and its section
>    merge; the ceilings; Word and the print sheet.
> 3. The server: the OpenRouter client, the price table, the spend check and the
>    ledger, the transcription call with its three failure handlers, the speaker
>    pass, the writer, one-section rewrite, and the routes.
> 4. The dashboard: list, new, the meeting page with all three stages, settings,
>    templates.
> 5. The landing page and its animation.
> 6. The setup script, and the README written around it — three commands, then
>    the questions the script asks, in the order it asks them.
> 7. A `docs/` note for each thing that took more than an hour to find: the
>    symptom as it appeared, what it actually was, and the command that would
>    find it again. The last part is the point. Then a walkthrough of one
>    recording from chosen to drafted, with every number and the reason for it,
>    which is the document to read before touching the cutting code.
> 8. `AGENTS.md` and `CLAUDE.md`, with the rules above.
> 9. The Persian editions: the README, the walkthrough, this instruction, and
>    `AGENTS.md`.
>    Each written as Persian, not translated. GitHub renders a README in a font
>    stack with no Persian glyphs and its sanitiser strips `style`, so if the
>    Persian edition matters, give it a page of its own in a readable face and
>    link to it.
>
> ### What proves it is done
>
> The sample meeting renders every stage with no key set. A 39-minute file plans
> as 5 pieces in mode B and 39 in mode A. Safari sees mode B disabled with a
> reason. A filtered piece produces two halved requests and a piece row that
> says so. The draft contains no figure the transcript does not contain.
> Approving pours the draft into the template and produces a numbered proposal.
> `npm run typecheck && npm test` is green. Both catalogues hold the same keys,
> and no Persian page scrolls sideways at 320 pixels.

---

## Notes for whoever runs this prompt

It is long on purpose. Every paragraph that reads like an over-specification is
a thing that was got wrong once: the safety filter, the output ceiling on long
pieces — three times, in three seats — the Ogg container, the editing splitter
gluing «بله» onto its neighbour, the absolutely positioned label widening the
page, the half-built door that locks you out, the overlay whose whole message
was `[object Object]`. An agent given the short version of this prompt will
write something that looks right and fails on real audio.

The one thing you should change before running it is the **stack**, if you do
not want Next.js and Supabase. The three passes, the two cutting modes and the
failure handling are the product; the framework is not.

The rules an agent working *inside* the finished repository has to know are a
different document: [`AGENTS.fa.md`](AGENTS.fa.md) in Persian, and
[`AGENTS.md`](../AGENTS.md) at the root of the repository in English.
