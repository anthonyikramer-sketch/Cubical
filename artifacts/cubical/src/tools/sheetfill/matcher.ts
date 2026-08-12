import type { PdfLine, XlsxField, MatchResult, Confidence } from './types';

// ── Synonym dictionary ────────────────────────────────────────────────────────
// Each group: any word in the group matches any other word in the group.

const SYNONYM_GROUPS: readonly string[][] = [
  // Time / schedule
  ['date', 'day', 'when', 'scheduled', 'occur', 'occurrence'],
  ['time', 'hour', 'start', 'begin', 'commence', 'event', 'kick'],
  ['checkin', 'check-in', 'check_in', 'arrival', 'signin', 'sign-in', 'registration', 'doors'],
  ['end', 'close', 'finish', 'conclude', 'wrap'],

  // Attendance / people count
  ['attendance', 'attendee', 'attendees', 'participant', 'participants', 'guest', 'guests',
   'audience', 'headcount', 'people', 'person', 'persons', 'expected', 'estimated', 'count',
   'number', 'capacity', 'seats'],
  ['estimated', 'expected', 'projected', 'anticipated', 'approximate', 'planned', 'proposed'],

  // Leadership / team
  ['lead', 'leader', 'director', 'manager', 'coordinator', 'head', 'supervisor', 'organizer',
   'contact', 'person', 'point', 'poc'],
  ['team', 'staff', 'crew', 'group', 'committee'],
  ['volunteer', 'helper', 'helper', 'worker', 'support', 'personnel'],

  // Money / budget
  ['budget', 'cost', 'expense', 'expenses', 'price', 'fee', 'fees', 'amount', 'total',
   'funding', 'financial', 'finance', 'fund', 'allocated', 'allocation'],

  // Marketing / promotion
  ['marketing', 'promotion', 'promotional', 'advertising', 'advertisement', 'outreach',
   'publicity', 'printing', 'print', 'media', 'social', 'communication', 'branding',
   'flyer', 'flyers', 'banner', 'banners', 'signage', 'graphic', 'graphics', 'design'],

  // Food / hospitality
  ['food', 'meal', 'meals', 'refreshment', 'refreshments', 'catering', 'hospitality',
   'beverage', 'beverages', 'drink', 'drinks', 'snack', 'snacks', 'lunch', 'dinner',
   'breakfast', 'reception', 'appetizer', 'appetizers'],

  // Decor / ambience
  ['decor', 'decoration', 'decorations', 'ambience', 'ambiance', 'aesthetic', 'setup',
   'display', 'supplies', 'supply', 'table', 'tablecloth', 'centerpiece', 'balloon',
   'balloons', 'props', 'prop'],

  // Venue / location
  ['venue', 'location', 'site', 'place', 'facility', 'hall', 'room', 'rooms', 'center',
   'centre', 'space', 'area', 'building', 'floor', 'address'],

  // Professional services
  ['professional', 'professionals', 'service', 'services', 'consultant', 'consultants',
   'clinician', 'clinicians', 'therapist', 'therapists', 'expert', 'experts', 'specialist',
   'specialists', 'licensed', 'facilitator', 'facilitators', 'instructor', 'instructors',
   'photographer', 'photography', 'host', 'mc', 'emcee', 'dj', 'speaker', 'speakers'],

  // Program / activities
  ['program', 'programs', 'schedule', 'agenda', 'itinerary', 'element', 'elements',
   'activity', 'activities', 'session', 'sessions', 'workshop', 'workshops'],

  // Sponsor / sponsor
  ['sponsor', 'sponsors', 'sponsorship', 'funder', 'funders', 'partner', 'partners',
   'donor', 'donors', 'supporter', 'supporters', 'backer', 'backers'],

  // Items / details
  ['item', 'items', 'detail', 'details', 'description', 'descriptions', 'note', 'notes',
   'entry', 'entries', 'line', 'lines'],

  // Thank you / follow-up
  ['thank', 'thanks', 'thankyou', 'thank-you', 'followup', 'follow-up', 'acknowledgment',
   'sent', 'send'],
];

// Build fast lookup: word → index of its synonym group
const WORD_TO_GROUP = new Map<string, number>();
for (let g = 0; g < SYNONYM_GROUPS.length; g++) {
  for (const word of SYNONYM_GROUPS[g]) {
    WORD_TO_GROUP.set(word, g);
  }
}

