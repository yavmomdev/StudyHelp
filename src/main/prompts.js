'use strict';
// Prompt builders. Every prompt asks for ONE JSON object; normalize.js repairs/validates the reply.

const MAX_SOURCE_CHARS = 60000;

function system(language) {
  const lang =
    !language || language === 'auto'
      ? 'Write in the same language as the study material (e.g. Bulgarian material gets Bulgarian output).'
      : `Write everything in ${language}.`;
  return [
    'You are StudyHelp, an expert tutor who turns study material into clear, accurate learning aids.',
    lang,
    'Only use facts that are in the material (or that are standard knowledge needed to explain it). Never invent content.',
    'Reply with ONE valid JSON object and nothing else: no markdown fences, no commentary.',
  ].join('\n');
}

function sourceBlock(texts) {
  let total = 0;
  const parts = [];
  for (const { name, text } of texts) {
    const room = MAX_SOURCE_CHARS - total;
    if (room <= 0) break;
    const chunk = text.length > room ? text.slice(0, room) + '\n[…truncated]' : text;
    total += chunk.length;
    parts.push(`=== ${name} ===\n${chunk}`);
  }
  return parts.join('\n\n');
}

const QUESTION_SPEC = `"questions": [ { "question": string, "options": [4 strings], "answerIndex": 0-3, "explanation": string (why it is correct, 1-2 sentences), "concept": string (short topic/rule name) } ]`;

const TEST_SPEC = `
${QUESTION_SPEC},
"flashcards": [ { "front": string (term/question), "back": string (answer, concise) } ],
"notes": string (a condensed plain-text version of the material, 250-600 words, keeping its key terms EXACTLY as written),
"blurryTerms": [ strings ]`;

const BLURRY_RULES = `Rules for "blurryTerms" (the words the student must fill in on the blurred notes):
- 12-25 items. Each must appear VERBATIM (same spelling and inflection) inside "notes".
- Choose ONLY terminology, names, dates, numbers, definitions' key words and key concepts that are central to the lesson.
- NEVER choose verbs, adjectives, conjunctions, prepositions or filler words, and never words that can be guessed from grammar alone.
- Mostly 1-3 words; up to 3 items may be a short key phrase (max 8 words) when a whole idea should be recalled.
- Do not pick two items that overlap each other.`;

const LESSON_SPEC = `{
 "title": string,
 "overview": string (3-5 sentences: what this lesson is about),
 "keyPoints": [ strings ] (the 5-10 MOST important things to remember),
 "sections": [ { "heading": string, "content": string } ] (a structured summary of the whole material; content may use "- " bullets and **bold** for key terms),
 "tables": [ { "title": string, "headers": [strings], "rows": [[strings]] } ] (ONLY if the material has comparable data/categories; otherwise []),
 "diagrams": [ { "title": string, "nodes": [ { "id": string, "label": string (max 6 words) } ], "edges": [ { "from": nodeId, "to": nodeId, "label": string (optional, short) } ] } ] (ONLY for processes, cycles, hierarchies or cause-effect chains; max 2, 3-10 nodes each; otherwise []),
 "glossary": [ { "term": string, "definition": string } ] (5-15 terms),
 ${QUESTION_SPEC} (exactly 5 questions to check what the student learned)
}`;

function lessonPrompt({ texts, language, hasImages }) {
  return {
    system: system(language),
    prompt: `Summarise the study material below into an interactive lesson.${hasImages ? ' The attached images are part of the material; read them too.' : ''}
Cover the WHOLE material, put the most important things first, and keep it easy to revise from.

Return JSON of this shape:
${LESSON_SPEC}

STUDY MATERIAL:
${sourceBlock(texts)}`,
  };
}

function testPrompt({ texts, language, hasImages, count = 12 }) {
  return {
    system: system(language),
    prompt: `Create a test pack from the study material below.${hasImages ? ' The attached images are part of the material.' : ''}

Return JSON of this shape:
{
 "title": string,
${TEST_SPEC}
}
- Write ${count} multiple-choice questions with exactly 4 plausible options, one correct, and varied difficulty. Test understanding, not just wording.
- Write 12-20 flashcards.
${BLURRY_RULES}

STUDY MATERIAL:
${sourceBlock(texts)}`,
  };
}

function gradedTestPrompt({ texts, language, count = 12 }) {
  return {
    system: system(language),
    prompt: `The material below is a test the student has ALREADY taken (with their answers and/or marks or corrections from the teacher; images are scans of it).
1. Find every question the student got wrong or left unanswered. If nothing is marked, compare the student's answers with the correct answers.
2. For each mistake, name the rule/concept/principle they broke and explain it simply.
3. Then write NEW similar questions that train exactly those rules.

Return JSON of this shape:
{
 "title": string,
 "mistakes": [ { "question": string, "yourAnswer": string, "correctAnswer": string, "ruleBroken": string, "explanation": string } ],
 "rules": [ { "rule": string, "explanation": string, "tip": string (how to avoid the mistake) } ] (one entry per distinct rule, most important first),
${TEST_SPEC}
}
- Write ${count} new multiple-choice questions (4 options each) of the same kind as the mistakes, focused on the broken rules.
- Flashcards: one per broken rule (front = situation/question, back = the rule applied correctly), plus extra if useful.
- "notes" should be a short rule sheet of the concepts the student needs.
${BLURRY_RULES}
- If the material shows no mistakes at all, return "mistakes": [] and "rules": [] and still write the questions on its topics.

THE STUDENT'S TEST:
${sourceBlock(texts)}`,
  };
}

function revisionPrompt({ texts, language, hasImages, count = 15 }) {
  return {
    system: system(language),
    prompt: `The student is revising several lessons. Merge the material below into ONE revision pack.${hasImages ? ' The attached images are extra revision notes.' : ''}

Return JSON of this shape:
{
 "title": string,
 "overview": string (what the revision covers, 2-4 sentences),
 "keyPoints": [ strings ] (the 8-15 most important things across all lessons),
 "sections": [ { "heading": string, "content": string } ] (one compact section per lesson/topic; "- " bullets and **bold** allowed),
 "glossary": [ { "term": string, "definition": string } ],
${TEST_SPEC}
}
- Write ${count} multiple-choice questions (4 options) spread EVENLY across all lessons, mixing easy and hard.
- Write 15-25 flashcards.
${BLURRY_RULES}

MATERIAL:
${sourceBlock(texts)}`,
  };
}

module.exports = { lessonPrompt, testPrompt, gradedTestPrompt, revisionPrompt, sourceBlock, MAX_SOURCE_CHARS };
