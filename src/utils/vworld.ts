import type { Point } from 'geojson';

export interface VworldGeocodeResult {
  title: string;
  address: string;
  geometry: Point;
}

type VworldAddressType = 'ROAD' | 'PARCEL';

const geocodeTimeoutMs = 8000;

export async function geocodeVworldAddress(
  query: string,
  apiKey: string,
): Promise<VworldGeocodeResult | null> {
  const queryCandidates = getGunpoQueryCandidates(query);

  for (const queryCandidate of queryCandidates) {
    const roadResult = await requestVworldGetCoord(queryCandidate, apiKey, 'ROAD');

    if (roadResult !== null) {
      return roadResult;
    }

    const parcelResult = await requestVworldGetCoord(queryCandidate, apiKey, 'PARCEL');

    if (parcelResult !== null) {
      return parcelResult;
    }
  }

  return null;
}

function getGunpoQueryCandidates(query: string) {
  const normalizedQuery = normalizeGunpoQuery(query);
  const candidates = [normalizedQuery];
  const buildingAddress = extractBuildingAddress(normalizedQuery);

  if (buildingAddress !== null && buildingAddress !== normalizedQuery) {
    candidates.push(buildingAddress);
  }

  return candidates;
}

function normalizeGunpoQuery(query: string) {
  const trimmedQuery = query.trim();

  if (trimmedQuery.includes('군포')) {
    return trimmedQuery;
  }

  return `군포시 ${trimmedQuery}`;
}

function extractBuildingAddress(query: string) {
  const roadAddressMatch = query.match(
    /^(.*?(?:로|길)\s*\d+(?:-\d+)?)(?:\s|$)/u,
  );

  if (roadAddressMatch?.[1] !== undefined) {
    return roadAddressMatch[1].trim();
  }

  return null;
}

async function requestVworldGetCoord(
  address: string,
  apiKey: string,
  addressType: VworldAddressType,
): Promise<VworldGeocodeResult | null> {
  const abortController = new AbortController();
  const timeoutId = window.setTimeout(() => {
    abortController.abort();
  }, geocodeTimeoutMs);

  const url = new URL('https://api.vworld.kr/req/address');
  url.searchParams.set('service', 'address');
  url.searchParams.set('request', 'getcoord');
  url.searchParams.set('version', '2.0');
  url.searchParams.set('crs', 'EPSG:4326');
  url.searchParams.set('address', address);
  url.searchParams.set('refine', 'true');
  url.searchParams.set('simple', 'false');
  url.searchParams.set('format', 'json');
  url.searchParams.set('errorformat', 'json');
  url.searchParams.set('type', addressType);
  url.searchParams.set('key', apiKey);

  try {
    const payload = await requestVworldFetch(url, abortController.signal);
    return parseVworldGetCoordPayload(payload, address);
  } catch {
    try {
      const payload = await requestVworldJsonp(url);
      return parseVworldGetCoordPayload(payload, address);
    } catch {
      return null;
    }
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function requestVworldFetch(url: URL, signal: AbortSignal) {
  const response = await fetch(url, {
    signal,
  });

  if (!response.ok) {
    throw new Error('VWorld address request failed.');
  }

  return response.json() as Promise<unknown>;
}

function requestVworldJsonp(url: URL) {
  const jsonpUrl = new URL(url);
  const callbackName = `__gunpoVworldCallback_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;

  jsonpUrl.searchParams.set('callback', callbackName);

  return new Promise<unknown>((resolve, reject) => {
    const script = document.createElement('script');
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('VWorld address JSONP timeout.'));
    }, geocodeTimeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      script.remove();
      Reflect.deleteProperty(window, callbackName);
    };

    Object.defineProperty(window, callbackName, {
      configurable: true,
      value: (payload: unknown) => {
        cleanup();
        resolve(payload);
      },
    });

    script.src = jsonpUrl.toString();
    script.async = true;
    script.onerror = () => {
      cleanup();
      reject(new Error('VWorld address JSONP request failed.'));
    };

    document.head.appendChild(script);
  });
}

function parseVworldGetCoordPayload(
  payload: unknown,
  fallbackAddress: string,
): VworldGeocodeResult | null {
  const response = getObjectProperty(payload, 'response');

  if (getStringProperty(response, 'status') !== 'OK') {
    return null;
  }

  const result = getObjectProperty(response, 'result');
  const point = getObjectProperty(result, 'point');
  const longitude = Number(getStringProperty(point, 'x'));
  const latitude = Number(getStringProperty(point, 'y'));

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return null;
  }

  const resultAddress = getStringProperty(result, 'text') ?? fallbackAddress;

  return {
    title: resultAddress,
    address: resultAddress,
    geometry: {
      type: 'Point',
      coordinates: [longitude, latitude],
    },
  };
}

function getObjectProperty(value: unknown, key: string) {
  if (!isRecord(value)) {
    return null;
  }

  const property = value[key];
  return isRecord(property) ? property : null;
}

function getStringProperty(value: unknown, key: string) {
  if (!isRecord(value)) {
    return null;
  }

  const property = value[key];
  return typeof property === 'string' ? property : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
