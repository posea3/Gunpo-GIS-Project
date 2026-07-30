import { FormEvent, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { z } from 'zod';

import type {
  Location,
  LocationCategory,
  LocationInsertInput,
  LocationPhotoUpload,
  LocationUpdateInput,
  RedevelopmentStatus,
  SupportedGeometry,
} from '../types/location';
import { redevelopmentStatuses } from '../types/location';
import type {
  LocationSectionField,
  LocationSectionWithFields,
  SectionByCategory,
} from '../types/section';
import { normalizeOptionalText } from '../utils/geojson';

interface LocationEditModalProps {
  isOpen: boolean;
  geometry: SupportedGeometry;
  location?: Location;
  initialLocation?: Partial<LocationInsertInput>;
  sections?: readonly LocationSectionWithFields[];
  sectionsByCategory?: SectionByCategory;
  isSubmitting: boolean;
  submitErrorMessage?: string | null;
  onCancel: () => void;
  onSave: (
    input: LocationInsertInput | LocationUpdateInput,
    photoUploads: readonly LocationPhotoUpload[],
  ) => Promise<void> | void;
}

type FieldErrors = Partial<Record<FormFieldName, string>>;

type FormFieldName =
  | 'name'
  | 'category'
  | 'status'
  | 'address'
  | 'sourceUrl'
  | 'details';

const legacyRedevelopmentStatuses = [
  '추진위승인',
  '조합설립',
  '사업시행인가',
  '관리처분인가',
  '착공',
  '준공',
] as const;

const categoryLabels: Record<string, string> = {
  redevelopment: '재건축',
  development_issue: '개발 호재',
  place: '맛집·관광지',
};

const sourceLinkLabelKey = '__source_link_label';

const editFormSchema = z
  .object({
    name: z.string().trim().min(1, '이름을 입력하세요.').max(200),
    category: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
    status: z.enum(redevelopmentStatuses).nullable(),
    isPublished: z.boolean(),
    address: z.string().trim().min(1, '주소를 입력하세요.').max(500),
    sourceUrl: z.string(),
    details: z.string(),
  })
  .superRefine((value, context) => {
    if (value.status === undefined) {
      return;
    }

    if (value.category === 'redevelopment' && value.status === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: '재건축/재개발/리모델링 진행 단계는 필수입니다.',
      });
    }

    const normalizedUrl = normalizeOptionalText(value.sourceUrl);

    if (
      normalizedUrl !== null &&
      !/^https?:\/\/\S+$/i.test(normalizedUrl)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceUrl'],
        message: 'HTTP 또는 HTTPS URL을 입력하세요.',
      });
    }

    if (value.details.trim().length > 0) {
      try {
        const parsedDetails = JSON.parse(value.details) as unknown;

        if (
          typeof parsedDetails !== 'object' ||
          parsedDetails === null ||
          Array.isArray(parsedDetails)
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['details'],
            message: '상세 정보는 JSON 객체여야 합니다.',
          });
        }
      } catch {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['details'],
          message: '상세 정보 JSON 형식이 올바르지 않습니다.',
        });
      }
    }
  });

