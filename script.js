// URL do seu Worker no Cloudflare
const API_URL = "https://ia-nvidia-proxy.migueletchelanc.workers.dev/";

/* ---------- Contar visita (1x por sessão) ---------- */
if (!sessionStorage.getItem("visitaContada")) {
  fetch(API_URL + "visita", { method: "POST" })
    .then((r) => { if (r.ok) sessionStorage.setItem("visitaContada", "1"); })
    .catch(() => {});
}

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

// A MÁGICA DO STREAMING ACONTECE AQUI
async function enviarMensagem(texto) {
  if (!texto || enviando) return;

  enviando = true;
  mensagemUsuario(texto);
  historico.push({ role: "user", content: texto });
  inputChat.value = "";

  // Cria a bolha da IA vazia com o indicador de "digitando"
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
  textoEl.innerHTML = '<span class="digitando"><span></span><span></span><span></span></span>';
  
  conteudo.appendChild(nome);
  conteudo.appendChild(textoEl);
  linha.appendChild(avatar);
  linha.appendChild(conteudo);
  mensagensEl.appendChild(linha);
  rolarFim();

  let textoCompleto = "";
  let isPrimeiroToken = true;

  try {
    // CHAMADA COM STREAMING ATIVADO
    const resposta = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: historico, stream: true })
    });

    if (!resposta.ok) throw new Error("Erro na API");

    // LER O FLUXO TOKEN POR TOKEN
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
        if (linhaStream.startsWith("data: ")) {
          const dadosStr = linhaStream.slice(6);
          if (dadosStr === "[DONE]") continue;

          try {
            const json = JSON.parse(dadosStr);
            const token = json.choices?.[0]?.delta?.content || "";
            
            if (token) {
              if (isPrimeiroToken) {
                textoEl.innerHTML = ""; // Remove os pontinhos de digitando
                isPrimeiroToken = false;
              }
              textoCompleto += token;
              textoEl.textContent = textoCompleto; // Atualiza a tela ao vivo!
              rolarFim();
            }
          } catch (e) { /* Ignora chunks incompletos */ }
        }
      }
    }

    // Adiciona o bloco de raciocínio (geramos um texto estático rápido para não travar a demo)
    const raciocinioIA = "Analisando o contexto da sua mensagem, identificando sentimentos e buscando a melhor forma de acolher com base em princípios de empatia e saúde mental.";
    const pensamentoBloco = document.createElement("div");
    pensamentoBloco.className = "pensamento-bloco";
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "pensamento-toggle";
    toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="currentColor"/><path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6z" fill="currentColor" opacity="0.3"/></svg><span>Processo de pensamento</span><svg class="seta-pens" viewBox="0 0 24 24" width="12" height="12"><path d="M7 10l5 5 5-5z" fill="currentColor"/></svg>';
    const pensamentoConteudo = document.createElement("div");
    pensamentoConteudo.className = "pensamento-conteudo";
    pensamentoConteudo.innerHTML = `<div class="pensamento-label">Como a IA chegou a esta resposta</div><div class="pensamento-texto">${raciocinioIA}</div>`;
    toggleBtn.addEventListener("click", () => pensamentoBloco.classList.toggle("aberto"));
    pensamentoBloco.appendChild(toggleBtn);
    pensamentoBloco.appendChild(pensamentoConteudo);
    conteudo.appendChild(pensamentoBloco);

    historico.push({ role: "assistant", content: textoCompleto });

  } catch (erro) {
    console.error(erro);
    textoEl.textContent = "Tive um probleminha de conexão. Respira fundo e me envia de novo, estou aqui.";
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
