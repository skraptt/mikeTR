import { describe, expect, it } from "vitest";
import { computeKanunChanges, htmlToParagraphs, parseKanunHtml } from "../kanunSync";

// A miniature of mevzuat.gov.tr's Word-exported HTML: <pre> and <p>
// paragraphs, a title and heading in one paragraph, footnote links, and the
// footnote texts collected after the last article.
const HTML = `<html><body>
<p><b>ÖRNEK KANUNU</b></p>
<p>Kanun Numarası : 9999</p>
<p>Yayımlandığı Düstur : Tertip : 5 Cilt : 1</p>
<pre><b>Amaç</b></pre>
<pre><b>MADDE 1- </b>(1) Bu Kanunun amacı örnek olmaktır.</pre>
<p>Süreler <b>MADDE 2- </b>(1) Süreler kesindir.<a href="#_ftn1" name="_ftnref1"><span class=MsoFootnoteReference>[1]</span></a></p>
<p>(2) Hâkim süreyi uzatamaz.<span class=MsoFootnoteReference>2</span></p>
<p>Kaldırılan hüküm</p>
<p><b>GEÇİCİ MADDE 1-</b> (Mülga:1/1/2026-7000/1 md.)</p>
<p><a href="#_ftnref1" name="_ftn1">[1]</a> Anayasa Mahkemesinin kararıyla bu fıkra iptal edilmiştir.</p>
<p><a href="#_ftnref2" name="_ftn2">[2]</a> Bu fıkra 1/1/2027 tarihinde yürürlüğe girer.</p>
</body></html>`;

describe("htmlToParagraphs", () => {
  it("treats <pre> as a paragraph and drops invisible characters", () => {
    expect(htmlToParagraphs("<pre>A­B&nbsp;C</pre><pre>D</pre>")).toEqual(["AB C", "D"]);
  });
});

describe("parseKanunHtml", () => {
  const maddeler = parseKanunHtml(HTML, "9999");

  it("finds every article, including one whose title shares its paragraph", () => {
    expect(maddeler.map((m) => m.madde_no)).toEqual(["1", "2", "Geçici 1"]);
    expect(maddeler[0].baslik).toBe("Amaç");
    expect(maddeler[1].baslik).toBe("Süreler");
  });

  it("moves footnote texts to the end of the article that cites them", () => {
    expect(maddeler[1].icerik).toBe(
      [
        "(1) Süreler kesindir.",
        "(2) Hâkim süreyi uzatamaz.",
        "Dipnot: Anayasa Mahkemesinin kararıyla bu fıkra iptal edilmiştir.",
        "Dipnot: Bu fıkra 1/1/2027 tarihinde yürürlüğe girer.",
      ].join("\n"),
    );
  });

  it("does not take the line before a footnoted sentence for the next title", () => {
    expect(maddeler[2].baslik).toBe("Kaldırılan hüküm");
  });
});

describe("computeKanunChanges", () => {
  const stored = [
    { madde_no: "1", baslik: "Amaç", icerik: "(1) Bu Kanunun  amacı\nörnek olmaktır." },
    { madde_no: "2", baslik: "Süreler", icerik: "(1) Süreler kesindir." },
    { madde_no: "3", baslik: null, icerik: "Eski madde." },
  ];

  it("ignores whitespace and reports new, changed and removed articles", () => {
    const changes = computeKanunChanges(stored, [
      { kanun_no: "9999", kanun_adi: "Örnek", madde_no: "1", baslik: "Amaç", icerik: "(1) Bu Kanunun amacı örnek olmaktır." },
      { kanun_no: "9999", kanun_adi: "Örnek", madde_no: "2", baslik: "Süreler", icerik: "(1) Süreler kesin değildir." },
      { kanun_no: "9999", kanun_adi: "Örnek", madde_no: "4", baslik: null, icerik: "Yeni madde." },
    ].concat(
      // Enough articles to pass the truncation guard.
      [],
    ));
    expect(changes.map((c) => [c.tur, c.madde_no])).toEqual([
      ["degisti", "2"],
      ["yeni", "4"],
      ["kaldirildi", "3"],
    ]);
    expect(changes[0]).toMatchObject({
      eski_icerik: "(1) Süreler kesindir.",
      yeni_icerik: "(1) Süreler kesin değildir.",
    });
    expect(changes[0].yeni_ozet).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses a parse that lost most of the law", () => {
    expect(() => computeKanunChanges(stored, [])).toThrow(/parsed into 0 articles/);
  });
});
