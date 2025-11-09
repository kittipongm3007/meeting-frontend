import React from "react";

export default function MeetingControls({ hasAudio, hasVideo, onToggleAudio, onToggleVideo, onLeave }) {
    return (
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button onClick={onToggleAudio}>{hasAudio ? "Mute" : "Unmute"}</button>
            <button onClick={onToggleVideo}>{hasVideo ? "Stop Video" : "Start Video"}</button>
            <button onClick={onLeave} style={{ marginLeft: "auto", background: "#f33", color: "#fff" }}>
                Leave
            </button>
        </div>
    );
}
