// Testes caixa-branca de orderService.cancelOrder (unit, com mocks).
// Rastreabilidade: cada `it` referencia a spec (US / FR / Edge).
jest.mock('../orderRepository');
jest.mock('../../payments/paymentService');
jest.mock('../../../config/logger');
// Evita conexões reais (redis auto-conecta ao ser importado) via dependências transitivas.
jest.mock('../../../config/redis', () => ({ del: jest.fn(), isOpen: true }));
jest.mock('../../../config/database', () => ({}));

const orderRepository = require('../orderRepository');
const paymentService = require('../../payments/paymentService');
const orderService = require('../orderService');

const OWNER_ID = 'user-owner-1';
const OTHER_ID = 'user-other-2';
const ADMIN_ID = 'admin-9';

const userActor = { sub: OWNER_ID, role: 'USER' };
const otherActor = { sub: OTHER_ID, role: 'USER' };
const adminActor = { sub: ADMIN_ID, role: 'ADMIN' };

const buildOrder = (overrides = {}) => ({
    id: 'order-1',
    userId: OWNER_ID,
    status: 'PENDING',
    totalValue: 150,
    items: [
        { productId: 'prod-a', quantity: 2, price: 50 },
        { productId: 'prod-b', quantity: 1, price: 50 },
    ],
    payment: { id: 'pay-1', status: 'AWAITING_CONFIRMATION' },
    ...overrides,
});

beforeEach(() => {
    // Retorno padrão do repo: devolve o pedido cancelado.
    orderRepository.cancelOrderTransaction.mockImplementation(async (order) => ({
        ...order,
        status: 'CANCELED',
        canceledAt: new Date(),
    }));
    paymentService.initiateRefund.mockResolvedValue({ refundStatus: 'PROCESSING', amount: 0 });
});

