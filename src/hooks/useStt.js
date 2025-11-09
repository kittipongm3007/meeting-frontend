import { useCallback, useEffect, useRef, useState } from "react";

export function useStt(options = {}) {
    const {
        lang = "th-TH",
        continuous = true,
        interimResults = true,
        autoRestart = true,
    } = options;

    const [supported, setSupported] = useState(false);
    const [listening, setListening] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [interim, setInterim] = useState("");
    const [error, setError] = useState(null);

    const recognitionRef = useRef(null);
    const restartTimer = useRef(null);
    const lastLang = useRef(lang);
    const isBrowser = typeof window !== "undefined";

    const getRecognition = useCallback(() => {
        if (!isBrowser) return null;

        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SR) return null;

        const rec = new SR();
        rec.lang = lang;
        rec.continuous = continuous;
        rec.interimResults = interimResults;
        rec.maxAlternatives = 1;
        return rec;
    }, [isBrowser, lang, continuous, interimResults]);

    const start = useCallback(() => {
        setError(null);

        if (!recognitionRef.current || lastLang.current !== lang) {
            recognitionRef.current = getRecognition();
            lastLang.current = lang;
        }

        const rec = recognitionRef.current;

        if (!rec) {
            setSupported(false);
            setListening(false);
            setError("Speech Recognition not supported.");
            return;
        }

        setSupported(true);

        rec.onstart = () => {
            setListening(true);
        };

        rec.onresult = (e) => {
            let finalChunk = "";
            let interimChunk = "";

            for (let i = e.resultIndex; i < e.results.length; i++) {
                const res = e.results[i];
                if (res.isFinal) {
                    finalChunk += res[0].transcript;
                } else {
                    interimChunk += res[0].transcript;
                }
            }

            if (finalChunk) {
                setTranscript(
                    (prev) => (prev ? prev + " " : "") + finalChunk.trim()
                );
            }

            setInterim(interimChunk);
        };

        rec.onerror = (e) => {
            const code = e && e.error ? e.error : "unknown_error";
            setError(code);

            // กรณี user block mic / service ไม่พร้อม ⇒ ไม่ควร autoRestart
            if (
                code === "not-allowed" ||
                code === "service-not-allowed" ||
                code === "abort-error"
            ) {
                if (restartTimer.current) {
                    window.clearTimeout(restartTimer.current);
                    restartTimer.current = null;
                }
            }
        };

        rec.onend = () => {
            setListening(false);
            setInterim("");

            if (autoRestart) {
                if (restartTimer.current) {
                    window.clearTimeout(restartTimer.current);
                }
                restartTimer.current = window.setTimeout(() => {
                    try {
                        rec.start();
                    } catch (err) {
                        // ignore
                    }
                }, 250);
            }
        };

        try {
            rec.start();
        } catch (err) {
            setError((err && err.message) || "Failed to start recognition.");
        }
    }, [autoRestart, getRecognition, lang]);

    const stop = useCallback(() => {
        if (restartTimer.current) {
            window.clearTimeout(restartTimer.current);
            restartTimer.current = null;
        }

        const rec = recognitionRef.current;
        if (rec) {
            rec.onend = () => {
                setListening(false);
                setInterim("");
            };
            try {
                rec.stop();
            } catch (err) {
                // ignore
            }
        }
    }, []);

    const reset = useCallback(() => {
        setTranscript("");
        setInterim("");
        setError(null);
    }, []);

    useEffect(() => {
        if (!isBrowser) return;
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        setSupported(!!SR);
    }, [isBrowser]);

    useEffect(() => {
        return () => {
            if (!isBrowser) return;
            if (restartTimer.current) {
                window.clearTimeout(restartTimer.current);
            }
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                } catch (err) {
                    // ignore
                }
            }
        };
    }, [isBrowser]);

    return {
        supported,
        listening,
        transcript,
        interim,
        error,
        start,
        stop,
        reset,
    };
}
