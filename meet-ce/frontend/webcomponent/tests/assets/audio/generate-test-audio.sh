#!/bin/bash

# =============================================================================
# Audio Generation Script for Smart Mosaic Layout Tests
# =============================================================================
# This script generates test audio files from a base audio file (base.wav)
# for testing the Smart Mosaic layout speaker detection functionality.
#
# Requirements:
#   - ffmpeg 7.0+ (optimized for this version)
#   - base.wav file with continuous speech audio in the same directory
#
# IMPORTANT: This script generates WAV files for best compatibility with
# Chrome's fake audio capture (--use-file-for-fake-audio-capture).
# WAV format ensures proper audio device simulation and VAD detection.
#
# Usage:
#   chmod +x generate-test-audio.sh
#   ./generate-test-audio.sh
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_AUDIO="$SCRIPT_DIR/base.wav"
OUTPUT_DIR="$SCRIPT_DIR"

# Audio settings
SAMPLE_RATE=48000
CHANNELS=1

# WAV encoding settings for Chrome fake audio capture compatibility
# PCM 16-bit is the most compatible format for Chrome's fake devices
WAV_OPTS="-c:a pcm_s16le -ar ${SAMPLE_RATE} -ac ${CHANNELS}"

# Check ffmpeg version
FFMPEG_VERSION=$(ffmpeg -version | head -n1 | grep -oP 'ffmpeg version \K[0-9]+')
echo "🔧 Detected ffmpeg major version: $FFMPEG_VERSION"

# Check if base audio exists
if [ ! -f "$BASE_AUDIO" ]; then
    echo "❌ Error: base.wav not found in $SCRIPT_DIR"
    echo "Please provide a base.wav file with continuous speech audio."
    exit 1
fi

echo ""
echo "🎵 Generating test audio files from base.wav..."
echo "   Output directory: $OUTPUT_DIR"
echo "   Sample rate: ${SAMPLE_RATE}Hz, Channels: ${CHANNELS}"
echo "   Codec: PCM 16-bit (WAV) for Chrome fake audio compatibility"
echo ""

# -----------------------------------------------------------------------------
# 1. continuous_speech.wav (30s)
# Continuous speech audio for participants who speak constantly
# -----------------------------------------------------------------------------
echo "1️⃣  Generating continuous_speech.wav (30s of continuous speech)..."
ffmpeg -y -i "$BASE_AUDIO" -t 30 -af "aresample=${SAMPLE_RATE}" $WAV_OPTS "$OUTPUT_DIR/continuous_speech.wav" 2>/dev/null
echo "   ✅ continuous_speech.wav created"

# -----------------------------------------------------------------------------
# 2. complete_silence.wav (30s)
# Complete digital silence using aevalsrc with explicit zero expression
# This generates samples with value exactly 0.0 - guaranteed no VAD trigger
# -----------------------------------------------------------------------------
echo "2️⃣  Generating complete_silence.wav (30s of TRUE digital silence)..."
ffmpeg -y -f lavfi -i "aevalsrc=0:c=mono:s=${SAMPLE_RATE}:d=30" \
    $WAV_OPTS "$OUTPUT_DIR/complete_silence.wav" 2>/dev/null
echo "   ✅ complete_silence.wav created"

# -----------------------------------------------------------------------------
# 3. speech_5s_then_silence.wav (30s)
# 5s speech, then 25s TRUE silence
# Uses amix to combine speech with silence background for clean transitions
# -----------------------------------------------------------------------------
echo "3️⃣  Generating speech_5s_then_silence.wav (5s speech + 25s TRUE silence)..."
ffmpeg -y \
    -i "$BASE_AUDIO" \
    -f lavfi -i "aevalsrc=0:c=mono:s=${SAMPLE_RATE}:d=30" \
    -filter_complex "
        [0:a]atrim=0:5,asetpts=PTS-STARTPTS,aresample=${SAMPLE_RATE}[speech];
        [1:a][speech]amix=inputs=2:duration=first:dropout_transition=0,volume=2[out]
    " \
    -map "[out]" -t 30 $WAV_OPTS "$OUTPUT_DIR/speech_5s_then_silence.wav" 2>/dev/null
echo "   ✅ speech_5s_then_silence.wav created"

# -----------------------------------------------------------------------------
# 4. silence_5s_then_speech.wav (30s)
# 5s TRUE silence, then 25s speech
# -----------------------------------------------------------------------------
echo "4️⃣  Generating silence_5s_then_speech.wav (5s TRUE silence + 25s speech)..."
ffmpeg -y \
    -i "$BASE_AUDIO" \
    -f lavfi -i "aevalsrc=0:c=mono:s=${SAMPLE_RATE}:d=30" \
    -filter_complex "
        [0:a]atrim=0:25,asetpts=PTS-STARTPTS,aresample=${SAMPLE_RATE},adelay=5s:all=1[speech];
        [1:a][speech]amix=inputs=2:duration=first:dropout_transition=0,volume=2[out]
    " \
    -map "[out]" -t 30 $WAV_OPTS "$OUTPUT_DIR/silence_5s_then_speech.wav" 2>/dev/null
