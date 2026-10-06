# prompts/

Everything here is a prompt or the specification a prompt is written against,
and everything here exists in both languages. The Persian editions are written
as Persian rather than translated — which is also the rule the product itself
follows when it writes a proposal.

**[`PRD.md`](PRD.md)** · **[`PRD.fa.md`](PRD.fa.md)** — the specification. What
Shenava Session is, the two ways it cuts audio and why, the three failure modes of live
transcription providers, how every seat's output ceiling is computed, the data
model, the screens, why there is no login, and what is deliberately left out of
version one. Read this to understand the product.

**[`BUILD-PROMPT.md`](BUILD-PROMPT.md)** ·
**[`BUILD-PROMPT.fa.md`](BUILD-PROMPT.fa.md)** — a complete instruction for a
coding agent to build this project from an empty folder. Paste either one into
Claude Code, or any agent that can write files and run commands, and it has
everything it needs to decide: the stack, every tuned number, the algorithms,
the template-owned proposal sections, the writer's rules, the schema, the screens, the
setup script, the order of work, what to put in `AGENTS.md` at the end, and what
proves it is finished.

They are long on purpose. Every paragraph that reads like an over-specification
is a thing that was got wrong once against real audio. An agent given a short
version of one will write something that looks right and fails on the first real
recording.

**[`AGENTS.fa.md`](AGENTS.fa.md)** — the rules an agent working *inside* the
finished repository has to know, in Persian: the five that are not negotiable,
how the two languages move together, why a relative import in `src/lib` carries
its `.ts` extension, what runs before a commit, and which bugs earn a note in
`docs/`. The English edition is [`AGENTS.md`](../AGENTS.md) at the root of the
repository, because that is the path an agent reads by convention; the two say
the same thing and are changed together.

So: **PRD** to understand it, **BUILD-PROMPT** to rebuild it, **AGENTS** to
change it.

---

## The prompts the product itself uses

These are not here — they live in the code, because they are read by it. But
they are deliberately kept in one place per seat so they can be found and
changed:

The **transcription** prompt is not ours at all: it comes from
`@mazarix/voice-kernel`, along with the retry policy, the timeout curve and the
bidi algorithm. Changing transcription behaviour means changing the package, not
the app — that is the point of it being a package.

The **speaker pass** prompt asks for sentence ranges, never rewritten text.

The **writer** prompt is the long one, and the rule it exists to enforce is:
never invent a price, a date or a number. Its section list lives in
`src/lib/meetings/proposal-guide.ts`, in a file with no imports so that a test
can assert the wording — softening that rule has to be a deliberate act with a
failing test in front of it. `BUILD-PROMPT.md` has all twelve default headings and what
each is for.

The **studio's own voice** is not in any prompt. It comes from
`shenava_settings` — the studio name in both scripts and a free-text note on
tone — so that a fork sounds like its own studio without editing code.
