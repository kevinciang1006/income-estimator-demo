/*
 * Income Estimator demo.
 * All compensation math lives in CONFIG + calculate(). The real formulas from the
 * client replace the placeholder numbers below; nothing else needs to change.
 */
const CONFIG = {
  // Marginal tiers on annual gross profit. `upTo: null` means "and above".
  tracks: {
    base_0:     { base: 0,     label: '$0 base',      tiers: [{ upTo: 250000, rate: 0.20 }, { upTo: 750000, rate: 0.30 }, { upTo: null, rate: 0.40 }] },
    base_25000: { base: 25000, label: '$25,000 base', tiers: [{ upTo: 250000, rate: 0.15 }, { upTo: 750000, rate: 0.25 }, { upTo: null, rate: 0.35 }] },
    base_50000: { base: 50000, label: '$50,000 base', tiers: [{ upTo: 250000, rate: 0.10 }, { upTo: 750000, rate: 0.20 }, { upTo: null, rate: 0.30 }] },
  },
  benefits: {
    employeeValue: 9000,        // yearly value of the employee's own coverage
    perExtraMember: 6500,       // each additional covered family member
    thresholdShiftPerMember: 15000, // every tier threshold moves up by this per covered member
  },
  family: { min: 1, max: 8 },
  webhookUrl: 'https://YOUR-NETHUNT-WEBHOOK-URL', // production: called from the sign-in function, never from the browser
};

/** Pure function: same result in the browser and in Node. */
function calculate({ path, grossProfit, benefits, familySize }, config = CONFIG) {
  const track = config.tracks[path];
  if (!track) throw new Error('Unknown path ' + path);
  const members = benefits ? Math.max(1, familySize | 0) : 0;
  const shift = members * config.benefits.thresholdShiftPerMember;

  let lower = 0;
  let commission = 0;
  const tiers = track.tiers.map((t) => {
    const upper = t.upTo == null ? Infinity : t.upTo + shift;
    const inBand = Math.max(0, Math.min(grossProfit, upper) - lower);
    const payout = Math.round(inBand * t.rate);
    const row = { from: lower, to: upper, rate: t.rate, amountInBand: inBand, payout };
    commission += payout;
    lower = upper;
    return row;
  });

  const benefitsValue = benefits
    ? config.benefits.employeeValue + (members - 1) * config.benefits.perExtraMember
    : 0;
  const cash = track.base + commission;
  return { base: track.base, commission, benefitsValue, cash, total: cash + benefitsValue, tiers, thresholdShift: shift };
}

const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const pct = (r) => Math.round(r * 100) + '%';

/* ------------------------------------------------------------------ Node test */
if (typeof window === 'undefined') {
  if (typeof module !== 'undefined') module.exports = { CONFIG, calculate };
  if (typeof process !== 'undefined' && process.argv.includes('--test')) {
    const assert = require('assert');
    // $25k base, $750k GP, no benefits: 250k*15% + 500k*25% = 37,500 + 125,000
    let r = calculate({ path: 'base_25000', grossProfit: 750000, benefits: false, familySize: 1 });
    assert.strictEqual(r.commission, 162500); assert.strictEqual(r.total, 187500);
    // $0 base, $1M GP: 250k*20% + 500k*30% + 250k*40% = 50k + 150k + 100k
    r = calculate({ path: 'base_0', grossProfit: 1000000, benefits: false, familySize: 1 });
    assert.strictEqual(r.commission, 300000); assert.strictEqual(r.total, 300000);
    // $50k base, $1M GP, benefits for 3: shift 45k -> tiers 0-295k@10%, 295k-795k@20%, 205k@30%
    r = calculate({ path: 'base_50000', grossProfit: 1000000, benefits: true, familySize: 3 });
    assert.strictEqual(r.commission, 29500 + 100000 + 61500);
    assert.strictEqual(r.benefitsValue, 22000);
    assert.strictEqual(r.total, 50000 + 191000 + 22000);
    // zero GP
    r = calculate({ path: 'base_0', grossProfit: 0, benefits: false, familySize: 1 });
    assert.strictEqual(r.total, 0);
    console.log('math tests passed (4 cases)');
  }
}

