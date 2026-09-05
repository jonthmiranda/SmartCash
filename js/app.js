'use strict';

/* ============================================================
   1. ESTADO E PERSISTÊNCIA
   ============================================================ */

const KEYS = {
  receitas: 'cf_receitas_v1',
  gastos:   'cf_gastos_v1',
  limites:  'cf_limites_v1',
  dividas:  'cf_dividas_v1'
};

const state = {
  mes:      '',   // "YYYY-MM" do mês sendo visualizado
  receitas: [],
  gastos:   [],
  limites:  {},   // { "YYYY-MM": { 1: 400, 2: 400, 3: 400, 4: 400 } }
  dividas:  []
};

function carregar() {
  state.mes = toMesStr(new Date());
  try { state.receitas = JSON.parse(localStorage.getItem(KEYS.receitas)) || []; } catch (_) { state.receitas = []; }
  try { state.gastos   = JSON.parse(localStorage.getItem(KEYS.gastos))   || []; } catch (_) { state.gastos   = []; }
  try { state.limites  = JSON.parse(localStorage.getItem(KEYS.limites))  || {}; } catch (_) { state.limites  = {}; }
  try { state.dividas  = JSON.parse(localStorage.getItem(KEYS.dividas))  || []; } catch (_) { state.dividas  = []; }
}

const persist = {
  receitas: () => localStorage.setItem(KEYS.receitas, JSON.stringify(state.receitas)),
  gastos:   () => localStorage.setItem(KEYS.gastos,   JSON.stringify(state.gastos)),
  limites:  () => localStorage.setItem(KEYS.limites,  JSON.stringify(state.limites)),
  dividas:  () => localStorage.setItem(KEYS.dividas,  JSON.stringify(state.dividas))
};

/* ============================================================
   2. UTILITÁRIOS
   ============================================================ */

const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

/** Converte Date → "YYYY-MM" */
function toMesStr(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
}

/** Formata "YYYY-MM" → "Janeiro / 2026" */
function labelMes(mesStr) {
  const [y, m] = mesStr.split('-');
  return `${MESES_PT[parseInt(m, 10) - 1]} / ${y}`;
}

