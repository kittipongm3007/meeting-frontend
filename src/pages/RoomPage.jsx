// src/pages/RoomPage.jsx
import React, {
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useState,
} from "react";
import { useStt } from "../hooks/useStt.js";
import { useSentence } from "../hooks/useSentence.js";
import VideoPage from "./VideoPage.jsx";
import useSocket from "../hooks/useSocket.js";
import { useParams } from "react-router-dom";

const PEER_ID_KEY = "meeting.peerId";
function getPeerIdPerTab() {
  let id = sessionStorage.getItem(PEER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID(); // unique ต่อ "แท็บ"
    sessionStorage.setItem(PEER_ID_KEY, id);
  }
  return id;
}

export default function RoomPage() {
  const [userId, setUserId] = useState(getPeerIdPerTab());
  const [translated, setTranSlated] = useState("");
  const [messages, setMessages] = useState("");
  const lastChunkRef = useRef("");
  const socket = useSocket(import.meta.env.VITE_WS_URL);
  const { roomId } = useParams();

  const { transcript, interim, start, stop } = useStt({
    lang: "th-TH",
    autoRestart: true,
  });

  const handleAppend = useCallback((chunk) => {
    if (!chunk || chunk === lastChunkRef.current) return;
    lastChunkRef.current = chunk;
    setTranSlated((translated + chunk).trim());
  }, []);

  const sentenceParams = useMemo(
    () => ({
      liveSource: (transcript + " " + (interim || "")).trim(),
      sttLocale: "th-TH",
      targetLang: "ja",
      onAppend: handleAppend,
    }),
    [transcript, interim, handleAppend],
  );

  const sendSocket = useCallback(
    ({ text }) => {
      if (!socket || !socket.connected) {
        console.warn("socket not ready");
        return;
      }

      const payload = { text, userId };
      setTranSlated(transcript);
      socket
        .timeout(5000)
        .emit("stt.send.message", { payload, ts: Date.now() }, (err, res) => {
          if (err) {
            console.error("stt.send.message ACK timeout/error:", err);
            return;
          }
          console.log("stt.send.message ACK:", res); // เช่น { ok: true }
        });
    },
    [socket, transcript],
  );

  useEffect(() => {
    if (!socket) return;

    const onMessage = (payload) => {
      // payload = { roomId, text, ts, ... }
      // ถ้าต้องการกรองห้อง
      // if (roomId && payload.roomId !== roomId) return;
      setMessages(payload.text);
    };

    // ตัวอย่างอีเวนต์ที่ฝั่ง server ส่งกลับมา
    // เปลี่ยนชื่ออีเวนต์ให้ตรงกับฝั่งเซิร์ฟเวอร์ของคุณ
    socket.on("stt.receive.message", onMessage);

    // อีเวนต์สถานะทั่วไป (ตัวเลือก)
    const onConnect = () => console.log("[socket] connected:", socket.id);
    const onDisconnect = (r) => console.log("[socket] disconnected:", r);
    const onError = (e) => console.warn("[socket] error:", e);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onError);

    // cleanup ตอน unmount / socket เปลี่ยน
    return () => {
      socket.off("stt.receive.message", onMessage);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onError);
    };
  }, [socket, roomId]);

  useSentence(sentenceParams);

  useEffect(() => {
    setTranSlated(transcript.trim());
    sendSocket({ text: transcript });
  }, [transcript]);

  return (
    <div>
      <VideoPage socket={socket} roomId={roomId} userId={userId} />
      <div>My message : {translated}</div>
      <div>From socket : {messages}</div>
      <div>
        <bottun onClick={() => start()}>Start</bottun>
      </div>
      <div>
        <bottun onClick={() => stop()}>Stop</bottun>
      </div>
      {/* <div>
        <bottun onClick={() => sendSocket()}>Send socket</bottun>
      </div> */}
    </div>
  );
}
