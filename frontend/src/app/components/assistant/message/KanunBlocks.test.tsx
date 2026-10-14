import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IctihatCitationCheck, KanunCitationCheck, ictihatSearchItems } from "./KanunBlocks";

describe("IctihatCitationCheck", () => {
    it("opens on problems and explains each status", () => {
        render(
            <IctihatCitationCheck
                citations={[
                    { label: "Yargıtay 3. HD, E.2022/1258 K.2022/3089", esas_no: "2022/1258", karar_no: "2022/3089", basvuru_no: null, status: "dogrulandi" },
                    { label: "AYM, B. No: 2021/1240", esas_no: null, karar_no: null, basvuru_no: "2021/1240", status: "okunmadi" },
                    { label: "E.2020/1 K.2020/2", esas_no: "2020/1", karar_no: "2020/2", basvuru_no: null, status: "kaynaksiz" },
                ]}
            />,
        );
        expect(screen.getByText("1/3 decision citations verified, 2 need attention")).toBeInTheDocument();
        expect(screen.getByText(/without reading it/)).toBeInTheDocument();
        expect(screen.getByText(/No search in this chat returned this decision/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { expanded: true }));
        expect(screen.queryByText("E.2020/1 K.2020/2")).not.toBeInTheDocument();
    });

    it("stays closed when every citation was read", () => {
        render(
            <IctihatCitationCheck
                citations={[{ label: "AYM, B. No: 2021/1240", esas_no: null, karar_no: null, basvuru_no: "2021/1240", status: "dogrulandi" }]}
            />,
        );
        expect(screen.getByText("1/1 decision citations verified")).toBeInTheDocument();
        expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
    });
});

describe("statute blocks", () => {
    it("still render the statute check", () => {
        render(<KanunCitationCheck citations={[{ label: "TBK md. 315", kanun_no: "6098", madde_no: "315", status: "dogrulandi" }]} />);
        expect(screen.getByText("1/1 statute citations verified")).toBeInTheDocument();
    });

    it("link Emsal hits to the reader and others to their official page", () => {
        expect(
            ictihatSearchItems([
                { id: "5", kaynak_turu: "emsal", mahkeme: "BAM", esas_no: "1", karar_no: "2", karar_tarihi: "", durum: null, atif: "BAM, E.1 K.2", kaynak: "https://emsal.uyap.gov.tr/" },
                { id: "yargitay:1", kaynak_turu: "yargitay", mahkeme: "Y", esas_no: "1", karar_no: "2", karar_tarihi: "", durum: "KESİNLEŞTİ", atif: "Y, E.1 K.2", kaynak: "https://mevzuat.adalet.gov.tr/ictihat/1" },
            ]).map((item) => [item.url, item.citation]),
        ).toEqual([
            ["/case-law/decision?id=5&atif=BAM%2C+E.1+K.2", null],
            ["https://mevzuat.adalet.gov.tr/ictihat/1", "KESİNLEŞTİ"],
        ]);
    });
});