/* ------------------------------------------------------------------ Browser UI */
if (typeof window !== 'undefined') {
  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = { path: 'base_25000', grossProfit: 750000, benefits: false, familySize: 1, step: 1, profile: null };

  const rateRange = (path) => {
    const rates = CONFIG.tracks[path].tiers.map((t) => Math.round(t.rate * 100));
    return Math.min(...rates) + '–' + Math.max(...rates) + '%';
  };

  // "$187,500" -> "$1••,•••": keep the shape, hide the number.
  const mask = (n) => money(n).replace(/\d/g, (d, i) => (i === 1 ? d : '•'));

  function update() {
    const r = calculate(state);
    const track = CONFIG.tracks[state.path];

    document.querySelectorAll('.path-card').forEach((card) => {
      const on = card.dataset.path === state.path;
      card.classList.toggle('is-selected', on);
      card.querySelector('input').checked = on;
    });
    $('path-hint').textContent = (track.base ? 'A ' + money(track.base) + ' foundation' : 'No base, maximum upside') + ', plus ' + rateRange(state.path) + ' marginal commission.';
    $('selected-path-label').textContent = track.label;

    const slider = $('gross-profit');
    slider.value = state.grossProfit;
    slider.style.setProperty('--fill', (state.grossProfit / Number(slider.max)) * 100 + '%');
    slider.setAttribute('aria-valuetext', money(state.grossProfit) + ' per year');
    $('gross-profit-value').textContent = money(state.grossProfit);

    $('benefits-toggle').checked = state.benefits;
    $('benefits-toggle').setAttribute('aria-expanded', String(state.benefits));
    $('family-panel').hidden = !state.benefits;
    $('family-value').textContent = state.familySize;
    $('family-minus').disabled = state.familySize <= CONFIG.family.min;
    $('family-plus').disabled = state.familySize >= CONFIG.family.max;
    $('benefits-preview').textContent = money(r.benefitsValue) + ' / year in benefits';
    $('threshold-note').textContent = 'Your commission tier thresholds rise by ' + money(r.thresholdShift) + ' with this coverage.';

    $('mini-teaser-value').textContent = mask(r.total);
    $('large-teaser-value').textContent = mask(r.total);
    $('recap-path').textContent = track.label;
    $('recap-profit').textContent = money(state.grossProfit) + ' gross profit';
    return r;
  }

  function goStep(n) {
    state.step = n;
    [1, 2, 3].forEach((i) => { $('step-' + i).hidden = i !== n; });
    document.querySelectorAll('.road-progress li').forEach((li, i) => {
      li.classList.toggle('is-current', i + 1 === n);
      li.classList.toggle('is-done', i + 1 < n);
      if (i + 1 === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    document.querySelectorAll('.route-stop').forEach((s, i) => {
      s.classList.toggle('is-current', i + 1 === n);
      s.classList.toggle('is-done', i + 1 < n);
    });
    $('step-caption').textContent = 'STEP 0' + n + ' / 03';
    const titles = ['path-title', 'potential-title', 'unlock-title'];
    $('step-announcement').textContent = 'Step ' + n + ' of 3';
    const h = $(titles[n - 1]);
    h.focus({ preventScroll: true });
    $('estimator').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  function countUp(el, to) {
    if (reduceMotion) { el.textContent = money(to); return; }
    const start = performance.now();
    const dur = 1100;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      el.textContent = money(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function showResults() {
    const r = update();
    const track = CONFIG.tracks[state.path];
    document.body.dataset.screen = 'results';
    $('estimator').hidden = true;
    $('results').hidden = false;

    const first = state.profile.name.split(' ')[0];
    $('results-title').textContent = 'That’s your potential, ' + first + '.';
    countUp($('total-amount'), r.total);
    $('total-description').textContent = state.benefits ? 'Base salary + commission + benefits' : 'Base salary + commission';
    $('results-path').textContent = track.label + ' path';
    $('results-profit').textContent = 'Based on ' + money(state.grossProfit) + ' gross profit / year';
    $('result-base').textContent = money(r.base);
    $('result-commission').textContent = money(r.commission);
    $('commission-rate-note').textContent = rateRange(state.path) + ' marginal rates';
    $('result-benefits').textContent = money(r.benefitsValue);
    $('coverage-summary').textContent = state.benefits
      ? 'Covering ' + state.familySize + (state.familySize === 1 ? ' person' : ' people')
      : 'Coverage not selected';
    $('result-cash').textContent = money(r.cash);

    $('tier-rows').innerHTML = r.tiers.map((t) => {
      const band = t.to === Infinity ? money(t.from) + '+' : money(t.from) + ' – ' + money(t.to);
      return '<tr' + (t.amountInBand ? '' : ' class="is-empty"') + '><td>' + band + '</td><td>' + pct(t.rate) + '</td><td>' + money(t.payout) + '</td></tr>';
    }).join('');
    $('table-total').textContent = money(r.commission);
    const shiftNote = $('result-threshold-note');
    shiftNote.hidden = !state.benefits;
    shiftNote.textContent = state.benefits ? 'Tier thresholds moved up ' + money(r.thresholdShift) + ' because you’re covering ' + state.familySize + (state.familySize === 1 ? ' person.' : ' people.') : '';

    const parts = { base: r.base, commission: r.commission, benefits: r.benefitsValue };
    const zero = r.total === 0;
    Object.entries(parts).forEach(([k, v]) => {
      const share = zero ? 0 : (v / r.total) * 100;
      $('bar-' + k).style.width = share + '%';
      $('share-' + k).textContent = Math.round(share) + '%';
    });
    $('compensation-bar').setAttribute('aria-label', 'Compensation split: ' + Object.entries(parts).map(([k, v]) => k + ' ' + money(v)).join(', '));
    $('zero-note').hidden = !zero;

    const params = new URLSearchParams(location.search);
    const payload = {
      event: 'income_estimator.lead',
      lead: { name: state.profile.name, email: state.profile.email, linkedin_id: state.profile.sub },
      inputs: { path: state.path, base_salary: r.base, gross_profit: state.grossProfit, benefits_opt_in: state.benefits, family_size: state.benefits ? state.familySize : 0 },
      results: { commission: r.commission, benefits_value: r.benefitsValue, cash_take_home: r.cash, total_compensation: r.total },
      utm_source: params.get('utm_source') || 'linkedin_dm',
      submitted_at: new Date().toISOString(),
    };
    $('crm-payload').textContent = JSON.stringify(payload, null, 2);

    $('results-title').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  function recalc() {
    document.body.dataset.screen = 'estimator';
    $('results').hidden = true;
    $('estimator').hidden = false;
    goStep(2);
  }

  /* --- wiring --- */
  document.querySelectorAll('input[name="path"]').forEach((input) =>
    input.addEventListener('change', () => { state.path = input.value; update(); }));

  $('gross-profit').addEventListener('input', (e) => { state.grossProfit = Number(e.target.value); update(); });

  $('benefits-toggle').addEventListener('change', (e) => { state.benefits = e.target.checked; update(); });
  $('family-minus').addEventListener('click', () => { state.familySize = Math.max(CONFIG.family.min, state.familySize - 1); update(); });
  $('family-plus').addEventListener('click', () => { state.familySize = Math.min(CONFIG.family.max, state.familySize + 1); update(); });

  document.querySelectorAll('[data-go-step]').forEach((b) =>
    b.addEventListener('click', () => goStep(Number(b.dataset.goStep))));

  const dialog = $('linkedin-dialog');
  $('linkedin-signin').addEventListener('click', () => {
    $('consent-status').textContent = 'Just a demo. All the potential.';
    $('consent-continue').disabled = false;
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
  });
  const closeDialog = () => { if (dialog.close) dialog.close(); else dialog.removeAttribute('open'); };
  $('consent-close').addEventListener('click', closeDialog);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) closeDialog(); });
  $('consent-continue').addEventListener('click', () => {
    $('consent-continue').disabled = true;
    $('consent-status').textContent = 'Signing you in…';
    setTimeout(() => {
      state.profile = { name: 'Alex Rivera', email: 'alex.rivera@example.com', sub: 'demo-7Hq2xK' };
      closeDialog();
      showResults();
    }, 1000);
  });

  $('recalculate').addEventListener('click', recalc);

  update();
}