/** Formata "YYYY-MM-DD" → "DD/MM/YYYY" */
function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/** Formata número como moeda BR */
function brl(v) {
  const n = Number(v) || 0;
  return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Escapa HTML para evitar XSS */
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Data de hoje em "YYYY-MM-DD" */
function hoje() {
  return new Date().toISOString().split('T')[0];
}

/** Calcula semana do mês (1–4) a partir de "YYYY-MM-DD" */
function semanaFromDate(dateStr) {
  const day = parseInt((dateStr || '').split('-')[2] || '1', 10);
  return Math.min(Math.ceil(day / 7), 4);
}

/**
 * Dias até o próximo vencimento (dia fixo do mês).
 * Negativo = já venceu.
 */
function diasParaVencer(dia) {
  const hoje2 = new Date(); hoje2.setHours(0, 0, 0, 0);
  let venc = new Date(hoje2.getFullYear(), hoje2.getMonth(), dia);
  venc.setHours(0, 0, 0, 0);
  if (venc < hoje2) venc = new Date(hoje2.getFullYear(), hoje2.getMonth() + 1, dia);
  return Math.round((venc - hoje2) / 86400000);
}

/** Obtém elemento pelo ID */
function get(id) { return document.getElementById(id); }

/** Define textContent com segurança */
function setText(id, txt) { const el = get(id); if (el) el.textContent = txt; }

/** Define/limpa mensagem de erro */
function setErr(id, msg)  { const el = get(id); if (el) el.textContent = msg || ''; }

/* ============================================================
   3. MATEMÁTICA FINANCEIRA
   ============================================================ */

/**
 * Valor Futuro — juros compostos
 * VF = VP × (1 + i)^n
 */
function valorFuturo(vp, iPct, n) {
  if (!vp || n <= 0) return vp || 0;
  return vp * Math.pow(1 + (iPct || 0) / 100, n);
}

/**
 * PMT — parcela necessária para quitar em n meses
 * PMT = PV × i / (1 − (1+i)^−n)
 */
function calcPMT(pv, iPct, n) {
  if (!pv || !n) return 0;
  const i = (iPct || 0) / 100;
  if (i === 0) return pv / n;
  return pv * i / (1 - Math.pow(1 + i, -n));
}

/* ============================================================
   4. NAVEGAÇÃO DE MÊS
   ============================================================ */

function navegarMes(delta) {
  const [y, m] = state.mes.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  state.mes = toMesStr(d);
  render();
}

/* ============================================================
   5. RENDER PRINCIPAL
   ============================================================ */

function render() {
  renderMesNav();
  renderTotais();
  renderReceitas();
  renderSemanas();
  renderGastos();
  renderDividas();
}

/* ── Mês ─────────────────────────────────────────────────── */

function renderMesNav() {
  setText('mesAtualLabel', labelMes(state.mes));
}

/* ── Totais ─────────────────────────────────────────────── */

function renderTotais() {
  const mes    = state.mes;
  const totalR = state.receitas.filter(r => r.mes === mes).reduce((s, r) => s + r.valor, 0);
  const totalG = state.gastos.filter(g => g.mes === mes).reduce((s, g) => s + g.valor, 0);
  const saldo  = totalR - totalG;

  setText('totalReceitas', brl(totalR));
  setText('totalGastos',   brl(totalG));

  const elSaldo = get('totalSaldo');
  if (elSaldo) {
    elSaldo.textContent = brl(saldo);
    elSaldo.className   = 'value' + (saldo < 0 ? ' danger' : saldo > 0 ? ' ok' : '');
  }
}

/* ── Receitas ───────────────────────────────────────────── */

function renderReceitas() {
  const mes   = state.mes;
  const lista = state.receitas
    .filter(r => r.mes === mes)
    .sort((a, b) => a.data.localeCompare(b.data));

  const el = get('listaReceitas');
  if (!el) return;

  if (lista.length === 0) {
    el.innerHTML = '<div class="empty-state">Nenhuma receita registrada neste mês.</div>';
    return;
  }

  el.innerHTML = lista.map(r => `
    <div class="ledger-row">
      <span class="ldate">${fmtDate(r.data)}</span>
      <div class="lmain">
        <span class="lname">${esc(r.fonte)}</span>
        ${r.descricao ? `<span class="lsub">${esc(r.descricao)}</span>` : ''}
      </div>
      <span class="lamount income">${brl(r.valor)}</span>
      <div class="lactions">
        <button onclick="abrirEditReceita(${r.id})">editar</button>
        <button class="del" onclick="excluirReceita(${r.id})">excluir</button>
      </div>
    </div>
  `).join('');
}

/* ── Semanas ────────────────────────────────────────────── */

function renderSemanas() {
  const mes  = state.mes;
  const lims = state.limites[mes] || {};

  // Soma gastos por semana
  const por = { 1: 0, 2: 0, 3: 0, 4: 0 };
  state.gastos.filter(g => g.mes === mes).forEach(g => {
    const s = Math.min(parseInt(g.semana, 10) || 1, 4);
    por[s] += g.valor;
  });

  const faixas = ['dias 1–7', 'dias 8–14', 'dias 15–21', 'dias 22–31'];

  let html = `
    <table class="sem-table">
      <thead>
        <tr>
          <th>Semana</th>
          <th>Limite (editável)</th>
          <th>Gasto</th>
          <th>Saldo</th>
        </tr>
      </thead>
      <tbody>`;

  for (let sem = 1; sem <= 4; sem++) {
    const lim  = lims[sem] || 0;
    const gasto = por[sem] || 0;
    const saldo = lim - gasto;
    const over  = gasto > lim && lim > 0;

    html += `<tr>
      <td class="sem-label">Semana ${sem}<small>${faixas[sem - 1]}</small></td>
      <td>
        <input class="lim-input" type="number" min="0" step="0.01"
               data-sem="${sem}" value="${lim || ''}" placeholder="—">
      </td>
      <td class="${over ? 'text-danger' : ''}">${brl(gasto)}</td>
      <td class="${lim > 0 ? (saldo < 0 ? 'text-danger' : 'text-ok') : ''}">
        ${lim > 0 ? brl(saldo) : '—'}
      </td>
    </tr>`;
  }

  html += '</tbody></table>';
  get('tabelaSemanas').innerHTML = html;

  // Bind: salva limite ao sair do campo
  document.querySelectorAll('.lim-input').forEach(inp => {
    inp.addEventListener('change', e => {
      const sem = parseInt(e.target.dataset.sem, 10);
      if (!state.limites[mes]) state.limites[mes] = {};
      state.limites[mes][sem] = parseFloat(e.target.value) || 0;
      persist.limites();
      renderSemanas();
      renderTotais();
    });
  });
}

/* ── Gastos (lista) ─────────────────────────────────────── */

function renderGastos() {
  const mes   = state.mes;
  const lista = state.gastos
    .filter(g => g.mes === mes)
    .sort((a, b) => b.data.localeCompare(a.data));

  const el = get('listaGastos');
  if (!el) return;

  if (lista.length === 0) {
    el.innerHTML = '<div class="empty-state">Nenhum gasto lançado neste mês.</div>';
    return;
  }

  el.innerHTML = lista.map(g => `
    <div class="ledger-row">
      <span class="ldate">${fmtDate(g.data)}</span>
      <div class="lmain">
        <span class="lname">${esc(g.descricao)}</span>
        <span class="lsub">${esc(g.categoria)} · Semana ${g.semana}</span>
      </div>
      <span class="lamount expense">${brl(g.valor)}</span>
      <div class="lactions">
        <button onclick="abrirEditGasto(${g.id})">editar</button>
        <button class="del" onclick="excluirGasto(${g.id})">excluir</button>
      </div>
    </div>
  `).join('');
}

/* ── Dívidas ────────────────────────────────────────────── */

function renderDividas() {
  // Enriquece e ordena por maior crescimento (maior urgência)
  const lista = state.dividas
    .map(d => {
      const vf12  = valorFuturo(d.saldoAtual, d.juros, 12);
      const cresc = vf12 - d.saldoAtual;
      return { ...d, vf12, cresc };
    })
    .sort((a, b) => b.cresc - a.cresc);

  renderRecomendacao(lista);

  const el = get('listaDividas');
  if (!el) return;

  if (lista.length === 0) {
    el.innerHTML = '<div class="empty-state">Nenhuma dívida cadastrada. 🎉</div>';
    return;
  }

  el.innerHTML = lista.map((d, idx) => {

    // ── Progresso ──────────────────────────────────────────
    const orig     = d.saldoOriginal || d.saldoAtual;
    const pago     = Math.max(orig - d.saldoAtual, 0);
    const progPct  = orig > 0 ? Math.min((pago / orig) * 100, 100) : 0;

    // ── Vencimento ─────────────────────────────────────────
    let vencTag = '';
    if (d.vencimentoDia) {
      const dias    = diasParaVencer(d.vencimentoDia);
      const urgente = dias <= 3;
      const txt     = dias === 0 ? 'Vence hoje!'
                    : dias >  0 ? `Vence em ${dias} dia${dias !== 1 ? 's' : ''}`
                    : `Venceu há ${Math.abs(dias)} dia${Math.abs(dias) !== 1 ? 's' : ''}`;
      vencTag = `<span class="venc-tag${urgente || dias < 0 ? ' urgente' : ''}">${txt}</span>`;
    }

    // ── Meta de quitação ───────────────────────────────────
    let goalHtml = '';
    if (d.metaMeses && d.saldoAtual > 0) {
      const pmtVal = calcPMT(d.saldoAtual, d.juros, d.metaMeses);
      goalHtml = `<div class="debt-goal">
        Meta: quitar em ${d.metaMeses} meses → pagar ${brl(pmtVal)}/mês
      </div>`;
    }

    const pctCresc = d.saldoAtual > 0
      ? ((d.cresc / d.saldoAtual) * 100).toFixed(0)
      : 0;

    return `
      <div class="debt-row">
        <div class="debt-num">${String(idx + 1).padStart(2, '0')}</div>
        <div class="debt-main">

          <div class="debt-name-row">
            <span class="debt-name">${esc(d.nome)}</span>
            <span class="debt-balance">${brl(d.saldoAtual)}</span>
          </div>

          <div class="debt-meta">
            <span>${d.juros.toFixed(2)}% a.m.</span>
            ${d.parcelaMin ? `<span>· parcela mín. ${brl(d.parcelaMin)}</span>` : ''}
            ${vencTag}
          </div>

          <div class="progress-wrap">
            <div class="progress-bar">
              <div class="progress-fill" style="width:${progPct.toFixed(1)}%"></div>
            </div>
            <span class="progress-label">
              ${brl(pago)} pagos de ${brl(orig)} (${progPct.toFixed(0)}% quitado)
            </span>
          </div>

          <div class="debt-growth">
            +${brl(d.cresc)} em 12 meses → ${brl(d.vf12)} (+${pctCresc}%)
          </div>

          ${goalHtml}

          <div class="debt-actions">
            <button class="pagar" onclick="abrirPagamento(${d.id})">Registrar pagamento</button>
            <button onclick="abrirEditDivida(${d.id})">Editar</button>
            <button class="quitar" onclick="quitarDivida(${d.id})">Quitar ✓</button>
            <button class="del" onclick="excluirDivida(${d.id})">Excluir</button>
          </div>

        </div>
      </div>`;
  }).join('');
}

function renderRecomendacao(lista) {
  const el = get('recomendacao');
  if (!el) return;

  if (!lista || lista.length === 0) {
    el.classList.remove('visible');
    return;
  }

  const top  = lista[0];
  const pct  = top.saldoAtual > 0
    ? ((top.cresc / top.saldoAtual) * 100).toFixed(0)
    : 0;

  el.classList.add('visible');
  el.innerHTML = `
    <strong>Quite primeiro: ${esc(top.nome)}</strong> —
    com ${top.juros.toFixed(2)}% a.m., mantendo o saldo sem pagar,
    em 12 meses passaria de ${brl(top.saldoAtual)} para
    <strong>${brl(top.vf12)}</strong> (+${brl(top.cresc)}, +${pct}%).
    ${lista.length > 1 ? `Depois foque em: <strong>${esc(lista[1].nome)}</strong>.` : ''}
  `;
}

/* ============================================================
   6. CRUD — RECEITAS
   ============================================================ */

function abrirNovaReceita() {
  get('fRId').value        = '';
  get('fRData').value      = hoje();
  get('fRFonte').value     = 'Salário';
  get('fRDescricao').value = '';
  get('fRValor').value     = '';
  setErr('errRValor', '');
  get('modalReceita').querySelector('.modal-title').textContent = 'Nova receita';
  abrirModal('modalReceita');
}

function abrirEditReceita(id) {
  const r = state.receitas.find(x => x.id === id);
  if (!r) return;
  get('fRId').value        = r.id;
  get('fRData').value      = r.data;
  get('fRFonte').value     = r.fonte;
  get('fRDescricao').value = r.descricao || '';
  get('fRValor').value     = r.valor;
  setErr('errRValor', '');
  get('modalReceita').querySelector('.modal-title').textContent = 'Editar receita';
  abrirModal('modalReceita');
}

function salvarReceita(e) {
  e.preventDefault();
  const id    = get('fRId').value;
  const data  = get('fRData').value;
  const fonte = get('fRFonte').value;
  const desc  = get('fRDescricao').value.trim();
  const valor = parseFloat(get('fRValor').value);

  if (!data || !valor || valor <= 0) {
    setErr('errRValor', 'Informe data e valor maior que zero.');
    return;
  }
  setErr('errRValor', '');

  const mes = data.substring(0, 7);
  const obj = { id: id ? parseInt(id, 10) : Date.now(), mes, data, fonte, descricao: desc, valor };

  if (id) {
    const i = state.receitas.findIndex(x => x.id === obj.id);
    if (i > -1) state.receitas[i] = obj;
  } else {
    state.receitas.push(obj);
  }

  persist.receitas();
  fecharModal('modalReceita');
  render();
  toast(id ? 'Receita atualizada.' : 'Receita adicionada!');
}

function excluirReceita(id) {
  if (!confirm('Excluir esta receita?')) return;
  state.receitas = state.receitas.filter(r => r.id !== id);
  persist.receitas();
  render();
  toast('Receita removida.');
}

/* ============================================================
   7. CRUD — GASTOS
   ============================================================ */

function abrirNovoGasto() {
  const dataHoje = hoje();
  get('fGId').value        = '';
  get('fGData').value      = dataHoje;
  get('fGDescricao').value = '';
  get('fGCategoria').value = 'Mercado';
  get('fGSemana').value    = String(semanaFromDate(dataHoje));
  get('fGValor').value     = '';
  setErr('errGDesc', '');
  setErr('errGValor', '');
  get('modalGasto').querySelector('.modal-title').textContent = 'Lançar gasto';
  abrirModal('modalGasto');
}

function abrirEditGasto(id) {
  const g = state.gastos.find(x => x.id === id);
  if (!g) return;
  get('fGId').value        = g.id;
  get('fGData').value      = g.data;
  get('fGDescricao').value = g.descricao;
  get('fGCategoria').value = g.categoria;
  get('fGSemana').value    = String(g.semana);
  get('fGValor').value     = g.valor;
  setErr('errGDesc', '');
  setErr('errGValor', '');
  get('modalGasto').querySelector('.modal-title').textContent = 'Editar gasto';
  abrirModal('modalGasto');
}

function salvarGasto(e) {
  e.preventDefault();
  const id    = get('fGId').value;
  const data  = get('fGData').value;
  const desc  = get('fGDescricao').value.trim();
  const cat   = get('fGCategoria').value;
  const sem   = parseInt(get('fGSemana').value, 10) || 1;
  const valor = parseFloat(get('fGValor').value);

  let ok = true;
  if (!desc)             { setErr('errGDesc',  'Descrição obrigatória.'); ok = false; }
  else                     setErr('errGDesc',  '');
  if (!valor || valor <= 0) { setErr('errGValor', 'Valor deve ser > 0.'); ok = false; }
  else                     setErr('errGValor', '');
  if (!ok) return;

  const mes = data.substring(0, 7);
  const obj = { id: id ? parseInt(id, 10) : Date.now(), mes, data, descricao: desc, categoria: cat, semana: sem, valor };

  if (id) {
    const i = state.gastos.findIndex(x => x.id === obj.id);
    if (i > -1) state.gastos[i] = obj;
  } else {
    state.gastos.push(obj);
  }

  persist.gastos();
  fecharModal('modalGasto');
  render();
  toast(id ? 'Gasto atualizado.' : 'Gasto lançado!');
}

function excluirGasto(id) {
  if (!confirm('Excluir este gasto?')) return;
  state.gastos = state.gastos.filter(g => g.id !== id);
  persist.gastos();
  render();
  toast('Gasto removido.');
}

/* ============================================================
   8. CRUD — DÍVIDAS
   ============================================================ */

function abrirNovaDivida() {
  get('fDId').value        = '';
  get('fDNome').value      = '';
  get('fDSaldo').value     = '';
  get('fDSaldoOrig').value = '';
  get('fDJuros').value     = '';
  get('fDParcela').value   = '';
  get('fDVenc').value      = '';
  get('fDMeta').value      = '';
  ['errDNome','errDSaldo','errDJuros'].forEach(id => setErr(id, ''));
  get('modalDivida').querySelector('.modal-title').textContent = 'Nova dívida';
  abrirModal('modalDivida');
}

function abrirEditDivida(id) {
  const d = state.dividas.find(x => x.id === id);
  if (!d) return;
  get('fDId').value        = d.id;
  get('fDNome').value      = d.nome;
  get('fDSaldo').value     = d.saldoAtual;
  get('fDSaldoOrig').value = d.saldoOriginal || '';
  get('fDJuros').value     = d.juros;
  get('fDParcela').value   = d.parcelaMin || '';
  get('fDVenc').value      = d.vencimentoDia || '';
  get('fDMeta').value      = d.metaMeses || '';
  ['errDNome','errDSaldo','errDJuros'].forEach(id => setErr(id, ''));
  get('modalDivida').querySelector('.modal-title').textContent = 'Editar dívida';
  abrirModal('modalDivida');
}

function salvarDivida(e) {
  e.preventDefault();
  const id         = get('fDId').value;
  const nome       = get('fDNome').value.trim();
  const saldoAtual = parseFloat(get('fDSaldo').value);
  const saldoOrig  = parseFloat(get('fDSaldoOrig').value) || saldoAtual;
  const juros      = parseFloat(get('fDJuros').value);
  const parcelaMin = parseFloat(get('fDParcela').value) || 0;
  const vencDia    = parseInt(get('fDVenc').value, 10)  || 0;
  const metaMeses  = parseInt(get('fDMeta').value, 10)  || 0;

  let ok = true;
  if (!nome)                 { setErr('errDNome',  'Informe um nome.');            ok = false; } else setErr('errDNome',  '');
  if (!saldoAtual || saldoAtual <= 0) { setErr('errDSaldo', 'Saldo deve ser > 0.');       ok = false; } else setErr('errDSaldo', '');
  if (!juros || juros <= 0)  { setErr('errDJuros', 'Informe a taxa de juros.');    ok = false; } else setErr('errDJuros', '');
  if (!ok) return;

  // Preserva pagamentos existentes ao editar
  const pagamentosAtuais = id
    ? (state.dividas.find(x => x.id === parseInt(id, 10))?.pagamentos || [])
    : [];

  const obj = {
    id: id ? parseInt(id, 10) : Date.now(),
    nome, saldoAtual, saldoOriginal: saldoOrig,
    juros, parcelaMin, vencimentoDia: vencDia,
    metaMeses, pagamentos: pagamentosAtuais
  };

  if (id) {
    const i = state.dividas.findIndex(x => x.id === obj.id);
    if (i > -1) state.dividas[i] = obj;
  } else {
    state.dividas.push(obj);
  }

  persist.dividas();
  fecharModal('modalDivida');
  render();
  toast(id ? 'Dívida atualizada.' : 'Dívida registrada.');
}

function quitarDivida(id) {
  if (!confirm('Marcar como quitada? Ela será removida da lista.')) return;
  state.dividas = state.dividas.filter(d => d.id !== id);
  persist.dividas();
  render();
  toast('Dívida quitada! 🎉');
}

function excluirDivida(id) {
  if (!confirm('Excluir esta dívida da lista?')) return;
  state.dividas = state.dividas.filter(d => d.id !== id);
  persist.dividas();
  render();
  toast('Dívida removida.');
}

/* ============================================================
   9. PAGAMENTOS PARCIAIS DE DÍVIDA
   ============================================================ */

function abrirPagamento(id) {
  const d = state.dividas.find(x => x.id === id);
  if (!d) return;

  get('fPDividaId').value   = id;
  get('fPData').value       = hoje();
  get('fPValor').value      = '';
  get('fPObs').value        = '';
  setErr('errPValor', '');

  const info = get('fPDividaInfo');
  if (info) info.textContent = `${d.nome} — Saldo atual: ${brl(d.saldoAtual)}`;

  abrirModal('modalPagamento');
}

function salvarPagamento(e) {
  e.preventDefault();
  const divId = parseInt(get('fPDividaId').value, 10);
  const data  = get('fPData').value;
  const valor = parseFloat(get('fPValor').value);
  const obs   = get('fPObs').value.trim();

  if (!valor || valor <= 0) {
    setErr('errPValor', 'Informe um valor maior que zero.');
    return;
  }
  setErr('errPValor', '');

  const idx = state.dividas.findIndex(d => d.id === divId);
  if (idx === -1) return;

  const d   = state.dividas[idx];
  const pag = { id: Date.now(), data, valor, obs };

  d.pagamentos = [...(d.pagamentos || []), pag];
  d.saldoAtual = Math.max(+(d.saldoAtual - valor).toFixed(2), 0);

  persist.dividas();
  fecharModal('modalPagamento');
  render();

  toast(
    d.saldoAtual === 0
      ? `${d.nome} foi quitada! 🎉`
      : `Pagamento de ${brl(valor)} registrado. Restam ${brl(d.saldoAtual)}.`
  );
}

/* ============================================================
   10. SIMULADOR
   ============================================================ */

function simular() {
  const saldo = parseFloat(get('simSaldo').value) || 0;
  const juros = parseFloat(get('simJuros').value) || 0;
  const el    = get('simResultados');

  if (saldo <= 0 || juros <= 0) {
    toast('Preencha saldo e juros para simular.', 'error');
    return;
  }

  const periodos = [1, 3, 6, 12];
  let html = `
    <table>
      <thead>
        <tr><th>Período</th><th>Valor projetado</th><th>Crescimento</th></tr>
      </thead>
      <tbody>`;

  periodos.forEach(n => {
    const vf    = valorFuturo(saldo, juros, n);
    const cresc = vf - saldo;
    html += `<tr>
      <td>${n} ${n === 1 ? 'mês' : 'meses'}</td>
      <td>${brl(vf)}</td>
      <td class="growth">+${brl(cresc)}</td>
    </tr>`;
  });

  const r72 = Math.ceil(72 / juros);
  html += `</tbody></table>
    <p class="sim-hint">
      💡 Regra dos 72: com ${juros}% a.m., o saldo dobra em ≈ ${r72} meses.
    </p>`;

  el.innerHTML = html;
}

/* ============================================================
   11. MODAIS
   ============================================================ */

function abrirModal(id) {
  const modal = get(id);
  if (!modal) return;
  modal.classList.add('active');
  // Foca no primeiro campo visível
  const primeiro = modal.querySelector('input:not([type=hidden]), select');
  if (primeiro) setTimeout(() => primeiro.focus(), 80);
}

function fecharModal(id) {
  get(id)?.classList.remove('active');
}

/* ============================================================
   12. TOAST
   ============================================================ */

function toast(msg, tipo) {
  const c = get('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  t.className = 'toast' + (tipo === 'error' ? ' error' : '');
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('visible')));
  setTimeout(() => {
    t.classList.remove('visible');
    setTimeout(() => t.remove(), 300);
  }, 3200);
}

