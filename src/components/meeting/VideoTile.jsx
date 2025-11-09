import React, { useEffect, useRef, useState } from "react";

export default function VideoTile({ stream, muted=false, label="Participant" }) {
  const ref = useRef(null);
  const [needClick, setNeedClick] = useState(false);   // ถ้า autoplay ถูกบล็อก
  const [hasAudio, setHasAudio] = useState(!muted);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.srcObject = stream || null;

    // พยายามเล่นอัตโนมัติ
    const tryPlay = async () => {
      try {
        // ถ้ามีเสียงและเบราว์เซอร์บล็อก autoplay จะ throw
        await el.play();
        setNeedClick(false);
      } catch (err) {
        // โดน policy บล็อก -> ให้ user คลิก
        setNeedClick(true);
      }
    };

    if (stream) {
      // กำหนดค่าเริ่มต้น
      el.playsInline = true;
      el.autoplay = true;
      el.muted = muted || !hasAudio; // local ให้ mute เสมอ, remote mute ถ้าเราปิดเสียง
      tryPlay();
    } else {
      setNeedClick(false);
    }
  }, [stream, muted, hasAudio]);

  const onStart = async () => {
    const el = ref.current;
    if (!el) return;
    try {
      el.muted = muted || !hasAudio;
      await el.play();
      setNeedClick(false);
    } catch (e) {
      console.warn("video.play failed:", e);
    }
  };

  const toggleAudio = async () => {
    const next = !hasAudio;
    setHasAudio(next);
    const el = ref.current;
    if (el) {
      el.muted = muted || !next;
      if (!el.paused) {
        try { await el.play(); } catch {}
      }
    }
  };

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 8 }}>
      <div style={{ position: "relative" }}>
        <video
          ref={ref}
          style={{ width: "100%", background: "#000", borderRadius: 4 }}
        />
        {needClick && (
          <button
            onClick={onStart}
            style={{
              position: "absolute",
              inset: 0,
              margin: "auto",
              width: 140,
              height: 40,
              borderRadius: 8,
              background: "#111",
              color: "#fff",
              opacity: 0.9,
              cursor: "pointer",
            }}
            title="เริ่มเล่นวิดีโอ"
          >
            ▶ Start Video
          </button>
        )}
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: "#555", display: "flex", gap: 8, alignItems: "center" }}>
        <span>{label}</span>
        {!muted && (
          <button onClick={toggleAudio} style={{ fontSize: 12 }}>
            {hasAudio ? "🔊 Mute" : "🔇 Unmute"}
          </button>
        )}
      </div>
    </div>
  );
}
