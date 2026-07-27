import type { Location } from '../types/location';
import type { LocationSectionWithFields } from '../types/section';
import { X } from 'lucide-react';
import { getLocationPhotoUrls } from '../utils/locationPhotos';

interface LocationDetailModalProps {
  location: Location | null;
  sections: readonly LocationSectionWithFields[];
  onClose: () => void;
}

const categoryLabels: Record<string, string> = {
  redevelopment: '재건축',
  development_issue: '개발 호재',
  place: '맛집·관광지',
};

export function LocationDetailModal({
  location,
  sections,
  onClose,
}: LocationDetailModalProps) {
  if (location === null) {
    return null;
  }

  const photoUrls = getLocationPhotoUrls(location.details);
  const section =
    sections.find((candidate) => candidate.id === location.sectionId) ??
    sections.find((candidate) => candidate.key === location.category);
  const categoryLabel = section?.label ?? categoryLabels[location.category] ?? location.category;
  const detailFields = section?.fields ?? [];
  const address = getDetailText(location.details, '주소');

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-detail-title"
    >
      <article className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-md bg-white shadow-xl">
        <header className="relative min-h-44 overflow-hidden bg-slate-800 px-6 pb-5 pt-10 text-white">
          {photoUrls[0] !== undefined ? (
            <img
              src={photoUrls[0]}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
          <div className="absolute inset-0 bg-slate-950/55" />
          <div className="relative pr-12">
            <div className="min-w-0">
              <p className="text-sm font-medium text-emerald-200">
              {categoryLabel}
              </p>
              <h2
                id="location-detail-title"
                className="mt-1 text-xl font-semibold text-white"
              >
                {location.name}
              </h2>
              {address !== null ? (
                <p className="mt-2 break-words text-sm text-white/90">{address}</p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/15 text-white hover:bg-white/25"
            onClick={onClose}
            aria-label="상세보기 닫기"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="p-6">
        <dl className="space-y-4 text-sm">
          {section?.requiresStatus === true && location.status !== null ? (
            <DetailRow label="진행 단계" value={location.status} />
          ) : null}
          {detailFields.map((field) => {
            const value = formatFieldValue(location.details[field.fieldKey]);
            return value === null ? null : <DetailRow key={field.id} label={field.label} value={value} />;
          })}
          {location.sourceUrl !== null ? <div>
            <dt className="font-medium text-slate-500">링크</dt>
            <dd className="mt-1 text-slate-900">
              <a
                className="text-emerald-700 underline-offset-4 hover:underline"
                href={location.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {location.sourceUrl}
              </a>
            </dd>
          </div> : null}
          <DetailRow
            label="시스템 수정일"
            value={formatDateTime(location.updatedAt)}
          />
        </dl>

        </div>
      </article>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-slate-900">{value}</dd>
    </div>
  );
}

function formatFieldValue(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return String(value);
  }

  return JSON.stringify(value);
}

function getDetailText(details: Record<string, unknown>, key: string) {
  const value = details[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('ko-KR');
}
