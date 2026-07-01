# Módulo `cart`

## Responsabilidade
Carrinho de compras **efêmero**, mantido exclusivamente no **Redis** (não há tabela no PostgreSQL). Valida produto e estoque ao adicionar itens.

> ⚠️ **Desvios conhecidos** (ver [CONVENCOES.md](../../../docs/CONVENCOES.md) §7): sem repository; fallback inseguro lendo `userId` de query string; resposta de erro fora do padrão. O time aprovou refatorar este módulo para usar repository — mantido como **backlog** (esta tarefa é somente documentação).

## Componentes
| Arquivo | Papel |
|---------|-------|
| `cartController.js` | HTTP; obtém `userId` de `req.user.sub` |
| `cartService.js` | `getCart`, `addItem`, `removeItem`; acessa Redis + Prisma direto |
| `cartRoutes.js` | Rotas (protegidas via `authMiddleware` montado em `server.js:50`) |

**Chave Redis:** `cart:{tenantId}:{userId}` (TTL 30 dias). Estrutura: `{ items: [{productId,name,price,quantity}], total }`.

## Endpoints (`/api/v1/cart`) — **requer** `Authorization: Bearer <token>`

### `GET /`
- **200:** `{ data: { items, total } }` (carrinho vazio → `{ items: [], total: 0 }`).

### `POST /items`
- **Body:** `{ productId, quantity }`
- **200:** `{ data: cart }` (recalcula `total`; soma quantidade se item já existe).
- **404 `RESOURCE_NOT_FOUND`:** produto inexistente · **409 `OUT_OF_STOCK`:** estoque insuficiente.

### `DELETE /items/:itemId`
- `:itemId` = **`productId`** do item. Remove e recalcula total.
- **200:** `{ data: cart }`.

## Dependências
- **Internas:** `config/redis`, `config/database` (Prisma, para validar produto), `utils/AppError`.
- **Externas:** Redis, PostgreSQL.

## Notas / gaps
- `tenantId` aceito como parâmetro (default `'default'`) mas **nunca propagado** pelos controllers.
- Falta `clearCart` (o `orderService` faz `redisClient.del` manualmente no checkout).
