'use strict';

const DEFAULT_CENTER = { lat: 18.4861, lng: -69.9312 };
const DEFAULT_ZOOM = 13;
const SEARCH_RADIUS_METERS = 1800;
const MAX_DETAILS_PER_THROW = 18;
const MAX_AUTO_THROW_ATTEMPTS = 40;
const MIN_GOOGLE_REVIEWS_FOR_WINNER = 5;
const THROW_COOLDOWN_MS = 900;
const HISTORY_STORAGE_KEY = 'dart_business_finder_search_history_v1';
const AREA_SELECTION_HISTORY_KEY = 'dart_business_finder_area_selection_history_v1';
const MAX_AREA_SELECTION_HISTORY = 10;
const DEFAULT_BOUNDARY_RADIUS_MILES = 25;
const MILES_TO_METERS = 1609.344;

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

const RESIDENTIAL_OR_PRIVATE_TYPES = new Set([
  'apartment_complex', 'lodging', 'premise', 'subpremise', 'residential', 'street_address',
  'route', 'intersection', 'plus_code',
]);

const COMMERCIAL_TYPES = new Set([
  'accounting', 'bakery', 'bank', 'bar', 'beauty_salon', 'cafe', 'car_dealer', 'car_rental',
  'car_repair', 'car_wash', 'clothing_store', 'convenience_store', 'dentist', 'doctor',
  'drugstore', 'electrician', 'electronics_store', 'finance', 'florist', 'food',
  'furniture_store', 'gas_station', 'general_contractor', 'grocery_or_supermarket', 'gym',
  'hair_care', 'hardware_store', 'health', 'home_goods_store', 'insurance_agency', 'jewelry_store',
  'lawyer', 'meal_delivery', 'meal_takeaway', 'moving_company', 'painter', 'pet_store',
  'pharmacy', 'physiotherapist', 'plumber', 'real_estate_agency', 'restaurant', 'roofing_contractor',
  'shoe_store', 'shopping_mall', 'spa', 'storage', 'store', 'supermarket', 'travel_agency',
  'veterinary_care',
]);

const NON_BUSINESS_NAME_PATTERNS = [
  /\b(home|house|residence|residencial|residential|private|villa)\b/i,
  /\b(hiking|trail|sendero|mountain|peak|mirador|lookout)\b/i,
  /\b(park|parque|playground|beach|river|lagoon|laguna)\b/i,
];

const MIN_REVIEW_COUNT_FOR_PROSPECT = 8;

const FOCUSED_PROSPECT_TYPES = [
  'beauty_salon', 'hair_care', 'barber_shop', 'spa', 'nail_salon',
  'car_repair', 'car_wash', 'motorcycle_repair_shop', 'tire_shop',
  'hardware_store', 'plumber', 'electrician', 'painter', 'roofing_contractor',
  'dentist', 'doctor', 'pharmacy', 'physiotherapist', 'veterinary_care',
  'restaurant', 'bakery', 'cafe', 'meal_takeaway', 'bar',
  'gym', 'pet_store', 'florist', 'jewelry_store', 'furniture_store',
  'home_goods_store', 'clothing_store', 'shoe_store', 'electronics_store',
  'grocery_or_supermarket', 'supermarket', 'convenience_store',
];

const GEOGRAPHIC_PLACE_TYPES = new Set([
  'administrative_area_level_1', 'administrative_area_level_2', 'administrative_area_level_3',
  'administrative_area_level_4', 'administrative_area_level_5', 'colloquial_area', 'country',
  'geocode', 'locality', 'political', 'postal_code', 'postal_town', 'sublocality',
  'sublocality_level_1', 'sublocality_level_2', 'sublocality_level_3', 'sublocality_level_4',
  'sublocality_level_5',
]);

const SOCIAL_OR_LISTING_HOSTS = [
  'instagram.com', 'facebook.com', 'fb.com', 'wa.me', 'whatsapp.com',
  'api.whatsapp.com', 'tiktok.com', 'youtube.com', 'youtu.be', 'linktr.ee',
  'maps.google.com', 'google.com', 'goo.gl', 'bit.ly', 'waze.com', 'ubereats.com',
  'doordash.com', 'grubhub.com', 'pedidosya.com', 'glovoapp.com', 'tripadvisor.com',
  'booking.com', 'airbnb.com', 'expedia.com', 'yelp.com', 'opentable.com',
  'mercadolibre.com', 'shopify.com', 'business.site', 'sites.google.com',
];

