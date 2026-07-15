// js/ui/PlanetSurfaceTexture.js — deterministic seamless equirectangular planet surfaces

const TEXTURE_DIMENSIONS = {
  high: { width: 384, height: 192 },
  medium: { width: 256, height: 128 },
  low: { width: 192, height: 96 },
};

const SURFACE_PROFILES = {
  agricultural: {
    dark: '#092b3c', mid: '#2b8b58', light: '#a4c96c', polar: '#d8f1df', accent: '#bfffa0',
    seaLevel: 0.53, bands: 0.08, clouds: 0.62, cities: 0.08, craters: 0,
  },
  technology: {
    dark: '#071633', mid: '#2363a8', light: '#70d9ee', polar: '#d6f5ff', accent: '#7ff7ff',
    seaLevel: 0.46, bands: 0.12, clouds: 0.32, cities: 0.72, craters: 1,
  },
  mining: {
    dark: '#251512', mid: '#9b4d2d', light: '#d6a05b', polar: '#d8c6ac', accent: '#ffba64',
    seaLevel: 0.36, bands: 0.08, clouds: 0.18, cities: 0.18, craters: 8,
  },
  commercial: {
    dark: '#170d2f', mid: '#773ab0', light: '#d38aec', polar: '#e8d7ff', accent: '#ff8ef4',
    seaLevel: 0.48, bands: 0.16, clouds: 0.42, cities: 0.82, craters: 1,
  },
  military: {
    dark: '#250b17', mid: '#8a2947', light: '#db6a6f', polar: '#d8b8b8', accent: '#ff6b8f',
    seaLevel: 0.38, bands: 0.1, clouds: 0.2, cities: 0.54, craters: 5,
  },
  medical: {
    dark: '#0a2933', mid: '#2f9ca9', light: '#a4e7de', polar: '#efffff', accent: '#8affea',
    seaLevel: 0.5, bands: 0.1, clouds: 0.7, cities: 0.28, craters: 0,
  },
  industrial: {
    dark: '#24141a', mid: '#914a39', light: '#d98961', polar: '#c4b6aa', accent: '#ff9b68',
    seaLevel: 0.4, bands: 0.16, clouds: 0.25, cities: 0.64, craters: 4,
  },
  energy: {
    dark: '#34210a', mid: '#bd7420', light: '#ffe084', polar: '#fff3c8', accent: '#fff08a',
    seaLevel: 0.5, bands: 0.82, clouds: 0.36, cities: 0, craters: 0, gaseous: true,
  },
  research: {
    dark: '#092a2b', mid: '#27886b', light: '#8de2a2', polar: '#d9f5df', accent: '#8fffd1',
    seaLevel: 0.5, bands: 0.12, clouds: 0.54, cities: 0.36, craters: 0,
  },
  special: {
    dark: '#171827', mid: '#65738d', light: '#b7c7d8', polar: '#f0f5ff', accent: '#b8c8ff',
    seaLevel: 0.43, bands: 0.3, clouds: 0.26, cities: 0.12, craters: 3,
  },
};

const DEFAULT_PROFILE = SURFACE_PROFILES.special;

export function getPlanetTextureDimensions(qualityLevel) {
  const dimensions = TEXTURE_DIMENSIONS[qualityLevel] || TEXTURE_DIMENSIONS.medium;
  return { width: dimensions.width, height: dimensions.height };
}

export function createPlanetSurfaceData(system, colorHex, unlocked, qualityLevel) {
  const dimensions = getPlanetTextureDimensions(qualityLevel);
  const width = dimensions.width;
  const height = dimensions.height;
  const profile = SURFACE_PROFILES[system && system.type] || DEFAULT_PROFILE;
  const seed = hashString(system && system.id ? system.id : 'unknown-planet');
  const baseColor = parseHexColor(colorHex);
  const palette = buildPalette(profile, baseColor, unlocked !== false);
  const terrainWaves = buildWaves(seed ^ 0x9e3779b9, 6, false);
  const detailWaves = buildWaves(seed ^ 0x85ebca6b, 5, true);
  const cloudWaves = buildWaves(seed ^ 0xc2b2ae35, 5, false);
  const lightWaves = buildWaves(seed ^ 0x27d4eb2f, 4, true);
  const craters = buildCraters(seed ^ 0x165667b1, profile.craters || 0);
  const albedo = new Uint8ClampedArray(width * height * 4);
  const bump = new Uint8ClampedArray(width * height * 4);
  const clouds = new Uint8ClampedArray(width * height * 4);
  const emissive = profile.cities > 0 ? new Uint8ClampedArray(width * height * 4) : null;
  const sampleWidth = width - 1;

  for (let y = 0; y < height; y += 1) {
    const v = height <= 1 ? 0.5 : y / (height - 1);
    const latitude = (0.5 - v) * Math.PI;
    const normalizedLatitude = latitude / (Math.PI * 0.5);
    for (let x = 0; x < sampleWidth; x += 1) {
      const theta = x / sampleWidth * Math.PI * 2;
      const index = (y * width + x) * 4;
      writeSurfacePixel({
        albedo,
        bump,
        clouds,
        emissive,
        index,
        theta,
        latitude,
        normalizedLatitude,
        profile,
        palette,
        terrainWaves,
        detailWaves,
        cloudWaves,
        lightWaves,
        craters,
      });
    }
    copyPixel(albedo, y * width * 4, (y * width + width - 1) * 4);
    copyPixel(bump, y * width * 4, (y * width + width - 1) * 4);
    copyPixel(clouds, y * width * 4, (y * width + width - 1) * 4);
    if (emissive) copyPixel(emissive, y * width * 4, (y * width + width - 1) * 4);
  }

  return {
    width,
    height,
    albedo,
    bump,
    clouds,
    emissive,
    hasClouds: profile.clouds > 0.05,
    hasLights: profile.cities > 0,
    gaseous: !!profile.gaseous,
  };
}

