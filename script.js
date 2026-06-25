const API_KEY = '7b69d1d616b6ed7ff863a457f311bc77';   // ← Replace with your key
const API_URL      = 'https://api.openweathermap.org/data/2.5/weather';
const AQI_URL      = 'https://api.openweathermap.org/data/2.5/air_pollution';
const FORECAST_URL = 'https://api.openweathermap.org/data/2.5/forecast';

/* ── DOM refs ── */
const cityInput    = document.getElementById('cityInput');
const searchBtn    = document.getElementById('searchBtn');
const geoBtn       = document.getElementById('geoBtn');
const micBtn       = document.getElementById('micBtn');
const micIco       = document.getElementById('micIco');
const listeningTag = document.getElementById('listeningTag');
const msgBox       = document.getElementById('msgBox');
const loader       = document.getElementById('loader');
const dashboard    = document.getElementById('dashboard');
const speakBtn     = document.getElementById('speakBtn');
const speakLabel   = document.getElementById('speakLabel');
const stopBtn      = document.getElementById('stopBtn');
const particles    = document.getElementById('particles');

/* ── State ── */
let weatherData = null;
let ltInterval  = null;
let isSpeaking  = false;

/* ════════════════════════════════════════
   INITIALISE
════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  tickSystemClock();
  setInterval(tickSystemClock, 1000);

  if (API_KEY === 'YOUR_API_KEY') {
    showMsg('⚠️ Add your free API key in script.js — get it at openweathermap.org/api', 'info');
    return;
  }

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      p => fetchByCoords(p.coords.latitude, p.coords.longitude),
      () => showMsg('Enter a city name, or allow location access to begin.', 'info')
    );
  } else {
    showMsg('Enter a city name to get started.', 'info');
  }
});

/* ════════════════════════════════════════
   SYSTEM CLOCK
════════════════════════════════════════ */
function tickSystemClock() {
  const n = new Date();
  document.getElementById('clockTime').textContent =
    n.toLocaleTimeString('en-GB', { hour12: false });
  document.getElementById('clockDate').textContent =
    n.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

/* ════════════════════════════════════════
   CITY LOCAL TIME
════════════════════════════════════════ */
function startCityTimer(tzOffsetSec) {
  if (ltInterval) clearInterval(ltInterval);
  const tick = () => {
    const cityMs = Date.now() + tzOffsetSec * 1000;
    const d = new Date(cityMs);
    const H = d.getUTCHours()  .toString().padStart(2,'0');
    const M = d.getUTCMinutes().toString().padStart(2,'0');
    const S = d.getUTCSeconds().toString().padStart(2,'0');
    document.getElementById('ltTime').textContent = `${H}:${M}:${S}`;
    document.getElementById('ltDate').textContent =
      new Date(cityMs).toLocaleDateString('en-US', {
        weekday:'long', year:'numeric', month:'long', day:'numeric', timeZone:'UTC'
      });
  };
  tick();
  ltInterval = setInterval(tick, 1000);
}

/* ════════════════════════════════════════
   SEARCH HANDLERS
════════════════════════════════════════ */
searchBtn.addEventListener('click', doSearch);
cityInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

geoBtn.addEventListener('click', () => {
  if (!navigator.geolocation) { showMsg('Geolocation not supported by your browser.', 'err'); return; }
  showLoader();
  navigator.geolocation.getCurrentPosition(
    p => fetchByCoords(p.coords.latitude, p.coords.longitude),
    () => showMsg('Location access denied or unavailable. Try searching by city name.', 'err')
  );
});

function doSearch() {
  const city = cityInput.value.trim();
  if (!city) { showMsg('Please type a city name first.', 'err'); return; }
  fetchByCity(city);
}

/* ════════════════════════════════════════
   API FETCH — current + AQI + forecast
════════════════════════════════════════ */
async function fetchByCity(city) {
  showLoader();
  try {
    const r = await fetch(`${API_URL}?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`);
    const d = await r.json();
    if (!r.ok) { showMsg(d.message || 'City not found. Please try again.', 'err'); return; }
    render(d);
    fetchAQI(d.coord.lat, d.coord.lon);
    fetchForecast(d.coord.lat, d.coord.lon, d.timezone);
  } catch {
    showMsg('Network error. Please check your connection.', 'err');
  }
}

async function fetchByCoords(lat, lon) {
  showLoader();
  try {
    const r = await fetch(`${API_URL}?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`);
    const d = await r.json();
    if (!r.ok) { showMsg('Could not load weather for your location.', 'err'); return; }
    render(d);
    fetchAQI(lat, lon);
    fetchForecast(lat, lon, d.timezone);
  } catch {
    showMsg('Network error. Please check your connection.', 'err');
  }
}

/* ════════════════════════════════════════
   AQI FETCH & RENDER — US EPA Standard
════════════════════════════════════════ */
async function fetchAQI(lat, lon) {
  try {
    const r = await fetch(`${AQI_URL}?lat=${lat}&lon=${lon}&appid=${API_KEY}`);
    const d = await r.json();
    if (r.ok && d.list && d.list.length) renderAQI(d.list[0]);
  } catch { /* silently skip */ }
}

/* ── US EPA AQI calculation from PM2.5 concentration ── */
function calcPM25AQI(pm25) {
  // EPA breakpoint table: [cLow, cHigh, iLow, iHigh]
  const bps = [
    [   0.0,   12.0,    0,   50 ],
    [  12.1,   35.4,   51,  100 ],
    [  35.5,   55.4,  101,  150 ],
    [  55.5,  150.4,  151,  200 ],
    [ 150.5,  250.4,  201,  300 ],
    [ 250.5,  350.4,  301,  400 ],
    [ 350.5,  500.4,  401,  500 ]
  ];
  const pm  = Math.min(Math.max(parseFloat(pm25) || 0, 0), 500.4);
  const bp  = bps.find(b => pm >= b[0] && pm <= b[1]) || bps[bps.length - 1];
  return Math.round(((bp[3] - bp[2]) / (bp[1] - bp[0])) * (pm - bp[0]) + bp[2]);
}

function renderAQI(item) {
  const comp = item.components;
  const pm25 = comp.pm2_5 ?? 0;
  const aqi  = calcPM25AQI(pm25);   // real US EPA AQI (0–500)

  // US EPA AQI categories
  const levels = [
    { max:  50, label: 'Good',           cls: 'aqi-good',
      desc: 'Air quality is satisfactory and poses little or no risk to health.' },
    { max: 100, label: 'Moderate',       cls: 'aqi-fair',
      desc: 'Acceptable air quality. Unusually sensitive individuals should limit prolonged outdoor exertion.' },
    { max: 150, label: 'Unhealthy (SG)', cls: 'aqi-moderate',
      desc: 'Sensitive groups (children, elderly, people with respiratory conditions) may experience health effects.' },
    { max: 200, label: 'Unhealthy',      cls: 'aqi-poor',
      desc: 'Everyone may begin to experience health effects. Sensitive groups face more serious effects.' },
    { max: 300, label: 'Very Unhealthy', cls: 'aqi-vpoor',
      desc: 'Health alert — everyone may experience serious health effects. Avoid prolonged outdoor activity.' },
    { max: 500, label: 'Hazardous',      cls: 'aqi-vpoor',
      desc: 'Health emergency. The entire population is likely to be affected. Stay indoors.' }
  ];

  const lvl = levels.find(l => aqi <= l.max) || levels[levels.length - 1];

  // Smooth pointer: 0–300 → 0–90%, 300–500 → 90–97%
  const pos = aqi <= 300
    ? (aqi / 300) * 90
    : 90 + ((aqi - 300) / 200) * 7;

  document.getElementById('aqiValue').textContent  = aqi;
  const badge = document.getElementById('aqiBadge');
  badge.className = `aqi-label-badge ${lvl.cls}`;
  document.getElementById('aqiLabel').textContent  = lvl.label;
  document.getElementById('aqiDesc').textContent   = lvl.desc;
  document.getElementById('aqiPointer').style.left = `${Math.min(pos, 97).toFixed(1)}%`;

  const polls = [
    { name:'PM2.5', val: comp.pm2_5 !== undefined ? comp.pm2_5.toFixed(1)     : '—', unit:'µg/m³' },
    { name:'PM10',  val: comp.pm10  !== undefined ? comp.pm10.toFixed(1)      : '—', unit:'µg/m³' },
    { name:'O₃',    val: comp.o3    !== undefined ? comp.o3.toFixed(1)        : '—', unit:'µg/m³' },
    { name:'NO₂',   val: comp.no2   !== undefined ? comp.no2.toFixed(1)       : '—', unit:'µg/m³' },
    { name:'SO₂',   val: comp.so2   !== undefined ? comp.so2.toFixed(1)       : '—', unit:'µg/m³' },
    { name:'CO',    val: comp.co    !== undefined ? (comp.co/1000).toFixed(2) : '—', unit:'mg/m³' }
  ];

  document.getElementById('aqiPollutants').innerHTML = polls.map(p => `
    <div class="poll-item">
      <div class="poll-name">${p.name}</div>
      <div class="poll-value">${p.val}</div>
      <div class="poll-unit">${p.unit}</div>
    </div>
  `).join('');
}

/* ════════════════════════════════════════
   5-DAY FORECAST FETCH & RENDER
════════════════════════════════════════ */
async function fetchForecast(lat, lon, tzOffset) {
  try {
    const r = await fetch(`${FORECAST_URL}?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`);
    const d = await r.json();
    if (r.ok && d.list) renderForecast(d.list, tzOffset);
  } catch { /* silently skip */ }
}

function renderForecast(list, tzOffset) {
  const days = {};
  list.forEach(item => {
    const localMs = (item.dt + tzOffset) * 1000;
    const dayKey  = new Date(localMs).toISOString().slice(0, 10);
    if (!days[dayKey]) days[dayKey] = [];
    days[dayKey].push(item);
  });

  const today   = new Date((Date.now() / 1000 + tzOffset) * 1000).toISOString().slice(0, 10);
  const dayKeys = Object.keys(days).filter(k => k >= today).sort().slice(0, 5);

  const grid = document.getElementById('forecastGrid');
  grid.innerHTML = '';

  dayKeys.forEach((key, index) => {
    const items  = days[key];
    const temps  = items.map(i => i.main.temp);
    const maxT   = Math.round(Math.max(...temps));
    const minT   = Math.round(Math.min(...temps));

    const mid = items.reduce((best, cur) => {
      const h = new Date((cur.dt + tzOffset) * 1000).getUTCHours();
      return Math.abs(h - 12) < Math.abs(new Date((best.dt + tzOffset) * 1000).getUTCHours() - 12)
        ? cur : best;
    }, items[0]);

    const wid       = mid.weather[0].id;
    const desc      = mid.weather[0].description;
    const pop       = Math.round((mid.pop || 0) * 100);
    const emoji     = getForecastEmoji(wid);
    const dateObj   = new Date(key + 'T12:00:00Z');
    const dayLabel  = index === 0 ? 'Today' : dateObj.toLocaleDateString('en-US', { weekday:'short', timeZone:'UTC' });
    const dateLabel = dateObj.toLocaleDateString('en-US', { month:'short', day:'numeric', timeZone:'UTC' });
    const rainPercent = pop > 0 ? `<div class="fc-rain"><i class="fas fa-droplet"></i> ${pop}%</div>` : '';

    grid.innerHTML += `
      <div class="fc-day">
        <div class="fc-day-name">${dayLabel}</div>
        <div class="fc-day-date">${dateLabel}</div>
        <span class="fc-emoji">${emoji}</span>
        <div class="fc-desc">${desc}</div>
        <div class="fc-temps">
          <span class="fc-hi">${maxT}°</span>
          <span class="fc-separator">/</span>
          <span class="fc-lo">${minT}°</span>
        </div>
        ${rainPercent}
      </div>
    `;
  });
}

function getForecastEmoji(wid) {
  if (wid >= 200 && wid < 300) return '⛈️';
  if (wid >= 300 && wid < 400) return '🌦️';
  if (wid >= 500 && wid < 600) return '🌧️';
  if (wid >= 600 && wid < 700) return '❄️';
  if (wid >= 700 && wid < 800) return '🌫️';
  if (wid === 800)              return '☀️';
  if (wid <= 802)               return '⛅';
  return '☁️';
}

/* ════════════════════════════════════════
   RENDER CURRENT WEATHER
════════════════════════════════════════ */
function render(d) {
  weatherData = d;
  const { name, sys, main, weather, wind, visibility, clouds, timezone, dt } = d;
  const wid   = weather[0].id;
  const night = (dt < sys.sunrise || dt > sys.sunset);

  applyTheme(wid, night);
  spawnParticles(wid, night);
  setEmoji(wid, night);

  document.getElementById('cityName')    .textContent = name;
  document.getElementById('countryBadge').textContent = sys.country;
  document.getElementById('bigTemp')     .textContent = `${Math.round(main.temp)}°`;
  document.getElementById('weatherDesc') .textContent = weather[0].description;
  document.getElementById('feelsLike')   .textContent = `Feels like ${Math.round(main.feels_like)}°C`;
  document.getElementById('tempHi')      .textContent = `${Math.round(main.temp_max)}°C`;
  document.getElementById('tempLo')      .textContent = `${Math.round(main.temp_min)}°C`;

  document.getElementById('humidity')  .textContent = `${main.humidity}%`;
  document.getElementById('windSpeed') .textContent = `${Math.round(wind.speed * 3.6)} km/h`;
  document.getElementById('visibility').textContent = visibility ? `${(visibility/1000).toFixed(1)} km` : 'N/A';
  document.getElementById('pressure')  .textContent = `${main.pressure} hPa`;
  document.getElementById('cloudCover').textContent = `${clouds.all}%`;
  const dew = main.temp - ((100 - main.humidity) / 5);
  document.getElementById('dewPoint')  .textContent = `${Math.round(dew)}°C`;

  document.getElementById('sunriseTime').textContent = utcToLocal(sys.sunrise, timezone);
  document.getElementById('sunsetTime') .textContent = utcToLocal(sys.sunset,  timezone);
  const dayS = sys.sunset - sys.sunrise;
  document.getElementById('dayDur').textContent =
    `Day: ${Math.floor(dayS / 3600)}h ${Math.floor((dayS % 3600) / 60)}m`;
  animateSunArc(sys.sunrise, sys.sunset, dt);

  document.getElementById('ltCity').textContent = name;
  startCityTimer(timezone);

  hideLoader(); hideMsg();
  dashboard.hidden = false;
  requestAnimationFrame(() => dashboard.classList.add('show'));
}

/* ════════════════════════════════════════
   THEME
════════════════════════════════════════ */
function applyTheme(wid, night) {
  document.body.className = '';
  if (night)                        { document.body.classList.add('theme-night');   return; }
  if (wid >= 200 && wid < 300)        document.body.classList.add('theme-thunder');
  else if (wid >= 300 && wid < 400)   document.body.classList.add('theme-drizzle');
  else if (wid >= 500 && wid < 600)   document.body.classList.add('theme-rain');
  else if (wid >= 600 && wid < 700)   document.body.classList.add('theme-snow');
  else if (wid >= 700 && wid < 800)   document.body.classList.add('theme-mist');
  else if (wid === 800)               document.body.classList.add('theme-clear');
  else                                document.body.classList.add('theme-cloud');
}

/* ════════════════════════════════════════
   WEATHER EMOJI HERO
════════════════════════════════════════ */
function setEmoji(wid, night) {
  const el = document.getElementById('weatherEmoji');
  el.className = 'weather-emoji';
  let emoji = '🌤️', cls = 'emoji-cloud';
  if (night)                        { emoji = '🌙'; cls = 'emoji-moon'; }
  else if (wid >= 200 && wid < 300) { emoji = '⛈️'; cls = 'emoji-thunder'; }
  else if (wid >= 300 && wid < 400) { emoji = '🌦️'; cls = 'emoji-rain'; }
  else if (wid >= 500 && wid < 600) { emoji = '🌧️'; cls = 'emoji-rain'; }
  else if (wid >= 600 && wid < 700) { emoji = '❄️';  cls = 'emoji-snow'; }
  else if (wid >= 700 && wid < 800) { emoji = '🌫️'; cls = 'emoji-mist'; }
  else if (wid === 800)             { emoji = '☀️';  cls = 'emoji-sun'; }
  else if (wid <= 802)              { emoji = '⛅';  cls = 'emoji-cloud'; }
  else                              { emoji = '☁️';  cls = 'emoji-cloud'; }
  el.textContent = emoji;
  el.classList.add(cls);
}

/* ════════════════════════════════════════
   PARTICLES ENGINE
════════════════════════════════════════ */
function spawnParticles(wid, night) {
  particles.innerHTML = '';
  if      (wid >= 200 && wid < 300)  { makeRain(90); makeLightning(); }
  else if (wid >= 300 && wid < 400)  makeRain(45);
  else if (wid >= 500 && wid < 600)  makeRain(130);
  else if (wid >= 600 && wid < 700)  makeSnow(75);
  else if (wid >= 700 && wid < 800)  makeMist();
  else if (wid === 800 && night)     makeStars(100);
  else if (wid === 800)              makeSunGlow();
  else                               makeClouds(8);
  if (night && wid !== 800)          makeStars(55);
}

const rnd = (a, b) => a + Math.random() * (b - a);

function makeRain(n) {
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'drop';
    Object.assign(el.style, {
      left: `${rnd(0,100)}%`, height: `${rnd(12,24)}px`,
      animationDuration: `${rnd(0.55,1.05).toFixed(2)}s`,
      animationDelay: `-${rnd(0,4).toFixed(2)}s`,
      opacity: rnd(0.28,0.72).toFixed(2)
    });
    particles.appendChild(el);
  }
}

