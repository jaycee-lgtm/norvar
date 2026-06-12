export function humanizeVoiceError(message: string): string {
  if (/payment required/i.test(message)) {
    return "ElevenLabs voice credits are exhausted — this is not a Norvar charge. "
      + "Turn off “Read replies aloud” in Settings, or add credits at elevenlabs.io.";
  }
  if (/quota|credit|insufficient/i.test(message)) {
    return "Voice service quota exceeded. Turn off voice in Settings or top up your ElevenLabs account.";
  }
  return message;
}
