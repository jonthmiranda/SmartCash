/**
 * SmartCash — vencimentos.js
 * Datas de vencimento e lembretes
 * -----------------------------------------------
 * Este arquivo é carregado tanto pela página (index.html)
 * quanto pelo Service Worker (via importScripts), por isso
 * NÃO pode usar `document`, `window` nem `AppState` no nível
 * superior. Depende apenas de db.js (IndexedDB).
 *
 * Modelo: cada conta tem `diaVencimento` (1–31), que se repete
 * todo mês. Em meses mais curtos o vencimento cai no último dia
 * (ex.: dia 31 → 28/02, 30/04...).
 */

'use strict';

const VENC_AVISOS_ID = 'avisosVencimento';
const VENC_PERIODIC_TAG = 'smartcash-vencimentos';

// ============================================================
// DATAS (sempre no fuso LOCAL do dispositivo)
// ============================================================

/** Converte Date em "YYYY-MM-DD" usando o fuso local. */
function vencDataISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Data de hoje em "YYYY-MM-DD" (fuso local). */
function hojeLocalISO() {
  return vencDataISO(new Date());
}

/** Soma `dias` a uma data "YYYY-MM-DD" e devolve "YYYY-MM-DD". */
function vencSomarDias(dataISO, dias) {
  const [y, m, d] = dataISO.split('-').map(Number);
  return vencDataISO(new Date(y, m - 1, d + dias));
}

/** Diferença em dias inteiros entre duas datas "YYYY-MM-DD" (b − a). */
function vencDiffDias(a, b) {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db_] = b.split('-').map(Number);
  const ta = Date.UTC(ya, ma - 1, da);
  const tb = Date.UTC(yb, mb - 1, db_);
  return Math.round((tb - ta) / 86400000);
}

