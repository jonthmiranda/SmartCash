/**
 * SmartCash — configuracoes.js
 * Tela 6: Configurações
 * -----------------------------------------------
 * Gerencia:
 *  - Dados financeiros (salário, dia pagamento, moeda)
 *  - Preferências de aparência (tema)
 *  - Instalação do PWA e lembretes de vencimento
 *  - Exportação de dados (JSON e CSV)
 *  - Backup completo (exportar e importar)
 *  - Limpeza de todos os dados
 */

'use strict';

// ============================================================
// RENDER PRINCIPAL
// ============================================================

/**
 * Renderiza a tela de Configurações.
 */
async function renderConfiguracoes() {
  try {
    const config = AppState.config;

    // Preenche os campos com os valores atuais
    setValCfg('cfgMoeda', config.moeda || 'BRL');
    setValCfg('cfgTema',  config.tema  || 'dark');

    // Configura eventos (uma única vez)
    setupFormConfig();
    setupExportarImportar();
    setupPWAeNotificacoes();

    // Estado atual de instalação e lembretes
    atualizarUIInstalacao();
    atualizarUINotificacoes();

  } catch (err) {
    console.error('[Config] Erro ao renderizar:', err);
    showToast('Erro ao carregar configurações.', 'error');
  }
}

// ============================================================
// FORMULÁRIO DE CONFIGURAÇÕES
// ============================================================

function setupFormConfig() {
  const btnSalvar     = document.getElementById('btnSalvarConfig');
  const btnSalvarTema = document.getElementById('btnSalvarTema');
  const btnLimpar     = document.getElementById('btnLimparDados');

  if (btnSalvar && !btnSalvar._scListener) {
    btnSalvar.addEventListener('click', salvarConfiguracoes);
    btnSalvar._scListener = true;
  }

  if (btnSalvarTema && !btnSalvarTema._scListener) {
    btnSalvarTema.addEventListener('click', salvarTema);
    btnSalvarTema._scListener = true;
  }

  if (btnLimpar && !btnLimpar._scListener) {
    btnLimpar.addEventListener('click', confirmarLimparDados);
    btnLimpar._scListener = true;
  }
}

/**
 * Salva as configurações financeiras no banco.
 */
async function salvarConfiguracoes() {
  const moeda = document.getElementById('cfgMoeda')?.value || 'BRL';

  AppState.config.moeda = moeda;

  try {
    await saveConfig();
    showToast('Configurações salvas com sucesso! ✅');

    // Recarrega o dashboard com os novos valores
    if (AppState.currentScreen === 'dashboard') {
      await renderDashboard();
    }
  } catch (err) {
    console.error('[Config] Erro ao salvar:', err);
    showToast('Erro ao salvar configurações.', 'error');
  }
}

/**
 * Aplica e salva o tema selecionado.
 */
async function salvarTema() {
  const tema = document.getElementById('cfgTema')?.value || 'dark';
  AppState.config.tema = tema;
  applyTheme(tema);

  try {
    await saveConfig();
    showToast('Tema aplicado com sucesso!');
  } catch (err) {
    showToast('Erro ao salvar tema.', 'error');
  }
}

/**
 * Confirma e executa a limpeza total dos dados.
 */
function confirmarLimparDados() {
  showConfirm(
    '⚠️ ATENÇÃO: Esta ação vai apagar TODOS os dados permanentemente. Não há como desfazer. Deseja continuar?',
    async () => {
      try {
        const temaAtual = AppState.config.tema;
        const moedaAtual = AppState.config.moeda;
        const notifAtual = !!AppState.config.notificacoesVencimento;

        await dbClearAll();

        // Reinicia configurações preservando tema e moeda
        AppState.config = {
          id: 1,
          limiteSemanal: 0,
          tema: temaAtual,
          moeda: moedaAtual,
          notificacoesVencimento: notifAtual,
          lastProcessedMonth: AppState.currentMonth
        };

        await saveConfig();
        await renderConfiguracoes();
        showToast('Todos os dados foram limpos.', 'info');
      } catch (err) {
        console.error('[Config] Erro ao limpar dados:', err);
        showToast('Erro ao limpar dados.', 'error');
      }
    }
  );
}

