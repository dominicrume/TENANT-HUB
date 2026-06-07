"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { RecordFields } from "../../../../../components/intake/RecordFields";
import type { Draft } from "../../../../../lib/intake";

export default function VoiceExtractPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const router = useRouter();
  
  const [data, setData] = useState<Record<string, unknown>>({});
  const [confidence, setConfidence] = useState<Record<string, string>>({});
  const [transcript, setTranscript] = useState<string | null>(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);

  const loadDraft = useCallback(async () => {
    const res = await fetch(`/api/drafts/${draftId}`);
    if (res.ok) {
      const d = (await res.json()) as Draft;
      setData((d.machine_state?.extracted as Record<string, unknown>) ?? {});
    }
  }, [draftId]);

  useEffect(() => {
    void loadDraft();
    return () => {
      if (timerInterval.current) clearInterval(timerInterval.current);
      if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
        mediaRecorder.current.stop();
      }
    };
  }, [loadDraft]);

  async function startRecording() {
    try {
      setNote(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorder.current = recorder;
      audioChunks.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: "audio/webm" });
        stream.getTracks().forEach(track => track.stop());
        await processAudio(audioBlob);
      };

      recorder.start();
      setIsRecording(true);
      setTimer(0);
      timerInterval.current = setInterval(() => {
        setTimer((t) => t + 1);
      }, 1000);
    } catch (err) {
      setNote("Microphone access denied or unavailable.");
    }
  }

  function stopRecording() {
    if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
      mediaRecorder.current.stop();
      setIsRecording(false);
      if (timerInterval.current) clearInterval(timerInterval.current);
    }
  }

  async function processAudio(blob: Blob) {
    setBusy(true);
    setNote("Transcribing and extracting fields with AI...");
    
    const formData = new FormData();
    // OpenAI Whisper works best with explicitly named files with extensions like .webm or .mp3
    formData.append("audio", blob, "recording.webm");

    try {
      const res = await fetch("/api/intake/voice", {
        method: "POST",
        body: formData,
      });
      const body = await res.json();
      
      setData((prev) => ({ ...prev, ...(body.extracted ?? {}) }));
      setConfidence(body.confidence ?? {});
      if (body.transcript) setTranscript(body.transcript);
      if (body.note) setNote(body.note);
      else setNote("Extraction complete. Please review the fields.");
    } catch (err) {
      setNote("Failed to process audio.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    await fetch(`/api/drafts/${draftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machine_state: { input_mode: "voice", extracted: data }, step: 2 }),
    });
    router.push(`/intake/${draftId}/review`);
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div>
      <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--navy)", marginBottom: "16px" }}>Voice Intake</h1>

      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        {/* Left — recording UI */}
        <div style={{ flex: "1 1 280px" }}>
          <div style={{ border: "2px dashed #D9D2C7", borderRadius: "12px", padding: "30px 20px", textAlign: "center", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
            
            <div style={{
              width: "80px", height: "80px", borderRadius: "50%",
              background: isRecording ? "#E05252" : "#f1f5f9",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "32px", color: isRecording ? "#fff" : "var(--navy)",
              transition: "background 0.3s",
              boxShadow: isRecording ? "0 0 0 8px rgba(224, 82, 82, 0.2)" : "none",
              animation: isRecording ? "pulse 1.5s infinite" : "none"
            }}>
              🎤
            </div>

            <style dangerouslySetInnerHTML={{__html: `
              @keyframes pulse {
                0% { box-shadow: 0 0 0 0 rgba(224, 82, 82, 0.4); }
                70% { box-shadow: 0 0 0 15px rgba(224, 82, 82, 0); }
                100% { box-shadow: 0 0 0 0 rgba(224, 82, 82, 0); }
              }
            `}} />

            <div style={{ fontSize: "24px", fontFamily: "'JetBrains Mono',monospace", color: "var(--navy)", fontWeight: 600 }}>
              {formatTime(timer)}
            </div>

            {isRecording ? (
              <button onClick={stopRecording}
                style={{ minHeight: "44px", padding: "0 24px", borderRadius: "8px", border: "none", background: "var(--navy)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                ⏹ Stop Recording
              </button>
            ) : (
              <button onClick={startRecording} disabled={busy}
                style={{ minHeight: "44px", padding: "0 24px", borderRadius: "8px", border: "1px solid #E05252", background: "#fff", color: "#E05252", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer" }}>
                ⏺ Start Recording
              </button>
            )}

          </div>

          {note && <p style={{ fontSize: "13px", color: "#7A8499", marginTop: "12px", background: "#f8fafc", padding: "10px", borderRadius: "8px" }}>{note}</p>}
          
          {transcript && (
            <div style={{ marginTop: "16px" }}>
              <h4 style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--amber)", marginBottom: "8px" }}>Transcript</h4>
              <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5, background: "#F8F4EF", padding: "12px", borderRadius: "8px" }}>
                &quot;{transcript}&quot;
              </p>
            </div>
          )}
        </div>

        {/* Right — editable fields */}
        <div style={{ flex: "2 1 380px" }}>
          <RecordFields data={data} confidence={confidence} onChange={(k, v) => setData((d) => ({ ...d, [k]: v }))} />
        </div>
      </div>

      <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
        <button onClick={confirm} disabled={busy || Object.keys(data).length === 0}
          style={{ minHeight: "56px", padding: "0 24px", borderRadius: "8px", border: "none", background: "var(--navy)", color: "#fff", fontWeight: 700, cursor: (busy || Object.keys(data).length === 0) ? "not-allowed" : "pointer" }}>
          Confirm Extraction →
        </button>
      </div>
    </div>
  );
}
