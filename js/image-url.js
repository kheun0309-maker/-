/** 이미지 URL 정규화 · 앱 내장 사진 목록 (Storage 없이 URL/`./images`만 사용) */

export const LOCAL_IMAGES = [
  { label: '공항', url: './images/kkia-airport.jpg', keys: ['공항', 'airport', 'kkia', 'napzone', '에어로포드', 'aeropod'] },
  { label: '노을1', url: './images/kk-sunset.jpg', keys: ['노을', '석양', 'sunset'] },
  { label: '노을2', url: './images/kk-sunset-2.jpg', keys: ['파라솔', '수평선'] },
  { label: '노을3', url: './images/kk-sunset-3.jpg', keys: ['야자수', '보라'] },
  { label: '노을4', url: './images/kk-sunset-4.jpg', keys: ['바다', '석양'] },
  { label: '노을5', url: './images/kk-sunset-5.jpg', keys: ['보트', '석양'] },
  { label: '노을6', url: './images/kk-kk.jpg', keys: ['야자수', '실루엣', '노을', '석양', 'kk-kk'] },
  { label: '탄중아루', url: './images/tanjung-aru-islands.jpg', keys: ['탄중', 'tanjung'] },
  { label: '마누칸', url: './images/manukan-beach.jpg', keys: ['마누칸', 'manukan', '호핑', '섬', 'island', '스노클'] },
  { label: '섬전경', url: './images/kk-islands.jpg', keys: ['섬전경', 'islands', '호핑'] },
  { label: '맹그로브', url: './images/mangrove-boat.jpg', keys: ['맹그로브', '반딧불이', 'firefly', 'mangrove'] },
  { label: '가야마켓', url: './images/gaya-market.jpg', keys: ['가야', 'gaya', '시장', '마켓', '쇼핑', '필리피노'] },
  { label: '키나발루산', url: './images/mount-kinabalu.jpg', keys: ['키나발루', 'kinabalu', '산'] },
  { label: '보트', url: './images/kk-tanjung-boat.jpg', keys: ['보트', 'boat', '제티', 'jetty'] },
  { label: '해양액티비티', url: './images/kk-sea-activity.jpg', keys: ['패러', '씨워킹', '바나나', '액티비티', '제트', 'parasail', 'sea walking'] },
  { label: '마누칸선착장', url: './images/manukan-jetty.jpg', keys: ['선착장', 'jetty', '제셀턴', 'jesselton'] },
  { label: '마누칸뷰', url: './images/manukan-view.jpg', keys: ['마누칸뷰', '전망'] },
  { label: '마무틱·술룩', url: './images/mamutik-sulug.jpg', keys: ['마무틱', '술룩', 'mamutik', 'sulug'] },
  { label: '제트스키', url: './images/kk-jetski.jpg', keys: ['제트스키', 'jetski', 'jet ski'] },
  { label: '셔틀', url: './images/rasa-ria-shuttle.jpg', keys: ['셔틀', 'shuttle', '리조트', '라사', 'rasa'] }
];

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 공유 페이지 링크를 img에서 쓸 수 있는 직접 주소로 변환 */
export function normalizeImageUrl(raw) {
  const input = String(raw || '').trim();
  if (!input) return '';
  let url = input.replace(/^<|>$/g, '').trim().slice(0, 500);

  if (url.startsWith('./') || url.startsWith('../') || url.startsWith('/')) return url;

  const driveFile = url.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (driveFile) {
    return `https://drive.google.com/uc?export=view&id=${driveFile[1]}`;
  }
  const driveOpen = url.match(/drive\.google\.com\/open\?[^#]*id=([^&]+)/i);
  if (driveOpen) {
    return `https://drive.google.com/uc?export=view&id=${decodeURIComponent(driveOpen[1])}`;
  }
  const driveUc = url.match(/drive\.google\.com\/uc\?[^#]*id=([^&]+)/i);
  if (driveUc && !/export=/i.test(url)) {
    return `https://drive.google.com/uc?export=view&id=${decodeURIComponent(driveUc[1])}`;
  }

  if (/dropbox\.com\//i.test(url)) {
    url = url.replace(/([?&])dl=0/, '$1dl=1');
    if (!/[?&]dl=/.test(url) && !/[?&]raw=/.test(url)) {
      url += (url.includes('?') ? '&' : '?') + 'raw=1';
    }
  }

  if (/^https:\/\//i.test(url) || /^http:\/\//i.test(url)) return url;
  return '';
}

/** 지도·예약·후기 등 '페이지' 주소인지 (img src로 쓰면 깨짐) */
export function isWebpageNotImage(url) {
  const u = String(url || '').trim();
  if (!u) return false;
  if (u.startsWith('./') || u.startsWith('/') || u.startsWith('../')) return false;
  if (/\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i.test(u)) return false;
  if (/drive\.google\.com\/uc\?/i.test(u)) return false;
  if (/upload\.wikimedia\.org|images\.unsplash\.com|plus\.unsplash\.com|i\.imgur\.com|googleusercontent\.com|ggpht\.com|cloudinary\.com|firebasestorage\.googleapis\.com/i.test(u)) {
    return false;
  }
  if (/google\.[^/]+\/(maps|search|url)|maps\.app\.goo\.gl|booking\.com|tripadvisor\.|kkday\.com|klook\.com|facebook\.com|instagram\.com|youtube\.com|youtu\.be|naver\.com|blog\.|tistory\.|triple\.guide/i.test(u)) {
    return true;
  }
  if (/\.(html?|php|aspx?)(\?|#|$)/i.test(u)) return true;
  if (/\/(en|ko|zh)\/?$/i.test(u) && !/\.(jpe?g|png|gif|webp)/i.test(u)) return true;
  return false;
}

export function listLocalImages() {
  return LOCAL_IMAGES.map(({ label, url, keys }) => ({ label, url, keys: keys.slice(0, 6) }));
}

export function pickLocalImage(hint) {
  const h = String(hint || '').toLowerCase();
  if (!h) return '';
  let best = null;
  let bestScore = 0;
  for (const img of LOCAL_IMAGES) {
    let score = 0;
    for (const key of img.keys) {
      if (h.includes(String(key).toLowerCase())) score += key.length >= 3 ? 2 : 1;
    }
    if (h.includes(img.label.toLowerCase())) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = img.url;
    }
  }
  return bestScore > 0 ? best : '';
}

/**
 * AI/사용자 imageUrl을 안전하게 정리.
 * 페이지 URL이면 앱 사진으로 대체하거나 비움.
 */
export function resolveAiImageUrl(raw, hint = '') {
  const rejected = String(raw || '').trim();
  let url = normalizeImageUrl(rejected);
  const hintText = [hint, rejected].filter(Boolean).join(' ');

  if (url && isWebpageNotImage(url)) {
    const local = pickLocalImage(hintText);
    return {
      url: local || '',
      warning: local
        ? `페이지 주소는 사진으로 쓸 수 없어 앱 사진(${local})으로 바꿨어요.`
        : '페이지 주소(지도·예약·후기 등)는 사진 URL이 아니어서 비웠어요. ./images/... 또는 .jpg/.png 직접 주소를 주세요.',
      rejected
    };
  }

  if (!url) {
    const local = pickLocalImage(hint);
    if (local) {
      return {
        url: local,
        warning: `직접 이미지 URL이 없어 앱 사진(${local})을 골랐어요.`,
        rejected: rejected || ''
      };
    }
  }

  return { url, warning: '', rejected: '' };
}

export function photoBlockHtml(url, alt = '', wrapClass = 'card-photo-wrap') {
  const src = normalizeImageUrl(url);
  if (!src) return '';
  return `
    <div class="${wrapClass}">
      <img class="card-photo" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer"
        onerror="var p=this.parentElement;if(p)p.classList.add('is-broken')">
      <div class="itin-photo-fail">이미지를 불러오지 못했어요. 앱 사진(./images/…) 또는 직접 이미지 주소(.jpg/.png)를 써 주세요.</div>
    </div>`;
}