function makeSnow(n) {
  const chars = ['❄','❅','❆','·','•'];
  for (let i = 0; i < n; i++) {
    const el = document.createElement('span');
    el.className = 'flake';
    el.textContent = chars[Math.floor(Math.random() * chars.length)];
    Object.assign(el.style, {
      left: `${rnd(0,100)}%`, fontSize: `${rnd(0.7,1.6).toFixed(1)}rem`,
      animationDuration: `${rnd(6,13).toFixed(1)}s`,
      animationDelay: `-${rnd(0,12).toFixed(1)}s`
    });
    particles.appendChild(el);
  }
}

function makeStars(n) {
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'star';
    const s = rnd(1, 3.2);
    Object.assign(el.style, {
      left: `${rnd(0,100)}%`, top: `${rnd(0,68)}%`,
      width: `${s}px`, height: `${s}px`,
      animationDuration: `${rnd(1.4,4).toFixed(1)}s`,
      animationDelay: `${rnd(0,5).toFixed(1)}s`
    });
    particles.appendChild(el);
  }
}

function makeLightning() {
  const el = document.createElement('div');
  el.className = 'flash';
  particles.appendChild(el);
}

function makeClouds(n) {
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'cloudp';
    const w = rnd(100,220), h = w * 0.36;
    Object.assign(el.style, {
      top: `${rnd(2,42)}%`, width: `${w}px`, height: `${h}px`,
      animationDuration: `${rnd(25,50).toFixed(0)}s`,
      animationDelay: `-${rnd(0,35).toFixed(0)}s`
    });
    particles.appendChild(el);
  }
}

