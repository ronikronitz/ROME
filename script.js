// Simple Rome Trip Planner – Vanilla JS, localStorage persistence

/** @typedef {{ time: string, title: string, location?: string, category?: string, notes?: string }} Activity */
/** @typedef {{ id: string, title: string, activities: Activity[] }} DayPlan */

const STORAGE_KEY = 'rome_trip_planner_v1';
const THEME_KEY = 'rome_trip_theme';

/** @type {DayPlan[]} */
let days = [];
let activeDayIndex = 0;

// Elements
const dayListEl = document.getElementById('day-list');
const dayTitleInput = document.getElementById('day-title');
const activityListEl = document.getElementById('activity-list');
const newTimeInput = document.getElementById('new-time');
const newTitleInput = document.getElementById('new-title');
const newCategorySelect = document.getElementById('new-category');

// Buttons
const btnAddDay = document.getElementById('btn-add-day');
const btnDeleteDay = document.getElementById('btn-delete-day');
const btnDuplicateDay = document.getElementById('btn-duplicate-day');
const btnAddActivity = document.getElementById('btn-add-activity');
const btnPrint = document.getElementById('btn-print');
const btnExport = document.getElementById('btn-export');
const fileImport = document.getElementById('file-import');
const btnClear = document.getElementById('btn-clear');
const btnTheme = document.getElementById('btn-theme');
const btnLayout = document.getElementById('btn-layout');
const btnViewMode = document.getElementById('btn-view-mode');

const tplDayItem = document.getElementById('tpl-day-item');
const tplActivityItem = document.getElementById('tpl-activity-item');
const btnDayMap = document.getElementById('btn-day-map');
const mapModal = document.getElementById('map-modal');
const mapClose = document.getElementById('map-close');
const btnCleanDup = document.getElementById('btn-clean-dup');
let leafletMap = null;
let leafletLayerGroup = null;
let draggingFromIndex = null;
let dndBound = false;

function uid(){
  return Math.random().toString(36).slice(2,10);
}

function save(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ days, activeDayIndex }));
}

function load(){
  const raw = localStorage.getItem(STORAGE_KEY);
  // Theme first
  const savedTheme = localStorage.getItem(THEME_KEY);
  applyTheme(savedTheme === 'light' ? 'light' : 'dark');
  // Layout
  const savedLayout = localStorage.getItem('rome_trip_layout');
  applyLayout(savedLayout === 'list' ? 'list' : 'grid');
  // Viewer mode via URL ?view=1
  const params = new URLSearchParams(location.search);
  const isView = params.get('view') === '1';
  if(isView){
    document.body.setAttribute('data-view','1');
  }
  if(!raw){
    days = getSampleTemplate();
    activeDayIndex = 0;
    save();
    return;
  }
  try{
    const parsed = JSON.parse(raw);
    days = Array.isArray(parsed.days) ? parsed.days : getSampleTemplate();
    activeDayIndex = Number.isInteger(parsed.activeDayIndex) ? parsed.activeDayIndex : 0;
  }catch{
    days = getSampleTemplate();
    activeDayIndex = 0;
  }
}

function applyTheme(theme){
  const isLight = theme === 'light';
  document.body.setAttribute('data-theme', isLight ? 'light' : 'dark');
  const label = isLight ? 'Dark' : 'Light';
  if(btnTheme) btnTheme.textContent = label;
  localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark');
}

function applyLayout(layout){
  const isList = layout === 'list';
  document.body.setAttribute('data-layout', isList ? 'list' : 'grid');
  if(btnLayout) btnLayout.textContent = isList ? 'Grid' : 'List';
  localStorage.setItem('rome_trip_layout', isList ? 'list' : 'grid');
}

