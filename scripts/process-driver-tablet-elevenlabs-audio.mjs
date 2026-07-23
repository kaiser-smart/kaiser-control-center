import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const audioDir = path.join(root, "public/audio/driver-tablet/elevenlabs");
const metadataPath = path.join(root, "public/audio/driver-tablet/metadata.json");

const events = {
  "tablet-intro": {
    event: "tablet_intro",
    maxSeconds: 1.15,
    targetRmsDb: -20,
    prompt: "Original premium automotive infotainment startup sound for Kaiser. Exactly 1.0 second. Restrained three-part glass-digital activation, warm satin midrange, subtle spatial width, immediate clean onset, short dry tail. Calm and professional inside a vehicle cabin. No bass hit, no gong, no alarm, no phone notification, no video game, no copied automotive melody, no voice, no music."
  },
  "primary-tap": {
    event: "primary_tap",
    maxSeconds: 0.1,
    targetRmsDb: -18,
    prompt: "Single original premium automotive touchscreen confirmation click for Kaiser. One soft tactile digital-mechanical tick lasting about 80 milliseconds at the very beginning, subtle glass and satin texture, low intensity, immediate response, clean dry stop, then silence. No beep, no keyboard click, no phone sound, no game UI, no alarm, no voice, no music, no copied car-brand sound."
  },
  "stop-completed": {
    event: "stop_completed",
    maxSeconds: 0.62,
    targetRmsDb: -20,
    prompt: "Original premium automotive interface confirmation for Kaiser when a collection stop is truly completed. A short warm two-tone sequence lasting about 0.55 seconds at the very beginning, precise and calm, satin digital texture, positive but restrained, clean short tail, then silence. No celebration, no sparkle, no bell, no phone notification, no video game, no alarm, no voice, no music, no copied car-brand sound."
  },
  "report-saved": {
    event: "report_saved",
    maxSeconds: 0.5,
    targetRmsDb: -20,
    prompt: "Original premium automotive interface confirmation for Kaiser when an operational report is saved. A calm compact confirmation lasting about 0.45 seconds at the very beginning, one soft neutral tone with a subtle secondary harmonic, clearly different from route completion, dry professional finish, then silence. No cheerful reward, no bell, no phone notification, no video game, no alarm, no voice, no music, no copied car-brand sound."
  },
  warning: {
    event: "warning",
    maxSeconds: 0.45,
    targetRmsDb: -21,
    prompt: "Original premium automotive operational warning for Kaiser. One muted amber attention tone lasting about 0.38 seconds at the very beginning, restrained, warm and clear, asks for attention without startling the driver, short dry tail, then silence. No repetition, no siren, no alarm clock, no phone sound, no game UI, no bass hit, no voice, no music, no copied car-brand sound."
  },
  "critical-warning": {
    event: "critical_warning",
    maxSeconds: 0.72,
    targetRmsDb: -18,
    prompt: "Original premium automotive safety warning for Kaiser. One clear firm two-part cue lasting about 0.65 seconds at the very beginning, focused and unmistakable but never aggressive, controlled midrange, compact tail, then silence. No siren, no harsh high beep, no panic alarm, no cinematic impact, no bass boom, no voice, no music, no copied car-brand sound."
  },
  error: {
    event: "error",
    maxSeconds: 0.45,
    targetRmsDb: -20,
    prompt: "Original premium automotive interface failure sound for Kaiser. A short neutral descending tone lasting about 0.40 seconds at the very beginning, controlled and human-friendly, clearly unsuccessful but not alarming, clean dry finish, then silence. No positive chime, no phone notification, no computer beep, no game UI, no siren, no voice, no music, no copied car-brand sound."
  },
  offline: {
    event: "offline",
    maxSeconds: 0.55,
    targetRmsDb: -21,
    prompt: "Original premium automotive connectivity-lost sound for Kaiser. One subtle descending connection cue lasting about 0.45 seconds at the very beginning, calm, soft and informational, restrained glass-digital texture, short dry tail, then silence. No error alarm, no phone notification, no computer beep, no game UI, no bass hit, no voice, no music, no copied car-brand sound."
  },
  "online-restored": {
    event: "online_restored",
    maxSeconds: 0.5,
    targetRmsDb: -21,
    prompt: "Original premium automotive connection-restored sound for Kaiser. One short clean ascending cue lasting about 0.45 seconds at the very beginning, calm and reassuring, restrained glass-digital texture, compact dry tail, then silence. No celebration, no phone notification, no computer beep, no game UI, no bell, no voice, no music, no copied car-brand sound."
  },
  "route-completed": {
    event: "route_completed",
    maxSeconds: 1.35,
    targetRmsDb: -20,
    prompt: "Original premium automotive end-of-route sound for Kaiser. A refined restrained closing sequence lasting about 1.2 seconds at the very beginning, three calm warm digital tones with subtle spatial depth, confident professional resolution, short controlled tail, then silence. No fanfare, no applause, no triumph, no orchestral music, no bass boom, no phone sound, no video game, no voice, no copied car-brand melody."
  }
};

function parseWav(buffer) {
  if (buffer.subarray(0, 4).toString("ascii") !== "RIFF" || buffer.subarray(8, 12).toString("ascii") !== "WAVE") {
    throw new Error("Unsupported WAV container");
  }
  let offset = 12;
  let format = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.subarray(offset, offset + 4).toString("ascii");
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt ") {
      format = {
        audioFormat: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bitsPerSample: buffer.readUInt16LE(start + 14)
      };
    }
    if (id === "data") data = buffer.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  if (!format || !data || format.audioFormat !== 1 || format.bitsPerSample !== 16) {
    throw new Error("Expected PCM16 WAV input");
  }
  const samples = new Int16Array(data.length / 2);
  for (let index = 0; index < samples.length; index += 1) samples[index] = data.readInt16LE(index * 2);
  return { ...format, samples };
}

