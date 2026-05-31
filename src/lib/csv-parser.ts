import { RegularItem } from "./types";

export interface CsvParseResult {
  items: RegularItem[];
  errors: string[];
}

export function parseCsv(content: string): CsvParseResult {
  const items: RegularItem[] = [];
  const errors: string[] = [];

  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    errors.push("CSV file is empty");
    return { items, errors };
  }

  const firstLine = lines[0].toLowerCase();
  const startIndex =
    firstLine.includes("category") || firstLine.includes("item") ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const columns = parseCsvLine(line);

    if (columns.length < 2) {
      errors.push(`Line ${i + 1}: Expected at least 2 columns (category, item), got ${columns.length}`);
      continue;
    }

    const category = columns[0].trim();
    const name = columns[1].trim();

    if (!category || !name) {
      errors.push(`Line ${i + 1}: Category and item name cannot be empty`);
      continue;
    }

    items.push({
      id: `regular-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      category,
      name,
      selected: false,
    });
  }

  return { items, errors };
}

function parseCsvLine(line: string): string[] {
  const columns: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      columns.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  columns.push(current);
  return columns;
}