// ============================================================
// INSTALAÇÃO DO PWA E LEMBRETES DE VENCIMENTO
// ============================================================

function setupPWAeNotificacoes() {
  const btnInstalar = document.getElementById('btnInstalarPWA');
  const chkNotif    = document.getElementById('cfgNotificacoes');
  const btnTeste    = document.getElementById('btnTestarNotificacao');

  if (btnInstalar && !btnInstalar._scListener) {
    btnInstalar.addEventListener('click', instalarPWA);
    btnInstalar._scListener = true;
  }
  if (chkNotif && !chkNotif._scListener) {
    chkNotif.addEventListener('change', alternarLembretes);
    chkNotif._scListener = true;
  }
  if (btnTeste && !btnTeste._scListener) {
    btnTeste.addEventListener('click', enviarNotificacaoTeste);
    btnTeste._scListener = true;
  }
}

/** Reflete permissão + preferência na tela. */
function atualizarUINotificacoes() {
  const chk    = document.getElementById('cfgNotificacoes');
  const status = document.getElementById('notifStatus');
  const btn    = document.getElementById('btnTestarNotificacao');
  if (!chk || !status) return;

  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    chk.checked = false;
    chk.disabled = true;
    if (btn) btn.disabled = true;
    status.textContent = ehIOS() && !appJaInstalado()
      ? 'No iPhone/iPad, instale o app na Tela de Início para poder receber notificações.'
      : 'Este navegador não suporta notificações.';
    return;
  }

  const permissao = Notification.permission;
  chk.checked = !!AppState.config.notificacoesVencimento && permissao === 'granted';
  if (btn) btn.disabled = permissao !== 'granted';

  if (permissao === 'denied') {
    chk.disabled = true;
    status.textContent = 'As notificações estão bloqueadas. Libere nas permissões do site/app para ativar.';
  } else if (chk.checked) {
    status.textContent = 'Lembretes ativos: você será avisado um dia antes de cada vencimento.';
  } else {
    status.textContent = 'Lembretes desativados.';
  }
}

/** Liga/desliga os lembretes (pede permissão quando necessário). */
async function alternarLembretes(event) {
  const chk = event.target;

  if (chk.checked) {
    let permissao = Notification.permission;
    if (permissao === 'default') permissao = await Notification.requestPermission();

    if (permissao !== 'granted') {
      AppState.config.notificacoesVencimento = false;
      await saveConfig();
      atualizarUINotificacoes();
      showToast('Permissão de notificação não concedida.', 'error');
      return;
    }

    AppState.config.notificacoesVencimento = true;
    await saveConfig();
    iniciarLembretesVencimento();
    await registrarSyncPeriodico();
    const enviadas = await verificarVencimentosAgora();
    showToast(enviadas > 0
      ? `Lembretes ativados! ${enviadas} conta(s) vencem amanhã.`
      : 'Lembretes de vencimento ativados! 🔔');
  } else {
    AppState.config.notificacoesVencimento = false;
    await saveConfig();
    await cancelarSyncPeriodico();
    showToast('Lembretes desativados.', 'info');
  }

  atualizarUINotificacoes();
}

/** Envia uma notificação de teste para confirmar que tudo funciona. */
async function enviarNotificacaoTeste() {
  try {
    if (Notification.permission !== 'granted') {
      showToast('Ative os lembretes e permita as notificações primeiro.', 'error');
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('SmartCash — teste', {
      body: 'Tudo certo! Você receberá um aviso um dia antes de cada conta vencer.',
      tag: 'smartcash-teste',
      icon: 'assets/icons/icon-192.png',
      badge: 'assets/icons/icon-192.png',
      data: { url: './index.html#configuracoes' }
    });
  } catch (err) {
    console.error('[Config] Erro no teste de notificação:', err);
    showToast('Não foi possível enviar a notificação de teste.', 'error');
  }
}

/**
 * Registra a verificação periódica em segundo plano (Chrome/Edge com o app
 * instalado). Permite avisar mesmo com o app fechado. Onde não há suporte,
 * a verificação acontece ao abrir o app.
 */
async function registrarSyncPeriodico() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!('periodicSync' in reg)) return false;

    const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (status.state !== 'granted') return false;

    await reg.periodicSync.register(VENC_PERIODIC_TAG, { minInterval: 12 * 60 * 60 * 1000 });
    return true;
  } catch (err) {
    console.warn('[Vencimentos] Sync periódico indisponível:', err);
    return false;
  }
}

