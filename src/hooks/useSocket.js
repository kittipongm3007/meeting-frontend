import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const globalKey = "__MEETING_SOCKET_SINGLETONS__";

export default function useSocket(baseUrl) {
    const [, setTick] = useState(0);

    // เตรียม global map ไว้เก็บ singleton
    if (typeof window !== "undefined") {
        if (!window[globalKey]) window[globalKey] = new Map();
    }

    let socket = null;

    if (typeof window !== "undefined" && baseUrl) {
        const store = window[globalKey];

        if (!store.has(baseUrl)) {
            const s = io(baseUrl, {
                // ❌ อันเดิม
                // transports: ["polling", "websocket"],

                // ✅ บังคับใช้ websocket อย่างเดียว เพื่อตัดปัญหา CORS ของ polling
                transports: ["websocket"],

                reconnection: true,
                reconnectionAttempts: Infinity,
                timeout: 10000,

                // ใช้คู่กับ server ที่ตั้ง credentials: true
                withCredentials: true,
            });

            s.on("connect", () => setTick((n) => n + 1));
            s.on("disconnect", () => setTick((n) => n + 1));
            s.on("connect_error", (err) => {
                console.warn("[socket] connect_error:", err?.message || err);
                setTick((n) => n + 1);
            });

            store.set(baseUrl, s);
        }

        socket = store.get(baseUrl);
    }

    useEffect(() => {
        return () => {
            // ไม่ปิด socket ที่นี่ กัน StrictMode unmount รอบแรก
        };
    }, []);

    return socket || null;
}
