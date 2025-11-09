import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function HomePage() {
    const nav = useNavigate();
    const [roomId, setRoomId] = useState("");

    const createRoom = () => {
        const id = crypto.randomUUID().slice(0, 8);
        nav(`/room/${id}`);
    };

    const join = (e) => {
        e.preventDefault();
        if (!roomId.trim()) return;
        nav(`/room/${roomId.trim()}`);
    };

    return (
        <div style={{ maxWidth: 520 }}>
            <h2>สร้าง/เข้าร่วมห้อง</h2>
            <div style={{ display: "flex", gap: 8 }}>
                <button onClick={createRoom}>+ สร้างห้องใหม่</button>
            </div>

            <form onSubmit={join} style={{ marginTop: 16, display: "flex", gap: 8 }}>
                <input
                    placeholder="กรอกรหัสห้อง เช่น a1b2c3d4"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    style={{ flex: 1 }}
                />
                <button type="submit">เข้าร่วม</button>
            </form>

            <p style={{ marginTop: 12, color: "#555" }}>
                Backend signaling: <code>{import.meta.env.VITE_WS_URL}</code>
            </p>
        </div>
    );
}
