// src/lib/sentenceSegment.js

// แทน type Seg / Locale3 ของ TypeScript ด้วยคอมเมนต์เฉย ๆ ก็พอ
// Seg = { segment: string; index: number }
// Locale3 = "th" | "en" | "ja"

/**
 * ตัดข้อความเป็น "ประโยค" พร้อมคืน index เริ่มต้นของแต่ละประโยค
 * - ใช้ Intl.Segmenter(granularity: "sentence") ถ้ามี
 * - ถ้าไม่มี จะใช้ regex + heuristics ที่ครอบคลุม EN/JA/TH
 * - trim() ปลาย/ต้น แต่ยังคงเว้นวรรคภายในประโยค
 */
export function segmentSentences(text, locale = "th") {
    const t = text || "";
    if (!t) return [];

    // 1) Try Intl.Segmenter first (ดีที่สุด)
    const SegCtor = (globalThis.Intl && globalThis.Intl.Segmenter) || undefined;
    if (typeof SegCtor === "function") {
        const seg = new SegCtor(locale, { granularity: "sentence" });
        const out = [];
        for (const it of seg.segment(t)) {
            const s = it.segment || String(it);
            if (!s) continue;
            const idx = typeof it.index === "number" ? it.index : t.indexOf(s);
            const trimmed = s.trim();
            if (trimmed) {
                const offset = s.indexOf(trimmed);
                out.push({
                    segment: trimmed,
                    index: idx + Math.max(0, offset),
                });
            }
        }
        if (out.length) return out;
    }

    // 2) Fallback: language-aware regex / heuristics
    const EN_JA_END = /[.!?。？！\u2026]+/;
    const TH_TAIL_CORE =
        "(ครับ|ค่ะ|คะ|นะ|เนอะ|ใช่ไหม|หรือเปล่า|ป่ะ|ปะ|มั้ย|ไหม|จ้า|จ่ะ|นะจ๊ะ|น้า)";
    const JA_TAIL_CORE =
        "(ですね|ですよ|ますね|でしょう|かな|だよ|だね|だぞ|よね)";

    // split คร่าว ๆ ตาม .,!? + เว้นวรรค หรือขึ้นบรรทัดใหม่
    const roughParts = t
        .split(/(?<=[.!?。？！\u2026])[ \t]+|\n{1,}/u)
        .map((s) => s.trim())
        .filter(Boolean);

    const result = [];
    let searchOffset = 0;

    function pushSeg(seg) {
        if (!seg) return;
        const idx = t.indexOf(seg, searchOffset);
        if (idx !== -1) {
            result.push({ segment: seg, index: idx });
            searchOffset = idx + seg.length;
        } else {
            const altIdx = t.slice(searchOffset).indexOf(seg);
            if (altIdx !== -1) {
                const real = searchOffset + altIdx;
                result.push({ segment: seg, index: real });
                searchOffset = real + seg.length;
            } else {
                result.push({ segment: seg, index: Math.max(0, searchOffset) });
                searchOffset += seg.length;
            }
        }
    }

    // refine แบบง่ายสำหรับไทย: แบ่งตาม "…คำลงท้ายไทย + เว้นวรรค"
    function refineThai(s) {
        if (locale !== "th") return [s];

        const re = new RegExp(
            "\\s+(?=" + TH_TAIL_CORE + "\\b)|(?<=[.!?。？！\\u2026])\\s+",
            "u"
        );

        return s
            .split(re)
            .map((x) => x.trim())
            .filter(Boolean);
    }

    for (const part of roughParts) {
        const candidates = locale === "th" ? refineThai(part) : [part];

        for (let c of candidates) {
            c = c.trim();
            if (!c) continue;

            // ถ้าไม่มีตัวจบ .!? และไม่ใช่ tail ไทย/ญี่ปุ่น ก็ถือเป็นประโยค "ค้าง"
            // ปล่อยให้ logic timeout ด้านนอกช่วยตัดเอา
            pushSeg(c);
        }
    }

    if (result.length === 0) {
        const idx = t.search(/\S|$/);
        return [{ segment: t.trim(), index: idx }];
    }

    return result;
}

/** helper: เช็คว่าประโยค “จบตามธรรมชาติ” (ใช้บอกว่าแปลได้เลย) */
export function looksSentenceFinal(s) {
    const tail = (s || "").trim();
    if (!tail) return false;

    // จบด้วย ., !, ?, … หรือ ญี่ปุ่น 。？！ + ปิดด้วย quote/bracket ก็โอเค
    if (/[.!?。？！\u2026][)"'”’）)】》»]*\s*$/.test(tail)) return true;

    // จบด้วยคำลงท้ายไทย/ญี่ปุ่น
    if (
        /(ครับ|ค่ะ|คะ|นะ|เนอะ|ใช่ไหม|หรือเปล่า|ป่ะ|ปะ|มั้ย|ไหม|จ้า|จ่ะ|นะจ๊ะ|น้า)\s*$/.test(
            tail
        )
    )
        return true;

    if (
        /(ですね|ですよ|ますね|でしょう|かな|だよ|だね|だぞ|よね)\s*$/.test(
            tail
        )
    )
        return true;

    return false;
}