function makeSunGlow() {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position:'fixed', top:'-90px', right:'-90px',
    width:'380px', height:'380px',
    background:'radial-gradient(circle, rgba(255,215,50,0.13) 0%, transparent 68%)',
    borderRadius:'50%', animation:'epulse 5s ease-in-out infinite', pointerEvents:'none'
  });
  particles.appendChild(el);
}

function makeMist() {
  for (let i = 0; i < 7; i++) {
    const el = document.createElement('div');
    el.className = 'cloudp';
    Object.assign(el.style, {
      top: `${12 + i * 11}%`, width: `${rnd(250,450)}px`,
      height: `${rnd(30,65)}px`, animationDuration: `${55 + i * 8}s`,
      animationDelay: `-${i * 7}s`, opacity:'0.14'
    });
    particles.appendChild(el);
  }
}

/* ════════════════════════════════════════
   SUN ARC ANIMATION
════════════════════════════════════════ */
function animateSunArc(sunrise, sunset, now) {
  const total    = sunset - sunrise;
  const elapsed  = Math.min(Math.max(now - sunrise, 0), total);
  const progress = elapsed / total;
  const L = Math.PI * 95;
  document.getElementById('arcFill').style.strokeDashoffset = (L * (1 - progress)).toFixed(2);
  const angle = Math.PI * (1 - progress);
  const cx = 110 + 95 * Math.cos(angle);
  const cy = 100 - 95 * Math.sin(angle);
  document.getElementById('sunBall').setAttribute('cx', cx.toFixed(2));
  document.getElementById('sunBall').setAttribute('cy', cy.toFixed(2));
}

