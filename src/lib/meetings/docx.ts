import {
  AlignmentType, CharacterSet, Document, HeadingLevel, Packer, Paragraph, TextRun,
} from "docx";
import {
  ENGAGEMENT_LABELS, FIXED_LABELS, EMPTY_SECTION, isEmptySection, sectionLabel,
  type MeetingNotes, type NotesLang, type SectionDef, type SectionValue,
} from "./notes-schema.ts";
import { SPEAKER_LABELS, type Dialogue } from "./dialogue-schema.ts";
import { durationLabel, meetingDate, metaJoin } from "./format.ts";

/* Deliberately NOT `server-only`: `docx` builds the file in pure JavaScript and needs no server at all, and `server-only` does not resolve
   outside Next — marking it would put this beyond the reach of a test that
   builds a real document and reads it back. */

/**
 * A meeting as a Word document.
 *
 * `docx` builds the file in pure JavaScript, which is what lets this run in a
 * serverless function; the alternative — rendering HTML through a browser —
 * needs a Chromium the function does not have, and is why the PDF is the
 * browser's own print of the sheet in `./print` rather than a file from here.
 *
 * Persian paragraphs are marked bidirectional and aligned to their START,
 * and every run is marked right-to-left, so Word lays the text out as Persian
 * rather than as left-to-right text that happens to contain Persian letters.
 *
 * START, and not RIGHT. In a `w:bidi` paragraph Word reads `w:jc` left/right
 * as logical, not physical: `right` is the END of a right-to-left line, which
 * is its left edge. Every Persian paragraph here was `right`, and Word set
 * all of them flush left. Quick Look reads the same value physically and
 * showed them flush right, which is why this survived a look. Measured in
 * Word 16.112 with one paragraph per value: right → left edge, left → right
 * edge, start → right edge, end → left edge, none → right edge.
 *
 * The font is EMBEDDED when the caller passes it, and only named otherwise.
 * Named alone, Word substitutes on a machine without Vazirmatn — the Persian
 * came out in a Times-like Arabic face, legible and not what the studio sends
 * a client. Embedding is 120 KB, which is what a page of Persian in its own
 * face costs. It is an argument rather than a file read here because this
 * module is pure on purpose (see the note above): the route reads the file,
 * the test reads the same file, and this module never touches a disk.
 *
 * The studio's name is an ARGUMENT, not a constant. It is printed on the
 * document and set as its author, and a forkable project cannot ship somebody
 * else's name in a file a client receives.
 */

/** Who the document is from. Read from the settings row by the route. */
export type Studio = { name: string; nameFa: string };

export function studioName(studio: Studio, lang: NotesLang): string {
  const chosen = lang === "fa" ? studio.nameFa || studio.name : studio.name || studio.nameFa;
  return chosen.trim();
}

export type MeetingForDocument = {
  title: string;
  client_name: string;
  created_at: string;
  duration_ms: number;
  transcript: string | null;
  notes: MeetingNotes | null;
  dialogue: Dialogue | null;
  /** The sections the meeting's template names, in its order. */
  sections: SectionDef[];
};

export type DocumentPart = "transcript" | "dialogue" | "notes";

/** The TrueType bytes of the document face, for embedding. Regular is enough: Word thickens it for bold. */
export type DocumentFonts = { regular: Buffer };

export function partTitle(part: DocumentPart, lang: NotesLang): string {
  if (part === "transcript") return lang === "fa" ? "رونوشت جلسه" : "Meeting transcript";
  if (part === "dialogue") return lang === "fa" ? "گفت‌وگوی جلسه، به تفکیک گوینده" : "Meeting dialogue, by speaker";
  return lang === "fa" ? "پیش‌نویس پروپوزال از جلسه" : "Proposal draft from the meeting";
}

const FONT = "Vazirmatn";

type Heading = (typeof HeadingLevel)[keyof typeof HeadingLevel];

/**
 * `w:lang` names the language of the complex-script text, and without it Word
 * proofs Persian as whatever the document's default is — every word wrongly
 * spelt, red from the first line to the last. `value` is for any Latin run
 * inside the same text (Postgres, WhatsApp), `bidirectional` for the Persian.
 */
const LANGUAGE = {
  fa: { value: "en-US", bidirectional: "fa-IR" },
  en: { value: "en-US" },
} as const;

function run(text: string, lang: NotesLang, extra: { bold?: boolean; size?: number } = {}) {
  return new TextRun({ text, rightToLeft: lang === "fa", font: FONT, language: LANGUAGE[lang], ...extra });
}

function para(
  text: string,
  lang: NotesLang,
  options: { heading?: Heading; bullet?: boolean; muted?: boolean } = {},
) {
  return new Paragraph({
    bidirectional: lang === "fa",
    alignment: lang === "fa" ? AlignmentType.START : AlignmentType.LEFT,
    heading: options.heading,
    bullet: options.bullet ? { level: 0 } : undefined,
    spacing: { after: options.heading ? 120 : 80 },
    children: [run(text, lang, options.muted ? { size: 20 } : {})],
  });
}

/**
 * What the document is called.
 *
 * For the DRAFT, the draft's own title — the proposal's heading, in that
 * edition's own language. It was written for exactly this, and using the
 * meeting's title instead prints «جلسهٔ نمونه» at the top of a document whose
 * subject is a stock table, which is how this was found.
 *
 * For the transcript and the dialogue, the meeting's title, because those are
 * records of a meeting and not proposals.
 */
