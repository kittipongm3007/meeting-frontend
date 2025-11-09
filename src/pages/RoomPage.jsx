// src/pages/RoomPage.jsx
import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import useSocket from "../hooks/useSocket.js";
import useLocalMedia from "../hooks/useLocalMedia.js";
import useWebRTC from "../hooks/useWebRTC.js";
import VideoTile from "../components/meeting/VideoTile.jsx";
import MeetingControls from "../components/meeting/MeetingControls.jsx";
import { useStt } from "../hooks/useStt.js";
import { useSentence } from "../hooks/useSentence.js";

const PEER_ID_KEY = "meeting.peerId";
function getPeerIdPerTab() {
    let id = sessionStorage.getItem(PEER_ID_KEY);
    if (!id) {
        id = crypto.randomUUID(); // unique ต่อ "แท็บ"
        sessionStorage.setItem(PEER_ID_KEY, id);
    }
    return id;
}
const shortId = (id) => (id ? id.slice(0, 6) : "");

export default function RoomPage() {
    const { roomId } = useParams();
    const [translated, setTranslated] = useState("");
    const clearTimerRef = useRef(null);

    const nav = useNavigate();
    const {
        supported,
        listening,
        transcript,
        interim,
        error,
        start,
        stop,
        reset,
    } = useStt({
        lang: "th-TH",
        autoRestart: true,
    });
    console.log("transcript", transcript);
    console.log("supported", supported);
    console.log("listening", listening);

    const handleAppend = useCallback((chunk) => {
        // ต่อท้าย subtitle เดิม
        setTranslated((prev) => (prev + chunk).trim());

        // ถ้ามี timer เก่าอยู่ ให้เคลียร์ก่อน
        if (clearTimerRef.current) {
            clearTimeout(clearTimerRef.current);
        }

        // ตั้งเวลาให้เคลียร์ subtitle หลัง 3 วินาที (เปลี่ยนได้)
        clearTimerRef.current = setTimeout(() => {
            setTranslated("");
        }, 3000); // 3000ms = 3 วินาที
    }, []);

    useEffect(() => {
        start();
    }, []);

    useSentence({
        liveSource: (transcript + " " + interim).trim(),
        sttLocale: "th-TH", // หรืออ่านจาก stt.lang ถ้าเก็บไว้
        targetLang: "ja", // อยากแปลเป็นอะไร
        onAppend: handleAppend,
    });

    const socket = useSocket(import.meta.env.VITE_WS_URL);
    const {
        startLocal,
        stopLocal,
        hasAudio,
        setHasAudio,
        hasVideo,
        setHasVideo,
        localStream,
    } = useLocalMedia();
    const { peers, attachLocalStream, toggleTrack, leaveAll, setSelfId } =
        useWebRTC(socket, roomId);

    const [joined, setJoined] = React.useState(false);
    const peerIdRef = React.useRef(null);
    const joinedRef = React.useRef(false);
    if (!peerIdRef.current) peerIdRef.current = getPeerIdPerTab();

    // แจ้ง useWebRTC ว่าเราเป็นใคร (ต่อแท็บ)
    React.useEffect(() => {
        setSelfId(peerIdRef.current);
    }, [setSelfId]);

    // join ห้องครั้งเดียว
    React.useEffect(() => {
        if (!socket) return;

        const doJoin = async () => {
            if (joinedRef.current) return;
            const stream = await startLocal({ audio: true, video: true });
            attachLocalStream(stream);
            socket.emit("meeting:join", { roomId, userId: peerIdRef.current });
            joinedRef.current = true;
            setJoined(true);
        };

        const onConnect = () => {
            void doJoin();
        };
        socket.on("connect", onConnect);

        if (socket.connected) {
            void doJoin();
        }

        return () => {
            socket.off("connect", onConnect);
        };
    }, [socket, roomId, startLocal, attachLocalStream]);

    // cleanup ตอนออกหน้า/รีเฟรชจริง ๆ
    React.useEffect(() => {
        const onPageHide = () => {
            leaveAll();
            stopLocal();
        };
        window.addEventListener("pagehide", onPageHide);
        return () => window.removeEventListener("pagehide", onPageHide);
    }, [leaveAll, stopLocal]);

    const leaveRoom = () => {
        leaveAll();
        stopLocal();
        joinedRef.current = false;
        setJoined(false);
        nav("/");
    };

    const copyId = async () => {
        try {
            await navigator.clipboard.writeText(peerIdRef.current);
        } catch (e) {
            console.warn("Copy failed:", e);
        }
    };

    return (
        <div>
            <h2>Room: {roomId}</h2>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                }}
            >
                <span>My userId:</span>
                <code
                    style={{
                        padding: "2px 6px",
                        background: "#f5f5f5",
                        borderRadius: 4,
                    }}
                >
                    {peerIdRef.current}
                </code>
                <button onClick={copyId} title="คัดลอก userId">
                    Copy
                </button>
                <span style={{ color: "#666" }}>
                    ({shortId(peerIdRef.current)})
                </span>
            </div>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns:
                        "repeat(auto-fill, minmax(260px, 1fr))",
                    gap: 12,
                }}
            >
                {console.log("localStream =", localStream)}
                {console.log(
                    "peers =",
                    Array.from(peers.values()).map((p) => ({
                        id: p.id,
                        hasStream: !!p.stream,
                        tracks: p.stream
                            ? p.stream.getTracks().map((t) => t.kind)
                            : [],
                    }))
                )}
                <VideoTile
                    stream={localStream}
                    muted
                    label={`You (${shortId(peerIdRef.current)})`}
                />
                {Array.from(peers.values()).map((p) => (
                    <VideoTile
                        key={p.id}
                        stream={p.stream}
                        label={p.id.slice(0, 6)}
                    />
                ))}
            </div>
            <MeetingControls
                hasAudio={hasAudio}
                hasVideo={hasVideo}
                onToggleAudio={() => {
                    setHasAudio((v) => !v);
                    toggleTrack("audio");
                }}
                onToggleVideo={() => {
                    setHasVideo((v) => !v);
                    toggleTrack("video");
                }}
                onLeave={leaveRoom}
            />
            {translated}
            {!joined && <p>กำลังเข้าร่วม...</p>}
        </div>
    );
}
