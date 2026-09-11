const API_URL = "https://ia-nvidia-proxy.migueletchelanc.workers.dev/";
const STORAGE_KEY = "chat_historico_v1";
const MAX_HISTORY = 40; // limita o contexto enviado à API

/* ---------- Contar visita ---------- */
if (!sessionStorage.getItem("visitaContada")) {
  fetch(API_URL + "visita", { method: "POST" })
    .then((r) => { if (r.ok) sessionStorage.setItem("visitaContada", "1"); })
    .catch(() => {});
}

/* ---------- Utilitários ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

function escaparHTML(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function horaAgora() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/* ---------- Markdown-lite (seguro: escapa HTML primeiro) ---------- */
function renderMarkdown(src) {
  let html = escaparHTML(src);

  // Blocos de código ```lang ... ``` com botão de copiar
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<div class="code-bloco"><div class="code-topo"><span>${lang || "code"}</span>` +
      `<button class="btn-copiar-codigo" type="button">Copiar</button></div>` +
      `<pre><code>${code.replace(/\n$/, "")}</code></pre></div>`;
  });

  // Código inline
  html = html.replace(/`([^`\n]+)`/g, "<code class=\"code-inline\">$1</code>");
  // Negrito / itálico / tachado
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  html = html.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  // Títulos
  html = html.replace(/^### (.+)$/gm, "<h4>$1</h4>").replace(/^## (.+)$/gm, "<h3>$1</h3>").replace(/^# (.+)$/gm, "<h2>$1</h2>");
  // Listas
  html = html.replace(/(?:^|\n)((?:\s*[-*•] .+(?:\n|$))+)/g, (m, bloco) => {
    const itens = bloco.trim().split("\n").map((l) => `<li>${l.replace(/^\s*[-*•]\s+/, "")}</li>`).join("");
    return `\n<ul>${itens}</ul>`;
  });
  html = html.replace(/(?:^|\n)((?:\s*\d+[\.\)] .+(?:\n|$))+)/g, (m, bloco) => {
    const itens = bloco.trim().split("\n").map((l) => `<li>${l.replace(/^\s*\d+[\.\)]\s+/, "")}</li>`).join("");
    return `\n<ol>${itens}</ol>`;
  });
  // Citações
  html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
  // Links
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Parágrafos
  html = html.split(/\n{2,}/).map((p) => (/^\s*<(h\d|ul|ol|div|blockquote|pre)/.test(p) ? p : `<p>${p.replace(/\n/g, "<br>")}</p>`)).join("");
  return html;
}

/* ---------- Copiar para a área de transferência ---------- */
async function copiarTexto(texto, btn) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = texto; document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); ta.remove();
  }
  if (btn) {
    const original = btn.textContent;
    btn.textContent = "Copiado!";
    btn.classList.add("copiado");
    setTimeout(() => { btn.textContent = original; btn.classList.remove("copiado"); }, 1500);
  }
}

/* Delegação: botões "copiar" dentro de blocos de código */
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-copiar-codigo");
  if (btn) copiarTexto(btn.closest(".code-bloco").querySelector("code").textContent, btn);
});

/* ---------- Abas ---------- */
function trocarAba(nome) {
  document.querySelectorAll(".nav-link").forEach((l) => l.classList.toggle("ativa", l.dataset.aba === nome));
  document.querySelectorAll(".aba-conteudo").forEach((s) => s.classList.remove("ativa"));
  document.getElementById("aba-" + nome).classList.add("ativa");
  if (nome === "artigo") window.scrollTo({ top: 0 });
  else document.getElementById("input-chat").focus({ preventScroll: true });
}
document.querySelectorAll("[data-aba]").forEach((el) => el.addEventListener("click", () => trocarAba(el.dataset.aba)));
document.querySelectorAll("[data-rolar]").forEach((b) => b.addEventListener("click", () => {
  const alvo = document.getElementById(b.dataset.rolar);
  if (alvo) alvo.scrollIntoView({ behavior: "smooth" });
}));

/* ---------- Chat ---------- */
const mensagensEl = document.getElementById("mensagens");
const estadoVazio = document.getElementById("estado-vazio");
const formChat = document.getElementById("form-chat");
const inputChat = document.getElementById("input-chat");
const btnEnviar = formChat.querySelector('[type="submit"], button:not([type])');