/* ============================================================
   13. EVENTOS GLOBAIS
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  // Navegação de mês
  get('btnMesAnterior').addEventListener('click', () => navegarMes(-1));
  get('btnProximoMes') .addEventListener('click', () => navegarMes(1));

  // Abrir modais
  get('btnNovaReceita').addEventListener('click', abrirNovaReceita);
  get('btnNovoGasto')  .addEventListener('click', abrirNovoGasto);
  get('btnNovaDivida') .addEventListener('click', abrirNovaDivida);
  get('btnSimular')    .addEventListener('click', simular);

  // Submit de formulários
  get('formReceita')  ?.addEventListener('submit', salvarReceita);
  get('formGasto')    ?.addEventListener('submit', salvarGasto);
  get('formDivida')   ?.addEventListener('submit', salvarDivida);
  get('formPagamento')?.addEventListener('submit', salvarPagamento);

  // Auto-detecta semana ao mudar data do gasto
  get('fGData')?.addEventListener('change', e => {
    get('fGSemana').value = String(semanaFromDate(e.target.value));
  });

  // Fechar modal ao clicar no backdrop
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal) modal.classList.remove('active');
    });
  });

  // Fechar modal pelos botões [data-close]
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => fecharModal(btn.dataset.close));
  });

  // Fechar modal com ESC
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
    }
  });

  // Inicializa
  carregar();
  render();
});
