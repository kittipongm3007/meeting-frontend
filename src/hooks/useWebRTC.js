// src/hooks/useWebRTC.js
import { useEffect, useRef, useState, useCallback } from "react";
import { createPeerConnection } from "../lib/rtc.js";

/**
 * Peer shape in peersRef:
 * {
 *   id: string,
 *   pc: RTCPeerConnection,
 *   stream: MediaStream|null,
 *   state: {
 *     makingOffer: boolean,
 *     ignoreOffer: boolean,
 *     isSettingRemoteAnswerPending: boolean,
 *     polite: boolean,
 *     // ---- Set A (anti-loop) ----
 *     negotiating: boolean,
 *     needNegotiation: boolean,
 *   }
 * }
 */

const MAX_PEERS = 12;

const makePeerState = () => ({
    makingOffer: false,
    ignoreOffer: false,
    isSettingRemoteAnswerPending: false,
    polite: true,
    negotiating: false,
    needNegotiation: false,
});

export default function useWebRTC(socket, roomId) {
    const peersRef = useRef(new Map());
    const [peers, setPeers] = useState(new Map());
    const localStreamRef = useRef(null);
    const selfIdRef = useRef(null);

    const iceServers = JSON.parse(import.meta.env.VITE_RTC_ICE_JSON || "[]");
    const refresh = () => setPeers(new Map(peersRef.current));

    const setSelfId = useCallback((id) => {
        selfIdRef.current = id;
    }, []);

    const attachLocalStream = useCallback((stream) => {
        localStreamRef.current = stream || null;
        if (!stream) return;

        // add local tracks to all existing PCs (avoid duplicates by kind)
        peersRef.current.forEach(({ pc }) => {
            const sendKinds = pc.getSenders()
                .map((s) => s.track && s.track.kind)
                .filter(Boolean);
            stream.getTracks().forEach((t) => {
                if (!sendKinds.includes(t.kind)) {
                    try { pc.addTrack(t, stream); } catch (e) { console.warn("addTrack error", e); }
                }
            });
        });
    }, []);

    // ----- Single-flight negotiation helper (Set A) -----
    const negotiate = useCallback(async (id, pc, st) => {
        if (st.negotiating) { st.needNegotiation = true; return; }
        st.negotiating = true;
        try {
            // negotiate only from stable to avoid ping-pong
            if (pc.signalingState !== "stable") return;

            st.makingOffer = true;
            const offer = await pc.createOffer();
            // if state changed while creating the offer, abort this round
            if (pc.signalingState !== "stable") return;

            await pc.setLocalDescription(offer);
            socket.emit("meeting:offer", { roomId, to: id, sdp: pc.localDescription });
        } catch (err) {
            console.warn("[negotiate] error", err);
        } finally {
            st.makingOffer = false;
            st.negotiating = false;
            if (st.needNegotiation) {
                st.needNegotiation = false;
                // schedule the next round
                negotiate(id, pc, st);
            }
        }
    }, [roomId, socket]);

    const addPeer = useCallback((id) => {
        if (!id) return null;
        if (id === selfIdRef.current) return null; // don't create a peer to self
        if (peersRef.current.has(id)) return peersRef.current.get(id);
        if (peersRef.current.size >= MAX_PEERS) {
            console.warn("[webrtc] reached MAX_PEERS, ignore", id);
            return null;
        }

        const pc = createPeerConnection({ iceServers });
        const st = makePeerState();

        // OPTIONAL (helps some browsers begin receiving even before tracks are added on remote)
        // pc.addTransceiver("video", { direction: "recvonly" });
        // pc.addTransceiver("audio", { direction: "recvonly" });

        // add local tracks if available
        if (localStreamRef.current) {
            const sendKinds = pc.getSenders()
                .map((s) => s.track && s.track.kind)
                .filter(Boolean);
            localStreamRef.current.getTracks().forEach((t) => {
                if (!sendKinds.includes(t.kind)) {
                    try { pc.addTrack(t, localStreamRef.current); } catch (e) { console.warn("addTrack error", e); }
                }
            });
        }

        // remote media
        pc.ontrack = (e) => {
            const incoming = e.streams[0];
            const p = peersRef.current.get(id);
            if (p) {
                p.stream = incoming;
                refresh();
            }
        };

        // ICE → signal to the other peer
        pc.onicecandidate = (e) => {
            if (e.candidate && socket) {
                socket.emit("meeting:ice", { roomId, to: id, candidate: e.candidate });
            }
        };

        // negotiationneeded → funnel through single-flight negotiator
        pc.onnegotiationneeded = () => {
            st.needNegotiation = true;
            negotiate(id, pc, st);
        };

        // Optional: auto ICE-restart if connection failed (keeps it resilient)
        pc.addEventListener("connectionstatechange", async () => {
            if (pc.connectionState === "failed") {
                console.warn("[webrtc] connection failed → ICE restart");
                try {
                    const offer = await pc.createOffer({ iceRestart: true });
                    await pc.setLocalDescription(offer);
                    socket.emit("meeting:offer", { roomId, to: id, sdp: pc.localDescription });
                } catch (e) {
                    console.warn("[webrtc] ICE restart error:", e);
                }
            }
        });

        const peer = { id, pc, stream: null, state: st };
        peersRef.current.set(id, peer);
        refresh();
        return peer;
    }, [iceServers, roomId, socket, negotiate]);

    const leaveAll = useCallback(() => {
        peersRef.current.forEach((p) => { try { p.pc.close(); } catch { } });
        peersRef.current.clear();
        refresh();
        if (socket && roomId) socket.emit("meeting:leave", { roomId });
    }, [socket, roomId]);

    const toggleTrack = useCallback((kind) => {
        if (!localStreamRef.current) return;
        const track = localStreamRef.current
            .getTracks()
            .find((t) => t.kind === (kind === "audio" ? "audio" : "video"));
        if (track) track.enabled = !track.enabled;
    }, []);

    useEffect(() => {
        if (!socket) return;

        const onJoined = ({ participants }) => {
            (participants || []).forEach((pid) => addPeer(pid));
            // we don't proactively createOffer here; onnegotiationneeded will fire when needed
        };

        const onUserJoined = ({ userId }) => {
            addPeer(userId);
        };

        const onOffer = async ({ from, sdp }) => {
            if (from === selfIdRef.current) return;
            const peer = addPeer(from);
            if (!peer) return;
            const pc = peer.pc;
            const st = peer.state;
            const offer = new RTCSessionDescription(sdp);

            const readyForOffer =
                !st.makingOffer &&
                (pc.signalingState === "stable" ||
                    (pc.signalingState === "have-local-offer" && st.isSettingRemoteAnswerPending));

            const offerCollision = !readyForOffer;
            st.ignoreOffer = !st.polite && offerCollision;
            if (st.ignoreOffer) {
                // "impolite" peer ignores collided offer
                return;
            }

            try {
                if (offerCollision) {
                    // roll back local offer then apply remote offer to break the loop
                    await Promise.all([
                        pc.setLocalDescription({ type: "rollback" }),
                        pc.setRemoteDescription(offer),
                    ]);
                } else {
                    await pc.setRemoteDescription(offer);
                }

                const answer = await pc.createAnswer();

                // only set local answer from have-remote-offer to avoid InvalidStateError
                if (pc.signalingState !== "have-remote-offer") return;

                await pc.setLocalDescription(answer);
                socket.emit("meeting:answer", { roomId, to: from, sdp: pc.localDescription });
            } catch (e) {
                console.warn("[offer] error", e, "state=", pc.signalingState);
            }
        };

        const onAnswer = async ({ from, sdp }) => {
            if (from === selfIdRef.current) return;
            const peer = peersRef.current.get(from);
            if (!peer) return;
            const pc = peer.pc;

            if (pc.signalingState !== "have-local-offer") {
                // ignore stray answers
                return;
            }

            try {
                peer.state.isSettingRemoteAnswerPending = true;
                await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            } catch (e) {
                console.warn("[answer] setRemoteDescription error", e);
            } finally {
                peer.state.isSettingRemoteAnswerPending = false;
            }
        };

        const onIce = async ({ from, candidate }) => {
            if (from === selfIdRef.current) return;
            const peer = peersRef.current.get(from);
            if (!peer || !candidate) return;
            try {
                await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.warn("[ice] addIceCandidate error", e);
            }
        };

        const onUserLeft = ({ userId }) => {
            const peer = peersRef.current.get(userId);
            if (peer) {
                try { peer.pc.close(); } catch { }
                peersRef.current.delete(userId);
                refresh();
            }
        };

        // (optional) roster-based GC if your backend emits it
        const onRoster = ({ participants }) => {
            const want = new Set(participants || []);
            for (const id of peersRef.current.keys()) {
                if (!want.has(id)) {
                    const p = peersRef.current.get(id);
                    try { p.pc.close(); } catch { }
                    peersRef.current.delete(id);
                }
            }
            refresh();
            (participants || []).forEach((pid) => addPeer(pid));
        };

        socket.on("meeting:joined", onJoined);
        socket.on("meeting:user-joined", onUserJoined);
        socket.on("meeting:offer", onOffer);
        socket.on("meeting:answer", onAnswer);
        socket.on("meeting:ice", onIce);
        socket.on("meeting:user-left", onUserLeft);
        socket.on("meeting:roster", onRoster);

        return () => {
            socket.off("meeting:joined", onJoined);
            socket.off("meeting:user-joined", onUserJoined);
            socket.off("meeting:offer", onOffer);
            socket.off("meeting:answer", onAnswer);
            socket.off("meeting:ice", onIce);
            socket.off("meeting:user-left", onUserLeft);
            socket.off("meeting:roster", onRoster);
        };
    }, [socket, roomId, addPeer, negotiate]);

    return { peers, attachLocalStream, toggleTrack, leaveAll, setSelfId };
}
