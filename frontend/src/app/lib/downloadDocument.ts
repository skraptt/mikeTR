import { getDocumentFile } from "./mikeApi";

/** Download bytes with consistent filename handling and object-URL cleanup. */
export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    try {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        try { link.click(); } finally { link.remove(); }
    } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}

export async function downloadDocumentFile(documentId: string, versionId?: string | null, filename = "document") {
    const file = await getDocumentFile(documentId, versionId);
    downloadBlob(file.blob, file.filename || filename);
}

/** mikeTR: a Word document downloaded as a UYAP .udf file, converted in the browser. */
export async function downloadDocumentAsUdf(documentId: string, versionId?: string | null, filename = "document.docx") {
    const file = await getDocumentFile(documentId, versionId);
    const { docxToUdfBlob } = await import("@/shared/lib/udf");
    const name = (file.filename || filename).replace(/\.docx$/i, "") + ".udf";
    downloadBlob(await docxToUdfBlob(file.blob), name);
}
