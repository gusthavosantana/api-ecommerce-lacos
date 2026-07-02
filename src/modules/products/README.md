# Módulo `products`

## Responsabilidade
CRUD de produtos do catálogo, com listagem paginada, busca textual, filtro por categoria e **cache de listagem no Redis** (TTL 60s).

## Componentes
| Arquivo | Papel |
|---------|-------|
| `productController.js` | HTTP |
| `productService.js` | Regras (SKU único), cache de listagem |
| `productRepository.js` | Prisma; `findAll` filtra `status=ACTIVE`, busca `insensitive` em name/description |
| `productRoutes.js` | Rotas públicas (leitura) + admin (escrita) |

## Endpoints (`/api/v1/products`)

### `GET /` — público
- **Query:** `page` (1), `limit` (20), `categoryId?`, `search?`.
- **200:** `{ data: [produtos], pagination: { page, limit, totalItems, totalPages } }`.
- Só retorna produtos `ACTIVE`. Resultado cacheado 60s.

### `GET /:id` — público
- **200:** `{ data: produto }` (inclui `category`) · **404 `RESOURCE_NOT_FOUND`**.

### `POST /` — **admin**
- **Body:** `{ name, description, sku, price, stock, categoryId, status? }`
- **201:** `{ data: produto }` · **409 `CONFLICT`:** SKU já existe.

### `PUT /:id` — **admin**
- **200:** `{ data: produto }` · **404** / **409 `CONFLICT`** (SKU duplicado).

### `DELETE /:id` — **admin**
- **204 No Content** · **404 `RESOURCE_NOT_FOUND`** (Prisma `P2025`).

**Proteção:** escrita exige `authMiddleware` + `adminOnly` (403 `FORBIDDEN` se `role != ADMIN`).

## Dependências
- **Internas:** `productRepository`, `config/redis`, `utils/AppError`, `authMiddleware`.
- **Externas:** PostgreSQL, Redis.

## Notas / gaps
- ⚠️ Sem validação de payload (`express-validator`). · ⚠️ `console.error` em vez de `logger` no fallback de cache. · ⚠️ `tenantId` não filtrado.
