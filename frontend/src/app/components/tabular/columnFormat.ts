import type { LucideIcon } from "lucide-react";
import { AlignLeft, List, Hash, DollarSign, ToggleLeft, Calendar, Tag, Percent, Banknote } from "lucide-react";
import type { ColumnFormat } from "../shared/types";

export const FORMAT_OPTIONS: Array<{ value: ColumnFormat; label: string; icon: LucideIcon }> = [
    { value: "text",            label: "Serbest Metin",   icon: AlignLeft  },
    { value: "bulleted_list",   label: "Madde listesi",   icon: List       },
    { value: "number",          label: "Sayı",            icon: Hash       },
    { value: "percentage",      label: "Yüzde",           icon: Percent    },
    { value: "monetary_amount", label: "Parasal Tutar",   icon: Banknote   },
    { value: "currency",        label: "Para Birimi",     icon: DollarSign },
    { value: "yes_no",          label: "Evet / Hayır",    icon: ToggleLeft },
    { value: "date",            label: "Tarih",           icon: Calendar   },
    { value: "tag",             label: "Etiketler",       icon: Tag        },
];

export function formatLabel(format: ColumnFormat): string {
    return FORMAT_OPTIONS.find((o) => o.value === format)?.label ?? "Metin";
}

export function formatIcon(format: ColumnFormat): LucideIcon {
    return FORMAT_OPTIONS.find((o) => o.value === format)?.icon ?? AlignLeft;
}