echo "   ✅ silence_5s_then_speech.wav created"

# -----------------------------------------------------------------------------
# 5. speech_gap_speech.wav (30s)
# 5s speech, 10s TRUE silence, 15s speech - for testing speaker re-activation
# -----------------------------------------------------------------------------
echo "5️⃣  Generating speech_gap_speech.wav (5s speech + 10s TRUE gap + 15s speech)..."
ffmpeg -y \
    -i "$BASE_AUDIO" \
    -f lavfi -i "aevalsrc=0:c=mono:s=${SAMPLE_RATE}:d=30" \
    -filter_complex "
        [0:a]atrim=0:5,asetpts=PTS-STARTPTS,aresample=${SAMPLE_RATE}[s1];
        [0:a]atrim=5:20,asetpts=PTS-STARTPTS,aresample=${SAMPLE_RATE},adelay=15s:all=1[s2];
        [1:a][s1][s2]amix=inputs=3:duration=first:dropout_transition=0,volume=3[out]
    " \
    -map "[out]" -t 30 $WAV_OPTS "$OUTPUT_DIR/speech_gap_speech.wav" 2>/dev/null
echo "   ✅ speech_gap_speech.wav created"

# -----------------------------------------------------------------------------
# 6-11. Sequential speaker audio files (for rotation tests)
# Each speaker has a unique time window for speech with TRUE silence elsewhere
# -----------------------------------------------------------------------------
echo "6️⃣  Generating sequential speaker audio files (A through F)..."

# Speaker A: speaks 0-3s, then TRUE silence
echo "   → speaker_seq_A.wav (speaks at 0-3s)"
ffmpeg -y \
    -i "$BASE_AUDIO" \
    -f lavfi -i "aevalsrc=0:c=mono:s=${SAMPLE_RATE}:d=30" \
    -filter_complex "
        [0:a]atrim=0:3,asetpts=PTS-STARTPTS,aresample=${SAMPLE_RATE}[speech];
        [1:a][speech]amix=inputs=2:duration=first:dropout_transition=0,volume=2[out]
    " \
    -map "[out]" -t 30 $WAV_OPTS "$OUTPUT_DIR/speaker_seq_A.wav" 2>/dev/null

# Speaker B: TRUE silence 0-5s, speaks 5-8s, then TRUE silence
echo "   → speaker_seq_B.wav (speaks at 5-8s)"
ffmpeg -y \
    -i "$BASE_AUDIO" \
    -f lavfi -i "aevalsrc=0:c=mono:s=${SAMPLE_RATE}:d=30" \
    -filter_complex "
        [0:a]atrim=0:3,asetpts=PTS-STARTPTS,aresample=${SAMPLE_RATE},adelay=5s:all=1[speech];
        [1:a][speech]amix=inputs=2:duration=first:dropout_transition=0,volume=2[out]
    " \
    -map "[out]" -t 30 $WAV_OPTS "$OUTPUT_DIR/speaker_seq_B.wav" 2>/dev/null

# Speaker C: TRUE silence 0-10s, speaks 10-13s, then TRUE silence
echo "   → speaker_seq_C.wav (speaks at 10-13s)"
ffmpeg -y \
    -i "$BASE_AUDIO" \
    -f lavfi -i "aevalsrc=0:c=mono:s=${SAMPLE_RATE}:d=30" \
    -filter_complex "
        [0:a]atrim=0:3,asetpts=PTS-STARTPTS,aresample=${SAMPLE_RATE},adelay=10s:all=1[speech];
        [1:a][speech]amix=inputs=2:duration=first:dropout_transition=0,volume=2[out]
    " \
    -map "[out]" -t 30 $WAV_OPTS "$OUTPUT_DIR/speaker_seq_C.wav" 2>/dev/null

# Speaker D: TRUE silence 0-15s, speaks 15-18s, then TRUE silence
echo "   → speaker_seq_D.wav (speaks at 15-18s)"
ffmpeg -y \
    -i "$BASE_AUDIO" \
    -f lavfi -i "aevalsrc=0:c=mono:s=${SAMPLE_RATE}:d=30" \
    -filter_complex "
        [0:a]atrim=0:3,asetpts=PTS-STARTPTS,aresample=${SAMPLE_RATE},adelay=15s:all=1[speech];
        [1:a][speech]amix=inputs=2:duration=first:dropout_transition=0,volume=2[out]
    " \
    -map "[out]" -t 30 $WAV_OPTS "$OUTPUT_DIR/speaker_seq_D.wav" 2>/dev/null

