// src/pages/RoomPage.jsx
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import useLocalMedia from "../hooks/useLocalMedia.js";
import useWebRTC from "../hooks/useWebRTC.js";
import VideoTile from "../components/meeting/VideoTile.jsx";
import MeetingControls from "../components/meeting/MeetingControls.jsx";

const shortId = (id) => (id ? id.slice(0, 6) : "");

const VideoPage = ({ socket, roomId, userId }) => {
  const nav = useNavigate();

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
  if (!peerIdRef.current) peerIdRef.current = userId;

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
        <span style={{ color: "#666" }}>({shortId(peerIdRef.current)})</span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 12,
        }}
      >
        <VideoTile
          stream={localStream}
          muted
          label={`You (${shortId(peerIdRef.current)})`}
        />
        {Array.from(peers.values()).map((p) => (
          <VideoTile key={p.id} stream={p.stream} label={p.id.slice(0, 6)} />
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

      {!joined && <p>กำลังเข้าร่วม...</p>}
    </div>
  );
};

export default VideoPage;