function writeSurfacePixel(options) {
  const terrain = sampleWaves(options.theta, options.latitude, options.terrainWaves);
  const detail = sampleWaves(options.theta, options.latitude, options.detailWaves);
  const cloudNoise = sampleWaves(options.theta + 0.24, options.latitude * 0.92, options.cloudWaves);
  const band = 0.5 + Math.sin(
    options.latitude * (9 + options.profile.bands * 12)
    + (terrain - 0.5) * 4.2
  ) * 0.5;
  const crater = sampleCraters(options.theta, options.latitude, options.craters);
  const elevation = clamp01(
    terrain * 0.68
    + detail * 0.24
    + (band - 0.5) * options.profile.bands * 0.36
    + crater * 0.46
  );
  const polar = smoothstep(0.72, 0.98, Math.abs(options.normalizedLatitude));
  let surfaceColor;
  let surfaceHeight;

  if (options.profile.gaseous) {
    const gasBand = clamp01(band * 0.68 + terrain * 0.2 + detail * 0.12);
    surfaceColor = mixRgb(options.palette.dark, options.palette.light, gasBand);
    const storm = smoothstep(0.78, 0.94, detail) * (1 - Math.abs(options.normalizedLatitude));
    surfaceColor = mixRgb(surfaceColor, options.palette.accent, storm * 0.56);
    surfaceHeight = gasBand * 0.42 + detail * 0.16;
  } else {
    const landMask = smoothstep(options.profile.seaLevel - 0.08, options.profile.seaLevel + 0.08, elevation);
    const ocean = mixRgb(options.palette.dark, options.palette.mid, elevation * 0.42);
    const land = mixRgb(options.palette.mid, options.palette.light, smoothstep(0.46, 0.9, elevation));
    surfaceColor = mixRgb(ocean, land, landMask);
    surfaceColor = multiplyRgb(surfaceColor, 0.84 + detail * 0.28 + crater * 0.18);
    surfaceHeight = elevation * 0.82 + landMask * 0.18;
  }

  surfaceColor = mixRgb(surfaceColor, options.palette.polar, polar * (options.profile.gaseous ? 0.22 : 0.72));
  writeRgba(options.albedo, options.index, surfaceColor[0], surfaceColor[1], surfaceColor[2], 255);

  const bumpValue = clampByte(52 + surfaceHeight * 190 + crater * 38);
  writeRgba(options.bump, options.index, bumpValue, bumpValue, bumpValue, 255);

  const cloudBand = 0.5 + Math.sin(options.latitude * 13 + cloudNoise * 4.5) * 0.5;
  const cloudField = clamp01(cloudNoise * 0.74 + cloudBand * options.profile.bands * 0.2 + detail * 0.12);
  const cloudThreshold = 0.79 - options.profile.clouds * 0.28;
  const cloudAlpha = smoothstep(cloudThreshold, Math.min(0.97, cloudThreshold + 0.2), cloudField)
    * options.profile.clouds;
  const cloudWarmth = options.profile.gaseous ? 0.72 : 0.94;
  writeRgba(
    options.clouds,
    options.index,
    218 + cloudWarmth * 34,
    226 + cloudWarmth * 26,
    238 + cloudWarmth * 17,
    cloudAlpha * 255
  );

  if (options.emissive) {
    const lights = sampleWaves(options.theta, options.latitude, options.lightWaves);
    const latitudeMask = smoothstep(1, 0.15, Math.abs(options.normalizedLatitude));
    const cityMask = smoothstep(0.84 - options.profile.cities * 0.14, 0.96, lights)
      * smoothstep(options.profile.seaLevel - 0.02, options.profile.seaLevel + 0.18, elevation)
      * latitudeMask
      * (1 - cloudAlpha * 0.4);
    writeRgba(
      options.emissive,
      options.index,
      options.palette.accent[0] * cityMask,
      options.palette.accent[1] * cityMask,
      options.palette.accent[2] * cityMask,
      255
    );
  }
}

