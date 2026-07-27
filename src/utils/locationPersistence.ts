import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  Location,
  LocationInsertInput,
  LocationPhotoUpload,
  LocationUpdateInput,
  SupportedGeometry,
} from '../types/location';
import { parseGeometry } from './geojson';

const photoBucketName = 'location-photos';

export type LocationWritePayload = {
  name: string;
  category: Location['category'];
  section_id: string | null;
  status: Location['status'];
  is_published: boolean;
  source_name: string | null;
  source_url: string | null;
  source_date: string | null;
  details: Record<string, unknown>;
  geojson: SupportedGeometry;
};

export async function prepareLocationWriteInput(
  input: LocationInsertInput,
  photoUploads: readonly LocationPhotoUpload[],
  supabase: SupabaseClient,
) {
  if (photoUploads.length === 0) {
    return input;
  }

  const uploadedPhotoUrls = await uploadLocationPhotos(photoUploads, supabase);

  return {
    ...input,
    details: {
      ...input.details,
      사진: mergePhotoUrls(input.details.사진, uploadedPhotoUrls),
    },
  };
}

export function toLocationWritePayload(
  input: LocationInsertInput,
): LocationWritePayload {
  return {
    name: input.name,
    category: input.category,
    section_id: input.sectionId,
    status: input.status,
    is_published: input.isPublished,
    source_name: input.sourceName,
    source_url: input.sourceUrl,
    source_date: input.sourceDate,
    details: input.details,
    geojson: parseGeometry(input.geometry),
  };
}

export function isCompleteLocationInput(
  input: LocationInsertInput | LocationUpdateInput,
): input is LocationInsertInput {
  return (
    input.name !== undefined &&
    input.category !== undefined &&
    input.sectionId !== undefined &&
    input.status !== undefined &&
    input.isPublished !== undefined &&
    input.sourceName !== undefined &&
    input.sourceUrl !== undefined &&
    input.sourceDate !== undefined &&
    input.details !== undefined &&
    input.geometry !== undefined
  );
}

async function uploadLocationPhotos(
  photoUploads: readonly LocationPhotoUpload[],
  supabase: SupabaseClient,
) {
  const uploadedUrls: string[] = [];

  for (const photoUpload of photoUploads) {
    const objectPath = createPhotoObjectPath(photoUpload.file);
    const { error } = await supabase.storage
      .from(photoBucketName)
      .upload(objectPath, photoUpload.file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      throw new Error(
        `사진 업로드에 실패했습니다. Supabase Storage의 ${photoBucketName} 버킷과 정책을 확인하세요: ${error.message}`,
      );
    }

    const { data } = supabase.storage
      .from(photoBucketName)
      .getPublicUrl(objectPath);

    uploadedUrls.push(data.publicUrl);
  }

  return uploadedUrls;
}

function createPhotoObjectPath(file: File) {
  const extension = getFileExtension(file.name);
  return `locations/${crypto.randomUUID()}${extension}`;
}

function getFileExtension(fileName: string) {
  const extensionMatch = fileName.match(/\.[a-z0-9]+$/i);
  return extensionMatch?.[0].toLowerCase() ?? '';
}

function mergePhotoUrls(
  existingValue: unknown,
  uploadedPhotoUrls: readonly string[],
) {
  if (Array.isArray(existingValue)) {
    return [
      ...existingValue.filter((value): value is string => typeof value === 'string'),
      ...uploadedPhotoUrls,
    ];
  }

  if (typeof existingValue === 'string' && existingValue.length > 0) {
    return [existingValue, ...uploadedPhotoUrls];
  }

  return [...uploadedPhotoUrls];
}
