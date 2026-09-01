import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const artifactPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(scriptDir, '../docs/auto-continue-workflow.html');

// Lucide icon geometry uses viewBox="0 0 24 24". The surrounding Archify
// semantic class continues to own color, stroke width, theme, and interaction.
// Source and license: https://lucide.dev/ and
// docs/auto-continue-workflow-icons.LICENSE.txt.
const icons = {
  turn_end: {
    name: 'radio',
    elements: [
      '<path d="M16.247 7.761a6 6 0 0 1 0 8.478"/>',
      '<path d="M19.075 4.933a10 10 0 0 1 0 14.134"/>',
      '<path d="M4.925 19.067a10 10 0 0 1 0-14.134"/>',
      '<path d="M7.753 16.239a6 6 0 0 1 0-8.478"/>',
      '<circle cx="12" cy="12" r="2"/>',
    ],
  },
  classify_failure: {
    name: 'scan-search',
    elements: [
      '<path d="M3 7V5a2 2 0 0 1 2-2h2"/>',
      '<path d="M17 3h2a2 2 0 0 1 2 2v2"/>',
      '<path d="M21 17v2a2 2 0 0 1-2 2h-2"/>',
      '<path d="M7 21H5a2 2 0 0 1-2-2v-2"/>',
      '<circle cx="12" cy="12" r="3"/>',
      '<path d="m16 16-1.9-1.9"/>',
    ],
  },
  safety_gate: {
    name: 'shield-check',
    elements: [
      '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
      '<path d="m9 12 2 2 4-4"/>',
    ],
  },
  grace_wait: {
    name: 'timer',
    elements: [
      '<line x1="10" x2="14" y1="2" y2="2"/>',
      '<line x1="12" x2="15" y1="14" y2="11"/>',
      '<circle cx="12" cy="14" r="8"/>',
    ],
  },
  compose_prompt: {
    name: 'message-square-text',
    elements: [
      '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/>',
      '<path d="M7 11h10"/>',
      '<path d="M7 15h6"/>',
      '<path d="M7 7h8"/>',
    ],
  },
  agent_followup: {
    name: 'send',
    elements: [
      '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/>',
      '<path d="m21.854 2.147-10.94 10.939"/>',
    ],
  },
  recovery_feedback: {
    name: 'circle-check-big',
    elements: [
      '<path d="M21.801 10A10 10 0 1 1 17 3.335"/>',
      '<path d="m9 11 3 3L22 4"/>',
    ],
  },
  agent_cancel: {
    name: 'circle-stop',
    elements: [
      '<circle cx="12" cy="12" r="10"/>',
      '<rect x="9" y="9" width="6" height="6" rx="1"/>',
    ],
  },
  manual_stop: {
    name: 'hand',
    elements: [
      '<path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2"/>',
      '<path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2"/>',
      '<path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/>',
      '<path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    ],
  },
};

const ICON_SCALE = 0.4583333333;
const ICON_RENDERED_SIZE = 24 * ICON_SCALE;

function compactNumber(value) {
  return Number(value.toFixed(4)).toString();
}

function replaceTextY(nodeHtml, selectorPattern, y) {
  const pattern = new RegExp(`(<text ${selectorPattern}[^>]*\\sy=")[^"]+("[^>]*>)`);
  if (!pattern.test(nodeHtml)) return nodeHtml;
  return nodeHtml.replace(pattern, `$1${compactNumber(y)}$2`);
}

let html = fs.readFileSync(artifactPath, 'utf8');
let applied = 0;

for (const [nodeId, icon] of Object.entries(icons)) {
  const nodeStart = html.indexOf(`<g id="node-${nodeId}"`);
  if (nodeStart === -1) throw new Error(`Missing workflow node: ${nodeId}`);

  const nextNode = html.indexOf('<g id="node-', nodeStart + 1);
  const edgeLabels = html.indexOf('<!-- Edge labels -->', nodeStart);
  const nodeEnd = nextNode === -1 ? edgeLabels : Math.min(nextNode, edgeLabels);
  if (nodeEnd === -1) throw new Error(`Missing workflow node boundary: ${nodeId}`);

  let nodeHtml = html.slice(nodeStart, nodeEnd);
  const rectMatch = nodeHtml.match(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/);
  if (!rectMatch) throw new Error(`Missing workflow node bounds: ${nodeId}`);

  const [, rawX, rawY, rawWidth, rawHeight] = rectMatch;
  const x = Number(rawX);
  const y = Number(rawY);
  const width = Number(rawWidth);
  const height = Number(rawHeight);
  const iconX = x + (width - ICON_RENDERED_SIZE) / 2;
  const iconY = y + 5;

  const sigilStart = nodeHtml.indexOf('<g aria-hidden="true" data-semantic-sigil=');
  const nodeLabel = nodeHtml.indexOf('<text data-node-label=');
  if (sigilStart === -1 || nodeLabel === -1 || sigilStart > nodeLabel) {
    throw new Error(`Missing semantic sigil for node: ${nodeId}`);
  }

  const openEnd = nodeHtml.indexOf('>', sigilStart);
  const closeStart = nodeHtml.indexOf('</g>', openEnd);
  if (openEnd === -1 || closeStart === -1 || closeStart > nodeLabel) {
    throw new Error(`Malformed semantic sigil for node: ${nodeId}`);
  }

  let openTag = nodeHtml.slice(sigilStart, openEnd + 1)
    .replace(/\sdata-lucide-icon="[^"]*"/, '')
    .replace(/\sdata-icon-layout="[^"]*"/, '')
    .replace(/transform="[^"]*"/, `transform="translate(${compactNumber(iconX)} ${compactNumber(iconY)}) scale(${ICON_SCALE})"`)
    .replace(/>$/, ` data-lucide-icon="${icon.name}" data-icon-layout="stacked">`);
  const body = icon.elements.map((element) => `            ${element}`).join('\n');
  nodeHtml = `${nodeHtml.slice(0, sigilStart)}${openTag}\n${body}\n          ${nodeHtml.slice(closeStart)}`;

  // Stack icon, title, detail, and optional tag on distinct baselines.
  // Standard nodes are 52px high; tagged nodes use the extra 16px row.
  nodeHtml = replaceTextY(nodeHtml, 'data-node-label="[^"]*"', y + 29);
  nodeHtml = replaceTextY(nodeHtml, 'data-detail="context"', y + (height > 52 ? 46 : 44));
  nodeHtml = replaceTextY(nodeHtml, 'data-detail="fine"', y + 61);

  html = `${html.slice(0, nodeStart)}${nodeHtml}${html.slice(nodeEnd)}`;
  applied += 1;
}

const attribution = '<!-- Node glyphs: Lucide Icons; see auto-continue-workflow-icons.LICENSE.txt -->';
if (!html.includes(attribution)) {
  html = html.replace('        <!-- Nodes -->', `        <!-- Nodes -->\n        ${attribution}`);
}

fs.writeFileSync(artifactPath, html);
console.log(`Applied ${applied} Lucide workflow icons to ${artifactPath}`);
