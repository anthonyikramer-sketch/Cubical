/** Shared types for the SheetFill tool. */

export interface PdfLine {
  text: string;
  page: number;
}

/** A detected fillable field in the Excel template. */
export interface XlsxField {
  id: string;            // unique: `${sheetName}!${valueAddr}`
  sheetName: string;
  label: string;         // text of the label cell
  labelAddr: string;     // address of the label cell (e.g. "A3")
  valueAddr: string;     // address where we would write the value (e.g. "B3")
  existingValue: string; // current content of valueAddr, may be ""
}

export type Confidence = 'high' | 'medium' | 'low';

/** One proposed cell fill, with confidence and user-approval state. */
export interface MatchResult {
  field: XlsxField;
  extractedValue: string;
  sourceText: string;    // original PDF line(s) that matched
  sourcePage: number;    // page number in the PDF where the match was found
  confidence: Confidence;
  matchReason: string;
  isConflict: boolean;   // existingValue is non-empty and differs from extractedValue
  // User decisions (mutated in place):
  approved: boolean;     // whether this fill is included in the final export
  keepExisting: boolean; // for conflicts: true = keep existingValue, false = use extractedValue
}