export function LocationEditModal({
  isOpen,
  geometry,
  location,
  initialLocation,
  isSubmitting,
  submitErrorMessage = null,
  sections = [],
  sectionsByCategory = {},
  onCancel,
  onSave,
}: LocationEditModalProps) {
  const allowedCategories = useMemo(
    () => getAllowedCategories(geometry),
    [geometry],
  );
  const initialCategory = getInitialCategory(allowedCategories, location);
  const activeSections = useMemo(
    () => sections.filter((section) => section.isActive),
    [sections],
  );
  const initialSection = getInitialSection(
    activeSections,
    initialCategory,
    location?.sectionId ?? initialLocation?.sectionId,
    sectionsByCategory,
  );
  const [name, setName] = useState(location?.name ?? initialLocation?.name ?? '');
  const [category, setCategory] = useState<LocationCategory>(
    initialSection?.key ?? initialCategory,
  );
  const [sectionId, setSectionId] = useState<string | null>(
    initialSection?.id ?? null,
  );
  const [status, setStatus] = useState<RedevelopmentStatus | ''>(
    location?.status ?? '',
  );
  const [isPublished, setIsPublished] = useState(
    location?.isPublished ?? false,
  );
  const [address, setAddress] = useState(
    getInitialDetailText(location?.details ?? initialLocation?.details, '주소'),
  );
  const [photoFiles, setPhotoFiles] = useState<readonly File[]>([]);
  const [sourceUrl, setSourceUrl] = useState(
    getInitialSourceLinkText(location?.sourceUrl, location?.details),
  );
  const [details, setDetails] = useState(formatInitialDetails(location?.details));
  const [sectionFieldValues, setSectionFieldValues] = useState<Record<string, string>>(
    () => getInitialSectionFieldValues(location?.details ?? initialLocation?.details),
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [sectionFieldErrors, setSectionFieldErrors] = useState<Record<string, string>>({});
  const selectedSection =
    activeSections.find((section) => section.id === sectionId) ??
    activeSections.find((section) => section.key === category) ??
    sectionsByCategory[category];

  useEffect(() => {
    const nextAllowedCategories = getAllowedCategories(geometry);
    const nextCategory = getInitialCategory(nextAllowedCategories, location);
    const nextActiveSections = sections.filter((section) => section.isActive);
    const nextSection = getInitialSection(
      nextActiveSections,
      nextCategory,
      location?.sectionId ?? initialLocation?.sectionId,
      sectionsByCategory,
    );

    setName(location?.name ?? initialLocation?.name ?? '');
    setCategory(nextSection?.key ?? nextCategory);
    setSectionId(nextSection?.id ?? null);
    setStatus(location?.status ?? '');
    setIsPublished(location?.isPublished ?? false);
    setAddress(getInitialDetailText(location?.details ?? initialLocation?.details, '주소'));
    setPhotoFiles([]);
    setSourceUrl(getInitialSourceLinkText(location?.sourceUrl, location?.details));
    setDetails(formatInitialDetails(location?.details ?? initialLocation?.details));
    setSectionFieldValues(
      getInitialSectionFieldValues(location?.details ?? initialLocation?.details),
    );
    setFieldErrors({});
    setSectionFieldErrors({});
  }, [geometry, initialLocation, isOpen, location, sections, sectionsByCategory]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (
      (selectedSection === undefined && !allowedCategories.includes(category)) ||
      (selectedSection !== undefined && !isSectionGeometryCompatible(selectedSection, geometry))
    ) {
      setFieldErrors({
        category: '현재 그린 도형과 호환되는 섹션을 선택하세요.',
      });
      return;
    }

    const sourceLink = parseSourceLinkInput(sourceUrl);
    if (sourceLink === null) {
      setFieldErrors({
        sourceUrl: 'HTTP/HTTPS URL 또는 [설명](https://주소) 형식으로 입력하세요.',
      });
      return;
    }

    const parsed = editFormSchema.safeParse({
      name,
      category,
      sectionId,
      status: selectedSection?.requiresStatus === true && status !== '' ? status : null,
      isPublished,
      address,
      sourceUrl: sourceLink.url ?? '',
      details,
    });

    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error));
      return;
    }

    const nextSectionFieldErrors = validateSectionFields(
      selectedSection?.fields ?? [],
      sectionFieldValues,
    );

    if (Object.keys(nextSectionFieldErrors).length > 0) {
      setSectionFieldErrors(nextSectionFieldErrors);
      return;
    }

    const normalizedDetails = {
      ...withSourceLinkLabel(parseDetails(parsed.data.details), sourceLink.label),
      ...toSectionFieldDetails(selectedSection?.fields ?? [], sectionFieldValues),
      ...toAddressDetail(parsed.data.address),
    };
    const input = {
      name: parsed.data.name,
      category: parsed.data.category,
      sectionId,
      status:
        selectedSection?.requiresStatus === true ? parsed.data.status : null,
      isPublished: parsed.data.isPublished,
      sourceName: location?.sourceName ?? initialLocation?.sourceName ?? null,
      sourceUrl: normalizeOptionalText(parsed.data.sourceUrl),
      sourceDate: location?.sourceDate ?? initialLocation?.sourceDate ?? null,
      details: normalizedDetails,
      geometry,
    };

    setFieldErrors({});
    setSectionFieldErrors({});
    await onSave(
      input,
      photoFiles.map((file) => ({ file })),
    );
  };

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-edit-title"
    >
      <form
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-md bg-white p-6 shadow-xl"
        onSubmit={handleSubmit}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="location-edit-title" className="text-xl font-semibold">
            {location === undefined ? '위치 추가' : '위치 편집'}
          </h2>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            취소
          </button>
        </div>

        <div className="mt-6 grid gap-4">
          <TextField
            label="이름"
            required
            value={name}
            onChange={setName}
            error={fieldErrors.name}
            disabled={isSubmitting}
          />

          <TextField
            label="주소"
            required
            value={address}
            onChange={setAddress}
            error={fieldErrors.address}
            disabled={isSubmitting}
          />

          <label className="block text-sm font-medium text-slate-700">
            섹션 <RequiredMark />
            <select
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2"
              value={sectionId ?? `category:${category}`}
              onChange={(event) => {
                const value = event.target.value;
                const nextSection = activeSections.find(
                  (section) => section.id === value,
                );
                const nextCategory =
                  nextSection?.baseCategory ??
                  (value.replace('category:', '') as LocationCategory);

                setSectionId(nextSection?.id ?? null);
                setCategory(nextSection?.key ?? nextCategory);

                if (nextSection?.requiresStatus !== true && nextCategory !== 'redevelopment') {
                  setStatus('');
                }
              }}
              disabled={isSubmitting}
            >
              {activeSections.length > 0
                ? activeSections.map((section) => {
                  const isCompatible = isSectionGeometryCompatible(section, geometry);
                  return (
                  <option key={section.id} value={section.id} disabled={!isCompatible}>
                    {section.label}{isCompatible ? '' : ' (현재 도형과 맞지 않음)'}
                  </option>
                  );
                })
                : allowedCategories.map((allowedCategory) => (
                  <option key={allowedCategory} value={`category:${allowedCategory}`}>
                    {categoryLabels[allowedCategory]}
                  </option>
                ))}
            </select>
            <FieldError message={fieldErrors.category} />
          </label>

          {selectedSection?.requiresStatus === true || category === 'redevelopment' ? (
            <label className="block text-sm font-medium text-slate-700">
              재건축/재개발/리모델링 진행 단계 <RequiredMark />
              <select
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as RedevelopmentStatus)
                }
                disabled={isSubmitting}
              >
                <option value="">선택</option>
                {redevelopmentStatuses.map((redevelopmentStatus) => (
                  <option key={redevelopmentStatus} value={redevelopmentStatus}>
                    {redevelopmentStatus}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.status} />
            </label>
          ) : null}

          <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(event) => setIsPublished(event.target.checked)}
              disabled={isSubmitting}
            />
            발행
          </label>

          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
            {selectedSection?.description ?? getCategoryCollectionGuide(category)}
          </div>

          {selectedSection !== undefined && selectedSection.fields.length > 0 ? (
            <section className="grid gap-3 rounded-md border border-slate-200 p-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {selectedSection.label} 수집 항목
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  섹션 관리에서 정의한 항목입니다. 저장 시 상세 정보 JSON에 함께
                  저장됩니다.
                </p>
              </div>
              {selectedSection.fields.map((field) => (
                <SectionDetailField
                  key={field.id}
                  field={field}
                  value={sectionFieldValues[field.fieldKey] ?? ''}
                  error={sectionFieldErrors[field.fieldKey]}
                  disabled={isSubmitting}
                  onChange={(value) =>
                    setSectionFieldValues((current) => ({
                      ...current,
                      [field.fieldKey]: value,
                    }))
                  }
                />
              ))}
            </section>
          ) : null}

          <TextField
            label="링크"
            value={sourceUrl}
            onChange={setSourceUrl}
            error={fieldErrors.sourceUrl}
            disabled={isSubmitting}
            description="HTTP/HTTPS 주소 또는 [설명](https://주소) 형식으로 입력하면 상세 보기에서 설명에 링크가 연결됩니다."
          />
          <label className="block text-sm font-medium text-slate-700">
            사진 파일 첨부
            <input
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                setPhotoFiles(Array.from(event.target.files ?? []));
              }}
              disabled={isSubmitting}
            />
            <p className="mt-1 text-xs text-slate-500">
              선택한 이미지는 저장 시 Supabase Storage의 location-photos 버킷에 업로드되고,
              공개 URL이 사진 목록에 추가됩니다.
            </p>
          </label>
          {photoFiles.length > 0 ? (
            <ul className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
              {photoFiles.map((file, index) => (
                <li key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-3 text-sm text-slate-700">
                  <span className="min-w-0 truncate">{file.name}</span>
                  <button
                    type="button"
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setPhotoFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                    disabled={isSubmitting}
                    aria-label={`${file.name} 첨부 취소`}
                    title="첨부 취소"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <label className="block text-sm font-medium text-slate-700">
            상세 정보
            <textarea
              className="mt-2 min-h-32 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              disabled={isSubmitting}
            />
            <p className="mt-1 text-xs text-slate-500">
              보조 정보를 JSON 객체로 저장합니다. 비워두면 {'{}'}로 저장됩니다.
              예: {'{"영업시간":"10:00-21:00","메모":"확인 필요"}'}
            </p>
            <FieldError message={fieldErrors.details} />
          </label>
        </div>

        {submitErrorMessage !== null ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {submitErrorMessage}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            취소
          </button>
          <button
            type="submit"
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={isSubmitting}
          >
            {isSubmitting ? '저장 중' : '저장'}
          </button>
        </div>
      </form>
    </div>
  );
}

function TextField({
  label,
  required = false,
  value,
  onChange,
  error,
  disabled,
  type = 'text',
  description,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled: boolean;
  type?: 'text' | 'date' | 'number';
  description?: string;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label} {required ? <RequiredMark /> : null}
      <input
        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
      {description === undefined ? null : (
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      )}
      <FieldError message={error} />
    </label>
  );
}

function RequiredMark() {
  return <span className="text-red-600" aria-label="필수">*</span>;
}

function FieldError({ message }: { message?: string }) {
  return message === undefined ? null : (
    <span className="mt-1 block text-xs text-red-700">{message}</span>
  );
}

function SectionDetailField({
  field,
  value,
  error,
  disabled,
  onChange,
}: {
  field: LocationSectionField;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  if (field.fieldType === 'textarea') {
    return (
      <label className="block text-sm font-medium text-slate-700">
        {field.label} {field.isRequired ? <RequiredMark /> : null}
        <textarea
          className="mt-2 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        />
        {field.helpText === null ? null : (
          <p className="mt-1 text-xs text-slate-500">{field.helpText}</p>
        )}
        <FieldError message={error} />
      </label>
    );
  }

  return (
    <TextField
      label={field.label}
      required={field.isRequired}
      value={value}
      onChange={onChange}
      error={error}
      disabled={disabled}
      type={field.fieldType === 'date' ? 'date' : field.fieldType === 'number' ? 'number' : 'text'}
      description={field.helpText ?? undefined}
    />
  );
}

function getAllowedCategories(geometry: SupportedGeometry): LocationCategory[] {
  if (geometry.type === 'Point') {
    return ['place', 'development_issue'];
  }

  return ['redevelopment', 'development_issue'];
}

function isSectionGeometryCompatible(
  section: LocationSectionWithFields,
  geometry: SupportedGeometry,
) {
  if (section.geometryKind === 'mixed') {
    return true;
  }

  if (section.geometryKind === 'point') {
    return geometry.type === 'Point';
  }

  return geometry.type === 'Polygon' || geometry.type === 'MultiPolygon';
}

function getInitialCategory(
  allowedCategories: readonly LocationCategory[],
  location: Location | undefined,
) {
  if (
    location !== undefined &&
    allowedCategories.includes(location.category)
  ) {
    return location.category;
  }

  return allowedCategories[0];
}

function getInitialSection(
  compatibleSections: readonly LocationSectionWithFields[],
  category: LocationCategory,
  sectionId: string | null | undefined,
  sectionsByCategory: SectionByCategory,
) {
  if (sectionId !== null && sectionId !== undefined) {
    const matchedSection = compatibleSections.find(
      (section) => section.id === sectionId,
    );

    if (matchedSection !== undefined) {
      return matchedSection;
    }
  }

  const keyMatchedSection = compatibleSections.find(
    (section) => section.key === category,
  );

  if (keyMatchedSection !== undefined) {
    return keyMatchedSection;
  }

  const categorySection = sectionsByCategory[category];

  if (
    categorySection !== undefined &&
    compatibleSections.some((section) => section.id === categorySection.id)
  ) {
    return categorySection;
  }

  return compatibleSections.find((section) => section.baseCategory === category) ?? null;
}

function formatInitialDetails(details: Record<string, unknown> | undefined) {
  if (details === undefined) {
    return '';
  }

  const visibleDetails = { ...details };
  delete visibleDetails[sourceLinkLabelKey];

  if (Object.keys(visibleDetails).length === 0) {
    return '';
  }

  return JSON.stringify(visibleDetails, null, 2);
}

function parseDetails(details: string): Record<string, unknown> {
  if (details.trim().length === 0) {
    return {};
  }

  const parsed = JSON.parse(details) as unknown;

  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    !Array.isArray(parsed)
  ) {
    return parsed as Record<string, unknown>;
  }

  return {};
}

function getInitialSourceLinkText(
  sourceUrl: string | null | undefined,
  details: Record<string, unknown> | undefined,
) {
  if (sourceUrl === null || sourceUrl === undefined || sourceUrl.length === 0) {
    return '';
  }

  const label = details?.[sourceLinkLabelKey];
  return typeof label === 'string' && label.trim().length > 0
    ? `[${label.trim()}](${sourceUrl})`
    : sourceUrl;
}

function parseSourceLinkInput(value: string) {
  const normalized = normalizeOptionalText(value);
  if (normalized === null) {
    return { url: null, label: null };
  }

  const markdownMatch = normalized.match(/^\[([^\]\r\n]+)\]\((https?:\/\/[^\s)]+)\)$/i);
  if (markdownMatch !== null) {
    const label = markdownMatch[1].trim();
    return label.length > 0
      ? { url: markdownMatch[2], label }
      : null;
  }

  if (normalized.startsWith('[')) {
    return null;
  }

  return { url: normalized, label: null };
}

function withSourceLinkLabel(
  details: Record<string, unknown>,
  label: string | null,
) {
  const nextDetails = { ...details };
  delete nextDetails[sourceLinkLabelKey];

  if (label !== null) {
    nextDetails[sourceLinkLabelKey] = label;
  }

  return nextDetails;
}

function getInitialDetailText(
  details: Record<string, unknown> | undefined,
  key: string,
) {
  const value = details?.[key];
  return typeof value === 'string' ? value : '';
}

function getInitialSectionFieldValues(
  details: Record<string, unknown> | undefined,
) {
  if (details === undefined) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(details)
      .filter(([, value]) => isScalarDetailValue(value))
      .map(([key, value]) => [key, String(value)]),
  );
}

