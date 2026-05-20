'use strict';

const DEFAULT_CENTER = { lat: 18.4861, lng: -69.9312 };
const DEFAULT_ZOOM = 13;
const SEARCH_RADIUS_METERS = 1800;
const MAX_DETAILS_PER_THROW = 18;
const THROW_COOLDOWN_MS = 900;
const HISTORY_STORAGE_KEY = 'dart_business_finder_search_history_v1';

const PLACE_STATUS = {
  NEEDS_WEBSITE: 'needs_website',
  HAS_WEBSITE: 'has_website',
  UNSURE: 'unsure',
};

const STATUS_COLORS = {
  needs_website: '#ef4444',
  has_website: '#16a34a',
  unsure: '#f59e0b',
};

const NON_BUSINESS_TYPES = new Set([
  'amusement_park', 'aquarium', 'art_gallery', 'beach', 'campground', 'cemetery',
  'church', 'city_hall', 'courthouse', 'embassy', 'fire_station', 'hindu_temple',
  'library', 'local_government_office', 'mosque', 'museum', 'natural_feature',
  'park', 'parking', 'police', 'post_office', 'rv_park', 'school', 'stadium',
  'synagogue', 'tourist_attraction', 'university', 'zoo',
]);

const SOCIAL_OR_LISTING_HOSTS = [
  'instagram.com', 'facebook.com', 'fb.com', 'wa.me', 'whatsapp.com',
  'api.whatsapp.com', 'tiktok.com', 'youtube.com', 'youtu.be', 'linktr.ee',
  'maps.google.com', 'google.com', 'goo.gl', 'bit.ly', 'waze.com', 'ubereats.com',
  'doordash.com', 'grubhub.com', 'pedidosya.com', 'glovoapp.com', 'tripadvisor.com',
  'booking.com', 'airbnb.com', 'expedia.com', 'yelp.com', 'opentable.com',
  'mercadolibre.com', 'shopify.com', 'business.site', 'sites.google.com',
];

let map = null;
let placesService = null;
let geocoder = null;
let dartMarker = null;
let winnerMarker = null;
let connectorLine = null;
let scanCircle = null;
let placeMarkers = [];
let currentPlaces = [];
let lastDartPosition = null;
let lastThrowAt = 0;
let searchHistory = [];
let floatingWindowZ = 50;
let currentLocationInfo = { town: '-', city: 'Town / City', label: 'Unknown area' };

window.initMap = function () {
  map = new google.maps.Map(document.getElementById('map'), {
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    mapTypeControl: false,
    fullscreenControl: false,
    streetViewControl: false,
    clickableIcons: false,
    styles: [
      { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    ],
    zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
  });

  placesService = new google.maps.places.PlacesService(map);
  geocoder = new google.maps.Geocoder();
  searchHistory = loadSearchHistory();
  renderSearchHistory();
  updateControlStates();
  setToast('Move around the Dominican Republic, then throw.');
};

function loadSearchHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function saveSearchHistory() {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(searchHistory.slice(0, 25)));
  updateControlStates();
}

function isRealBusinessWebsite(url) {
  if (!url) return false;

  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return !SOCIAL_OR_LISTING_HOSTS.some(blocked => host === blocked || host.endsWith(`.${blocked}`));
  } catch (_error) {
    return false;
  }
}

function classifyPlace(place) {
  const types = place.types || [];
  const websiteUrl = place.website || '';
  const looksNonCommercial = types.some(type => NON_BUSINESS_TYPES.has(type));

  if (looksNonCommercial) {
    return {
      status: PLACE_STATUS.UNSURE,
      hasRealWebsite: isRealBusinessWebsite(websiteUrl),
      isLikelyBusiness: false,
      label: 'Needs a closer look',
    };
  }

  if (isRealBusinessWebsite(websiteUrl)) {
    return {
      status: PLACE_STATUS.HAS_WEBSITE,
      hasRealWebsite: true,
      isLikelyBusiness: true,
      label: 'Real dedicated website found',
    };
  }

  if (types.includes('establishment') || types.includes('store') || types.includes('restaurant') || types.includes('food')) {
    return {
      status: PLACE_STATUS.NEEDS_WEBSITE,
      hasRealWebsite: false,
      isLikelyBusiness: true,
      label: 'No real dedicated website found',
    };
  }

  return {
    status: PLACE_STATUS.UNSURE,
    hasRealWebsite: false,
    isLikelyBusiness: false,
    label: 'Needs a closer look',
  };
}

