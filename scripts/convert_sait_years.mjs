#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultSourceDir = path.resolve(__dirname, '..', 'Old_Application', 'data');
const defaultOutputDir = path.resolve(__dirname, '..', 'public', 'data');

const englishMarkers = [
  { label: 'Expanded Knowledge', variant: 'info' },
  { label: 'Analogy', variant: 'info' },
  { label: 'Safety Reminder', variant: 'warning' },
  { label: 'Reminder', variant: 'info' },
  { label: 'Key Principle', variant: 'success' },
  { label: 'Key Insight', variant: 'success' },
  { label: 'Pro Tip', variant: 'success' },
  { label: 'Important', variant: 'info' },
  { label: 'Note', variant: 'info' }
];

const arabicMarkers = [
  { label: 'معرفة موسعة', variant: 'info' },
  { label: 'تشبيه', variant: 'info' },
  { label: 'تذكير بالسلامة', variant: 'warning' },
  { label: 'مبدأ أساسي', variant: 'success' },
  { label: 'نصيحة', variant: 'success' },
  { label: 'ملاحظة', variant: 'info' },
  { label: 'معلومة مهمة', variant: 'info' }
];

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function dedupeSentences(text, { isArabic }) {
  if (!text) return '';
  const sentenceRegex = isArabic ? /(?<=[.!؟])\s+/u : /(?<=[.!?])\s+/u;
  const sentences = text.split(sentenceRegex);
  const seen = new Set();
  const result = [];
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    const normalized = trimmed.replace(/\s+/g, ' ').toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(trimmed);
  }
  return result.join(' ');
}

function buildReasonRegex({ isArabic }) {
  if (isArabic) {
    return /لماذا\s+([^\s:]+)\s+(صحيح|غير\s+صحيح)\s*:\s*/giu;
  }
  return /Why\s+([A-Z])\s+is\s+((?:in)?correct)\s*:\s*/giu;
}

function extractReasonBlocks(text, options) {
  const { isArabic } = options;
  const regex = buildReasonRegex(options);
  const matches = [...text.matchAll(regex)];
  if (!matches.length) {
    const clean = text.trim();
    return {
      preface: clean,
      listItems: [],
      plain: clean
    };
  }

  const preface = text.slice(0, matches[0].index).trim();
  const listItems = [];
  let plain = '';

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const labelRaw = match[0].replace(/\s+/g, ' ').trim().replace(/:$/, '');
    const start = match.index + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const body = text.slice(start, end).trim();
    if (!body) continue;
    const htmlLabel = `<strong>${labelRaw}:</strong>`;
    listItems.push({ content: `${htmlLabel} ${body}` });
    const isCorrect = isArabic ? /صحيح$/u.test(labelRaw) && !/غير\s+صحيح$/u.test(labelRaw)
      : /correct$/i.test(labelRaw) && !/incorrect$/i.test(labelRaw);
    if (!plain && isCorrect) {
      plain = body;
    }
  }

  if (!plain && listItems.length) {
    const withoutTags = listItems[0].content.replace(/<[^>]+>/g, '').trim();
    plain = withoutTags;
  }

  return { preface, listItems, plain };
}

function extractMarkerBlocks(text, markers, options) {
  if (!text) return [];
  const labels = markers.map((m) => m.label);
  const markerRegex = new RegExp(`(${labels.map(escapeRegExp).join('|')})\\s*:\\s*`, 'giu');
  const matches = [...text.matchAll(markerRegex)];
  const blocks = [];
  let cursor = 0;

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const start = match.index;
    const preceding = text.slice(cursor, start).trim();
    if (preceding) {
      blocks.push({ type: 'paragraph', content: preceding });
    }
    const label = match[1];
    const markerDef = markers.find((m) => m.label.toLowerCase() === label.toLowerCase()) || { variant: 'info' };
    const nextStart = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const body = text.slice(match.index + match[0].length, nextStart).trim();
    if (body) {
      blocks.push({
        type: 'note',
        variant: markerDef.variant || 'info',
        title: label,
        content: body
      });
    }
    cursor = nextStart;
  }

  const tail = text.slice(cursor).trim();
  if (tail) {
    blocks.push({ type: 'paragraph', content: tail });
  }

  return blocks;
}