describe('orderService.cancelOrder', () => {
    // Caso 1 — US1 / FR-001, FR-004
    it('cliente cancela pedido PENDING próprio: status vira CANCELED e não inicia reembolso', async () => {
        orderRepository.findById.mockResolvedValue(buildOrder({ status: 'PENDING' }));

        const result = await orderService.cancelOrder(userActor, 'order-1');

        expect(result.status).toBe('CANCELED');
        expect(orderRepository.cancelOrderTransaction).toHaveBeenCalledTimes(1);
        expect(paymentService.initiateRefund).not.toHaveBeenCalled();
    });

    // Caso 2 — US1 / FR-005 (delegação da liberação de estoque)
    it('delega ao repositório o pedido com todos os itens para liberar estoque', async () => {
        const order = buildOrder({ status: 'PENDING' });
        orderRepository.findById.mockResolvedValue(order);

        await orderService.cancelOrder(userActor, 'order-1');

        const [passedOrder] = orderRepository.cancelOrderTransaction.mock.calls[0];
        expect(passedOrder.items).toHaveLength(2);
        expect(passedOrder.items).toEqual(order.items);
    });

    // Caso 3 — US1 / FR-006 (idempotência)
    it('pedido já CANCELED: não chama repo nem reembolso (idempotente)', async () => {
        orderRepository.findById.mockResolvedValue(buildOrder({ status: 'CANCELED' }));

        const result = await orderService.cancelOrder(userActor, 'order-1');

        expect(result.status).toBe('CANCELED');
        expect(orderRepository.cancelOrderTransaction).not.toHaveBeenCalled();
        expect(paymentService.initiateRefund).not.toHaveBeenCalled();
    });

    // Caso 4 — Edge / FR-010 (inexistente)
    it('pedido inexistente: lança AppError 404 sem chamar repo', async () => {
        orderRepository.findById.mockResolvedValue(null);

        await expect(orderService.cancelOrder(userActor, 'nope'))
            .rejects.toMatchObject({ statusCode: 404, code: 'RESOURCE_NOT_FOUND' });
        expect(orderRepository.cancelOrderTransaction).not.toHaveBeenCalled();
    });

    // Caso 5 — US3.2 / FR-003 (dono)
    it('USER cancelando pedido de outro: lança AppError 403 e nada muda', async () => {
        orderRepository.findById.mockResolvedValue(buildOrder({ status: 'PENDING' }));

        await expect(orderService.cancelOrder(otherActor, 'order-1'))
            .rejects.toMatchObject({ statusCode: 403 });
        expect(orderRepository.cancelOrderTransaction).not.toHaveBeenCalled();
    });

    // Caso 6 — Edge / FR-002 (estado não-cancelável)
    it.each(['SHIPPED', 'DELIVERED'])('estado %s não é cancelável: lança AppError 409', async (status) => {
        orderRepository.findById.mockResolvedValue(buildOrder({ status }));

        await expect(orderService.cancelOrder(userActor, 'order-1'))
            .rejects.toMatchObject({ statusCode: 409 });
        expect(orderRepository.cancelOrderTransaction).not.toHaveBeenCalled();
    });

    // Caso 7 — US2 / FR-008 (pago → reembolso)
    it('cliente cancela pedido PAID: libera e inicia reembolso do valor total', async () => {
        const order = buildOrder({ status: 'PAID', totalValue: 150 });
        orderRepository.findById.mockResolvedValue(order);

        const result = await orderService.cancelOrder(userActor, 'order-1');

        expect(result.status).toBe('CANCELED');
        expect(result.refundStatus).toBe('PROCESSING');
        expect(orderRepository.cancelOrderTransaction).toHaveBeenCalledTimes(1);
        expect(paymentService.initiateRefund).toHaveBeenCalledTimes(1);
        const [refundArg] = paymentService.initiateRefund.mock.calls[0];
        expect(Number(refundArg.totalValue)).toBe(150);
    });

    // Caso 8 — Edge / FR-007 (atomicidade: repo rejeita)
    it('falha na transação do repo: propaga erro e não inicia reembolso', async () => {
        orderRepository.findById.mockResolvedValue(buildOrder({ status: 'PAID' }));
        orderRepository.cancelOrderTransaction.mockRejectedValue(new Error('tx failed'));

        await expect(orderService.cancelOrder(userActor, 'order-1')).rejects.toThrow();
        expect(paymentService.initiateRefund).not.toHaveBeenCalled();
    });

    // Caso 9 — US3.1 / FR-011, FR-012 (admin cancela de outro)
    it('ADMIN cancela pedido de outro cliente com motivo: sucesso e motivo repassado', async () => {
        orderRepository.findById.mockResolvedValue(buildOrder({ status: 'PENDING' }));

        const result = await orderService.cancelOrder(adminActor, 'order-1', 'fraude suspeita');

        expect(result.status).toBe('CANCELED');
        const [, meta] = orderRepository.cancelOrderTransaction.mock.calls[0];
        expect(meta).toMatchObject({ canceledBy: ADMIN_ID, reason: 'fraude suspeita' });
    });

    // Caso 10 — FR-013 (admin sem motivo)
    it.each(['', '   ', undefined])('ADMIN sem motivo (%p): lança AppError 400', async (reason) => {
        orderRepository.findById.mockResolvedValue(buildOrder({ status: 'PENDING' }));

        await expect(orderService.cancelOrder(adminActor, 'order-1', reason))
            .rejects.toMatchObject({ statusCode: 400 });
        expect(orderRepository.cancelOrderTransaction).not.toHaveBeenCalled();
    });

    // Caso 11 — FR-013 (cliente sem motivo é OK)
    it('cliente sem motivo: cancelamento é permitido', async () => {
        orderRepository.findById.mockResolvedValue(buildOrder({ status: 'PENDING' }));

        const result = await orderService.cancelOrder(userActor, 'order-1');

        expect(result.status).toBe('CANCELED');
        expect(orderRepository.cancelOrderTransaction).toHaveBeenCalledTimes(1);
    });
});
