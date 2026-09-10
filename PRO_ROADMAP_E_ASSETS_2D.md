# Avaliação do jogo e caminho até o nível PRO

Documento de análise, escrito no fim do passe v2o. Duas partes: onde o jogo
está hoje e por quê, e a lista de assets 2D para encomendar (Gemini ou
outro gerador) com o formato exato que a integração espera.

---

## 1. Onde o jogo está

**Nota honesta: 7/10 como protótipo de portfólio, 5/10 como playable ad
publicável.**

A distância entre esses dois números é a parte útil da avaliação, então vale
separar o que já está bom do que ainda falta.

### O que já está em nível profissional

| Área | Estado | Por quê |
|---|---|---|
| Pipeline de água | Forte | Profundidade analítica em GLSL (sem depth pre-pass), bandas cel, rede de espuma Voronoi com domínio deformado, cáusticos no leito. É a parte mais tecnicamente sólida do projeto. |
| Performance | Forte | 676 obstáculos em 2 draw calls, idle de boiar no vertex shader, uma passada de cena por frame. Roda folgado em mobile. |
| Legibilidade de mecânica | Boa | Duas equipes, duas cores opostas no círculo, tiro colorido por equipe. Um jogador entende a regra sem tutorial. |
| Coerência de construção | Boa | Tudo procedural, sem asset externo, e cada valor tem justificativa escrita. É exatamente o que a vaga pede como processo. |

### O que separa do nível de anúncio publicável

Em ordem de impacto por hora de trabalho:

**1. Não tem som. (impacto: altíssimo)**
Um playable ad sem áudio perde metade do impacto percebido antes de
qualquer discussão sobre arte. Ambiente de mar + gaivota, um "pop" de
coleta com pitch subindo em combo, o clique de seleção, o splash da boia
caindo no redemoinho, e uma trilha curta em loop. Isto é o item de maior
retorno da lista inteira e não depende de nenhum asset externo.

**2. O tabuleiro é visualmente monótono. (impacto: alto)**
São 676 peças de duas silhuetas. Mesmo com variação de cor e de escala, o
olho lê uma textura, não objetos. O que resolve não é mais variação de
matiz — é mais SILHUETAS: uma sacola plástica, uma tampinha, um canudo,
uma rede emaranhada, uma bota velha. Cinco silhuetas por equipe já
transformam a leitura, e o custo é de modelagem, não de performance
(continua sendo uma InstancedMesh por geometria).

**3. Não existe game feel no impacto. (impacto: alto)**
Hoje o lixo simplesmente some. Falta: partículas de estilhaço na cor da
peça, um flash de escala de 1 frame, screen shake mínimo em combo, e o
número subindo em texto flutuante. Isso é o que faz um jogo casual parecer
"caro", e é quase todo trabalho de código, não de arte.

**4. Não há progressão nem tensão. (impacto: médio-alto)**
Não existe fracasso possível. Um anúncio precisa de risco: um timer, ou
maré subindo, ou lixo que se multiplica se você demorar. Sem isso, a
sessão não tem arco e o jogador não tem motivo para se apressar — o que
também esvazia o ranking de estrelas que acabou de ser construído.

**5. A UI é funcional, não é arte. (impacto: médio)**
Contadores são pílulas CSS com um caractere Unicode dentro. É exatamente
aqui que assets 2D pré-renderizados dão o maior salto de percepção pelo
menor esforço de integração — ver a parte 2.

**6. Falta o CTA. (impacto: médio, obrigatório se for anúncio de verdade)**
Todo playable termina em "instalar agora": um botão pulsante, o end card
com logo, e o hook nos primeiros 3 segundos.

**7. Câmera estática. (impacto: baixo-médio)**
Um leve movimento de câmera na abertura (um push-in vindo do alto) e um
zoom sutil na vitória valem mais do que parecem.

### Onde eu colocaria as próximas 20 horas

1. Som (4h) — maior retorno absoluto.
2. Game feel de impacto: partículas, flash, texto flutuante (4h).
3. Mais silhuetas de lixo (3h).
4. Tensão: timer ou maré (3h).
5. UI com os assets 2D da parte 2 (3h).
6. CTA e end card (2h).
7. Polimento de câmera (1h).

