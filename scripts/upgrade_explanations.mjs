import fs from 'fs';
import path from 'path';

const targetPath = path.resolve('public/data/SAIT_Year1.json');

function normaliseRichTextArray(plain) {
  if (!plain) return [];
  const normalisedPlain = plain.replace(/\r\n/g, '\n');
  const paragraphs = normalisedPlain
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (!paragraphs.length) return [];
  return paragraphs.map((paragraph) => ({ type: 'paragraph', content: paragraph }));
}

function ensureLocalizedStructure(value, { rtl } = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const clone = { ...value };
    const plainCandidates = [];

    if (typeof clone.plain === 'string') {
      clone.plain = clone.plain.replace(/\r\n/g, '\n').trim();
      plainCandidates.push(clone.plain);
    }
    if (typeof clone.content === 'string' && !clone.plain) {
      const trimmed = clone.content.replace(/\r\n/g, '\n').trim();
      if (trimmed) plainCandidates.push(trimmed);
    }
    if (typeof clone.text === 'string' && !clone.plain) {
      const trimmed = clone.text.replace(/\r\n/g, '\n').trim();
      if (trimmed) plainCandidates.push(trimmed);
    }

    if (!clone.plain && plainCandidates.length) {
      clone.plain = plainCandidates[0];
    }

    if (clone.richText === undefined) {
      const plain = typeof clone.plain === 'string' ? clone.plain : '';
      clone.richText = normaliseRichTextArray(plain);
    } else if (Array.isArray(clone.richText)) {
      clone.richText = clone.richText.map((block) => {
        if (typeof block === 'string') {
          return { type: 'paragraph', content: block };
        }
        if (block && typeof block === 'object') {
          return block;
        }
        return { type: 'paragraph', content: String(block ?? '') };
      });
    } else {
      const richTextString = String(clone.richText ?? '').trim();
      clone.richText = normaliseRichTextArray(richTextString);
    }

    if (rtl && !clone.direction) {
      clone.direction = 'rtl';
    }

    if (!clone.plain && clone.richText && clone.richText.length) {
      const firstBlock = clone.richText.find((block) => block && typeof block === 'object');
      if (firstBlock) {
        clone.plain = (firstBlock.content || firstBlock.text || firstBlock.value || '').toString().trim();
      }
    }

    if (!clone.richText) {
      clone.richText = [];
    }

    return clone;
  }

  const primitive = value == null ? '' : String(value);
  const plain = primitive.replace(/\r\n/g, '\n').trim();
  const richText = normaliseRichTextArray(plain);
  const localized = { plain, richText };
  if (rtl) localized.direction = 'rtl';
  return localized;
}

function upgradeExplanation(explanation) {
  const safeExplanation = explanation ?? {};

  if (typeof safeExplanation === 'string' || Array.isArray(safeExplanation)) {
    return {
      en: ensureLocalizedStructure(safeExplanation, { rtl: false }),
      ar: ensureLocalizedStructure('', { rtl: true })
    };
  }

  return {
    en: ensureLocalizedStructure(safeExplanation.en ?? '', { rtl: false }),
    ar: ensureLocalizedStructure(safeExplanation.ar ?? '', { rtl: true })
  };
}

function traverseQuestions(data) {
  if (!data || !Array.isArray(data.sections)) return;

  data.sections.forEach((section) => {
    if (!section || !Array.isArray(section.questions)) return;
    section.questions.forEach((question) => {
      if (!question) return;
      question.explanation = upgradeExplanation(question.explanation);
    });
  });
}

function main() {
  const original = fs.readFileSync(targetPath, 'utf8');
  const data = JSON.parse(original);
  traverseQuestions(data);
  const output = `${JSON.stringify(data, null, 2)}\n`;
  fs.writeFileSync(targetPath, output, 'utf8');
}

main();