function normalizePlace(place, dartPosition) {
  const location = place.geometry?.location;
  const latitude = typeof location?.lat === 'function' ? location.lat() : location?.lat;
  const longitude = typeof location?.lng === 'function' ? location.lng() : location?.lng;
  const classification = classifyPlace(place);

  return {
    id: place.place_id || `${slugify(place.name)}-${roundCoord(latitude)}-${roundCoord(longitude)}`,
    name: place.name || 'Unnamed place',
    category: getCategory(place.types),
    address: place.formatted_address || place.vicinity || 'Address not available',
    phone: place.international_phone_number || place.formatted_phone_number || '',
    googleMapsUrl: place.url || makeGoogleMapsUrl(place.place_id),
    businessStatus: place.business_status || 'Status not available',
    latitude,
    longitude,
    websiteUrl: place.website || '',
    rating: place.rating || null,
    reviewCount: place.user_ratings_total || 0,
    distanceMeters: distanceMeters(dartPosition, { lat: latitude, lng: longitude }),
    status: classification.status,
    hasRealWebsite: classification.hasRealWebsite,
    isLikelyBusiness: classification.isLikelyBusiness,
    statusLabel: classification.label,
  };
}

function getCategory(types = []) {
  const visible = types.filter(type => !['establishment', 'point_of_interest'].includes(type));
  return (visible[0] || types[0] || 'unknown').replace(/_/g, ' ');
}

function makeGoogleMapsUrl(placeId) {
  return placeId ? `https://www.google.com/maps/place/?q=place_id:${placeId}` : '#';
}

