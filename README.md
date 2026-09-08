# Fish of Fortune — Home Assignment (Generalist Technical Artist)

Recriação do gameplay de referência em Three.js, entregue em duas versões.

**Mecânica** (confirmada com o cliente após revisão de frames + descrição
detalhada em áudio — ver `ai_logs/v1b_mechanic_correction.txt` para o
histórico da correção):
- Um tabuleiro de xadrez fica no centro da cena. Cada quadrado do tabuleiro
  é formado por 4 mini-pilares da própria cor do quadrado (branco ou preto).
- Uma esteira em loop retangular envolve o tabuleiro. Porquinhos entram pelo
  canto inferior esquerdo, percorrem o loop uma vez e são destruídos ao
  chegar de volta no início.
- Existem porquinhos brancos e pretos. Cada um só atira (projétil saindo do
  focinho) nos pilares da própria cor, sempre mirando o pilar vivo mais
  próximo da sua posição atual.
- O número acima do porquinho é a contagem de tiros restantes — começa em
  20 e desce a cada disparo (não é um valor que cresce).
- Cada porquinho ativo anda montado em cima de uma "ficha" (tile 3D fino,
  de bordas arredondadas) — é essa ficha que fisicamente ocupa a
  capacidade da esteira. A orientação do porco é fixada uma única vez no
  spawn (olhando para o tabuleiro); o que faz ele "virar" nos cantos é a
  própria ficha girando com a curva da esteira (ver
  `ai_logs/v1e_tile_rig_and_los.txt`), não mais um `lookAt` recalculado a
  cada frame.
- Um porco só atira num pilar da própria cor se tiver linha de visão
  livre até ele — pilares da cor oposta no caminho bloqueiam o tiro
  (regra do "arco e flecha"); se só houver pilares da cor oposta na
  frente, o porco espera.
- HUD "X/5" (canto inferior esquerdo, junto da pilha física de fichas):
  quantos porquinhos estão ativos na esteira ao mesmo tempo (capacidade
  máxima), separado da fila de seleção. A esteira tem um vão sem trilho
  bem nesse canto — é onde a pilha de fichas vive e de onde elas são
  empurradas para a esteira ao serem selecionadas (animação, não
  teleporte).
- Fila de seleção: 4 "filas" (colunas) de 3 porquinhos cada, renderizados
  com o mesmo modelo 3D usado na esteira (não ícones planos), com o
  número de tiros em cima (sem círculo — só o número, branco no porco
  preto e preto no porco branco) — ao escolher um, ele vai direto pra
  esteira, a coluna anda pra preencher a lacuna (com animação de andar) e
  um novo entra no final. Uma linha de 5 slots entre a esteira e a fila
  mostra quais porcos estão selecionados/ativos no momento.
- Iluminação: um "sol" fixo de tarde (baixo ângulo, vindo de um lado),
  só pra dar uma sombra suave perceptível nos modelos/pilares.
- Vitória: todos os pilares do tabuleiro destruídos (não confirmado no
  clipe de referência de 47s, que termina antes disso — assumido como
  condição de vitória e sinalizado como pendente de validação).

**Layout** (revisado a partir de screenshots anotados + rascunhos do
cliente — ver `ai_logs/v1d_layout_rework.txt`): câmera ortográfica
isométrica/top-down, esteira como anel 3D de bordas arredondadas com leve
altura e movimento fluido nas curvas, bandeja de fichas 3D no canto de
entrada, porquinho modelado a partir de primitivas (corpo, orelhas,
focinho, patas, olhos), fila com ícones de porco em vez de cards
numéricos.

## Estrutura

```
/primitive_version   -> Versão A: apenas primitivas (cubo/esfera/plano), cores flat
/styled_fof_version  -> Versão B: mesma lógica, reskin com GLB, materiais, luz, UI
/assets              -> modelos .glb (Blender) e UI (.png/.jpg do Figma/Photoshop)
/ai_logs             -> prompts e interações com IA exportados em .txt (obrigatório)
/README.md           -> este arquivo + justificativas de cada iteração (v1/v2/v3)
```

Cada versão (`primitive_version`, `styled_fof_version`) é um projeto Vite
independente, com seu próprio `package.json`. Elas compartilham a mesma lógica
de jogo (mecânica, timing, regras) — o que muda é só a camada visual
(geometria/material/luz/UI). Ao migrar de A para B, o objetivo é extrair a
lógica de jogo (estado, track, spawner, win condition) para módulos puros que
não sabem nada sobre "como" o objeto é desenhado, e só trocar a camada de
renderização.

## Como rodar localmente

Pré-requisitos: Node.js LTS instalado.