/* ════════════════════════════════════════
   VOICE SEARCH
════════════════════════════════════════ */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  const rec = new SR();
  rec.continuous = false; rec.interimResults = false; rec.lang = 'en-US';

  micBtn.addEventListener('click', () => {
    try { rec.start(); } catch (e) {}
    micBtn.classList.add('active');
    micIco.className = 'fas fa-microphone-slash';
    listeningTag.hidden = false;
  });

  rec.onresult = e => {
    const city = e.results[0][0].transcript.trim();
    cityInput.value = city;
    fetchByCity(city);
    stopRec();
  };
  rec.onerror = rec.onend = stopRec;

  function stopRec() {
    micBtn.classList.remove('active');
    micIco.className = 'fas fa-microphone';
    listeningTag.hidden = true;
    try { rec.stop(); } catch (e) {}
  }
} else {
  micBtn.disabled = true;
  micBtn.title = 'Voice search not supported in this browser (use Chrome)';
  micBtn.style.opacity = '0.35';
}

/* ════════════════════════════════════════
   VOICE ASSISTANT (TTS)
════════════════════════════════════════ */
speakBtn.addEventListener('click', () => {
  if (!weatherData || isSpeaking) return;
  if (!('speechSynthesis' in window)) {
    showMsg('Text-to-speech is not supported in your browser.', 'err'); return;
  }

  const d = weatherData;
  const srText = utcToLocal(d.sys.sunrise, d.timezone);
  const ssText = utcToLocal(d.sys.sunset,  d.timezone);

  const script = `
    Weather update for ${d.name}, ${d.sys.country}.
    Current temperature is ${Math.round(d.main.temp)} degrees Celsius,
    feels like ${Math.round(d.main.feels_like)} degrees.
    Weather: ${d.weather[0].description}.
    Humidity ${d.main.humidity} percent.
    Wind speed ${Math.round(d.wind.speed * 3.6)} kilometres per hour.
    Pressure ${d.main.pressure} hectopascals. Cloud cover ${d.clouds.all} percent.
    ${d.visibility ? `Visibility ${(d.visibility/1000).toFixed(1)} kilometres.` : ''}
    Sunrise at ${srText} and sunset at ${ssText} local time. Have a wonderful day!
  `.replace(/\s+/g,' ').trim();

  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(script);
  utt.rate = 0.88; utt.pitch = 1.05; utt.volume = 1;

  const pickVoice = () => {
    const vs = window.speechSynthesis.getVoices();
    return vs.find(v => v.lang.startsWith('en') && /google|natural|premium/i.test(v.name))
        || vs.find(v => v.lang.startsWith('en-US'))
        || vs.find(v => v.lang.startsWith('en')) || null;
  };

  utt.onstart = () => {
    isSpeaking = true;
    speakBtn.classList.add('on');
    speakLabel.textContent = 'Reading aloud…';
    stopBtn.hidden = false;
  };
  const onEnd = () => {
    isSpeaking = false;
    speakBtn.classList.remove('on');
    speakLabel.textContent = 'Read Weather Aloud';
    stopBtn.hidden = true;
  };
  utt.onend = utt.onerror = onEnd;

  const v = pickVoice();
  if (v) { utt.voice = v; window.speechSynthesis.speak(utt); }
  else {
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      const v2 = pickVoice(); if (v2) utt.voice = v2;
      window.speechSynthesis.speak(utt);
    }, { once: true });
    setTimeout(() => { if (!isSpeaking) window.speechSynthesis.speak(utt); }, 300);
  }
});

stopBtn.addEventListener('click', () => {
  window.speechSynthesis.cancel();
  isSpeaking = false;
  speakBtn.classList.remove('on');
  speakLabel.textContent = 'Read Weather Aloud';
  stopBtn.hidden = true;
});

/* ════════════════════════════════════════
   UTILITIES
════════════════════════════════════════ */
function utcToLocal(unixSec, tzOffsetSec) {
  const d = new Date((unixSec + tzOffsetSec) * 1000);
  const H = d.getUTCHours()  .toString().padStart(2,'0');
  const M = d.getUTCMinutes().toString().padStart(2,'0');
  return `${H}:${M}`;
}

function showLoader() {
  loader.hidden = false; dashboard.hidden = true;
  dashboard.classList.remove('show'); hideMsg();
}
function hideLoader() { loader.hidden = true; }

function showMsg(text, type) {
  hideLoader();
  msgBox.textContent = text; msgBox.className = `msg-box ${type}`;
  msgBox.hidden = false; dashboard.hidden = true;
  dashboard.classList.remove('show');
}
function hideMsg() { msgBox.hidden = true; }