# Speaker E: TRUE silence 0-20s, speaks 20-23s, then TRUE silence
echo "   → speaker_seq_E.wav (speaks at 20-23s)"
ffmpeg -y \
    -i "$BASE_AUDIO" \
    -f lavfi -i "aevalsrc=0:c=mono:s=${SAMPLE_RATE}:d=30" \
    -filter_complex "
        [0:a]atrim=0:3,asetpts=PTS-STARTPTS,aresample=${SAMPLE_RATE},adelay=20s:all=1[speech];
        [1:a][speech]amix=inputs=2:duration=first:dropout_transition=0,volume=2[out]
    " \
    -map "[out]" -t 30 $WAV_OPTS "$OUTPUT_DIR/speaker_seq_E.wav" 2>/dev/null

# Speaker F: TRUE silence 0-25s, speaks 25-28s, then TRUE silence
echo "   → speaker_seq_F.wav (speaks at 25-28s)"
ffmpeg -y \
    -i "$BASE_AUDIO" \
    -f lavfi -i "aevalsrc=0:c=mono:s=${SAMPLE_RATE}:d=30" \
    -filter_complex "
        [0:a]atrim=0:3,asetpts=PTS-STARTPTS,aresample=${SAMPLE_RATE},adelay=25s:all=1[speech];
        [1:a][speech]amix=inputs=2:duration=first:dropout_transition=0,volume=2[out]
    " \
    -map "[out]" -t 30 $WAV_OPTS "$OUTPUT_DIR/speaker_seq_F.wav" 2>/dev/null

echo "   ✅ Sequential speaker files created (A-F)"

# -----------------------------------------------------------------------------
# 12. simultaneous_then_solo.wav (30s)
# 15s speech then 15s TRUE silence
# Used for the "simultaneous speech" test (this participant continues speaking)
# -----------------------------------------------------------------------------
echo "7️⃣  Generating simultaneous_then_solo.wav (15s speech + 15s TRUE silence)..."
ffmpeg -y \
    -i "$BASE_AUDIO" \
    -f lavfi -i "aevalsrc=0:c=mono:s=${SAMPLE_RATE}:d=30" \
    -filter_complex "
        [0:a]atrim=0:15,asetpts=PTS-STARTPTS,aresample=${SAMPLE_RATE}[speech];
        [1:a][speech]amix=inputs=2:duration=first:dropout_transition=0,volume=2[out]
    " \
    -map "[out]" -t 30 $WAV_OPTS "$OUTPUT_DIR/simultaneous_then_solo.wav" 2>/dev/null
echo "   ✅ simultaneous_then_solo.wav created"

# -----------------------------------------------------------------------------
# 13. simultaneous_then_stop.wav (30s)
# 5s speech then 25s TRUE silence
# Used for participants who stop speaking after simultaneous period
# -----------------------------------------------------------------------------
echo "8️⃣  Generating simultaneous_then_stop.wav (5s speech + 25s TRUE silence)..."
ffmpeg -y \
    -i "$BASE_AUDIO" \
    -f lavfi -i "aevalsrc=0:c=mono:s=${SAMPLE_RATE}:d=30" \
    -filter_complex "
        [0:a]atrim=0:5,asetpts=PTS-STARTPTS,aresample=${SAMPLE_RATE}[speech];
        [1:a][speech]amix=inputs=2:duration=first:dropout_transition=0,volume=2[out]
    " \
    -map "[out]" -t 30 $WAV_OPTS "$OUTPUT_DIR/simultaneous_then_stop.wav" 2>/dev/null
echo "   ✅ simultaneous_then_stop.wav created"

# -----------------------------------------------------------------------------
# 14. low_volume_speech.wav (30s)
# Continuous speech at 10% volume - below the audioLevel threshold (0.15)
# Used to test that participants with low audio levels are filtered out
# -----------------------------------------------------------------------------
echo "9️⃣  Generating low_volume_speech.wav (30s speech at 10% volume)..."

ffmpeg -y \
  -f lavfi -i "anoisesrc=color=pink:amplitude=0.02:s=${SAMPLE_RATE}:d=30" \
  $WAV_OPTS "$OUTPUT_DIR/ambient_pink_noise.wav" 2>/dev/null

echo "   ✅ low_volume_speech.wav created"

# -----------------------------------------------------------------------------
# 15. brief_sound_1s.wav (30s)
# Only 1 second of speech followed by silence
# Used to test minimum speaking duration filter (should be filtered out)
# -----------------------------------------------------------------------------
echo "🔟  Generating brief_sound_1s.wav (1s speech + 29s silence)..."
ffmpeg -y \
    -i "$BASE_AUDIO" \
    -f lavfi -i "aevalsrc=0:c=mono:s=${SAMPLE_RATE}:d=30" \
    -filter_complex "
        [0:a]atrim=0:1,asetpts=PTS-STARTPTS,aresample=${SAMPLE_RATE},adelay=5000|5000[speech];
        [1:a][speech]amix=inputs=2:duration=first:dropout_transition=0,volume=2[out]
    " \
    -map "[out]" -t 30 $WAV_OPTS "$OUTPUT_DIR/brief_sound_1s_at_5s.wav" 2>/dev/null
