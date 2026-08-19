// Mantenha a URL do seu Worker aqui
const API_URL = "https://ia-nvidia-proxy.migueletchelanc.workers.dev/";

/* ---------- Troca de abas ---------- */
function trocarAba(nome) {
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("ativa", link.dataset.aba === nome);
  });

  document.querySelectorAll(".aba-conteudo").forEach((secao) => {
    secao.classList.remove("ativa");
  });

  document.getElementById("aba-" + nome).classList.add("ativa");

  if (nome === "artigo") {
    window.scrollTo({ top: 0 });
  } else {
    document.getElementById("input-chat").focus({ preventScroll: true });
  }
}

document.querySelectorAll("[data-aba]").forEach((el) => {
  el.addEventListener("click", () => trocarAba(el.dataset.aba));
});

/* ---------- Botão "Ler o artigo" ---------- */
document.querySelectorAll("[data-rolar]").forEach((botao) => {
  botao.addEventListener("click", () => {
    const alvo = document.getElementById(botao.dataset.rolar);
    if (alvo) alvo.scrollIntoView({ behavior: "smooth" });
  });
});

/* ---------- Chat ---------- */
const mensagensEl = document.getElementById("mensagens");
const estadoVazio = document.getElementById("estado-vazio");
const formChat = document.getElementById("form-chat");
const inputChat = document.getElementById("input-chat");

let historico = [];
let enviando = false;

function rolarFim() {
  mensagensEl.scrollTop = mensagensEl.scrollHeight;
}

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

function mensagemIA(texto, raciocinio) {
  const linha = document.createElement("div");
  linha.className = "linha ia";

  const avatar = document.createElement("span");
  avatar.className = "avatar-mini";

  const conteudo = document.createElement("div");
  conteudo.className = "conteudo-ia";

  const nome = document.createElement("span");
  nome.className = "nome-ia";
  nome.textContent = "IA de Apoio";

  const textoEl = document.createElement("div");
  textoEl.className = "texto-resposta";
  textoEl.textContent = texto;

  // Bloco de pensamento
  const pensamentoBloco = document.createElement("div");
  pensamentoBloco.className = "pensamento-bloco";

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
  pensamentoTexto.textContent = raciocinio || "(Processo não disponível.)";

  pensamentoConteudo.appendChild(pensamentoLabel);
  pensamentoConteudo.appendChild(pensamentoTexto);

  toggleBtn.addEventListener("click", () => {
    pensamentoBloco.classList.toggle("aberto");
  });

  pensamentoBloco.appendChild(toggleBtn);
  pensamentoBloco.appendChild(pensamentoConteudo);

  conteudo.appendChild(nome);
  conteudo.appendChild(textoEl);
  conteudo.appendChild(pensamentoBloco);

  linha.appendChild(avatar);
  linha.appendChild(conteudo);
  mensagensEl.appendChild(linha);
  rolarFim();
}

function indicadorDigitando() {
  const linha = document.createElement("div");
  linha.className = "linha ia";

  linha.innerHTML =
    '<span class="avatar-mini"></span>' +
    '<div class="conteudo-ia">' +
    '<span class="nome-ia">IA de Apoio</span>' +
    '<span class="digitando"><span></span><span></span><span></span></span>' +
    "</div>";

  mensagensEl.appendChild(linha);
  rolarFim();
  return linha;
}

async function enviarMensagem(texto) {
  if (!texto || enviando) return;

  enviando = true;
  mensagemUsuario(texto);
  historico.push({ role: "user", content: texto });
  inputChat.value = "";

  const indicador = indicadorDigitando();

  try {
    const resposta = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: historico })
    });

    const dados = await resposta.json();
    indicador.remove();

    if (!resposta.ok) throw new Error("erro");

    const textoIA =
      dados.texto ||
      "Desculpe, não consegui responder agora, mas estou aqui com você.";
    const raciocinioIA =
      dados.raciocinio || "(Processo de pensamento não disponível.)";

    historico.push({ role: "assistant", content: textoIA });
    mensagemIA(textoIA, raciocinioIA);
  } catch (erro) {
    indicador.remove();
    mensagemIA(
      "Tive um probleminha de conexão. Respira fundo e me envia de novo, estou aqui.",
      ""
    );
  } finally {
    enviando = false;
  }
}

formChat.addEventListener("submit", (evento) => {
  evento.preventDefault();
  enviarMensagem(inputChat.value.trim());
});

/* Sugestões iniciais */
document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => enviarMensagem(chip.dataset.texto));
});

/* Nova conversa */
document.getElementById("nova-conversa").addEventListener("click", () => {
  historico = [];
  mensagensEl.querySelectorAll(".linha").forEach((el) => el.remove());
  estadoVazio.style.display = "block";
});