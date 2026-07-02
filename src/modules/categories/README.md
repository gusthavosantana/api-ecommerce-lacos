# Módulo `categories`

## Responsabilidade
CRUD de categorias **hierárquicas** (auto-relação `parent`/`children`). Usada para classificar produtos.

## Componentes
| Arquivo | Papel |
|---------|-------|
| `categoryController.js` | HTTP; envelope `{ data }` |
| `categoryService.js` | Regras; bloqueia exclusão com produtos associados |
| `categoryRepository.js` | Prisma; carrega `children` (1 nível) |
| `categoryRoutes.js` | Público (leitura) + admin (escrita) |

## Endpoints (`/api/v1/categories`)

### `GET /` — público
- **200:** `{ data: [categorias com children] }`.

### `GET /:id` — público
- **200:** `{ data: categoria }` · **404 `RESOURCE_NOT_FOUND`**.

### `POST /` — **admin**
- **Body:** `{ name, parentId? }`
- **201:** `{ data: categoria }`.

### `PUT /:id` — **admin**
- **200:** `{ data: categoria }` · **404**. (Comentário no service menciona webhook `category.updated` — *simulado*, não implementado.)

### `DELETE /:id` — **admin**
- **204 No Content** · **409 `CONFLICT`:** categoria com produtos associados (Prisma `P2003`).

## Dependências
- **Internas:** `categoryRepository`, `utils/AppError`, `authMiddleware`.
- **Externas:** PostgreSQL.

## Notas / gaps
- ⚠️ Sem validação de payload. · Hierarquia carrega apenas 1 nível de `children` (Prisma não faz árvore recursiva nativa).