function slugify(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function roundCoord(value) {
  return Number(value || 0).toFixed(4);
}

function distanceMeters(origin, target) {
  const toRad = degrees => degrees * Math.PI / 180;
  const lat1 = Number(origin.lat);
  const lng1 = Number(origin.lng);
  const lat2 = Number(target.lat);
  const lng2 = Number(target.lng);
  const radius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const a = sinLat * sinLat + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinLng * sinLng;
  return Math.round(radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '-';
  return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(2)} km`;
}

function randomPositionInBounds() {
  const bounds = map.getBounds();
  if (!bounds) return null;

  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const margin = 0.12;
  const latSpan = ne.lat() - sw.lat();
  const lngSpan = ne.lng() - sw.lng();

  return {
    lat: sw.lat() + latSpan * (margin + Math.random() * (1 - 2 * margin)),
    lng: sw.lng() + lngSpan * (margin + Math.random() * (1 - 2 * margin)),
  };
}

function throwDart() {
  const now = Date.now();
  if (now - lastThrowAt < THROW_COOLDOWN_MS) return;
  lastThrowAt = now;

  const position = randomPositionInBounds();
  if (!position) {
    setToast('Map is still loading. Try again in a moment.');
    return;
  }

  resetScreen({ keepToast: true });
  lastDartPosition = position;
  setThrowing(true);
  updateControlStates();
  setToast('Dart away... scanning nearby businesses.');

  dartMarker = new google.maps.Marker({
    position,
    map,
    title: 'Dart landed here',
    icon: dartIcon(),
    animation: google.maps.Animation.DROP,
    zIndex: 30,
  });

  map.panTo(position);
  startImpactAnimation(position);
  startRadar(position);

  setTimeout(() => scanNearbyPlaces(position), 450);
}

function scanNearbyPlaces(position) {
  placesService.nearbySearch({
    location: position,
    radius: SEARCH_RADIUS_METERS,
    type: 'establishment',
  }, async (results, status) => {
    const PS = google.maps.places.PlacesServiceStatus;

    if (status !== PS.OK || !results?.length) {
      finishScan();
      setToast(status === PS.ZERO_RESULTS ? 'No businesses found near this dart. Throw again.' : `Scan failed: ${status}`);
      return;
    }

    try {
      const [details, locationInfo] = await Promise.all([
        fetchPlaceDetails(results.slice(0, MAX_DETAILS_PER_THROW)),
        reverseGeocodePosition(position),
      ]);
      currentLocationInfo = locationInfo;
      currentPlaces = dedupePlaces(details.map(place => normalizePlace(place, position)))
        .filter(place => Number.isFinite(place.latitude) && Number.isFinite(place.longitude))
        .sort((a, b) => a.distanceMeters - b.distanceMeters);

      renderPlaceDots(currentPlaces);
      renderLocationInfo(currentLocationInfo);
      renderStats(currentPlaces);
      renderScanCircle(position);
      focusThrow(position, currentPlaces);

      const winner = pickWinner(currentPlaces);
      if (winner) {
        revealWinner(position, winner, { saveHistory: true });
      } else {
        setToast('No usable place details came back. Try a denser area.');
      }
    } catch (error) {
      console.error(error);
      setToast('Something went wrong while scanning. Try again.');
    } finally {
      finishScan();
    }
  });
}

function fetchPlaceDetails(places) {
  const fields = [
    'place_id', 'name', 'types', 'geometry', 'formatted_address', 'vicinity',
    'website', 'url', 'rating', 'user_ratings_total', 'formatted_phone_number',
    'international_phone_number', 'business_status',
  ];

  return Promise.all(places.map(place => new Promise(resolve => {
    placesService.getDetails({ placeId: place.place_id, fields }, (detail, status) => {
      resolve(status === google.maps.places.PlacesServiceStatus.OK && detail ? detail : place);
    });
  })));
}

function reverseGeocodePosition(position) {
  if (!geocoder) return Promise.resolve({ town: '-', city: 'Town / City', label: 'Unknown area' });

  return new Promise(resolve => {
    geocoder.geocode({ location: position }, (results, status) => {
      if (status !== 'OK' || !results?.length) {
        resolve({ town: '-', city: 'Town / City', label: 'Unknown area' });
        return;
      }

      const components = results.flatMap(result => result.address_components || []);
      const town = findAddressComponent(components, [
        'neighborhood', 'sublocality', 'sublocality_level_1', 'locality',
      ]) || 'Nearby area';
      let city = findAddressComponent(components, ['administrative_area_level_2'])
        || findAddressComponent(components, ['locality'])
        || findAddressComponent(components, ['administrative_area_level_1'])
        || 'Dominican Republic';

      if (city === town) {
        city = findAddressComponent(components, ['administrative_area_level_1']) || 'Dominican Republic';
      }

      resolve({
        town,
        city,
        label: town === city ? city : `${town}, ${city}`,
      });
    });
  });
}

function findAddressComponent(components, types) {
  const component = components.find(item => types.some(type => item.types.includes(type)));
  return component?.long_name || '';
}

function dedupePlaces(places) {
  const seen = new Set();
  return places.filter(place => {
    const key = place.id || `${place.name}-${roundCoord(place.latitude)}-${roundCoord(place.longitude)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickWinner(places) {
  const likelyWithoutWebsite = places.filter(place => place.isLikelyBusiness && place.status === PLACE_STATUS.NEEDS_WEBSITE);
  if (likelyWithoutWebsite.length) return likelyWithoutWebsite[0];

  const likelyBusiness = places.filter(place => place.isLikelyBusiness);
  if (likelyBusiness.length) return likelyBusiness[0];

  return places[0] || null;
}

function renderPlaceDots(places) {
  clearPlaceMarkers();

  places.forEach((place, index) => {
    const marker = new google.maps.Marker({
      position: { lat: place.latitude, lng: place.longitude },
      map,
      title: place.name,
      icon: dotIcon(STATUS_COLORS[place.status], 8),
      opacity: 0,
      zIndex: place.status === PLACE_STATUS.NEEDS_WEBSITE ? 14 : 10,
    });

    marker.addListener('click', () => showPreviewCard(place));
    placeMarkers.push(marker);
    setTimeout(() => marker.setOpacity(0.92), 70 * index);
  });
}

function renderStats(places) {
  const stats = calculateStats(places);

  setText('business-summary', `${stats.nearbyCount} scanned`);
  setText('business-breakdown', `${stats.needsCount} need site / ${stats.hasCount} found`);
  setText('gap-percent', `${stats.websiteGap}%`);
  setText('gap-detail', `${stats.needsCount} of ${stats.nearbyCount} without a real website`);
  document.getElementById('stats-strip').classList.remove('idle');
}

function renderLocationInfo(locationInfo) {
  setText('location-town', locationInfo?.town || '-');
  setText('location-city', locationInfo?.city || 'Town / City');
}

function revealWinner(dartPosition, place, options = {}) {
  if (!place) return;

  if (winnerMarker) winnerMarker.setMap(null);
  if (connectorLine) connectorLine.setMap(null);

  winnerMarker = new google.maps.Marker({
    position: { lat: place.latitude, lng: place.longitude },
    map,
    title: place.name,
    icon: dotIcon(STATUS_COLORS[place.status], 15),
    animation: google.maps.Animation.BOUNCE,
    zIndex: 40,
  });
  setTimeout(() => { if (winnerMarker) winnerMarker.setAnimation(null); }, 1800);

  connectorLine = new google.maps.Polyline({
    path: [dartPosition, { lat: place.latitude, lng: place.longitude }],
    geodesic: true,
    strokeColor: STATUS_COLORS[place.status],
    strokeOpacity: 0.86,
    strokeWeight: 3,
    map,
  });

  renderWinnerCard(place);
  if (options.saveHistory) saveCurrentSearch(place);
  if (options.confetti !== false) launchConfetti();
  setToast(place.status === PLACE_STATUS.NEEDS_WEBSITE ? 'Winner revealed: no real dedicated website found.' : 'Winner revealed.');
}

function renderWinnerCard(place) {
  setText('winner-kicker', 'Winner Revealed');
  setText('winner-name', place.name);
  setText('winner-category', titleCase(place.category));
  setText('winner-distance', formatDistance(place.distanceMeters));
  setText('winner-rating', formatRating(place));
  setText('winner-phone', place.phone || 'Not listed');
  setText('winner-business-status', titleCase(place.businessStatus.replace(/_/g, ' ').toLowerCase()));
  setText('winner-reviews', place.reviewCount ? place.reviewCount.toLocaleString() : 'No reviews listed');
  setText('winner-address', place.address);
  setActionLink('winner-google-link', place.googleMapsUrl, 'Open in Google Maps', false);
  setActionLink('winner-website-link', place.websiteUrl, place.websiteUrl ? 'Open Website' : 'No website link', !place.websiteUrl);

  const badge = document.getElementById('website-badge');
  badge.className = 'website-badge';

  if (place.status === PLACE_STATUS.HAS_WEBSITE) {
    badge.classList.add('has');
    badge.textContent = 'Real dedicated website found';
  } else if (place.status === PLACE_STATUS.NEEDS_WEBSITE) {
    badge.classList.add('needs');
    badge.textContent = 'No real dedicated website found';
  } else {
    badge.classList.add('unknown');
    badge.textContent = 'Needs a closer look';
  }

  const card = document.getElementById('winner-card');
  bringWindowToFront(card);
  card.classList.remove('hidden', 'revealed');
  void card.offsetWidth;
  card.classList.add('revealed');
}

function showPreviewCard(place) {
  if (!place) return;

  setText('preview-name', place.name);
  setText('preview-category', titleCase(place.category));
  setText('preview-distance', formatDistance(place.distanceMeters));
  setText('preview-rating', formatRating(place));
  setText('preview-address', place.address);
  setActionLink('preview-google-link', place.googleMapsUrl, 'Open in Google Maps', false);
  setActionLink('preview-website-link', place.websiteUrl, place.websiteUrl ? 'Open Website' : 'No website link', !place.websiteUrl);

  const badge = document.getElementById('preview-badge');
  badge.className = 'website-badge';
  if (place.status === PLACE_STATUS.HAS_WEBSITE) {
    badge.classList.add('has');
    badge.textContent = 'Real dedicated website found';
  } else if (place.status === PLACE_STATUS.NEEDS_WEBSITE) {
    badge.classList.add('needs');
    badge.textContent = 'No real dedicated website found';
  } else {
    badge.classList.add('unknown');
    badge.textContent = 'Needs a closer look';
  }

  const card = document.getElementById('preview-card');
  bringWindowToFront(card);
  card.classList.remove('hidden', 'revealed');
  void card.offsetWidth;
  card.classList.add('revealed');
  setToast('Preview opened. Winner stays unchanged.');
}

function hideWinnerCard() {
  const card = document.getElementById('winner-card');
  card.classList.remove('revealed');
  card.classList.add('hidden');
}

function hidePreviewCard() {
  const card = document.getElementById('preview-card');
  card.classList.remove('revealed');
  card.classList.add('hidden');
}

function renderScanCircle(position) {
  if (scanCircle) scanCircle.setMap(null);

  scanCircle = new google.maps.Circle({
    center: position,
    radius: SEARCH_RADIUS_METERS,
    map,
    clickable: false,
    strokeColor: '#2563eb',
    strokeOpacity: 0.55,
    strokeWeight: 2,
    fillColor: '#2563eb',
    fillOpacity: 0.12,
    zIndex: 3,
  });
}

function saveCurrentSearch(winner) {
  if (!lastDartPosition || !currentPlaces.length) return;

  const stats = calculateStats(currentPlaces);
  const entry = {
    id: `${Date.now()}-${winner.id}`,
    createdAt: new Date().toISOString(),
    dartPosition: lastDartPosition,
    winnerId: winner.id,
    winner,
    places: currentPlaces,
    stats,
    locationInfo: currentLocationInfo,
  };

  searchHistory = [entry, ...searchHistory.filter(item => item.id !== entry.id)].slice(0, 25);
  saveSearchHistory();
  renderSearchHistory();
}

function calculateStats(places) {
  const likelyBusinesses = places.filter(place => place.isLikelyBusiness);
  const needsWebsite = likelyBusinesses.filter(place => place.status === PLACE_STATUS.NEEDS_WEBSITE);
  const hasWebsite = likelyBusinesses.filter(place => place.status === PLACE_STATUS.HAS_WEBSITE);
  const websiteGap = likelyBusinesses.length ? Math.round((needsWebsite.length / likelyBusinesses.length) * 100) : 0;

  return {
    nearbyCount: likelyBusinesses.length || places.length,
    websiteGap,
    needsCount: needsWebsite.length,
    hasCount: hasWebsite.length,
  };
}

function renderSearchHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;

  if (!searchHistory.length) {
    list.innerHTML = '<p class="history-empty">No searches yet. Throw a dart to create one.</p>';
    return;
  }

  list.innerHTML = searchHistory.map(entry => {
    const date = new Date(entry.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const status = entry.winner?.status || PLACE_STATUS.UNSURE;
    const stats = entry.stats || calculateStats(entry.places || []);
    const locationLabel = entry.locationInfo?.label || entry.locationInfo?.city || 'Unknown area';
    return `
      <button class="history-item ${status}" type="button" data-history-id="${escapeAttr(entry.id)}">
        <strong>${escapeHtml(entry.winner?.name || 'Unknown winner')}</strong>
        <span>${escapeHtml(locationLabel)}</span>
        <span>${date} | ${stats.nearbyCount} nearby | ${stats.websiteGap}% gap</span>
      </button>
    `;
  }).join('');
}

function hasActiveSearch() {
  return Boolean(lastDartPosition || currentPlaces.length || dartMarker || winnerMarker || scanCircle || connectorLine || placeMarkers.length);
}

function updateControlStates() {
  const resetButton = document.getElementById('reset-btn');
  const historyButton = document.getElementById('history-btn');
  if (resetButton) resetButton.disabled = !hasActiveSearch();
  if (historyButton) historyButton.disabled = searchHistory.length === 0;
}

function hideHistoryPanel() {
  document.getElementById('history-panel').classList.add('hidden');
}

function restoreSearch(entryId) {
  const entry = searchHistory.find(item => item.id === entryId);
  if (!entry) return;

  resetScreen({ keepToast: true, keepHistoryOpen: true });
  lastDartPosition = entry.dartPosition;
  currentPlaces = entry.places || [];
  currentLocationInfo = entry.locationInfo || { town: '-', city: 'Town / City', label: 'Unknown area' };

  dartMarker = new google.maps.Marker({
    position: lastDartPosition,
    map,
    title: 'Dart landed here',
    icon: dartIcon(),
    zIndex: 30,
  });

  renderScanCircle(lastDartPosition);
  renderPlaceDots(currentPlaces);
  renderLocationInfo(currentLocationInfo);
  renderStats(currentPlaces);
  focusThrow(lastDartPosition, currentPlaces);
  revealWinner(lastDartPosition, entry.winner, { saveHistory: false, confetti: false });
  updateControlStates();
  setToast('Search restored from history.');
}

function bringWindowToFront(windowElement) {
  if (!windowElement) return;
  floatingWindowZ += 1;
  windowElement.style.zIndex = String(floatingWindowZ);
}

function initializeDraggableWindows() {
  document.querySelectorAll('.draggable-window').forEach(windowElement => {
    windowElement.addEventListener('pointerdown', () => bringWindowToFront(windowElement));

    const handle = windowElement.querySelector('[data-drag-handle]');
    if (!handle) return;

    handle.addEventListener('pointerdown', event => {
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      bringWindowToFront(windowElement);
      prepareWindowForDragging(windowElement);

      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = Number.parseFloat(windowElement.style.left) || windowElement.getBoundingClientRect().left;
      const startTop = Number.parseFloat(windowElement.style.top) || windowElement.getBoundingClientRect().top;

      windowElement.classList.add('is-dragging');
      handle.setPointerCapture(event.pointerId);

      const onPointerMove = moveEvent => {
        const nextLeft = startLeft + moveEvent.clientX - startX;
        const nextTop = startTop + moveEvent.clientY - startY;
        positionWindow(windowElement, nextLeft, nextTop);
      };

      const onPointerUp = () => {
        windowElement.classList.remove('is-dragging');
        handle.removeEventListener('pointermove', onPointerMove);
        handle.removeEventListener('pointerup', onPointerUp);
        handle.removeEventListener('pointercancel', onPointerUp);
      };

      handle.addEventListener('pointermove', onPointerMove);
      handle.addEventListener('pointerup', onPointerUp);
      handle.addEventListener('pointercancel', onPointerUp);
    });
  });

  window.addEventListener('resize', () => {
    document.querySelectorAll('.draggable-window.drag-positioned').forEach(windowElement => {
      positionWindow(windowElement, Number.parseFloat(windowElement.style.left) || 0, Number.parseFloat(windowElement.style.top) || 0);
    });
  });
}

function prepareWindowForDragging(windowElement) {
  const rect = windowElement.getBoundingClientRect();
  windowElement.classList.add('drag-positioned');
  windowElement.style.left = `${rect.left}px`;
  windowElement.style.top = `${rect.top}px`;
  windowElement.style.right = 'auto';
  windowElement.style.bottom = 'auto';
}

function positionWindow(windowElement, left, top) {
  const rect = windowElement.getBoundingClientRect();
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
  const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
  const nextLeft = Math.min(Math.max(left, margin), maxLeft);
  const nextTop = Math.min(Math.max(top, margin), maxTop);

  windowElement.style.left = `${nextLeft}px`;
  windowElement.style.top = `${nextTop}px`;
}

function setActionLink(id, href, label, disabled) {
  const link = document.getElementById(id);
  link.textContent = label;
  link.href = disabled ? '#' : href;
  link.classList.toggle('disabled', disabled);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function escapeAttr(value = '') {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function launchConfetti() {
  const layer = document.getElementById('confetti-layer');
  layer.innerHTML = '';
  const colors = ['#16a34a', '#22c55e', '#facc15', '#ef4444', '#0ea5e9', '#ffffff'];

  for (let index = 0; index < 44; index += 1) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.setProperty('--x', `${Math.random() * 100}vw`);
    piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 170}px`);
    piece.style.setProperty('--spin', `${Math.random() * 720 - 360}deg`);
    piece.style.setProperty('--delay', `${Math.random() * 0.18}s`);
    piece.style.setProperty('--duration', `${1.55 + Math.random() * 0.85}s`);
    piece.style.background = colors[index % colors.length];
    layer.appendChild(piece);
  }

  setTimeout(() => { layer.innerHTML = ''; }, 2800);
}

function focusThrow(position, places) {
  const bounds = new google.maps.LatLngBounds();
  bounds.extend(position);
  places.forEach(place => bounds.extend({ lat: place.latitude, lng: place.longitude }));
  map.fitBounds(bounds, { top: 210, right: 460, bottom: 150, left: 90 });
}

function startRadar(position) {
  const point = projectionPoint(position);
  const layer = document.getElementById('radar-layer');
  if (point) {
    layer.style.setProperty('--scan-x', `${point.x}px`);
    layer.style.setProperty('--scan-y', `${point.y}px`);
  }
  layer.classList.add('active');
}

function stopRadar() {
  document.getElementById('radar-layer').classList.remove('active');
}

function startImpactAnimation(position) {
  const point = projectionPoint(position);
  if (!point) return;

  const pulse = document.createElement('div');
  pulse.className = 'impact-pulse';
  pulse.style.setProperty('--impact-x', `${point.x}px`);
  pulse.style.setProperty('--impact-y', `${point.y}px`);
  document.getElementById('impact-layer').appendChild(pulse);
  document.body.classList.add('impact-shake');

  setTimeout(() => {
    pulse.remove();
    document.body.classList.remove('impact-shake');
  }, 920);
}

function projectionPoint(position) {
  if (!map) return null;

  const projection = map.getProjection();
  const bounds = map.getBounds();
  if (!projection || !bounds) return null;

  const scale = 2 ** map.getZoom();
  const worldPoint = projection.fromLatLngToPoint(new google.maps.LatLng(position.lat, position.lng));
  const northEast = projection.fromLatLngToPoint(bounds.getNorthEast());
  const southWest = projection.fromLatLngToPoint(bounds.getSouthWest());

  return {
    x: (worldPoint.x - southWest.x) * scale,
    y: (worldPoint.y - northEast.y) * scale,
  };
}

function finishScan() {
  setThrowing(false);
  stopRadar();
}

function setThrowing(isThrowing) {
  const button = document.getElementById('throw-btn');
  button.disabled = isThrowing;
  button.classList.toggle('throwing', isThrowing);
  button.querySelector('.throw-label').textContent = isThrowing ? 'Scanning...' : 'Throw Dart';
}

function resetScreen(options = {}) {
  if (dartMarker) dartMarker.setMap(null);
  if (winnerMarker) winnerMarker.setMap(null);
  if (connectorLine) connectorLine.setMap(null);
  if (scanCircle) scanCircle.setMap(null);
  clearPlaceMarkers();

  dartMarker = null;
  winnerMarker = null;
  connectorLine = null;
  scanCircle = null;
  currentPlaces = [];
  currentLocationInfo = { town: '-', city: 'Town / City', label: 'Unknown area' };
  lastDartPosition = null;
  stopRadar();
  setThrowing(false);

  renderLocationInfo(currentLocationInfo);
  setText('business-summary', '0 scanned');
  setText('business-breakdown', '0 need site / 0 found');
  setText('gap-percent', '0%');
  setText('gap-detail', 'Website Gap');
  document.getElementById('stats-strip').classList.add('idle');
  const winnerCard = document.getElementById('winner-card');
  winnerCard.classList.remove('revealed');
  winnerCard.classList.add('hidden');
  hidePreviewCard();
  resetWinnerCardContent();
  document.getElementById('impact-layer').innerHTML = '';
  document.getElementById('confetti-layer').innerHTML = '';
  document.body.classList.remove('impact-shake');
  updateControlStates();

  if (!options.keepToast) setToast('Screen cleared. Throw again when ready.');
}

function clearPlaceMarkers() {
  placeMarkers.forEach(marker => marker.setMap(null));
  placeMarkers = [];
}

function resetWinnerCardContent() {
  setText('winner-kicker', 'Winner Revealed');
  setText('winner-name', 'Throw a dart to find a business');
  setText('winner-category', '-');
  setText('winner-distance', '-');
  setText('winner-rating', '-');
  setText('winner-phone', '-');
  setText('winner-business-status', '-');
  setText('winner-reviews', '-');
  setText('winner-address', '-');

  const badge = document.getElementById('website-badge');
  badge.className = 'website-badge unknown';
  badge.textContent = 'Waiting for scan';
  setActionLink('winner-google-link', '#', 'Open in Google Maps', true);
  setActionLink('winner-website-link', '#', 'No website link', true);
}

function setToast(message) {
  const toast = document.getElementById('status-toast');
  toast.textContent = message;
  toast.classList.remove('quiet');

  clearTimeout(setToast.timer);
  setToast.timer = setTimeout(() => toast.classList.add('quiet'), 3600);
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function formatRating(place) {
  if (!place.rating) return 'No rating yet';
  const reviews = place.reviewCount ? ` (${place.reviewCount.toLocaleString()} reviews)` : '';
  return `${Number(place.rating).toFixed(1)} stars${reviews}`;
}

function titleCase(value = '') {
  return value.replace(/\b\w/g, letter => letter.toUpperCase());
}

function dartIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="54" height="54" viewBox="0 0 54 54">
    <circle cx="27" cy="27" r="24" fill="#ef4444" stroke="#991b1b" stroke-width="3"/>
    <circle cx="27" cy="27" r="16" fill="white"/>
    <circle cx="27" cy="27" r="9" fill="#ef4444"/>
    <circle cx="27" cy="27" r="4" fill="#991b1b"/>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(54, 54),
    anchor: new google.maps.Point(27, 27),
  };
}

function dotIcon(color, scale) {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 0.96,
    strokeColor: '#ffffff',
    strokeWeight: 2.5,
    scale,
  };
}

document.getElementById('throw-btn').addEventListener('click', throwDart);
document.getElementById('reset-btn').addEventListener('click', () => resetScreen());
document.getElementById('history-btn').addEventListener('click', () => {
  if (!searchHistory.length) return;
  renderSearchHistory();
  const historyPanel = document.getElementById('history-panel');
  bringWindowToFront(historyPanel);
  historyPanel.classList.remove('hidden');
});
document.querySelectorAll('.card-close').forEach(button => {
  button.addEventListener('pointerdown', event => event.stopPropagation());
});
document.getElementById('close-history-panel').addEventListener('click', hideHistoryPanel);
document.getElementById('close-winner-card').addEventListener('click', hideWinnerCard);
document.getElementById('close-preview-card').addEventListener('click', hidePreviewCard);
document.getElementById('history-list').addEventListener('click', event => {
  const button = event.target.closest('button[data-history-id]');
  if (button) restoreSearch(button.dataset.historyId);
});
initializeDraggableWindows();

(function bootstrap() {
  if (typeof GOOGLE_MAPS_API_KEY === 'undefined' || GOOGLE_MAPS_API_KEY === 'YOUR_API_KEY_HERE') {
    document.body.innerHTML = `
      <div id="setup-error">
        <h1>Google Maps API key needed</h1>
        <p>Open <code>config.js</code> and add a key with Maps JavaScript API and Places API enabled.</p>
      </div>`;
    return;
  }

  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&libraries=places&loading=async&callback=initMap`;
  script.async = true;
  script.defer = true;
  script.onerror = () => setToast('Failed to load Google Maps. Check config.js and your connection.');
  document.head.appendChild(script);
}());
