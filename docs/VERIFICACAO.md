# Fase 5 — Verificação por Testes de Caixa-Preta

## Resultado: não há testes para executar

- **Nenhum teste** (unitário, integração ou caixa-preta) está rastreado no repositório.
- O script `npm test` é um placeholder: `echo "Error: no test specified" && exit 1`.
- `jest` e `supertest` estão instalados como `devDependencies` — indicando **intenção** de testar via HTTP (caixa-preta), mas **nenhuma suíte foi escrita**.
- O commit `35a4f5c` ("test(unit): add unit tests for cartService getCart behavior") sugere que existiram testes de unidade, mas eles **não estão presentes** na árvore atual.

Portanto, não foi possível confirmar o comportamento documentado contra testes automatizados. Abaixo está o que **deveria** ser coberto e as divergências que a análise estática já revela.

## Verificação estática (documentação × código)

A documentação foi extraída diretamente do código, então bate com a implementação. Os pontos abaixo são **comportamentos reais que divergem do que se esperaria** de uma API bem-comportada — candidatos naturais a testes de caixa-preta:

| Área | Comportamento documentado/esperado | Comportamento real no código | Severidade |
|------|-----------------------------------|------------------------------|-----------|
| Estoque concorrente | Checkout nunca leva estoque a negativo | Decremento não condicional → corrida possível (`orderRepository.js:21`) | Alta |
| Pagamento (idempotência) | `Idempotency-Key` garante confirmação única | Chave exigida mas não persistida; idempotência só via status `PAID` | Média |
| Cancelamento | Cancelar pedido devolve estoque | Estoque **não** é devolvido | Média |
| `DELETE /users/:id` com pedidos | 4xx tratado | FK `RESTRICT` → erro Prisma vira **500** não mapeado | Média |
| Formato de resposta | Envelope uniforme | Inconsistente entre módulos (ver CONVENCOES §3) | Baixa |
| `cart` erro de userId | `AppError` padrão | `{ error: 'UserId required' }` cru (dead code, mas presente) | Baixa |
| Stripe | Pagamento processa via gateway | Stub — nenhuma chamada externa, `externalId` nulo | Alta (funcional) |

## Lacunas de cobertura (o que precisa de testes de caixa-preta)

Suíte mínima recomendada (`supertest` + `jest`) contra a app Express (`module.exports = app`):

1. **Auth:** register (201, 409 duplicado, 400 validação), login (200, 401).
2. **Products:** list público com paginação/filtro/cache; getById 404; CRUD admin (201/403 sem token/403 não-admin/409 SKU).
3. **Categories:** CRUD admin; delete com produtos → 409.
4. **Cart:** add (200/404/409 estoque); get; remove; TTL/efemeridade.
5. **Orders:** checkout com carrinho vazio (400); happy path (201 + baixa de estoque + carrinho limpo); **concorrência de estoque**.
6. **Payments:** confirm sem Idempotency-Key (400); confirm 2× (idempotência); cancel.
7. **Users:** acesso dono vs admin (403); update sem hash de senha; delete com pedidos.
8. **Cross-cutting:** contrato de erro (`{ error:{ code, message, details } }`), 404 de rota, header Bearer.

> Estes testes exigem PostgreSQL + Redis (via `docker compose up -d`). Recomenda-se banco de teste isolado e *seed* mínimo. **Nenhum teste foi criado nesta tarefa** (escopo: somente documentação).
