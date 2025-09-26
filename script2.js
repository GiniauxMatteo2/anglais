'use strict';

// Simple local simulation — non-clinical.
(function(){
  const STORAGE_KEY = 'patients_demo';

  // Elements
  const els = {
    patientList: document.getElementById('patientList'),
    countEntries: document.getElementById('countEntries'),
    avgRisk: document.getElementById('avgRisk'),
    miniChart: document.getElementById('miniChart'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    formMsg: document.getElementById('formMsg'),
    form: document.getElementById('dataForm'),
    saveBtn: document.getElementById('saveBtn'),
    clearBtn: document.getElementById('clearBtn'),
  };

  // Storage helpers
  function loadData(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }catch{ return []; }
  }
  function saveData(list){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    renderDashboard();
  }

  // Helpers
  const num = (v)=>{
    const n = typeof v==='number' ? v : parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  };
  const clamp = (x, a, b)=> Math.max(a, Math.min(b, x));
  const bmi = (kg, cm)=>{
    const w = num(kg), hcm = num(cm);
    if(!Number.isFinite(w) || !Number.isFinite(hcm) || hcm<=0) return NaN;
    const m = hcm/100;
    return w/(m*m);
  };

  // Risk computation
  const WEIGHTS = {
    age: { gt60:25, gt45:15, gt30:6 },
    genetics: { moderate:18, high:32 },
    env: { polluted:20, urban:6, green:-6, rural:-2 },
    diet: { bad:10, good:-6 },
    smoking: { current:20, former:5, none:0 },
    alcohol: { mild:3, high:6 }, // 7-14 mild, >14 high
    activity: { low:6, moderate:0, high:-6 },
    sleep: { short:8, long:4 }, // <6 short, >9 long
    bmi: { under:3, overweight:6, obese:12 },
    stress: 1, // 0-10 scale
    conditions: {
      diabetes:12, hypertension:10, cvd:20, cancer:8, asthma:6, obesity:8, kidney:12
    },
    vitals: {
      sbp140:8, sbp160:6, chol200:5, chol240:5, glu100:6, glu126:6
    },
    nutrition: { low:10, mid:6, high:-4 }, // fruits+veg: <1 low, <3 mid, >=5 high benefit
    exposure: { noise:3, shift:4, night:4 }
  };

  function computeRisk(entry){
    let score = 0;

    // Age
    const age = parseInt(entry.age,10) || 0;
    if(age>60) score += WEIGHTS.age.gt60;
    else if(age>45) score += WEIGHTS.age.gt45;
    else if(age>30) score += WEIGHTS.age.gt30;

    // Genetics
    if(entry.genetics==='moderate') score += WEIGHTS.genetics.moderate;
    if(entry.genetics==='high') score += WEIGHTS.genetics.high;

    // Environment
    const env = Array.isArray(entry.environment) ? entry.environment : [];
    if(env.includes('polluted')) score += WEIGHTS.env.polluted;
    if(env.includes('urban')) score += WEIGHTS.env.urban;
    if(env.includes('green')) score += WEIGHTS.env.green;
    if(env.includes('rural')) score += WEIGHTS.env.rural;

    // Diet free text
    const dietText = (entry.diet||'').toLowerCase();
    if(dietText.includes('fast') || dietText.includes('soda') || dietText.includes('fried')) score += WEIGHTS.diet.bad;
    if(dietText.includes('veget') || dietText.includes('mediterr')) score += WEIGHTS.diet.good;

    // Lifestyle
    const smoking = entry.smoking||'none';
    score += WEIGHTS.smoking[smoking] ?? 0;

    const alcohol = num(entry.alcohol);
    if(Number.isFinite(alcohol)){
      if(alcohol>14) score += WEIGHTS.alcohol.high; else if(alcohol>=7) score += WEIGHTS.alcohol.mild;
    }

    const activity = entry.activity||'moderate';
    score += WEIGHTS.activity[activity] ?? 0;

    const sleep = num(entry.sleep);
    if(Number.isFinite(sleep)){
      if(sleep<6) score += WEIGHTS.sleep.short; else if(sleep>9) score += WEIGHTS.sleep.long;
    }

    const BMI = bmi(entry.weight, entry.height);
    if(Number.isFinite(BMI)){
      if(BMI>=30) score += WEIGHTS.bmi.obese;
      else if(BMI>=25) score += WEIGHTS.bmi.overweight;
      else if(BMI<18.5) score += WEIGHTS.bmi.under;
    }

    const stress = clamp(num(entry.stress)||0, 0, 10);
    score += stress * WEIGHTS.stress;

    // Medical conditions
    const conditions = Array.isArray(entry.conditions) ? entry.conditions : [];
    for(const c of conditions){ score += WEIGHTS.conditions[c] || 0; }

    // Vitals & labs
    const sbp = num(entry.sbp);
    if(Number.isFinite(sbp)){
      if(sbp>160) score += WEIGHTS.vitals.sbp160 + WEIGHTS.vitals.sbp140; else if(sbp>140) score += WEIGHTS.vitals.sbp140;
    }
    const chol = num(entry.chol);
    if(Number.isFinite(chol)){
      if(chol>=240) score += WEIGHTS.vitals.chol240 + WEIGHTS.vitals.chol200; else if(chol>=200) score += WEIGHTS.vitals.chol200;
    }
    const glu = num(entry.glucose);
    if(Number.isFinite(glu)){
      if(glu>=126) score += WEIGHTS.vitals.glu126 + WEIGHTS.vitals.glu100; else if(glu>=100) score += WEIGHTS.vitals.glu100;
    }

    // Nutrition quick check
    const fruits = num(entry.fruits)||0, vegetables = num(entry.vegetables)||0;
    const fv = fruits + vegetables;
    if(fv<1) score += WEIGHTS.nutrition.low; else if(fv<3) score += WEIGHTS.nutrition.mid; else if(fv>=5) score += WEIGHTS.nutrition.high;

    // Work & exposure
    if(entry.noise) score += WEIGHTS.exposure.noise;
    const work = Array.isArray(entry.work) ? entry.work : [];
    if(work.includes('shift')) score += WEIGHTS.exposure.shift;
    if(work.includes('night')) score += WEIGHTS.exposure.night;

    // Final clamp
    score = clamp(Math.round(score), 0, 100);
    return score;
  }

  // UI helpers
  function setMsg(text){ if(els.formMsg) els.formMsg.textContent = text; }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]});
  }
  function getRecommendation(risk){
    if(risk>65) return '<span style="color:#b91c1c;font-weight:700">Medical follow-up recommended</span>';
    if(risk>30) return '<span style="color:#b97309;font-weight:700">Preventive actions</span>';
    return '<span style="color:var(--success);font-weight:700">Low — maintain</span>';
  }

  // Rendering
  function renderDashboard(){
    const list = loadData();
    if(els.countEntries) els.countEntries.textContent = list.length;

    if(!list.length){
      if(els.patientList) els.patientList.innerHTML = '<div style="color:var(--muted);padding:12px;border-radius:8px;background:#fbfdff">No entries. Import a sample or add an entry.</div>';
      if(els.avgRisk){ els.avgRisk.textContent = '—'; els.avgRisk.classList.remove('risk-high','risk-low'); }
      if(els.miniChart) els.miniChart.textContent = 'No data points';
      return;
    }

    const risks = list.map(p=>p.risk);
    const avg = Math.round(risks.reduce((a,b)=>a+b,0)/risks.length);
    if(els.avgRisk){
      els.avgRisk.textContent = String(avg);
      els.avgRisk.classList.remove('risk-high','risk-low');
      els.avgRisk.classList.add(avg>65 ? 'risk-high' : 'risk-low');
    }

    // Build table
    if(els.patientList){
      let html = '<table><thead><tr><th>Name</th><th>Age</th><th>Risk</th><th>Recommendation</th></tr></thead><tbody>';
      for(const p of list){
        html += `<tr><td>${escapeHtml(p.fullname)}</td><td>${escapeHtml(p.age)}</td><td><strong>${p.risk}</strong></td><td>${getRecommendation(p.risk)}</td></tr>`;
      }
      html += '</tbody></table>';
      els.patientList.innerHTML = html;
    }

    if(els.miniChart) els.miniChart.textContent = risks.join(' • ');
  }

  // Form handling
  function readForm(){
    const fullname = document.getElementById('fullname')?.value.trim() || '';
    const age = document.getElementById('age')?.value.trim() || '';
    const genetics = document.getElementById('genetics')?.value || '';
    const diet = document.getElementById('diet')?.value.trim() || '';
    const consent = !!document.getElementById('consent')?.checked;
    const envNodes = Array.from(document.querySelectorAll('.env'))
      .filter(n=>n instanceof HTMLInputElement && n.checked)
      .map(n=>n.value);

    // Lifestyle
    const smoking = document.getElementById('smoking')?.value || 'none';
    const alcohol = document.getElementById('alcohol')?.value || '';
    const activity = document.getElementById('activity')?.value || 'moderate';
    const sleep = document.getElementById('sleep')?.value || '';
    const height = document.getElementById('height')?.value || '';
    const weight = document.getElementById('weight')?.value || '';
    const stress = document.getElementById('stress')?.value || '';

    // Medical history
    const conditions = Array.from(document.querySelectorAll('.cond'))
      .filter(n=>n instanceof HTMLInputElement && n.checked)
      .map(n=>n.value);

    // Vitals & labs
    const sbp = document.getElementById('sbp')?.value || '';
    const chol = document.getElementById('chol')?.value || '';
    const glucose = document.getElementById('glucose')?.value || '';

    // Nutrition quick check
    const fruits = document.getElementById('fruits')?.value || '';
    const vegetables = document.getElementById('vegetables')?.value || '';

    // Work & exposure
    const noise = !!document.getElementById('noise')?.checked;
    const work = Array.from(document.querySelectorAll('.work'))
      .filter(n=>n instanceof HTMLInputElement && n.checked)
      .map(n=>n.value);

    return { fullname, age, genetics, diet, consent, environment: envNodes,
      smoking, alcohol, activity, sleep, height, weight, stress,
      conditions, sbp, chol, glucose, fruits, vegetables, noise, work };
  }

  function validateForm(model){
    if(!model.fullname || !model.age) return 'Please provide at least name and age.';
    if(!model.consent) return 'Consent is required to share this data (simulation).';
    const age = parseInt(model.age,10);
    if(Number.isNaN(age) || age<0 || age>130) return 'Invalid age.';
    return '';
  }

  function addEntry(model){
    const entry = {
      fullname: model.fullname,
      age: model.age,
      genetics: model.genetics,
      diet: model.diet,
      environment: model.environment,
      created: new Date().toISOString(),

      // New fields
      smoking: model.smoking,
      alcohol: model.alcohol,
      activity: model.activity,
      sleep: model.sleep,
      height: model.height,
      weight: model.weight,
      stress: model.stress,
      conditions: model.conditions,
      sbp: model.sbp,
      chol: model.chol,
      glucose: model.glucose,
      fruits: model.fruits,
      vegetables: model.vegetables,
      noise: model.noise,
      work: model.work,
    };
    entry.risk = computeRisk(entry);
    const list = loadData();
    list.unshift(entry);
    saveData(list);
    return entry;
  }

  // Export / Import
  function exportJson(){
    const data = loadData();
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `patients_demo_${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importJsonFromFile(file){
    return new Promise((resolve,reject)=>{
      const reader = new FileReader();
      reader.onerror = ()=>reject(new Error('File reading failed'));
      reader.onload = ()=>{
        try{
          const parsed = JSON.parse(String(reader.result||'[]'));
          if(!Array.isArray(parsed)) throw new Error('Invalid format');
          const cleaned = parsed.map(p=>({
            fullname: String(p.fullname||'').trim(),
            age: String(p.age||'').trim(),
            genetics: String(p.genetics||'').trim(),
            diet: String(p.diet||'').trim(),
            environment: Array.isArray(p.environment)? p.environment.map(String) : [],
            created: p.created || new Date().toISOString(),

            smoking: String(p.smoking||'none'),
            alcohol: String(p.alcohol||''),
            activity: String(p.activity||'moderate'),
            sleep: String(p.sleep||''),
            height: String(p.height||''),
            weight: String(p.weight||''),
            stress: String(p.stress||''),
            conditions: Array.isArray(p.conditions)? p.conditions.map(String) : [],
            sbp: String(p.sbp||''),
            chol: String(p.chol||''),
            glucose: String(p.glucose||''),
            fruits: String(p.fruits||''),
            vegetables: String(p.vegetables||''),
            noise: !!p.noise,
            work: Array.isArray(p.work)? p.work.map(String) : [],

            risk: typeof p.risk==='number' ? p.risk : 0
          })).map(e=>({ ...e, risk: computeRisk(e) }));
          saveData(cleaned);
          resolve(cleaned.length);
        }catch(err){ reject(err); }
      };
      reader.readAsText(file);
    });
  }

  // Events
  window.addEventListener('DOMContentLoaded', ()=>{
    renderDashboard();

    els.saveBtn?.addEventListener('click', ()=>{
      const model = readForm();
      const error = validateForm(model);
      if(error){ setMsg(error); return; }
      const entry = addEntry(model);
      setMsg('Saved — estimated risk: ' + entry.risk);
      els.form?.reset();
      renderDashboard();
    });

    els.clearBtn?.addEventListener('click', ()=>{
      els.form?.reset();
      setMsg('Form reset.');
    });

    els.exportBtn?.addEventListener('click', exportJson);

    els.importBtn?.addEventListener('click', async ()=>{
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = async ()=>{
        const file = input.files?.[0];
        if(!file) return;
        try{
          const count = await importJsonFromFile(file);
          setMsg(`${count} records imported.`);
        }catch(err){
          setMsg('Import failed: ' + (err?.message || err));
        }
      };
      input.click();
    });
  });
})();