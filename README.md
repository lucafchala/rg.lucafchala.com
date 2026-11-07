# rg.lucafchala.com
## Aviso de lançamento de álbum (fotos)

Quando o fotos.lucafchala.com lança um álbum com **"Destaque máximo no site"** marcado, a tela do PIN mostra, logo acima do cadeado, um cartão azul: "TURMA 2026 · COLÉGIO SANTA CRUZ **Entre Nós** · o álbum está no ar · Ver o álbum →". Até lá, nada muda.

- **Posto pelo servidor, sem script na página.** O `_worker.js` (bloco no fim do arquivo) pergunta a `https://fotos.lucafchala.com/api/destaque` e põe o cartão depois do `<body>` e o `/destaque.css` no `<head>`. A página guarda dados de documento, então não roda script de outra origem.
- **Só na página inicial** (a do PIN). Impressão, catálogo e guias ficam de fora.
- **A resposta do fotos é dado de fora:** passam só o título, o selo e um link `https:` de álbum conhecido (`HOSTS_DE_ALBUM`), tudo escapado. Se o fotos estiver fora ou lento (2 s), a página sai sem o cartão e o PIN segue normal.
- **Custo:** uma pergunta ao fotos a cada 5 min por local da Cloudflare (1 min depois de uma falha).
- **Layout:** com o cartão, o `body` vira coluna (`body:has(> .lfc-dq)` no `index.html`).
- **Fechar (×):** um checkbox com CSS. Esconde naquela visita e volta na próxima.
- **Mesma lógica em outros sites:** é a de `functions/_lib/destaque-servidor.js` em keys, pays e proof, colada no `_worker.js`; mudou lá, mude aqui. O quadro de todos os sites está no `docs/ALBUM.md` do fotos ("Aviso nos outros sites").
- **Domínio novo de álbum no fotos** (`DOMINIOS_DE_ALBUM`) precisa entrar em `HOSTS_DE_ALBUM`.
