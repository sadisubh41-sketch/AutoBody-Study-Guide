# AutoBody Technician Study App

## Overview

This project powers an interactive study experience for Auto Body Technician apprentices preparing for the Red Seal exam. The interface now uses a teal-and-ember neutral palette that keeps contrast consistent across modern browsers, and it supports richly formatted explanations so learners can review multi-paragraph notes, bullet lists, emphasis, and colour-coded callouts in both English and Arabic.

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Run the development server:

   ```bash
   npm run dev
   ```

   The Vite dev server runs on port 5173 by default.

3. Build for production:

   ```bash
   npm run build
   ```

## Data files

Runtime content lives under `public/data/` and is orchestrated by `public/data.json`.

* `book_template.json` shows the full book structure, including the updated explanation format.
* `glossary.json` feeds the glossary overlay and automated term highlighting.
* Additional book JSON files should be listed in `bookFiles` inside `data.json`.

### Converting SAIT year exports

Legacy SAIT exports from the `Old_Application/data/` folder can be upgraded with:

```bash
node scripts/convert_sait_years.mjs
```

The script reads every `SAIT_Year*.json` file in `Old_Application/data/`, normalises
the explanations into the `plain` + `richText` structure, and writes the result to
`public/data/`. Run it again whenever a new year file is dropped into the legacy
folder.

## Rich explanation format

Each question accepts either a simple string or a structured object for the `explanation` field. The recommended structure looks like this:

```json
"explanation": {
  "en": {
    "plain": "Quick summary in English.",
    "richText": [
      { "type": "heading", "level": 5, "content": "Why this matters" },
      { "type": "paragraph", "content": "Provide context with <strong>emphasis</strong> where helpful." },
      {
        "type": "list",
        "style": "unordered",
        "items": [
          "Break the reasoning into digestible bullet points.",
          { "content": "Highlight critical values such as <span style=\"color:#0f766e\">torque to 45 Nm</span>." }
        ]
      },
      { "type": "note", "variant": "warning", "title": "Safety", "content": "Disconnect the battery before electrical work." }
    ]
  },
  "ar": {
    "plain": "ملخص موجز باللغة العربية.",
    "direction": "rtl",
    "richText": [
      { "type": "paragraph", "content": "فسّر السبب الرئيسي مع إمكانية استخدام <strong>التنسيق</strong> للتأكيد." },
      {
        "type": "list",
        "style": "unordered",
        "items": [
          "قسّم الشرح إلى نقاط واضحة.",
          { "content": "ميّز الأرقام المهمة، مثل <span style=\"color:#f97316\">45 نيوتن متر</span>." }
        ]
      }
    ]
  }
}
```

Block types currently supported in `richText` are:

* `paragraph`
* `heading` (levels 2–6)
* `list` (`style` = `ordered` | `unordered`)
* `note` (`variant` = `info` | `success` | `warning` | `danger`)
* `quote`
* `divider`
* inline HTML spans for colour (`<span style="color:#...">`)

Plain strings continue to work; the renderer automatically converts new lines into paragraphs.

## AI-assisted question conversion

To automate data entry from bilingual HTML sources:

1. Review the prompt outline in `docs/AI_CONVERSION_GUIDE.md`. It contains a checklist, pre-flight validation rules, and a recommended system message for large language models.
2. Supply the AI with the JSON scaffold in `docs/question_conversion_template.json`. This template mirrors the runtime schema and highlights the new rich-text capabilities.
3. Paste the AI’s output into a new book file (for example, copy `public/data/book_template.json`, update it with your converted questions, and register the file inside `public/data.json`).
4. Validate the JSON using the “Add New Book” wizard in the Settings page to confirm structural integrity before shipping it with the app.

The `docs/` directory includes reusable assets for the AI workflow so future batches can be processed consistently.