```bash
# Versão A (primitivas)
cd primitive_version
npm install
npm run dev
# abre http://localhost:5173

# Versão B (estilizada), em outro terminal
cd styled_fof_version
npm install
npm run dev
```

Cada comando abre no navegador com hot-reload: qualquer alteração em
`src/main.js` (ou nos módulos que criarmos) atualiza a página automaticamente.

## Iterações (Vibe Coding)

### v1 — Primitivo (mecânica crua) ✅ implementado
- O quê: tabuleiro 6x8 células (4 pilares cada = 192 pilares), esteira em
  loop entrando pelo canto inferior esquerdo, porquinhos brancos/pretos que
  atiram só nos pilares da própria cor mirando sempre o mais próximo,
  munição decrescente (20 → 0), rotação constante mirando o centro,
  capacidade de esteira (5 simultâneos) separada da fila de seleção (4
  slots), vitória ao zerar todos os pilares. Sem easing na movimentação e
  sem VFX além do próprio projétil — isso fica para v2/v3. Duas rodadas de
  implementação: a primeira leitura do vídeo (baseada só em frames) errou
  a mecânica em vários pontos; a correção completa está documentada em
  `ai_logs/v1_primitive.txt` (implementação original) e
  `ai_logs/v1b_mechanic_correction.txt` (correção ditada pelo cliente).
- Por quê: validar a regra do jogo (fila → esteira → mira por cor → dano →
  vitória) antes de gastar tempo com visual ou responsividade.
- Ajustes de layout/feel pedidos pelo cliente após a primeira correção
  (ver `ai_logs/v1c_layout_and_feel_pass.txt`): pilares mais compactos por
  célula, cadência de tiro mais rápida e com variação, projétil com arco,
  porquinho sai da esteira assim que a munição zera (não espera terminar
  a volta), UI 100% em inglês, layout remontado como frame vertical 9:16
  (celular) com a fileira de 5 "fichas" de capacidade entre a esteira e a
  fila, fila de seleção como FIFO de verdade, seta de direção animada na
  esteira, focinho do porquinho trocado por uma esfera de destaque (o cone
  usado antes ficava ambíguo entre focinho e rabo).