function encodeWav({ channels, sampleRate, samples }) {
  const dataSize = samples.length * 2;
  const output = Buffer.alloc(44 + dataSize);
  output.write("RIFF", 0);
  output.writeUInt32LE(36 + dataSize, 4);
  output.write("WAVEfmt ", 8);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(channels, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * channels * 2, 28);
  output.writeUInt16LE(channels * 2, 32);
  output.writeUInt16LE(16, 34);
  output.write("data", 36);
  output.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples.length; index += 1) output.writeInt16LE(samples[index], 44 + (index * 2));
  return output;
}

function processAudio(input, config) {
  const { channels, sampleRate, samples } = input;
  const frameCount = Math.floor(samples.length / channels);
  let sourcePeak = 0;
  for (const sample of samples) sourcePeak = Math.max(sourcePeak, Math.abs(sample / 32768));
  const signalThreshold = Math.max(0.0025, sourcePeak * 0.018);
  const framePeak = (frame) => {
    let peak = 0;
    for (let channel = 0; channel < channels; channel += 1) peak = Math.max(peak, Math.abs(samples[(frame * channels) + channel] / 32768));
    return peak;
  };
  let first = 0;
  while (first < frameCount && framePeak(first) < signalThreshold) first += 1;
  first = Math.max(0, first - Math.floor(sampleRate * 0.006));
  let last = frameCount - 1;
  while (last > first && framePeak(last) < signalThreshold) last -= 1;
  last = Math.min(frameCount - 1, last + Math.floor(sampleRate * 0.045));
  const maxFrames = Math.floor(config.maxSeconds * sampleRate);
  const outputFrames = Math.max(1, Math.min(maxFrames, (last - first) + 1));
  const floats = new Float64Array(outputFrames * channels);
  for (let frame = 0; frame < outputFrames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      floats[(frame * channels) + channel] = samples[((first + frame) * channels) + channel] / 32768;
    }
  }
  const fadeInFrames = Math.min(outputFrames, Math.max(1, Math.floor(sampleRate * (config.event === "primary_tap" ? 0.002 : 0.006))));
  const fadeOutFrames = Math.min(outputFrames, Math.max(1, Math.floor(sampleRate * (config.event === "primary_tap" ? 0.012 : 0.045))));
  for (let frame = 0; frame < outputFrames; frame += 1) {
    const fadeIn = Math.min(1, frame / fadeInFrames);
    const fadeOut = Math.min(1, (outputFrames - 1 - frame) / fadeOutFrames);
    const gain = Math.sin(fadeIn * Math.PI * 0.5) * Math.sin(fadeOut * Math.PI * 0.5);
    for (let channel = 0; channel < channels; channel += 1) floats[(frame * channels) + channel] *= gain;
  }
  let sumSquares = 0;
  let peak = 0;
  for (const sample of floats) {
    sumSquares += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  const rms = Math.sqrt(sumSquares / floats.length) || 0.000001;
  const targetRms = 10 ** (config.targetRmsDb / 20);
  const peakCeiling = 10 ** (-1.5 / 20);
  const gain = Math.min(targetRms / rms, peak ? peakCeiling / peak : 1);
  const output = new Int16Array(floats.length);
  let finalPeak = 0;
  let finalSquares = 0;
  for (let index = 0; index < floats.length; index += 1) {
    const value = Math.max(-1, Math.min(1, floats[index] * gain));
    finalPeak = Math.max(finalPeak, Math.abs(value));
    finalSquares += value * value;
    output[index] = Math.round(value * 32767);
  }
  return {
    buffer: encodeWav({ channels, sampleRate, samples: output }),
    durationSeconds: outputFrames / sampleRate,
    peakDbfs: 20 * Math.log10(finalPeak || 0.000001),
    rmsDbfs: 20 * Math.log10(Math.sqrt(finalSquares / output.length) || 0.000001),
    trimmedStartSeconds: first / sampleRate
  };
}

const assets = [];
for (const [filePrefix, config] of Object.entries(events)) {
  for (const variant of ["a", "b", "c"]) {
    const filename = `${filePrefix}-${variant}.wav`;
    const filePath = path.join(audioDir, filename);
    const processed = processAudio(parseWav(await readFile(filePath)), config);
    await writeFile(filePath, processed.buffer);
    assets.push({
      event: config.event,
      source: "elevenlabs_sound_effects",
      source_name: config.prompt,
      created_at: "2026-07-22",
      approved_by: null,
      version: 1,
      candidate: `${filePrefix}-${variant}`,
      repository_path: `/audio/driver-tablet/elevenlabs/${filename}`,
      duration_seconds: Number(processed.durationSeconds.toFixed(3)),
      peak_dbfs: Number(processed.peakDbfs.toFixed(2)),
      rms_dbfs: Number(processed.rmsDbfs.toFixed(2)),
      edits: `trimmed leading silence ${processed.trimmedStartSeconds.toFixed(3)}s; capped duration; equal-power fades; RMS normalized; peak limited to -1.5 dBFS`
    });
  }
}

await writeFile(metadataPath, `${JSON.stringify({
  family: "Kaiser Driver Tablet ElevenLabs candidates v1",
  source: "elevenlabs_sound_effects",
  production_approved: false,
  remote_runtime_urls: false,
  assets
}, null, 2)}\n`);

console.log(`Processed ${assets.length} ElevenLabs driver-tablet candidates.`);