function synonymGroupIndex(word: string): number {
  return WORD_TO_GROUP.get(word) ?? -1;
}

/** Tokenize a string into lowercase, alpha-only tokens of length ≥ 2. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/**
 * Score how well a PDF line matches a field label.
 * Returns 0–1 where 1 = every field token matched exactly or via synonym.
 */
function scoreLineAgainstField(fieldLabel: string, lineText: string): number {
  const fieldTokens = tokenize(fieldLabel);
  if (fieldTokens.length === 0) return 0;

  const lineTokens = tokenize(lineText);
  const lineSet = new Set(lineTokens);
  const lineGroups = new Set(lineTokens.map(synonymGroupIndex).filter((g) => g >= 0));

  let matched = 0;
  for (const ft of fieldTokens) {
    // Exact match
    if (lineSet.has(ft)) { matched++; continue; }
    // Synonym group match
    const g = synonymGroupIndex(ft);
    if (g >= 0 && lineGroups.has(g)) { matched++; continue; }
  }

  return matched / fieldTokens.length;
}

/** Extract the "value" portion of a PDF line (after colon, dash, etc.). */
function extractValue(line: string): string {
  // "Label: Value"
  const colonIdx = line.indexOf(':');
  if (colonIdx > 0 && colonIdx < line.length - 1) {
    return line.slice(colonIdx + 1).trim();
  }
  // "Label — Value" or "Label – Value" or "Label - Value"
  const dashMatch = line.match(/[—–]\s*(.+)$/) || line.match(/\s-\s(.+)$/);
  if (dashMatch) return dashMatch[1].trim();
  // Fallback: return whole line
  return line.trim();
}

/**
 * HIGH-CONFIDENCE threshold:
 *   score ≥ 0.70 AND extracted value is non-trivial (not just the label itself).
 *
 * MEDIUM-CONFIDENCE:
 *   score ≥ 0.38
 *
 * LOW / NO MATCH:
 *   score < 0.38 → omit or mark as not found.
 *
 * Per the critical safety rule the caller also checks:
 *   - Medium matches are never auto-filled (approved = false by default).
 *   - Conflicts are always shown for user resolution.
 */
const HIGH_THRESHOLD   = 0.70;
const MEDIUM_THRESHOLD = 0.38;

/** Match a list of XLSX fields against a list of PDF lines. */
export function matchFields(fields: XlsxField[], lines: PdfLine[]): MatchResult[] {
  const results: MatchResult[] = [];

  for (const field of fields) {
    let bestScore  = 0;
    let bestLine: PdfLine | null = null;

    for (const line of lines) {
      // Only score lines that have at least a bit of overlap
      const score = scoreLineAgainstField(field.label, line.text);
      if (score > bestScore) {
        bestScore = score;
        bestLine  = line;
      }
    }

    if (!bestLine || bestScore < MEDIUM_THRESHOLD) {
      // No meaningful match — still include as "not found" for the review screen
      results.push({
        field,
        extractedValue:  '',
        sourceText:      '',
        confidence:      'low',
        matchReason:     'No matching content found in source document.',
        isConflict:      false,
        approved:        false,
        keepExisting:    true,
      });
      continue;
    }

    const rawValue    = extractValue(bestLine.text);
    const isTrivial   = tokenize(rawValue).every((t) => tokenize(field.label).includes(t));
    // A value that is nothing but the label words is useless
    const valueOk     = rawValue.length > 0 && !isTrivial && rawValue !== field.label;

    const confidence: Confidence =
      bestScore >= HIGH_THRESHOLD && valueOk ? 'high'   :
      bestScore >= MEDIUM_THRESHOLD           ? 'medium' : 'low';

    const isConflict =
      field.existingValue !== '' &&
      field.existingValue.trim().toLowerCase() !== rawValue.trim().toLowerCase();

    // Per safety rule: high → auto-approve; medium → require user action
    const approved = confidence === 'high' && valueOk && !isConflict;

    results.push({
      field,
      extractedValue:  valueOk ? rawValue : '',
      sourceText:      bestLine.text,
      confidence,
      matchReason: bestScore >= HIGH_THRESHOLD
        ? `Strong match (score ${(bestScore * 100).toFixed(0)}%)`
        : `Partial match (score ${(bestScore * 100).toFixed(0)}%) — please review`,
      isConflict,
      approved,
      keepExisting: isConflict, // default: keep the existing value until user decides
    });
  }

  return results;
}
