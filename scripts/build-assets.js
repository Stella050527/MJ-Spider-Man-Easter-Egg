#!/usr/bin/env node

const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "assets");
const MASK_THRESHOLD = 2;
const PADDING = 24;

const SOURCES = [
  {
    id: "hang",
    input: path.join(ROOT, "蜘蛛侠-倒挂", "3", "output.mp4"),
    output: path.join(OUTPUT_DIR, "spiderman-hang.webm"),
  },
  {
    id: "pose",
    input: path.join(ROOT, "蜘蛛侠-耍帅", "2", "output.mp4"),
    output: path.join(OUTPUT_DIR, "spiderman-pose.webm"),
  },
];

function commandExists(command) {
  const check = process.platform === "win32" ? "where.exe" : "which";
  return spawnSync(check, [command], { stdio: "ignore" }).status === 0;
}

function resolveFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  if (commandExists("ffmpeg")) return "ffmpeg";

  for (const python of ["python", "python3"]) {
    try {
      return execFileSync(
        python,
        ["-c", "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim();
    } catch {
      // Try the next local Python runtime.
    }
  }

  throw new Error("ffmpeg not found. Install ffmpeg or set FFMPEG_PATH.");
}

function resolveFfprobe() {
  if (process.env.FFPROBE_PATH) return process.env.FFPROBE_PATH;
  return commandExists("ffprobe") ? "ffprobe" : null;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} failed:\n${result.stderr || result.stdout}`);
  }
  return `${result.stdout || ""}${result.stderr || ""}`;
}

function probeSource(ffmpeg, ffprobe, input) {
  if (ffprobe) {
    const output = run(ffprobe, [
      "-v", "error",
      "-show_entries", "stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels:format=duration",
      "-of", "json",
      input,
    ]);
    const data = JSON.parse(output);
    const video = data.streams.find((stream) => stream.codec_type === "video");
    const audio = data.streams.find((stream) => stream.codec_type === "audio");
    if (!video) throw new Error(`No video stream in ${input}`);
    return {
      width: video.width,
      height: video.height,
      fps: video.r_frame_rate,
      duration: Number(data.format.duration),
      videoCodec: video.codec_name,
      audio,
      probe: "ffprobe",
    };
  }

  const result = spawnSync(ffmpeg, ["-hide_banner", "-i", input], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const dimensions = output.match(/Video:.*?\b(\d{2,5})x(\d{2,5})\b/);
  const duration = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const fps = output.match(/,\s*([\d.]+) fps\b/);
  if (!dimensions || !duration) throw new Error(`Could not probe ${input}`);
  return {
    width: Number(dimensions[1]),
    height: Number(dimensions[2]),
    fps: fps?.[1] || "unknown",
    duration: Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]),
    videoCodec: output.match(/Video:\s*([^\s,(]+)/)?.[1] || "unknown",
    audio: /Audio:/.test(output) ? { codec_name: output.match(/Audio:\s*([^\s,(]+)/)?.[1] } : null,
    probe: "ffmpeg fallback",
  };
}

function analyzeMask(ffmpeg, input, width) {
  if (width % 2 !== 0) throw new Error(`Side-by-side width must be even: ${width}`);
  const output = run(ffmpeg, [
    "-hide_banner", "-loglevel", "info", "-i", input, "-an",
    "-vf", `crop=iw/2:ih:0:0,scale=in_range=tv:out_range=full,format=gray,bbox=min_val=${MASK_THRESHOLD}`,
    "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null",
  ]);

  const matches = [...output.matchAll(/x1:(\d+) x2:(\d+) y1:(\d+) y2:(\d+)/g)];
  if (!matches.length) throw new Error(`No non-transparent frames found in ${input}`);

  return matches.reduce(
    (box, match) => ({
      x1: Math.min(box.x1, Number(match[1])),
      x2: Math.max(box.x2, Number(match[2])),
      y1: Math.min(box.y1, Number(match[3])),
      y2: Math.max(box.y2, Number(match[4])),
    }),
    { x1: Infinity, x2: -1, y1: Infinity, y2: -1 },
  );
}

function evenFloor(value) {
  return Math.floor(value / 2) * 2;
}

function evenCeil(value) {
  return Math.ceil(value / 2) * 2;
}

function paddedCrop(box, halfWidth, height) {
  const x = evenFloor(Math.max(0, box.x1 - PADDING));
  const y = evenFloor(Math.max(0, box.y1 - PADDING));
  const right = Math.min(halfWidth, evenCeil(box.x2 + 1 + PADDING));
  const bottom = Math.min(height, evenCeil(box.y2 + 1 + PADDING));
  return { x, y, width: right - x, height: bottom - y };
}

function encode(ffmpeg, source, probe, crop) {
  const halfWidth = probe.width / 2;
  const filter = [
    "[0:v]split=2[masksrc][rgbsrc]",
    `[masksrc]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=in_range=tv:out_range=full,format=gray[alpha]`,
    `[rgbsrc]crop=${crop.width}:${crop.height}:${halfWidth + crop.x}:${crop.y}[color]`,
    "[color][alpha]alphamerge,format=yuva420p[video]",
  ].join(";");

  run(ffmpeg, [
    "-y", "-hide_banner", "-i", source.input,
    "-map_metadata", "-1", "-map_chapters", "-1",
    "-filter_complex", filter,
    "-map", "[video]", "-map", "0:a?",
    "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p",
    "-b:v", "0", "-crf", "24", "-deadline", "good", "-cpu-used", "2",
    "-row-mt", "1", "-auto-alt-ref", "0",
    "-c:a", "libopus", "-b:a", "128k",
    "-metadata:s:v:0", "alpha_mode=1",
    source.output,
  ], { stdio: "inherit" });
}

function verifyOutput(ffmpeg, output, expected) {
  const log = run(ffmpeg, [
    "-hide_banner", "-c:v", "libvpx-vp9", "-i", output, "-an",
    "-vf", "alphaextract,bbox=min_val=2",
    "-frames:v", "30", "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null",
  ]);
  if (!/alpha_mode\s*:\s*1/i.test(log) || !/x1:\d+/.test(log)) {
    throw new Error(`Alpha verification failed for ${output}`);
  }
  const dimensions = log.match(/Video:.*?\b(\d{2,5})x(\d{2,5})\b/);
  if (!dimensions || Number(dimensions[1]) !== expected.width || Number(dimensions[2]) !== expected.height) {
    throw new Error(`Unexpected output dimensions for ${output}`);
  }
}

function main() {
  const ffmpeg = resolveFfmpeg();
  const ffprobe = resolveFfprobe();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`ffmpeg: ${ffmpeg}`);
  console.log(`probe: ${ffprobe || "ffmpeg metadata fallback"}`);

  const manifest = [];
  for (const source of SOURCES) {
    const probe = probeSource(ffmpeg, ffprobe, source.input);
    const box = analyzeMask(ffmpeg, source.input, probe.width);
    const crop = paddedCrop(box, probe.width / 2, probe.height);
    console.log(`\n${source.id}: ${probe.width}x${probe.height}, ${probe.fps} fps, ${probe.duration.toFixed(2)}s, ${probe.videoCodec}, audio=${Boolean(probe.audio)}`);
    console.log(`alpha union: x=${box.x1}..${box.x2}, y=${box.y1}..${box.y2}`);
    console.log(`crop + ${PADDING}px padding: ${crop.width}x${crop.height}+${crop.x}+${crop.y}`);
    encode(ffmpeg, source, probe, crop);
    verifyOutput(ffmpeg, source.output, crop);
    manifest.push({ id: source.id, file: path.basename(source.output), ...crop });
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "build-info.json"),
    `${JSON.stringify({ maskThreshold: MASK_THRESHOLD, padding: PADDING, effects: manifest }, null, 2)}\n`,
  );
  console.log("\nTransparent assets built and alpha-verified.");
}

main();