let historico = [];
let enviando = false;
let abortController = null;
let ultimaPergunta = "";

/* Restaura conversa salva */
try {
  const salvo = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  if (Array.isArray(salvo) && salvo.length) historico = salvo;
} catch {}

function salvarHistorico() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(historico.slice(-MAX_HISTORY))); } catch {}
}

/* Rolagem inteligente: só cola no fim se o usuário já estiver perto do fim */
function pertoDoFim() {
  return mensagensEl.scrollHeight - mensagensEl.scrollTop - mensagensEl.clientHeight < 120;
}
function rolarFim(forcar = false) {
  if (forcar || pertoDoFim()) mensagensEl.scrollTop = mensagensEl.scrollHeight;
}

/* ---------- Textarea auto-expansível + Enter envia ---------- */
function autoResize() {
  inputChat.style.height = "auto";
  inputChat.style.height = Math.min(inputChat.scrollHeight, 180) + "px";
}
inputChat.addEventListener("input", autoResize);
inputChat.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    formChat.requestSubmit();
  }
});

/* ---------- Botão Enviar <-> Parar ---------- */
function modoParar(ativo) {
  if (!btnEnviar) return;
  if (ativo) {
    btnEnviar.dataset.labelOriginal = btnEnviar.innerHTML;
    btnEnviar.innerHTML = "&#9632;"; // quadrado = stop
    btnEnviar.classList.add("parar");
    btnEnviar.type = "button";
    btnEnviar.onclick = () => abortController?.abort();
  } else {
    btnEnviar.innerHTML = btnEnviar.dataset.labelOriginal || "Enviar";
    btnEnviar.classList.remove("parar");
    btnEnviar.type = "submit";
    btnEnviar.onclick = null;
  }
}

/* ---------- Ações de mensagem (copiar / regenerar) ---------- */
function barraAcoes(textoPlano, { regenerar = false } = {}) {
  const barra = document.createElement("div");
  barra.className = "msg-acoes";

  const btnCopiar = document.createElement("button");
  btnCopiar.type = "button";
  btnCopiar.className = "msg-acao";
  btnCopiar.title = "Copiar";
  btnCopiar.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>';
  btnCopiar.addEventListener("click", () => copiarTexto(textoPlano, btnCopiar));
  barra.appendChild(btnCopiar);

  if (regenerar) {
    const btnRegen = document.createElement("button");
    btnRegen.type = "button";
    btnRegen.className = "msg-acao";
    btnRegen.title = "Regenerar resposta";
    btnRegen.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M17.65 6.35A8 8 0 1 0 19.73 14h-2.08a6 6 0 1 1-1.41-6.24L13 11h7V4l-2.35 2.35z"/></svg>';
    btnRegen.addEventListener("click", () => {
      if (enviando || !ultimaPergunta) return;
      // Remove a última resposta do histórico e da tela, depois reenvia
      if (historico.at(-1)?.role === "assistant") historico.pop();
      const linhas = $$(".linha.ia", mensagensEl);
      linhas.at(-1)?.remove();
      salvarHistorico();
      enviarMensagem(ultimaPergunta, { silencioso: true });
    });
    barra.appendChild(btnRegen);
  }

  const hora = document.createElement("span");
  hora.className = "msg-hora";
  hora.textContent = horaAgora();
  barra.appendChild(hora);
  return barra;
}

function mensagemUsuario(texto) {
  estadoVazio.style.display = "none";
  const linha = document.createElement("div");
  linha.className = "linha usuario";
  const bolha = document.createElement("div");
  bolha.className = "bolha-usuario";
  bolha.textContent = texto;
  linha.appendChild(bolha);
  linha.appendChild(barraAcoes(texto));
  mensagensEl.appendChild(linha);
  rolarFim(true);
}

