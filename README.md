# 🌎 GeoAventura — Volta ao Mundo

Jogo de tabuleiro interativo de **Geografia** para **2 a 4 jogadores** no mesmo dispositivo (computador, tablet, celular ou TV).
Os viajantes partem do Brasil e cruzam Américas, Europa, África, Ásia e Oceania até os Polos, num percurso de 49 casas.
No caminho, respondem perguntas, decifram enigmas e encaram atividades. Cada **acerto** rende pontos e uma carta de **bônus**, e cada **erro** puxa uma carta de **ônus**.

## Como se joga

- Role o dado, ande e resolva o desafio da casa.
- Vence quem chegar à casa 49 **e acertar o Desafio Final**. Se errar, volta 3 casas.

| Casa | O que acontece |
|---|---|
| ❓ Conhecimento | Múltipla escolha. Vale mais quando a pergunta é mais difícil e a resposta vem mais rápido. |
| 🔍 Enigma | "Quem sou eu?" com até 3 pistas. Quanto menos pistas usar, mais pontos ganha (300/200/100). |
| 🎯 Atividade | Ordenar itens, Verdadeiro ou Falso relâmpago (5 afirmações) ou Bandeiras do mundo. |
| 🃏 Sorte ou Revés | Carta surpresa com tema de viagem. |
| ⚔️ Duelo | Escolha um rival. Se acertar, rouba até 150 pontos dele e ele recua. Se errar, ele ganha 100 pontos e avança. |
| ✈️ Atalho | Acertou? Voa adiante pela seta verde (Voo Transatlântico, Canal de Suez, Transiberiana). |
| 🌪️ Perigo | Errou? Volta pela seta vermelha (Triângulo das Bermudas, Tempestade no Saara, Ciclone). |
| 🏆 Desafio Final | Pergunta difícil que vale a vitória e mais 500 pontos. |

**Bônus:** avançar casas, jogar de novo, ganhar pontos e itens.
**Ônus:** voltar casas, perder a vez, perder pontos ou itens.

**Itens** (até 3 de cada):
- 🧭 **Bússola:** elimina 2 alternativas erradas. Todo viajante começa com 1.
- 🛡️ **Escudo:** bloqueia o próximo ônus.
- 🚀 **Turbo:** faz o jogador rolar 2 dados na jogada.

**Teclado:** `Espaço` rola o dado, `A`–`D` ou `1`–`4` respondem, `V`/`F` servem no relâmpago e `T` ativa o Turbo.
A partida é salva automaticamente no navegador.

**Conteúdo:** 158 perguntas (com curiosidade explicativa), 26 enigmas, 50 afirmações de V ou F, 17 desafios de ordenação e 56 bandeiras.
As perguntas são separadas por região e dificuldade, e o nível da partida pode ser Misto, Fácil ou Desafiador.

## Rodar localmente

O jogo é um site estático (HTML, CSS e JavaScript puros, sem build e sem dependências).

```bash
python -m http.server 8000 --directory public
# abra http://localhost:8000
```

Também funciona abrindo `public/index.html` direto no navegador.

## Testes

```bash
python tests/validar_dados.py          # valida o banco de perguntas
python -m http.server 8123             # na raiz do projeto
# abra http://localhost:8123/tests/testes.html
```

`testes.html` roda os testes unitários do motor de regras e, em seguida, **joga uma partida completa de 4 jogadores pela interface**, clicando nos botões. O teste falha se aparecer qualquer erro de JavaScript.

## Estrutura

```
public/            ← tudo o que é publicado
  index.html
  css/style.css
  js/data.js       ← banco de perguntas (JSON; a 1ª alternativa é sempre a correta)
  js/engine.js     ← regras puras (sem DOM)
  js/audio.js      ← efeitos sonoros sintetizados (Web Audio)
  js/app.js        ← interface e fluxo de turnos
tests/             ← validador de dados + testes no navegador
render.yaml        ← deploy no Render
vercel.json        ← deploy na Vercel
```

Para **adicionar perguntas**, edite `public/js/data.js` seguindo o formato existente e rode `python tests/validar_dados.py`.

## Publicar

### GitHub
```bash
git remote add origin https://github.com/SEU_USUARIO/geo-aventura.git
git push -u origin main
```

### Render
1. Em <https://dashboard.render.com> clique em **New → Blueprint** e escolha o repositório. O `render.yaml` já configura tudo.
2. Se preferir configurar à mão, use **New → Static Site** com *Build Command* vazio e *Publish Directory* `public`.

### Vercel
1. Em <https://vercel.com/new> importe o repositório.
2. O `vercel.json` já define a pasta `public` como saída, sem build. Clique em **Deploy**.

Os dois serviços fazem deploy automático a cada `git push`.

> As bandeiras são carregadas de <https://flagcdn.com> e as fontes do Google Fonts. Sem internet, o jogo funciona com fontes do sistema, mas a atividade de bandeiras fica sem as imagens.
