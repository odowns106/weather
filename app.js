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
  // night-time versions of the sun-based icons
  const NIGHT = { '☀️': '🌙', '🌤️': '🌙', '⛅': '☁️', '🌦️': '🌧️' };
  const icon = (c, isDay) => { const i = wmo(c)[0]; return isDay === 0 ? NIGHT[i] || i : i; };
  const deg = (n) => Math.round(n) + '°';
  const compass = (d) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8];
  const uvLabel = (u) => (u < 3 ? 'Low' : u < 6 ? 'Moderate' : u < 8 ? 'High' : u < 11 ? 'Very high' : 'Extreme');

  let loc = DEFAULT;
  try { loc = JSON.parse(localStorage.getItem('wx-loc')) || DEFAULT; } catch {}

  async function load(force) {
    $('placeName').textContent = loc.name;
    const key = 'wx-data-v4';
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(key)); } catch {}
    const same = cached && cached.lat === loc.lat && cached.lon === loc.lon;
    if (!force && same && Date.now() - cached.at < 15 * 60e3) return render(cached.json, '');
    const q = new URLSearchParams({
      latitude: loc.lat, longitude: loc.lon, timezone: 'auto', forecast_days: 7, wind_speed_unit: 'mph',
      current: 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,pressure_msl,precipitation',
      hourly: 'temperature_2m,weather_code,precipitation_probability,pressure_msl,is_day,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
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

  // line chart over the forecast hours; midnight gridlines labelled with the day
  function chart(times, vals, cls, unit, minSpan) {
    const W = 340, H = 130, L = 34, R = 6, T = 8, B = 20;
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < minSpan) { const m = (hi + lo) / 2; lo = m - minSpan / 2; hi = m + minSpan / 2; }
    const x = (i) => L + (i / (vals.length - 1)) * (W - L - R), y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const grid = times.map((t, i) => t.slice(11, 13) === '00' ? i : -1).filter((i) => i > 0).map((i) => {
      const day = new Date(times[i].slice(0, 10) + 'T12:00').toLocaleDateString('en-GB', { weekday: 'short' });
      return `<line class="g" x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${H - B}"/><text class="a" x="${x(i + 12)}" y="${H - 5}" text-anchor="middle">${day}</text>`;
    }).join('');
    const tick = (v) => `<text class="a" x="${L - 4}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${unit} over the next days">
      <line class="g" x1="${L}" x2="${W - R}" y1="${y(hi)}" y2="${y(hi)}"/><line class="g" x1="${L}" x2="${W - R}" y1="${y(lo)}" y2="${y(lo)}"/>
      ${grid}${tick(hi)}${tick(lo)}<path class="${cls}" d="${line}"/></svg>`;
  }

  function render(w, note) {
    const c = w.current, d = w.daily, h = w.hourly;
    const desc = wmo(c.weather_code)[1];
    const hhmm = (s) => s.slice(11, 16);

    // next 24 hours, starting from the current hour (times are in the location's timezone)
    const start = Math.max(0, h.time.findIndex((t) => t >= c.time.slice(0, 13) + ':00'));
    const hours = Array.from({ length: 8 }, (_, k) => k * 3).map((k) => {
      const i = start + k, t = h.time[i], p = Math.max(...h.precipitation_probability.slice(i, i + 3));
      return `<div class="hour"><div class="t">${k === 0 ? 'Now' : hhmm(t)}</div>
        <div class="i">${icon(h.weather_code[i], h.is_day[i])}</div><div>${deg(h.temperature_2m[i])}</div>
        <div class="p">${p >= 20 ? p + '%' : ''}</div>
        <div class="w"><span style="display:inline-block;transform:rotate(${h.wind_direction_10m[i] + 180}deg)">↑</span> ${Math.round(h.wind_speed_10m[i])}</div>
        <div class="g">gust ${Math.round(Math.max(...h.wind_gusts_10m.slice(i, i + 3)))}</div></div>`;
    }).join('');

    const ct = h.time.slice(start), cT = h.temperature_2m.slice(start), cP = h.pressure_msl.slice(start);
    const p3 = h.pressure_msl[Math.max(0, start - 3)], dp = c.pressure_msl - p3;
    const trend = Math.abs(dp) < 1 ? 'steady' : dp > 0 ? 'rising' : 'falling';
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
      <div id="alerts" class="alerts"></div>
      <section class="card now">
        <div class="icon">${icon(c.weather_code, c.is_day)}</div>
        <div><div class="temp">${deg(c.temperature_2m)}</div>
        <div class="desc">${desc}</div>
        <div class="sub">Feels like ${deg(c.apparent_temperature)} · H ${deg(d.temperature_2m_max[0])} L ${deg(d.temperature_2m_min[0])}</div>
        <div class="sub">Wind <span style="display:inline-block;transform:rotate(${c.wind_direction_10m + 180}deg)">↑</span> ${Math.round(c.wind_speed_10m)} mph ${compass(c.wind_direction_10m)} · gusts ${Math.round(c.wind_gusts_10m)}</div>
        <div class="sub">Pressure ${Math.round(c.pressure_msl)} hPa · ${trend}</div></div>
      </section>
      <section class="card"><h2>Next 24 hours <span class="unit">· wind and gusts mph</span></h2><div class="hours">${hours}</div></section>
      <section class="card"><h2>Temperature <span class="unit">· °C</span></h2>${chart(ct, cT, 'temp', '°C', 6)}
        <h2 class="gap">Pressure <span class="unit">· hPa</span></h2>${chart(ct, cP, 'pres', 'hPa', 20)}</section>
      <section class="card"><h2>7-day forecast</h2>${days}</section>
      <section class="card"><h2>Details</h2><div class="grid">
        <div><b>${Math.round(c.wind_speed_10m)} mph ${compass(c.wind_direction_10m)}</b><span>Wind (gusts to ${Math.round(d.wind_gusts_10m_max[0])})</span></div>
        <div><b>${c.relative_humidity_2m}%</b><span>Humidity</span></div>
        <div><b>${Math.round(d.uv_index_max[0])} · ${uvLabel(d.uv_index_max[0])}</b><span>UV index today</span></div>
        <div><b>${d.precipitation_sum[0].toFixed(1)} mm</b><span>Rain today</span></div>
        <div><b>${hhmm(d.sunrise[0])}</b><span>Sunrise</span></div>
        <div><b>${hhmm(d.sunset[0])}</b><span>Sunset</span></div>
      </div></section>`;
    showWarnings();
    $('note').textContent = note || 'Updated ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' · Open-Meteo';
  }

  // ---- warnings (Met Office, via warnings.json refreshed by a GitHub Action) --
  const inPoly = (lat, lon, poly) => {
    let ins = false;
    for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
      const [y1, x1] = poly[i], [y2, x2] = poly[k];
      if ((y1 > lat) !== (y2 > lat) && lon < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) ins = !ins;
    }
    return ins;
  };
  const RANK = { red: 3, amber: 2, yellow: 1 };
  const when = (iso) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  async function showWarnings() {
    const el = $('alerts'); if (!el) return;
    let data;
    try { const r = await fetch('warnings.json', { cache: 'no-cache' }); if (!r.ok) return; data = await r.json(); } catch { return; }
    const now = Date.now(), at = loc;
    const hits = data.warnings
      .filter((w) => new Date(w.expires) > now && w.areas.some((a) => a.polygons.some((p) => inPoly(at.lat, at.lon, p))))
      .sort((a, b) => RANK[b.level] - RANK[a.level] || new Date(a.onset) - new Date(b.onset));
    if (at !== loc) return;
    el.innerHTML = hits.map((w) => {
      const live = new Date(w.onset) <= now;
      return `<details class="warn ${w.level}"><summary><b>${esc(w.event)}</b>
        <span>${live ? 'In force until ' + when(w.expires) : 'From ' + when(w.onset) + ' to ' + when(w.expires)}</span></summary>
        <p>${esc(w.headline)}</p><p>${esc(w.description)}</p>
        ${w.impacts.length ? '<ul>' + w.impacts.map((i) => `<li>${esc(i)}</li>`).join('') + '</ul>' : ''}
        <p class="muted"><a href="${esc(w.web)}" target="_blank" rel="noopener">Met Office warnings</a> · checked ${when(data.updated)}</p></details>`;
    }).join('');
  }

  // ---- location ------------------------------------------------------------
  async function placeName(lat, lon) {
    try {
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en&latitude=${lat}&longitude=${lon}`);
      const g = await r.json();
      return g.locality || g.city || g.principalSubdivision || 'My location';
    } catch { return 'My location'; }
  }
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
    const msg = (t) => { $('results').innerHTML = `<p class="muted">${t}</p>`; };
    if (!navigator.geolocation || !window.isSecureContext) return msg('Location needs the https version of the app (odowns106.github.io/weather).');
    msg('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const lat = +p.coords.latitude.toFixed(3), lon = +p.coords.longitude.toFixed(3);
        const name = await placeName(lat, lon);
        setLoc({ name, lat, lon });
      },
      (e) => msg(e.code === 1 ? 'Location permission was denied. Allow it in your browser settings.' : 'Couldn\'t get your location.'),
      { timeout: 15000 });
  };
  $('refresh').onclick = async () => {
    const b = $('refresh');
    if (b.classList.contains('busy')) return;
    b.classList.add('busy');
    $('note').textContent = 'Updating…';
    await Promise.all([load(true), new Promise((r) => setTimeout(r, 700))]);
    b.classList.remove('busy');
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(false); });

  load(false);
  // a location saved earlier as "My location" gets its real name now
  if (loc.name === 'My location') placeName(loc.lat, loc.lon).then((name) => {
    if (name === 'My location') return;
    loc = { ...loc, name };
    try { localStorage.setItem('wx-loc', JSON.stringify(loc)); } catch {}
    $('placeName').textContent = name;
  });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');
})();