/** Último dia de um mês "YYYY-MM". */
function vencUltimoDiaDoMes(mesRef) {
  const [y, m] = mesRef.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * Data de vencimento de uma conta dentro de um mês.
 * @param {Object} conta
 * @param {string} mesRef  "YYYY-MM"
 * @returns {string|null}  "YYYY-MM-DD" ou null se a conta não tem vencimento
 */
function vencDataNoMes(conta, mesRef) {
  const dia = parseInt(conta && conta.diaVencimento, 10);
  if (!dia || dia < 1 || dia > 31) return null;
  const dia2 = Math.min(dia, vencUltimoDiaDoMes(mesRef));
  return `${mesRef}-${String(dia2).padStart(2, '0')}`;
}

/**
 * Situação do vencimento de uma conta no mês de referência.
 * @param {Object}  conta
 * @param {string}  mesRef   "YYYY-MM"
 * @param {boolean} paga     Se já existe pagamento no mês
 * @param {string}  [hoje]   "YYYY-MM-DD" (padrão: hoje local)
 * @returns {{data:string|null, dias:number|null, status:string}}
 *   status: 'semdata' | 'paga' | 'atrasada' | 'hoje' | 'amanha' | 'proxima' | 'futura'
 */
function vencSituacao(conta, mesRef, paga, hoje) {
  const data = vencDataNoMes(conta, mesRef);
  if (!data) return { data: null, dias: null, status: 'semdata' };
  if (paga)  return { data, dias: null, status: 'paga' };

  const dias = vencDiffDias(hoje || hojeLocalISO(), data);
  let status = 'futura';
  if (dias < 0)       status = 'atrasada';
  else if (dias === 0) status = 'hoje';
  else if (dias === 1) status = 'amanha';
  else if (dias <= 5)  status = 'proxima';
  return { data, dias, status };
}

// ============================================================
// FORMATAÇÃO SEM DEPENDÊNCIA DE AppState
// ============================================================

function vencFormatarMoeda(valor, moeda) {
  const simbolos = { BRL: 'R$', USD: '$', EUR: '€' };
  const simbolo = simbolos[moeda] || 'R$';
  const txt = (Number(valor) || 0).toFixed(2)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${simbolo} ${txt}`;
}

function vencFormatarData(dataISO) {
  const [y, m, d] = dataISO.split('-');
  return `${d}/${m}/${y}`;
}

// ============================================================
// BUSCA DE CONTAS A VENCER
// ============================================================

/**
 * Retorna as contas ativas que vencem na data informada e
 * ainda não foram pagas no mês de referência dessa data.
 * @param {string} dataAlvo  "YYYY-MM-DD"
 * @returns {Promise<Array<{conta:Object, data:string}>>}
 */
async function vencContasQueVencemEm(dataAlvo) {
  if (!db) await initDB();

  const mesRef    = dataAlvo.slice(0, 7);
  const contas    = await dbGetAll('contas');
  const pagamentos = await dbGetPagamentosPorMes(mesRef);

  return contas
    .filter(c => c.ativa)
    .filter(c => vencDataNoMes(c, mesRef) === dataAlvo)
    .filter(c => !pagamentos.some(p => p.contaId === c.id))
    .map(c => ({ conta: c, data: dataAlvo }));
}

// ============================================================
// CONTROLE DE AVISOS JÁ ENVIADOS (evita notificar duas vezes)
// ============================================================

async function vencLerAvisos() {
  const reg = await dbGet('configuracoes', VENC_AVISOS_ID);
  return (reg && Array.isArray(reg.chaves)) ? reg.chaves : [];
}

async function vencSalvarAvisos(chaves) {
  // Mantém só os últimos 60 registros para não crescer sem limite
  await dbPut('configuracoes', { id: VENC_AVISOS_ID, chaves: chaves.slice(-60) });
}

// ============================================================
// VERIFICAÇÃO + ENVIO DA NOTIFICAÇÃO (página e Service Worker)
// ============================================================

/**
 * Verifica as contas que vencem AMANHÃ e envia uma notificação
 * para cada uma (uma única vez por conta/data).
 *
 * @param {ServiceWorkerRegistration} registration  Usada para showNotification
 * @param {Object} [opcoes]
 * @param {boolean} [opcoes.ignorarPreferencia]  Envia mesmo com lembretes desativados
 * @param {boolean} [opcoes.ignorarHistorico]    Reenvia mesmo se já avisou
 * @returns {Promise<number>} Quantidade de notificações enviadas
 */
async function vencVerificarEEnviar(registration, opcoes = {}) {
  if (!registration || typeof Notification === 'undefined') return 0;
  if (Notification.permission !== 'granted') return 0;

  if (!db) await initDB();

  const cfg = await dbGet('configuracoes', 1);
  if (!opcoes.ignorarPreferencia && !(cfg && cfg.notificacoesVencimento)) return 0;
  const moeda = (cfg && cfg.moeda) || 'BRL';

  const amanha    = vencSomarDias(hojeLocalISO(), 1);
  const vencendo  = await vencContasQueVencemEm(amanha);
  if (vencendo.length === 0) return 0;

  let avisos = await vencLerAvisos();
  let enviadas = 0;

  for (const { conta, data } of vencendo) {
    const chave = `${conta.id}|${data}`;
    if (!opcoes.ignorarHistorico && avisos.includes(chave)) continue;

    await registration.showNotification('SmartCash — conta vence amanhã', {
      body: `${conta.nome} (${vencFormatarMoeda(conta.valorParcela, moeda)}) vence amanhã, ${vencFormatarData(data)}. Não esqueça de pagar!`,
      tag: `vencimento-${chave}`,
      icon: 'assets/icons/icon-192.png',
      badge: 'assets/icons/icon-192.png',
      data: { url: './index.html#contas' }
    });

    avisos.push(chave);
    enviadas++;
  }

  if (enviadas > 0) await vencSalvarAvisos(avisos);
  return enviadas;
}
