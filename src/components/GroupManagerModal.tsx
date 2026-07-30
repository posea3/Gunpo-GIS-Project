import { type DragEvent, type FormEvent, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Plus, Save, X } from 'lucide-react';

import { supabase } from '../lib/supabase';
import type { LocationGroup } from '../types/group';

interface GroupManagerModalProps {
  isOpen: boolean;
  groups: readonly LocationGroup[];
  onChanged: () => void;
  onClose: () => void;
}

export function GroupManagerModal({
  isOpen,
  groups,
  onChanged,
  onClose,
}: GroupManagerModalProps) {
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('#2563eb');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  const createGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextLabel = label.trim();

    if (nextLabel.length === 0) {
      setError('분야명을 입력하세요.');
      return;
    }
    if (supabase === null) {
      setError('Supabase 환경변수 설정을 확인하세요.');
      return;
    }

    setBusy(true);
    setError(null);
    const keySeed = nextLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const key = `group_${keySeed || crypto.randomUUID().replace(/-/g, '')}`.slice(0, 64);
    const { error: requestError } = await supabase.from('location_groups').insert({
      key,
      label: nextLabel,
      color,
      is_active: true,
      sort_order: getNextSortOrder(groups),
    });

    if (requestError !== null) {
      setError(requestError.message);
    } else {
      setLabel('');
      onChanged();
    }
    setBusy(false);
  };

  const saveGroup = async (group: LocationGroup, form: HTMLFormElement) => {
    if (supabase === null || busy) {
      return;
    }

    const values = new FormData(form);
    const nextLabel = String(values.get('label') ?? '').trim();
    const nextColor = String(values.get('color') ?? '');
    const isActive = values.get('isActive') === 'on';
    if (nextLabel.length === 0) {
      setError('분야명을 입력하세요.');
      return;
    }

    setBusy(true);
    setError(null);
    const { error: requestError } = await supabase
      .from('location_groups')
      .update({ label: nextLabel, color: nextColor, is_active: isActive })
      .eq('id', group.id);

    if (requestError !== null) {
      setError(requestError.message);
    } else {
      onChanged();
    }
    setBusy(false);
  };

  const saveOrder = async (nextGroups: readonly LocationGroup[]) => {
    if (supabase === null || busy) {
      return;
    }

    setBusy(true);
    setError(null);
    const client = supabase;
    const responses = await Promise.all(
      nextGroups.map((group, index) =>
        client
          .from('location_groups')
          .update({ sort_order: (index + 1) * 10 })
          .eq('id', group.id),
      ),
    );
    const failed = responses.find((response) => response.error !== null);

    if (failed?.error !== null && failed?.error !== undefined) {
      setError(`분야 순서 저장에 실패했습니다: ${failed.error.message}`);
    } else {
      onChanged();
    }
    setBusy(false);
  };

  const moveGroup = (groupId: string, direction: -1 | 1) => {
    const index = groups.findIndex((group) => group.id === groupId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= groups.length) {
      return;
    }
    void saveOrder(moveItem(groups, index, targetIndex));
  };

  const handleDrop = (targetGroupId: string) => {
    if (draggedGroupId === null || draggedGroupId === targetGroupId) {
      setDraggedGroupId(null);
      return;
    }

    const sourceIndex = groups.findIndex((group) => group.id === draggedGroupId);
    const targetIndex = groups.findIndex((group) => group.id === targetGroupId);
    setDraggedGroupId(null);
    if (sourceIndex >= 0 && targetIndex >= 0) {
      void saveOrder(moveItem(groups, sourceIndex, targetIndex));
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="group-manager-title">
      <section className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-md bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold text-blue-700">관리자</p>
            <h2 id="group-manager-title" className="text-lg font-semibold">분야 관리</h2>
            <p className="mt-1 text-xs text-slate-500">드래그 또는 화살표로 지도 상단 분야의 표시 순서를 바꿉니다.</p>
          </div>
          <button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="분야 관리 닫기" disabled={busy}>
            <X className="size-5" />
          </button>
        </header>

        <div className="space-y-4 p-5">
          {error !== null ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <form onSubmit={(event) => void createGroup(event)} className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_auto_auto]">
            <input className="h-9 rounded-md border border-slate-300 px-2 text-sm" placeholder="새 분야명" value={label} onChange={(event) => setLabel(event.target.value)} disabled={busy} />
            <input className="h-9 w-full" type="color" value={color} onChange={(event) => setColor(event.target.value)} disabled={busy} aria-label="새 분야 색상" />
            <button type="submit" className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white disabled:bg-slate-400" disabled={busy}>
              <Plus className="size-4" /> 추가
            </button>
          </form>

          <div className="space-y-2">
            {groups.map((group, index) => (
              <form
                key={group.id}
                className={`grid gap-2 rounded-md border border-slate-200 p-3 md:grid-cols-[auto_1fr_auto_auto_auto] ${draggedGroupId === group.id ? 'opacity-50' : ''}`}
                draggable={!busy}
                onDragStart={() => setDraggedGroupId(group.id)}
                onDragEnd={() => setDraggedGroupId(null)}
                onDragOver={(event: DragEvent<HTMLFormElement>) => event.preventDefault()}
                onDrop={() => handleDrop(group.id)}
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveGroup(group, event.currentTarget);
                }}
              >
                <GripVertical className="mt-2 size-4 text-slate-400" aria-hidden="true" />
                <input name="label" defaultValue={group.label} className="h-9 rounded-md border border-slate-300 px-2 text-sm" disabled={busy} />
                <input name="color" type="color" defaultValue={group.color} className="h-9 w-full" disabled={busy} aria-label={`${group.label} 색상`} />
                <label className="flex items-center gap-2 text-xs"><input name="isActive" type="checkbox" defaultChecked={group.isActive} disabled={busy} />활성</label>
                <div className="flex items-center gap-1">
                  <span className="flex flex-col">
                    <button type="button" className="p-0.5 text-slate-500 disabled:opacity-30" aria-label={`${group.label} 위로 이동`} disabled={busy || index === 0} onClick={() => moveGroup(group.id, -1)}><ArrowUp className="size-3.5" /></button>
                    <button type="button" className="p-0.5 text-slate-500 disabled:opacity-30" aria-label={`${group.label} 아래로 이동`} disabled={busy || index === groups.length - 1} onClick={() => moveGroup(group.id, 1)}><ArrowDown className="size-3.5" /></button>
                  </span>
                  <button type="submit" className="inline-flex size-8 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" disabled={busy} aria-label={`${group.label} 저장`} title="저장"><Save className="size-4" /></button>
                </div>
              </form>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function getNextSortOrder(groups: readonly LocationGroup[]) {
  return Math.max(0, ...groups.map((group) => group.sortOrder)) + 10;
}

function moveItem<T>(items: readonly T[], sourceIndex: number, targetIndex: number) {
  const nextItems = [...items];
  const [item] = nextItems.splice(sourceIndex, 1);
  if (item === undefined) {
    return nextItems;
  }
  nextItems.splice(targetIndex, 0, item);
  return nextItems;
}