const DR_BUSINESS_CENTERS = [
  { lat: 18.4861, lng: -69.9312, radiusMeters: 12500 },
  { lat: 18.4740, lng: -69.8840, radiusMeters: 9000 },
  { lat: 18.7357, lng: -70.1627, radiusMeters: 12000 },
  { lat: 19.4517, lng: -70.6970, radiusMeters: 11000 },
  { lat: 19.7808, lng: -70.6871, radiusMeters: 9000 },
  { lat: 18.4273, lng: -68.9728, radiusMeters: 8000 },
  { lat: 18.5601, lng: -68.3725, radiusMeters: 9000 },
  { lat: 18.6150, lng: -68.7078, radiusMeters: 7000 },
  { lat: 18.4539, lng: -69.3086, radiusMeters: 8000 },
  { lat: 18.4167, lng: -70.1094, radiusMeters: 8000 },
  { lat: 19.3000, lng: -70.2500, radiusMeters: 7500 },
  { lat: 19.2082, lng: -69.3320, radiusMeters: 7000 },
  { lat: 19.3776, lng: -70.4176, radiusMeters: 7000 },
  { lat: 18.9369, lng: -70.4092, radiusMeters: 7000 },
  { lat: 19.3832, lng: -69.8474, radiusMeters: 7000 },
  { lat: 18.5818, lng: -68.4043, radiusMeters: 7000 },
  { lat: 18.2085, lng: -71.1008, radiusMeters: 7000 },
  { lat: 18.2796, lng: -70.3318, radiusMeters: 6500 },
  { lat: 18.4500, lng: -70.7349, radiusMeters: 6500 },
  { lat: 19.5519, lng: -71.0781, radiusMeters: 6500 },
];

let map = null;
let placesService = null;
let geocoder = null;
let areaAutocomplete = null;
let dartMarker = null;
let winnerMarker = null;
let connectorLine = null;
let scanCircle = null;
let boundaryShape = null;
let selectedBoundary = null;
let placeMarkers = [];
let previewMarker = null;
let currentPlaces = [];
let lastDartPosition = null;
let lastThrowAt = 0;
let searchHistory = [];
let areaSelectionHistory = [];
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
  initializeAreaSelector();
  searchHistory = loadSearchHistory();
  areaSelectionHistory = loadAreaSelectionHistory();
  renderSearchHistory();
  renderAreaSelectionHistory();
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

function loadAreaSelectionHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AREA_SELECTION_HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isValidAreaSelectionEntry).slice(0, MAX_AREA_SELECTION_HISTORY) : [];
  } catch (_error) {
    return [];
  }
}

function saveAreaSelectionHistory() {
  localStorage.setItem(AREA_SELECTION_HISTORY_KEY, JSON.stringify(areaSelectionHistory.slice(0, MAX_AREA_SELECTION_HISTORY)));
  renderAreaSelectionHistory();
}

