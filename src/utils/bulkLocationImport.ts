import * as XLSX from 'xlsx/dist/xlsx.mini.min.js';
import type { Point } from 'geojson';

import type { LocationWritePayload } from './locationPersistence';
import { parseGeometry } from './geojson';
import type { LocationSectionWithFields } from '../types/section';
import { redevelopmentStatuses } from '../types/location';

const MAX_IMPORT_ROWS = 400;
const requiredHeaders = ['이름', '주소'] as const;
const reservedHeaders = new Set([
  ...requiredHeaders,
  '링크',
  '발행',
  '진행 단계',
]);
const legacyRedevelopmentStatuses = [
  '추진위승인',
  '조합설립',
  '사업시행인가',
  '관리처분인가',
  '착공',
  '준공',
] as const;

type WorkbookRow = Record<string, unknown>;
type ImportIssueResult = { issue: BulkImportIssue };
type StatusResult = { status: LocationWritePayload['status'] } | ImportIssueResult;
type PublishedResult = { isPublished: boolean } | ImportIssueResult;
type DetailsResult = { details: Record<string, unknown> } | ImportIssueResult;

export interface BulkImportIssue {
  rowNumber: number | null;
  message: string;
}

export interface BulkLocationDraft {
  rowNumber: number;
  address: string;
  payload: Omit<LocationWritePayload, 'geojson'>;
}

export interface BulkImportParseResult {
  rows: BulkLocationDraft[];
  issues: BulkImportIssue[];
}

export function getImportableSections(
  sections: readonly LocationSectionWithFields[],
) {
  return sections.filter(
    (section) => section.isActive && section.geometryKind !== 'area',
  );
}

export function createBulkImportTemplate(section: LocationSectionWithFields) {
  const headers = getTemplateHeaders(section);
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([headers, getTemplateExample(section, headers)]);

  XLSX.utils.book_append_sheet(workbook, worksheet, '위치 등록');
  XLSX.writeFile(workbook, `${section.label}_위치등록양식.xlsx`);
}

export async function parseBulkImportFile(
  file: File,
  section: LocationSectionWithFields,
): Promise<BulkImportParseResult> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheetName = workbook.SheetNames[0];

  if (sheetName === undefined) {
    return { rows: [], issues: [{ rowNumber: null, message: '읽을 수 있는 시트가 없습니다.' }] };
  }

  const worksheet = workbook.Sheets[sheetName];
  if (worksheet === undefined) {
    return { rows: [], issues: [{ rowNumber: null, message: '첫 번째 시트를 읽을 수 없습니다.' }] };
  }

  const rows = XLSX.utils.sheet_to_json<WorkbookRow>(worksheet, {
    defval: '',
    raw: false,
  });

  if (rows.length === 0) {
    return { rows: [], issues: [{ rowNumber: null, message: '헤더 아래에 등록할 행이 없습니다.' }] };
  }

  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      issues: [{ rowNumber: null, message: `한 번에 최대 ${MAX_IMPORT_ROWS}행까지 등록할 수 있습니다.` }],
    };
  }

  const headers = getHeaders(rows);
  const issues = validateHeaders(headers, section);

  if (issues.length > 0) {
    return { rows: [], issues };
  }

  const drafts: BulkLocationDraft[] = [];
  rows.forEach((row, index) => {
    const parsed = parseWorkbookRow(row, index + 2, section);
    if ('issue' in parsed) {
      issues.push(parsed.issue);
      return;
    }

    drafts.push(parsed.draft);
  });

  return { rows: drafts, issues };
}

export function withResolvedGeometry(
  draft: BulkLocationDraft,
  geometry: Point,
): LocationWritePayload {
  return {
    ...draft.payload,
    geojson: parseGeometry(geometry),
  };
}

function getTemplateHeaders(section: LocationSectionWithFields) {
  return [
    '이름',
    '주소',
    '링크',
    '발행',
    ...(section.requiresStatus ? ['진행 단계'] : []),
    ...section.fields.map((field) => field.label),
  ];
}

function getTemplateExample(section: LocationSectionWithFields, headers: readonly string[]) {
  return headers.map((header) => {
    if (header === '이름') return '예시 장소';
    if (header === '주소') return '경기 군포시 산본로 323';
    if (header === '링크') return 'https://example.com';
    if (header === '발행') return '예';
    if (header === '진행 단계') return '추진위승인';
    const field = section.fields.find((candidate) => candidate.label === header);
    if (field?.fieldType === 'number') return '100';
    if (field?.fieldType === 'date') return '2026-01-01';
    if (field?.fieldType === 'url') return 'https://example.com';
    return '예시 입력값';
  });
}

function getHeaders(rows: readonly WorkbookRow[]) {
  const headers = new Set<string>();

  rows.forEach((row) => {
    Object.keys(row).forEach((header) => headers.add(normalizeHeader(header)));
  });

  return headers;
}

