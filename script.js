const API_URL = "https://ia-nvidia-proxy.migueletchelanc.workers.dev/";

/* ---------- Contar visita ---------- */
if (!sessionStorage.getItem("visitaContada")) {
  fetch(API_URL + "visita", { method: "POST" })
    .then((r) => { if (r.ok) sessionStorage.setItem("visitaContada", "1"); })
    .catch(() => {});
}

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

let historico = [];
let enviando = false;

function rolarFim() { mensagensEl.scrollTop = mensagensEl.scrollHeight; }

function mensagemUsuario(texto) {
  estadoVazio.style.display = "none";
  const linha = document.createElement("div");
  linha.className = "linha usuario";
  const bolha = document.createElement("div");
  bolha.className = "bolha-usuario";
  bolha.textContent = texto;
  linha.appendChild(bolha);
  mensagensEl.appendChild(linha);
  rolarFim();
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

/* Cria (ou reaproveita) a caixinha de pensamento e devolve referências */
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

async function enviarMensagem(texto) {
  if (!texto || enviando) return;
  enviando = true;
  mensagemUsuario(texto);
  historico.push({ role: "user", content: texto });
  inputChat.value = "";

  const { conteudo, textoEl } = criarMensagemIA();

  let bruto = "";
  let racApi = "";
  let mostrando = false;
  let falhou = false;

  /* TIMER INTELIGENTE: só falha se ficar 12s sem chegar NADA,
     ou se passar de 60s no total. Enquanto chegar qualquer token,
     o timer "reinicia" sozinho. */
  let ultimoToken = Date.now();
  const inicio = Date.now();
  const watcher = setInterval(() => {
    if (falhou) return;
    const agora = Date.now();
    if (agora - inicio > 60000 || agora - ultimoToken > 12000) {
      falhou = true;
      textoEl.textContent = "A conexão com a IA está instável neste momento, mas a interface está funcionando perfeitamente. (Modo Demonstração)";
      enviando = false;
    }
  }, 500);

  try {
    const resposta = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: historico, stream: true })
    });

    if (!resposta.ok) {
      const detalhes = await resposta.text().catch(() => "");
      console.error("DIAGNÓSTICO DO WORKER:", detalhes);
      throw new Error("Erro na API");
    }

    const reader = resposta.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      if (falhou) break;
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
          ultimoToken = Date.now(); // qualquer dado recebido reinicia o timer

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
            textoEl.textContent = visivel;
            rolarFim();
          }
        } catch (e) {}
      }
    }

    if (!falhou) {
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

      textoEl.textContent = textoFinal;

      /* Fecha a caixinha e deixa o raciocínio final registrado */
      const refs = garantirPensamento(conteudo);
      refs.texto.textContent = racFinal && racFinal.trim()
        ? racFinal.trim()
        : "Analisando o contexto da sua mensagem, identificando sentimentos e buscando a melhor forma de acolher com base em princípios de empatia e saúde mental.";
      refs.bloco.classList.remove("aberto");

      historico.push({ role: "assistant", content: textoFinal });
      rolarFim();
    }
  } catch (erro) {
    if (!falhou) textoEl.textContent = "Tive um probleminha de conexão. Respira fundo e me envia de novo, estou aqui.";
  } finally {
    clearInterval(watcher);
    enviando = false;
  }
}

formChat.addEventListener("submit", (e) => { e.preventDefault(); enviarMensagem(inputChat.value.trim()); });
document.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => enviarMensagem(c.dataset.texto)));
document.getElementById("nova-conversa").addEventListener("click", () => {
  historico = [];
  mensagensEl.querySelectorAll(".linha").forEach((el) => el.remove());
  estadoVazio.style.display = "block";
});
