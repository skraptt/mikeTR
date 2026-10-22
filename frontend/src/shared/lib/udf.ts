// mikeTR: UYAP Doküman Formatı (.udf) <-> Word (.docx), in the browser.
//
// A .udf file is a zip holding one content.xml: every character of the
// document sits in one CDATA text pool, and <elements> lays it out as
// paragraphs (and tables) whose <content> runs point into the pool by
// character offset and length. Format notes: UYAP's own editor output, as
// documented by the community (e.g. github.com/saidsurucu/UDF-Toolkit/Docs.md).
//
// Uploaded .udf files are converted to .docx before upload, so the viewer,
// editing and the assistant handle them like any Word file; a Word document
// can be downloaded as .udf for UYAP. Only text and its common formatting
// (bold, italic, underline, size, alignment, indents, tables) are carried
// over; images, headers and footers are not.

import JSZip from "jszip";
import {
    AlignmentType,
    Document,
    Packer,
    Paragraph,
    Tab,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
    type IParagraphOptions,
} from "docx";

export const UDF_MIME = "application/octet-stream";
const DOCX_MIME =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function isUdfFile(file: { name: string }): boolean {
    return /\.udf$/i.test(file.name);
}

// ---------------------------------------------------------------------------
// Shared model

export type UdfRun = {
    text: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    /** Font size in points. */
    size?: number;
    family?: string;
};

/** 0 left, 1 center, 2 right, 3 justified (UDF's Alignment values). */
export type UdfAlignment = 0 | 1 | 2 | 3;

export type UdfParagraph = {
    kind: "paragraph";
    runs: UdfRun[];
    alignment?: UdfAlignment;
    /** Points. */
    leftIndent?: number;
    rightIndent?: number;
    firstLineIndent?: number;
};

export type UdfTable = {
    kind: "table";
    rows: UdfParagraph[][][]; // rows -> cells -> paragraphs
};

export type UdfBlock = UdfParagraph | UdfTable;

// Code points, not UTF-16 units: offsets in content.xml count characters.
function chars(text: string): string[] {
    return Array.from(text);
}

// JSZip reads bytes everywhere; Blob support differs between environments.
// A Uint8Array made here is recognised even when the buffer came from another
// realm (an iframe, or jsdom in tests).
async function bytes(data: ArrayBuffer | Blob): Promise<Uint8Array> {
    return new Uint8Array("arrayBuffer" in data ? await data.arrayBuffer() : data);
}

// ---------------------------------------------------------------------------
// Reading .udf

function attr(el: Element, name: string): string | null {
    return el.getAttribute(name);
}

function numberAttr(el: Element, name: string): number | undefined {
    const value = attr(el, name);
    if (value === null || value === "") return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

function boolAttr(el: Element, name: string): boolean | undefined {
    const value = attr(el, name);
    return value === null ? undefined : value === "true";
}

function readParagraph(el: Element, pool: string[]): UdfParagraph {
    const runs: UdfRun[] = [];
    for (const child of Array.from(el.children)) {
        const start = numberAttr(child, "startOffset");
        const length = numberAttr(child, "length");
        if (start === undefined || length === undefined) continue;
        if (child.tagName === "tab") {
            runs.push({ text: "\t" });
            continue;
        }
        if (child.tagName !== "content") continue; // images are not carried over
        const text = pool
            .slice(start, start + length)
            .join("")
            // Empty paragraphs hold a zero-width space; line breaks end paragraphs.
            .replace(/[​￼]/g, "")
            .replace(/\r?\n/g, "");
        if (!text) continue;
        runs.push({
            text,
            bold: boolAttr(child, "bold"),
            italic: boolAttr(child, "italic"),
            underline: boolAttr(child, "underline"),
            size: numberAttr(child, "size"),
            family: attr(child, "family") ?? undefined,
        });
    }
    const alignment = numberAttr(el, "Alignment");
    return {
        kind: "paragraph",
        runs,
        alignment:
            alignment !== undefined && alignment >= 0 && alignment <= 3
                ? (alignment as UdfAlignment)
                : undefined,
        leftIndent: numberAttr(el, "LeftIndent"),
        rightIndent: numberAttr(el, "RightIndent"),
        firstLineIndent: numberAttr(el, "FirstLineIndent"),
    };
}

function readTable(el: Element, pool: string[]): UdfTable {
    const rows = Array.from(el.children)
        .filter((row) => row.tagName === "row")
        .map((row) =>
            Array.from(row.children)
                .filter((cell) => cell.tagName === "cell")
                .map((cell) =>
                    Array.from(cell.children)
                        .filter((p) => p.tagName === "paragraph")
                        .map((p) => readParagraph(p, pool)),
                ),
        );
    return { kind: "table", rows };
}

/** The document body of a .udf file. Headers and footers are left out. */
export async function readUdf(data: ArrayBuffer | Blob): Promise<UdfBlock[]> {
    const zip = await JSZip.loadAsync(await bytes(data));
    const entry = zip.file("content.xml");
    if (!entry) throw new Error("Not a UDF file: content.xml is missing.");
    const xml = await entry.async("string");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) {
        throw new Error("The UDF file's content.xml could not be read.");
    }
    const root = doc.documentElement;
    const contentEl = Array.from(root.children).find((c) => c.tagName === "content");
    const pool = chars(contentEl?.textContent ?? "");
    const elements = Array.from(root.children).find((c) => c.tagName === "elements");
    const blocks: UdfBlock[] = [];
    for (const el of Array.from(elements?.children ?? [])) {
        if (el.tagName === "paragraph") blocks.push(readParagraph(el, pool));
        else if (el.tagName === "table") blocks.push(readTable(el, pool));
    }
    return blocks;
}

