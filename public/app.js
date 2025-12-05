(() => {
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const branches = ['Central Market', 'Downtown', 'River Mall', 'Green Plaza'];
  const API_BASE = `${window.location.origin}/api`;

  const state = {
    staffDirectory: [],
    allocations: [],
    mode: 'api',
    suggestions: [],
  };

  const els = {
    staffPool: document.getElementById('staff-pool'),
    scheduleBoard: document.getElementById('schedule-board'),
    trashZone: document.getElementById('trash-zone'),
    totalCost: document.getElementById('total-cost-display'),
    modeBadge: document.getElementById('mode-badge'),
    statusIndicator: document.getElementById('status-indicator'),
    editModal: document.getElementById('edit-modal'),
    tabs: Array.from(document.querySelectorAll('.section-tab')),
    scheduleSection: document.getElementById('schedule-section'),
    reportsSection: document.getElementById('reports-section'),
    aiSection: document.getElementById('ai-section'),
    reportRange: document.getElementById('report-range'),
    reportTotalWage: document.getElementById('report-total-wage'),
    reportTotalHours: document.getElementById('report-total-hours'),
    reportBranchList: document.getElementById('report-branch-list'),
    reportStaffList: document.getElementById('report-staff-list'),
    dayPillContainer: document.getElementById('day-pill-container'),
    branchPillContainer: document.getElementById('branch-pill-container'),
    suggestionList: document.getElementById('suggestion-list'),
    toastContainer: document.getElementById('toast-container'),
    staffModal: document.getElementById('staff-modal'),
    staffForm: document.getElementById('staff-form'),
    staffIdInput: document.getElementById('staff-id'),
    staffNameInput: document.getElementById('staff-name'),
    staffRoleInput: document.getElementById('staff-role'),
    staffRateInput: document.getElementById('staff-rate'),
    staffDeleteBtn: document.getElementById('staff-delete-btn'),
    staffCancelBtn: document.getElementById('staff-cancel-btn'),
  };

  const apiFetch = async (url, options = {}) => {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
    const text = await res.text();
    const payload = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
    if (!res.ok) {
      const message = payload?.error || payload?.message || text || `Request failed ${res.status}`;
      throw new Error(message);
    }
    return payload;
  };

  const calculateWage = (start, end, rate, unit = 'hour') => {
    if (rate === undefined || rate === null) return 0;
    if (unit === 'day') return Math.round(Number(rate) || 0);
    if (!start || !end) return 0;
    const [sH, sM] = String(start).split(':').map(Number);
    const [eH, eM] = String(end).split(':').map(Number);
    if ([sH, sM, eH, eM].some(Number.isNaN)) return 0;
    let hours = (eH + eM / 60) - (sH + sM / 60);
    if (hours < 0) hours += 24;
    return Math.max(Math.floor(hours * rate), 0);
  };

  const toast = (message, type = 'info') => {
    if (!els.toastContainer) return;
    const div = document.createElement('div');
    div.className = `px-4 py-2 rounded shadow-lg text-sm ${type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-green-600' : 'bg-[#233554]'} text-white`;
    div.textContent = message;
    els.toastContainer.appendChild(div);
    setTimeout(() => div.remove(), 3000);
  };

  const setMode = (mode) => {
    state.mode = mode;
    if (mode === 'api') {
      els.modeBadge.textContent = 'API';
      els.modeBadge.className = 'bg-[#ccff00] text-black font-black px-2 py-1 rounded text-sm transform -rotate-2';
      els.statusIndicator.className = 'w-2 h-2 rounded-full bg-green-500 animate-pulse';
    } else {
      els.modeBadge.textContent = 'OFFLINE';
      els.modeBadge.className = 'bg-gray-600 text-white font-black px-2 py-1 rounded text-sm transform -rotate-2';
      els.statusIndicator.className = 'w-2 h-2 rounded-full bg-orange-500';
    }
  };

  const switchSection = (section) => {
    const sections = {
      schedule: els.scheduleSection,
      reports: els.reportsSection,
      ai: els.aiSection,
    };
    Object.entries(sections).forEach(([key, el]) => {
      if (!el) return;
      el.classList.toggle('hidden', key !== section);
    });
    els.tabs.forEach((btn) => {
      const isActive = btn.dataset.section === section;
      btn.classList.toggle('active', isActive);
      btn.classList.toggle('inactive', !isActive);
    });
    if (section === 'reports') {
      loadReports().catch(() => {});
    }
  };

  const mapStaffFromApi = (s) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    defaultRate: s.default_rate,
    defaultRateUnit: s.rate_unit || 'hour',
  });

  const mapAllocFromApi = (a) => ({
    id: a.id,
    staffId: a.staff_id,
    name: a.name,
    role: a.role,
    branch: a.branch,
    day: a.day,
    start: a.start_time,
    end: a.end_time,
    rate: a.rate,
    rateUnit: a.rate_unit || 'hour',
    totalWage: a.total_wage,
  });

  const loadFromApi = async () => {
    const [staffRes, allocRes] = await Promise.all([
      apiFetch(`${API_BASE}/staff`),
      apiFetch(`${API_BASE}/allocations`),
    ]);
    state.staffDirectory = staffRes.map(mapStaffFromApi);
    state.allocations = allocRes.map(mapAllocFromApi);
    renderAll();
  };

  const loadReports = async () => {
    const range = document.getElementById('report-range-select')?.value || '7';
    const custom = document.getElementById('report-custom-days')?.value;
    const daysParam = range === 'custom' ? Number(custom) || 7 : Number(range);
    const data = await apiFetch(`${API_BASE}/reports/weekly?days=${daysParam}`);
    if (!data) return;
    els.reportRange.textContent = `Last ${data.range?.days || 7} days`;
    els.reportTotalWage.textContent = `฿${(data.totals?.wage || 0).toLocaleString()}`;
    els.reportTotalHours.textContent = `${data.totals?.hours?.toFixed?.(1) || 0} hrs`;

    els.reportBranchList.innerHTML = '';
    (data.branchTotals || []).forEach((b) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between bg-[#051025] border border-[#233554] rounded px-3 py-2';
      row.innerHTML = `<span>${b.branch}</span><span class="font-mono text-[#ccff00]">฿${(b.totalWage || 0).toLocaleString()}</span>`;
      els.reportBranchList.appendChild(row);
    });

    els.reportStaffList.innerHTML = '';
    (data.staffHours || []).forEach((s) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between bg-[#051025] border border-[#233554] rounded px-3 py-2';
      row.innerHTML = `<div><p class="font-bold">${s.name}</p><p class="text-xs text-gray-400">${s.role || ''}</p></div><span class="font-mono">${(s.hours || 0).toFixed(1)} h</span>`;
      els.reportStaffList.appendChild(row);
    });
  };

  const loadLocalData = () => {
    const savedStaff = localStorage.getItem('staffDirectory');
    const savedAlloc = localStorage.getItem('allocations');
    state.staffDirectory = savedStaff ? JSON.parse(savedStaff) : [
      { id: 's1', name: 'Alex', role: 'Manager', defaultRate: 250, defaultRateUnit: 'hour' },
      { id: 's2', name: 'Sam', role: 'Sales', defaultRate: 150, defaultRateUnit: 'hour' },
      { id: 's3', name: 'Ploy', role: 'Staff', defaultRate: 100, defaultRateUnit: 'hour' },
      { id: 's4', name: 'Yee', role: 'Part-time', defaultRate: 80, defaultRateUnit: 'hour' },
    ];
    state.allocations = savedAlloc ? JSON.parse(savedAlloc) : [
      { id: 'a1', staffId: 's1', name: 'Alex', role: 'Manager', branch: 'Central Market', day: 'Monday', start: '10:00', end: '19:00', rate: 250, rateUnit: 'hour', totalWage: 2250 },
    ];
    renderAll();
  };

  const saveLocalData = () => {
    if (state.mode !== 'local') return;
    localStorage.setItem('staffDirectory', JSON.stringify(state.staffDirectory));
    localStorage.setItem('allocations', JSON.stringify(state.allocations));
  };

  const renderAll = () => {
    renderStaffPool();
    renderSchedule();
    updateTotalCost();
    lucide.createIcons();
    document.body.classList.add('loaded');
  };

  const renderStaffPool = () => {
    els.staffPool.innerHTML = '';
    state.staffDirectory.forEach((staff) => {
      const el = document.createElement('div');
      el.className = 'bg-[#112240] p-3 rounded border border-[#233554] hover:border-[#ccff00] cursor-grab active:cursor-grabbing flex justify-between items-center group transition-colors select-none';
      el.dataset.staffId = staff.id;
      el.innerHTML = `
        <div>
          <h3 class="font-bold text-sm text-white">${staff.name}</h3>
          <span class="text-[10px] bg-[#233554] px-1.5 py-0.5 rounded text-gray-400 uppercase">${staff.role}</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="text-xs font-mono text-gray-500 group-hover:text-[#ccff00]">฿${staff.defaultRate || 0}/${staff.defaultRateUnit === 'day' ? 'day' : 'hr'}</div>
          <button class="icon-btn cursor-pointer" data-edit-staff="${staff.id}" title="Edit staff">
            <i data-lucide="edit-2" class="w-4 h-4"></i>
          </button>
          <button class="icon-btn cursor-pointer" data-delete-staff="${staff.id}" title="Delete staff">
            <i data-lucide="trash" class="w-4 h-4"></i>
          </button>
        </div>
      `;
      els.staffPool.appendChild(el);
    });

    new Sortable(els.staffPool, {
      group: { name: 'shared', pull: 'clone', put: false },
      sort: false,
      animation: 150,
    });
  };

  const createScheduleCard = (item) => {
    const el = document.createElement('div');
    el.className = 'bg-[#112240] rounded p-3 border border-[#233554] hover:border-[#ccff00] cursor-pointer shadow-sm relative group select-none';
    el.dataset.id = item.id;
    el.addEventListener('click', () => openEditModal(item.id));
    el.innerHTML = `
      <div class="absolute left-0 top-0 bottom-0 w-1 bg-[#ccff00]"></div>
      <div class="pl-2">
        <div class="flex justify-between items-start">
          <h4 class="font-bold text-white text-sm truncate">${item.name}</h4>
          <span class="text-[10px] font-mono text-[#ff6b00]">฿${(item.totalWage || 0).toLocaleString()}</span>
        </div>
        <div class="flex items-center gap-2 mt-1">
          <span class="text-[10px] bg-[#051025] px-1 py-0.5 rounded text-gray-400">${item.role}</span>
          <span class="text-[10px] text-gray-500 font-mono flex items-center gap-1">
            <i data-lucide="clock" class="w-3 h-3"></i> ${item.start}-${item.end} (${item.rateUnit === 'day' ? 'per day' : 'per hour'})
          </span>
        </div>
      </div>
      <div class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <i data-lucide="edit-2" class="w-3 h-3 text-gray-500"></i>
      </div>
    `;
    return el;
  };

  const renderSchedule = () => {
    els.scheduleBoard.innerHTML = '';
    daysOfWeek.forEach((day) => {
      const col = document.createElement('div');
      col.className = 'min-w-[300px] w-[300px] flex flex-col h-full bg-[#0a192f]/50 rounded-xl border border-[#233554] overflow-hidden flex-shrink-0';
      col.innerHTML = `
        <div class="bg-[#112240] p-3 border-b border-[#233554] flex justify-between items-center sticky top-0 z-10">
          <span class="font-bold text-white uppercase tracking-wider">${day}</span>
          <i data-lucide="calendar" class="w-4 h-4 text-[#ccff00]"></i>
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-3"></div>
      `;
      const dayContent = col.querySelector('.overflow-y-auto');

      branches.forEach((branch) => {
        const branchZone = document.createElement('div');
        branchZone.className = 'space-y-1';
        branchZone.innerHTML = `<div class="flex items-center gap-2 px-1"><div class="w-1.5 h-1.5 rounded-full bg-[#7b61ff]"></div><h4 class="text-[10px] font-bold text-gray-500 uppercase tracking-widest">${branch}</h4></div>`;

        const list = document.createElement('div');
        list.className = 'min-h-[60px] bg-[#051025]/50 rounded-lg p-2 border border-dashed border-[#233554] transition-colors';
        list.dataset.day = day;
        list.dataset.branch = branch;

        const items = state.allocations.filter((a) => a.day === day && a.branch === branch);
        items.forEach((item) => list.appendChild(createScheduleCard(item)));

        branchZone.appendChild(list);
        dayContent.appendChild(branchZone);

        new Sortable(list, {
          group: { name: 'shared', pull: true, put: true },
          animation: 150,
          ghostClass: 'sortable-ghost',
          onAdd: (evt) => handleDrop(evt, list),
        });
      });

      els.scheduleBoard.appendChild(col);
    });
    lucide.createIcons();
  };

  const updateTotalCost = () => {
    const total = state.allocations.reduce((sum, a) => sum + (a.totalWage || 0), 0);
    els.totalCost.textContent = `฿${total.toLocaleString()}`;
  };

  const openEditModal = (id) => {
    const alloc = state.allocations.find((a) => a.id === id);
    if (!alloc) return;
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-name').value = alloc.name;
    document.getElementById('edit-start').value = alloc.start;
    document.getElementById('edit-end').value = alloc.end;
    document.getElementById('edit-rate').value = alloc.rate;
    document.getElementById('edit-rate-unit').value = alloc.rateUnit || 'hour';
    els.editModal.classList.remove('hidden');
  };

  const closeEditModal = () => {
    els.editModal.classList.add('hidden');
  };

  const handleDrop = async (evt, list) => {
    const itemEl = evt.item;
    const staffId = itemEl.dataset.staffId;
    const allocId = itemEl.dataset.id;
    const targetDay = list.dataset.day;
    const targetBranch = list.dataset.branch;

    let staffName; let staffRole; let staffRate; let staffRateUnit = 'hour';
    if (staffId && !allocId) {
      const s = state.staffDirectory.find((x) => x.id === staffId);
      staffName = s?.name; staffRole = s?.role; staffRate = s?.defaultRate; staffRateUnit = s?.defaultRateUnit || 'hour';
    } else {
      const a = state.allocations.find((x) => x.id === allocId);
      if (a) { staffName = a.name; staffRole = a.role; staffRate = a.rate; staffRateUnit = a.rateUnit || 'hour'; }
    }

    const duplicate = state.allocations.some((a) => a.name === staffName && a.day === targetDay && a.id !== allocId);
    if (duplicate) {
      toast(`${staffName} already assigned on ${targetDay}`, 'error');
      evt.from.appendChild(itemEl);
      return;
    }

    if (staffId && !allocId) {
      itemEl.remove();
      const newId = `a-${Date.now()}`;
      const start = '09:00'; const end = '18:00';
      const newAlloc = {
        id: newId,
        staffId,
        name: staffName,
        role: staffRole,
        branch: targetBranch,
        day: targetDay,
        start,
        end,
        rate: staffRate,
        rateUnit: staffRateUnit,
        totalWage: calculateWage(start, end, staffRate, staffRateUnit),
      };
      await createAllocation(newAlloc);
    } else {
      await updateAllocation(allocId, { day: targetDay, branch: targetBranch });
    }
  };

  const initTrash = () => {
    new Sortable(els.trashZone, {
      group: 'shared',
      ghostClass: 'opacity-0',
      onAdd: async (evt) => {
        const allocId = evt.item.dataset.id;
        evt.item.remove();
        if (allocId && confirm('Remove this allocation?')) {
          await deleteAllocation(allocId);
        } else if (allocId) {
          renderSchedule();
        }
      },
    });
  };

  const addStaff = async (name, role, rate, rateUnit) => {
    const payload = { name: name.trim(), role: role.trim(), default_rate: rate, rate_unit: rateUnit };
    if (state.mode === 'api') {
      const created = await apiFetch(`${API_BASE}/staff`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      state.staffDirectory.push(mapStaffFromApi(created));
    } else {
      const newId = `s-${Date.now()}`;
      state.staffDirectory.push({ id: newId, name, role, defaultRate: rate, defaultRateUnit: rateUnit || 'hour' });
      saveLocalData();
    }
    renderStaffPool();
    toast('Staff created', 'success');
  };

  const updateStaff = async (id, { name, role, rate, rateUnit }) => {
    if (state.mode === 'api') {
      const updated = await apiFetch(`${API_BASE}/staff/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, role, default_rate: rate, rate_unit: rateUnit }),
      });
      const idx = state.staffDirectory.findIndex((s) => s.id === id);
      if (idx !== -1) state.staffDirectory[idx] = mapStaffFromApi(updated);
    } else {
      const idx = state.staffDirectory.findIndex((s) => s.id === id);
      if (idx !== -1) {
        state.staffDirectory[idx] = { ...state.staffDirectory[idx], name, role, defaultRate: rate, defaultRateUnit: rateUnit || 'hour' };
        saveLocalData();
      }
    }
    renderStaffPool();
    toast('Staff updated', 'success');
  };

  const deleteStaff = async (id) => {
    if (state.mode === 'api') {
      await apiFetch(`${API_BASE}/staff/${id}`, { method: 'DELETE' });
    }
    state.staffDirectory = state.staffDirectory.filter((s) => s.id !== id);
    saveLocalData();
    renderStaffPool();
    toast('Staff deleted', 'success');
  };

  const openStaffModal = (id) => {
    const staff = state.staffDirectory.find((s) => s.id === id);
    if (!staff) return;
    els.staffIdInput.value = id;
    els.staffNameInput.value = staff.name;
    els.staffRoleInput.value = staff.role;
    els.staffRateInput.value = staff.defaultRate ?? '';
    const rateUnitSelect = document.getElementById('staff-rate-unit');
    if (rateUnitSelect) rateUnitSelect.value = staff.defaultRateUnit || 'hour';
    els.staffModal.classList.remove('hidden');
    els.staffModal.classList.add('flex');
  };

  const closeStaffModal = () => {
    els.staffModal.classList.add('hidden');
    els.staffModal.classList.remove('flex');
  };

  const createAllocation = async (allocData) => {
    if (state.mode === 'api') {
      const payload = {
        id: allocData.id,
        staff_id: allocData.staffId,
        name: allocData.name,
        role: allocData.role,
        branch: allocData.branch,
        day: allocData.day,
        start_time: allocData.start,
        end_time: allocData.end,
        rate: allocData.rate,
        rate_unit: allocData.rateUnit || 'hour',
        total_wage: allocData.totalWage,
      };
      const created = await apiFetch(`${API_BASE}/allocations`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      state.allocations.push(mapAllocFromApi(created));
    } else {
      state.allocations.push(allocData);
      saveLocalData();
    }
    renderSchedule();
    updateTotalCost();
  };

  const updateAllocation = async (id, data) => {
    if (state.mode === 'api') {
      const payload = {
        ...data,
        staff_id: data.staffId,
        start_time: data.start,
        end_time: data.end,
        rate_unit: data.rateUnit,
        total_wage: data.totalWage,
      };
      const updated = await apiFetch(`${API_BASE}/allocations/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      const idx = state.allocations.findIndex((a) => a.id === id);
      if (idx !== -1) state.allocations[idx] = mapAllocFromApi(updated);
    } else {
      const idx = state.allocations.findIndex((a) => a.id === id);
      if (idx !== -1) {
        state.allocations[idx] = { ...state.allocations[idx], ...data };
        saveLocalData();
      }
    }
    renderSchedule();
    updateTotalCost();
  };

  const deleteAllocation = async (id) => {
    if (state.mode === 'api') {
      await apiFetch(`${API_BASE}/allocations/${id}`, { method: 'DELETE' });
    }
    state.allocations = state.allocations.filter((a) => a.id !== id);
    saveLocalData();
    renderSchedule();
    updateTotalCost();
  };

  const buildPills = () => {
    els.dayPillContainer.innerHTML = '';
    daysOfWeek.forEach((d) => {
      const pill = document.createElement('button');
      pill.className = 'pill active';
      pill.dataset.value = d;
      pill.textContent = d;
      pill.onclick = () => pill.classList.toggle('active');
      els.dayPillContainer.appendChild(pill);
    });
    els.branchPillContainer.innerHTML = '';
    branches.forEach((b) => {
      const pill = document.createElement('button');
      pill.className = 'pill active';
      pill.dataset.value = b;
      pill.textContent = b;
      pill.onclick = () => pill.classList.toggle('active');
      els.branchPillContainer.appendChild(pill);
    });
  };

  const generateSuggestions = async () => {
    const daysSelected = Array.from(els.dayPillContainer.querySelectorAll('.pill.active')).map((p) => p.dataset.value);
    const branchesSelected = Array.from(els.branchPillContainer.querySelectorAll('.pill.active')).map((p) => p.dataset.value);
    const maxHours = Number(document.getElementById('max-hours-input').value) || 8;
    const minStaff = Number(document.getElementById('min-staff-input').value) || 1;
    const start = document.getElementById('start-time-input').value;
    const end = document.getElementById('end-time-input').value;

    if (!daysSelected.length || !branchesSelected.length) {
      toast('Select at least one day and branch', 'error');
      return;
    }

    const res = await apiFetch(`${API_BASE}/suggest/schedule`, {
      method: 'POST',
      body: JSON.stringify({
        branches: branchesSelected,
        days: daysSelected,
        start_time: start,
        end_time: end,
        maxHoursPerDay: maxHours,
        minStaffPerBranch: minStaff,
      }),
    });

    state.suggestions = res.suggestions || [];
    renderSuggestions();
    toast(`Generated ${state.suggestions.length} slots`, 'success');
  };

  const renderSuggestions = () => {
    els.suggestionList.innerHTML = '';
    if (!state.suggestions.length) {
      els.suggestionList.innerHTML = '<p class="text-gray-400 text-sm">No suggestions yet. Click Generate.</p>';
      return;
    }
    state.suggestions.forEach((sugg) => {
      const card = document.createElement('div');
      card.className = 'bg-[#112240] border border-[#233554] rounded p-3';
      card.innerHTML = `
        <div class="flex justify-between text-sm">
          <span class="font-bold">${sugg.name}</span>
          <span class="font-mono text-[#ccff00]">${sugg.day}</span>
        </div>
        <p class="text-xs text-gray-400">${sugg.branch}</p>
        <p class="text-xs mt-1 font-mono">${sugg.start_time} - ${sugg.end_time} · ฿${(sugg.total_wage || 0).toLocaleString()}</p>
      `;
      els.suggestionList.appendChild(card);
    });
  };

  const applySuggestions = async () => {
    if (!state.suggestions.length) {
      toast('No suggestions to apply', 'error');
      return;
    }
    for (const s of state.suggestions) {
      await createAllocation({
        id: s.id,
        staffId: s.staff_id,
        name: s.name,
        role: s.role,
        branch: s.branch,
        day: s.day,
        start: s.start_time,
        end: s.end_time,
        rate: s.rate,
        totalWage: s.total_wage,
      });
    }
    toast('Applied suggested schedule', 'success');
    switchSection('schedule');
  };

  const initEvents = () => {
    document.getElementById('create-staff-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('new-staff-name').value;
      const role = document.getElementById('new-staff-role').value;
      const rate = parseFloat(document.getElementById('new-staff-rate').value);
      const rateUnit = document.getElementById('new-staff-rate-unit').value || 'hour';
      if (!name?.trim() || !role?.trim()) return toast('Name and role required', 'error');
      try {
        await addStaff(name, role, rate, rateUnit);
        document.getElementById('new-staff-name').value = '';
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    document.getElementById('edit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-id').value;
    const start = document.getElementById('edit-start').value;
    const end = document.getElementById('edit-end').value;
    const rate = parseFloat(document.getElementById('edit-rate').value);
    const rateUnit = document.getElementById('edit-rate-unit').value;
    try {
      await updateAllocation(id, { start, end, rate, rateUnit, totalWage: calculateWage(start, end, rate, rateUnit) });
      closeEditModal();
      toast('Allocation updated', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
    });

    document.getElementById('cancel-edit-btn').addEventListener('click', closeEditModal);
    document.getElementById('reset-btn').addEventListener('click', () => {
      if (confirm('Reset all LOCAL data to defaults?')) {
        localStorage.clear();
        window.location.reload();
      }
    });
    document.getElementById('refresh-btn').addEventListener('click', () => {
      loadFromApi().then(() => toast('Refreshed', 'success')).catch((err) => toast(err.message, 'error'));
    });
    els.tabs.forEach((btn) => {
      btn.addEventListener('click', () => switchSection(btn.dataset.section));
    });
    document.getElementById('report-range-select').addEventListener('change', () => {
      const range = document.getElementById('report-range-select').value;
      document.getElementById('report-custom-wrapper').classList.toggle('hidden', range !== 'custom');
      loadReports().catch((err) => toast(err.message, 'error'));
    });
    document.getElementById('report-custom-days').addEventListener('change', () => {
      loadReports().catch((err) => toast(err.message, 'error'));
    });
    document.getElementById('generate-suggest-btn').addEventListener('click', () => {
      generateSuggestions().catch((err) => toast(err.message, 'error'));
    });
    document.getElementById('apply-suggest-btn').addEventListener('click', () => {
      applySuggestions().catch((err) => toast(err.message, 'error'));
    });

    els.staffPool.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-edit-staff]');
      const delBtn = e.target.closest('[data-delete-staff]');
      if (editBtn) {
        openStaffModal(editBtn.dataset.editStaff);
      } else if (delBtn) {
        if (confirm('Delete this staff?')) {
          deleteStaff(delBtn.dataset.deleteStaff).catch((err) => toast(err.message, 'error'));
        }
      }
    });

    els.staffCancelBtn.addEventListener('click', closeStaffModal);
    els.staffDeleteBtn.addEventListener('click', () => {
      const id = els.staffIdInput.value;
      if (!id) return;
      if (confirm('Delete this staff?')) {
        deleteStaff(id).catch((err) => toast(err.message, 'error')).finally(closeStaffModal);
      }
    });
    els.staffForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const id = els.staffIdInput.value;
      if (!id) return;
      const name = els.staffNameInput.value;
      const role = els.staffRoleInput.value;
      const rate = parseFloat(els.staffRateInput.value);
      const rateUnit = document.getElementById('staff-rate-unit')?.value || 'hour';
      updateStaff(id, { name, role, rate, rateUnit }).catch((err) => toast(err.message, 'error')).finally(closeStaffModal);
    });
  };

  const initApp = async () => {
    buildPills();
    initEvents();
    initTrash();
    try {
      await loadFromApi();
      setMode('api');
    } catch (err) {
      console.error('API backend unavailable, using local mode.', err);
      setMode('local');
      loadLocalData();
    }
  };

  document.addEventListener('DOMContentLoaded', initApp);
})();
