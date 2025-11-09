import { useCallback, useEffect, useRef, useState } from "react";

export default function useLocalMedia() {
    const [localStream, setLocalStream] = useState(null);
    const [hasAudio, setHasAudio] = useState(true);
    const [hasVideo, setHasVideo] = useState(true);
    const tracksRef = useRef({ audio: null, video: null });

    const startLocal = useCallback(async (constraints = { audio: true, video: true }) => {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log("Local stream tracks:", stream.getTracks());
        setLocalStream(stream);
        tracksRef.current.audio = stream.getAudioTracks()[0] || null;
        tracksRef.current.video = stream.getVideoTracks()[0] || null;
        return stream;
    }, []);

    const stopLocal = useCallback(() => {
        if (localStream) {
            localStream.getTracks().forEach((t) => t.stop());
            setLocalStream(null);
            tracksRef.current = { audio: null, video: null };
        }
    }, [localStream]);

    useEffect(() => {
        if (tracksRef.current.audio) tracksRef.current.audio.enabled = hasAudio;
    }, [hasAudio]);
    useEffect(() => {
        if (tracksRef.current.video) tracksRef.current.video.enabled = hasVideo;
    }, [hasVideo]);

    return { localStream, startLocal, stopLocal, hasAudio, hasVideo, setHasAudio, setHasVideo };
}
