(() => {
  const DEFAULT = { name: 'Glasgow', lat: 55.8642, lon: -4.2518 };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // WMO weather codes -> [icon, description]
  const WMO = {
    0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'],
    45: ['🌫️', 'Fog'], 48: ['🌫️', 'Fog'],
    51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌧️', 'Heavy drizzle'],
    56: ['🌧️', 'Freezing drizzle'], 57: ['🌧️', 'Freezing drizzle'],
    61: ['🌦️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'],
    66: ['🌧️', 'Freezing rain'], 67: ['🌧️', 'Freezing rain'],
    71: ['🌨️', 'Light snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'], 77: ['🌨️', 'Snow grains'],
    80: ['🌦️', 'Light showers'], 81: ['🌧️', 'Showers'], 82: ['⛈️', 'Heavy showers'],
    85: ['🌨️', 'Snow showers'], 86: ['❄️', 'Snow showers'],
    95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm, hail'], 99: ['⛈️', 'Thunderstorm, hail'],
  };
  const wmo = (c) => WMO[c] || ['❓', 'Unknown'];
  const deg = (n) => Math.round(n) + '°';
  const compass = (d) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8];
  const uvLabel = (u) => (u < 3 ? 'Low' : u < 6 ? 'Moderate' : u < 8 ? 'High' : u < 11 ? 'Very high' : 'Extreme');

  let loc = DEFAULT;
  try { loc = JSON.parse(localStorage.getItem('wx-loc')) || DEFAULT; } catch {}

  async function load(force) {
    $('placeName').textContent = loc.name;
    const key = 'wx-data-v2';
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(key)); } catch {}
    const same = cached && cached.lat === loc.lat && cached.lon === loc.lon;
    if (!force && same && Date.now() - cached.at < 15 * 60e3) return render(cached.json, '');
    const q = new URLSearchParams({
      latitude: loc.lat, longitude: loc.lon, timezone: 'auto', forecast_days: 7, wind_speed_unit: 'mph',
      current: 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,precipitation',
      hourly: 'temperature_2m,weather_code,precipitation_probability,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,uv_index_max,wind_gusts_10m_max,wind_speed_10m_max,wind_direction_10m_dominant',
    });
    try {
      const r = await fetch('https://api.open-meteo.com/v1/forecast?' + q);
      if (!r.ok) throw new Error(r.status);
      const json = await r.json();
      try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), lat: loc.lat, lon: loc.lon, json })); } catch {}
      render(json, '');
    } catch {
      if (same) render(cached.json, 'Offline: showing the last saved forecast.');
      else { $('cards').innerHTML = ''; $('note').textContent = 'No forecast available. Check your connection and tap ↻.'; }
    }
  }

  function render(w, note) {
    const c = w.current, d = w.daily, h = w.hourly;
    const [icon, desc] = wmo(c.weather_code);
    const hhmm = (s) => s.slice(11, 16);

    // next 24 hours, starting from the current hour (times are in the location's timezone)
    const start = Math.max(0, h.time.findIndex((t) => t >= c.time.slice(0, 13) + ':00'));
    const hours = Array.from({ length: 8 }, (_, k) => k * 3).map((k) => {
      const i = start + k, t = h.time[i], p = Math.max(...h.precipitation_probability.slice(i, i + 3));
      return `<div class="hour"><div class="t">${k === 0 ? 'Now' : hhmm(t)}</div>
        <div class="i">${wmo(h.weather_code[i])[0]}</div><div>${deg(h.temperature_2m[i])}</div>
        <div class="p">${p >= 20 ? p + '%' : ''}</div>
        <div class="w"><span style="display:inline-block;transform:rotate(${h.wind_direction_10m[i] + 180}deg)">↑</span> ${Math.round(h.wind_speed_10m[i])}</div>
        <div class="g">gust ${Math.round(Math.max(...h.wind_gusts_10m.slice(i, i + 3)))}</div></div>`;
    }).join('');

    const lo = Math.min(...d.temperature_2m_min), hi = Math.max(...d.temperature_2m_max), span = hi - lo || 1;
    const days = d.time.map((t, i) => {
      const name = i === 0 ? 'Today' : new Date(t + 'T12:00').toLocaleDateString('en-GB', { weekday: 'short' });
      const l = ((d.temperature_2m_min[i] - lo) / span) * 100, r = ((hi - d.temperature_2m_max[i]) / span) * 100;
      const p = d.precipitation_probability_max[i];
      return `<div class="dayrow"><span class="d">${name}</span><span class="i">${wmo(d.weather_code[i])[0]}</span>
        <div class="r"><span class="lo">${deg(d.temperature_2m_min[i])}</span>
        <div class="bar"><i style="left:${l}%;right:${r}%"></i></div><span>${deg(d.temperature_2m_max[i])}</span>
        <span class="rain">${p >= 20 ? `<span class="rn">${p}% rain · ${d.precipitation_sum[i].toFixed(1)} mm</span> · ` : ''}Wind ${Math.round(d.wind_speed_10m_max[i])} mph ${compass(d.wind_direction_10m_dominant[i])}, gusts ${Math.round(d.wind_gusts_10m_max[i])}</span></div></div>`;
    }).join('');

    $('cards').innerHTML = `
      <section class="card now">
        <div class="icon">${c.is_day || c.weather_code > 2 ? icon : '🌙'}</div>
        <div><div class="temp">${deg(c.temperature_2m)}</div>
        <div class="desc">${desc}</div>
        <div class="sub">Feels like ${deg(c.apparent_temperature)} · H ${deg(d.temperature_2m_max[0])} L ${deg(d.temperature_2m_min[0])}</div>
        <div class="sub">Wind <span style="display:inline-block;transform:rotate(${c.wind_direction_10m + 180}deg)">↑</span> ${Math.round(c.wind_speed_10m)} mph ${compass(c.wind_direction_10m)} · gusts ${Math.round(c.wind_gusts_10m)}</div></div>
      </section>
      <section class="card"><h2>Next 24 hours <span class="unit">· wind and gusts mph</span></h2><div class="hours">${hours}</div></section>
      <section class="card"><h2>7-day forecast</h2>${days}</section>
      <section class="card"><h2>Details</h2><div class="grid">
        <div><b>${Math.round(c.wind_speed_10m)} mph ${compass(c.wind_direction_10m)}</b><span>Wind (gusts to ${Math.round(d.wind_gusts_10m_max[0])})</span></div>
        <div><b>${c.relative_humidity_2m}%</b><span>Humidity</span></div>
        <div><b>${Math.round(d.uv_index_max[0])} · ${uvLabel(d.uv_index_max[0])}</b><span>UV index today</span></div>
        <div><b>${d.precipitation_sum[0].toFixed(1)} mm</b><span>Rain today</span></div>
        <div><b>${hhmm(d.sunrise[0])}</b><span>Sunrise</span></div>
        <div><b>${hhmm(d.sunset[0])}</b><span>Sunset</span></div>
      </div></section>`;
    $('note').textContent = note || 'Updated ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' · Open-Meteo';
  }

  // ---- location ------------------------------------------------------------
  function setLoc(l) {
    loc = l;
    try { localStorage.setItem('wx-loc', JSON.stringify(l)); } catch {}
    $('searchDialog').close();
    load(true);
  }
  let timer;
  $('q').addEventListener('input', () => {
    clearTimeout(timer);
    const q = $('q').value.trim();
    if (q.length < 2) { $('results').innerHTML = ''; return; }
    timer = setTimeout(async () => {
      try {
        const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=6&name=' + encodeURIComponent(q));
        const res = (await r.json()).results || [];
        $('results').innerHTML = res.map((p, i) =>
          `<button type="button" data-i="${i}">${esc(p.name)} <small>${esc([p.admin1, p.country].filter(Boolean).join(', '))}</small></button>`).join('')
          || '<p class="muted">No matches.</p>';
        $('results').onclick = (e) => {
          const b = e.target.closest('button'); if (!b) return;
          const p = res[b.dataset.i];
          setLoc({ name: p.name, lat: p.latitude, lon: p.longitude });
        };
      } catch { $('results').innerHTML = '<p class="muted">Search needs a connection.</p>'; }
    }, 300);
  });
  $('searchForm').addEventListener('submit', (e) => e.preventDefault());
  $('place').onclick = () => { $('q').value = ''; $('results').innerHTML = ''; $('searchDialog').showModal(); };
  $('cancel').onclick = () => $('searchDialog').close();
  $('here').onclick = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const lat = +p.coords.latitude.toFixed(3), lon = +p.coords.longitude.toFixed(3);
        let name = 'My location';
        try {
          const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en&latitude=${lat}&longitude=${lon}`);
          const g = await r.json();
          name = g.locality || g.city || g.principalSubdivision || name;
        } catch {}
        setLoc({ name, lat, lon });
      },
      () => { $('results').innerHTML = '<p class="muted">Couldn\'t get your location.</p>'; });
  };
  $('refresh').onclick = () => load(true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(false); });

  load(false);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');
})();
