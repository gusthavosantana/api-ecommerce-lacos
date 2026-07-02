# Convenções e Regras de Implementação

> Extraído do código-fonte. Onde há inconsistência entre módulos, está sinalizado com ⚠️.

## 1. Estrutura de pastas e camadas

```
src/
├── config/        # database (Prisma), redis, logger (winston)
├── middlewares/   # authMiddleware, errorHandler, validateRequest, httpLogger, requestLogger
├── modules/
│   └── <dominio>/
│       ├── <dominio>Controller.js   # HTTP ↔ domínio
│       ├── <dominio>Service.js      # regra de negócio
│       ├── <dominio>Repository.js   # acesso a dados (Prisma)   ⚠️ ausente em auth e cart
│       ├── <dominio>Routes.js       # rotas + middlewares
│       └── <dominio>Validators.js   # express-validator          ⚠️ só existe em auth
├── utils/         # AppError, token (JWT)
└── server.js      # bootstrap Express, montagem de rotas, handlers globais
```

**Camadas:** `Routes → Controller → Service → Repository → Prisma/Redis`. Controllers não contêm regra de negócio; services não sabem de HTTP; repositories isolam o Prisma.

## 2. Nomenclatura

- **Arquivos/módulos:** `camelCase` com sufixo de papel (`authController`, `productService`, `orderRepository`).
- **Objetos exportados:** um objeto literal com métodos assíncronos, exportado via `module.exports` (CommonJS — `"type": "commonjs"`).
- **Tabelas no banco:** `snake_case` plural (`users`, `order_items`) via `@@map` no Prisma; models em `PascalCase` singular.
- **Chaves Redis:** `namespace:...:id` — `refresh:{userId}`, `cart:{tenantId}:{userId}`, `products:list:{jsonParams}`.
- **Rotas:** kebab/plural sob `/api/v1/<recurso>`.

## 3. Convenções de API

- **Versionamento:** prefixo fixo `/api/v1`. Sem política de deprecação definida (confirmado com o time).
- **Autenticação:** header `Authorization: Bearer <accessToken>`. O `authMiddleware` popula `req.user = { sub: userId, role }`.
- **Autorização:** papel `ADMIN` vs `USER`. Guard `adminOnly` inline em `products` e `categories`; regra "só a si mesmo ou admin" em `users`.
- **Formato de resposta de sucesso:** envelope com `data`. **⚠️ Inconsistente** entre módulos:
  | Módulo | Formato |
  |--------|---------|
  | auth | `{ data, meta: { timestamp } }` |
  | products (list) | `{ data, pagination }` (sem `meta`) |
  | products (getById), categories, cart, orders, payments | `{ data }` |
  | orders (checkout) | `{ data, message }` |
  | users (delete), products (delete), categories (delete) | `204 No Content` (sem corpo) |

  → **Contrato recomendado:** padronizar `{ data, meta }` e `{ data, pagination, meta }` em todos.

### 3.1 Contrato oficial de erro