- Valores tunados (`primitive_version/src/config.js`):
  - `GRID`: 6x8 células, 4 pilares por célula (192 pilares no total),
    `pillarSize = 0.46` com `pillarGap = 0.035` (cluster compacto)
  - `BELT.capacity = 5` porquinhos simultâneos na esteira
  - `QUEUE.columns = 4`, `QUEUE.rows = 3` (4 filas de 3 porquinhos)
  - `PIG.ammoStart = 20` tiros por porquinho
  - `PIG.speed = 2.6` un/s ao longo da esteira
  - `PIG.fireIntervalBase = 170` / `fireIntervalJitter = 90` (ms, cadência
    variável ≈ 4-8 tiros/s dependendo do sorteio)
  - `PIG.projectileSpeed = 16` un/s, `projectileArcHeight = 0.55`
  - `TRACK.cornerRadius = 1.1`, `TRACK.width = 0.9`, `TRACK.height = 0.22`
  - `TRACK.arrowCount = 10`, `TRACK.arrowSpeed = 1.6` un/s
  - Última rodada de layout (ver `ai_logs/v1d_layout_rework.txt`): câmera
    ortográfica isométrica, esteira como anel 3D curvo de verdade (linhas +
    arcos, não mais 4 segmentos retos), bandeja 3D de fichas no ponto de
    entrada, porquinho remodelado com `RoundedBoxGeometry` + primitivas
    (orelhas/focinho/patas/olhos), fila 4x3 com ícones de porco em CSS.
  - Rodada de mecânica/visual (ver `ai_logs/v1e_tile_rig_and_los.txt`):
    porco passou a andar montado numa ficha (`TILE`) que carrega a
    orientação nos cantos (fim do `lookAt` por frame — orientação fixa no
    spawn, `PIG.inwardOffset = -Math.PI/2` medido experimentalmente e
    verificado matematicamente via produto escalar focinho↔centro); vão
    sem esteira no canto de entrada onde vive a pilha física de fichas
    (a própria pilha agora É o contador de capacidade); fila de seleção
    trocou os ícones CSS por o mesmo modelo 3D da esteira, renderizado via
    viewports com `scissor` recortados sobre o canvas principal; tiro
    maior/mais brilhante (`PIG.projectileRadius = 0.13`,
    `emissiveIntensity`) com rastro de partículas; regra de linha de
    visão para o tiro (`PIG.losBlockRadius = 0.42`) — pilar da cor oposta
    no caminho bloqueia o disparo; tangente da esteira passou a ser
    calculada analiticamente (`tangentAtDistance`) em vez de por diferença
    finita, deixando a curva das setas e da ficha exatamente suave nos
    cantos.
  - Correção de bug + polish de HUD (ver
    `ai_logs/v1f_arrow_fix_and_hud_pass.txt`): achei a causa raiz de as
    setas apontarem errado (misturar `rotation.x` fixo com `rotation.y`
    dinâmico no mesmo objeto three.js não é "deitar e girar" — a rotação
    de deitar agora é assada na geometria); animação procedural de
    andar/idle/tiro no modelo do porco (pernas com pivô no quadril);
    fila com técnica FLIP pra deslizar os porcos ao preencher a lacuna;
    nova linha de 5 "slots selecionados"; munição sem círculo; rastro do
    tiro trocado de partículas por um cone único afinando (`ConeGeometry`,
    mais barato); espaçamento mínimo entre porcos na esteira
    (`PIG.minBeltGap`); luz direcional fixa com sombra leve
    (`LIGHTING`); fichas da pilha agora brancas.
  - Fila movida pra cena real + tabuleiro 13x13 (ver
    `ai_logs/v1g_real_scene_queue_and_scale.txt`): a fila de seleção
    deixou de ser um mini-viewport recortado e virou modelos 3D de
    verdade dentro da cena principal (sul da esteira, olhando pro norte),
    projetando sombra real da luz global e selecionados por
    `THREE.Raycaster` em vez de clique em elemento DOM; ao escolher um
    porco, a MESMA instância dele voa "drag and drop" direto pra cima da
    ficha que entra na esteira (sem duplicar modelo); pilares do
    tabuleiro (agora 13x13, até 676) e os segmentos do trilho da esteira
    viraram `THREE.InstancedMesh` pra manter isso barato; o vão da
    esteira (onde vive a pilha de fichas) passou a ser ausência literal
    de geometria — sem trilho ali — em vez do bloco "máscara" da cor do
    chão usado antes; setas da esteira ganharam um `ShaderMaterial`
    customizado que faz o sumiço/aparição "da ponta ao final" da seta,
    como entrando/saindo de uma máscara, em vez de um pop instantâneo;
    porco 50% maior na esteira (`PIG.beltScale`); número de munição sem
    NENHUMA borda (só fill sólido); slots de porco selecionado e fila com
    o card/base por trás do modelo (não mais confinando-o); mais
    espaçamento entre os 5 slots selecionados; luz global mais forte e
    cena um pouco mais clara, como preparação pra paleta clara/vibrante
    da fase de estilo. A posição da fila na tela (agora depende da
    câmera, já que virou objeto de cena real) precisou de 3 rodadas de
    build+screenshot+ajuste (`QUEUE.areaOffsetZ`/`rowSpacing`) até ficar
    visivelmente abaixo dos slots selecionados e caber inteira no frame.
  - Passe de escala + fluxo da fila (ver
    `ai_logs/v1h_scale_pass_and_queue_flow.txt`): porco na esteira andando
    na MESMA velocidade das setas (mesma superfície); porco na esteira em
    pose idle por padrão, só reagindo (recoil) no instante de cada tiro
    (antes ficava preso num "walk" constante); porcos da fila 5x maiores;
    fluxo de seleção reescrito — o porco de trás anda pra fechar a lacuna
    e só DEPOIS um porco novo aparece vindo de fora da tela andando até o
    lugar (nunca mais um "pop" instantâneo já visível, lendo como fila
    infinita); ficha/tile (compartilhada entre pilha e esteira) 4x maior e
    com espessura real, antecipando a futura jangada de madeira; porco na
    esteira 3x maior (era 1.5x); pilares do tabuleiro 3x mais altos;
    esteira bem mais grossa; corrigido um defeito de "leque"/facetas no
    canto arredondado da esteira (o raio do canto precisava ser maior que
    a metade da largura da esteira, ou o lado interno da curva se auto-
    sobrepõe e dá z-fighting); fichas da pilha com espaçamento maior entre
    si pra contar fácil. Também gerei
    `ai_logs/reskin_brainstorm_prompt.txt`, um prompt pronto pra testar
    novas estéticas (pirata, iceberg, etc.) em outra IA de imagem/conceito.
  - Correção de geometria da esteira + reescrita da fila + sons placeholder
    (ver `ai_logs/v1i_pacing_queue_rework_and_sfx.txt`): a causa raiz do
    defeito de "leque" no canto da esteira NÃO era o raio errado — era o
    método em si (segmentos retos de `BoxGeometry` rotacionados só
    aproximam a curva, e se auto-sobrepõem no lado interno sempre que o
    raio é pequeno perto da largura da esteira, não importa o valor
    escolhido); a esteira foi reconstruída como uma única fita (`ribbon`)
    de `BufferGeometry`, amostrando a curva de verdade ponto a ponto — isso
    deixa o raio do canto livre pra qualquer valor sem o defeito, e o
    canto ficou mais fechado como pedido, sem serrilhado; fila reescrita
    pra sempre manter 4 porcos reais por fila (não mais 3 com um 4º criado
    sob demanda por timer), com o 4º permanentemente fora da tela — isso
    eliminou de vez o bug de "gaps fixos" na fila, que era causado por uma
    janela de dessincronia entre o timer de spawn e o estado visual; nova
    trava física (`hasRoomForNewFiche`) impede que uma ficha entre em cima
    da outra na esteira, bloqueando o clique até haver espaço de verdade
    (ainda sem feedback visual de "bloqueado" — fica pra próxima rodada);
    munição do porco reposicionada mais abaixo (na parte plana das costas,
    abaixo das orelhas) tanto na esteira quanto na fila; fichas da pilha e
    da esteira unificadas numa cor só (a diferenciação branco/preto não
    fazia sentido pra futura "jangada de madeira" única); texto "X/5"
    aumentado pro tamanho horizontal máximo da ficha e movido pro chão
    logo abaixo da base da pilha; removido o sistema de miniatura do porco
    dentro dos slots selecionados (esses slots ficam reservados pra itens
    de ação rápida no futuro — sem a miniatura, o olho do jogador fica na
    esteira); projétil e rastro bem maiores, rastro afinando desde o
    diâmetro exato do projétil; animação de bounce + colapso ao destruir
    um pilar; velocidade da esteira e cadência de tiro aumentadas
    (aproximação da referência — sem acesso ao arquivo de vídeo original
    nesta sessão, o ajuste foi feito só pela descrição em texto, e fica
    marcado como pendente de comparação direta com o clipe); primeiro
    módulo de som (`sound.js`), com efeitos simples gerados por código
    (osciladores + ruído filtrado) como placeholder para clique, ficha
    entrando, porco pousando, tiro, acerto, pilar destruído, porco saindo
    sem munição e porco caindo no buraco final; `reskin_brainstorm_prompt.txt`
    atualizado para refletir essas mudanças (ficha única, novo lugar da
    munição, "X/5" no chão, slots sem miniatura, item 12 = sons).
  - Ajuste de proporção/layout pra bater com a referência + reformulação
    da pilha de fichas (ver
    `ai_logs/v1j_layout_match_and_tile_rework.txt`): esteira ainda mais
    rápida (`PIG.speed`/`TRACK.arrowSpeed` 4.5 → 6.5) pra clicar na fila
    com mais constância; ficha drasticamente menor (3.4 → 1.6), calculada
    pra ficar só ligeiramente maior que a pegada real do porco na esteira
    (`PIG.beltScale` 3 → 2, mesma leitura "Nx maior" = valor absoluto já
    usada na fila no v1i); fila mais compacta (`pigScale` 2 → 1.4) — só
    que o espaçamento entre fileiras (`rowSpacing`) precisou continuar
    generoso (3.1) mesmo com porco menor, porque a câmera isométrica
    comprime bastante a distância Z na tela e reduzir os dois juntos fazia
    a munição de fileiras vizinhas se sobrepor visualmente; idle da fila
    ganhou um leve balanço de corpo pra frente/trás sem tirar os pés do
    chão; pilares agora com `RoundedBoxGeometry` (cantos arredondados) e
    uma animação de destruição por bounce elástico de escala (encolhe →
    cresce com overshoot → encolhe → some) no lugar do jolt de posição
    antigo; a pilha de fichas deixou de crescer pra cima e virou uma
    fileira de fichas EM PÉ lado a lado (como um leque de livros/cartas,
    com sobreposição parcial pra não estourar a largura do tabuleiro — a
    primeira tentativa com espaçamento total mandou a fileira pra fora da
    tela), com a ficha mais externa tombando 90° enquanto anda até a
    esteira; luz global recalculada pra um sudeste de 45°/45° exatos
    (azimute E elevação), sombra bem definida; novo prop de "buraco" no
    mesmo canto de entrada onde o porco visivelmente afunda/encolhe ao
    invés de só sumir ao terminar a volta; números do HUD (munição, "X/5")
    trocados pra uma fonte casual (Fredoka via Google Fonts) com contorno
    cômico desenhado no próprio canvas (stroke antes do fill, funciona em
    cima de qualquer texto). Pendência sinalizada no log: com a munição
    esgotando tão rápido, a animação de queda no buraco raramente chega a
    disparar na prática — vale rebalancear se a intenção for vê-la mais.
  - Passe de legibilidade + separação buraco/ficha + um bug real de
    clique (ver `ai_logs/v1k_readability_and_hole_split.txt`): ao cair
    no buraco agora só o PORCO encolhe e some em opacidade — a ficha
    não é mais destruída junto, ela anima voltando pra fora até o
    próximo lugar da fileira e fica em pé de novo (a contagem "X/5" já
    ficava certa automaticamente; essa animação é só cosmética);
    corrigido o contador "X/5" que estava mostrando o inverso (quantas
    fichas estão EM USO em vez de quantas estão GUARDADAS); esteira
    empurrada bem mais perto das bordas do frame (margem cortada,
    câmera com menos folga), o que também faz o tabuleiro/pilares
    ocuparem uma fração bem maior da tela sem mexer no tamanho do grid
    em si; canto da esteira com raio bem maior pra o arco interno não
    ficar "apertado" perto do externo; porco+ficha na esteira
    aumentados (~1.5-1.6x, não o 4x literal pedido — um tile 4x maior
    obrigaria a esteira a crescer junto, o que puxaria a câmera pra
    trás e encolheria o tabuleiro de novo, brigando com o pedido mais
    repetido da mesma mensagem; decisão registrada explicitamente no
    log); fila reposicionada e bem maior (`pigScale` 1.4 → 3.2) em 3
    rodadas de ajuste pra a fileira 0 ficar logo abaixo dos slots
    selecionados e a fileira 2 quase tocar a base da tela; a transição
    "entrando na esteira" trocada de ease-out pra ease-in (um ease-out
    desacelera até zero bem no instante de chegar, o que lia como o
    porco "parando" antes da esteira assumir o movimento); fontes do
    HUD com resolução e tamanho bem maiores (munição e "X/5"), já que
    o passe anterior ficou quase ilegível numa foto de celular de
    verdade. **Bug real encontrado nesta rodada**: ao aproximar a fila
    dos 5 slots decorativos, os cliques nos porcos da primeira fileira
    simplesmente pararam de funcionar — a `<div>` dos slots (só um
    contorno tracejado, sem função própria) ficava por cima do canvas
    e engolia o clique antes dele chegar no raycaster; corrigido com
    `pointer-events: none` nela. Sem isso, "porcos maiores pra clicar
    melhor" teria piorado a situação em vez de resolver.
  - Passe de proporção geral + fila de fichas horizontal + separação de
    velocidade esteira/setas (ver
    `ai_logs/v1l_proportion_and_speed_split.txt`): porcos da fila
    ainda maiores (`pigScale` 3.2 → 4.4); espaçamento entre fileiras
    (eixo Z) derrubado de 10.4 para 5.2 pra ficar numericamente perto do
    espaçamento entre colunas (eixo X, 4.2) — um passe anterior tinha
    superestimado o quanto a câmera isométrica comprime o eixo Z em
    relação ao X; medindo em pixels de novo ficou claro que os dois
    eixos comprimem de forma parecida, e esse valor menor também sobrou
    espaço vertical suficiente pras 3 fileiras visíveis caberem
    confortavelmente, com a fileira 2 terminando perto da borda; fileira
    0 empurrada mais pra longe da esteira (`areaOffsetZ` 12.5 → 16) pra
    nunca mais encostar nos slots tracejados, mesmo parada; fila de
    fichas mudou de uma diagonal pra um eixo puramente horizontal
    (esquerda→direita) — precisou de um pequeno deslocamento de
    profundidade por ficha (quase imperceptível isoladamente) porque uma
    fileira 100% no mesmo eixo da sobreposição ficou parecendo uma peça
    sólida única em vez de 5 fichas contáveis, um bug só visível depois
    de um zoom no screenshot; label "X/5" maior e recentralizado embaixo
    dessa fileira; esteira ~16% mais fina; margem entre esteira e borda
    da tela cortada pela metade nos dois lados e no topo (o corte do
    topo desloca a cena inteira pra cima igualmente, então a fila 3D
    teve que compensar isso também, ao contrário dos slots tracejados
    que são um `<div>` HTML fixo na tela); velocidade do porco+ficha na
    esteira (`PIG.speed`) separada da velocidade das setas
    (`TRACK.arrowSpeed`) — eram amarradas 1:1 desde o v1h "por serem a
    mesma superfície"; agora o porco anda mais rápido (6.5 → 8.5) e as
    setas mais devagar (6.5 → 4.2), como pedido; investigado o
    empilhamento visual esteira/porco (setas "por baixo") — a diferença
    de altura real entre os dois (~0.24 vs ~0.54) já garante a oclusão
    correta via teste de profundidade do WebGL, então a sensação
    relatada provavelmente vinha da coincidência de velocidade igual
    entre os dois antes desse passe, não de um bug de renderização; sem
    mudança adicional aí além da separação de velocidade.
  - Passe de fila de fichas em cascata + esteira mais fina/quadrada +
    fechamento da V1 (ver
    `ai_logs/v1m_tile_cascade_and_belt_squareoff.txt`): a direção da
    fileira de tiles voltou da reta puramente horizontal (v1l) para a
    tangente do ponto de entrada da esteira — a versão horizontal
    acabou escondendo quase todos os tiles atrás do primeiro (mesmo
    eixo da sobreposição e da direção da fileira), enquanto uma imagem
    de referência confirmou que a cascata na diagonal é o que realmente
    mostra a face grande de cada tile, "um atrás do outro"; esteira
    ainda mais fina (3.6 → 2.6) e cantos bem menos arredondados (raio
    4.2 → 2.6), validado com uma comparação de pixels em escala
    normalizada contra uma referência em Photoshop, não só "no olho";
    **bug real encontrado**: a esteira mais fina, combinada com o valor
    de câmera do passe anterior, jogava a primeira fileira de pilares
    pra fora do topo da tela — corrigido reajustando a câmera e a
    posição da fila junto; **outro bug real**: a 3ª fileira de porcos da
    fila estava sendo cortada na borda inferior da tela — corrigido
    recuando o espaçamento da fila até caber inteira com margem; área
    do buraco de destruição passou a ser dimensionada a partir da
    grossura da própria esteira (`TRACK.width`) em vez do tamanho do
    tile, pra nunca mais desproporcionar independente da esteira;
    revisão geral do fluxo de vitória/reinício e do bookkeeping de
    capacidade/munição sem achar nenhuma lacuna — V1 considerada
    funcionalmente completa antes do passe de "feel" (v2) e do reskin.
  - Passe de direção da fila de tiles (de vez), esteira 15% maior e
    fechamento da V1 (ver
    `ai_logs/v1n_tile_row_direction_and_v1_closeout.txt`): feedback desta
    vez veio com direções cardeais explícitas — fileira deve correr na
    horizontal oeste→leste, com a face grande virada para leste; corrigi a
    direção da fileira para um eixo mundial +X puro, mas testando a
    rotação que aponta a normal da face literalmente pra leste, o tile
    ficava com área visível zero pra essa câmera (ela tem `x=0` desde
    sempre, então uma normal exatamente no eixo X fica de perfil,
    matematicamente, não só num ângulo ruim); tentei inclinar a câmera
    lateralmente para resolver isso, mas qualquer deslocamento em X
    distorce a grade e a fila de porcos inteiras (tudo no resto da cena
    assume câmera centrada) — revertido; decisão: mantive a normal da
    face no eixo Z (visível nessa câmera) e só corrigi a direção da
    fileira para oeste→leste como pedido, sinalizando explicitamente essa
    troca — uma câmera isométrica "de verdade" seria o próximo passo se a
    normal literal a leste ainda for essencial; **bug real redescoberto**:
    a fileira puramente em X sem nenhuma variação de profundidade
    renderizava como uma prancha sólida (esse ângulo de câmera bem de cima
    faz a borda fina do topo de cada tile dominar a leitura) — corrigido
    com um pequeno deslocamento de profundidade por tile, confirmado via
    zoom no screenshot antes/depois; esteira 15% maior (margem, espessura
    e raio de canto escalados juntos, preservando a proporção já validada);
    **bug real corrigido**: só um porco da fila projetava sombra porque o
    frustum da câmera de sombra estava centrado na esteira, não cobrindo a
    fila inteira — recentrado e alargado, confirmado que todas as
    fileiras visíveis agora têm sombra; slots tracejados um pouco mais
    acima e maiores; reconferido o "porco com pernas cortadas" reportado —
    já não reproduz no build atual (corrigido no passe anterior, a imagem
    enviada era de antes desse rebuild); esteira recuada uma espessura
    antes do fim do caminho pra formar o buraco quadrado pedido, com o
    ponto de queda do porco+tile recentrado no meio desse espaço; V1
    reconfirmada funcionalmente fechada após um teste de clique de ponta a
    ponta e revisão visual completa em zoom.
  - Passe de pilha de fichas (não mais fileira), esteira retangular e slots
    maiores (ver `ai_logs/v1o_pile_rectangle_belt_and_bigger_slots.txt`):
    depois de 3 rodadas ajustando a direção de uma fileira de tiles, o
    conceito foi trocado de vez para uma pilha vertical — tiles deitados,
    empilhados reto para cima, no vão da esteira, ao nível do chão; a
    margem da esteira em relação ao tabuleiro deixou de ser um valor único
    e virou dois (leste/oeste bem mais próximos do tabuleiro, norte/sul
    mais distantes), transformando o loop de quadrado para um retângulo
    vertical com cantos ainda arredondados; **bug real encontrado**: alargar
    a margem norte/sul empurrou a fila de porcos inteira mais para baixo na
    tela (ela é posicionada relativa à extensão da esteira), cortando a 3ª
    fileira — corrigido reduzindo o deslocamento da fila na mesma proporção;
    margem entre esteira e borda da tela reduzida a 1/3 do valor anterior;
    slots tracejados subidos mais que meio tamanho próprio e aumentados —
    aqui esbarrei num limite geométrico real: com 5 slots numa fileira só
    num frame de celular, o encolhimento do CSS flex faz o tamanho final
    depender quase só do espaço de gap/padding, não da largura declarada, e
    mesmo zerando os dois o crescimento máximo possível é de ~1.47x, não os
    1.7x pedidos — cortei gap/padding ao mínimo prático e cheguei a ~1.4x
    reais na tela, com o teto de 1.7x reservado para telas menos apertadas.
  - Passe de polimento final — pilha, esteira mais abaixo e setas (ver
    `ai_logs/v1p_final_polish_pile_belt_arrows.txt`): tiles da pilha
    maiores e mais grossos, agora com um espaço visível entre as camadas
    empilhadas; a pilha foi reancorada no ponto real onde a esteira
    visível começa (centralizada na largura dela ali), em vez do meio do
    arco do vão aberto; câmera ajustada para empurrar todo o bloco da
    esteira/grade mais para baixo na tela — o que, como sempre, exigiu
    reajustar o deslocamento da fila de porcos para as 3 fileiras
    continuarem cabendo, e desta vez também exigiu subir a posição dos
    slots tracejados, porque empurrar a esteira pra baixo sem mexer nos
    slots causou uma sobreposição real entre eles e a primeira fileira da
    fila (pego via screenshot) — corrigido subindo os slots até sobrar
    espaço limpo dos dois lados; slots também reduzidos a 2/3 do tamanho
    do passe anterior (reversão total do aumento de antes). Setas da
    esteira maiores, mais achatadas e com menos opacidade; a máscara de
    entrada/saída delas trocada de um corte binário (`discard`) para uma
    rampa suave (`smoothstep`), lendo como um desaparecimento em degradê
    em vez de um corte seco — precisou estender a faixa de varredura do
    limiar um pouco além da própria ponta/cauda da seta para não criar um
    "pulo" visível na transição entre "varrendo" e "totalmente visível".
  - Passe de correção de sobreposição, animações de morte e fechamento da V1
    (ver `ai_logs/v1q_overlap_regression_death_anims_and_v1_close.txt`):
    **regressão real corrigida** — o empurrão da esteira/grade para baixo do
    passe anterior (multiplicador do `camera.lookAt`) e o reajuste do
    deslocamento da fila de porcos que ele exigiu deixaram pouco espaço
    vertical para os slots tracejados, que passaram a sobrepor o texto
    "5/5" e a própria fila (reportado pelo usuário num aparelho real, algo
    que minha verificação anterior num único viewport não pegou) —
    corrigido revertendo os dois valores acoplados (câmera + deslocamento
    da fila) para a última combinação já validada como boa, e desta vez
    reverificado em 3 proporções de tela diferentes, não só uma. Margem
    horizontal da esteira aumentada — havia um bug real em que essa margem
    era menor que a metade da própria largura da esteira, fazendo a faixa
    da esteira invadir geometricamente os pilares mais próximos da grade;
    agora a esteira ganhou espaço na horizontal e não toca mais nenhum
    pilar, sem alterar a espessura da própria esteira. Duas animações de
    morte novas: o porco que fica sem munição no meio da esteira não
    desaparece mais instantaneamente — agora gira e encolhe/some com um
    efeito elástico no lugar, com o tile voltando para o topo da pilha; a
    morte por cair no buraco no fim da esteira agora também gira durante a
    queda (antes só afundava/encolhia/sumia sem girar). Corrigido um bug
    latente de sobreposição de tiles na esteira (o espaçamento mínimo entre
    porcos ficou menor que a espessura do tile depois que o tile cresceu em
    passes anteriores) — aumentado o espaçamento mínimo e compensado com uma
    entrada mais rápida do tile e uma esteira mais veloz, para o tempo de
    colocação continuar parecendo mais rápido apesar do espaçamento maior.
    Setas da esteira com a forma revertida do passe anterior (que tinha
    lido "chata" ao contrário): agora mais curtas na horizontal e mais
    esticadas na vertical, com o movimento ainda mais suave. Sol global
    invertido para o canto oposto (noroeste), com uma nota explícita no
    código sobre uma contradição no próprio pedido (posição do sol vs.
    direção da sombra pedida) e qual parte foi seguida ao pé da letra.
    Testado via `npm run build` + Playwright em 3 proporções de tela
    (420x747, 390x844, 412x915) com inspeção de pixels via PIL confirmando
    ausência de sobreposição em qualquer combinação de elementos, além de
    um teste de clique real de ponta a ponta cobrindo múltiplas seleções
    seguidas. V1 considerada funcionalmente fechada a partir daqui.
  - Passe de margem superior, reposicionamento do texto "5/5" e sol a nordeste
    (ver `ai_logs/v1r_top_margin_tray_label_and_ne_sun.txt`): os slots
    tracejados ainda estavam encostando no texto "5/5" num aparelho real
    mesmo depois da correção do passe anterior — desta vez atacado pelo outro
    lado, aproximando o próprio texto "5/5" da base da pilha de tiles (quase
    encostando, com uma folga real mantida) em vez de mexer nos slots de
    novo, e empurrando todo o bloco esteira/grade um pouco mais para baixo
    (câmera) para abrir uma margem de verdade entre o topo da esteira e a
    borda superior da tela (antes praticamente inexistente) — esse mesmo
    ajuste também empurra a fila de porcos para baixo, que era um pedido
    separado deste passe, então os dois pedidos reforçaram um ao outro em vez
    de brigarem como nos passes anteriores. Reverificado nas mesmas 3
    proporções de tela: nenhuma sobreposição em lugar nenhum, margem superior
    agora visível, última fileira da fila perto da borda inferior mas sem
    cortar. Espaçamento entre as camadas da pilha de tiles aumentado de novo.
    Sol global movido do canto sudeste para o nordeste (canto superior
    direito), mantendo a mesma elevação, per pedido de um sol fixo
    semi-isométrico "de meio dia tropical" projetando sombra a sudoeste —
    desta vez as duas partes do pedido (posição do sol e direção da sombra)
    realmente concordavam entre si, confirmado via screenshot com zoom nas
    sombras dos porcos da fila.
  - Passe de margem superior definitiva, correção de desperdício de tiros e
    fechamento formal da V1 (ver
    `ai_logs/v1s_top_margin_v2_shot_waste_fix_and_v1_close.txt`): a estrutura
    da esteira empurrada ainda mais para baixo para abrir uma margem real no
    topo da tela (media só ~4px no passe anterior, contra ~28px das margens
    laterais) — mas desta vez a fila de porcos tinha que ficar EXATAMENTE na
    mesma posição de tela, então o deslocamento da câmera foi compensado na
    direção oposta ajustando `QUEUE.areaOffsetZ`, verificado pixel a pixel
    via screenshot (não só "de olho"). Slots tracejados descidos de novo —
    ainda encostavam no texto "5/5" na posição anterior — desta vez calculados
    para uma distância específica pedida (1/3 da própria altura do slot como
    distância até a fila de porcos), não apenas ajustados visualmente.
    **Bug real corrigido** na mecânica de tiro: cada pilastra tem 1 de vida,
    então um projétil já em voo em direção a uma pilastra já é uma morte
    garantida assim que ele chegar — mas os porcos continuavam disparando
    MAIS tiros contra essa mesma pilastra (ainda tecnicamente viva) enquanto
    o primeiro tiro ainda estava viajando, desperdiçando esses tiros extras
    no instante em que chegavam a um alvo já destruído; corrigido com uma
    flag de reserva (`targeted`) marcada no instante em que um tiro é
    disparado e liberada quando esse tiro se resolve, então a escolha de alvo
    agora ignora pilastras que já têm um tiro a caminho. V1 (primitive_version)
    considerada formalmente fechada a partir deste passe.

### v2 — Feel (responsividade + timing)
- O quê: easing de input, ajuste de timing/pacing, resposta ao clique/drag.
- Por quê: o v1 costuma parecer "robótico"; pequenos ajustes de curva de
  animação e delay mudam completamente a sensação de responsividade.
- Valores ajustados: *(preencher — ex.: duração de tween, curva de easing,
  deadzone de input)*

### v3 — Polish (juice/VFX/UI)
- O quê: partículas, squash & stretch, som/feedback visual, transição de
  vitória.
- Por quê: reforça o momento de recompensa e comunica o resultado com clareza
  (relevante para playable ads — o "gancho" precisa ser instantâneo).
- Valores ajustados: *(preencher)*

## Logs de IA

Todos os prompts usados para gerar/iterar o código estão em `/ai_logs`, um
arquivo `.txt` por sessão/iteração (ex.: `v1_primitive.txt`, `v2_feel.txt`,
`v3_polish.txt`).