export function documentHeading(
  meeting: MeetingForDocument,
  lang: NotesLang,
  part: DocumentPart,
): string {
  if (part === "notes") {
    const drafted = meeting.notes?.[lang].title.trim();
    if (drafted) return drafted;
  }
  return meeting.title.trim();
}

function header(
  meeting: MeetingForDocument,
  lang: NotesLang,
  kind: DocumentPart,
  studio: Studio,
): Paragraph[] {
  const what = partTitle(kind, lang);
  const meta = metaJoin([
    meeting.client_name
      ? (lang === "fa" ? `کلاینت: ${meeting.client_name}` : `Client: ${meeting.client_name}`)
      : "",
    meetingDate(meeting.created_at, lang),
    meeting.duration_ms > 0 ? durationLabel(meeting.duration_ms, lang) : "",
    studioName(studio, lang),
  ], lang);
  return [
    para(documentHeading(meeting, lang, kind) || what, lang, { heading: HeadingLevel.TITLE }),
    para(what, lang, { muted: true }),
    para(meta, lang, { muted: true }),
    new Paragraph({ text: "" }),
  ];
}

function transcriptBody(text: string, lang: NotesLang): Paragraph[] {
  return text
    .split(/\n{2,}|\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => para(p, lang));
}

/** Who said what: the side in bold, then the turn. Names, when the pass found them, in the heading. */
function dialogueBody(dialogue: Dialogue, lang: NotesLang): Paragraph[] {
  const out: Paragraph[] = [];
  const named = metaJoin([
    dialogue.consultant.name ? `${SPEAKER_LABELS.consultant[lang]}: ${dialogue.consultant.name}` : "",
    dialogue.client.name ? `${SPEAKER_LABELS.client[lang]}: ${dialogue.client.name}` : "",
  ], lang);
  if (named) out.push(para(named, lang, { muted: true }));
  for (const turn of dialogue.turns) {
    out.push(new Paragraph({
      bidirectional: lang === "fa",
      alignment: lang === "fa" ? AlignmentType.START : AlignmentType.LEFT,
      spacing: { after: 100 },
      children: [
        run(`${SPEAKER_LABELS[turn.who][lang]}: `, lang, { bold: true }),
        run(turn.text, lang),
      ],
    }));
  }
  return out;
}

/**
 * One section, whatever kind it is.
 *
 * The order, the headings and the kinds all come from the template now, so this
 * is a loop where it used to be a list of named fields — which is the whole
 * point: a clause a studio added last week prints here without this file
 * knowing its name.
 */
function section(value: SectionValue, def: SectionDef, lang: NotesLang): Paragraph[] {
  const out = [para(sectionLabel(def, lang), lang, { heading: HeadingLevel.HEADING_2 })];
  if (def.kind === "text") {
    if (value.text) out.push(para(value.text, lang));
    return out;
  }
  if (def.kind === "phases") {
    for (const ph of value.phases) {
      const when = ph.when ? ` (${ph.when})` : "";
      const detail = ph.detail ? ` — ${ph.detail}` : "";
      out.push(para(`${ph.title}${when}${detail}`, lang, { bullet: true }));
    }
    if (value.scheduleNote) out.push(para(value.scheduleNote, lang));
    return out;
  }
  for (const line of value.lines) out.push(para(line, lang, { bullet: true }));
  return out;
}

function edition(notes: MeetingNotes, sections: readonly SectionDef[], lang: NotesLang): Paragraph[] {
  const e = notes[lang];
  const out: Paragraph[] = [
    para(`${FIXED_LABELS.engagement[lang]}: ${ENGAGEMENT_LABELS[e.engagement][lang]}`, lang, { muted: true }),
  ];
  for (const def of sections) {
    const value = e.sections[def.key] ?? EMPTY_SECTION;
    // An empty section is dropped whatever `optional` says, because a heading
    // with nothing under it in a document a client receives reads as a mistake.
    if (isEmptySection(value)) continue;
    out.push(...section(value, def, lang));
  }
  return out;
}

export async function buildMeetingDocx(input: {
  meeting: MeetingForDocument;
  part: DocumentPart;
  lang: NotesLang;
  studio: Studio;
  fonts?: DocumentFonts;
}): Promise<Buffer> {
  const { meeting, part, lang, studio, fonts } = input;
  const body =
    part === "transcript" ? transcriptBody(meeting.transcript ?? "", lang)
    : part === "dialogue" ? (meeting.dialogue ? dialogueBody(meeting.dialogue, lang) : [])
    : meeting.notes ? edition(meeting.notes, meeting.sections, lang) : [];

  const doc = new Document({
    creator: studioName(studio, lang) || "Shenava Session",
    title: meeting.title || partTitle(part, "en"),
    styles: {
      default: { document: { run: { font: FONT, size: 22, language: LANGUAGE[lang] } } },
    },
    fonts: fonts ? [{ name: FONT, data: fonts.regular, characterSet: CharacterSet.ARABIC }] : undefined,
    sections: [{
      properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      children: [...header(meeting, lang, part, studio), ...body],
    }],
  });
  return Packer.toBuffer(doc);
}
