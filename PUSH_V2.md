# Push da V2 — o que subir, e como sem tocar na V1

## Por que a V1 não corre risco

Nada neste passe editou um único arquivo dentro de `primitive_version/`.
Toda a V2 vive em `styled_fof_version/`, mais os arquivos de documentação
na raiz. Um `git add` da árvore inteira, portanto, **não** sobrescreve a V1
— o Git não regrava um arquivo que não mudou, e a V1 permanece exatamente
como está no último commit dela.

Isso vale desde que você **não** faça nada das três coisas abaixo, que são
os únicos jeitos de perder a V1 sem querer:

- `git push --force` (reescreve o histórico remoto, incluindo o commit da
  V1)
- `git reset --hard <commit anterior à V1>` seguido de push
- deletar e recriar a branch

Nenhuma delas é necessária aqui. Um commit normal por cima é aditivo.

## O que subir

Arquivos alterados neste passe:

```
styled_fof_version/src/main.js
styled_fof_version/src/config.js
styled_fof_version/src/sound.js
styled_fof_version/index.html
styled_fof_version/public/audio/isle_of_joy.mp3        (novo)
styled_fof_version/public/audio/tropical_victory.mp3   (novo)
assets/audio/isle_of_joy.mp3                           (novo)
assets/audio/tropical_victory.mp3                      (novo)
ai_logs/styled_v2q_soundtrack_perspective_camera_refraction_and_v2_close.txt (novo)
README.md
PRO_ROADMAP_E_ASSETS_2D.md
PUSH_V2.md                                             (novo, este arquivo)
```

> **Sobre os dois MP3 duplicados:** `assets/audio/` é a pasta que o
> enunciado do teste pede na entrega; `styled_fof_version/public/audio/` é
> de onde o Vite realmente serve o arquivo em runtime. Manter os dois é
> deliberado — mover o `public/` quebraria o jogo, e tirar o `assets/`
> deixaria a entrega fora do formato pedido. `isle_of_joy.mp3` tem ~4,5 MB,
> então os dois juntos somam ~9,5 MB no repositório. Se preferir evitar
> isso, apague `assets/audio/` e cite o caminho do `public/` no README — mas
> confira antes se o avaliador espera a pasta `/assets` preenchida.

## Passo a passo no GitHub Desktop

1. Abra o GitHub Desktop no repositório `blayker-fish-of-fortune`.
2. Confirme no topo que a branch é a mesma de sempre (provavelmente `main`)
   — não crie branch nova, o objetivo é somar à história existente.
3. Na aba **Changes**, confira a lista. Você deve ver **apenas** arquivos
   sob `styled_fof_version/`, `assets/audio/`, `ai_logs/` e os `.md` da
   raiz. **Se aparecer qualquer arquivo sob `primitive_version/`, pare** e
   me avise antes de commitar — significa que algo tocou a V1 sem querer.
4. Marque todos os arquivos (checkbox no topo da lista).
5. Preencha o Summary e a Description com o texto da próxima seção.
6. **Commit to main**.
7. **Push origin**.

Se o Desktop reclamar dos MP3 por tamanho, ele está apenas avisando sobre
arquivos grandes; 4,5 MB está bem abaixo do limite de 100 MB do GitHub e o
push passa normalmente.

## Texto do commit

**Summary** (uma linha, é o que aparece na lista de commits):

```
v2q: soundtrack, perspective camera, underwater refraction — V2 closed
```

**Description** (cole no campo de baixo):

```
Fecha a V2 do styled_fof_version. Último passe do reskin antes da fase de
juice/polish (V3).

ÁUDIO
- Trilha: Isle of Joy no gameplay, Tropical Victory na vitória, com fades
  no relógio de áudio (um fade em setTimeout engasga sob carga).
- Mix em três barramentos (master / music / sfx). Antes cada voz
  multiplicava masterVolume por conta própria, o que tornava impossível
  balancear trilha contra efeitos sem editar todos os call sites.
- Voice limiting no tiro. Cinco riders atirando somam uma dúzia de blips
  nos mesmos milissegundos e o Web Audio SOMA — o tiro não estava "alto",
  estava N vezes alto, e ficava mais alto quanto melhor o jogador ia.
  Cues que chegam dentro da janela são descartadas, não enfileiradas.
- Streaming por <audio> em vez de decodeAudioData: o loop tem 4,5 MB e
  decodificado ocuparia dezenas de MB de float32 na memória.

CÂMERA
- Ortográfica -> perspectiva de lente longa (14°). É a única forma de ter
  perspectiva real sem perder a leitura isométrica do xadrez; uma
  grande-angular daria profundidade dramática e destruiria o iso.
- Distância derivada do enquadramento (largura / 2·tan(meio-ângulo
  horizontal)), resolvendo o eixo HORIZONTAL — a FOV fixa é a vertical,
  então num quadro retrato o tabuleiro cresceria com a razão de aspecto do
  aparelho.

ÁGUA E CENA
- Refração submersa sem um segundo render de cena: wobble nas UVs do leito
  + balanço de vértice nos props, com a fase vinda de modelMatrix[3].
- Espuma mais fina e com modulação de cobertura ao longo da borda — o
  contraste duro vinha do branco chapado uniforme, não da largura.
- Correnteza com intermitência e deriva de faixa: traços cortados com vãos
  reais, cada um começando numa faixa e terminando em outra, o que produz
  a leitura de fundir/separar sem simular nada.
- Esteira com fade nas pontas por alpha de vértice (não na textura, que
  rola). Tampas de extremidade removidas.
- Redemoinho concêntrico no ÁPICE do cone, não na boca. A espuma do meio
  deixou de ser LatheGeometry porque o raio de um lathe é função só da
  altura — toda seção horizontal é um círculo perfeito, e a borda interna
  precisava se deformar por ângulo.

PALETA E MATERIAIS
- Times: ciano -> verde-primavera, laranja -> âmbar. Nenhum dos dois é
  mais vizinho do azul da água.
- Garrafas translúcidas, mas com depthWrite ligado: quatro por célula
  desenhariam umas através das outras em ordem instável.
- Barco mais escuro e aquecido para o rosa; fita da boia branca e mais
  grossa.
- Regra de contorno de texto centralizada numa função: contorno branco em
  todo texto, navy no texto que já é branco.

BUG CORRIGIDO
- TDZ em drawOutlinedText: a constante da cor era lida por
  drawTrayLabelCanvas, que roda em escopo de módulo bem antes da
  declaração. Em produção o erro vinha minificado ("Cannot access 'Bx'");
  rodar o dev server não-minificado deu o nome real na primeira tentativa.

Testado: npm run build limpo + Playwright em 420x747, 390x844 e 412x915,
zero erros de JS ou de compilação de shader, com click-through de gameplay.

A V1 (primitive_version) não foi tocada neste passe.
```

## Depois do push — checagem de 30 segundos

Abra o repositório no navegador e confirme:

1. `primitive_version/` mostra a data do commit **antigo**, não a de hoje.
   Essa é a prova direta de que a V1 continua intacta.
2. `styled_fof_version/public/audio/` existe e tem os dois MP3.
3. O repositório continua **Private** (Settings → General → Danger Zone
   mostraria "Change visibility"; não mexa nisso).
