# Módulo `payments`

## Responsabilidade
Orquestra o ciclo de pagamento de um pedido (criar intent, confirmar, cancelar), atualizando o status de `Payment` e `Order`. **Não toca em dados de cartão** — projetado para orquestrar a **Stripe** (integração ainda pendente).

## Componentes
| Arquivo | Papel |
|---------|-------|
| `paymentController.js` | HTTP; lê header `Idempotency-Key` no confirm |
| `paymentService.js` | `createPaymentIntent`, `confirmPayment`, `cancelPayment` (transações cross-model) |
| `paymentRepository.js` | Prisma (`findById` inclui `order`) |
| `paymentRoutes.js` | Todas protegidas (`authMiddleware`) |

## Endpoints (`/api/v1/payments`) — **requer** Bearer token

### `POST /`
- **Body:** `{ orderId }`
- Cria (ou retorna existente) um `Payment` em `AWAITING_CONFIRMATION`. Normalmente já criado no checkout.
- **201:** `{ data: payment }`.

### `POST /:id/confirm`
- **Header obrigatório:** `Idempotency-Key`.
- Transação: `Payment → PAID` + `Order → PAID`. Se já `PAID`, retorna o mesmo (idempotência simples).
- **200:** `{ data: payment }` · **400 `INVALID_PAYLOAD`:** falta Idempotency-Key · **404 `RESOURCE_NOT_FOUND`**.

### `POST /:id/cancel`
- Transação: `Payment → CANCELED` + `Order → CANCELED`.
- **200:** `{ data: { message } }` · **404 `RESOURCE_NOT_FOUND`**.

## Dependências
- **Internas:** `paymentRepository`, `config/database` (para transação cross-model), `config/logger`, `utils/AppError`.
- **Externas:** PostgreSQL. **Stripe (planejado, não integrado).**

## Notas / gaps
- ⚠️ **Sem integração Stripe:** `createPaymentIntent` é stub (`externalId` nulo; nenhuma chamada externa).
- ⚠️ **Idempotência frágil:** a `Idempotency-Key` é exigida mas **não persistida** — a proteção depende só do status atual.
- ⚠️ **Cancelamento não devolve estoque** (comentado como recomendado).
- ⚠️ `paymentRepository.updateStatus` existe mas não é usado.
- ⚠️ `Payment.status` é `String` livre (não enum).
