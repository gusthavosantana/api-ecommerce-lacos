# Módulo `auth`

## Responsabilidade
Registro e autenticação de usuários. Emite tokens JWT (access + refresh) e persiste o refresh token no Redis.

> ⚠️ Este módulo **não possui repository próprio** (usa `users/userRepository`). Segundo o time, isso é **intencional — manter como está**.

## Componentes
| Arquivo | Papel |
|---------|-------|
| `authController.js` | Adapta HTTP; envelope `{ data, meta:{ timestamp } }` |
| `authService.js` | `register`, `login`; hashing bcrypt, geração de tokens, gravação do refresh no Redis |
| `authValidators.js` | `registerValidator`, `loginValidator` (único módulo com validação) |
| `authRoutes.js` | Rotas públicas |

## Endpoints (`/api/v1/auth`) — públicos

### `POST /register`
- **Body:** `{ name, email, password, role? }` — `password` mín. 6 chars; `email` válido; `role` default `USER`.
- **201:** `{ data: { user:{id,name,email,role}, tokens:{accessToken,refreshToken} }, meta }`
- **409 `CONFLICT`:** email já em uso · **400 `INVALID_PAYLOAD`:** validação.

### `POST /login`
- **Body:** `{ email, password }`
- **200:** `{ data: { user, tokens }, meta }`
- **401 `UNAUTHORIZED`:** credenciais inválidas.

## Dependências
- **Internas:** `users/userRepository`, `utils/token`, `utils/AppError`, `config/redis`.
- **Externas:** `bcrypt` (custo 10), `jsonwebtoken`, Redis (`refresh:{userId}`, TTL 7d).

## Notas / gaps
- Access token expira em 15m, refresh em 7d. **Não há rota de refresh nem de logout** — o refresh token é gravado no Redis mas nunca consumido.
