# Working on Shenava Session

Shenava Session turns a recorded consultation into a transcript, a speaker-labelled
dialogue and a draft of the proposal that meeting should produce, in Persian and
English at once.

**The documentation exists. Read it rather than inferring from the code.**

`README.md` — running it, the two cutting modes, why there is no login.
`prompts/PRD.md` — the specification, and `PRD.fa.md` in Persian.
`prompts/BUILD-PROMPT.md` — the instruction this project can be rebuilt from.
`docs/the-journey-of-a-file.md` — one recording from chosen to drafted, with
every number and the reason for it. **Read this before touching
`src/lib/meetings/`.**
`docs/` holds four more notes, each about a failure the repository could not
have warned you about. `docs/README.md` says which is which. Two are worth
knowing before you start: `the-colours-are-measured.md`, because nothing in the
build checks whether two of your tokens can be seen together, and
`a-shape-the-database-accepts.md`, because a `jsonb` column has no shape and
will take a value no reader here will accept.

## Five rules that are not negotiable

**The kernel owns the tuned numbers.** `@mazarix/voice-kernel` (MIT, on npm)
holds the recording cap, the sample rate, the WAV header, the transcription
prompt, the retry policy, the timeout curve, the rescue engine and the bidi
algorithm. Nothing here may carry its own copy of one of them. Two programs with
their own copies drift apart silently and no test can see it.

**`planSegments` must stay a pure function of the samples.** No clock, no
randomness, nothing read off the device. A meeting is an hour of pieces sent one
at a time and a closed tab is ordinary; resumption depends on the same file
producing exactly the same cuts. Break it and the symptom is a transcript with a
hole in it, with nothing to point at.

**The audio is never stored.** Not in the database, not in object storage, not on
disk. The browser cuts locally and uploads one piece at a time to a function
that transcribes it and forgets it. The text is kept; the recording is not.

**The draft never invents a figure.** No price, date, percentage, headcount or
deadline that the meeting did not contain. A number that was said is kept
exactly; a number that was not said becomes an open question. This is the one
rule the product is judged on.

**The section list is the template's, and the prohibition is not.** What a
template names is what the writer is asked for, so a studio can add a clause,
drop one, or reword what a clause asks for without a deploy — that is the point
of `template.sections` and of each section's `brief`. `WRITER_RULES` in
`proposal-guide.ts` is fixed and no template can reach it. A studio that could
edit its own proposal template into permission to invent a price would have been
handed the one thing this product exists to withhold, so the prohibition is
composed into the prompt separately and a test asserts its wording.

## Both languages move together

`messages/fa.json` and `messages/en.json` must hold the same key set. Persian is
not a translation of the English — it is written as Persian, and the two
editions may differ in wording where that reads better. Real industry terms keep
their Latin spelling inside Persian (Postgres, TypeScript, Opus); consumer brands
do not.

A key whose value is an object cannot be asked for as a string: `t("mode")` next
to a `mode: { … }` block throws at render while the page still answers 200. Give
the label its own key.

## A relative import inside `src/lib` carries its `.ts` extension

```ts
import { readLastJson } from "./text.ts";   // yes
import { readLastJson } from "./text";      // no — the tests cannot load it
```

The tests are run by `node --test` directly against the TypeScript, with no
bundler in front of them, and node's ESM resolver does not guess an extension.
Turbopack and `tsc` both accept the explicit form, so the explicit form is the
one that works in both places. `tsconfig.json` sets
`allowImportingTsExtensions` for exactly this.

The same constraint is why pure logic must not live in a module marked
`server-only`: that package does not resolve outside Next, so anything importing
it is unreachable from a test. `lib/meetings/ceiling.ts`,
`lib/settings-shape.ts` and `lib/meetings/proposal-guide.ts` exist because of it,
and `docx.ts` and `print.ts` carry a comment saying why they are deliberately not
marked. The test that builds a real .docx and reads its XML back found a bug the
typecheck could not: the draft's own title was not reaching the document.

Mark a module `server-only` when it holds a key, a database client, or a
`next/*` import — not because it happens to run on the server today.

## Before you commit

```bash
npm run typecheck && npm test
```

If a colour token moved, run the check in `docs/the-colours-are-measured.md`.
It reports the worst pairing in each edition, which is the only number that
matters: a role is readable against a SURFACE, not in the abstract, and this
design has three surfaces per edition. `tsc` does not read CSS and the tests do
not render, so this is the only thing that will tell you.

Then check the Persian pages at 320 pixels wide for horizontal scroll. Watch for
absolutely positioned descendants of a horizontal scroller — a screen-reader-only
label is `position: absolute`, and if the scroller is not its containing block it
is not clipped, it widens the document instead. Give the scroller
`position: relative`.

## Notes go in docs/

When something costs you real time **because nothing in the repository could
have told you what was wrong**, add a note: the symptom as it appeared, what it
turned out to be, and the command that would find it again. The last part is the
point. A bug that was merely hard to fix needs no note — the fix is in the
history.

---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