// ---------------------------------------------------------------------------
// .udf -> .docx

const DOCX_ALIGNMENT = {
    0: AlignmentType.LEFT,
    1: AlignmentType.CENTER,
    2: AlignmentType.RIGHT,
    3: AlignmentType.JUSTIFIED,
} as const;

// docx measures indents in twentieths of a point.
const TWIPS_PER_POINT = 20;

function docxParagraph(p: UdfParagraph): Paragraph {
    const options: IParagraphOptions = {
        alignment: p.alignment === undefined ? undefined : DOCX_ALIGNMENT[p.alignment],
        indent:
            p.leftIndent || p.firstLineIndent
                ? {
                      left: Math.round((p.leftIndent ?? 0) * TWIPS_PER_POINT),
                      firstLine: Math.round((p.firstLineIndent ?? 0) * TWIPS_PER_POINT),
                  }
                : undefined,
        children: p.runs.map(
            (run) =>
                new TextRun({
                    children: run.text
                        .split("\t")
                        .flatMap((part, i) => (i > 0 ? [new Tab(), part] : [part])),
                    bold: run.bold,
                    italics: run.italic,
                    underline: run.underline ? {} : undefined,
                    // docx sizes are half-points.
                    size: run.size ? Math.round(run.size * 2) : undefined,
                    font: run.family,
                }),
        ),
    };
    return new Paragraph(options);
}

function udfDocument(blocks: UdfBlock[]): Document {
    const children = blocks.map((block) =>
        block.kind === "paragraph"
            ? docxParagraph(block)
            : new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  rows: block.rows.map(
                      (cells) =>
                          new TableRow({
                              children: cells.map(
                                  (paragraphs) =>
                                      new TableCell({
                                          children: (paragraphs.length
                                              ? paragraphs
                                              : [{ kind: "paragraph", runs: [] } as UdfParagraph]
                                          ).map(docxParagraph),
                                      }),
                              ),
                          }),
                  ),
              }),
    );
    return new Document({
        styles: {
            default: { document: { run: { font: "Times New Roman", size: 24 } } },
        },
        sections: [{ children }],
    });
}

export async function udfToDocxBlob(blocks: UdfBlock[]): Promise<Blob> {
    return new Blob([await Packer.toArrayBuffer(udfDocument(blocks))], { type: DOCX_MIME });
}

/** A picked .udf file as the .docx file that is uploaded in its place. */
export async function convertUdfFileToDocx(file: File): Promise<File> {
    const docx = await Packer.toArrayBuffer(udfDocument(await readUdf(file)));
    return new File([docx], file.name.replace(/\.udf$/i, ".docx"), {
        type: DOCX_MIME,
        lastModified: file.lastModified,
    });
}

// ---------------------------------------------------------------------------
// .docx -> .udf

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function wChild(el: Element, name: string): Element | undefined {
    return Array.from(el.children).find((c) => c.localName === name && c.namespaceURI === W);
}

function wVal(el: Element | undefined): string | null {
    return el?.getAttributeNS(W, "val") ?? el?.getAttribute("w:val") ?? null;
}

function onOff(el: Element | undefined): boolean | undefined {
    if (!el) return undefined;
    const value = wVal(el);
    return value === null || !["0", "false", "off", "none"].includes(value);
}