function isValidAreaSelectionEntry(entry) {
  if (!entry || typeof entry !== 'object' || !entry.id || !entry.type || !entry.label) return false;
  if (entry.type === 'circle') return entry.center && Number.isFinite(entry.center.lat) && Number.isFinite(entry.center.lng);
  if (entry.type === 'bounds') return entry.bounds && ['north', 'south', 'east', 'west'].every(key => Number.isFinite(entry.bounds[key]));
  return false;
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

function isOperationalStatus(place) {
  return String(place.business_status || '').toUpperCase() === 'OPERATIONAL';
}

function hasPhoneNumber(place) {
  return Boolean(String(place.international_phone_number || place.formatted_phone_number || place.phone || '').trim());
}

function hasFocusedProspectType(place) {
  const types = place.types || [];
  return types.some(type => FOCUSED_PROSPECT_TYPES.includes(type));
}

function hasStrictBusinessSignals(place) {
  const types = place.types || [];
  const reviewCount = Number(place.user_ratings_total) || 0;
  const hasCommercialType = types.some(type => COMMERCIAL_TYPES.has(type));

  if (!hasCommercialType) return false;
  if (!hasPhoneNumber(place)) return false;
  return reviewCount >= MIN_REVIEW_COUNT_FOR_PROSPECT || Boolean(place.website);
}

function hasNonBusinessSignals(place) {
  const types = place.types || [];
  const name = String(place.name || '').trim();
  const blockedType = types.some(type => NON_BUSINESS_TYPES.has(type) || RESIDENTIAL_OR_PRIVATE_TYPES.has(type));
  const blockedName = NON_BUSINESS_NAME_PATTERNS.some(pattern => pattern.test(name));
  return blockedType || blockedName;
}

function classifyPlace(place) {
  const types = place.types || [];
  const websiteUrl = place.website || '';
  const hasRealWebsite = isRealBusinessWebsite(websiteUrl);

  if (hasNonBusinessSignals(place)) {
    return {
      status: PLACE_STATUS.UNSURE,
      hasRealWebsite,
      isLikelyBusiness: false,
      label: 'Filtered out: non-business or private location',
    };
  }

  if (!isOperationalStatus(place)) {
    return {
      status: PLACE_STATUS.UNSURE,
      hasRealWebsite,
      isLikelyBusiness: false,
      label: 'Filtered out: not currently operational',
    };
  }

  if (!hasStrictBusinessSignals(place)) {
    return {
      status: PLACE_STATUS.UNSURE,
      hasRealWebsite,
      isLikelyBusiness: false,
      label: hasPhoneNumber(place) ? 'Filtered out: weak business proof' : 'Filtered out: no phone number found',
    };
  }

  if (hasRealWebsite) {
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
    label: 'Filtered out by strict qualification',
  };
}

function isGeographicPlace(types = []) {
  return types.some(type => GEOGRAPHIC_PLACE_TYPES.has(type));
}

function normalizePlace(place, dartPosition) {
  const location = place.geometry?.location;
  const latitude = typeof location?.lat === 'function' ? location.lat() : location?.lat;
  const longitude = typeof location?.lng === 'function' ? location.lng() : location?.lng;
  const classification = classifyPlace(place);

  return {
    id: place.place_id || `${slugify(place.name)}-${roundCoord(latitude)}-${roundCoord(longitude)}`,
    name: place.name || 'Unnamed place',
    types: Array.isArray(place.types) ? place.types : [],
    category: getCategory(place.types),
    address: place.formatted_address || place.vicinity || 'Address not available',
    phone: place.international_phone_number || place.formatted_phone_number || '',
    googleMapsUrl: place.url || makeGoogleMapsUrl(place.place_id),
    businessStatus: place.business_status || 'Status not available',
    latitude,
    longitude,
    websiteUrl: place.website || '',
    socialUrl: (place.website && !classification.hasRealWebsite) ? place.website : '',
    mapsPhotoCount: place.photos ? place.photos.length : 0,
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
  if (selectedBoundary?.type === 'circle') {
    return randomPositionInCircle(selectedBoundary.center, selectedBoundary.radiusMeters);
  }

  const bounds = selectedBoundary?.type === 'bounds' ? selectedBoundary.bounds : map.getBounds();
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

function randomHiddenThrowPosition(attempt) {
  const businessCenterPosition = randomPositionNearBusinessCenter(attempt);
  return businessCenterPosition || randomPositionInBounds();
}

function randomPositionNearBusinessCenter(attempt) {
  if (attempt % 3 === 1) return null;

  const centers = DR_BUSINESS_CENTERS.filter(center => isPositionInsideSelectedArea(center));
  if (!centers.length) return null;

  for (let sample = 0; sample < 8; sample += 1) {
    const center = centers[Math.floor(Math.random() * centers.length)];
    const position = randomPositionInCircle(center, center.radiusMeters);
    if (isPositionInsideSelectedArea(position)) return position;
  }

  return null;
}

function isPositionInsideSelectedArea(position) {
  if (!position) return false;

  if (selectedBoundary?.type === 'circle') {
    return distanceMeters(selectedBoundary.center, position) <= selectedBoundary.radiusMeters;
  }

  const bounds = selectedBoundary?.type === 'bounds' ? selectedBoundary.bounds : map.getBounds();
  if (!bounds) return false;

  return bounds.contains(new google.maps.LatLng(position.lat, position.lng));
}

function randomPositionInCircle(center, radiusMeters) {
  const distance = radiusMeters * Math.sqrt(Math.random());
  const bearing = Math.random() * Math.PI * 2;
  const earthRadius = 6371000;
  const centerLat = center.lat * Math.PI / 180;
  const centerLng = center.lng * Math.PI / 180;
  const angularDistance = distance / earthRadius;

  const lat = Math.asin(
    Math.sin(centerLat) * Math.cos(angularDistance)
    + Math.cos(centerLat) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lng = centerLng + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(centerLat),
    Math.cos(angularDistance) - Math.sin(centerLat) * Math.sin(lat)
  );

  return { lat: lat * 180 / Math.PI, lng: lng * 180 / Math.PI };
}

function throwDart() {
  const now = Date.now();
  if (now - lastThrowAt < THROW_COOLDOWN_MS) return;
  lastThrowAt = now;

  resetScreen({ keepToast: true, keepBoundary: true });
  hideSelectionWindows();
  setThrowing(true);
  updateControlStates();
  setToast('Finding a dart that lands near a qualified business...');

  findQualifiedThrow()
    .then(result => {
      if (!result) {
        setToast('No qualified operating businesses found. Try a denser commercial area.');
        return;
      }

      presentThrowResult(result);
    })
    .catch(error => {
      console.error(error);
      setToast('Something went wrong while scanning. Try again.');
    })
    .finally(() => finishScan());
}

async function findQualifiedThrow() {
  for (let attempt = 1; attempt <= MAX_AUTO_THROW_ATTEMPTS; attempt += 1) {
    const position = randomHiddenThrowPosition(attempt);
    if (!position) return null;

    const result = await scanCandidatePosition(position);
    if (result?.winner) return result;
  }

  return null;
}

function scanCandidatePosition(position) {
  return new Promise((resolve, reject) => {
    placesService.nearbySearch({
      location: position,
      radius: SEARCH_RADIUS_METERS,
      type: 'establishment',
    }, async (results, status) => {
      const PS = google.maps.places.PlacesServiceStatus;

      if (status === PS.ZERO_RESULTS || !results?.length) {
        resolve(null);
        return;
      }

      if (status !== PS.OK) {
        reject(new Error(`Places scan failed: ${status}`));
        return;
      }

      try {
        const details = await fetchPlaceDetails(results.slice(0, MAX_DETAILS_PER_THROW));
        const places = dedupePlaces(details.map(place => normalizePlace(place, position)))
          .filter(place => Number.isFinite(place.latitude) && Number.isFinite(place.longitude))
          .filter(place => !isGeographicPlace(place.types || []))
          .sort((a, b) => a.distanceMeters - b.distanceMeters);
        const winner = pickWinner(places);

        if (!winner) {
          resolve(null);
          return;
        }

        const locationInfo = await reverseGeocodePosition(position);
        resolve({ position, places, winner, locationInfo });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function presentThrowResult({ position, places, winner, locationInfo }) {
  lastDartPosition = position;
  currentLocationInfo = locationInfo;
  currentPlaces = places;

  setToast('Dart landed near a qualified business. Revealing winner...');
  map.panTo(position);
  startImpactAnimation(position);

  dartMarker = new google.maps.Marker({
    position,
    map,
    title: 'Dart landed here',
    icon: dartIcon(),
    animation: google.maps.Animation.DROP,
    zIndex: 30,
  });

  renderPlaceDots(currentPlaces);
  renderLocationInfo(currentLocationInfo);
  renderStats(currentPlaces);
  renderScanCircle(position);
  focusThrow(position, currentPlaces);
  revealWinner(position, winner, { saveHistory: true });
  updateControlStates();
}

function fetchPlaceDetails(places) {
  const fields = [
    'place_id', 'name', 'types', 'geometry', 'formatted_address', 'vicinity',
    'website', 'url', 'rating', 'user_ratings_total', 'formatted_phone_number',
    'international_phone_number', 'business_status', 'photos',
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
  const eligiblePlaces = places.filter(place => (
    place.isLikelyBusiness
    && place.status === PLACE_STATUS.NEEDS_WEBSITE
    && !place.hasRealWebsite
    && hasPhoneNumber(place)
    && place.reviewCount >= MIN_GOOGLE_REVIEWS_FOR_WINNER
  ));

  return eligiblePlaces.find(hasFocusedProspectType) || eligiblePlaces[0] || null;
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

    marker.addListener('click', () => showPreviewCard(place, marker));
    placeMarkers.push(marker);
    setTimeout(() => marker.setOpacity(0.92), 70 * index);
  });
}

function renderStats(places) {
  const stats = calculateStats(places);
  const businessCard = document.getElementById('business-site-card');

  setText('business-summary', `${stats.nearbyCount} scanned`);
  setText('business-breakdown', `${stats.needsCount} need site / ${stats.hasCount} has site (${stats.websiteGap}%)`);
  if (businessCard) {
    const isRed = stats.websiteGap >= 70;
    const isYellow = stats.websiteGap >= 40 && stats.websiteGap < 70;
    const isGreen = stats.websiteGap < 40;
    businessCard.classList.toggle('is-weak', isRed);
    businessCard.classList.toggle('is-mid', isYellow);
    businessCard.classList.toggle('is-healthy', isGreen);
  }
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
  setText('winner-kicker', 'Selected Winner');
  setText('winner-name', place.name);
  setText('winner-category', titleCase(place.category));
  setText('winner-rating', formatRating(place));
  setText('winner-address', place.address);
  setPhoneActionLink('winner-phone-link', place.phone);
  setActionLink('winner-google-link', place.googleMapsUrl, 'Open in Google Maps', false);
  setActionLink('winner-website-link', place.websiteUrl, getWebsiteLinkLabel(place.websiteUrl), !place.websiteUrl);

  window.__lastWinnerPlace = place; // lets the top-bar AI toggle open this winner

  const buildBtn = document.getElementById('winner-build-btn');
  if (buildBtn) {
    buildBtn.onclick = () => (window.BuilderChat
      ? BuilderChat.openForPlace(place)
      : copyBuilderPayload(place, buildBtn));
  }

  const card = document.getElementById('winner-card');
  bringWindowToFront(card);
  card.classList.remove('hidden', 'revealed');
  void card.offsetWidth;
  card.classList.add('revealed');
}

// --- Handoff to the DR site builder -----------------------------------------
// Copies the winner as a clean JSON payload. Paste it into the dr-site-builder
// skill (Claude Code) or the "DR Business Site Builder" agent to start a build.
function buildBuilderPayload(place) {
  return {
    source: 'dart-business-finder',
    capturedAt: new Date().toISOString(),
    name: place.name || '',
    category: place.category || '',
    googleTypes: Array.isArray(place.types) ? place.types : [],
    phone: place.phone || '',
    address: place.address || '',
    googleMapsUrl: place.googleMapsUrl || '',
    lat: place.latitude ?? null,
    lng: place.longitude ?? null,
    rating: place.rating ?? null,
    reviewCount: place.reviewCount || 0,
    hasRealWebsite: Boolean(place.hasRealWebsite),
    websiteUrl: place.websiteUrl || '',
    socialUrl: place.socialUrl || '',
    mapsPhotoCount: place.mapsPhotoCount || 0,
  };
}

function copyBuilderPayload(place, btn) {
  const payload = JSON.stringify(buildBuilderPayload(place), null, 2);
  const flash = (msg) => {
    if (!btn) return;
    const original = btn.dataset.label || (btn.dataset.label = btn.textContent);
    btn.textContent = msg;
    setTimeout(() => { btn.textContent = original; }, 2800);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(payload)
      .then(() => flash('✓ Copiado — pégalo en el builder'))
      .catch(() => { console.log(payload); flash('Copia manual: ver consola'); });
  } else {
    console.log(payload);
    flash('Copia manual: ver consola');
  }
}

function setPhoneActionLink(id, phone) {
  const link = document.getElementById(id);
  if (!link) return;

  const normalizedPhone = String(phone || '').trim();
  link.textContent = normalizedPhone || 'No phone';
  link.href = normalizedPhone ? `tel:${normalizedPhone.replace(/[^+\d]/g, '')}` : '#';
  link.classList.toggle('disabled', !normalizedPhone);
}

function showPreviewCard(place, marker = null) {
  if (!place) return;

  highlightPreviewMarker(marker, place);
  setText('preview-name', place.name);
  setText('preview-category', titleCase(place.category));
  setText('preview-distance', formatDistance(place.distanceMeters));
  setText('preview-rating', formatRating(place));
  setText('preview-address', place.address);
  setActionLink('preview-google-link', place.googleMapsUrl, 'Open in Google Maps', false);
  setActionLink('preview-website-link', place.websiteUrl, getWebsiteLinkLabel(place.websiteUrl), !place.websiteUrl);

  const badge = document.getElementById('preview-badge');
  badge.className = 'website-badge';
  if (place.status === PLACE_STATUS.HAS_WEBSITE) {
    badge.classList.add('has');
    badge.textContent = place.statusLabel || 'Website link found';
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

function highlightPreviewMarker(marker, place) {
  if (previewMarker && previewMarker !== marker) {
    const previousPlace = previewMarker.placeData;
    previewMarker.setIcon(dotIcon(STATUS_COLORS[previousPlace?.status] || STATUS_COLORS.unsure, 8));
    previewMarker.setZIndex(previousPlace?.status === PLACE_STATUS.NEEDS_WEBSITE ? 14 : 10);
  }

  previewMarker = marker;
  if (!previewMarker) return;

  previewMarker.placeData = place;
  previewMarker.setIcon(dotIcon(STATUS_COLORS[place.status], 12));
  previewMarker.setZIndex(36);
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
  clearPreviewMarkerHighlight();
}

function clearPreviewMarkerHighlight() {
  if (!previewMarker) return;

  const place = previewMarker.placeData;
  previewMarker.setIcon(dotIcon(STATUS_COLORS[place?.status] || STATUS_COLORS.unsure, 8));
  previewMarker.setZIndex(place?.status === PLACE_STATUS.NEEDS_WEBSITE ? 14 : 10);
  previewMarker = null;
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

function initializeAreaSelector() {
  const input = document.getElementById('area-search-input');
  if (!input) return;

  areaAutocomplete = new google.maps.places.Autocomplete(input, {
    fields: ['formatted_address', 'geometry', 'name', 'types'],
    types: ['(regions)'],
  });

  areaAutocomplete.addListener('place_changed', () => {
    const place = areaAutocomplete.getPlace();
    applyPlaceBoundary(place);
  });

  map.addListener('click', event => {
    if (!event.latLng) return;
    applyManualBoundary({ lat: event.latLng.lat(), lng: event.latLng.lng() });
    showSearchBoundaryWindow();
  });
}

function applyPlaceBoundary(place) {
  const bounds = place?.geometry?.viewport;
  const location = place?.geometry?.location;
  if (!bounds && !location) {
    setToast('Choose a city, state, or country from the search list.');
    return;
  }

  clearBoundaryShape();

  const label = place.name || place.formatted_address || 'Selected area';
  if (bounds) {
    selectedBoundary = { type: 'bounds', bounds, label };
    boundaryShape = new google.maps.Rectangle({
      bounds,
      map,
      clickable: false,
      strokeColor: '#0f766e',
      strokeOpacity: 0.72,
      strokeWeight: 2,
      fillColor: '#14b8a6',
      fillOpacity: 0.13,
      zIndex: 2,
    });
    map.fitBounds(bounds, { top: 150, right: 80, bottom: 120, left: 80 });
  } else {
    applyManualBoundary({ lat: location.lat(), lng: location.lng() }, label);
    return;
  }

  syncAreaSelectorUi();
  updateControlStates();
  saveRecentAreaSelection();
  hideSearchBoundaryWindow();
  setToast(`Darts will now land inside ${label}.`);
}

function applyManualBoundary(center, label = 'Custom') {
  clearBoundaryShape();
  selectedBoundary = {
    type: 'circle',
    center,
    radiusMeters: getBoundaryRadiusMeters(),
    label,
  };

  boundaryShape = new google.maps.Circle({
    center,
    radius: selectedBoundary.radiusMeters,
    map,
    clickable: false,
    strokeColor: '#7c3aed',
    strokeOpacity: 0.72,
    strokeWeight: 2,
    fillColor: '#8b5cf6',
    fillOpacity: 0.16,
    zIndex: 2,
  });

  map.fitBounds(boundaryShape.getBounds(), { top: 150, right: 80, bottom: 120, left: 80 });
  syncAreaSelectorUi();
  updateControlStates();
  saveRecentAreaSelection();
  setToast(`Custom boundary set to ${formatMiles(getBoundaryRadiusMiles())}.`);
}

function updateManualBoundaryRadius() {
  if (selectedBoundary?.type !== 'circle' || !boundaryShape) return;
  selectedBoundary.radiusMeters = getBoundaryRadiusMeters();
  boundaryShape.setRadius(selectedBoundary.radiusMeters);
  saveRecentAreaSelection();
}

function clearSelectedBoundary(options = {}) {
  clearBoundaryShape();
  selectedBoundary = null;
  const input = document.getElementById('area-search-input');
  if (input) input.value = '';
  hideSearchBoundaryWindow();
  syncAreaSelectorUi();
  updateControlStates();
  if (!options.quiet) setToast('Custom boundary cleared. Darts use the visible map again.');
}

function hideAreaSelector() {
  const searchWindow = document.getElementById('area-search-window');
  searchWindow.classList.add('hidden');
  syncSelectButtonExpanded();
}

function showAreaSelector(options = {}) {
  const searchWindow = document.getElementById('area-search-window');
  hideSearchBoundaryWindow();
  searchWindow.classList.remove('hidden');
  syncSelectButtonExpanded();
  if (options.focusSearch !== false) document.getElementById('area-search-input').focus();
}

function hideSearchBoundaryWindow() {
  document.getElementById('search-boundary-window').classList.add('hidden');
  syncSelectButtonExpanded();
}

function showSearchBoundaryWindow() {
  hideAreaSelector();
  document.getElementById('search-boundary-window').classList.remove('hidden');
  syncSelectButtonExpanded();
}

function hideSelectionWindows() {
  document.getElementById('area-search-window').classList.add('hidden');
  document.getElementById('search-boundary-window').classList.add('hidden');
  syncSelectButtonExpanded();
}

function syncSelectButtonExpanded() {
  const searchWindow = document.getElementById('area-search-window');
  const customWindow = document.getElementById('search-boundary-window');
  const isOpen = !searchWindow.classList.contains('hidden') || !customWindow.classList.contains('hidden');
  document.getElementById('select-area-btn').setAttribute('aria-expanded', String(isOpen));
}

function clearBoundaryShape() {
  if (boundaryShape) boundaryShape.setMap(null);
  boundaryShape = null;
}

function getBoundaryRadiusMiles() {
  return Number(document.getElementById('area-radius-slider')?.value) || DEFAULT_BOUNDARY_RADIUS_MILES;
}

function getBoundaryRadiusMeters() {
  return getBoundaryRadiusMiles() * MILES_TO_METERS;
}

function formatMiles(miles) {
  return `${Math.round(miles).toLocaleString()} miles`;
}

function syncAreaSelectorUi() {
  const title = document.getElementById('area-boundary-title');
  const areaControl = document.getElementById('area-control');
  const selectButton = document.getElementById('select-area-btn');
  const clearButton = document.getElementById('clear-selected-area-btn');
  const customName = document.getElementById('custom-boundary-name');
  const customNameInput = document.getElementById('custom-boundary-name-input');
  const radiusValue = document.getElementById('area-radius-value');
  const searchBoundaryWindow = document.getElementById('search-boundary-window');
  const hasBoundary = Boolean(selectedBoundary);
  const hasSearchBoundary = selectedBoundary?.type === 'circle';

  if (title) title.textContent = selectedBoundary?.type === 'circle' ? 'Select the Area' : 'Whole visible map';
  if (selectButton) selectButton.textContent = selectedBoundary?.label || 'Select Area';
  if (customName) customName.textContent = hasSearchBoundary ? selectedBoundary.label || 'Custom' : 'Custom';
  if (customNameInput && customNameInput.classList.contains('hidden')) {
    customNameInput.value = hasSearchBoundary ? selectedBoundary.label || 'Custom' : 'Custom';
  }
  if (areaControl) areaControl.classList.toggle('is-selected', hasBoundary);
  if (clearButton) clearButton.classList.toggle('hidden', !hasBoundary);
  if (radiusValue) radiusValue.textContent = formatMiles(getBoundaryRadiusMiles());
  searchBoundaryWindow?.classList.toggle('has-boundary', hasSearchBoundary);
}

function saveRecentAreaSelection() {
  const entry = serializeSelectedBoundary();
  if (!entry) return;

  areaSelectionHistory = [entry, ...areaSelectionHistory.filter(item => item.id !== entry.id)]
    .slice(0, MAX_AREA_SELECTION_HISTORY);
  saveAreaSelectionHistory();
}

function serializeSelectedBoundary() {
  if (!selectedBoundary) return null;

  if (selectedBoundary.type === 'circle') {
    const radiusMiles = selectedBoundary.radiusMeters / MILES_TO_METERS;
    return {
      id: `circle-${roundCoord(selectedBoundary.center.lat)}-${roundCoord(selectedBoundary.center.lng)}`,
      type: 'circle',
      label: selectedBoundary.label || 'Custom',
      center: selectedBoundary.center,
      radiusMeters: selectedBoundary.radiusMeters,
      radiusMiles,
      createdAt: new Date().toISOString(),
    };
  }

  if (selectedBoundary.type === 'bounds') {
    const ne = selectedBoundary.bounds.getNorthEast();
    const sw = selectedBoundary.bounds.getSouthWest();
    const bounds = { north: ne.lat(), east: ne.lng(), south: sw.lat(), west: sw.lng() };
    return {
      id: `bounds-${slugify(selectedBoundary.label)}-${roundCoord(bounds.north)}-${roundCoord(bounds.west)}`,
      type: 'bounds',
      label: selectedBoundary.label || 'Selected area',
      bounds,
      createdAt: new Date().toISOString(),
    };
  }

  return null;
}

function renderAreaSelectionHistory() {
  const list = document.getElementById('area-selection-history');
  const clearButton = document.getElementById('clear-area-selection-history-btn');
  if (!list || !clearButton) return;

  clearButton.disabled = areaSelectionHistory.length === 0;
  if (!areaSelectionHistory.length) {
    list.innerHTML = '<p class="area-selection-empty">No recent selections yet.</p>';
    return;
  }

  list.innerHTML = areaSelectionHistory.map(entry => {
    const meta = entry.type === 'circle' ? `Custom | ${formatMiles(entry.radiusMiles || DEFAULT_BOUNDARY_RADIUS_MILES)}` : 'Place boundary';
    return `
      <button class="area-selection-item ${entry.type}" type="button" data-area-selection-id="${escapeAttr(entry.id)}">
        <strong>${escapeHtml(entry.label)}</strong>
        <span>${escapeHtml(meta)}</span>
      </button>
    `;
  }).join('');
}

function restoreAreaSelection(entryId) {
  const entry = areaSelectionHistory.find(item => item.id === entryId);
  if (!entry) return;

  if (entry.type === 'circle') {
    const miles = Number(entry.radiusMiles) || (Number(entry.radiusMeters) || getBoundaryRadiusMeters()) / MILES_TO_METERS;
    setBoundaryRadiusMiles(miles);
    applyManualBoundary(entry.center, entry.label || 'Custom');
    showSearchBoundaryWindow();
    setToast(`Custom boundary restored at ${formatMiles(miles)}.`);
    return;
  }

  if (entry.type === 'bounds') {
    applyStoredBoundsBoundary(entry);
    hideSearchBoundaryWindow();
    showAreaSelector({ focusSearch: false });
    setToast(`${entry.label} restored.`);
  }
}

function applyStoredBoundsBoundary(entry) {
  clearBoundaryShape();
  const bounds = new google.maps.LatLngBounds(
    { lat: entry.bounds.south, lng: entry.bounds.west },
    { lat: entry.bounds.north, lng: entry.bounds.east }
  );
  selectedBoundary = { type: 'bounds', bounds, label: entry.label };
  boundaryShape = new google.maps.Rectangle({
    bounds,
    map,
    clickable: false,
    strokeColor: '#0f766e',
    strokeOpacity: 0.72,
    strokeWeight: 2,
    fillColor: '#14b8a6',
    fillOpacity: 0.13,
    zIndex: 2,
  });
  map.fitBounds(bounds, { top: 150, right: 80, bottom: 120, left: 80 });
  syncAreaSelectorUi();
  updateControlStates();
  saveRecentAreaSelection();
}

function setBoundaryRadiusMiles(miles) {
  const slider = document.getElementById('area-radius-slider');
  if (!slider) return;
  const min = Number(slider.min) || 1;
  const max = Number(slider.max) || 250;
  slider.value = String(Math.min(Math.max(Math.round(miles), min), max));
}

function clearAreaSelectionHistory() {
  areaSelectionHistory = [];
  saveAreaSelectionHistory();
  setToast('Recent area selections cleared.');
}

function beginCustomBoundaryRename() {
  if (selectedBoundary?.type !== 'circle') return;

  const button = document.getElementById('custom-boundary-name-btn');
  const input = document.getElementById('custom-boundary-name-input');
  button.classList.add('hidden');
  input.classList.remove('hidden');
  input.value = selectedBoundary.label || 'Custom';
  input.focus();
  input.select();
}

function commitCustomBoundaryRename() {
  const input = document.getElementById('custom-boundary-name-input');
  if (input.classList.contains('hidden')) return;

  if (selectedBoundary?.type !== 'circle') {
    finishCustomBoundaryRenameEdit();
    syncAreaSelectorUi();
    return;
  }

  const trimmedName = input.value.trim();
  if (!trimmedName) {
    cancelCustomBoundaryRename();
    setToast('Custom boundary name was not changed.');
    return;
  }

  selectedBoundary.label = trimmedName;
  finishCustomBoundaryRenameEdit();
  syncAreaSelectorUi();
  saveRecentAreaSelection();
  setToast(`Custom boundary renamed to ${trimmedName}.`);
}

function cancelCustomBoundaryRename() {
  finishCustomBoundaryRenameEdit();
  syncAreaSelectorUi();
}

function finishCustomBoundaryRenameEdit() {
  document.getElementById('custom-boundary-name-btn').classList.remove('hidden');
  document.getElementById('custom-boundary-name-input').classList.add('hidden');
}

function pulseBoundaryShape() {
  if (!boundaryShape) return;

  if (boundaryShape instanceof google.maps.Circle || boundaryShape instanceof google.maps.Rectangle) {
    const currentOpacity = boundaryShape.get('fillOpacity') || 0.14;
    boundaryShape.setOptions({ fillOpacity: Math.min(currentOpacity + 0.13, 0.32), strokeWeight: 3 });
    setTimeout(() => {
      if (boundaryShape) boundaryShape.setOptions({ fillOpacity: currentOpacity, strokeWeight: 2 });
    }, 360);
  }
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
    nearbyCount: likelyBusinesses.length,
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
  return Boolean(lastDartPosition || currentPlaces.length || dartMarker || winnerMarker || scanCircle || connectorLine || placeMarkers.length || selectedBoundary);
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

function getWebsiteLinkLabel(url) {
  if (!url) return 'No website link';

  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.com' || host.endsWith('.fb.com')) return 'Open Facebook Page';
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'Open Instagram';
    if (host === 'wa.me' || host.endsWith('.wa.me') || host === 'whatsapp.com' || host.endsWith('.whatsapp.com')) return 'Open WhatsApp';
    if (SOCIAL_OR_LISTING_HOSTS.some(blocked => host === blocked || host.endsWith(`.${blocked}`))) return 'Open Listing Link';
  } catch (_error) {
    return 'Open Website Link';
  }

  return 'Open Website';
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

  const isMobileViewport = window.matchMedia('(max-width: 760px)').matches;
  const padding = isMobileViewport
    ? { top: 132, right: 24, bottom: 210, left: 24 }
    : { top: 210, right: 460, bottom: 150, left: 90 };

  map.fitBounds(bounds, padding);

  if (isMobileViewport) {
    google.maps.event.addListenerOnce(map, 'idle', () => {
      if (map.getZoom() < 13) map.setZoom(13);
    });
  }
}

function isMobileViewport() {
  return window.matchMedia('(max-width: 760px)').matches;
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
  setText('business-breakdown', '0 need site / 0 has site (0%)');
  const businessCard = document.getElementById('business-site-card');
  if (businessCard) {
    businessCard.classList.remove('is-weak', 'is-mid', 'is-healthy');
  }
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

  if (!options.keepBoundary) clearSelectedBoundary({ quiet: true });

  if (!options.keepToast) setToast('Screen cleared. Throw again when ready.');
}

function clearPlaceMarkers() {
  previewMarker = null;
  placeMarkers.forEach(marker => marker.setMap(null));
  placeMarkers = [];
}

function resetWinnerCardContent() {
  setText('winner-kicker', 'Winner Revealed');
  setText('winner-name', 'Throw a dart to find a business');
  setText('winner-category', '-');
  setText('winner-rating', '-');
  setText('winner-address', '-');
  setPhoneActionLink('winner-phone-link', '');
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
document.getElementById('select-area-btn').addEventListener('click', () => {
  const searchWindow = document.getElementById('area-search-window');
  const customWindow = document.getElementById('search-boundary-window');

  if (selectedBoundary?.type === 'circle') {
    if (customWindow.classList.contains('hidden')) {
      showSearchBoundaryWindow();
    } else {
      hideSearchBoundaryWindow();
    }
  } else if (searchWindow.classList.contains('hidden')) {
    showAreaSelector();
  } else {
    hideAreaSelector();
  }
});
document.getElementById('close-area-search-window').addEventListener('click', hideAreaSelector);
document.getElementById('close-search-boundary-window').addEventListener('click', hideSearchBoundaryWindow);
document.getElementById('custom-boundary-name-btn').addEventListener('pointerdown', event => event.stopPropagation());
document.getElementById('custom-boundary-name-btn').addEventListener('click', event => {
  event.stopPropagation();
  beginCustomBoundaryRename();
});
document.getElementById('custom-boundary-name-input').addEventListener('pointerdown', event => event.stopPropagation());
document.getElementById('custom-boundary-name-input').addEventListener('click', event => event.stopPropagation());
document.getElementById('custom-boundary-name-input').addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    commitCustomBoundaryRename();
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    cancelCustomBoundaryRename();
  }
});
document.getElementById('custom-boundary-name-input').addEventListener('blur', commitCustomBoundaryRename);
document.getElementById('clear-selected-area-btn').addEventListener('click', event => {
  event.stopPropagation();
  clearSelectedBoundary();
});
document.getElementById('area-radius-slider').addEventListener('input', () => {
  updateManualBoundaryRadius();
  syncAreaSelectorUi();
});
document.getElementById('area-search-input').addEventListener('pointerenter', pulseBoundaryShape);
document.getElementById('area-selection-history').addEventListener('click', event => {
  const button = event.target.closest('button[data-area-selection-id]');
  if (button) restoreAreaSelection(button.dataset.areaSelectionId);
});
document.getElementById('clear-area-selection-history-btn').addEventListener('click', clearAreaSelectionHistory);
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
