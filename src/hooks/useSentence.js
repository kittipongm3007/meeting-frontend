// src/lib/useSentenceTranslate.js
import { useEffect, useRef } from "react";
// import { trpc } from "@/lib/trpc/client";
import { segmentSentences, looksSentenceFinal } from "./useSegment";

// --- sentence helpers (ไม่ต้องพึ่งแพ็กเกจ) ---
function segmentSentencesWithIndex(text, locale) {
    const SegCtor = globalThis.Intl && globalThis.Intl.Segmenter;
    if (typeof SegCtor === "function") {
        const seg = new SegCtor(locale, { granularity: "sentence" });
        // entries ของ Segmenter มี .segment / .index
        return Array.from(seg.segment(text));
    }

    // fallback: แบ่งคร่าว ๆ และคำนวณ index เอง
    const parts = text.split(/(?<=[.!?\u2026])\s+|\n+/);
    const res = [];
    let offset = 0;

    for (const p of parts) {
        if (!p) continue;
        const i = text.indexOf(p, offset);
        if (i === -1) continue;
        res.push({ segment: p, index: i });
        offset = i + p.length;
    }

    return res;
}

// --- main hook ---
export function useSentence({
    liveSource,
    sttLocale,
    targetLang,
    onAppend,
    pollMs = 200,
    silenceMs = 900,
    minTailChars = 6,
    cooldownMs = 300,
} = {}) {
    // ชี้ตำแหน่ง “อักขระสุดท้าย” ที่แปลไปแล้ว (ไม่ใช่จำนวนประโยค)
    const lastCommittedEnd = useRef(0);

    // กันส่งซ้ำ: เก็บข้อความ/แฮชของประโยคที่ส่งไปแล้ว
    const sentSet = useRef(new Set());

    // ติดตามว่ามีการพิมพ์/พูดเพิ่มล่าสุดเมื่อไหร่
    const lastSeenText = useRef("");
    const lastChangeAt = useRef(Date.now());

    // คุมลูป + คูลดาวน์
    const timer = useRef(null);
    const coolingUntil = useRef(0);

    // const mutation = trpc.translate.text.useMutation();
    // const mutation = trpc.translate.translateWithGemma3n.useMutation();

    const locale = sttLocale ? sttLocale : "ja";

    console.log("locale", locale);

    // อัปเดตเวลาที่ข้อความเปลี่ยน
    useEffect(() => {
        const now = Date.now();
        if (liveSource !== lastSeenText.current) {
            lastSeenText.current = liveSource;
            lastChangeAt.current = now;
        }
    }, [liveSource]);

    useEffect(() => {
        function loop() {
            const now = Date.now();

            // ถ้ายังอยู่ในช่วงคูลดาวน์ ให้เลื่อนนัดรอบถัดไป
            if (now < coolingUntil.current) {
                timer.current = window.setTimeout(loop, pollMs);
                return;
            }

            const text = liveSource;
            if (!text) {
                timer.current = window.setTimeout(loop, pollMs);
                return;
            }

            // ตัดข้อความส่วนที่ “ยังไม่ได้ commit”
            const tail = text.slice(lastCommittedEnd.current);
            if (!tail) {
                timer.current = window.setTimeout(loop, pollMs);
                return;
            }

            console.log("locale", locale);

            // แบ่งประโยคทั้งข้อความ แล้วหา “จุดจบล่าสุดที่มั่นคง”
            const segs = segmentSentences(text, locale);
            let cutoffEnd = lastCommittedEnd.current; // index ของ char สุดท้ายที่ commit ได้

            if (segs.length > 0) {
                // หา segment สุดท้ายที่ “จบตามธรรมชาติ”
                let lastFinalIdx = -1;

                for (let i = 0; i < segs.length; i++) {
                    const s = segs[i];
                    const end = s.index + s.segment.length;
                    if (end <= lastCommittedEnd.current) continue; // ข้ามของเก่า
                    if (looksSentenceFinal(s.segment)) lastFinalIdx = i;
                }

                if (lastFinalIdx >= 0) {
                    const s = segs[lastFinalIdx];
                    cutoffEnd = s.index + s.segment.length;
                } else {
                    // ไม่มีจบธรรมชาติ → ใช้ timeout + tail length + enders ไทย
                    const tailStr = text.slice(lastCommittedEnd.current);
                    const noChangeFor = now - lastChangeAt.current;
                    const enoughChars = tailStr.trim().length >= minTailChars;
                    const thaiEnders =
                        /(ครับ|ค่ะ|คะ|นะ|เนอะ|ใช่ไหม|หรือเปล่า|ปะ)\s*$/;

                    if (noChangeFor >= silenceMs && enoughChars) {
                        // ช่วยตัดที่ "คำสุดท้าย" เพื่อไม่ให้ขาดกลางคำ
                        const lastSpace = tailStr.lastIndexOf(" ");
                        cutoffEnd =
                            lastSpace > 0
                                ? lastCommittedEnd.current + lastSpace + 1
                                : lastCommittedEnd.current + tailStr.length;
                    } else if (thaiEnders.test(tailStr)) {
                        cutoffEnd = lastCommittedEnd.current + tailStr.length;
                    }
                }
            }

            // ไม่มีอะไรใหม่ที่ “ตัดได้” → รอรอบถัดไป
            if (cutoffEnd <= lastCommittedEnd.current) {
                timer.current = window.setTimeout(loop, pollMs);
                return;
            }

            // ข้อความก้อนใหม่ที่ commit ได้แน่ ๆ (ระหว่าง lastCommittedEnd..cutoffEnd)
            const newPortion = text
                .slice(lastCommittedEnd.current, cutoffEnd)
                .trim();

            if (!newPortion) {
                lastCommittedEnd.current = cutoffEnd; // แม้จะว่างก็เลื่อน pointer กันวน
                timer.current = window.setTimeout(loop, pollMs);
                return;
            }

            // แตกก้อนนี้เป็น “หลายประโยค” เพื่อ batch แปลครั้งเดียว
            const segNew = segmentSentences(newPortion, locale);
            const parts =
                segNew.length > 0
                    ? segNew.map((s) => s.segment.trim()).filter(Boolean)
                    : newPortion
                          .split(/(?<=[.!?\u2026])\s+|\n+/)
                          .filter(Boolean);

            // กรองเฉพาะประโยคที่ “ยังไม่เคยส่ง”
            const toTranslate = parts.filter((p) => {
                const key = p; // จะเปลี่ยนเป็น hash ก็ได้ถ้าข้อความยาวมาก
                if (sentSet.current.has(key)) return false;
                sentSet.current.add(key);
                return true;
            });

            if (toTranslate.length === 0) {
                lastCommittedEnd.current = cutoffEnd;
                timer.current = window.setTimeout(loop, pollMs);
                return;
            }
            onAppend(toTranslate);
            // ยิงแปล (batch ทีเดียว) แล้วต่อท้ายผลลัพธ์
            // mutation.mutate(
            //     { text: toTranslate, target: targetLang },
            //     {
            //         onSuccess: (r) => {
            //             console.log("r", r);

            //             const out = r.translatedText;
            //             const appended = Array.isArray(out)
            //                 ? out.join(" ")
            //                 : String(out);

            //             if (appended) onAppend(appended + " ");
            //         },
            //         onSettled: () => {
            //             // ไม่ว่าผลจะสำเร็จหรือไม่ เลื่อน pointer และตั้งคูลดาวน์กันลูปถี่
            //             lastCommittedEnd.current = cutoffEnd;
            //             coolingUntil.current = Date.now() + cooldownMs;
            //         },
            //     }
            // );

            timer.current = window.setTimeout(loop, pollMs);
        }

        timer.current = window.setTimeout(loop, pollMs);
        return () => {
            if (timer.current) window.clearTimeout(timer.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        liveSource,
        sttLocale,
        targetLang,
        pollMs,
        silenceMs,
        minTailChars,
        cooldownMs,
    ]);
}