echo "   ✅ brief_sound_1s_at_5s.wav created"

# -----------------------------------------------------------------------------
# 16. brief_cough.wav (30s)
# Only 0.5 seconds of sound (simulating a cough) followed by silence
# Used to test that very brief sounds are filtered out
# -----------------------------------------------------------------------------
echo "1️⃣1️⃣ Generating brief_cough.wav (0.5s sound + 29.5s silence)..."
ffmpeg -y \
    -i "$BASE_AUDIO" \
    -f lavfi -i "aevalsrc=0:c=mono:s=${SAMPLE_RATE}:d=30" \
    -filter_complex "
        [0:a]atrim=0:0.5,asetpts=PTS-STARTPTS,aresample=${SAMPLE_RATE},adelay=5000|5000[speech];
        [1:a][speech]amix=inputs=2:duration=first:dropout_transition=0,volume=2[out]
    " \
    -map "[out]" -t 30 $WAV_OPTS "$OUTPUT_DIR/brief_cough_at_5s.wav" 2>/dev/null
echo "   ✅ brief_cough_at_5s.wav created"

# -----------------------------------------------------------------------------
# Verify silence in generated files
# -----------------------------------------------------------------------------
echo ""
echo "🔍 Verifying silence quality in generated files..."
verify_silence() {
    local file=$1
    local expected_silence_start=$2

    # Check RMS level in silence portion (should be exactly 0 or very close)
    local rms=$(ffmpeg -i "$file" -af "atrim=${expected_silence_start}:${expected_silence_start}+1,astats=metadata=1:reset=1" -f null - 2>&1 | grep "RMS level" | head -1 | grep -oP '[-0-9.]+' | head -1)

    if [ -n "$rms" ]; then
        echo "   $file: RMS at ${expected_silence_start}s = ${rms}dB"
    fi
}

# Verify a few key files
verify_silence "$OUTPUT_DIR/complete_silence.wav" 15
verify_silence "$OUTPUT_DIR/speech_5s_then_silence.wav" 10
verify_silence "$OUTPUT_DIR/speaker_seq_B.wav" 2

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo ""
echo "============================================================================="
echo "✅ Audio generation complete! (WAV format for Chrome fake audio capture)"
echo "============================================================================="
echo ""
echo "Generated files:"
echo "  📁 $OUTPUT_DIR/"
echo "  ├── continuous_speech.wav        (30s continuous speech)"
echo "  ├── complete_silence.wav         (30s TRUE digital silence - aevalsrc=0)"
echo "  ├── speech_5s_then_silence.wav   (5s speech + 25s TRUE silence)"
echo "  ├── silence_5s_then_speech.wav   (5s TRUE silence + 25s speech)"
echo "  ├── speech_gap_speech.wav        (5s speech + 10s gap + 15s speech)"
echo "  ├── speaker_seq_A.wav            (speaks at 0-3s)"
echo "  ├── speaker_seq_B.wav            (speaks at 5-8s)"
echo "  ├── speaker_seq_C.wav            (speaks at 10-13s)"
echo "  ├── speaker_seq_D.wav            (speaks at 15-18s)"
echo "  ├── speaker_seq_E.wav            (speaks at 20-23s)"
echo "  ├── speaker_seq_F.wav            (speaks at 25-28s)"
echo "  ├── simultaneous_then_solo.wav   (15s speech + 15s silence)"
echo "  ├── simultaneous_then_stop.wav   (5s speech + 25s silence)"
echo "  ├── low_volume_speech.wav        (30s speech at 10% volume - below threshold)"
echo "  ├── brief_sound_1s.wav           (1s speech + 29s silence - too short)"
echo "  └── brief_cough.wav              (0.5s sound + 29.5s silence - simulates cough)"
echo ""
echo "Key features of this version:"
echo "  • WAV format (PCM 16-bit) for Chrome fake audio capture compatibility"
echo "  • Uses aevalsrc=0 for TRUE digital silence (samples = 0.0)"
echo "  • amix filter for clean speech/silence transitions"
echo "  • adelay for precise speech timing"
echo "  • 48kHz sample rate, mono channel"
echo ""
echo "Usage in tests:"
echo "  await joinBrowserFakeParticipant(browser, roomId, 'speaker1', {"
echo "    audioFile: 'continuous_speech.wav'"
echo "  });"
echo ""
