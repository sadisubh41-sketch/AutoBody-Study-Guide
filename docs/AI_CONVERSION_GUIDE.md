# AI Conversion Guide

This guide is designed for anyone using an AI assistant to convert bilingual (English/Arabic) HTML question banks into the JSON schema consumed by the Auto Body Technician Study App. Pair it with `docs/question_conversion_template.json`, which mirrors the exact structure expected by the renderer.

## 1. Preparation checklist

1. **Collect source HTML** – gather the full markup for each question, including headings, choices, explanations, footnotes, and any visual cues (bold, italics, colours, lists).
2. **Identify the classification** – note the book identifier, MWA letter, task code, and question number so you can generate the proper UID (e.g. `B1AA1.01q12`). The naming rules are explained inside `public/data/book_template.json`.
3. **Confirm translations** – ensure you have both English and Arabic text for the stem, answer options, and explanations. If Arabic content is missing, leave the field empty rather than machine translating it.

## 2. Recommended prompt outline

Below is a proven prompt skeleton you can paste into your AI tool before supplying the HTML. Adapt the placeholders as needed.

```text
You are converting Auto Body Technician exam questions from HTML into the JSON schema used by our study application.

Constraints:
- Preserve bilingual content (English + Arabic). Do not add machine translations.
- Keep formatting cues: paragraphs, bullet lists, numbered steps, <strong>bold</strong>, <em>italic</em>, <u>underline</u>, and coloured spans.
- For coloured spans use inline HTML (e.g. <span style="color:#0f766e">value</span>).
- Explanations must include both a short "plain" summary and a "richText" array matching the supported block types (paragraph, heading, list, note, quote, divider).
- Generate valid JSON. Do not include comments.

Output:
- Fill the fields in `docs/question_conversion_template.json`.
- Return an array of question objects ready to merge into a book file.
```

After the system prompt, paste the HTML for one or more questions. When the AI replies with JSON, validate the structure before saving.

## 3. Step-by-step workflow

1. **Segment the HTML** – split the source into individual questions so the AI can focus on one item at a time.
2. **Map metadata** – determine the correct `uid`, `classification.mwa`, `classification.task`, and `type` (e.g. `knowledge`, `procedural`).
3. **Populate question text** – copy the English and Arabic stems into `question.en` and `question.ar`. Retain any inline markup that conveys meaning (subscripts, bold labels, etc.).
4. **Populate choices** – ensure each choice has a matching Arabic translation. Maintain the original ordering from the HTML.
5. **Mark the correct answer** – set `correctAnswerIndex` to the zero-based index of the right option.
6. **Build explanations** – summarise the rationale in `plain`, then break the explanation into rich blocks:
   - Paragraphs for prose.
   - Ordered or unordered lists for step-by-step instructions.
   - Notes for safety reminders, troubleshooting tips, or manufacturer cautions (choose the appropriate `variant`).
   - Headings for mini sections.
   - Use coloured spans to highlight torque specs, tolerances, or other critical values.
7. **Arabic formatting** – include `"direction": "rtl"` whenever the Arabic explanation is provided so the renderer applies right-to-left layout automatically.
8. **Repeat** – process each question, appending it to the `questions` array from the template.

## 4. Validation tips

* Run the generated JSON through a linter (`jq`, `jsonlint`) to catch syntax issues.
* Open the Settings → **Add New Book** wizard in the app and upload the file. The built-in validator checks the schema, classification codes, and answer counts.
* Review explanations in the Review page to confirm lists, notes, and coloured spans render correctly.
* If glossary highlighting should catch key terms, ensure the text matches the canonical forms stored in `public/data/glossary.json`.

## 5. Deliverables for each batch

* The populated book JSON file ready to copy into `public/data/`.
* An updated `data.json` entry (add the new filename to `bookFiles`).
* Optional: a log file enumerating the source HTML files processed and any outstanding gaps (e.g. missing Arabic translation).

Keeping these artefacts together ensures future imports remain consistent and auditable.