---

## 2. Assets 2D para encomendar

Formato geral, válido para todos os itens salvo indicação em contrário:

- **PNG com transparência real** (canal alpha), sem fundo branco.
- **Sem sombra externa** assada no PNG (a UI aplica a dela).
- **Estilo:** vetorial cartoon chapado, contorno escuro opcional mas
  consistente, mesma espessura em todos os itens do mesmo grupo.
- **Paleta obrigatória** — o jogo inteiro depende dela:
  - Equipe PLÁSTICO (verde-ciano): `#24C9A4`, escuro `#0E8A68`, claro `#6FE0BD`
  - Equipe METAL (magenta-violeta): `#C84A9E`, escuro `#8E2F78`, claro `#FF5FD0`
  - Água rasa `#38C8EF`, água funda `#0B62C8`, espuma `#FFFFFF`
  - Areia `#E4B478`, casco do barco `#D8A86A`, convés `#9C6A3E`
  - Pinguim (corpo) `#2C3F5C`, barriga `#F2F5FA`, pés/bico `#F5A623`
- **Iluminação:** de cima e ligeiramente à esquerda, para bater com o sol
  da cena (que está em +X, +Y, -Z).

### Grupo A — Ícones de HUD (prioridade 1)

Estes substituem os caracteres Unicode nos contadores hoje. É o item de
melhor relação impacto/esforço da lista.

| # | Asset | Tamanho | Notas |
|---|---|---|---|
| A1 | Garrafa PET de frente, com rótulo verde | 256×256 | Levemente em 3/4, tampa verde-escura, corpo translúcido com um highlight branco. |
| A2 | Latinha de alumínio de frente, rótulo magenta | 256×256 | Faixas de alumínio nu em cima e embaixo, rótulo no meio — o mesmo "adesivo" do modelo 3D. |
| A3 | Moeda / ficha de pontuação | 256×256 | Dourada, com uma folha ou gota estilizada em relevo. |
| A4 | Ícone de boia (contador de capacidade) | 256×256 | Salva-vidas vermelho e branco, vista de topo. |

### Grupo B — Ícones de boost (prioridade 1)

Cinco slots quadrados. Hoje mostram um emoji. Precisam de **dois estados
cada**: cheio (colorido) e vazio (silhueta em cinza a 30%).

| # | Asset | Tamanho | Notas |
|---|---|---|---|
| B1 | Tiro rápido — raio estilizado | 256×256 | Amarelo `#FFD447` com contorno branco. |
| B2 | Tiro múltiplo — três projéteis em leque | 256×256 | Neutro (funciona para as duas equipes). |
| B3 | Munição — caixa de munição / cartucho | 256×256 | |
| B4 | Ímã (puxa uma fileira inteira) | 256×256 | Ferradura magenta com polos prateados. |
| B5 | Aspirador (limpa uma área) | 256×256 | Bocal verde-ciano. |
| B6 | Moldura de slot vazio | 256×256 | Quadrado de cantos arredondados, traço tracejado, transparente por dentro. |

### Grupo C — Botões e molduras de UI (prioridade 2)

| # | Asset | Tamanho | Notas |
|---|---|---|---|
| C1 | Botão primário (Jogar de novo / Instalar) | 512×160 | Pílula ciano com biseladura inferior mais escura, para o efeito de "afundar" ao clicar. Precisa de 2 estados: normal e pressionado. |
| C2 | Fundo de pílula do contador | 384×128 | Semitransparente, cantos totalmente arredondados. Idealmente entregue também como **9-slice** (marcar as bordas que podem esticar). |
| C3 | Painel do placar (fundo dos stats) | 640×480 | Cartão translúcido de cantos arredondados. |
| C4 | Estrela cheia + estrela vazia | 256×256 cada | Dourada `#FFD447` com contorno branco; a vazia em cinza-azulado. |
| C5 | Ícone de som ligado / desligado | 128×128 | Para quando o áudio entrar. |

