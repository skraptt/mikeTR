import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
    blocksToUdfBlob,
    buildUdfXml,
    convertUdfFileToDocx,
    isUdfFile,
    readDocxBlocks,
    readUdf,
    udfToDocxBlob,
    type UdfBlock,
} from "./udf";

async function udfFrom(xml: string): Promise<Blob> {
    const zip = new JSZip();
    zip.file("content.xml", xml);
    return new Blob([await zip.generateAsync({ type: "arraybuffer" })]);
}

const text = (blocks: UdfBlock[]) =>
    blocks.map((b) =>
        b.kind === "paragraph"
            ? b.runs.map((r) => r.text).join("")
            : b.rows.map((r) => r.map((c) => c.map((p) => p.runs.map((x) => x.text).join("")).join("/"))),
    );

// As UYAP's editor writes it: one text pool, runs pointing in by character
// offset (Turkish letters count once), an empty paragraph holding U+200B.
const UYAP_SAMPLE = `<?xml version="1.0" encoding="UTF-8" ?><template format_id="1.8"><content><![CDATA[İSTANBUL ANADOLU İCRA DAİRESİ'NE
​
Borçlu:\tAli Çelik
]]></content><properties><pageFormat mediaSizeName="1" /></properties><elements resolver="hvl-default"><paragraph Alignment="1" LeftIndent="0.0" RightIndent="0.0"><content startOffset="0" length="33" family="Times New Roman" size="12" bold="true" /></paragraph><paragraph Alignment="0" LeftIndent="0.0" RightIndent="0.0"><content startOffset="33" length="2" family="Times New Roman" size="12" /></paragraph><paragraph Alignment="3" LeftIndent="25.0" RightIndent="0.0" FirstLineIndent="10.0"><content startOffset="35" length="7" family="Times New Roman" size="12" underline="true" /><tab startOffset="42" length="1" /><content startOffset="43" length="10" family="Times New Roman" size="12" /></paragraph></elements><styles /></template>`;

describe("readUdf", () => {
    it("reads text, formatting and layout from UYAP's format", async () => {
        const blocks = await readUdf(await udfFrom(UYAP_SAMPLE));
        expect(text(blocks)).toEqual(["İSTANBUL ANADOLU İCRA DAİRESİ'NE", "", "Borçlu:\tAli Çelik"]);
        expect(blocks[0]).toMatchObject({ alignment: 1, runs: [{ bold: true, size: 12 }] });
        expect(blocks[2]).toMatchObject({
            alignment: 3,
            leftIndent: 25,
            firstLineIndent: 10,
            runs: [{ text: "Borçlu:", underline: true }, { text: "\t" }, { text: "Ali Çelik" }],
        });
    });

    it("refuses a zip without content.xml", async () => {
        const zip = new JSZip();
        zip.file("other.xml", "<x/>");
        await expect(readUdf(await zip.generateAsync({ type: "arraybuffer" }))).rejects.toThrow("content.xml");
    });
});

describe("buildUdfXml", () => {
    const blocks: UdfBlock[] = [
        { kind: "paragraph", alignment: 1, runs: [{ text: "İHTARNAME", bold: true }] },
        { kind: "paragraph", runs: [] },
        { kind: "paragraph", runs: [{ text: "Keşideci:" }, { text: "\tŞirket A.Ş.", italic: true }] },
        {
            kind: "table",
            rows: [[[{ kind: "paragraph", runs: [{ text: "Tutar" }] }], [{ kind: "paragraph", runs: [{ text: "1.000 TL" }] }]]],
        },
    ];

    it("points every run at its own characters in the pool", async () => {
        const xml = buildUdfXml(blocks);
        expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" ?>')).toBe(true);
        expect(xml).not.toContain("<tab ");
        // A document ending in a table gets a closing empty paragraph, as in UYAP.
        expect(text(await readUdf(await udfFrom(xml)))).toEqual([...text(blocks), ""]);
    });

    it("keeps formatting through a round trip", async () => {
        const back = await readUdf(await blocksToUdfBlob(blocks));
        expect(back[0]).toMatchObject({ alignment: 1, runs: [{ text: "İHTARNAME", bold: true }] });
        expect(back[2]).toMatchObject({ runs: [{ text: "Keşideci:" }, { text: "\tŞirket A.Ş.", italic: true }] });
    });

    it("survives text that would close the CDATA section", async () => {
        const tricky: UdfBlock[] = [{ kind: "paragraph", runs: [{ text: "a ]]> b" }] }];
        expect(text(await readUdf(await udfFrom(buildUdfXml(tricky))))).toEqual(["a ]]> b"]);
    });
});

describe("Word conversion", () => {
    it("turns a .udf into a .docx with the same text and formatting, and back", async () => {
        // From bytes: jsdom's File cannot wrap a Blob from another realm.
        const file = new File([await (await udfFrom(UYAP_SAMPLE)).arrayBuffer()], "Takip Talebi.udf");
        expect(isUdfFile(file)).toBe(true);
        const docx = await convertUdfFileToDocx(file);
        expect(docx.name).toBe("Takip Talebi.docx");

        const blocks = await readDocxBlocks(docx);
        expect(text(blocks)).toEqual(["İSTANBUL ANADOLU İCRA DAİRESİ'NE", "", "Borçlu:\tAli Çelik"]);
        expect(blocks[0]).toMatchObject({ alignment: 1, runs: [{ bold: true, size: 12 }] });
        expect(blocks[2]).toMatchObject({ alignment: 3, leftIndent: 25, firstLineIndent: 10 });

        const again = await readUdf(await blocksToUdfBlob(blocks));
        expect(text(again)).toEqual(text(blocks));
    });

    it("carries tables into Word", async () => {
        const blocks: UdfBlock[] = [
            { kind: "table", rows: [[[{ kind: "paragraph", runs: [{ text: "A" }] }], [{ kind: "paragraph", runs: [{ text: "B" }] }]]] },
        ];
        expect(text(await readDocxBlocks(await udfToDocxBlob(blocks)))).toEqual([[["A", "B"]]]);
    });
});

describe("tables as UYAP Doküman Editörü saves them", () => {
    // A 2x2 table made and saved in the editor (v5.4.21).
    const saved = fs.readFileSync(path.join(__dirname, "__fixtures__/uyap-tablo-content.xml"), "utf8");

    it("reads the editor's table", async () => {
        const blocks = await readUdf(await udfFrom(saved));
        expect(text(blocks)).toEqual([[[" a", " b"], [" c", " d"]], ""]);
    });

    it("writes tables in the same shape", () => {
        const table: UdfBlock = {
            kind: "table",
            rows: [
                [[{ kind: "paragraph", runs: [{ text: "a" }] }], [{ kind: "paragraph", runs: [{ text: "b" }] }]],
                [[{ kind: "paragraph", runs: [{ text: "c" }] }], [{ kind: "paragraph", runs: [{ text: "d" }] }]],
            ],
        };
        const xml = buildUdfXml([table]);
        const spans = /columnSpans="([^"]+)"/.exec(xml)![1].split(",");
        expect(spans.every((n) => /^\d+$/.test(n))).toBe(true);
        expect(xml).toMatch(/<row rowName="row1" rowType="dataRow"><cell><paragraph Alignment="0" LeftIndent="3.0" RightIndent="1.0">/);
        // Like the editor, the document ends with a paragraph after the table.
        expect(xml).toMatch(/<\/table><paragraph[^>]*><content[^>]*\/><\/paragraph>\s*<\/elements>/);
    });
});
