# Fish of Fortune — Home Assignment (Generalist Technical Artist)

Recriação do gameplay de referência (mecânica de "crowd runner com coleta de
números" — o jogador arrasta um personagem numerado da fila para dentro de uma
esteira/pista quadriculada; ele percorre o loop coletando/multiplicando valor
e o resultado é comparado a uma meta) em Three.js, entregue em duas versões.

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

### v1 — Primitivo (mecânica crua)
- O quê: mecânica principal implementada com primitivas, sem juice. Estado de
  vitória incluído.
- Por quê: validar a regra do jogo (fila → seleção → esteira/pista → contagem
  → meta) antes de gastar tempo com visual.
- Valores ajustados: *(preencher ao implementar — ex.: velocidade da esteira,
  tamanho da grade, número de slots)*

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
