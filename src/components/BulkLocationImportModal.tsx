import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Download, FileSpreadsheet, RotateCcw, Upload, X } from 'lucide-react';

import { supabase, vworldApiKey } from '../lib/supabase';
import type { LocationWritePayload } from '../utils/locationPersistence';
import {
  BulkImportIssue,
  BulkLocationDraft,
  createBulkImportTemplate,
  getImportableSections,
  parseBulkImportFile,
  withResolvedGeometry,
} from '../utils/bulkLocationImport';
import { geocodeVworldAddress } from '../utils/vworld';
import type { LocationSectionWithFields } from '../types/section';

interface BulkLocationImportModalProps {
  isOpen: boolean;
  sections: readonly LocationSectionWithFields[];
  onClose: () => void;
  onImported: () => void;
}

type ImportMode = 'append' | 'replace';

interface ImportSummary {
  inserted: number;
  updated: number;
  skipped: number;
  deleted: number;
}

interface ImportBatch {
  id: string;
  sourceFileName: string;
  mode: ImportMode;
  summary: ImportSummary;
  createdAt: string;
}

export function BulkLocationImportModal({
  isOpen,
  sections,
  onClose,
  onImported,
}: BulkLocationImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importableSections = useMemo(() => getImportableSections(sections), [sections]);
  const [sectionId, setSectionId] = useState('');
  const [mode, setMode] = useState<ImportMode>('append');
  const [replaceAcknowledged, setReplaceAcknowledged] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<readonly BulkLocationDraft[]>([]);
  const [issues, setIssues] = useState<readonly BulkImportIssue[]>([]);
  const [batches, setBatches] = useState<readonly ImportBatch[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [undoingBatchId, setUndoingBatchId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const section = importableSections.find((candidate) => candidate.id === sectionId) ?? null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSectionId((current) =>
      importableSections.some((candidate) => candidate.id === current)
        ? current
        : importableSections[0]?.id ?? '',
    );
    setMode('append');
    setReplaceAcknowledged(false);
    setFileName(null);
    setDrafts([]);
    setIssues([]);
    setMessage(null);
  }, [importableSections, isOpen]);

  useEffect(() => {
    if (!isOpen || sectionId.length === 0 || supabase === null) {
      return;
    }

    let isCurrent = true;
    void loadRecentBatches(sectionId).then((result) => {
      if (isCurrent) {
        setBatches(result);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [isOpen, sectionId]);

  if (!isOpen) {
    return null;
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file === undefined || section === null || isParsing || isImporting) {
      return;
    }

    setIsParsing(true);
    setFileName(file.name);
    setDrafts([]);
    setIssues([]);
    setMessage(null);

    try {
      const result = await parseBulkImportFile(file, section);
      setDrafts(result.rows);
      setIssues(result.issues);
      if (result.rows.length > 0 && result.issues.length === 0) {
        setMessage(`${result.rows.length}개 행을 등록할 준비가 되었습니다.`);
      }
    } catch {
      setIssues([{ rowNumber: null, message: '엑셀 파일을 읽지 못했습니다.' }]);
    } finally {
      setIsParsing(false);
      event.target.value = '';
    }
  };

  const handleImport = async () => {
    if (
      section === null ||
      drafts.length === 0 ||
      issues.length > 0 ||
      isImporting ||
      (mode === 'replace' && !replaceAcknowledged)
    ) {
      return;
    }

    if (supabase === null) {
      setMessage('Supabase 환경변수 설정을 확인하세요.');
      return;
    }

    setIsImporting(true);
    setMessage(null);

    try {
      const resolved = await resolveImportRows(drafts);
      if (resolved.issues.length > 0) {
        setIssues(resolved.issues);
        setMessage('주소 좌표 변환에 실패한 행이 있습니다. 오류를 수정한 뒤 다시 업로드하세요.');
        return;
      }

      const { data, error } = await supabase.rpc('apply_location_import', {
        p_section_id: section.id,
        p_mode: mode,
        p_file_name: fileName ?? '엑셀 대량 등록',
        p_rows: resolved.payloads,
      });

      if (error !== null) {
        setMessage(`대량 등록에 실패했습니다: ${error.message}`);
        return;
      }

      const summary = parseImportSummary(data);
      if (summary === null) {
        setMessage('대량 등록 결과를 확인하지 못했습니다. 목록을 새로고침해 상태를 확인하세요.');
        onImported();
        return;
      }

      setMessage(formatImportSummary(summary));
      setDrafts([]);
      setFileName(null);
      setReplaceAcknowledged(false);
      onImported();
      setBatches(await loadRecentBatches(section.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '대량 등록 중 알 수 없는 오류가 발생했습니다.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleUndo = async (batch: ImportBatch) => {
    if (supabase === null || undoingBatchId !== null || isImporting) {
      return;
    }

    setUndoingBatchId(batch.id);
    setMessage(null);
    try {
      const { error } = await supabase.rpc('undo_location_import', { p_batch_id: batch.id });
      if (error !== null) {
        setMessage(`등록 취소에 실패했습니다: ${error.message}`);
        return;
      }

      setMessage(`${batch.sourceFileName} 등록을 되돌렸습니다.`);
      onImported();
      setBatches(await loadRecentBatches(sectionId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '등록 취소 중 알 수 없는 오류가 발생했습니다.');
    } finally {
      setUndoingBatchId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-import-title"
    >
      <article className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-md bg-white shadow-xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">관리자</p>
            <h2 id="bulk-import-title" className="mt-1 text-lg font-semibold text-slate-950">
              엑셀 대량 등록
            </h2>
          </div>
          <button
            type="button"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            aria-label="엑셀 대량 등록 닫기"
            disabled={isImporting || undoingBatchId !== null}
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="space-y-5 p-5">
          <label className="block text-sm font-medium text-slate-800">
            대상 섹션
            <select
              className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              value={sectionId}
              onChange={(event) => {
                setSectionId(event.target.value);
                setDrafts([]);
                setFileName(null);
                setIssues([]);
                setReplaceAcknowledged(false);
              }}
              disabled={isParsing || isImporting || importableSections.length === 0}
            >
              {importableSections.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </label>

          {section === null ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              엑셀로 등록 가능한 Point 또는 혼합 섹션이 없습니다. Polygon 또는 MultiPolygon 영역은 엑셀로 등록할 수 없으며 지도에서 직접 그려 등록합니다.
            </p>
          ) : (
            <>
              <fieldset>
                <legend className="text-sm font-medium text-slate-800">등록 방식</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className={`cursor-pointer rounded-md border p-3 text-sm ${mode === 'append' ? 'border-blue-600 bg-blue-50 text-blue-950' : 'border-slate-300 text-slate-700'}`}>
                    <input
                      className="sr-only"
                      type="radio"
                      name="bulk-import-mode"
                      checked={mode === 'append'}
                      onChange={() => {
                        setMode('append');
                        setReplaceAcknowledged(false);
                      }}
                      disabled={isParsing || isImporting}
                    />
                    <span className="block font-semibold">기존 목록에 추가</span>
                    <span className="mt-1 block text-xs leading-5">같은 이름과 전체 주소는 비교해 새로 등록하거나, 변경 내용을 업데이트합니다.</span>
                  </label>
                  <label className={`cursor-pointer rounded-md border p-3 text-sm ${mode === 'replace' ? 'border-red-500 bg-red-50 text-red-950' : 'border-slate-300 text-slate-700'}`}>
                    <input
                      className="sr-only"
                      type="radio"
                      name="bulk-import-mode"
                      checked={mode === 'replace'}
                      onChange={() => setMode('replace')}
                      disabled={isParsing || isImporting}
                    />
                    <span className="block font-semibold">선택 섹션 전체 교체</span>
                    <span className="mt-1 block text-xs leading-5">엑셀에 없는 기존 항목도 삭제합니다. 배치 취소로 되돌릴 수 있습니다.</span>
                  </label>
                </div>
              </fieldset>

              {mode === 'replace' ? (
                <label className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                  <input
                    className="mt-1 size-4 accent-red-600"
                    type="checkbox"
                    checked={replaceAcknowledged}
                    onChange={(event) => setReplaceAcknowledged(event.target.checked)}
                    disabled={isParsing || isImporting}
                  />
                  <span>선택한 섹션에서 엑셀에 없는 기존 위치가 삭제된다는 점을 확인했습니다.</span>
                </label>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => createBulkImportTemplate(section)}
                  disabled={isParsing || isImporting}
                >
                  <Download className="size-4" />
                  양식 내려받기
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isParsing || isImporting}
                >
                  <Upload className="size-4" />
                  엑셀 파일 선택
                </button>
                <input
                  ref={fileInputRef}
                  className="sr-only"
                  type="file"
                  accept=".xlsx"
                  onChange={(event) => void handleFileChange(event)}
                />
              </div>
              <p className="text-xs leading-5 text-slate-500">
                {section.label} 섹션의 필수 수집 항목과 주소를 검증합니다. 위치는 주소 검색으로 찾으며, 발행은 `예` 또는 `아니오`로 입력합니다. 이름과 주소 전체가 같고 다른 값까지 같으면 중복으로 제외하며, 하나라도 다르면 기존 항목을 업데이트합니다. Polygon 또는 MultiPolygon 영역은 엑셀 등록 대상이 아니며 지도에서 직접 그려 등록합니다.
              </p>
            </>
          )}

          {fileName !== null ? (
            <div className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <FileSpreadsheet className="size-4 shrink-0 text-emerald-700" />
              <span className="truncate">{fileName}</span>
            </div>
          ) : null}

          {issues.length > 0 ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="size-4" />
                검증 오류 {issues.length}개
              </div>
              <ul className="mt-2 space-y-1">
                {issues.slice(0, 8).map((issue, index) => (
                  <li key={`${issue.rowNumber ?? 'header'}-${index}`}>
                    {issue.rowNumber === null ? '' : `${issue.rowNumber}행: `}
                    {issue.message}
                  </li>
                ))}
              </ul>
              {issues.length > 8 ? <p className="mt-2">그 외 {issues.length - 8}개 오류가 있습니다.</p> : null}
            </div>
          ) : null}

          {message !== null ? (
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p>
          ) : null}

          {batches.length > 0 ? (
            <section className="border-t border-slate-200 pt-4" aria-labelledby="recent-imports-title">
              <h3 id="recent-imports-title" className="text-sm font-semibold text-slate-900">최근 대량 등록</h3>
              <ul className="mt-2 space-y-2">
                {batches.map((batch) => (
                  <li key={batch.id} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800">{batch.sourceFileName}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {batch.mode === 'replace' ? '전체 교체' : '추가'} · 신규 {batch.summary.inserted} · 수정 {batch.summary.updated} · 중복 제외 {batch.summary.skipped} · 삭제 {batch.summary.deleted}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:text-slate-400"
                      onClick={() => void handleUndo(batch)}
                      disabled={isImporting || undoingBatchId !== null}
                    >
                      <RotateCcw className="size-3.5" />
                      {undoingBatchId === batch.id ? '취소 중' : '등록 취소'}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={onClose}
            disabled={isImporting || undoingBatchId !== null}
          >
            닫기
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
            onClick={() => void handleImport()}
            disabled={drafts.length === 0 || issues.length > 0 || isParsing || isImporting || (mode === 'replace' && !replaceAcknowledged)}
          >
            <Upload className="size-4" />
            {isImporting ? '등록 중' : `${drafts.length}개 등록`}
          </button>
        </footer>
      </article>
    </div>
  );
}

async function resolveImportRows(drafts: readonly BulkLocationDraft[]) {
  const payloads: LocationWritePayload[] = [];
  const issues: BulkImportIssue[] = [];

  for (const draft of drafts) {
    if (vworldApiKey === null) {
      issues.push({ rowNumber: draft.rowNumber, message: '주소 좌표 변환에는 VWorld API 키가 필요합니다.' });
      continue;
    }

    try {
      const result = await geocodeVworldAddress(draft.address, vworldApiKey);
      if (result === null) {
        issues.push({ rowNumber: draft.rowNumber, message: '주소 검색 결과가 없습니다.' });
        continue;
      }
      payloads.push(withResolvedGeometry(draft, result.geometry));
    } catch {
      issues.push({ rowNumber: draft.rowNumber, message: '주소 좌표 변환에 실패했습니다.' });
    }
  }

  return { payloads, issues };
}

async function loadRecentBatches(sectionId: string): Promise<readonly ImportBatch[]> {
  if (supabase === null) {
    return [];
  }

  const { data, error } = await supabase
    .from('location_import_batches')
    .select('id, source_file_name, mode, summary, created_at')
    .eq('section_id', sectionId)
    .is('reverted_at', null)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error !== null || !Array.isArray(data)) {
    return [];
  }

  return data.flatMap((row) => {
    const batch = parseImportBatch(row);
    return batch === null ? [] : [batch];
  });
}

function parseImportBatch(value: unknown): ImportBatch | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.source_file_name !== 'string' || typeof value.created_at !== 'string') {
    return null;
  }

  if (value.mode !== 'append' && value.mode !== 'replace') {
    return null;
  }

  const summary = parseImportSummary(value.summary);
  if (summary === null) {
    return null;
  }

  return {
    id: value.id,
    sourceFileName: value.source_file_name,
    mode: value.mode,
    summary,
    createdAt: value.created_at,
  };
}

function parseImportSummary(value: unknown): ImportSummary | null {
  if (!isRecord(value) || !isNonNegativeInteger(value.inserted) || !isNonNegativeInteger(value.updated) || !isNonNegativeInteger(value.skipped) || !isNonNegativeInteger(value.deleted)) {
    return null;
  }

  return {
    inserted: value.inserted,
    updated: value.updated,
    skipped: value.skipped,
    deleted: value.deleted,
  };
}

function formatImportSummary(summary: ImportSummary) {
  return `대량 등록이 완료되었습니다. 신규 ${summary.inserted}개, 수정 ${summary.updated}개, 중복 제외 ${summary.skipped}개, 삭제 ${summary.deleted}개`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