function buildPalette(profile, baseColor, unlocked) {
  const dim = unlocked ? 1 : 0.62;
  return {
    dark: multiplyRgb(mixRgb(parseHexColor(profile.dark), baseColor, 0.16), dim),
    mid: multiplyRgb(mixRgb(parseHexColor(profile.mid), baseColor, 0.34), dim),
    light: multiplyRgb(mixRgb(parseHexColor(profile.light), baseColor, 0.26), dim),
    polar: multiplyRgb(parseHexColor(profile.polar), dim),
    accent: multiplyRgb(parseHexColor(profile.accent), unlocked ? 1 : 0.56),
  };
}

function buildWaves(seed, count, detailed) {
  const rng = createRng(seed);
  const waves = [];
  for (let index = 0; index < count; index += 1) {
    waves.push({
      longitudeFrequency: (detailed ? 4 : 1) + index * (detailed ? 2 : 1) + Math.floor(rng() * 3),
      latitudeFrequency: (detailed ? 2.4 : 0.8) + index * 0.67 + rng() * 1.2,
      phase: rng() * Math.PI * 2,
      crossPhase: rng() * Math.PI * 2,
      warp: 0.3 + rng() * 1.1,
      weight: 1 / (1 + index * (detailed ? 0.48 : 0.36)),
    });
  }
  return waves;
}

function sampleWaves(theta, latitude, waves) {
  let total = 0;
  let weightTotal = 0;
  waves.forEach(function (wave) {
    const primary = Math.sin(
      theta * wave.longitudeFrequency
      + wave.phase
      + Math.sin(latitude * wave.latitudeFrequency + wave.crossPhase) * wave.warp
    );
    const cross = Math.cos(
      theta * (wave.longitudeFrequency + 1)
      - wave.crossPhase
      + latitude * (wave.latitudeFrequency + 1.37)
    );
    const value = 0.5 + (primary * 0.72 + cross * 0.28) * 0.5;
    total += value * wave.weight;
    weightTotal += wave.weight;
  });
  return weightTotal ? clamp01(total / weightTotal) : 0.5;
}

function buildCraters(seed, count) {
  const rng = createRng(seed);
  const craters = [];
  for (let index = 0; index < count; index += 1) {
    craters.push({
      longitude: rng() * Math.PI * 2,
      latitude: (rng() - 0.5) * Math.PI * 0.78,
      radius: 0.045 + rng() * 0.12,
    });
  }
  return craters;
}

function sampleCraters(theta, latitude, craters) {
  let displacement = 0;
  craters.forEach(function (crater) {
    const deltaLongitude = Math.atan2(
      Math.sin(theta - crater.longitude),
      Math.cos(theta - crater.longitude)
    ) * Math.cos(latitude);
    const deltaLatitude = latitude - crater.latitude;
    const distance = Math.sqrt(deltaLongitude * deltaLongitude + deltaLatitude * deltaLatitude);
    if (distance >= crater.radius * 1.28) return;
    const normalized = distance / crater.radius;
    if (normalized < 0.72) displacement -= (1 - normalized / 0.72) * 0.52;
    else displacement += (1 - Math.abs(normalized - 1) / 0.28) * 0.3;
  });
  return Math.max(-0.62, Math.min(0.42, displacement));
}

function copyPixel(buffer, source, target) {
  buffer[target] = buffer[source];
  buffer[target + 1] = buffer[source + 1];
  buffer[target + 2] = buffer[source + 2];
  buffer[target + 3] = buffer[source + 3];
}

function writeRgba(buffer, index, red, green, blue, alpha) {
  buffer[index] = clampByte(red);
  buffer[index + 1] = clampByte(green);
  buffer[index + 2] = clampByte(blue);
  buffer[index + 3] = clampByte(alpha);
}

function parseHexColor(hexColor) {
  const normalized = String(hexColor || '#728ca8').replace('#', '').padEnd(6, '0').slice(0, 6);
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

function mixRgb(from, to, amount) {
  const t = clamp01(amount);
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}

function multiplyRgb(color, amount) {
  return [color[0] * amount, color[1] * amount, color[2] * amount];
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
}

function hashString(text) {
  let hash = 2166136261;
  const value = String(text || '');
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed) {
  let value = seed >>> 0;
  return function () {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}