/* ===== FILTROS DE PENSAMENTO ===== */
const REG_COG = /^\s*(Here'?s a thinking process|Thinking process|Processo de pensamento|Let me think|Thinking)[:\s]/i;

function textoVisivel(bruto) {
  let t = bruto.replace(/<think>[\s\S]*?(<\/think>|$)/g, "");
  if (REG_COG.test(t)) return "";
  return t.trimStart();
}
function extrairThink(bruto) {
  const m = bruto.match(/<think>([\s\S]*?)(<\/think>|$)/);
  return m ? m[1].trim() : "";
}
function resgatarResposta(bruto) {
  const blocos = bruto.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  for (let i = blocos.length - 1; i >= 0; i--) {
    const b = blocos[i];
    if (
      b.length >= 40 &&
      !/^\d+[\.\)]/.test(b) && !/^[-*•]/.test(b) &&
      !/^(Thinking|Here'?s|Step \d|Analysis|Identify|Formulate|Avoid|Must|Maybe|No need|Refinement)/i.test(b)
    ) {
      return { texto: b, raciocinio: blocos.slice(0, i).join("\n\n") };
    }
  }
  return null;
}

function criarMensagemIA() {
  const linha = document.createElement("div");
  linha.className = "linha ia";
  const avatar = document.createElement("span"); avatar.className = "avatar-mini";
  const conteudo = document.createElement("div"); conteudo.className = "conteudo-ia";
  const nome = document.createElement("span"); nome.className = "nome-ia"; nome.textContent = "IA de Apoio";
  const textoEl = document.createElement("div"); textoEl.className = "texto-resposta";
  textoEl.innerHTML = '<span class="digitando"><span></span><span></span><span></span></span>';
  conteudo.appendChild(nome); conteudo.appendChild(textoEl);
  linha.appendChild(avatar); linha.appendChild(conteudo);
  mensagensEl.appendChild(linha);
  rolarFim();
  return { conteudo, textoEl };
}

/* Cria (ou reaproveita) a caixinha de pensamento */
function garantirPensamento(conteudo) {
  let bloco = conteudo.querySelector(".pensamento-bloco");
  if (bloco) return { bloco, texto: bloco.querySelector(".pensamento-texto") };

  bloco = document.createElement("div");
  bloco.className = "pensamento-bloco";
  const toggleBtn = document.createElement("button");
  toggleBtn.className = "pensamento-toggle";
  toggleBtn.innerHTML =
    '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="currentColor"/><path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6z" fill="currentColor" opacity="0.3"/></svg>' +
    '<span>Processo de pensamento</span>' +
    '<svg class="seta-pens" viewBox="0 0 24 24" width="12" height="12"><path d="M7 10l5 5 5-5z" fill="currentColor"/></svg>';
  const pensamentoConteudo = document.createElement("div");
  pensamentoConteudo.className = "pensamento-conteudo";
  const pensamentoLabel = document.createElement("div");
  pensamentoLabel.className = "pensamento-label";
  pensamentoLabel.textContent = "Como a IA chegou a esta resposta";
  const pensamentoTexto = document.createElement("div");
  pensamentoTexto.className = "pensamento-texto";
  pensamentoConteudo.appendChild(pensamentoLabel);
  pensamentoConteudo.appendChild(pensamentoTexto);
  toggleBtn.addEventListener("click", () => bloco.classList.toggle("aberto"));
  bloco.appendChild(toggleBtn);
  bloco.appendChild(pensamentoConteudo);
  conteudo.appendChild(bloco);
  return { bloco, texto: pensamentoTexto };
}

async function enviarMensagem(texto, { silencioso = false } = {}) {
  if (!texto || enviando) return;
  enviando = true;
  ultimaPergunta = texto;
  abortController = new AbortController();
  modoParar(true);

  if (!silencioso) {
    mensagemUsuario(texto);
    historico.push({ role: "user", content: texto });
  }
  inputChat.value = "";
  autoResize();

  const { conteudo, textoEl } = criarMensagemIA();

  let bruto = "";
  let racApi = "";
  let mostrando = false;

  try {
    const resposta = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: historico.slice(-MAX_HISTORY), stream: true }),
      signal: abortController.signal
    });

    if (!resposta.ok) {
      const detalhes = await resposta.text().catch(() => "");
      console.error("DIAGNÓSTICO DO WORKER:", detalhes);
      throw new Error("Erro na API");
    }

    /* Lê o stream pelo tempo que for preciso — SEM TIMER */
    const reader = resposta.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const linhas = buffer.split("\n");
      buffer = linhas.pop();

      for (const linhaStream of linhas) {
        if (!linhaStream.startsWith("data: ")) continue;
        const dadosStr = linhaStream.slice(6);
        if (dadosStr === "[DONE]") continue;
        try {
          const json = JSON.parse(dadosStr);
          const delta = json.choices?.[0]?.delta || {};

          if (delta.reasoning_content) racApi += delta.reasoning_content;
          if (delta.reasoning) racApi += delta.reasoning;
          if (delta.content) bruto += delta.content;

          /* Thinking ao vivo dentro da caixinha (aberta) */
          const pensando = racApi || (REG_COG.test(bruto) ? bruto : "");
          if (pensando) {
            const refs = garantirPensamento(conteudo);
            refs.bloco.classList.add("aberto");
            refs.texto.textContent = pensando;
            rolarFim();
          }

          const visivel = textoVisivel(bruto);
          if (visivel) {
            if (!mostrando) { textoEl.innerHTML = ""; mostrando = true; }
            textoEl.innerHTML = renderMarkdown(visivel) + '<span class="cursor-stream"></span>';
            rolarFim();
          }
        } catch (e) {}
      }
    }

    /* Fim do stream: monta a resposta final */
    let textoFinal = textoVisivel(bruto).trim();
    let racFinal = racApi || extrairThink(bruto);

    if (!textoFinal && REG_COG.test(bruto)) {
      const resgate = resgatarResposta(bruto);
      if (resgate) {
        textoFinal = resgate.texto;
        racFinal = (racFinal + "\n\n" + resgate.raciocinio).trim();
      } else {
        racFinal = racFinal || bruto;
      }
    }

    if (!textoFinal) {
      textoFinal = "Estou aqui com você. 💛 Respira fundo e me conta: o que está pesando mais no seu dia hoje?";
      if (!racFinal) racFinal = bruto;
    }

    textoEl.innerHTML = renderMarkdown(textoFinal);
    conteudo.appendChild(barraAcoes(textoFinal, { regenerar: true }));

    const refs = garantirPensamento(conteudo);
    refs.texto.textContent = racFinal && racFinal.trim()
      ? racFinal.trim()
      : "Analisando o contexto da sua mensagem, identificando sentimentos e buscando a melhor forma de acolher com base em princípios de empatia e saúde mental.";
    refs.bloco.classList.remove("aberto");

    historico.push({ role: "assistant", content: textoFinal });
    salvarHistorico();
    rolarFim();
  } catch (erro) {
    if (erro.name === "AbortError") {
      /* Usuário clicou em Parar: mantém o que já foi gerado */
      const parcial = textoVisivel(bruto).trim();
      textoEl.innerHTML = parcial
        ? renderMarkdown(parcial) + '<p class="interrompido"><em>⏹ Resposta interrompida.</em></p>'
        : "<em>Resposta interrompida.</em>";
      if (parcial) {
        historico.push({ role: "assistant", content: parcial });
        salvarHistorico();
      }
      conteudo.appendChild(barraAcoes(parcial || "", { regenerar: true }));
    } else {
      /* Erro real de rede/API */
      textoEl.textContent = "Tive um probleminha de conexão. Respira fundo e me envia de novo, estou aqui.";
      conteudo.appendChild(barraAcoes("", { regenerar: true }));
    }
  } finally {
    enviando = false;
    abortController = null;
    modoParar(false);
    inputChat.focus({ preventScroll: true });
  }
}

formChat.addEventListener("submit", (e) => { e.preventDefault(); enviarMensagem(inputChat.value.trim()); });
document.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => enviarMensagem(c.dataset.texto)));
document.getElementById("nova-conversa").addEventListener("click", () => {
  abortController?.abort();
  historico = [];
  ultimaPergunta = "";
  localStorage.removeItem(STORAGE_KEY);
  mensagensEl.querySelectorAll(".linha").forEach((el) => el.remove());
  estadoVazio.style.display = "block";
});

/* ---------- Reidrata conversa salva ao carregar ---------- */
(function reidratar() {
  if (!historico.length) return;
  estadoVazio.style.display = "none";
  for (const msg of historico) {
    if (msg.role === "user") {
      mensagemUsuario(msg.content);
    } else if (msg.role === "assistant") {
      const { conteudo, textoEl } = criarMensagemIA();
      textoEl.innerHTML = renderMarkdown(msg.content);
      conteudo.appendChild(barraAcoes(msg.content, { regenerar: false }));
    }
  }
  rolarFim(true);
})();