function toAddressDetail(address: string): Record<string, string> {
  const normalizedAddress = normalizeOptionalText(address);

  if (normalizedAddress === null) {
    return {};
  }

  return { 주소: normalizedAddress };
}

function validateSectionFields(
  fields: readonly LocationSectionField[],
  values: Readonly<Record<string, string>>,
) {
  const errors: Record<string, string> = {};

  fields.forEach((field) => {
    const value = values[field.fieldKey]?.trim() ?? '';

    if (field.isRequired && value.length === 0) {
      errors[field.fieldKey] = '필수 항목입니다.';
      return;
    }

    if (field.fieldType === 'url' && value.length > 0 && !/^https?:\/\/\S+$/i.test(value)) {
      errors[field.fieldKey] = 'HTTP 또는 HTTPS URL을 입력하세요.';
    }
  });

  return errors;
}

function toSectionFieldDetails(
  fields: readonly LocationSectionField[],
  values: Readonly<Record<string, string>>,
): Record<string, string | number> {
  const details: Record<string, string | number> = {};

  fields.forEach((field) => {
    const value = normalizeOptionalText(values[field.fieldKey]);

    if (value === null) {
      return;
    }

    details[field.fieldKey] =
      field.fieldType === 'number' && Number.isFinite(Number(value))
        ? Number(value)
        : value;
  });

  return details;
}

