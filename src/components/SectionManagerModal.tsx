import { DragEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  ListTree,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { z } from 'zod';

import { supabase } from '../lib/supabase';
import type {
  LocationFieldType,
  LocationSectionField,
  LocationSectionWithFields,
  SectionGeometryKind,
} from '../types/section';
import type { LocationGroup } from '../types/group';
import { normalizeOptionalText } from '../utils/geojson';

interface SectionManagerModalProps {
  isOpen: boolean;
  sections: readonly LocationSectionWithFields[];
  groups: readonly LocationGroup[];
  isLoading: boolean;
  errorMessage: string | null;
  onChanged: () => void;
  onClose: () => void;
}

type PendingAction = string | null;
type FieldInput = z.infer<typeof fieldSchema>;
type SectionInput = z.infer<typeof sectionSchema>;

const fieldTypes = ['text', 'textarea', 'number', 'date', 'url'] as const;

const sectionSchema = z.object({
  groupId: z.string().uuid('소속 분야를 선택하세요.'),
  label: z.string().trim().min(1, '섹션명을 입력하세요.').max(80),
  geometryKind: z.enum(['point', 'area', 'mixed']),
  requiresStatus: z.boolean(),
  description: z.string().max(500),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '#RRGGBB 형식이어야 합니다.'),
  isActive: z.boolean(),
});

const fieldSchema = z.object({
  label: z.string().trim().min(1, '항목명을 입력하세요.').max(80),
  fieldType: z.enum(fieldTypes),
  isRequired: z.boolean(),
  helpText: z.string().max(300),
});

