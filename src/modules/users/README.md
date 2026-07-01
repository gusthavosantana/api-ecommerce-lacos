# Módulo `users`

## Responsabilidade
Gestão do perfil de usuário: consulta, atualização e remoção, com controle de acesso (dono do recurso ou `ADMIN`).

## Componentes
| Arquivo | Papel |
|---------|-------|
| `userController.js` | HTTP; autorização dono/admin |
| `userService.js` | Regras de acesso; remove `password` das respostas |
| `userRepository.js` | Prisma (`findByEmail`, `findById`, `findAll` com `select`, CRUD) |
| `userRoutes.js` | Todas protegidas (`authMiddleware`) |

## Endpoints (`/api/v1/users`) — **requer** Bearer token

### `GET /:id`
- `USER` só pode ver a si mesmo; `ADMIN` vê qualquer um.
- **200:** `{ data: user }` (sem `password`) · **403** / **404 `RESOURCE_NOT_FOUND`**.

### `PUT /:id`
- `USER` só edita a si mesmo; `ADMIN` edita qualquer um. `USER` não altera o próprio `role`.
- **200:** `{ data: user }` · **403 `FORBIDDEN`** / **404**.

### `DELETE /:id`
- Dono ou `ADMIN`. **204 No Content**.

## Dependências
- **Internas:** `userRepository`, `utils/AppError`, `authMiddleware`.
- **Externas:** PostgreSQL.

## Notas / gaps
- ⚠️ `updateUser` **não faz hash** de `password` se enviado (comentado — recomenda-se `changePassword` dedicado).
- ⚠️ `DELETE` é **hard delete**; FK `ON DELETE RESTRICT` em `orders` faz falhar com **500 não tratado** se o usuário tiver pedidos → ver recomendações **LGPD** (anonimizar em vez de deletar) em [CONVENCOES.md](../../../docs/CONVENCOES.md) §9.
- `userRepository.findAll` existe mas **não há rota** de listagem exposta. · Sem rota `/me` (usa `/:id`).
- ⚠️ Sem validação de payload.
