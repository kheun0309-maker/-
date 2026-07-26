/** 브라우저 위치 · 가이드 명소까지 거리 (코파일럿 / 지도 공유) */

/** @type {{ id: string, name: string, lat: number, lng: number, note: string }[]} */
export const GUIDE_PLACES = [
  { id: 'airport', name: 'KKIA 공항', lat: 5.9372, lng: 116.0513, note: '도착·출발' },
  { id: 'resort', name: '샹그릴라 라사 리아', lat: 6.15377, lng: 116.14823, note: '숙소 · 투아란' },
  { id: 'jetty', name: '호핑 선착장 (South Jetty)', lat: 5.9958, lng: 116.0789, note: 'Jesselton Quay' },
  { id: 'gaya', name: '가야 스트리트', lat: 5.98395, lng: 116.07721, note: '시내·쇼핑' },
  { id: 'seafood', name: '웰컴/쌍천 씨푸드 일대', lat: 5.9748, lng: 116.0718, note: 'Asia City · 해산물' },
  { id: 'napzone', name: 'Napzone KKIA', lat: 5.9385, lng: 116.0505, note: '공항 캡슐' },
  { id: 'manukan', name: '마누칸 섬', lat: 5.9745, lng: 115.9995, note: '호핑' },
  { id: 'warisan', name: 'Warisan Square', lat: 5.9786, lng: 116.0728, note: '마사지·시내' },
  { id: 'imago', name: 'Imago 쇼핑몰', lat: 5.9782, lng: 116.0765, note: '쇼핑·식사' }
];

/** @type {{ lat: number, lng: number, accuracyM: number, at: number } | null} */
let lastFix = null;

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function rememberLocation(lat, lng, accuracyM = 0) {
  lastFix = {
    lat: Number(lat),
    lng: Number(lng),
    accuracyM: Number(accuracyM) || 0,
    at: Date.now()
  };
  return lastFix;
}

export function getCachedLocation(maxAgeMs = 5 * 60 * 1000) {
  if (!lastFix) return null;
  if (Date.now() - lastFix.at > maxAgeMs) return null;
  return lastFix;
}

export function nearbyGuidePlaces(lat, lng, limit = 8) {
  return GUIDE_PLACES
    .map((p) => ({
      id: p.id,
      name: p.name,
      note: p.note,
      lat: p.lat,
      lng: p.lng,
      distanceKm: Math.round(haversineKm(lat, lng, p.lat, p.lng) * 10) / 10,
      mapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${p.lat},${p.lng}&travelmode=driving`
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

function geoErrorMessage(err) {
  const code = err?.code;
  if (code === 1) {
    return '위치 권한이 거부되었어요. 브라우저/OS 설정에서 이 사이트 위치를 허용한 뒤 다시 요청해 주세요.';
  }
  if (code === 2) return '위치를 가져올 수 없어요. GPS·네트워크를 확인한 뒤 다시 시도해 주세요.';
  if (code === 3) return '위치 확인 시간이 초과되었어요. 야외·와이파이에서 다시 시도해 주세요.';
  return err?.message || '위치를 가져오지 못했어요.';
}

/**
 * 현재 위치 조회 (캐시 허용). 지도 「내 위치」와 캐시를 공유합니다.
 * @param {{ force?: boolean, maxAgeMs?: number }} [opts]
 */
export function getMyLocation(opts = {}) {
  const force = Boolean(opts.force);
  const maxAgeMs = Number.isFinite(opts.maxAgeMs) ? opts.maxAgeMs : 5 * 60 * 1000;

  if (!force) {
    const cached = getCachedLocation(maxAgeMs);
    if (cached) {
      return Promise.resolve(buildLocationPayload(cached, true));
    }
  }

  if (!navigator.geolocation) {
    return Promise.resolve({
      ok: false,
      error: '이 브라우저는 위치 기능을 지원하지 않아요.',
      howTo: '위치 가능한 기기·Chrome에서 열어 주세요.'
    });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const fix = rememberLocation(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy
        );
        resolve(buildLocationPayload(fix, false));
      },
      (err) => {
        resolve({
          ok: false,
          error: geoErrorMessage(err),
          howTo: '지도 섹션의 「내 위치」를 눌러 권한을 허용한 뒤, 코파일럿에 다시 말해 주세요.',
          permissionDenied: err?.code === 1
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: force ? 0 : Math.min(maxAgeMs, 60000)
      }
    );
  });
}

function buildLocationPayload(fix, fromCache) {
  const nearby = nearbyGuidePlaces(fix.lat, fix.lng, 8);
  const closest = nearby[0];
  return {
    ok: true,
    fromCache,
    lat: fix.lat,
    lng: fix.lng,
    accuracyM: Math.round(fix.accuracyM || 0),
    ageSec: Math.round((Date.now() - fix.at) / 1000),
    mapsUrl: `https://www.google.com/maps?q=${fix.lat},${fix.lng}`,
    closestGuidePlace: closest
      ? { name: closest.name, distanceKm: closest.distanceKm, note: closest.note }
      : null,
    nearbyGuidePlaces: nearby,
    usageHint:
      '가까운 맛집/일정이면 이 좌표 기준으로 web_search(예: restaurants near <lat>,<lng> Kota Kinabalu) 후 get_guide_section(food)·propose_content_change·propose_itinerary_change로 제안하세요. 거리는 직선 대략값입니다.'
  };
}

/** 인라인 지도 스크립트와 캐시 공유 */
export function initGeoApi() {
  window.kkGeo = {
    rememberLocation,
    getCachedLocation,
    getMyLocation,
    nearbyGuidePlaces,
    GUIDE_PLACES
  };
}