async function cancelarSyncPeriodico() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if ('periodicSync' in reg) await reg.periodicSync.unregister(VENC_PERIODIC_TAG);
  } catch (err) {
    console.warn('[Vencimentos] Erro ao cancelar sync periódico:', err);
  }
}

// ============================================================
// EXPORTAÇÃO E BACKUP
// ============================================================

function setupExportarImportar() {
  const btnJSON   = document.getElementById('btnExportJSON');
  const btnCSV    = document.getElementById('btnExportCSV');
  const btnBackup = document.getElementById('btnBackup');
  const inputFile = document.getElementById('btnImport');

  if (btnJSON && !btnJSON._scListener) {
    btnJSON.addEventListener('click', exportarJSON);
    btnJSON._scListener = true;
  }

  if (btnCSV && !btnCSV._scListener) {
    btnCSV.addEventListener('click', exportarCSV);
    btnCSV._scListener = true;
  }

  if (btnBackup && !btnBackup._scListener) {
    btnBackup.addEventListener('click', exportarBackup);
    btnBackup._scListener = true;
  }

  if (inputFile && !inputFile._scListener) {
    inputFile.addEventListener('change', importarBackup);
    inputFile._scListener = true;
  }
}

// ── Exportar JSON ──────────────────────────────────────────

/**
 * Exporta todos os dados como arquivo JSON.
 */
async function exportarJSON() {
  try {
    const dados = await dbExportAll();
    const json  = JSON.stringify(dados, null, 2);
    baixarArquivo(json, `smartcash_dados_${getCurrentMonth()}.json`, 'application/json');
    showToast('Dados exportados em JSON! 📤');
  } catch (err) {
    showToast('Erro ao exportar JSON.', 'error');
  }
}

// ── Exportar CSV ───────────────────────────────────────────

/**
 * Exporta todas as tabelas como CSV (um bloco por tabela).
 */
async function exportarCSV() {
  try {
    const dados = await dbExportAll();
    let csv = `SmartCash — Exportação CSV — ${new Date().toLocaleDateString('pt-BR')}\n\n`;

    // Contas
    csv += 'CONTAS\n';
    csv += 'ID,Nome,Categoria,Valor Parcela,Parcelas Totais,Parcelas Restantes,Fixa,Ativa,Dia Vencimento,Data Criação\n';
    (dados.contas || []).forEach(c => {
      csv += `${c.id},"${c.nome}","${c.categoria}",${c.valorParcela},` +
             `${c.parcelasTotais ?? ''},${c.parcelasRestantes ?? ''},` +
             `${c.fixa},${c.ativa},${c.diaVencimento ?? ''},${c.dataCriacao}\n`;
    });

    // Pagamentos
    csv += '\nPAGAMENTOS\n';
    csv += 'ID,Conta ID,Mês Referência,Valor Pago,Data Pagamento\n';
    (dados.pagamentos || []).forEach(p => {
      csv += `${p.id},${p.contaId},${p.mesReferencia},${p.valorPago},${p.dataPagamento}\n`;
    });

    // Gastos
    csv += '\nGASTOS\n';
    csv += 'ID,Data,Descrição,Categoria,Semana,Valor\n';
    (dados.gastos || []).forEach(g => {
      csv += `${g.id},${g.data},"${g.descricao}","${g.categoria}",${g.semana},${g.valor}\n`;
    });

    // Ganhos
    csv += '\nGANHOS\n';
    csv += 'ID,Data,Descrição,Categoria,Valor\n';
    (dados.ganhos || []).forEach(g => {
      csv += `${g.id},${g.data},"${g.descricao}","${g.categoria}",${g.valor}\n`;
    });

    // Dívidas
    csv += '\nDÍVIDAS\n';
    csv += 'ID,Nome,Saldo Atual,Juros Mensal (%),Parcela Mínima\n';
    (dados.dividas || []).forEach(d => {
      csv += `${d.id},"${d.nome}",${d.saldoAtual},${d.jurosMensal},${d.parcelaMinima || 0}\n`;
    });

    // Investimentos
    csv += '\nINVESTIMENTOS\n';
    csv += 'ID,Nome,Saldo Inicial,Aporte Mensal,Rentabilidade Mensal (%)\n';
    (dados.investimentos || []).forEach(i => {
      csv += `${i.id},"${i.nome}",${i.saldoInicial},${i.aporteMensal},${i.rentabilidadeMensal}\n`;
    });

    // Reservas
    csv += '\nRESERVAS\n';
    csv += 'ID,Mês Referência,Valor Guardado\n';
    (dados.reservas || []).forEach(r => {
      csv += `${r.id},${r.mesReferencia},${r.valorGuardado}\n`;
    });

    baixarArquivo(csv, `smartcash_relatorio_${getCurrentMonth()}.csv`, 'text/csv;charset=utf-8');
    showToast('Relatório CSV exportado! 📊');
  } catch (err) {
    showToast('Erro ao exportar CSV.', 'error');
  }
}