function validateHeaders(
  headers: ReadonlySet<string>,
  section: LocationSectionWithFields,
) {
  const issues: BulkImportIssue[] = [];
  requiredHeaders.forEach((header) => {
    if (!headers.has(header)) {
      issues.push({ rowNumber: null, message: `필수 헤더 '${header}'가 없습니다.` });
    }
  });

  if (section.requiresStatus && !headers.has('진행 단계')) {
    issues.push({ rowNumber: null, message: "이 섹션은 '진행 단계' 헤더가 필요합니다." });
  }

  section.fields.filter((field) => field.isRequired).forEach((field) => {
    if (!headers.has(field.label)) {
      issues.push({ rowNumber: null, message: `필수 수집항목 헤더 '${field.label}'가 없습니다.` });
    }
  });

  const conflictingFields = section.fields.filter((field) => reservedHeaders.has(field.label));
  conflictingFields.forEach((field) => {
    issues.push({
      rowNumber: null,
      message: `섹션 수집항목 '${field.label}'은(는) 엑셀 기본 헤더와 이름이 겹칩니다. 섹션 관리에서 이름을 변경하세요.`,
    });
  });

  return issues;
}

function parseWorkbookRow(
  row: WorkbookRow,
  rowNumber: number,
  section: LocationSectionWithFields,
): { draft: BulkLocationDraft } | { issue: BulkImportIssue } {
  const values = createValueMap(row);
  const name = getText(values, '이름');
  const address = getText(values, '주소');

  if (name === null || address === null) {
    return { issue: { rowNumber, message: '이름과 주소는 필수입니다.' } };
  }

  const status = parseStatus(values, section, rowNumber);
  if (hasImportIssue(status)) {
    return status;
  }

  const isPublished = parsePublished(values, rowNumber);
  if (hasImportIssue(isPublished)) {
    return isPublished;
  }

  const detailsResult = parseSectionDetails(values, section, address, rowNumber);
  if (hasImportIssue(detailsResult)) {
    return detailsResult;
  }

  const sourceUrl = getText(values, '링크');
  if (sourceUrl !== null && !/^https?:\/\/\S+$/i.test(sourceUrl)) {
    return { issue: { rowNumber, message: '링크는 HTTP 또는 HTTPS URL이어야 합니다.' } };
  }

  return {
    draft: {
      rowNumber,
      address,
      payload: {
        name,
        category: section.key,
        section_id: section.id,
        status: status.status,
        is_published: isPublished.isPublished,
        source_name: null,
        source_url: sourceUrl,
        source_date: null,
        details: detailsResult.details,
      },
    },
  };
}

function createValueMap(row: WorkbookRow) {
  const values = new Map<string, unknown>();

  Object.entries(row).forEach(([key, value]) => {
    values.set(normalizeHeader(key), value);
  });

  return values;
}

function getText(values: ReadonlyMap<string, unknown>, header: string) {
  const value = values.get(header);
  if (typeof value !== 'string') {
    return value === undefined || value === null ? null : String(value).trim() || null;
  }

  return value.trim() || null;
}

function parseStatus(
  values: ReadonlyMap<string, unknown>,
  section: LocationSectionWithFields,
  rowNumber: number,
): StatusResult {
  if (!section.requiresStatus) {
    return { status: null };
  }

  const status = getText(values, '진행 단계');
  if (status === null || !isRedevelopmentStatus(status)) {
    return { issue: { rowNumber, message: '진행 단계를 올바르게 입력하세요.' } };
  }

  return { status };
}

function parsePublished(
  values: ReadonlyMap<string, unknown>,
  rowNumber: number,
): PublishedResult {
  const value = getText(values, '발행');
  if (value === null || value === '0' || /^(false|아니오|n|no|초안)$/i.test(value)) {
    return { isPublished: false };
  }

  if (value === '1' || /^(true|예|y|yes|공개|발행)$/i.test(value)) {
    return { isPublished: true };
  }

  return { issue: { rowNumber, message: "발행은 '예' 또는 '아니오'로 입력하세요." } };
}

function parseSectionDetails(
  values: ReadonlyMap<string, unknown>,
  section: LocationSectionWithFields,
  address: string,
  rowNumber: number,
): DetailsResult {
  const details: Record<string, unknown> = { 주소: address };

  for (const field of section.fields) {
    const value = getText(values, field.label);
    if (value === null) {
      if (field.isRequired) {
        return { issue: { rowNumber, message: `'${field.label}'은(는) 필수입니다.` } };
      }
      continue;
    }

    if (field.fieldType === 'number') {
      const numberValue = Number(value);
      if (!Number.isFinite(numberValue)) {
        return { issue: { rowNumber, message: `'${field.label}'은(는) 숫자여야 합니다.` } };
      }
      details[field.fieldKey] = numberValue;
      continue;
    }

    if (field.fieldType === 'url' && !/^https?:\/\/\S+$/i.test(value)) {
      return { issue: { rowNumber, message: `'${field.label}'은(는) HTTP 또는 HTTPS URL이어야 합니다.` } };
    }

    details[field.fieldKey] = value;
  }

  return { details };
}

function isRedevelopmentStatus(value: string): value is (typeof redevelopmentStatuses)[number] {
  return redevelopmentStatuses.some((status) => status === value);
}

function hasImportIssue(
  result: StatusResult | PublishedResult | DetailsResult,
): result is ImportIssueResult {
  return 'issue' in result;
}

function normalizeHeader(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}
