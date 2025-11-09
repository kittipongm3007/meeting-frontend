// src/lib/rtc.js
export function createPeerConnection({ iceServers = [] } = {}) {
    const pc = new RTCPeerConnection({ iceServers });

    pc.addEventListener("connectionstatechange", async () => {
        console.log("[pc] connectionState:", pc.connectionState);
        if (pc.connectionState === "failed") {
            // ดูว่าคู่ candidate ที่เลือกคืออะไร (ช่วยระบุว่าใช้ host/srflx/relay)
            try {
                const stats = await pc.getStats();
                stats.forEach((r) => {
                    if (r.type === "candidate-pair" && r.selected) {
                        console.log("[pc] SELECTED PAIR", {
                            localCandidateId: r.localCandidateId,
                            remoteCandidateId: r.remoteCandidateId,
                            state: r.state,
                            nominated: r.nominated,
                            bytesSent: r.bytesSent,
                            bytesReceived: r.bytesReceived,
                        });
                    }
                    if (r.type === "local-candidate" || r.type === "remote-candidate") {
                        // พิมพ์ candidate ทั้งหมด (ตัดให้สั้นหน่อย)
                        console.log(`[pc] ${r.type}`, {
                            id: r.id,
                            type: r.candidateType, // host, srflx, prflx, relay
                            protocol: r.protocol,
                            address: r.address,
                            port: r.port,
                            networkType: r.networkType,
                        });
                    }
                });
            } catch { }
        }
    });

    pc.addEventListener("iceconnectionstatechange", () => {
        console.log("[pc] iceConnectionState:", pc.iceConnectionState);
    });

    pc.addEventListener("icegatheringstatechange", () => {
        console.log("[pc] iceGatheringState:", pc.iceGatheringState);
    });

    pc.addEventListener("signalingstatechange", () => {
        console.log("[pc] signalingState:", pc.signalingState);
    });

    pc.addEventListener("icecandidateerror", (e) => {
        console.warn("[pc] icecandidateerror", e);
    });

    return pc;
}