function render(){
  // Sidebar days
  dayListEl.innerHTML = '';
  days.forEach((day, idx) => {
    const node = tplDayItem.content.firstElementChild.cloneNode(true);
    const btn = node.querySelector('.day-button');
    btn.textContent = day.title || `Day ${idx+1}`;
    node.setAttribute('aria-selected', String(idx === activeDayIndex));
    btn.addEventListener('click', () => {
      activeDayIndex = idx; save(); render();
    });
    node.querySelector('.up').addEventListener('click', (e)=>{
      e.stopPropagation();
      if(idx>0){
        [days[idx-1], days[idx]] = [days[idx], days[idx-1]];
        if(activeDayIndex===idx) activeDayIndex=idx-1; else if(activeDayIndex===idx-1) activeDayIndex=idx;
        save(); render();
      }
    });
    node.querySelector('.down').addEventListener('click', (e)=>{
      e.stopPropagation();
      if(idx<days.length-1){
        [days[idx+1], days[idx]] = [days[idx], days[idx+1]];
        if(activeDayIndex===idx) activeDayIndex=idx+1; else if(activeDayIndex===idx+1) activeDayIndex=idx;
        save(); render();
      }
    });
    dayListEl.appendChild(node);
  });

  // Active day details
  const active = days[activeDayIndex];
  if(!active){
    dayTitleInput.value = '';
    activityListEl.innerHTML = '';
    return;
  }
  dayTitleInput.value = active.title || '';

  activityListEl.innerHTML = '';
  active.activities.forEach((act, index) => {
    const node = tplActivityItem.content.firstElementChild.cloneNode(true);
    node.querySelector('.time').value = act.time || '';
    node.querySelector('.title').value = act.title || '';
    node.querySelector('.category').value = act.category || '';
    node.querySelector('.notes').value = act.notes || '';

    // Edit handlers
    node.querySelectorAll('.edit').forEach((input)=>{
      input.addEventListener('input', ()=>{
        const sel = (cls)=>node.querySelector(cls).value;
        active.activities[index] = {
          time: sel('.time'),
          title: sel('.title'),
          category: sel('.category'),
          notes: sel('.notes')
        };
        save();
      });
    });

    // Toggle notes visibility
    const toggleBtn = node.querySelector('.toggle-notes');
    const notesEl = node.querySelector('.notes');
    if(toggleBtn && notesEl){
      toggleBtn.addEventListener('click', ()=>{
        if(notesEl.hasAttribute('hidden')) notesEl.removeAttribute('hidden');
        else notesEl.setAttribute('hidden','');
      });
    }

    // Duplicate / delete
    node.querySelector('.duplicate').addEventListener('click', ()=>{
      const copy = JSON.parse(JSON.stringify(active.activities[index]));
      active.activities.splice(index+1, 0, copy);
      save(); render();
    });
    node.querySelector('.delete').addEventListener('click', ()=>{
      active.activities.splice(index,1);
      save(); render();
    });

    // Drag and drop (lightweight)
    node.addEventListener('dragstart', (e)=>{
      node.classList.add('dragging');
      draggingFromIndex = index;
      e.dataTransfer.effectAllowed = 'move';
    });
    node.addEventListener('dragend', ()=> node.classList.remove('dragging'));

    activityListEl.appendChild(node);
  });

  // Bind DnD container handlers once
  if(!dndBound){
    activityListEl.addEventListener('dragover', (e)=>{
      e.preventDefault();
    });
    activityListEl.addEventListener('drop', (e)=>{
      e.preventDefault();
      const active = days[activeDayIndex];
      if(!active || draggingFromIndex===null) return;
      const afterEl = getDragAfterElement(activityListEl, e.clientY);
      let to = active.activities.length - 1;
      if(afterEl){
        to = Array.from(activityListEl.children).indexOf(afterEl);
      }
      if(to < 0) to = 0;
      if(draggingFromIndex !== to){
        const [moved] = active.activities.splice(draggingFromIndex,1);
        active.activities.splice(to,0,moved);
        save(); render();
      }
      draggingFromIndex = null;
    });
    dndBound = true;
  }
}

function getDragAfterElement(container, y){
  const els = [...container.querySelectorAll('.activity-item:not(.dragging)')];
  let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
  for(const el of els){
    const box = el.getBoundingClientRect();
    const offset = y - box.top - box.height/2;
    if(offset < 0 && offset > closest.offset){
      closest = { offset, element: el };
    }
  }
  return closest.element;
}

// Events
btnAddDay.addEventListener('click', ()=>{
  const num = days.length + 1;
  days.push({ id: uid(), title: `Day ${num} – Untitled`, activities: [] });
  activeDayIndex = days.length - 1;
  save(); render();
});

btnDeleteDay.addEventListener('click', ()=>{
  if(days.length===0) return;
  days.splice(activeDayIndex,1);
  activeDayIndex = Math.max(0, activeDayIndex-1);
  save(); render();
});

