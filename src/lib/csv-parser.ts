import { RegularItem } from "./types.js";

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
    firstLine.includes("category") || firstLine.includes("item") || firstLine.includes("name") ? 1 : 0;

  let catIdx = -1;
  let nameIdx = -1;
  let idIdx = -1;
  let selectedIdx = -1;
  let unitIdx = -1;

  if (startIndex === 1) {
    const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    catIdx = headers.indexOf("category");
    nameIdx = headers.indexOf("name");
    if (nameIdx === -1) {
      nameIdx = headers.indexOf("item");
    }
    idIdx = headers.indexOf("id");
    selectedIdx = headers.indexOf("selected");
    unitIdx = headers.indexOf("unit");
  }

  const hasMappedHeaders = catIdx !== -1 && nameIdx !== -1;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const columns = parseCsvLine(line);

    let category = "";
    let name = "";
    let id = "";
    let selected = false;
    let unit = "unit";

    if (hasMappedHeaders) {
      category = columns[catIdx]?.trim() || "";
      name = columns[nameIdx]?.trim() || "";
      id = idIdx !== -1 && columns[idIdx]?.trim() ? columns[idIdx].trim() : "";
      selected = selectedIdx !== -1 && columns[selectedIdx]?.trim().toLowerCase() === "true";
      unit = unitIdx !== -1 && columns[unitIdx]?.trim() ? columns[unitIdx].trim() : "unit";
    } else {
      if (columns.length < 2) {
        errors.push(`Line ${i + 1}: Expected at least 2 columns (category, item), got ${columns.length}`);
        continue;
      }
      category = columns[0].trim();
      name = columns[1].trim();
    }

    if (!category || !name) {
      errors.push(`Line ${i + 1}: Category and item name cannot be empty`);
      continue;
    }

    if (!id) {
      id = `regular-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`;
    }

    items.push({
      id,
      category,
      name,
      selected,
      unit,
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
