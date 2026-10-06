/**
 * Opus packets in an Ogg container, written and cut here, with no library.
 *
 * WHY THIS EXISTS. The long-piece mode sends up to nine minutes of a meeting
 * per request. As WAV that is seventeen megabytes; as Opus at 24 kbit/s it is
 * about 1.6 MB and still under the endpoint's two-mebibyte cap. The browser's
 * `AudioEncoder` produces the Opus packets but no container, and the provider
 * takes `ogg` — so the container is written here: two header pages and then
 * the packets, laced into pages of about a second each.
 *
 * WHY IT ALSO CUTS. A piece the provider's filter stops is halved on the
 * server and asked for in two (see the segments route). A WAV halves at a
 * byte; an Ogg halves at a page, and a page boundary is a packet boundary, so
 * the two halves are each a valid stream once their sequence numbers, flags,
 * granule positions and checksums are rewritten. That is `halveOgg`.
 *
 * Client-safe and pure. The tests write a stream, read it back, halve it and
 * verify every checksum.
 */

/** Opus granule positions are always at 48 kHz, whatever the input rate. */
export const OPUS_GRANULE_RATE = 48_000;

const MAGIC = "OggS";
const HEADER_BYTES = 27;
const SERIAL = 0x53484e56; // "SHNV", fixed: the same samples give the same bytes.

/* ── CRC ─────────────────────────────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let r = i << 24;
    for (let j = 0; j < 8; j += 1) r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) >>> 0 : (r << 1) >>> 0;
    table[i] = r >>> 0;
  }
  return table;
})();

/** Ogg's CRC-32: polynomial 0x04c11db7, no reflection, zero start, zero finish. */
export function oggCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = ((crc << 8) ^ (CRC_TABLE[((crc >>> 24) ^ (bytes[i] ?? 0)) & 0xff] ?? 0)) >>> 0;
  }
  return crc >>> 0;
}

/* ── Writing ─────────────────────────────────────────────────────────────── */

export type OggPage = {
  flags: number;
  granule: number;
  serial: number;
  sequence: number;
  /** The packets in this page. The last may continue on the next page. */
  segments: Uint8Array[];
  /** Lacing values, as written. */
  lacing: number[];
};

function lacingFor(length: number): number[] {
  const out: number[] = [];
  let left = length;
  while (left >= 255) { out.push(255); left -= 255; }
  out.push(left);
  return out;
}

/** One page's bytes, checksum included. */
export function writePage(page: OggPage): Uint8Array {
  const body = page.segments.reduce((n, s) => n + s.byteLength, 0);
  const out = new Uint8Array(HEADER_BYTES + page.lacing.length + body);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 4; i += 1) out[i] = MAGIC.charCodeAt(i);
  out[4] = 0;
  out[5] = page.flags;
  // 64-bit granule as two 32-bit halves; positions here never exceed 2^53.
  view.setUint32(6, page.granule >>> 0, true);
  view.setUint32(10, Math.floor(page.granule / 0x100000000) >>> 0, true);
  view.setUint32(14, page.serial >>> 0, true);
  view.setUint32(18, page.sequence >>> 0, true);
  view.setUint32(22, 0, true);
  out[26] = page.lacing.length;
  page.lacing.forEach((l, i) => { out[HEADER_BYTES + i] = l; });
  let at = HEADER_BYTES + page.lacing.length;
  for (const s of page.segments) { out.set(s, at); at += s.byteLength; }
  view.setUint32(22, oggCrc(out), true);
  return out;
}

function text(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function opusHead(channels: number, preSkip: number, inputRate: number): Uint8Array {
  const out = new Uint8Array(19);
  const view = new DataView(out.buffer);
  out.set(text("OpusHead"), 0);
  out[8] = 1;
  out[9] = channels;
  view.setUint16(10, preSkip, true);
  view.setUint32(12, inputRate, true);
  view.setInt16(16, 0, true);
  out[18] = 0;
  return out;
}

function opusTags(): Uint8Array {
  const vendor = text("Shenava Session");
  const out = new Uint8Array(8 + 4 + vendor.byteLength + 4);
  const view = new DataView(out.buffer);
  out.set(text("OpusTags"), 0);
  view.setUint32(8, vendor.byteLength, true);
  out.set(vendor, 12);
  view.setUint32(12 + vendor.byteLength, 0, true);
  return out;
}

export type OpusPacket = {
  data: Uint8Array;
  /** Where the packet ends, in 48 kHz samples from the start of the stream. */
  granule: number;
};

/**
 * The whole stream: OpusHead, OpusTags, then the packets, about a second of
 * them per page, the last page marked as the end.
 */
export function muxOpusOgg(
  packets: OpusPacket[],
  options: { channels: number; inputRate: number; preSkip?: number; packetsPerPage?: number } ,
): Uint8Array {
  const perPage = Math.max(1, Math.min(255, options.packetsPerPage ?? 50));
  const pages: Uint8Array[] = [];
  let sequence = 0;
  const push = (flags: number, granule: number, segments: Uint8Array[]) => {
    pages.push(writePage({
      flags, granule, serial: SERIAL, sequence, segments,
      lacing: segments.flatMap((s) => lacingFor(s.byteLength)),
    }));
    sequence += 1;
  };

  push(0x02, 0, [opusHead(options.channels, options.preSkip ?? 0, options.inputRate)]);
  push(0x00, 0, [opusTags()]);

  for (let i = 0; i < packets.length; i += perPage) {
    const group = packets.slice(i, i + perPage);
    const last = i + perPage >= packets.length;
    const tail = group[group.length - 1];
    push(last ? 0x04 : 0x00, tail ? tail.granule : 0, group.map((p) => p.data));
  }
  if (packets.length === 0) push(0x04, 0, []);

  const total = pages.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of pages) { out.set(p, at); at += p.byteLength; }
  return out;
}