export function buildExplanation(rawText, { language }) {
  const isArabic = language === 'ar';
  const markers = isArabic ? arabicMarkers : englishMarkers;
  const prefixRegex = isArabic ? /^الشرح\s*:\s*/iu : /^Explanation\s*:\s*/iu;

  if (!rawText || !rawText.trim()) {
    const base = { plain: '', richText: [] };
    if (isArabic) base.direction = 'rtl';
    return base;
  }

  let text = rawText.replace(/\r?\n/g, ' ').replace(/\u00a0/g, ' ');
  text = text.replace(prefixRegex, '').trim();
  text = text.replace(/\s{2,}/g, ' ');
  text = dedupeSentences(text, { isArabic });

  const markerLabels = markers.map((m) => m.label);
  const markerRegex = markerLabels.length
    ? new RegExp(`(${markerLabels.map(escapeRegExp).join('|')})\\s*:\\s*`, 'iu')
    : null;
  const markerMatch = markerRegex ? markerRegex.exec(text) : null;
  const boundary = markerMatch ? markerMatch.index : text.length;

  const beforeMarkers = text.slice(0, boundary).trim();
  const afterMarkers = markerMatch ? text.slice(boundary).trim() : '';

  const { preface, listItems, plain: reasonPlain } = extractReasonBlocks(beforeMarkers, { isArabic });
  const blocks = [];
  if (preface) {
    blocks.push({ type: 'paragraph', content: preface });
  }
  if (listItems.length) {
    blocks.push({ type: 'list', style: 'unordered', items: listItems });
  }

  const markerBlocks = extractMarkerBlocks(afterMarkers, markers, { isArabic });
  blocks.push(...markerBlocks);

  if (!blocks.length && beforeMarkers) {
    blocks.push({ type: 'paragraph', content: beforeMarkers });
  }

  let plain = reasonPlain;
  if (!plain) {
    const firstParagraph = blocks.find((block) => block.type === 'paragraph');
    if (firstParagraph) plain = firstParagraph.content;
  }
  if (!plain && blocks.length) {
    const firstNote = blocks.find((block) => block.type === 'note' && block.content);
    if (firstNote) plain = `${firstNote.title}: ${firstNote.content}`;
  }
  if (!plain) {
    plain = text;
  }

  // Ensure plain is a simple string without HTML tags
  plain = plain.replace(/<[^>]+>/g, '').trim();

  const filteredBlocks = blocks.filter((block) => {
    if (block.type === 'list') return block.items && block.items.length;
    if (block.type === 'note') return Boolean(block.content);
    return Boolean(block.content);
  });

  const explanation = {
    plain,
    richText: filteredBlocks
  };

  if (isArabic && (plain || filteredBlocks.length)) {
    explanation.direction = 'rtl';
  }

  return explanation;
}

function convertQuestion(question) {
  return {
    ...question,
    explanation: {
      en: buildExplanation(question.explanation?.en ?? '', { language: 'en' }),
      ar: buildExplanation(question.explanation?.ar ?? '', { language: 'ar' })
    }
  };
}

function convertSection(section) {
  return {
    ...section,
    questions: section.questions.map(convertQuestion)
  };
}

async function convertYearFile(sourcePath, outputDir) {
  const raw = await fs.readFile(sourcePath, 'utf8');
  const data = JSON.parse(raw);
  const converted = {
    ...data,
    sections: data.sections.map(convertSection)
  };
  const outputPath = path.join(outputDir, path.basename(sourcePath));
  await fs.writeFile(outputPath, `${JSON.stringify(converted, null, 2)}\n`, 'utf8');
  return outputPath;
}

async function main() {
  const sourceDir = process.argv[2] ? path.resolve(process.argv[2]) : defaultSourceDir;
  const outputDir = process.argv[3] ? path.resolve(process.argv[3]) : defaultOutputDir;

  const entries = await fs.readdir(sourceDir);
  const yearFiles = entries.filter((name) => /^SAIT_Year\d+\.json$/i.test(name));
  if (!yearFiles.length) {
    console.warn(`No SAIT_Year*.json files found in ${sourceDir}`);
    return;
  }

  await fs.mkdir(outputDir, { recursive: true });

  const results = [];
  for (const file of yearFiles) {
    const sourcePath = path.join(sourceDir, file);
    const outputPath = await convertYearFile(sourcePath, outputDir);
    results.push({ sourcePath, outputPath });
  }

  for (const result of results) {
    console.log(`Converted ${result.sourcePath} -> ${result.outputPath}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('Failed to convert SAIT year files:', error);
    process.exit(1);
  });
}