// ── Backup Completo ────────────────────────────────────────

/**
 * Exporta backup completo com metadados.
 */
async function exportarBackup() {
  try {
    const dados = await dbExportAll();
    const backup = JSON.stringify({
      app:     'SmartCash',
      versao:  '1.0.0',
      geradoEm: new Date().toISOString(),
      dados
    }, null, 2);

    const hoje = new Date().toISOString().split('T')[0];
    baixarArquivo(backup, `smartcash_backup_${hoje}.json`, 'application/json');
    showToast('Backup exportado com sucesso! 💾');
  } catch (err) {
    showToast('Erro ao exportar backup.', 'error');
  }
}

/**
 * Importa backup JSON e substitui todos os dados.
 * @param {Event} event
 */
function importarBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = async e => {
    try {
      const conteudo = JSON.parse(e.target.result);

      // Suporta backup com wrapper (app/versao/dados) ou export direto
      const dados = conteudo.dados || conteudo;

      // Validação mínima: precisa ter pelo menos uma das stores
      const temDados = ['contas', 'gastos', 'ganhos', 'dividas', 'reservas', 'investimentos', 'configuracoes']
        .some(store => Array.isArray(dados[store]));

      if (!temDados) {
        showToast('Arquivo inválido. Use um backup exportado pelo SmartCash.', 'error');
        return;
      }

      showConfirm(
        'Importar backup substituirá TODOS os dados atuais. Deseja continuar?',
        async () => {
          try {
            await dbImportAll(dados);
            await loadConfig();
            applyTheme(AppState.config.tema);
            await renderConfiguracoes();
            showToast('Backup importado com sucesso! ✅');
          } catch (err) {
            console.error('[Config] Erro ao importar:', err);
            showToast('Erro ao importar backup.', 'error');
          }
        }
      );

    } catch (_) {
      showToast('Arquivo corrompido ou formato inválido.', 'error');
    }
  };

  reader.onerror = () => showToast('Erro ao ler o arquivo.', 'error');
  reader.readAsText(file);

  // Reseta o input para permitir re-importar o mesmo arquivo
  event.target.value = '';
}

// ============================================================
// UTILIDADE — DOWNLOAD
// ============================================================

/**
 * Cria um link temporário e dispara o download de um arquivo.
 * @param {string} conteudo   Texto do arquivo
 * @param {string} nomeArquivo
 * @param {string} tipo       MIME type
 */
function baixarArquivo(conteudo, nomeArquivo, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href     = url;
  link.download = nomeArquivo;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Libera memória após o download
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============================================================
// UTILIDADES LOCAIS
// ============================================================

function setValCfg(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}
