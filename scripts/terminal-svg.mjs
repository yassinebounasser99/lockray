// Renders real lockray terminal output (with ANSI colors) as an SVG for the README.
// Usage: node scripts/terminal-svg.mjs "<command shown in the prompt>" < output.txt > docs/demo.svg
import { readFileSync } from "node:fs";

const command = process.argv[2] ?? "";
const input = readFileSync(0, "utf8").replace(/\r/g, "");
const COLORS = { 31: "#ff7b72", 32: "#3fb950", 33: "#e3b341", 34: "#79c0ff", 90: "#8b949e" };
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const lines = [`$ ${command}`, "", ...input.trimEnd().split("\n")];
const rendered = lines.map((line, i) => {
  if (i === 0) return `<tspan fill="#a371f7">$</tspan><tspan fill="#e6edf3"> ${esc(command)}</tspan>`;
  let color = "#e6edf3";
  let bold = false;
  let out = "";
  for (const part of line.split(/(\x1b\[[\d;]*m)/)) {
    const m = part.match(/^\x1b\[([\d;]*)m$/);
    if (m) {
      for (const code of m[1].split(";").map(Number)) {
        if (code === 0) (color = "#e6edf3"), (bold = false);
        else if (code === 1) bold = true;
        else if (COLORS[code]) color = COLORS[code];
      }
      continue;
    }
    if (part) out += `<tspan fill="${color}"${bold ? ' font-weight="700"' : ""}>${esc(part)}</tspan>`;
  }
  return out;
});

const lineH = 20;
const visible = (l) => l.replace(/\x1b\[[\d;]*m/g, "");
const width = Math.max(720, Math.ceil(Math.max(...lines.map((l) => visible(l).length)) * 7.85 + 40));
const height = 56 + lines.length * lineH + 16;
const text = rendered.map((r, i) => `<text x="20" y="${60 + i * lineH}" xml:space="preserve">${r}</text>`).join("\n  ");

process.stdout.write(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="13">
  <rect width="${width}" height="${height}" rx="10" fill="#0d1117"/>
  <rect width="${width}" height="32" rx="10" fill="#161b22"/>
  <rect y="22" width="${width}" height="10" fill="#161b22"/>
  <circle cx="20" cy="16" r="6" fill="#ff5f57"/><circle cx="40" cy="16" r="6" fill="#febc2e"/><circle cx="60" cy="16" r="6" fill="#28c840"/>
  ${text}
</svg>
`);