function readDocxParagraph(p: Element): UdfParagraph {
    const pPr = wChild(p, "pPr");
    const jc = wVal(wChild(pPr ?? p, "jc"));
    const alignment: UdfAlignment | undefined =
        jc === "center" ? 1 : jc === "right" || jc === "end" ? 2 : jc === "both" || jc === "distribute" ? 3 : jc ? 0 : undefined;
    const ind = pPr ? wChild(pPr, "ind") : undefined;
    const twips = (name: string) => {
        const v = ind?.getAttributeNS(W, name) ?? ind?.getAttribute(`w:${name}`);
        return v ? Number(v) / TWIPS_PER_POINT : undefined;
    };
    const runs: UdfRun[] = [];
    // Runs may sit inside hyperlinks, insertions (tracked changes) and smart tags.
    const visit = (el: Element) => {
        for (const child of Array.from(el.children)) {
            if (child.namespaceURI !== W) continue;
            if (child.localName === "r") {
                const rPr = wChild(child, "rPr");
                const sz = rPr ? wVal(wChild(rPr, "sz")) : null;
                const fonts = rPr ? wChild(rPr, "rFonts") : undefined;
                let text = "";
                for (const part of Array.from(child.children)) {
                    if (part.localName === "t") text += part.textContent ?? "";
                    else if (part.localName === "tab") text += "\t";
                    else if (part.localName === "br" || part.localName === "cr") text += " ";
                }
                if (!text) continue;
                const u = rPr ? wChild(rPr, "u") : undefined;
                runs.push({
                    text,
                    bold: rPr ? onOff(wChild(rPr, "b")) : undefined,
                    italic: rPr ? onOff(wChild(rPr, "i")) : undefined,
                    underline: u ? wVal(u) !== "none" : undefined,
                    size: sz ? Number(sz) / 2 : undefined,
                    family:
                        fonts?.getAttributeNS(W, "ascii") ?? fonts?.getAttribute("w:ascii") ?? undefined,
                });
            } else if (child.localName !== "del" && child.localName !== "pPr") {
                visit(child);
            }
        }
    };
    visit(p);
    return {
        kind: "paragraph",
        runs,
        alignment,
        leftIndent: twips("left") ?? twips("start"),
        firstLineIndent: twips("firstLine"),
    };
}

/** The body of a .docx file: paragraphs and tables, in order. */
export async function readDocxBlocks(data: ArrayBuffer | Blob): Promise<UdfBlock[]> {
    const zip = await JSZip.loadAsync(await bytes(data));
    const xml = await zip.file("word/document.xml")?.async("string");
    if (!xml) throw new Error("Not a Word file: word/document.xml is missing.");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const body = doc.getElementsByTagNameNS(W, "body")[0];
    const blocks: UdfBlock[] = [];
    for (const el of Array.from(body?.children ?? [])) {
        if (el.namespaceURI !== W) continue;
        if (el.localName === "p") blocks.push(readDocxParagraph(el));
        else if (el.localName === "tbl") {
            const rows = Array.from(el.children)
                .filter((r) => r.localName === "tr")
                .map((tr) =>
                    Array.from(tr.children)
                        .filter((c) => c.localName === "tc")
                        .map((tc) =>
                            Array.from(tc.children)
                                .filter((p) => p.localName === "p")
                                .map(readDocxParagraph),
                        ),
                );
            blocks.push({ kind: "table", rows });
        }
    }
    return blocks;
}

const DEFAULT_FAMILY = "Times New Roman";
const DEFAULT_SIZE = 12;
// Total table width in points: inside an A4 page with the editor's 1.5 cm
// margins (595.28 - 2 x 42.525 = 510), with room to spare.
const TABLE_WIDTH = 480;