export function SectionManagerModal({
  isOpen,
  sections,
  groups,
  isLoading,
  errorMessage,
  onChanged,
  onClose,
}: SectionManagerModalProps) {
  const [newSection, setNewSection] = useState<SectionInput>(newSectionInput);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [formErrorMessage, setFormErrorMessage] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [fieldsSectionId, setFieldsSectionId] = useState<string | null>(null);
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const showLegacySectionList = draggedSectionId === '__legacy_section_list__';

  const selectedSection = useMemo(
    () => getSelectedSection(sections, selectedSectionId),
    [sections, selectedSectionId],
  );
  const fieldsSection = useMemo(
    () => sections.find((section) => section.id === fieldsSectionId) ?? null,
    [fieldsSectionId, sections],
  );
  const sectionGroups = useMemo(() => {
    const knownGroupIds = new Set(groups.map((group) => group.id));
    const grouped = groups.map((group) => ({
      id: group.id,
      label: group.label,
      color: group.color,
      sections: sections.filter((section) => section.groupId === group.id),
    }));
    const unassignedSections = sections.filter(
      (section) => section.groupId === null || !knownGroupIds.has(section.groupId),
    );

    return unassignedSections.length > 0
      ? [...grouped, { id: 'unassigned', label: 'Unassigned', color: '#94a3b8', sections: unassignedSections }]
      : grouped;
  }, [groups, sections]);

  useEffect(() => {
    if (selectedSectionId !== null && selectedSection === null) {
      setSelectedSectionId(null);
    }
  }, [selectedSection, selectedSectionId]);

  if (!isOpen) {
    return null;
  }
  const mode = isCreateFormOpen ? 'create' : 'manage';

  const setRequestError = (action: string, message: string) => {
    setFormErrorMessage(`${action}에 실패했습니다: ${message}`);
  };

  const saveSection = async (section: LocationSectionWithFields, input: SectionInput) => {
    setPendingAction(`section:${section.id}`);
    setFormErrorMessage(null);

    try {
      if (supabase === null) {
        setFormErrorMessage('Supabase 환경변수 설정을 확인하세요.');
        return;
      }

      const { error } = await supabase
        .from('location_sections')
        .update({
          label: input.label,
          group_id: input.groupId,
          geometry_kind: input.geometryKind,
          requires_status: input.requiresStatus,
          description: normalizeOptionalText(input.description),
          color: input.color,
          is_active: input.isActive,
        })
        .eq('id', section.id);

      if (error !== null) {
        setRequestError('섹션 저장', error.message);
        return;
      }

      onChanged();
    } finally {
      setPendingAction(null);
    }
  };

  const createSection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = sectionSchema.safeParse(newSection);

    if (!parsed.success) {
      setFormErrorMessage(parsed.error.issues[0]?.message ?? '입력값을 확인하세요.');
      return;
    }

    setPendingAction('create-section');
    setFormErrorMessage(null);

    try {
      if (supabase === null) {
        setFormErrorMessage('Supabase 환경변수 설정을 확인하세요.');
        return;
      }

      const { error } = await supabase.from('location_sections').insert({
        key: createSectionKey(parsed.data.label, sections),
        group_id: parsed.data.groupId,
        label: parsed.data.label,
        geometry_kind: parsed.data.geometryKind,
        requires_status: parsed.data.requiresStatus,
        description: normalizeOptionalText(parsed.data.description),
        color: parsed.data.color,
        is_active: parsed.data.isActive,
        sort_order: getNextSortOrder(sections),
      });

      if (error !== null) {
        setRequestError('섹션 추가', error.message);
        return;
      }

      setNewSection(newSectionInput());
      setIsCreateFormOpen(false);
      onChanged();
    } finally {
      setPendingAction(null);
    }
  };

  const deleteSection = async (section: LocationSectionWithFields) => {
    setPendingAction(`delete-section:${section.id}`);
    setFormErrorMessage(null);

    try {
      if (supabase === null) {
        setFormErrorMessage('Supabase 환경변수 설정을 확인하세요.');
        return;
      }

      const { count, error: countError } = await supabase
        .from('locations')
        .select('id', { count: 'exact', head: true })
        .eq('section_id', section.id);

      if (countError !== null) {
        setRequestError('연결 위치 확인', countError.message);
        return;
      }

      const result = count !== null && count > 0
        ? await supabase.from('location_sections').update({ is_active: false }).eq('id', section.id)
        : await supabase.from('location_sections').delete().eq('id', section.id);

      if (result.error !== null) {
        setRequestError('섹션 삭제', result.error.message);
        return;
      }

      if (count !== null && count > 0) {
        setFormErrorMessage('연결된 위치가 있어 섹션을 삭제하지 않고 비활성화했습니다.');
      }
      onChanged();
    } finally {
      setPendingAction(null);
    }
  };

  const createField = async (section: LocationSectionWithFields, input: FieldInput) => {
    setPendingAction(`create-field:${section.id}`);
    setFormErrorMessage(null);

    try {
      if (supabase === null) {
        setFormErrorMessage('Supabase 환경변수 설정을 확인하세요.');
        return false;
      }

      const { error } = await supabase.from('location_section_fields').insert({
        section_id: section.id,
        field_key: createFieldKey(input.label, section.fields),
        label: input.label,
        field_type: input.fieldType,
        is_required: input.isRequired,
        help_text: normalizeOptionalText(input.helpText),
        sort_order: getNextSortOrder(section.fields),
      });

      if (error !== null) {
        setRequestError('수집항목 추가', error.message);
        return false;
      }

      onChanged();
      return true;
    } finally {
      setPendingAction(null);
    }
  };

  const saveField = async (field: LocationSectionField, input: FieldInput) => {
    setPendingAction(`field:${field.id}`);
    setFormErrorMessage(null);

    try {
      if (supabase === null) {
        setFormErrorMessage('Supabase 환경변수 설정을 확인하세요.');
        return;
      }

      const { error } = await supabase
        .from('location_section_fields')
        .update({
          label: input.label,
          field_type: input.fieldType,
          is_required: input.isRequired,
          help_text: normalizeOptionalText(input.helpText),
        })
        .eq('id', field.id);

      if (error !== null) {
        setRequestError('수집항목 저장', error.message);
        return;
      }

      onChanged();
    } finally {
      setPendingAction(null);
    }
  };

  const deleteField = async (field: LocationSectionField) => {
    setPendingAction(`delete-field:${field.id}`);
    setFormErrorMessage(null);

    try {
      if (supabase === null) {
        setFormErrorMessage('Supabase 환경변수 설정을 확인하세요.');
        return;
      }

      const { error } = await supabase
        .from('location_section_fields')
        .delete()
        .eq('id', field.id);

      if (error !== null) {
        setRequestError('수집항목 삭제', error.message);
        return;
      }

      onChanged();
    } finally {
      setPendingAction(null);
    }
  };

  const saveSectionOrder = async (nextSections: readonly LocationSectionWithFields[]) => {
    setPendingAction('reorder-sections');
    setFormErrorMessage(null);

    try {
      if (supabase === null) {
        setFormErrorMessage('Supabase 환경변수 설정을 확인하세요.');
        return;
      }
      const client = supabase;

      const responses = await Promise.all(
        nextSections.map((section, index) =>
          client
            .from('location_sections')
            .update({ sort_order: (index + 1) * 10 })
            .eq('id', section.id),
        ),
      );
      const failed = responses.find((response) => response.error !== null);

      if (failed?.error !== null && failed?.error !== undefined) {
        setRequestError('섹션 순서 저장', failed.error.message);
        return;
      }

      onChanged();
    } finally {
      setPendingAction(null);
    }
  };

  const saveFieldOrder = async (
    section: LocationSectionWithFields,
    nextFields: readonly LocationSectionField[],
  ) => {
    setPendingAction(`reorder-fields:${section.id}`);
    setFormErrorMessage(null);

    try {
      if (supabase === null) {
        setFormErrorMessage('Supabase 환경변수 설정을 확인하세요.');
        return;
      }
      const client = supabase;

      const responses = await Promise.all(
        nextFields.map((field, index) =>
          client
            .from('location_section_fields')
            .update({ sort_order: (index + 1) * 10 })
            .eq('id', field.id),
        ),
      );
      const failed = responses.find((response) => response.error !== null);

      if (failed?.error !== null && failed?.error !== undefined) {
        setRequestError('수집항목 순서 저장', failed.error.message);
        return;
      }

      onChanged();
    } finally {
      setPendingAction(null);
    }
  };

  const moveSection = (sectionId: string, direction: -1 | 1) => {
    const section = sections.find((candidate) => candidate.id === sectionId);
    if (section === undefined) {
      return;
    }
    const peerSections = sections.filter((candidate) => candidate.groupId === section.groupId);
    const index = peerSections.findIndex((candidate) => candidate.id === sectionId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= peerSections.length) {
      return;
    }
    void saveSectionOrder(moveItem(peerSections, index, targetIndex));
  };

  const handleSectionDrop = (targetId: string) => {
    if (draggedSectionId === null || draggedSectionId === targetId) {
      setDraggedSectionId(null);
      return;
    }
    const sourceSection = sections.find((section) => section.id === draggedSectionId);
    const targetSection = sections.find((section) => section.id === targetId);
    setDraggedSectionId(null);
    if (sourceSection === undefined || targetSection === undefined) {
      return;
    }
    if (sourceSection.groupId !== targetSection.groupId) {
      setFormErrorMessage('다른 분야로 옮기려면 섹션 편집에서 소속 분야를 변경한 뒤 저장하세요.');
      return;
    }
    const peerSections = sections.filter((section) => section.groupId === sourceSection.groupId);
    const sourceIndex = peerSections.findIndex((section) => section.id === sourceSection.id);
    const targetIndex = peerSections.findIndex((section) => section.id === targetSection.id);
    if (sourceIndex >= 0 && targetIndex >= 0) {
      void saveSectionOrder(moveItem(peerSections, sourceIndex, targetIndex));
    }
  };

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/50 px-4" role="dialog" aria-modal="true" aria-labelledby="section-manager-title">
      <section className="max-h-[78vh] w-full max-w-2xl overflow-hidden rounded-md bg-white shadow-xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="section-manager-title" className="text-lg font-semibold">
              {mode === 'create' ? '새 섹션' : '섹션 관리'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {mode === 'create'
                ? '이름과 지도 형태를 정하면 내부 식별자는 자동으로 만들어집니다.'
                : '섹션 순서는 드래그 또는 화살표로 바꿀 수 있습니다.'}
            </p>
          </div>
          <button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" onClick={onClose} aria-label="닫기">
            <X className="size-4" />
          </button>
        </header>

        <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
          {isLoading ? <p className="text-sm text-slate-500">섹션 정보를 불러오는 중입니다.</p> : null}
          {errorMessage !== null ? <StatusMessage message={errorMessage} /> : null}
          {formErrorMessage !== null ? <StatusMessage message={formErrorMessage} /> : null}
          {mode === 'manage' ? (
            <button type="button" className="mb-3 inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-2.5 text-xs font-semibold text-white hover:bg-slate-800" onClick={() => setIsCreateFormOpen(true)} disabled={pendingAction !== null}>
              <Plus className="size-3.5" /> 새 섹션
            </button>
          ) : null}

          {mode === 'create' ? (
            <form className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4" onSubmit={createSection}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-950">새 섹션</h3>
                <button type="submit" className="inline-flex h-9 items-center gap-1 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400" disabled={pendingAction !== null}>
                  <Plus className="size-4" /> 추가
                </button>
              </div>
              <SectionFormFields value={newSection} groups={groups} onChange={setNewSection} disabled={pendingAction !== null} />
            </form>
          ) : null}

          {showLegacySectionList ? (
            <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
              <nav className="max-h-[52vh] overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-2" aria-label="섹션 목록">
                {sections.map((section, index) => {
                  const isSelected = selectedSection?.id === section.id;
                  return (
                    <div
                      key={section.id}
                      className={`mb-1 flex items-center gap-1 rounded-md ${isSelected ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-white'}`}
                      draggable={pendingAction === null}
                      onDragStart={() => setDraggedSectionId(section.id)}
                      onDragEnd={() => setDraggedSectionId(null)}
                      onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
                      onDrop={() => handleSectionDrop(section.id)}
                    >
                      <GripVertical className="ml-1 size-4 shrink-0 opacity-50" aria-hidden="true" />
                      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 px-1 py-2 text-left text-sm" onClick={() => setSelectedSectionId(section.id)}>
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: section.color }} />
                        <span className="min-w-0 flex-1 truncate">{section.label}</span>
                      </button>
                      <div className="mr-1 flex flex-col">
                        <button type="button" className="p-0.5 disabled:opacity-30" aria-label={`${section.label} 위로 이동`} disabled={pendingAction !== null || index === 0} onClick={() => moveSection(section.id, -1)}><ArrowUp className="size-3" /></button>
                        <button type="button" className="p-0.5 disabled:opacity-30" aria-label={`${section.label} 아래로 이동`} disabled={pendingAction !== null || index === sections.length - 1} onClick={() => moveSection(section.id, 1)}><ArrowDown className="size-3" /></button>
                      </div>
                    </div>
                  );
                })}
              </nav>

              {selectedSection === null ? (
                <p className="rounded-md border border-slate-200 p-4 text-sm text-slate-500">선택할 섹션이 없습니다.</p>
              ) : (
                <SectionEditor
                  key={selectedSection.id}
                  section={selectedSection}
                  groups={groups}
                  isBusy={pendingAction !== null}
                  onSave={saveSection}
                  onDelete={deleteSection}
                  onOpenFields={() => setFieldsSectionId(selectedSection.id)}
                  onValidationError={setFormErrorMessage}
                />
              )}
            </div>
          ) : null}

          {mode === 'manage' ? (
            <div className="grid gap-4 md:grid-cols-[200px_minmax(0,1fr)]">
              <nav className="max-h-[52vh] overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-2" aria-label="Section groups">
                {sectionGroups.map((group) => (
                  <section key={group.id} className="mb-3 overflow-hidden rounded-md border border-slate-200 bg-white last:mb-0">
                    <header className="flex items-center gap-2 border-l-4 bg-slate-100 px-2 py-1.5" style={{ borderLeftColor: group.color }}>
                      <span className="size-2 rounded-full" style={{ backgroundColor: group.color }} />
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{group.label}</span>
                      <span className="text-[11px] text-slate-500">{group.sections.length}</span>
                    </header>
                    <div className="p-1">
                      {group.sections.map((section, index) => {
                        const isSelected = selectedSection?.id === section.id;
                        return (
                          <div
                            key={section.id}
                            className={`mb-1 flex items-center gap-1 rounded-md last:mb-0 ${isSelected ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                            draggable={pendingAction === null}
                            onDragStart={() => setDraggedSectionId(section.id)}
                            onDragEnd={() => setDraggedSectionId(null)}
                            onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
                            onDrop={() => handleSectionDrop(section.id)}
                          >
                            <GripVertical className="ml-1 size-4 shrink-0 opacity-50" aria-hidden="true" />
                            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 px-1 py-2 text-left text-sm" onClick={() => setSelectedSectionId(section.id)}>
                              <span className="size-2.5 rounded-full" style={{ backgroundColor: section.color }} />
                              <span className="min-w-0 flex-1 truncate">{section.label}</span>
                            </button>
                            <div className="mr-1 flex flex-col">
                              <button type="button" className="p-0.5 disabled:opacity-30" aria-label={`${section.label} move up`} disabled={pendingAction !== null || index === 0} onClick={() => moveSection(section.id, -1)}><ArrowUp className="size-3" /></button>
                              <button type="button" className="p-0.5 disabled:opacity-30" aria-label={`${section.label} move down`} disabled={pendingAction !== null || index === group.sections.length - 1} onClick={() => moveSection(section.id, 1)}><ArrowDown className="size-3" /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </nav>

              {selectedSection === null ? (
                <p className="rounded-md border border-slate-200 p-4 text-sm text-slate-500">선택된 섹션이 없습니다.</p>
              ) : (
                <SectionEditor
                  key={selectedSection.id}
                  section={selectedSection}
                  groups={groups}
                  isBusy={pendingAction !== null}
                  onSave={saveSection}
                  onDelete={deleteSection}
                  onOpenFields={() => setFieldsSectionId(selectedSection.id)}
                  onValidationError={setFormErrorMessage}
                />
              )}
            </div>
          ) : null}
        </div>
      </section>

      {fieldsSection !== null ? (
        <CollectionFieldsModal
          section={fieldsSection}
          pendingAction={pendingAction}
          onClose={() => setFieldsSectionId(null)}
          onCreate={createField}
          onSave={saveField}
          onDelete={deleteField}
          onReorder={saveFieldOrder}
          onValidationError={setFormErrorMessage}
          errorMessage={formErrorMessage}
        />
      ) : null}
    </div>
  );
}

function SectionEditor({ section, groups, isBusy, onSave, onDelete, onOpenFields, onValidationError }: {
  section: LocationSectionWithFields;
  groups: readonly LocationGroup[];
  isBusy: boolean;
  onSave: (section: LocationSectionWithFields, input: SectionInput) => Promise<void>;
  onDelete: (section: LocationSectionWithFields) => Promise<void>;
  onOpenFields: () => void;
  onValidationError: (message: string) => void;
}) {
  const [value, setValue] = useState<SectionInput>(() => toSectionInput(section));

  useEffect(() => setValue(toSectionInput(section)), [section]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = sectionSchema.safeParse(value);
    if (!parsed.success) {
      onValidationError(parsed.error.issues[0]?.message ?? '입력값을 확인하세요.');
      return;
    }
    void onSave(section, parsed.data);
  };

  return (
    <article className="rounded-md border border-slate-200 bg-white p-4">
      <form className="grid gap-4" onSubmit={submit}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full" style={{ backgroundColor: value.color }} />
            <h3 className="text-sm font-semibold text-slate-950">{section.label}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-blue-50 hover:text-blue-700 disabled:bg-slate-100" disabled={isBusy} aria-label={`${section.label} 저장`} title="저장"><Save className="size-4" /></button>
            <button type="button" className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-700 disabled:bg-slate-100" disabled={isBusy} aria-label={`${section.label} 삭제`} title="삭제" onClick={() => void onDelete(section)}><Trash2 className="size-4" /></button>
          </div>
        </div>
        <SectionFormFields value={value} groups={groups} onChange={setValue} disabled={isBusy} />
      </form>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">수집항목</h4>
          <p className="mt-1 text-xs text-slate-500">{section.fields.length}개 항목이 등록되어 있습니다.</p>
        </div>
        <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={onOpenFields} disabled={isBusy}>
          <ListTree className="size-4" /> 수집항목 관리
        </button>
      </div>
    </article>
  );
}

function CollectionFieldsModal({ section, pendingAction, onClose, onCreate, onSave, onDelete, onReorder, onValidationError, errorMessage }: {
  section: LocationSectionWithFields;
  pendingAction: PendingAction;
  onClose: () => void;
  onCreate: (section: LocationSectionWithFields, input: FieldInput) => Promise<boolean>;
  onSave: (field: LocationSectionField, input: FieldInput) => Promise<void>;
  onDelete: (field: LocationSectionField) => Promise<void>;
  onReorder: (section: LocationSectionWithFields, fields: readonly LocationSectionField[]) => Promise<void>;
  onValidationError: (message: string) => void;
  errorMessage: string | null;
}) {
  const [newField, setNewField] = useState<FieldInput>(newFieldInput);
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const isBusy = pendingAction !== null;

  const submitNewField = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = fieldSchema.safeParse(newField);
    if (!parsed.success) {
      onValidationError(parsed.error.issues[0]?.message ?? '입력값을 확인하세요.');
      return;
    }
    const isCreated = await onCreate(section, parsed.data);
    if (isCreated) {
      setNewField(newFieldInput());
    }
  };

  const moveField = (fieldId: string, direction: -1 | 1) => {
    const index = section.fields.findIndex((field) => field.id === fieldId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= section.fields.length) {
      return;
    }
    void onReorder(section, moveItem(section.fields, index, targetIndex));
  };

  const dropField = (targetId: string) => {
    if (draggedFieldId === null || draggedFieldId === targetId) {
      setDraggedFieldId(null);
      return;
    }
    const sourceIndex = section.fields.findIndex((field) => field.id === draggedFieldId);
    const targetIndex = section.fields.findIndex((field) => field.id === targetId);
    setDraggedFieldId(null);
    if (sourceIndex >= 0 && targetIndex >= 0) {
      void onReorder(section, moveItem(section.fields, sourceIndex, targetIndex));
    }
  };

  return (
    <div className="fixed inset-0 z-[1310] flex items-center justify-center bg-slate-950/50 px-4" role="dialog" aria-modal="true" aria-labelledby="field-manager-title">
      <section className="max-h-[78vh] w-full max-w-2xl overflow-y-auto rounded-md bg-white shadow-xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="field-manager-title" className="text-lg font-semibold">{section.label} 수집항목</h2>
            <p className="mt-1 text-sm text-slate-500">드래그 또는 화살표로 입력 순서를 설정합니다.</p>
          </div>
          <button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="수집항목 관리 닫기"><X className="size-4" /></button>
        </header>
        <div className="grid gap-4 p-5">
          {errorMessage !== null ? <StatusMessage message={errorMessage} /> : null}
          <form className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4" onSubmit={(event) => void submitNewField(event)}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-950">새 수집항목</h3>
              <button type="submit" className="inline-flex h-9 items-center gap-1 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400" disabled={isBusy}><Plus className="size-4" /> 추가</button>
            </div>
            <FieldFormFields value={newField} onChange={setNewField} disabled={isBusy} />
          </form>
          <ul className="grid gap-2">
            {section.fields.map((field, index) => (
              <li key={field.id} className="rounded-md border border-slate-200 bg-white p-3" draggable={!isBusy} onDragStart={() => setDraggedFieldId(field.id)} onDragEnd={() => setDraggedFieldId(null)} onDragOver={(event: DragEvent<HTMLLIElement>) => event.preventDefault()} onDrop={() => dropField(field.id)}>
                <div className="flex items-start gap-2">
                  <GripVertical className="mt-2 size-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <FieldEditor field={field} disabled={isBusy} onSave={onSave} onDelete={onDelete} onValidationError={onValidationError} />
                  </div>
                  <div className="flex flex-col pt-1">
                    <button type="button" className="p-1 text-slate-500 disabled:opacity-30" aria-label={`${field.label} 위로 이동`} disabled={isBusy || index === 0} onClick={() => moveField(field.id, -1)}><ArrowUp className="size-4" /></button>
                    <button type="button" className="p-1 text-slate-500 disabled:opacity-30" aria-label={`${field.label} 아래로 이동`} disabled={isBusy || index === section.fields.length - 1} onClick={() => moveField(field.id, 1)}><ArrowDown className="size-4" /></button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function FieldEditor({ field, disabled, onSave, onDelete, onValidationError }: {
  field: LocationSectionField;
  disabled: boolean;
  onSave: (field: LocationSectionField, input: FieldInput) => Promise<void>;
  onDelete: (field: LocationSectionField) => Promise<void>;
  onValidationError: (message: string) => void;
}) {
  const [value, setValue] = useState<FieldInput>(() => toFieldInput(field));
  useEffect(() => setValue(toFieldInput(field)), [field]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = fieldSchema.safeParse(value);
    if (!parsed.success) {
      onValidationError(parsed.error.issues[0]?.message ?? '입력값을 확인하세요.');
      return;
    }
    void onSave(field, parsed.data);
  };

  return (
    <form className="grid gap-3" onSubmit={submit}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold text-slate-900">{field.label}</p>
        <div className="flex items-center gap-2">
          <button type="submit" className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-blue-50 hover:text-blue-700 disabled:bg-slate-100" disabled={disabled} aria-label={`${field.label} 저장`} title="저장"><Save className="size-4" /></button>
          <button type="button" className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-700 disabled:bg-slate-100" disabled={disabled} aria-label={`${field.label} 삭제`} title="삭제" onClick={() => void onDelete(field)}><Trash2 className="size-4" /></button>
        </div>
      </div>
      <FieldFormFields value={value} onChange={setValue} disabled={disabled} />
    </form>
  );
}

function SectionFormFields({ value, groups, onChange, disabled }: {
  value: SectionInput;
  groups: readonly LocationGroup[];
  onChange: (value: SectionInput) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <TextInput label="섹션명" value={value.label} onChange={(label) => onChange({ ...value, label })} disabled={disabled} />
      <label className="block text-xs font-medium text-slate-700">소속 분야
        <select className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm" value={value.groupId} onChange={(event) => onChange({ ...value, groupId: event.target.value })} disabled={disabled}>
          <option value="">분야 선택</option>{groups.filter((group) => group.isActive).map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
        </select>
      </label>
      <label className="block text-xs font-medium text-slate-700">지도 형태
        <select className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm" value={value.geometryKind} onChange={(event) => onChange({ ...value, geometryKind: event.target.value as SectionGeometryKind })} disabled={disabled}>
          <option value="point">점 위치</option><option value="area">구역/면</option><option value="mixed">점과 구역 모두</option>
        </select>
      </label>
      <TextInput label="섹션 설명" value={value.description} onChange={(description) => onChange({ ...value, description })} disabled={disabled} className="md:col-span-2" />
      <TextInput label="색상" value={value.color} onChange={(color) => onChange({ ...value, color })} disabled={disabled} type="color" />
      <div className="flex flex-wrap content-end gap-4 pb-1 text-xs font-medium text-slate-700">
        <label className="flex items-center gap-2"><input type="checkbox" checked={value.isActive} onChange={(event) => onChange({ ...value, isActive: event.target.checked })} disabled={disabled} /> 활성</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={value.requiresStatus} onChange={(event) => onChange({ ...value, requiresStatus: event.target.checked })} disabled={disabled} /> 진행 단계 필드 사용</label>
      </div>
    </div>
  );
}

function FieldFormFields({ value, onChange, disabled }: {
  value: FieldInput;
  onChange: (value: FieldInput) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <TextInput label="항목명" value={value.label} onChange={(label) => onChange({ ...value, label })} disabled={disabled} />
      <label className="block text-xs font-medium text-slate-700">입력 형식
        <select className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm" value={value.fieldType} onChange={(event) => onChange({ ...value, fieldType: event.target.value as LocationFieldType })} disabled={disabled}>
          {fieldTypes.map((fieldType) => <option key={fieldType} value={fieldType}>{fieldType}</option>)}
        </select>
      </label>
      <TextInput label="도움말" value={value.helpText} onChange={(helpText) => onChange({ ...value, helpText })} disabled={disabled} className="md:col-span-2" />
      <label className="flex items-center gap-2 text-xs font-medium text-slate-700"><input type="checkbox" checked={value.isRequired} onChange={(event) => onChange({ ...value, isRequired: event.target.checked })} disabled={disabled} /> 필수 항목</label>
    </div>
  );
}

function TextInput({ label, value, onChange, disabled, type = 'text', className = '' }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  type?: 'text' | 'color';
  className?: string;
}) {
  return <label className={`block text-xs font-medium text-slate-700 ${className}`}>{label}<input className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm disabled:bg-slate-100" type={type} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} /></label>;
}

function StatusMessage({ message }: { message: string }) {
  return <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>;
}

function newSectionInput(): SectionInput {
  return { groupId: '', label: '', geometryKind: 'point', requiresStatus: false, description: '', color: '#64748b', isActive: true };
}

function newFieldInput(): FieldInput {
  return { label: '', fieldType: 'text', isRequired: false, helpText: '' };
}

function toSectionInput(section: LocationSectionWithFields): SectionInput {
  return { groupId: section.groupId ?? '', label: section.label, geometryKind: section.geometryKind, requiresStatus: section.requiresStatus, description: section.description ?? '', color: section.color, isActive: section.isActive };
}

function toFieldInput(field: LocationSectionField): FieldInput {
  return { label: field.label, fieldType: field.fieldType, isRequired: field.isRequired, helpText: field.helpText ?? '' };
}

function getSelectedSection(sections: readonly LocationSectionWithFields[], selectedSectionId: string | null) {
  if (sections.length === 0) return null;
  return sections.find((section) => section.id === selectedSectionId) ?? sections[0];
}

function getNextSortOrder(items: readonly { sortOrder: number }[]) {
  return Math.max(0, ...items.map((item) => item.sortOrder)) + 10;
}

function moveItem<T>(items: readonly T[], sourceIndex: number, targetIndex: number) {
  const nextItems = [...items];
  const [item] = nextItems.splice(sourceIndex, 1);
  if (item === undefined) return nextItems;
  nextItems.splice(targetIndex, 0, item);
  return nextItems;
}

function createSectionKey(label: string, sections: readonly LocationSectionWithFields[]) {
  return createGeneratedKey(label, new Set(sections.map((section) => section.key)), 'section');
}

function createFieldKey(label: string, fields: readonly LocationSectionField[]) {
  return createGeneratedKey(label, new Set(fields.map((field) => field.fieldKey)), 'field');
}

function createGeneratedKey(label: string, existingKeys: ReadonlySet<string>, fallback: string) {
  const normalized = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const base = /^[a-z]/.test(normalized) ? normalized.slice(0, 48) : fallback;
  let attempt = `${base}_${Date.now().toString(36)}`;
  let suffix = 2;
  while (existingKeys.has(attempt)) {
    attempt = `${base}_${Date.now().toString(36)}_${suffix}`;
    suffix += 1;
  }
  return attempt.slice(0, 64);
}
