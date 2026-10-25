/* Mais Cultura | Inteligência Territorial
   app.js — carga única dos dados da API + filtros e interatividade.
   O mapa (mapa.js) só desenha o que este arquivo manda. */
(() => {
  "use strict";

  const API_URL = "https://script.google.com/macros/s/AKfycbzAt2UeQkq0mQKSeWGOkFAqZ_ncXVUl-TGX07ykEjusEHiVX1J9J-L_glXxKl_Ra4vY/exec";
  const ANOS = ["2026", "2027"];
  const VIEWS_COM_FILTRO = ["mapa", "escolas", "atividades"];

  const viewNames = {
    visao: ["Visão geral", "PAINEL DE GESTÃO CULTURAL"],
    mapa: ["Mapa cultural", "EXPLORAÇÃO TERRITORIAL"],
    escolas: ["Escolas", "CADASTRO TERRITORIAL"],
    projetos: ["Projetos culturais", "CATÁLOGO CULTURAL"],
    atividades: ["Atividades", "EXECUÇÃO"],
    fontes: ["Fontes e dados", "RASTREABILIDADE"]
  };

  // Chaves usadas pela API -> nome de exibição
  const PROJETOS_CONHECIDOS = {
    hip_hop: "Hip Hop nas Escolas",
    mariazinha: "Mariazinha — A Arte Liberta Mulheres",
    joaozinho: "Joãozinho",
    antirracismo: "Socioeducativo de Cultura Antirracista",
    cidadania: "Cidadania Cultural na Arte Urbana",
    eventos: "Eventos"
  };

  // id do catálogo (projetos.json) -> chave da API
  const ID_PARA_CHAVE = {
    "hip-hop-nas-escolas": "hip_hop",
    "mariazinha": "mariazinha",
    "joaozinho": "joaozinho",
    "cultura-antirracista": "antirracismo",
    "cidadania-urbana": "cidadania"
  };

  const projectsFallback = [
    {
      id: "hip-hop-nas-escolas",
      nome: "Hip Hop nas Escolas",
      descricao: "Projeto citado no documento-base do Programa Mais Cultura. Detalhes de calendário, escolas e execução devem ser validados no cadastro oficial.",
      situacao: "Cadastro inicial"
    },
    {
      id: "mariazinha",
      nome: "Mariazinha — A Arte Liberta Mulheres",
      descricao: "Projeto citado no documento-base. Escolas participantes, programação e indicadores deverão ser vinculados a registros confirmados.",
      situacao: "Cadastro inicial"
    },
    {
      id: "joaozinho",
      nome: "Joãozinho",
      descricao: "Projeto complementar citado no documento-base. Escopo operacional e atividades devem ser confirmados antes do acompanhamento.",
      situacao: "Cadastro inicial"
    },
    {
      id: "cultura-antirracista",
      nome: "Socioeducativo de Cultura Antirracista",
      descricao: "Ação citada no documento-base. A programação e a abrangência territorial ainda precisam ser cadastradas.",
      situacao: "Cadastro inicial"
    },
    {
      id: "cidadania-urbana",
      nome: "Cidadania Cultural na Arte Urbana",
      descricao: "Ação citada no documento-base. As atividades, locais e métricas serão definidos com base em informações validadas.",
      situacao: "Cadastro inicial"
    }
  ];

  const FILTROS_VAZIOS = { busca: "", rp: "", projeto: "", ano: "", situacao: "" };

  const state = {
    escolas: [],
    visiveis: [],
    catalogo: projectsFallback,
    filtros: { ...FILTROS_VAZIOS },
    carregado: false
  };

  const $ = id => document.getElementById(id);

  /* ---------- utilidades ---------- */

  function norm(texto) {
    return String(texto == null ? "" : texto)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().trim();
  }

  function nomeProjeto(chave) {
    return PROJETOS_CONHECIDOS[chave] || String(chave).replace(/_/g, " ");
  }

  function criar(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto != null) el.textContent = texto;
    return el;
  }

  async function loadJson(path, fallback) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.warn(`Não foi possível carregar ${path}. Usando fallback.`, error);
      return fallback;
    }
  }

  /* ---------- regras de dados (um só lugar) ---------- */

  // Anos em que um projeto está ativo numa escola.
  // "*" = ativo, mas a API não informa o ano (valor true ou objeto sem 2026/2027).
  function anosAtivos(val) {
    if (!val) return [];
    if (typeof val === "object") {
      const temAnos = ANOS.some(a => a in val);
      if (temAnos) return ANOS.filter(a => val[a]);
      return Object.keys(val).length ? ["*"] : [];
    }
    return ["*"];
  }

  function ativoNoAno(val, ano) {
    const anos = anosAtivos(val);
    if (!anos.length) return false;
    if (!ano) return true;
    return anos.includes(ano);
  }

  function temAtividade(escola, projeto, ano) {
    const p = escola.projetos || {};
    const chaves = projeto ? [projeto] : Object.keys(p);
    return chaves.some(k => ativoNoAno(p[k], ano));
  }

  function resumoProjetos(escola) {
    const p = escola.projetos || {};
    return Object.keys(p)
      .map(chave => ({ chave, nome: nomeProjeto(chave), anos: anosAtivos(p[chave]) }))
      .filter(item => item.anos.length)
      .map(item => ({ chave: item.chave, nome: item.nome, anos: item.anos.filter(a => a !== "*") }));
  }

  function chavesDeProjetos() {
    const extras = new Set();
    state.escolas.forEach(e => Object.keys(e.projetos || {}).forEach(k => extras.add(k)));
    const conhecidas = Object.keys(PROJETOS_CONHECIDOS);
    return conhecidas.concat([...extras].filter(k => !conhecidas.includes(k)));
  }

  function contarRegistros(escola) {
    const p = escola.projetos || {};
    return Object.keys(p).reduce((soma, k) => soma + anosAtivos(p[k]).length, 0);
  }

  function escolaPassa(escola, f) {
    if (f.busca) {
      const alvo = norm(`${escola.escola} ${escola.bairro || ""}`);
      if (!alvo.includes(norm(f.busca))) return false;
    }
    if (f.rp && String(escola.rp) !== f.rp) return false;
    if ((f.projeto || f.ano) && !temAtividade(escola, f.projeto, f.ano)) return false;
    if (f.situacao === "com" && !temAtividade(escola)) return false;
    if (f.situacao === "aguardando" && temAtividade(escola)) return false;
    return true;
  }

  /* ---------- status da carga ---------- */

  function setStatus(tipo, mensagem) {
    const texto = $("data-status-text");
    const selo = $("data-status");
    const retry = $("retry-button");
    if (texto) texto.textContent = mensagem;
    if (selo) {
      selo.classList.toggle("is-ok", tipo === "ok");
      selo.classList.toggle("is-error", tipo === "erro");
    }
    if (retry) retry.classList.toggle("hidden", tipo !== "erro");
    const mapStatus = $("map-status-text");
    if (mapStatus) {
      const caixa = mapStatus.closest(".map-disclaimer");
      if (caixa) {
        caixa.classList.toggle("is-ok", tipo === "ok");
        caixa.classList.toggle("is-error", tipo === "erro");
      }
      if (tipo !== "ok") mapStatus.textContent = mensagem;
    }
  }

  /* ---------- navegação ---------- */

  function showView(view) {
    const validView = viewNames[view] ? view : "visao";
    document.querySelectorAll(".page-section").forEach(section => section.classList.add("hidden"));
    const target = $(`view-${validView}`);
    if (target) target.classList.remove("hidden");
    document.querySelectorAll(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === validView));
    $("page-title").textContent = viewNames[validView][0];
    $("breadcrumb").textContent = viewNames[validView][1];
    $("sidebar").classList.remove("open");
    const barra = $("filter-bar");
    if (barra) barra.classList.toggle("hidden", !VIEWS_COM_FILTRO.includes(validView));
    window.dispatchEvent(new CustomEvent("mais-cultura:view", { detail: { view: validView } }));
  }

  /* ---------- filtros ---------- */

  function syncControles() {
    $("filter-busca").value = state.filtros.busca;
    $("filter-rp").value = state.filtros.rp;
    $("filter-projeto").value = state.filtros.projeto;
    $("filter-ano").value = state.filtros.ano;
    $("filter-situacao").value = state.filtros.situacao;
  }

  function preencherSelects() {
    const rpSelect = $("filter-rp");
    const rps = [...new Set(state.escolas.map(e => e.rp).filter(v => v !== undefined && v !== null && v !== ""))]
      .map(String)
      .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
    rpSelect.innerHTML = "";
    rpSelect.appendChild(new Option("Todas as RPs", ""));
    rps.forEach(rp => rpSelect.appendChild(new Option(`RP ${rp}`, rp)));

    const projSelect = $("filter-projeto");
    projSelect.innerHTML = "";
    projSelect.appendChild(new Option("Todos os projetos", ""));
    chavesDeProjetos().forEach(chave => projSelect.appendChild(new Option(nomeProjeto(chave), chave)));
    syncControles();
  }

  function filtrarPor(parcial, irPara) {
    state.filtros = { ...state.filtros, ...parcial };
    syncControles();
    aplicarFiltros();
    if (irPara) showView(irPara);
  }

  function aplicarFiltros() {
    state.visiveis = state.escolas.filter(e => escolaPassa(e, state.filtros));
    const filtrado = Object.values(state.filtros).some(Boolean);
    $("filter-count").textContent = state.carregado
      ? `${state.visiveis.length} de ${state.escolas.length} escolas`
      : "";
    $("filter-clear").classList.toggle("hidden", !filtrado);
    renderEscolas();
    renderAtividades();
    renderProjects();
    atualizarMapa(filtrado);
  }

  /* ---------- mapa ---------- */

  function itemParaMapa(escola) {
    return { escola, temAtividade: temAtividade(escola), projetos: resumoProjetos(escola) };
  }

  function atualizarMapa(filtrado) {
    if (window.MaisCulturaMap && state.carregado) {
      window.MaisCulturaMap.render(state.visiveis.map(itemParaMapa), { filtrado });
    }
  }

  function irParaEscola(escola) {
    showView("mapa");
    window.setTimeout(() => {
      if (window.MaisCulturaMap) window.MaisCulturaMap.focar(escola.escola);
    }, 250);
  }

  /* ---------- telas ---------- */

  function renderEscolas() {
    const lista = $("escolas-list");
    const vazio = $("escolas-empty");
    const badge = $("escolas-badge");
    if (!lista) return;
    lista.innerHTML = "";

    if (badge) badge.textContent = `${state.visiveis.length} de ${state.escolas.length} registros`;
    if (vazio) {
      vazio.classList.toggle("hidden", state.visiveis.length > 0);
      const titulo = vazio.querySelector("h3");
      const texto = vazio.querySelector("p");
      if (state.carregado && state.escolas.length) {
        titulo.textContent = "Nenhuma escola com esses filtros";
        texto.textContent = "Ajuste ou limpe os filtros para ver as escolas.";
      } else if (state.carregado) {
        titulo.textContent = "Nenhuma escola retornada pela API";
        texto.textContent = "Confira a planilha e a publicação do Apps Script.";
      } else {
        titulo.textContent = "Carregando escolas…";
        texto.textContent = "Aguardando resposta da API.";
      }
    }

    const ordenadas = [...state.visiveis].sort((a, b) => String(a.escola).localeCompare(String(b.escola), "pt-BR"));
    ordenadas.forEach(escola => {
      const card = criar("article", "school-card");
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `Ver ${escola.escola} no mapa`);

      card.appendChild(criar("h4", null, escola.escola));
      const meta = [`RP ${escola.rp != null && escola.rp !== "" ? escola.rp : "—"}`, escola.bairro || "bairro não informado"];
      if (escola.ideb) meta.push(`IDEB ${escola.ideb}`);
      card.appendChild(criar("p", "school-meta", meta.join(" · ")));

      const chips = criar("div", "chips");
      const resumo = resumoProjetos(escola);
      if (resumo.length) {
        resumo.forEach(item => {
          const sufixo = item.anos.length ? ` · ${item.anos.join(", ")}` : "";
          chips.appendChild(criar("span", "chip", `${item.nome}${sufixo}`));
        });
      } else {
        chips.appendChild(criar("span", "chip chip-muted", "Aguardando / em planejamento"));
      }
      const temCoord = window.MaisCulturaMap && window.MaisCulturaMap.temCoordenada(escola.escola);
      if (window.MaisCulturaMap && !temCoord) {
        chips.appendChild(criar("span", "chip chip-warn", "Sem posição no mapa"));
      }
      card.appendChild(chips);

      const abrir = () => irParaEscola(escola);
      card.addEventListener("click", abrir);
      card.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          abrir();
        }
      });
      lista.appendChild(card);
    });
  }

  function renderAtividades() {
    const tabela = $("atividades-table");
    const badge = $("atividades-badge");
    const vazio = $("atividades-empty");
    if (!tabela) return;
    tabela.innerHTML = "";

    const totalRegistros = state.visiveis.reduce((soma, e) => soma + contarRegistros(e), 0);
    if (badge) badge.textContent = `${totalRegistros} registros escola × projeto × ano`;
    if (vazio) vazio.classList.toggle("hidden", state.carregado && state.escolas.length > 0);
    tabela.classList.toggle("hidden", !(state.carregado && state.escolas.length > 0));
    if (!state.carregado || !state.escolas.length) return;

    const thead = tabela.createTHead().insertRow();
    ["Projeto", "Escolas em 2026", "Escolas em 2027", "Escolas (total)"].forEach(t => {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = t;
      thead.appendChild(th);
    });

    const corpo = tabela.createTBody();
    chavesDeProjetos().forEach(chave => {
      const doProjeto = state.visiveis.filter(e => temAtividade(e, chave));
      const porAno = ano => state.visiveis.filter(e => anosAtivos((e.projetos || {})[chave]).includes(ano)).length;
      const linha = corpo.insertRow();

      const celNome = linha.insertCell();
      const btnNome = criar("button", "link-button", nomeProjeto(chave));
      btnNome.type = "button";
      btnNome.addEventListener("click", () => filtrarPor({ projeto: chave, ano: "" }));
      celNome.appendChild(btnNome);

      ANOS.forEach(ano => {
        const cel = linha.insertCell();
        const n = porAno(ano);
        if (n) {
          const btn = criar("button", "link-button", String(n));
          btn.type = "button";
          btn.setAttribute("aria-label", `${n} escolas em ${ano} — filtrar`);
          btn.addEventListener("click", () => filtrarPor({ projeto: chave, ano }));
          cel.appendChild(btn);
        } else {
          cel.textContent = "0";
        }
      });

      const celTotal = linha.insertCell();
      const total = doProjeto.length;
      if (total) {
        const btn = criar("button", "link-button", String(total));
        btn.type = "button";
        btn.addEventListener("click", () => filtrarPor({ projeto: chave, ano: "" }, "escolas"));
        celTotal.appendChild(btn);
      } else {
        celTotal.textContent = "0";
      }
    });
  }

  function renderProjects() {
    const container = $("project-list");
    if (!container) return;
    container.innerHTML = "";
    const badge = $("projetos-badge");
    if (badge) badge.textContent = `${state.catalogo.length} projetos no catálogo`;

    state.catalogo.forEach((project, index) => {
      const chave = project.chave || ID_PARA_CHAVE[project.id];
      const card = criar("article", "project-card");
      card.appendChild(criar("span", "project-number", `PROJETO ${String(index + 1).padStart(2, "0")}`));
      card.appendChild(criar("h3", null, project.nome || "Projeto sem nome"));
      card.appendChild(criar("p", null, project.descricao || "Descrição ainda não cadastrada."));
      card.appendChild(criar("span", "project-state", project.situacao || "Situação não informada"));

      if (chave && state.carregado) {
        const n = state.escolas.filter(e => temAtividade(e, chave)).length;
        const rodape = criar("div", "project-footer");
        rodape.appendChild(criar("span", "project-count", n === 1 ? "1 escola com atividade" : `${n} escolas com atividade`));
        if (n) {
          const btn = criar("button", "text-button", "Ver no mapa →");
          btn.type = "button";
          btn.addEventListener("click", () => filtrarPor({ projeto: chave, ano: "" }, "mapa"));
          rodape.appendChild(btn);
        }
        card.appendChild(rodape);
      }
      container.appendChild(card);
    });
  }

  function atualizarMetricas() {
    $("metric-escolas").textContent = state.escolas.length;
    $("metric-atividades").textContent = state.escolas.reduce((soma, e) => soma + contarRegistros(e), 0);
    const projetosComEscola = chavesDeProjetos().filter(k => state.escolas.some(e => temAtividade(e, k))).length;
    $("metric-projetos").textContent = projetosComEscola;
    $("metric-participacoes").textContent = "—";
  }

  /* ---------- carga ---------- */

  async function carregarDados() {
    setStatus("carregando", "Carregando dados da API…");
    try {
      const response = await fetch(API_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const dados = await response.json();
      if (dados && dados.error) throw new Error(dados.error);
      if (!Array.isArray(dados)) throw new Error("Formato inesperado da resposta");

      state.escolas = dados.filter(e => e && e.escola);
      state.carregado = true;
      preencherSelects();
      atualizarMetricas();
      aplicarFiltros();
      setStatus("ok", `${state.escolas.length} escolas · dados da API`);
      console.info("Dados carregados com sucesso!");
    } catch (error) {
      console.error("Erro ao carregar dados da API:", error);
      state.carregado = false;
      setStatus("erro", "Falha ao carregar dados");
      renderEscolas();
      renderAtividades();
    }
  }

  function init() {
    // Eventos primeiro: a navegação funciona mesmo se a API demorar ou falhar.
    document.querySelectorAll(".nav-item").forEach(button => {
      button.addEventListener("click", () => showView(button.dataset.view));
    });
    document.querySelectorAll("[data-go]").forEach(button => {
      button.addEventListener("click", () => showView(button.dataset.go));
    });
    $("mobile-menu").addEventListener("click", () => {
      $("sidebar").classList.toggle("open");
    });
    window.addEventListener("mais-cultura:view", event => {
      if (event.detail.view === "mapa" && window.MaisCulturaMap) {
        window.setTimeout(() => window.MaisCulturaMap.invalidate(), 80);
      }
    });

    $("filter-busca").addEventListener("input", event => filtrarPor({ busca: event.target.value }));
    $("filter-rp").addEventListener("change", event => filtrarPor({ rp: event.target.value }));
    $("filter-projeto").addEventListener("change", event => filtrarPor({ projeto: event.target.value }));
    $("filter-ano").addEventListener("change", event => filtrarPor({ ano: event.target.value }));
    $("filter-situacao").addEventListener("change", event => filtrarPor({ situacao: event.target.value }));
    $("filter-clear").addEventListener("click", () => filtrarPor({ ...FILTROS_VAZIOS }));
    $("retry-button").addEventListener("click", carregarDados);

    renderProjects();
    loadJson("data/projetos.json", projectsFallback).then(catalogo => {
      state.catalogo = Array.isArray(catalogo) ? catalogo : projectsFallback;
      renderProjects();
    });
    renderEscolas();
    renderAtividades();
    carregarDados();
  }

  document.addEventListener("DOMContentLoaded", init);
})();