function isScalarDetailValue(value: unknown) {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function getCategoryCollectionGuide(category: LocationCategory) {
  if (category === 'redevelopment') {
    return '재건축은 추진 단계, 고시일/기준일, 출처 링크, 조합/구역/면적/세대수 같은 사업 정보를 중심으로 수집하세요. 상세 정보 JSON 예: {"구역명":"", "면적":"", "세대수":"", "시공사":""}';
  }

  if (category === 'development_issue') {
    return '개발호재는 사업명, 사업 유형, 위치, 진행 상태, 발표 기관, 예상 일정처럼 변동 가능한 개발 정보를 중심으로 수집하세요. 상세 정보 JSON 예: {"사업유형":"", "진행상황":"", "예상일정":""}';
  }

  return '맛집·관광지는 주소, 영업시간, 대표 메뉴, 연락처, 사진처럼 방문자가 바로 확인할 정보를 중심으로 수집하세요. 상세 정보 JSON 예: {"영업시간":"", "대표메뉴":"", "전화번호":""}';
}

function toFieldErrors(error: z.ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};

  error.issues.forEach((issue) => {
    const fieldName = issue.path[0];

    if (isFormFieldName(fieldName)) {
      fieldErrors[fieldName] = issue.message;
    }
  });

  return fieldErrors;
}

function isFormFieldName(value: unknown): value is FormFieldName {
  return (
    value === 'name' ||
    value === 'category' ||
    value === 'status' ||
    value === 'address' ||
    value === 'sourceUrl' ||
    value === 'details'
  );
}
