import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const globalKey = "__MEETING_SOCKET_SINGLETONS__";

export default function useSocket(baseUrl) {
    const [, setTick] = useState(0);

    if (typeof window !== "undefined") {
        if (!window[globalKey]) window[globalKey] = new Map();
    }

    let socket = null;
    if (typeof window !== "undefined" && baseUrl) {
        if (!window[globalKey].has(baseUrl)) {
            const s = io(baseUrl, {
                transports: ["polling", "websocket"], // ปล่อยให้เริ่มที่ polling แล้ว upgrade
                reconnection: true,
                reconnectionAttempts: Infinity,
                timeout: 10000,
                withCredentials: true,
            });
            s.on("connect", () => setTick((n) => n + 1));
            s.on("disconnect", () => setTick((n) => n + 1));
            s.on("connect_error", (err) => {
                console.warn("[socket] connect_error:", err?.message || err);
                setTick((n) => n + 1);
            });
            window[globalKey].set(baseUrl, s);
        }
        socket = window[globalKey].get(baseUrl);
    }

    useEffect(() => {
        return () => {
            // ไม่ปิด socket ที่นี่ (กัน StrictMode unmount รอบแรก)
        };
    }, []);

    return socket || null;
}