### Grupo D — Ilustrações de tela (prioridade 2)

| # | Asset | Tamanho | Notas |
|---|---|---|---|
| D1 | Logo do jogo ("Ocean Cleanup" ou o título final) | 1024×512 | Letreiro cartoon com contorno grosso, legível a 200px de largura. |
| D2 | Faixa de vitória ("OCEAN CLEARED!") | 1024×256 | Fita/banner atrás do texto. |
| D3 | Raios de fundo da vitória | 1024×1024 | Leque de raios brancos a partir do centro, alpha caindo para fora. Hoje é um `conic-gradient` em CSS; um asset desenhado fica melhor. |
| D4 | Confete / respingo de comemoração | 512×512 | Folha de sprites, 8 peças. |

### Grupo E — Partículas e efeitos (prioridade 3)

Estes entram como textura em `THREE.Sprite` / `PointsMaterial`, então
**precisam ser quadrados, com o motivo centralizado e alpha suave nas
bordas**.

| # | Asset | Tamanho | Notas |
|---|---|---|---|
| E1 | Estilhaço de plástico | 128×128 | Branco puro — o jogo tinge por código na cor da peça. |
| E2 | Estilhaço de metal | 128×128 | Idem. |
| E3 | Puff de espuma | 256×256 | Branco, bordas macias. |
| E4 | Anel de impacto | 256×256 | Anel branco fino, transparente no miolo. |
| E5 | Brilho / faísca | 128×128 | Cruz de 4 pontas com halo. |

### Grupo F — Texturas de cena (prioridade 3)

Estas substituiriam texturas desenhadas em canvas hoje. **Devem ser
perfeitamente tileáveis (seamless).**

| # | Asset | Tamanho | Notas |
|---|---|---|---|
| F1 | Tábuas do convés | 512×512 | Seamless. Madeira quente, veios visíveis mas discretos. |
| F2 | Areia com pedrinhas | 512×512 | Seamless. Base `#E4B478`, variação suave, nada de listras direcionais. |
| F3 | Metal escovado | 512×512 | Seamless, para as latas. |
| F4 | Rótulo de garrafa (arte de embalagem) | 512×256 | Retangular, para enrolar no corpo. Precisa ser tileável na horizontal. |

---

## 3. Como entregar (importa para a integração)

1. **Nomes de arquivo exatamente como o código:** `hud_bottle.png`,
   `hud_can.png`, `boost_rapid.png`, `boost_rapid_empty.png`, e assim por
   diante. Renomear depois é onde erros aparecem.
2. **Uma pasta por grupo**, e todos dentro de `/assets/` na raiz do
   projeto (a pasta já é prevista na estrutura de entrega do teste).
3. **Sem margem sobrando:** o motivo deve encostar nas bordas do canvas,
   com no máximo 4px de folga. Margem extra dentro do PNG vira
   desalinhamento na UI e não tem como ser corrigida sem recortar.
4. **Ícones do mesmo grupo com o mesmo peso visual.** O erro mais comum em
   lote gerado por IA é cada ícone vir com uma espessura de contorno
   diferente; a folha inteira precisa ser pedida numa geração só, ou
   revisada em conjunto.
5. **Uma folha de contato** (todos os ícones lado a lado numa imagem só)
   junto da entrega, para conferir consistência de uma olhada.

### O que fica pronto para receber os assets

Os pontos de integração já existem no código e cada um é uma troca de uma
linha quando os arquivos chegarem:

- Contadores: `#count-plastic` / `#count-metal` no `index.html` — o
  `<span class="dot">` vira um `<img>`.
- Boosts: `BOOST_TYPES[key].icon` no `main.js` — hoje devolve um caractere,
  passa a devolver um caminho de imagem.
- Estrelas: `#win-stars` — o `<span>★</span>` vira `<img>`.
- Partículas: ainda não existem; entram junto com o item 3 da lista de
  prioridades acima.
- Texturas de cena: cada `build*Texture()` no `main.js` passa a ser um
  `TextureLoader().load(...)`, mantendo os mesmos `repeat` e `wrap`.