function escapeAttr(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/**
 * content.xml for the given blocks, in the shape UYAP's editor writes and
 * reads (cross-checked against files the editor opens, e.g. LexUDF's): tabs
 * stay as characters inside the text, every paragraph's last run carries its
 * line break, and tables carry the row and cell attributes the editor expects.
 */
export function buildUdfXml(blocks: UdfBlock[]): string {
    const pool: string[] = [];
    const paragraphXml = (p: UdfParagraph): string => {
        const runs = p.runs
            .map((r) => ({ ...r, text: r.text.replace(/\r?\n/g, " ") }))
            .filter((r) => r.text.length > 0);
        // An empty paragraph is just its line break.
        if (runs.length === 0) runs.push({ text: "" });
        const parts = runs.map((run, i) => {
            const text = chars(run.text + (i === runs.length - 1 ? "\n" : ""));
            const style =
                `family="${escapeAttr(run.family ?? DEFAULT_FAMILY)}" size="${run.size ?? DEFAULT_SIZE}"` +
                (run.bold ? ` bold="true"` : "") +
                (run.italic ? ` italic="true"` : "") +
                (run.underline ? ` underline="true"` : "");
            const xml = `<content ${style} startOffset="${pool.length}" length="${text.length}" />`;
            pool.push(...text);
            return xml;
        });
        const attrs =
            `Alignment="${p.alignment ?? 0}"` +
            (p.leftIndent ? ` LeftIndent="${p.leftIndent.toFixed(1)}"` : "") +
            (p.rightIndent ? ` RightIndent="${p.rightIndent.toFixed(1)}"` : "") +
            (p.firstLineIndent ? ` FirstLineIndent="${p.firstLineIndent.toFixed(1)}"` : "");
        return `<paragraph ${attrs}>${parts.join("")}</paragraph>\n`;
    };

    // Tables as the editor saves them (a table made and saved in UYAP Doküman
    // Editörü v5.4): whole-number column spans, rows with only a name and type,
    // bare cells whose paragraphs carry a small inset.
    const cellParagraph = (p: UdfParagraph): UdfParagraph => ({
        ...p,
        leftIndent: p.leftIndent ?? 3,
        rightIndent: p.rightIndent ?? 1,
    });
    const items: string[] = [];
    blocks.forEach((block) => {
        if (block.kind === "paragraph") {
            items.push(paragraphXml(block));
            return;
        }
        const columns = Math.max(1, ...block.rows.map((r) => r.length));
        const span = Math.round(TABLE_WIDTH / columns);
        const rows = block.rows
            .map((cells, r) => {
                const padded: UdfParagraph[][] = [...cells, ...Array(columns - cells.length).fill([])];
                return (
                    `<row rowName="row${r + 1}" rowType="dataRow">` +
                    padded
                        .map(
                            (paragraphs) =>
                                `<cell>${(paragraphs.length ? paragraphs : [{ kind: "paragraph", runs: [] } as UdfParagraph])
                                    .map((p) => paragraphXml(cellParagraph(p)).trimEnd())
                                    .join("")}</cell>`,
                        )
                        .join("") +
                    `</row>`
                );
            })
            .join("");
        items.push(
            `<table tableName="Sabit" columnCount="${columns}" columnSpans="${Array(columns).fill(span).join(",")}" border="borderCell">${rows}</table>`,
        );
    });
    // The editor always ends a document with a paragraph, never a table.
    if (blocks.length === 0 || blocks[blocks.length - 1].kind === "table") {
        items.push(paragraphXml({ kind: "paragraph", runs: [] }));
    }
    const body = items.join("");

    // CDATA cannot hold "]]>"; split it across two sections if it appears.
    const cdata = pool.join("").replace(/]]>/g, "]]]]><![CDATA[>");
    return (
        `<?xml version="1.0" encoding="UTF-8" ?> \n\n<template format_id="1.8" >\n` +
        `<content><![CDATA[${cdata}]]></content>` +
        `<properties><pageFormat mediaSizeName="1" leftMargin="42.52" rightMargin="28.35" topMargin="14.17" bottomMargin="14.17" paperOrientation="1" headerFOffset="20.0" footerFOffset="20.0" /></properties>\n` +
        `<elements resolver="hvl-default" >\n${body}</elements>\n` +
        `<styles><style name="default" description="Geçerli" family="Dialog" size="12" bold="false" italic="false" foreground="-13421773" FONT_ATTRIBUTE_KEY="javax.swing.plaf.FontUIResource[family=Dialog,name=Dialog,style=plain,size=12]" /><style name="hvl-default" family="${DEFAULT_FAMILY}" size="${DEFAULT_SIZE}" description="Gövde" /></styles>\n` +
        `</template>\n`
    );
}

// JSZip records "version needed to extract" as 1.0 even for deflated entries;
// zip readers expect 2.0 there, as in the files UYAP itself writes.
export function withDeflateVersion(zip: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    // The end-of-central-directory record is the last 22 bytes (no comment).
    let end = zip.length - 22;
    while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
    if (end < 0) return zip;
    const entries = view.getUint16(end + 10, true);
    let at = view.getUint32(end + 16, true);
    for (let n = 0; n < entries && view.getUint32(at, true) === 0x02014b50; n++) {
        view.setUint16(at + 4, 20, true); // version made by
        view.setUint16(at + 6, 20, true); // version needed
        const local = view.getUint32(at + 42, true);
        if (view.getUint32(local, true) === 0x04034b50) view.setUint16(local + 4, 20, true);
        at += 46 + view.getUint16(at + 28, true) + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    }
    return zip;
}

export async function blocksToUdfBlob(blocks: UdfBlock[]): Promise<Blob> {
    const zip = new JSZip();
    zip.file("content.xml", buildUdfXml(blocks));
    const data = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
    return new Blob([withDeflateVersion(new Uint8Array(data))], { type: UDF_MIME });
}

/** A Word document as a .udf file for UYAP. */
export async function docxToUdfBlob(data: ArrayBuffer | Blob): Promise<Blob> {
    return blocksToUdfBlob(await readDocxBlocks(data));
}
