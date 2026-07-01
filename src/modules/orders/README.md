# Módulo `orders`

## Responsabilidade
Checkout: converte o carrinho (Redis) em um pedido persistido, com **baixa de estoque transacional** e criação do `Payment` stub. Lista pedidos do usuário autenticado.

## Componentes
| Arquivo | Papel |
|---------|-------|
| `orderController.js` | HTTP; `userId` de `req.user.sub` |
| `orderService.js` | Orquestra checkout: valida carrinho, revalida preço/estoque/status, transação, limpa carrinho, emite evento (log) |
| `orderRepository.js` | `findManyByUser`, `createOrderTransaction` (Prisma `$transaction`) |
| `orderRoutes.js` | Todas as rotas protegidas (`authMiddleware`) |

## Endpoints (`/api/v1/orders`) — **requer** Bearer token

### `GET /`
- **200:** `{ data: [orders] }` — pedidos do usuário, com `items` e `payment`, mais recentes primeiro.

### `POST /` (checkout)
- Sem body — usa o carrinho do usuário no Redis.
- **Fluxo:** recupera carrinho → revalida cada item no banco (existe? `ACTIVE`? estoque?) → recalcula `totalValue` (snapshot) → transação (decrementa estoque + cria `Order PENDING` + `Payment AWAITING_CONFIRMATION`) → `DEL` do carrinho.
- **201:** `{ data: order, message: "Pedido criado com sucesso" }`.
- **400 `INVALID_PAYLOAD`:** carrinho vazio · **409 `CONFLICT`/`OUT_OF_STOCK`:** produto sumiu/indisponível/sem estoque · **500 `INTERNAL_SERVER_ERROR`:** falha na transação.

## Dependências
- **Internas:** `orderRepository`, `cart/cartService`, `products/productRepository`, `config/redis`, `config/logger`, `utils/AppError`.
- **Externas:** PostgreSQL, Redis.

## Notas / gaps
- ⚠️ **Corrida de estoque:** decremento não condicional em `createOrderTransaction` (filtro `stock >= qty` comentado) → possível estoque negativo sob concorrência. O `catch` mascara o erro original.
- ⚠️ Limpeza do carrinho usa chave fixa `cart:default:{userId}` — ignora `tenantId`.
- ⚠️ `require('config/redis')` inline dentro da função (deveria ser import no topo).
- Evento `order.created` é apenas um `logger.info` (não há bus de eventos real).