/* ── Reading ─────────────────────────────────────────────────────────────── */

export type ParsedPage = OggPage & { crcOk: boolean; byteLength: number };

/** Every page, in order. Throws on anything that is not an Ogg stream. */
export function parseOggPages(bytes: Uint8Array): ParsedPage[] {
  const pages: ParsedPage[] = [];
  let at = 0;
  while (at + HEADER_BYTES <= bytes.byteLength) {
    if (String.fromCharCode(...bytes.subarray(at, at + 4)) !== MAGIC) throw new Error("not an Ogg page");
    const view = new DataView(bytes.buffer, bytes.byteOffset + at, bytes.byteLength - at);
    const flags = bytes[at + 5] ?? 0;
    const granule = view.getUint32(6, true) + view.getUint32(10, true) * 0x100000000;
    const serial = view.getUint32(14, true);
    const sequence = view.getUint32(18, true);
    const crc = view.getUint32(22, true);
    const count = bytes[at + 26] ?? 0;
    const lacing = Array.from(bytes.subarray(at + HEADER_BYTES, at + HEADER_BYTES + count));
    const bodyStart = at + HEADER_BYTES + count;
    const body = lacing.reduce((n, l) => n + l, 0);
    const pageBytes = bytes.subarray(at, bodyStart + body);
    if (pageBytes.byteLength < HEADER_BYTES + count + body) throw new Error("truncated Ogg page");

    // Segments: lacing values join into packets; a 255 continues into the next.
    const segments: Uint8Array[] = [];
    let cursor = bodyStart;
    let pending = 0;
    let start = cursor;
    for (const l of lacing) {
      pending += l;
      cursor += l;
      if (l < 255) { segments.push(bytes.subarray(start, start + pending)); start = cursor; pending = 0; }
    }
    if (pending > 0) segments.push(bytes.subarray(start, start + pending));

    const copy = new Uint8Array(pageBytes);
    new DataView(copy.buffer).setUint32(22, 0, true);
    pages.push({
      flags, granule, serial, sequence, segments, lacing,
      crcOk: oggCrc(copy) === crc,
      byteLength: pageBytes.byteLength,
    });
    at = bodyStart + body;
  }
  return pages;
}

/** Whether the bytes begin like the stream this file writes. */
export function isOgg(bytes: Uint8Array): boolean {
  return bytes.byteLength >= HEADER_BYTES && String.fromCharCode(...bytes.subarray(0, 4)) === MAGIC;
}

/** How long the stream plays, from its last granule. Zero for anything else. */
export function oggDurationMs(bytes: Uint8Array): number {
  if (!isOgg(bytes)) return 0;
  try {
    const pages = parseOggPages(bytes);
    const last = pages[pages.length - 1];
    return last ? Math.round((last.granule / OPUS_GRANULE_RATE) * 1000) : 0;
  } catch {
    return 0;
  }
}

function assemble(pages: OggPage[]): Uint8Array {
  const written = pages.map((p, i) => writePage({ ...p, sequence: i }));
  const out = new Uint8Array(written.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of written) { out.set(p, at); at += p.byteLength; }
  return out;
}

/**
 * Two streams from one, cut at the page nearest the middle of the audio.
 *
 * Both keep the two header pages. The first half's last page is marked as
 * the end; the second half's granules are rebased so it starts at zero, and
 * every page in both is renumbered and re-summed. Null when the stream has
 * too few audio pages to be worth cutting.
 */
export function halveOgg(bytes: Uint8Array): [Uint8Array, Uint8Array] | null {
  if (!isOgg(bytes)) return null;
  let pages: ParsedPage[];
  try { pages = parseOggPages(bytes); } catch { return null; }
  if (pages.length < 6) return null;
  const headers = pages.slice(0, 2);
  const audio = pages.slice(2);
  if (audio.length < 4) return null;

  const last = audio[audio.length - 1];
  if (!last) return null;
  const target = last.granule / 2;
  // `cut` is the first page of the second half; the first half ends at the
  // page before it, so that is the granule measured against the middle.
  let cut = 1;
  const endOf = (i: number) => audio[i]?.granule ?? 0;
  for (let i = 1; i < audio.length; i += 1) {
    if (Math.abs(endOf(i - 1) - target) < Math.abs(endOf(cut - 1) - target)) cut = i;
  }
  // The cut is the first page of the second half; it must leave both sides
  // with at least one page.
  cut = Math.max(1, Math.min(audio.length - 1, cut));
  const base = endOf(cut - 1);

  const first = audio.slice(0, cut).map((p, i, arr) => ({ ...p, flags: i === arr.length - 1 ? (p.flags | 0x04) : (p.flags & ~0x04) }));
  const second = audio.slice(cut).map((p) => ({ ...p, granule: Math.max(0, p.granule - base), flags: p.flags & ~0x01 }));

  return [assemble([...headers, ...first]), assemble([...headers, ...second])];
}
