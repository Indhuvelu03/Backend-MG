# src/scripts/whisper_server.py
import sys
import json
import os
from faster_whisper import WhisperModel
import librosa

print("📥 Loading Whisper model...", file=sys.stderr)
model = WhisperModel("medium", device="cpu", compute_type="int8")
print("✅ Model loaded!", file=sys.stderr)

while True:
    try:
        line = sys.stdin.readline()
        if not line:
            break
            
        data = json.loads(line)
        audio_path = data.get('audio_path')
        
        if not audio_path:
            print(json.dumps({"error": "No audio path"}))
            sys.stdout.flush()
            continue
        
        segments, info = model.transcribe(
            audio_path,
            beam_size=5,
            language="en",
            vad_filter=False
        )
        
        transcription = " ".join([s.text for s in segments if s.text]).strip()
        
        result = {
            "text": transcription,
            "language": info.language,
            "length": len(transcription)
        }
        
        print(json.dumps(result))
        sys.stdout.flush()
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.stdout.flush()