btnDuplicateDay.addEventListener('click', ()=>{
  if(!days[activeDayIndex]) return;
  const copy = JSON.parse(JSON.stringify(days[activeDayIndex]));
  copy.id = uid();
  copy.title = copy.title + ' (Copy)';
  days.splice(activeDayIndex+1,0,copy);
  activeDayIndex++;
  save(); render();
});

dayTitleInput.addEventListener('input', ()=>{
  if(!days[activeDayIndex]) return;
  days[activeDayIndex].title = dayTitleInput.value;
  save(); render();
});

btnAddActivity.addEventListener('click', ()=>{
  if(!days[activeDayIndex]) return;
  const newAct = {
    time: (newTimeInput.value || '').trim(),
    title: (newTitleInput.value || '').trim(),
    category: (newCategorySelect.value || '').trim(),
    notes: ''
  };
  if(!newAct.title){
    newTitleInput.focus();
    return;
  }
  days[activeDayIndex].activities.push(newAct);
  newTimeInput.value = '';
  newTitleInput.value = '';
  newCategorySelect.value = '';
  save(); render();
});

btnPrint.addEventListener('click', ()=> window.print());

btnExport.addEventListener('click', ()=>{
  const data = JSON.stringify({ days }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'rome-itinerary.json'; a.click();
  URL.revokeObjectURL(url);
});

fileImport.addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const text = await file.text();
  try{
    const data = JSON.parse(text);
    if(Array.isArray(data.days)){
      days = data.days; activeDayIndex = 0; save(); render();
    }
  }catch{}
  e.target.value = '';
});

btnClear.addEventListener('click', ()=>{
  if(confirm('Clear itinerary? This cannot be undone.')){
    localStorage.removeItem(STORAGE_KEY);
    days = getSampleTemplate(); activeDayIndex = 0; save(); render();
  }
});

if(btnTheme){
  btnTheme.addEventListener('click', ()=>{
    const current = document.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    applyTheme(current === 'light' ? 'dark' : 'light');
  });
}

if(btnLayout){
  btnLayout.addEventListener('click', ()=>{
    const current = document.body.getAttribute('data-layout') === 'list' ? 'list' : 'grid';
    applyLayout(current === 'list' ? 'grid' : 'list');
  });
}

if(btnViewMode){
  btnViewMode.addEventListener('click', ()=>{
    const url = new URL(location.href);
    url.searchParams.set('view','1');
    window.open(url.toString(), '_blank');
  });
}

// Map modal handlers
if(mapClose){
  mapClose.addEventListener('click', ()=> mapModal.setAttribute('hidden',''));
}
if(btnDayMap){
  btnDayMap.addEventListener('click', async ()=>{
    const active = days[activeDayIndex];
    if(!active) return;
    await showMapForDay(active);
  });
}

if(btnCleanDup){
  btnCleanDup.addEventListener('click', ()=>{
    const active = days[activeDayIndex];
    if(!active) return;
    const seen = new Set();
    active.activities = active.activities.filter(a=>{
      const key = `${(a.time||'').trim()}|${(a.title||'').trim().toLowerCase()}`;
      if(seen.has(key)) return false;
      seen.add(key); return true;
    });
    save(); render();
  });
}

async function showMapForDay(day){
  mapModal.removeAttribute('hidden');
  // Init Leaflet map once
  if(!leafletMap){
    leafletMap = L.map('map');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(leafletMap);
    leafletLayerGroup = L.layerGroup().addTo(leafletMap);
  }
  leafletLayerGroup.clearLayers();

  const locations = day.activities
    .map(a => (a.title || '').trim())
    .filter(Boolean);
  const coords = [];
  for(const place of locations){
    const c = await geocodeCached(place + ', Rome, Italy');
    if(c) coords.push({ name: place, lat: c.lat, lon: c.lon });
  }
  if(coords.length === 0){
    leafletMap.setView([41.9028, 12.4964], 12); // Rome center
    return;
  }
  // Fit bounds
  const bounds = L.latLngBounds(coords.map(c => [c.lat, c.lon]));
  leafletMap.fitBounds(bounds.pad(0.2));

  // Markers and polyline
  const poly = [];
  coords.forEach((c, idx)=>{
    const marker = L.marker([c.lat, c.lon]).bindPopup(`${idx+1}. ${c.name}`);
    leafletLayerGroup.addLayer(marker);
    poly.push([c.lat, c.lon]);
  });
  if(poly.length>1){
    leafletLayerGroup.addLayer(L.polyline(poly, { color: '#ff7b5c', weight: 4 }));
  }
}