Confirmado com o time como **contrato oficial**. Todo erro operacional usa `AppError` e o `errorHandler` global responde:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Produto não encontrado",
    "details": {},
    "stack": "..."  // apenas quando NODE_ENV=development
  }
}
```

**Códigos e status HTTP em uso:**

| `code` | HTTP | Uso |
|--------|------|-----|
| `INVALID_PAYLOAD` | 400 | Validação falhou / carrinho vazio / falta Idempotency-Key |
| `UNAUTHORIZED` | 401 | Sem token / token inválido / credenciais inválidas |
| `FORBIDDEN` | 403 | Sem privilégio (admin / dono do recurso) |
| `RESOURCE_NOT_FOUND` | 404 | Entidade inexistente / rota não encontrada |
| `CONFLICT` | 409 | Email/SKU duplicado, produto indisponível, FK constraint |
| `OUT_OF_STOCK` | 409 | Estoque insuficiente |
| `INTERNAL_SERVER_ERROR` | 500 | Erro não tratado / falha de transação |

**⚠️ Desvio:** `cartController` tem um caminho de erro fora do padrão — retorna `res.status(400).json({ error: 'UserId required' })` (string crua, sem `AppError`, sem `code`). Ver §7.

## 4. Validação

- Feita com **`express-validator`** + middleware `validateRequest`, que agrega erros em `details` (`{ campo: mensagem }`) e lança `AppError(400, 'INVALID_PAYLOAD')`.
- **⚠️ Só o módulo `auth` tem validadores.** `products`, `categories`, `orders`, `payments`, `users` **não validam payload** — confiam no corpo recebido e/ou nos erros do Prisma. Recomenda-se adicionar validators por módulo.

## 5. Tratamento de erros

- **Padrão:** controllers usam `try/catch` e delegam com `next(error)`; services lançam `AppError`; `errorHandler` centraliza a resposta.
- Erros do Prisma são traduzidos pontualmente por código: `P2025` → 404 (produto), `P2003` → 409 (categoria com produtos). **⚠️** Essa tradução não é sistemática (não há mapeamento central de erros do Prisma).
- **⚠️ Middlewares síncronos que lançam:** `authMiddleware` e `validateRequest` lançam de forma síncrona. No Express 5 isso é capturado corretamente; em rotas assíncronas o `try/catch` + `next` é a via segura.

## 6. Logging

- **Winston** (`config/logger.js`): níveis custom (error/warn/info/http/debug), console + arquivos `logs/error.log` e `logs/all.log`. Nível `debug` em dev, `warn` em produção.
- **Morgan** (`httpLogger`) canaliza logs HTTP para o Winston, **apenas em `development`** (skip fora de dev).
- ⚠️ **`requestLogger.js` é código morto** — usa `console.log` cru e não é referenciado em lugar nenhum (o ativo é `httpLogger`).
- ⚠️ `productService.listProducts` usa `console.error('Redis Error', ...)` em vez do logger.

## 7. Desvios de padrão encontrados (resumo acionável)

| # | Desvio | Local | Recomendação |
|---|--------|-------|--------------|
| 1 | `cart` não tem repository — acessa Redis e Prisma direto no service | `cart/cartService.js` | Criar `cartRepository` (o time já aprovou refatorar cart; mantido como backlog nesta tarefa de docs) |
| 2 | `auth` não tem repository (usa `userRepository`) | `auth/authService.js` | Intencional segundo o time — **manter como está** |
| 3 | Fallback inseguro: `userId` lido de `req.query.userId` | `cart/cartController.js:8,23,35` | Remover fallback; confiar só em `req.user.sub`. Hoje é *dead code* (rota já protegida por `authMiddleware` no `server.js`), mas é um risco latente |
| 4 | Comentário desatualizado: "middleware de auth quando estiver pronto" | `cart/cartRoutes.js:3` | A rota **já é protegida** em `server.js:50`. Atualizar comentário |
| 5 | Resposta de erro fora do padrão (`{ error: 'UserId required' }`) | `cart/cartController.js` | Usar `AppError` |
| 6 | Validação de payload ausente fora de `auth` | vários módulos | Adicionar `*Validators.js` |
| 7 | `tenantId` não aplicado em nenhuma query | global | Middleware de tenant + filtros (backlog aprovado) |
| 8 | `require('../../config/redis')` inline dentro de função | `orders/orderService.js:57` | Mover import para o topo |
| 9 | `paymentRepository.updateStatus` nunca usado | `payments/paymentRepository.js` | Remover ou passar a usar |
| 10 | `console.log`/`console.error` cru em vez do logger | `requestLogger.js`, `productService.js` | Usar `logger` |
| 11 | Healthcheck não checa DB/Redis | `server.js:44` | Implementar checks reais |
| 12 | Swagger comentado / sem `swagger.yaml` | `server.js:39-40` | Ativar OpenAPI |

## 8. Regras de negócio implícitas (extraídas do código)

- **Estoque:** item só entra no carrinho se `product.stock >= quantity`; revalidado no checkout. No checkout, estoque é decrementado dentro de uma **transação Prisma** que também cria `Order` + `Payment`.
  - ⚠️ **Risco de corrida:** o decremento **não é condicional** (`where: { stock: { gte: qty } }` está comentado em `orderRepository.js:21`). Sob checkouts concorrentes do mesmo produto, o estoque pode ficar negativo antes da verificação `p.stock < 0`. O `catch` ainda mascara o erro original com uma mensagem genérica.
- **Preço:** o preço cobrado é sempre o do **banco no momento do checkout** (snapshot em `order_items.price`), nunca o do carrinho.
- **Carrinho:** efêmero (Redis, TTL 30 dias). Limpo (`DEL`) após checkout bem-sucedido. Chave fixa `cart:default:{userId}` no `orderService` — ⚠️ ignora `tenantId`.
- **Pagamento:**
  - Criado como *stub* no checkout (`AWAITING_CONFIRMATION`, sem `externalId`).
  - `confirm` exige header **`Idempotency-Key`** (obrigatório) e é idempotente de forma simples: se já `PAID`, retorna o mesmo pagamento. ⚠️ A chave **não é persistida** — a idempotência real depende só do status atual.
  - `confirm` → `Payment=PAID` + `Order=PAID` em transação.
  - `cancel` → `Payment=CANCELED` + `Order=CANCELED`. ⚠️ **Não devolve estoque** (comentado como recomendado).
- **Usuários:**
  - `USER` só acessa/edita/deleta a si mesmo; `ADMIN` acessa qualquer um.
  - `USER` não consegue alterar o próprio `role` (`delete data.role`).
  - ⚠️ `updateUser` **não faz hash** se `password` vier no payload (comentado — recomenda-se endpoint `changePassword` dedicado).
  - `deleteUser` é **hard delete**; ⚠️ FK `ON DELETE RESTRICT` em `orders` fará o delete **falhar com erro não tratado (500)** se o usuário tiver pedidos.
- **Categorias:** hierárquicas (auto-relação `parent/children`, 1 nível carregado). Não podem ser excluídas se tiverem produtos (`P2003` → 409).
- **Autenticação:** senha com `bcrypt` (custo 10). Access token 15m, refresh 7d (armazenado no Redis `refresh:{userId}`). ⚠️ Não há endpoint de refresh/logout implementado — os tokens de refresh são gravados mas nunca consumidos por uma rota.

## 9. LGPD — situação e recomendações

O time confirmou LGPD como requisito. Situação atual e gaps:

| Aspecto | Situação | Recomendação |
|---------|----------|--------------|
| Senha | Hasheada com bcrypt; removida das respostas (`getProfile`/`updateUser`) ✅ | Manter; nunca logar |
| PII em logs | `errorHandler` loga `req.ip`; sem redação de PII | Redigir PII/segredos nos logs |
| Direito ao esquecimento | `DELETE /users/:id` existe, mas é hard delete e trava com FK se houver pedidos | Anonimizar usuário em vez de deletar; preservar pedidos anonimizados |
| Portabilidade / exportação | Inexistente | Endpoint de exportação de dados do titular |
| Consentimento / base legal | Não modelado | Registrar consentimento/finalidade |
| Minimização | `getProfile` remove senha ✅ | Revisar demais campos expostos |

> Estas são **recomendações documentadas** — nenhuma alteração de código foi feita nesta tarefa (escopo: somente documentação).

## 10. Testes

- **Não há testes** rastreados no repositório. `npm test` é um placeholder (`echo "Error: no test specified"`).
- `jest` e `supertest` estão instalados (devDependencies), indicando intenção de testes de unidade e de caixa-preta (HTTP), mas nenhuma suíte existe.
- Ver [ARQUITETURA.md](ARQUITETURA.md) §9 e a Fase 5 do relatório para lacunas de cobertura.
