/* Mapa de referência territorial - Programa Mais Cultura (Hortolândia)
   Este arquivo só desenha o mapa. Os dados e os filtros vêm do app.js
   (window.MaisCulturaMap.render). */
(() => {
  const centerHortolandia = [-22.8582, -47.2200];
  let mainMap;
  let previewMap;
  let boundaryLayer;
  let markersLayer;
  let ruasIndisponiveis = false;
  // Cada mapa precisa das SUAS camadas: uma camada do Leaflet não pode estar em dois mapas.
  const camadasPorMapa = new Map();

  /* ---- Mapa de ruas ----
     O tile.openstreetmap.org só atende páginas servidas por http(s), que enviam o
     cabeçalho Referer. Abrir o index.html direto do disco (file://) é bloqueado com
     erro 403 "Access blocked". Além disso, a política do OSM não serve de base para
     um produto de cliente. Para produção, cole abaixo uma chave do CARTO Basemaps
     (https://carto.com/basemaps — gratuita até 1 milhão de requisições/mês em uso
     comercial). Com a chave preenchida, o mapa de ruas passa a usar o CARTO. */
  const CARTO_KEY = "";
  let ajustarPendente = false;
  let renderPendente = null;
  const markersPorChave = new Map();

  const coordsEscolas = {
    "ANTONIO ZANLUCHI PROFESSOR": { lat: -22.8450, lng: -47.2030 },
    "CONCEICAO APARECIDA TERZA GOMES CARDINALES PROFESSORA": { lat: -22.9050, lng: -47.2350 },
    "CRISTIANE CHAVES MOREIRA BRAGA PROFESSORA": { lat: -22.8590, lng: -47.2150 },
    "ELISEO MARSON PROFESSOR": { lat: -22.9080, lng: -47.2320 },
    "EUZEBIO ANTONIO RODRIGUES PROFESSOR": { lat: -22.9120, lng: -47.2280 },
    "GUIDO ROSOLEN": { lat: -22.8650, lng: -47.1950 },
    "HEDY MADALENA BOCCHI PROFESSORA": { lat: -22.8550, lng: -47.2100 },
    "HONORINO FABBRI DOUTOR": { lat: -22.8480, lng: -47.1900 },
    "JARDIM ALINE": { lat: -22.8400, lng: -47.1850 },
    "JARDIM SANTA CLARA DO LAGO": { lat: -22.8620, lng: -47.2220 },
    "JONATAS DAVI VISEL DOS SANTOS": { lat: -22.8700, lng: -47.2300 },
    "JOSE CLARET DIONISIO PROFESSOR": { lat: -22.8680, lng: -47.2180 },
    "LIOMAR FREITAS CAMARA PROFESSORA": { lat: -22.8520, lng: -47.2050 },
    "MANOEL IGNACIO DA SILVA": { lat: -22.8580, lng: -47.2200 },
    "MARIA ANTONIETTA GARNERO LA FORTEZZA PROFESSORA": { lat: -22.8350, lng: -47.2100 },
    "MARIA CRISTINA DE SOUZA LOBO PROFESSORA": { lat: -22.8420, lng: -47.1980 },
    "MARIA RITA ARAUJO COSTA PROFESSORA": { lat: -22.8320, lng: -47.2120 },
    "MARISTELA CAROLINA MELLIN": { lat: -22.8300, lng: -47.2250 },
    "PAULINA ROSA PROFESSORA": { lat: -22.8650, lng: -47.2150 },
    "PAULO CAMILO DE CAMARGO": { lat: -22.8950, lng: -47.2400 },
    "PRISCILA FERNANDES DA ROCHA": { lat: -22.9100, lng: -47.2300 },
    "RAQUEL SAES MELHADO DA SILVA PROFESSORA": { lat: -22.8480, lng: -47.2250 },
    "RECREIO ALVORADA": { lat: -22.8250, lng: -47.2350 },
    "ROBERTO RODRIGUES DE AZEVEDO PASTOR": { lat: -22.8750, lng: -47.2050 },
    "YASUO SASAKI": { lat: -22.8850, lng: -47.2450 },
    "ETEC - ESCOLA TÉCNICA ESTADUAL DE HORTOLÂNDIA": { lat: -22.8560, lng: -47.2180 },
    "IF-HTO INSTITUTO FEDERAL DE HORTOLÂNDIA": { lat: -22.8340, lng: -47.2100 }
  };

  // Chave tolerante a maiúsculas, acentos e espaços duplicados
  function chave(nome) {
    return String(nome == null ? "" : nome)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ").trim().toUpperCase();
  }

  const coordsNormalizadas = new Map(
    Object.keys(coordsEscolas).map(nome => [chave(nome), coordsEscolas[nome]])
  );

  function coordenadasDe(nome) {
    return coordsEscolas[nome] || coordsNormalizadas.get(chave(nome)) || null;
  }

  function esc(valor) {
    return String(valor == null ? "" : valor)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function mapaVisivel() {
    const secao = document.getElementById("view-mapa");
    return !!secao && !secao.classList.contains("hidden");
  }

  function configRuas() {
    if (CARTO_KEY) {
      return {
        url: `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${encodeURIComponent(CARTO_KEY)}`,
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
      };
    }
    return {
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: "&copy; OpenStreetMap contributors"
    };
  }

  // Cria um par de camadas novo (imagem aérea + ruas) para UM mapa.
  function criarCamadas() {
    const aerea = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "Tiles © Esri" }
    );
    const cfg = configRuas();
    const ruas = L.tileLayer(cfg.url, { maxZoom: 19, attribution: cfg.attribution });

    // Se o provedor recusar os tiles (ex.: erro 403) antes de carregar qualquer um,
    // volta para a imagem aérea em vez de deixar a tela cheia de erro.
    let carregouAlgum = false;
    let falhas = 0;
    ruas.on("tileload", () => { carregouAlgum = true; });
    ruas.on("tileerror", () => {
      falhas++;
      if (!carregouAlgum && falhas >= 4) desligarRuas();
    });
    return { aerea, ruas };
  }

  function definirBase(usarRuas) {
    camadasPorMapa.forEach((camadas, map) => {
      const sai = usarRuas ? camadas.aerea : camadas.ruas;
      const entra = usarRuas ? camadas.ruas : camadas.aerea;
      if (map.hasLayer(sai)) map.removeLayer(sai);
      if (!map.hasLayer(entra)) entra.addTo(map);
    });
    if (boundaryLayer && mainMap && mainMap.hasLayer(boundaryLayer)) {
      boundaryLayer.bringToFront();
    }
  }

  function desligarRuas() {
    if (ruasIndisponiveis) return;
    ruasIndisponiveis = true;
    definirBase(false);
    const toggle = document.getElementById("streets-toggle");
    if (toggle) {
      toggle.checked = false;
      toggle.disabled = true;
      const rotulo = toggle.parentElement && toggle.parentElement.querySelector("span");
      if (rotulo) rotulo.textContent = "Mapa de ruas indisponível";
    }
    console.warn("Mapa de ruas recusado pelo provedor de tiles. Voltando para a imagem aérea.");
  }

  function initMap(elementId, zoom, interactive) {
    const map = L.map(elementId, {
      center: centerHortolandia,
      zoom,
      zoomControl: true,
      scrollWheelZoom: interactive,
      dragging: interactive,
      doubleClickZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
      tap: interactive
    });
    const camadas = criarCamadas();
    camadasPorMapa.set(map, camadas);
    camadas.aerea.addTo(map);
    return map;
  }

  function loadMunicipalBoundary(map) {
    fetch('data/hortolandia-limites.json')
      .then(response => {
        if (!response.ok) throw new Error('Limites não encontrados');
        return response.json();
      })
      .then(geojson => {
        const boundaryStyle = {
          color: '#00CED1',
          weight: 2.5,
          opacity: 0.9,
          fillColor: '#00CED1',
          fillOpacity: 0.12
        };
        boundaryLayer = L.geoJSON(geojson, { style: boundaryStyle }).addTo(map);
        if (mapaVisivel()) ajustar();
      })
      .catch(() => {
        console.info('Aviso: GeoJSON de limites não carregado.');
      });
  }

  // Enquadra os pontos filtrados; sem filtro, enquadra o limite do município.
  function ajustar() {
    if (!mainMap) return;
    if (ajustarPendente && markersLayer && markersLayer.getLayers().length) {
      mainMap.fitBounds(markersLayer.getBounds(), { padding: [40, 40], maxZoom: 16 });
    } else if (boundaryLayer) {
      mainMap.fitBounds(boundaryLayer.getBounds(), { padding: [20, 20] });
    }
  }

  function montarIcone(temAtividade) {
    const emoji = temAtividade ? '🎨' : '⏳';
    const badgeColor = temAtividade ? '#00FA9A' : '#FFD700';
    return L.divIcon({
      className: 'custom-pin',
      html: `<div style="
          background: #111;
          border: 2px solid ${badgeColor};
          border-radius: 50%;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.5);
        ">${emoji}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
  }

  function montarPopup(item) {
    const escola = item.escola;
    const statusText = item.temAtividade ? 'Com Atividades' : 'Aguardando / Em planejamento';
    const badgeColor = item.temAtividade ? '#00FA9A' : '#FFD700';
    const projetos = (item.projetos || []).map(p => {
      const anos = p.anos && p.anos.length ? ` (${esc(p.anos.join(', '))})` : '';
      return `<div style="font-size:12px; margin-top:2px;">• ${esc(p.nome)}${anos}</div>`;
    }).join('');

    return `
        <div style="font-family: sans-serif; color: #222;">
          <strong style="font-size: 14px;">${esc(escola.escola)}</strong><br>
          <small style="color: #666;">RP ${esc(escola.rp)} · ${esc(escola.bairro)}</small><br>
          <span style="display:inline-block; margin-top:5px; padding:2px 6px; background:${badgeColor}; color:#111; border-radius:4px; font-weight:bold; font-size:11px;">
            ${statusText}
          </span>
          ${escola.ideb ? `<br><small>IDEB: ${esc(escola.ideb)}</small>` : ''}
          ${projetos ? `<div style="margin-top:6px;">${projetos}</div>` : ''}
        </div>
      `;
  }

  function atualizarStatus(noMapa, semCoord) {
    const el = document.getElementById("map-status-text");
    if (!el) return;
    const base = noMapa === 1 ? "1 escola no mapa" : `${noMapa} escolas no mapa`;
    el.textContent = semCoord ? `${base} · ${semCoord} sem coordenada` : base;
  }

  // Desenha os pontos recebidos do app.js (já filtrados)
  function render(itens, opcoes) {
    if (!mainMap || !markersLayer) {
      renderPendente = { itens, opcoes };
      return;
    }
    markersLayer.clearLayers();
    markersPorChave.clear();
    let semCoord = 0;

    itens.forEach(item => {
      const coords = coordenadasDe(item.escola.escola);
      if (!coords) { semCoord++; return; }
      const marker = L.marker([coords.lat, coords.lng], {
        icon: montarIcone(item.temAtividade),
        title: item.escola.escola
      });
      marker.bindPopup(montarPopup(item));
      markersLayer.addLayer(marker);
      markersPorChave.set(chave(item.escola.escola), marker);
    });

    atualizarStatus(markersPorChave.size, semCoord);
    ajustarPendente = !!(opcoes && opcoes.filtrado);
    if (mapaVisivel()) ajustar();
  }

  window.MaisCulturaMap = {
    // Chamado pelo app.js ao abrir a aba do mapa (ele nasce em seção oculta)
    invalidate() {
      if (!mainMap) return;
      mainMap.invalidateSize();
      ajustar();
    },
    render,
    temCoordenada(nome) {
      return !!coordenadasDe(nome);
    },
    focar(nome) {
      if (!mainMap) return;
      const marker = markersPorChave.get(chave(nome));
      mainMap.invalidateSize();
      if (!marker) return;
      mainMap.setView(marker.getLatLng(), 17);
      marker.openPopup();
    }
  };

  function init() {
    if (typeof L === "undefined") return;

    const previewEl = document.getElementById("preview-map");
    if (previewEl) {
      previewMap = initMap("preview-map", 12, false);
      previewMap.zoomControl.remove();
      previewMap.attributionControl.setPrefix("");
    }

    const mainEl = document.getElementById("main-map");
    if (mainEl) {
      mainMap = initMap("main-map", 13, true);
      mainMap.attributionControl.setPrefix("");
      markersLayer = L.layerGroup().addTo(mainMap);
      loadMunicipalBoundary(mainMap);
      if (renderPendente) {
        const { itens, opcoes } = renderPendente;
        renderPendente = null;
        render(itens, opcoes);
      }
    }

    const toggle = document.getElementById("streets-toggle");
    if (toggle) {
      toggle.addEventListener("change", () => definirBase(toggle.checked));
      // O navegador pode restaurar a caixa marcada após recarregar a página
      if (toggle.checked) definirBase(true);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();