// Simple cached geocoder using Nominatim
const geocodeCache = {};
async function geocodeCached(query){
  if(geocodeCache[query]) return geocodeCache[query];
  try{
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'Accept-Language':'en' } });
    const json = await res.json();
    const first = json && json[0];
    if(first){
      const result = { lat: parseFloat(first.lat), lon: parseFloat(first.lon) };
      geocodeCache[query] = result;
      return result;
    }
  }catch{}
  return null;
}

function getSampleTemplate(){
  return [
    {
      id: uid(),
      title: 'Day 1 – Vatican & Castel Sant’Angelo',
      activities: [
        { time: '09:00', title: 'Vatican Museums & Sistine Chapel', location: 'Vatican Museums', category: 'Sight', notes: 'Pre-book tickets; Michelangelo ceiling' },
        { time: '12:00', title: 'St. Peter\'s Basilica – Dome climb', location: 'St. Peter\'s Basilica', category: 'Sight', notes: 'Panorama views' },
        { time: '14:30', title: 'Castel Sant\'Angelo', location: 'Castel Sant\'Angelo', category: 'Sight', notes: 'Fortress with city views' },
        { time: '16:00', title: 'Ponte Sant\'Angelo', location: 'Ponte Sant\'Angelo', category: 'Walk', notes: 'Angel statues' }
      ]
    },
    {
      id: uid(),
      title: 'Day 2 – Classic Center & Fountains',
      activities: [
        { time: '09:30', title: 'Trevi Fountain', location: 'Trevi Fountain', category: 'Sight', notes: 'Coin toss' },
        { time: '10:30', title: 'Spanish Steps', location: 'Spanish Steps', category: 'Sight', notes: 'View from top' },
        { time: '12:00', title: 'Via del Corso', location: 'Via del Corso', category: 'Shopping', notes: 'Main shopping street' },
        { time: '13:30', title: 'Pantheon', location: 'Pantheon', category: 'Sight', notes: 'Perfect dome' },
        { time: '15:00', title: 'Piazza Navona', location: 'Piazza Navona', category: 'Sight', notes: 'Art and cafés' },
        { time: '19:00', title: 'Campo de’ Fiori & Jewish Ghetto', location: 'Campo de’ Fiori', category: 'Food', notes: 'Dinner & stroll' }
      ]
    },
    {
      id: uid(),
      title: 'Day 3 – Ancient Rome',
      activities: [
        { time: '08:30', title: 'Colosseum', location: 'Colosseum', category: 'Sight', notes: 'Go early' },
        { time: '10:30', title: 'Roman Forum & Palatine Hill', location: 'Roman Forum', category: 'Sight', notes: 'Ruins & views' },
        { time: '13:30', title: 'Piazza Venezia', location: 'Piazza Venezia', category: 'Sight', notes: 'Altare della Patria' },
        { time: '20:45', title: 'Roma vs Inter – Soccer game', location: 'Stadio Olimpico', category: 'Other', notes: 'Kickoff 20:45' }
      ]
    },
    {
      id: uid(),
      title: 'Day 4 – Off the Beaten Path (Local & Calm)',
      activities: [
        { time: '10:00', title: 'Via Appia Antica', location: 'Via Appia Antica', category: 'Walk', notes: 'Bike or walk' },
        { time: '12:00', title: 'Catacombs of San Callisto', location: 'Catacombs of San Callisto', category: 'Sight', notes: 'Underground tunnels' },
        { time: '14:30', title: 'Baths of Caracalla', location: 'Baths of Caracalla', category: 'Sight', notes: 'Ancient baths' },
        { time: '16:30', title: 'Palazzo Massimo alle Terme', location: 'Palazzo Massimo alle Terme', category: 'Sight', notes: 'Frescoes' },
        { time: '19:30', title: 'Dinner in Garbatella', location: 'Garbatella, Rome', category: 'Food', notes: 'Local neighborhood' }
      ]
    }
  ];
}

// Init
load();
render();


