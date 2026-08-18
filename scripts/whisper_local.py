# src/scripts/whisper_local.py
import sys
import json
import os
from faster_whisper import WhisperModel
import librosa

def transcribe_audio(audio_path):
    print(f"🎤 Processing: {audio_path}", file=sys.stderr)
    
    try:
        # Check audio duration
        duration = librosa.get_duration(path=audio_path)
        print(f"🎵 Audio duration: {duration:.2f} seconds", file=sys.stderr)
        
        # ✅ Use 'medium' model for better accuracy
        print("📥 Loading Whisper medium model...", file=sys.stderr)
        model = WhisperModel("medium", device="cpu", compute_type="int8")
        
        print("🎤 Transcribing audio...", file=sys.stderr)
        
        # ✅ Better transcription parameters
        segments, info = model.transcribe(
            audio_path, 
            beam_size=5,
            language="en",
            vad_filter=False,
            condition_on_previous_text=True,
            # ✅ Add temperature for better accuracy
            temperature=0.0
        )
        
        # Collect ALL segments
        transcription_parts = []
        for i, segment in enumerate(segments):
            if segment.text:
                transcription_parts.append(segment.text.strip())
                print(f"   Segment {i+1}: {segment.text}", file=sys.stderr)
        
        transcription = " ".join(transcription_parts).strip()
        
        result = {
            "text": transcription,
            "language": info.language,
            "length": len(transcription),
            "segments_count": len(transcription_parts),
            "audio_duration": duration
        }
        
        print(json.dumps(result))
        return True
        
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No audio file provided"}))
        sys.exit(1)
    
    audio_path = sys.argv[1]
    success = transcribe_audio(audio_path)
    sys.exit(0 if success else 1)